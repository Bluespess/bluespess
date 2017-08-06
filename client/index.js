'use strict';

const $ = require('jquery');
const Atom = require('./lib/atom.js');
const PanelManager = require('./lib/panels/manager.js');
const Panel = require('./lib/panels/panel.js');
const Default = require('./lib/default_appearance_controller.js');

class BluespessClient {
	constructor(wsurl, resRoot = "") {
		if(!wsurl)
			wsurl = "ws" + window.location.origin.substring(4);
		this.resRoot = resRoot;
		// open the connection
		this.connection = new WebSocket(wsurl);
		
		this.panel_manager = new PanelManager();
		this.atoms_by_netid = {};
		this.atoms = [];
		this.dirty_atoms = [];
		this.eyes = {"":{x:0,y:0}};
		this.glide_size = 10;
		this.icon_meta_load_queue = {};
		this.icon_metas = {};
		this.appearance_controllers = {Default};
		
		this.connection.addEventListener('message', this.handleSocketMessage.bind(this));
		this.connection.addEventListener('open', () => {this.connection.send(JSON.stringify({"login":"guest" + Math.floor(Math.random()*1000000)}));});
		requestAnimationFrame(this.anim_loop.bind(this)); // Start the rendering loop
		$(document).keydown((e) => {if(e.target.localName != "input"&&this.connection)this.connection.send(JSON.stringify({"keydown":{which:e.which,id:e.target.id}}))});
		$(document).keyup((e) => {if(e.target.localName != "input"&&this.connection)this.connection.send(JSON.stringify({"keyup":{which:e.which,id:e.target.id}}))});
		this.updateMapWindowSizes();
		$(window).resize(this.updateMapWindowSizes);
		$('#mainlayer').click(this.handleClick.bind(this));
		
		new Panel(this.panel_manager, "testpanel", {width:400, height:400, title:"Test panel"});
	}

	handleSocketMessage(event) {
		var obj = JSON.parse(event.data);
		if(obj.create_atoms) {
			for(var i = 0; i < obj.create_atoms.length; i++) {
				new Atom(this, obj.create_atoms[i]);
			}
		}
		if(obj.update_atoms) {
			for(var i = 0; i < obj.update_atoms.length; i++) {
				var inst = obj.update_atoms[i];
				var atom = this.atoms_by_netid[inst.network_id];
				if(!atom) continue;
				var oldx = atom.x;
				var oldy = atom.y;
				for(var key in inst) {
					if(!inst.hasOwnProperty(key))
						continue;
					if(key == "appearance" || key == "network_id" || key == "overlays") {
						continue;
					}
					atom[key] = inst[key];
				}
				if((oldx != atom.x || oldy != atom.y) && Math.abs(Math.max(atom.x-oldx,atom.y-oldy)) <= 1.00001) {
					atom.glide = {x:oldx-atom.x,y:oldy-atom.y,lasttime:performance.now()};
				}
				if(inst.appearance) {
					for(var key in inst.appearance) {
						if(!inst.appearance.hasOwnProperty(key))
							continue;
						atom._appearance_vars[key] = inst.appearance[key];
					}
					atom.on_appearance_change(inst.appearance);
				}
				if(inst.overlays) {
					for(var key in inst.overlays) {
						if(!inst.overlays.hasOwnProperty(key))
							continue;
						atom.set_overlay(key, inst.overlays[key]);
					}
				}
			}
		}
		if(obj.delete_atoms) {
			for(var i = 0; i < obj.delete_atoms.length; i++) {
				var atom = this.atoms_by_netid[obj.delete_atoms[i]];
				if(!atom) continue;
				atom.del();
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
			panel_manager.handle_message(obj.panel);
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
			var bounds = atom.appearance_controller.get_bounds();
			if(localX >= bounds.x && localX < bounds.width && localY >= bounds.y && localY < bounds.height && atom.appearance_controller.is_mouse_over(localX, localY, performance.now())) {
				clickedAtom = atom;
				break;
			}
		}
		if(!clickedAtom)
			return;
		this.connection.send(JSON.stringify({"click_on":{"atom":clickedAtom.network_id,"x":localX,"y":localY}}))
	}
}

BluespessClient.prototype.enqueue_icon_meta_load = require('./lib/icon_loader.js');
BluespessClient.prototype.anim_loop = require('./lib/renderer.js');

BluespessClient.Atom = Atom;

module.exports = BluespessClient