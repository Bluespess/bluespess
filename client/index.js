'use strict';

const $ = require('jquery');
const Atom = require('./lib/atom.js');
const IconRenderer = require('./lib/icon_renderer.js');
const PanelManager = require('./lib/panels/manager.js');
const Panel = require('./lib/panels/panel.js');
const Component = require('./lib/component.js');
const EventEmitter = require('events');

class BluespessClient extends EventEmitter {
	constructor(wsurl, resRoot = "") {
		super();
		if(!wsurl)
			wsurl = "ws" + window.location.origin.substring(4);
		this.resRoot = resRoot;
		this.wsurl = wsurl;
		this.atoms_by_netid = {};
		this.atoms = [];
		this.visible_tiles = new Set();
		this.dirty_atoms = [];
		this.eyes = {"":{x:0,y:0}};
		this.glide_size = 10;
		this.icon_meta_load_queue = {};
		this.icon_metas = {};
		this.components = {};
		this.importModule(require('./lib/lighting.js'));
	}

	login() {
		if(global.is_bs_editor_env)
			throw new Error("Client should not be started in editor mode");
		this.connection = new WebSocket(this.wsurl);
		this.panel_manager = new PanelManager();
		this.connection.addEventListener('message', this.handleSocketMessage.bind(this));
		this.connection.addEventListener('open', () => {this.connection.send(JSON.stringify({"login":"guest" + Math.floor(Math.random()*1000000)}));});
		requestAnimationFrame(this.anim_loop.bind(this)); // Start the rendering loop
		$(document).keydown((e) => {if(e.target.localName != "input"&&this.connection)this.connection.send(JSON.stringify({"keydown":{which:e.which,id:e.target.id}}));});
		$(document).keyup((e) => {if(e.target.localName != "input"&&this.connection)this.connection.send(JSON.stringify({"keyup":{which:e.which,id:e.target.id}}));});
		this.updateMapWindowSizes();
		$(window).resize(this.updateMapWindowSizes);
		$('#mainlayer').click(this.handleClick.bind(this));

		new Panel(this.panel_manager, "testpanel", {width:400, height:400, title:"Test panel"});
	}

	importModule(mod) {
		if(mod.components) {
			for(var componentName in mod.components) {
				if(mod.components.hasOwnProperty(componentName)) {
					if(this.components[componentName]) {
						throw new Error(`Component ${componentName} already exists!`);
					}
					if(mod.components[componentName].name != componentName)
						throw new Error(`Component name mismatch! Named ${componentName} in map and constructor is named ${mod.components[componentName].name}`);
					this.components[componentName] = mod.components[componentName];
				}
			}
		}
		if(mod.now instanceof Function) {
			mod.now(this);
		}
	}

	handleSocketMessage(event) {
		var obj = JSON.parse(event.data);
		console.log(obj);
		if(obj.create_atoms) {
			for(let i = 0; i < obj.create_atoms.length; i++) {
				new Atom(this, obj.create_atoms[i]);
			}
		}
		if(obj.update_atoms) {
			for(let i = 0; i < obj.update_atoms.length; i++) {
				var inst = obj.update_atoms[i];
				let atom = this.atoms_by_netid[inst.network_id];
				if(!atom) continue;
				var oldx = atom.x;
				var oldy = atom.y;
				for(let key in inst) {
					if(!inst.hasOwnProperty(key))
						continue;
					if(key == "appearance" || key == "network_id" || key == "overlays" || key == "components") {
						continue;
					}
					atom[key] = inst[key];
				}
				if((oldx != atom.x || oldy != atom.y) && Math.abs(Math.max(atom.x-oldx,atom.y-oldy)) <= 1.00001) {
					atom.glide = {x:oldx-atom.x,y:oldy-atom.y,lasttime:performance.now()};
				}
				if(inst.overlays) {
					for(let key in inst.overlays) {
						if(!inst.overlays.hasOwnProperty(key))
							continue;
						atom.set_overlay(key, inst.overlays[key]);
					}
				}
				if(inst.components) {
					for(let component_name in inst.components) {
						if(!inst.components.hasOwnProperty(component_name))
							continue;
						for(let key in inst.components[component_name]) {
							if(!inst.components[component_name].hasOwnProperty(key))
								continue;
							atom.components[component_name][key] = inst.components[component_name][key];
						}
					}
				}
			}
		}
		if(obj.delete_atoms) {
			for(var i = 0; i < obj.delete_atoms.length; i++) {
				let atom = this.atoms_by_netid[obj.delete_atoms[i]];
				if(!atom) continue;
				atom.del();
			}
		}
		if(obj.add_tiles) {
			for(let tile of obj.add_tiles) {
				this.visible_tiles.add(tile);
			}
		}
		if(obj.remove_tiles) {
			for(let tile of obj.remove_tiles) {
				this.visible_tiles.delete(tile);
			}
		}
		if(obj.eye) {
			console.log(obj.eye[""]);
			setTimeout(() => {
				this.eyes[""] = this.atoms_by_netid[obj.eye[""]];
			}, 500);
		}
		if(obj.to_chat) {
			$('#chatwindow').append('<div>'+obj.to_chat+'</div>');
		}
		if(obj.panel) {
			this.panel_manager.handle_message(obj.panel);
		}
		this.atoms.sort(Atom.atom_comparator);

		return obj;
	}

	updateMapWindowSizes() {
		var minsize = Math.min($('#mapwindow-container').width(), $('#mapwindow-container').height());
		$('#mapwindow').css("transform","scale("+(minsize/480)+")");
	}

	handleClick(e) {
		var clickX = e.offsetX;
		var clickY = e.offsetY;
		// Iterate through the atoms from top to bottom.
		var clickedAtom;
		for(var i = this.atoms.length-1; i >= 0; i--) {
			var atom = this.atoms[i];
			var {dispx, dispy} = atom.get_displacement(performance.now());
			var localX = (clickX - dispx)/32;
			var localY = 1-(clickY - dispy)/32;
			var bounds = atom.get_bounds();
			if(bounds && localX >= bounds.x && localX < bounds.width && localY >= bounds.y && localY < bounds.height && atom.is_mouse_over(localX, localY, performance.now())) {
				clickedAtom = atom;
				break;
			}
		}
		if(!clickedAtom)
			return;
		this.connection.send(JSON.stringify({"click_on":{"atom":clickedAtom.network_id,"x":localX,"y":localY, "ctrlKey": e.ctrlKey, "shiftKey": e.shiftKey, "altKey": e.altKey}}));
	}
}

// This is pretty much identical to the function on the server's lib/utils.js
BluespessClient.chain_func = function(func1, func2) {
	if(func2 == undefined)
		throw new Error('Chaining undefined function!');
	return function chained_func(...args) {
		return func2.call(this, (...override_args)=>{
			if(!func1)
				return;
			if(override_args.length)
				return func1.call(this, ...override_args);
			else
				return func1.call(this, ...args);
		}, ...args);
	};
};

BluespessClient.prototype.enqueue_icon_meta_load = require('./lib/icon_loader.js');
BluespessClient.prototype.anim_loop = require('./lib/renderer.js');

BluespessClient.Atom = Atom;
BluespessClient.Component = Component;
BluespessClient.IconRenderer = IconRenderer;

module.exports = BluespessClient;
