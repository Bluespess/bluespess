'use strict';

const Atom = require('./lib/atom.js');
const IconRenderer = require('./lib/icon_renderer.js');
const PanelManager = require('./lib/panels/manager.js');
const Component = require('./lib/component.js');
const EventEmitter = require('events');
const Sound = require('./lib/sound.js');
const Matrix = require('./lib/matrix.js');
const {Eye, Plane} = require('./lib/eye.js');

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
		this.glide_size = 10;
		this.icon_meta_load_queue = {};
		this.icon_metas = {};
		this.components = {};
		this.panel_classes = {};
		this.eyes = {};
		this.server_time_to_client;
		this.audio_buffers = new Map();
		this.playing_sounds = new Map();

		this.soft_shadow_resolution = 8;

		if(!global.is_bs_editor_env) {
			if(global.AudioContext)
				this.audio_ctx = new AudioContext();
		}
		this.importModule(require('./lib/lighting.js'));
	}

	handle_login() {
		this.connection.send(JSON.stringify({"login":"guest" + Math.floor(Math.random()*1000000)}));
		this.login_finish();
	}

	login() {
		if(global.is_bs_editor_env)
			throw new Error("Client should not be started in editor mode");
		this.connection = new WebSocket(this.wsurl);
		this.panel_manager = new PanelManager(this);
		this.connection.addEventListener('open', () => {
			this.handle_login();
		});
		window.addEventListener("mousedown", () => { // damn it chrome
			this.audio_ctx.resume();
		}, {once: true});
	}

	login_finish() {
		if(global.is_bs_editor_env)
			throw new Error("Client should not be started in editor mode");
		this.connection.addEventListener('message', this.handleSocketMessage.bind(this));
		requestAnimationFrame(this.anim_loop.bind(this)); // Start the rendering loop
		let networked_down = new Set();
		document.addEventListener('keydown', (e) => {
			if(e.target.localName != "input" && this.connection) {
				networked_down.add(e.which);
				this.connection.send(JSON.stringify({"keydown":{which:e.which,id:e.target.id}}));
			}
		});
		document.addEventListener('keyup', (e) => {
			if((e.target.localName != "input" && this.connection) || networked_down.has(e.which)) {
				networked_down.delete(e.which);
				this.connection.send(JSON.stringify({"keyup":{which:e.which,id:e.target.id}}));
			}
		});
		window.addEventListener('blur', () => {
			for(let which of networked_down) {
				this.connection.send(JSON.stringify({"keyup":{which}}));
				networked_down.delete(which);
			}
		});
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
		if(mod.panel_classes) {
			for(var class_name in mod.panel_classes) {
				if(mod.panel_classes.hasOwnProperty(class_name)) {
					if(this.panel_classes[class_name]) {
						throw new Error(`Panel class ${class_name} already exists!`);
					}
					if(mod.panel_classes[class_name].name != class_name)
						throw new Error(`Panel class name mismatch! Named ${class_name} in map and constructor is named ${mod.panel_classes[class_name].name}`);
					this.panel_classes[class_name] = mod.panel_classes[class_name];
				}
			}
		}
		if(mod.now instanceof Function) {
			mod.now(this);
		}
	}

	handleSocketMessage(event) {
		var obj = JSON.parse(event.data);
		let timestamp = performance.now();
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
				atom.glide = new Atom.Glide(atom, {oldx, oldy, lasttime:timestamp});
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
		if(obj.timestamp) {
			this.server_time_to_client = timestamp - obj.timestamp;
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
			for(let [id, props] of Object.entries(obj.eye)) {
				let eye = this.eyes[id];
				if(!eye)
					continue;
				let oldx = eye.origin.x;
				let oldy = eye.origin.y;
				Object.assign(eye.origin, props);
				eye.origin.glide = new Atom.Glide(eye.origin, {oldx, oldy, lasttime: timestamp});
			}
		}
		if(obj.to_chat) {
			let cw = document.getElementById('chatwindow');
			let do_scroll = false;
			if(cw.scrollTop + cw.clientHeight >= cw.scrollHeight)
				do_scroll = true;
			for(let item of obj.to_chat) {
				let newdiv = document.createElement('div');
				newdiv.innerHTML = item;
				document.getElementById('chatwindow').appendChild(newdiv);
			}
			if(do_scroll)
				cw.scrollTop = cw.scrollHeight - cw.clientHeight;
		}
		if(obj.panel) {
			this.panel_manager.handle_message(obj.panel);
		}
		if(obj.sound) {
			if(obj.sound.play)
				for(let sound of obj.sound.play) {
					if(this.playing_sounds.get(sound.id))
						continue;
					new Sound(this, sound).start();
				}
			if(obj.sound.stop) {
				for(let id of obj.sound.stop) {
					let sound = this.playing_sounds.get(id);
					if(sound)
						sound.stop();
				}
			}
		}
		this.atoms.sort(Atom.atom_comparator);

		return obj;
	}
}

// This is pretty much identical to the function on the server's lib/utils.js
const _chain_parent = Symbol('_chain_parent');
const _chain_spliced = Symbol('_chain_spliced');
BluespessClient.chain_func = function(func1, func2) {
	if(func2 == undefined)
		throw new Error('Chaining undefined function!');
	function chained_func(...args) {
		while(chained_func[_chain_parent] && chained_func[_chain_parent][_chain_spliced]) {
			chained_func[_chain_parent] = chained_func[_chain_parent][_chain_parent];
		}
		let prev = (...override_args)=>{
			if(!chained_func[_chain_parent])
				return;
			if(override_args.length)
				return chained_func[_chain_parent].call(this, ...override_args);
			else
				return chained_func[_chain_parent].call(this, ...args);
		};
		if(chained_func[_chain_spliced])
			return prev();
		return func2.call(this, prev, ...args);
	}
	chained_func.splice = function() {
		chained_func[_chain_spliced] = true;
	};
	chained_func[_chain_spliced] = false;
	chained_func[_chain_parent] = func1;
	return chained_func;
},

BluespessClient.dropdown = function(elem1, elem2, {point = null, autoremove = true} = {}) {
	let rect;
	if(point) {
		rect = {x: point[0], y: point[1], width: 0, height: 0, left: point[0], right: point[0], top: point[1], bottom: point[1]};
	} else {
		rect = elem1.getBoundingClientRect();
	}
	let [viewport_width, viewport_height] = [document.documentElement.clientWidth, document.documentElement.clientHeight];
	elem2.style.position = "fixed";
	elem2.style.visibility = "hidden";
	elem1.appendChild(elem2);

	let dropdown_rect = elem2.getBoundingClientRect();
	let flip_horizontal = false;
	let flip_vertical = false;
	let sideways = (elem1.classList.contains("dropdown-item"));
	if(((sideways ? rect.right : rect.left) + dropdown_rect.width) >= viewport_width - 10)
		flip_horizontal = true;
	if(((sideways ? rect.top : rect.bottom) + dropdown_rect.height) >= viewport_height - 10 && (sideways ? rect.top : rect.bottom) >= (viewport_width / 2))
		flip_vertical = true;

	let dropdown_x = (sideways && !flip_horizontal) ? rect.right : rect.left;
	let dropdown_y = (!sideways && !flip_vertical) ? rect.bottom : rect.top;
	if(flip_horizontal) {
		elem2.style.right = (viewport_width - dropdown_x) + "px";
		elem2.style.maxWidth = (dropdown_x - 10) + "px";
	} else {
		elem2.style.left = dropdown_x + "px";
		elem2.style.maxWidth = (viewport_width - dropdown_x - 10) + "px";
	}
	if(flip_vertical) {
		elem2.style.bottom = (viewport_height - dropdown_y) + "px";
		elem2.style.maxHeight = (dropdown_y - 10) + "px";
	} else {
		elem2.style.top = dropdown_y + "px";
		elem2.style.maxHeight = (viewport_height - dropdown_y - 10) + "px";
	}

	if(!sideways && rect.width) {
		elem2.style.minWidth = rect.width + "px";
	}

	if(autoremove) {
		elem2.tabIndex = -1;
		if(!elem2.dataset.hasDropdownFocusoutListener) {
			elem2.dataset.hasDropdownFocusoutListener = true;
			elem2.addEventListener("focusout", () => {
				setTimeout(() => {
					if(elem2 != document.activeElement && !elem2.contains(document.activeElement) && elem1.contains(elem2)) {
						elem1.removeChild(elem2);
					}
				}, 0);
			});
		}
	}

	elem2.style.visibility = "";
	if(autoremove)
		elem2.focus();
};

BluespessClient.prototype.enqueue_icon_meta_load = require('./lib/icon_loader.js');
BluespessClient.prototype.anim_loop = require('./lib/renderer.js');
BluespessClient.prototype.get_audio_buffer = require('./lib/audio_loader.js');

BluespessClient.Atom = Atom;
BluespessClient.Component = Component;
BluespessClient.IconRenderer = IconRenderer;
BluespessClient.Sound = Sound;
BluespessClient.Matrix = Matrix;

BluespessClient.Eye = Eye;
BluespessClient.Plane = Plane;

module.exports = BluespessClient;
