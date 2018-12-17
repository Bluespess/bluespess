'use strict';

const {has_component} = require('./utils.js');
const mob_symbols = require('./atom/mob.js')._symbols;
const EventEmitter = require('events');
const Component = require('./atom/component.js');

const _mob = Symbol('_mob');
const _atom_net_queue = Symbol('_atom_net_queue');
const _netid_to_atom = Symbol('_netid_to_atom');
const _netid_to_eye = Symbol('_netid_to_eye');
const _tiles_to_add = Symbol('_tiles_to_add');
const _tiles_to_remove = Symbol('_tiles_to_remove');

/** @typedef {import("./atom/atom")} Bluespess.Atom */
/** @typedef {import("./server")} Bluespess */

/**
 * @alias Client
 */
class Client extends EventEmitter {
	constructor(socket, username, server, name) {
		super();
		this.socket = socket;
		/**
		 * @type {string}
		 */
		this.key = username;
		/**
		 * @type {string}
		 */
		this.name = name || username;
		/**
		 * @type {Bluespess}
		 */
		this.server = server;
		this[_atom_net_queue] = {}; // It's not *really* a queue but whatever.
		this[_tiles_to_add] = new Set();
		this[_tiles_to_remove] = new Set();
		this[_netid_to_atom] = {};
		this[_netid_to_eye] = [];
		/**
		 * An object containing some of the message to be sent on the next network tick. Add properties to this object to send things to the client.
		 * @type {Object}
		 */
		this.next_message = {};

		/**
		 * All the panels currently open
		 * @type {Map<string,Bluespess.Panel>}
		 */
		this.panels = new Map();

		this.socket.on("message", this.message_handler.bind(this));
		this.socket.on("close", this.disconnect_handler.bind(this));

		if(this.server.dc_mobs[this.key]) {
			if(this.mob == undefined)
				this.mob = (this.server.dc_mobs[this.key]);
			else
				this.server.dc_mobs[this.key].c.Mob.key = undefined;
		}

		if(this.server.demo_stream && !this.server.demo_stream.closed) {
			this.server.demo_stream.write(JSON.stringify({timestamp: this.server.now(), key: this.key, name: this.name, login: true}) + "\n");
		}

		this.address = this.socket._socket.remoteAddress;
		// for some reason ipv4 addresses are sometimes formated as ::ffff:12.34.56.78
		let found_ip4 = /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/.exec(this.address);
		if(found_ip4)
			this.address = found_ip4[0];

		this.server.emit("client_login", this);

		this.last_click_time = 0;
	}
	/**
	 * Passed to mouse events.
	 * @class
	 * @name mouse_event
	 * @alias mouse_event
	 * @property {Bluespess.Atom} atom
	 * @property {Client} client
	 * @property {Bluespess.Atom<Mob>} mob
	 * @property {number} x Where on the atom the mouse event occured
	 * @property {number} y Where on the atom the mouse event occured
	 */
	/**
	 * @event Client#keydown
	 * @type {Object}
	 * @property {number} which keycode
	 */
	/**
	 * @event Client#keyup
	 * @type {Object}
	 * @property {number} which keycode
	 */
	/**
	 * Event name is prepended with, if applicable: ctrl_, alt_, shift_, middle_ in that order.
	 * @event Client#click_on
	 * @type {mouse_event}
	 */
	/**
	 * @event Client#mouse_dragged
	 * @type {Object}
	 * @property {mouse_event} from
	 * @property {mouse_event} to
	 */
	/**
	 * @event Client#message
	 * @type {Object}
	 */
	/**
	 * @event Client#message_pre
	 * @type {Object}
	 */
	message_handler(data) {
		try {
			var obj = JSON.parse(data);

			this.emit("message_pre", obj);
			if(this.mob)
				this.mob.c.Mob.emit("message_pre", obj);

			if(obj.ping) {
				this.socket.send(JSON.stringify({
					pong: obj.ping
				}));
			}
			if(obj.keydown) {
				this.emit("keydown", obj.keydown);
				if(this.mob) {
					this.mob.c.Mob.emit("keydown", obj.keydown);
				}
			}
			if(obj.keyup) {
				this.emit("keyup", obj.keyup);
				if(this.mob) {
					this.mob.c.Mob.emit("keyup", obj.keyup);
				}
			}
			if(obj.click_on && this.last_click_time + 50 < this.server.now()) {
				this.last_click_time = this.server.now();

				let click_prefix = "";
				if(obj.click_on.ctrlKey)
					click_prefix += "ctrl_";
				if(obj.click_on.altKey)
					click_prefix += "alt_";
				if(obj.click_on.shiftKey)
					click_prefix += "shift_";
				if(obj.click_on.button == 1)
					click_prefix += "middle_";

				obj.click_on.atom = this[_netid_to_atom][obj.click_on.atom];
				if(this.mob)
					obj.click_on.mob = this.mob;
				obj.click_on.client = this;
				this.emit(click_prefix + "click_on", obj.click_on);
				if(this.mob) {
					this.mob.c.Mob.emit(click_prefix + "click_on", obj.click_on);
				}
				if(obj.click_on.atom)
					obj.click_on.atom.emit(click_prefix + "clicked", obj.click_on);
			}
			if(obj.drag && obj.drag.from && obj.drag.to) {
				// convert over to netids
				obj.drag.from.atom = this[_netid_to_atom][obj.drag.from.atom];
				obj.drag.to.atom = this[_netid_to_atom][obj.drag.to.atom];
				if(this.mob)
					obj.drag.mob = this.mob;
				obj.drag.client = this;
				this.emit("mouse_dragged", obj.drag);
				if(this.mob)
					this.mob.c.Mob.emit("mouse_dragged", obj.drag);
				if(obj.drag.from.atom)
					obj.drag.from.atom.emit("mouse_dragged_to", obj.drag);
				if(obj.drag.to.atom)
					obj.drag.to.atom.emit("mouse_dropped_by", obj.drag);
			}
			if(obj.panel) {
				let pm = obj.panel;
				if(pm.message) {
					for(let message of pm.message) {
						let id = message.id;
						let panel = this.panels.get(id);
						if(panel) {
							panel.emit("message", message.contents);
						}
					}
				}
				if(pm.close) {
					for(let id of pm.close) {
						var panel = this.panels.get(id);
						if(!panel)
							continue;
						panel.close(false);
					}
				}
			}

			this.emit("message", obj);
			if(this.mob)
				this.mob.c.Mob.emit("message", obj);
		} catch(e) {
			console.error(e);
		}
	}

	disconnect_handler() {
		var mob = this.mob;
		if(mob) {
			this.mob = null;
		}
		if(this.server.clients[this.key] == this)
			delete this.server.clients[this.key];
		if(this.server.clients_by_name[this.name] == this)
			delete this.server.clients_by_name[this.name];
		if(mob) {
			mob.c.Mob.key = this.key;
		}
		if(this.server.demo_stream && !this.server.demo_stream.closed) {
			this.server.demo_stream.write(JSON.stringify({timestamp: this.server.now(), key: this.key, logout: true}) + "\n");
		}
	}

	/**
	 * The mob currently being controlled by the client
	 * @type {Bluespess.Atom<Mob>|null}
	 */
	get mob() {
		return this[_mob];
	}
	set mob(val) {
		if(val == this[_mob])
			return;
		if(val && !has_component(val, "Mob"))
			throw new TypeError("Expected object with Mob component");
		if(this[_mob]) {
			this[_mob].c.Mob[mob_symbols._client] = undefined;
			this[_mob].c.Mob[mob_symbols._key] = undefined;
			this.next_message.eye = this.next_message.eye || {};
			for(let eyeId in this[_mob].c.Mob.eyes) {
				if(!this[_mob].c.Mob.eyes.hasOwnProperty(eyeId))
					continue;
				let eye = this[_mob].c.Mob.eyes[eyeId];
				for(let netid in eye.c.Eye[mob_symbols._viewing]) {
					if(!eye.c.Eye[mob_symbols._viewing].hasOwnProperty(netid))
						continue;
					this.enqueue_delete_atom(netid);
				}
				for(let tile of eye.c.Eye[mob_symbols._visible_tiles]) {
					this.enqueue_remove_tile(tile);
				}
			}
			this[_mob].c.Mob.emit("client_changed", this, null);
		}
		if(val) {
			delete this.server.dc_mobs[val.c.Mob.key];
		}
		this[_mob] = val;
		if(this[_mob]) {
			var old_client = this[_mob].c.Mob.client;
			if(old_client)
				old_client.mob = null;
			for(let eyeId in this[_mob].c.Mob.eyes) {
				if(!this[_mob].c.Mob.eyes.hasOwnProperty(eyeId))
					continue;
				let eye = this[_mob].c.Mob.eyes[eyeId];
				for(let netid in eye.c.Eye[mob_symbols._viewing]) {
					if(!eye.c.Eye[mob_symbols._viewing].hasOwnProperty(netid))
						continue;
					this.enqueue_create_atom(netid, eye.c.Eye[mob_symbols._viewing][netid], eye);
				}
				for(let tile of eye.c.Eye[mob_symbols._visible_tiles]) {
					this.enqueue_add_tile(tile);
				}
				this.next_message.eye = this.next_message.eye || {};
				this.next_message.eye[eyeId] = {x:eye.base_mover.x,y:eye.base_mover.y,glide_size:0};
			}
			this[_mob].c.Mob[mob_symbols._client] = this;
			this[_mob].c.Mob[mob_symbols._key] = this.key;
			this[_mob].c.Mob.emit("client_changed", old_client, this);
		}
	}
	enqueue_create_atom(netid, atom, eye) {
		this[_atom_net_queue][netid] = {"create": atom};
		this[_netid_to_atom][netid] = atom;
		this[_netid_to_eye][netid] = eye;
	}

	enqueue_update_atom_var(netid, atom, varname, type) {
		var entry = this[_atom_net_queue][netid];
		if(!entry)
			entry = {};
		if(entry.create) {
			// The create packet has not been sent yet. This means there's no point in updating.
			return;
		}
		this[_atom_net_queue][netid] = entry;
		if(!entry.update) {
			entry.update = {};
			entry.update.atom = atom;
		}
		if(typeof type == "string") {
			if(!entry.update.components)
				entry.update.components = {};
			if(!entry.update.components[type])
				entry.update.components[type] = new Set();
			entry.update.components[type].add(varname);
		} else {
			var subentry = entry.update;
			var setname = type == 1 ? "appearance_items" : type == 2 ? "overlays" : "items";
			if(!subentry[setname])
				subentry[setname] = new Set();
			subentry[setname].add(varname);
		}
	}
	enqueue_delete_atom(netid) {
		this[_netid_to_atom][netid] = undefined;
		this[_netid_to_eye][netid] = undefined;
		this[_atom_net_queue][netid] = {"delete": true};
	}

	enqueue_add_tile(tile) {
		var strtile = JSON.stringify([tile.x, tile.y, tile.z]);
		if(!this[_tiles_to_remove].delete(strtile))
			this[_tiles_to_add].add(strtile);
	}

	enqueue_remove_tile(tile) {
		var strtile = JSON.stringify([tile.x, tile.y, tile.z]);
		if(!this[_tiles_to_add].delete(strtile))
			this[_tiles_to_remove].add(strtile);
	}

	send_network_updates() {
		if(!this.socket || this.socket.readyState != this.socket.OPEN)
			return;
		var message = {};
		for(let netid in this[_atom_net_queue]) {
			let entry = this[_atom_net_queue][netid];
			if(entry.create) {
				if(!message.create_atoms)
					message.create_atoms = [];
				let atom = entry.create;
				let common_visgroups = [];
				for(let visgroup of atom[mob_symbols._visgroups]) {
					if(this[_netid_to_eye][netid].c.Eye[mob_symbols._visgroups].has(visgroup))
						common_visgroups.push(visgroup);
				}
				let submessage = {network_id: netid, component_vars: {}, components: [], eye_id: this.mob.c.Mob.get_eyeid_for_eye(this[_netid_to_eye][netid])};
				for(var key of ['icon', 'icon_state', 'dir', 'layer', 'name', 'glide_size', 'screen_loc_x', 'screen_loc_y', 'mouse_opacity', 'overlays', 'x', 'y', 'opacity', 'flick', 'color', 'alpha']) {
					submessage[key] = atom[key];
					for(let visgroup of common_visgroups) {
						if(visgroup.overrides.has(key))
							submessage[key] = visgroup.overrides.get(key);
					}
				}
				if(atom.template && atom.template.components) {
					for(let component_name of atom.template.components) {
						var component = atom.components[component_name];
						if(!(component instanceof Component.Networked))
							continue;
						submessage.components.push(component_name);
						submessage.component_vars[component_name] = component.get_networked_vars();
					}
				}
				message.create_atoms.push(submessage);
			} else if(entry.update) {
				if(!message.update_atoms)
					message.update_atoms = [];
				let atom = entry.update.atom;
				let common_visgroups = [];
				for(let visgroup of atom[mob_symbols._visgroups]) {
					if(this[_netid_to_eye][netid].c.Eye[mob_symbols._visgroups].has(visgroup))
						common_visgroups.push(visgroup);
				}
				let submessage = {network_id: netid};
				if(entry.update.items) {
					for(let item of entry.update.items) {
						submessage[item] = atom[item];
						for(let visgroup of common_visgroups) {
							if(visgroup.overrides.has(item))
								submessage[item] = visgroup.overrides.get(item);
						}
						if(submessage[item] === undefined)
							submessage[item] = null;
					}
				}
				if(entry.update.overlays) {
					submessage.overlays = {};
					for(let item of entry.update.overlays) {
						submessage.overlays[item] = atom.overlays[item] === undefined ? null : atom.overlays[item];
					}
				}
				if(entry.update.components) {
					submessage.components = {};
					for(let component_name in entry.update.components) {
						if(!entry.update.components.hasOwnProperty(component_name))
							continue;
						submessage.components[component_name] = {};
						for(let item of entry.update.components[component_name]) {
							submessage.components[component_name][item] = atom.components[component_name][item];
						}
					}
				}
				message.update_atoms.push(submessage);
			} else if(entry.delete) {
				if(!message.delete_atoms)
					message.delete_atoms = [];
				message.delete_atoms.push(netid);
			}
			delete this[_atom_net_queue][netid];
		}
		if(this[_tiles_to_add].size) {
			message.add_tiles = [...this[_tiles_to_add]];
			this[_tiles_to_add].clear();
		}
		if(this[_tiles_to_remove].size) {
			message.remove_tiles = [...this[_tiles_to_remove]];
			this[_tiles_to_remove].clear();
		}
		for(let key in this.next_message) {
			if(!this.next_message.hasOwnProperty(key))
				continue;
			message[key] = this.next_message[key];
			delete this.next_message[key];
		}
		if(JSON.stringify(message) == "{}")
			return;
		message.timestamp = this.server.now();
		if(this.server.demo_stream && !this.server.demo_stream.closed) {
			this.server.demo_stream.write(JSON.stringify({timestamp: message.timestamp, key: this.key, server_message: message}) + "\n");
		}
		this.socket.send(JSON.stringify(message));
	}
}

module.exports = Client;
