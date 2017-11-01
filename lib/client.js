'use strict';

const mob_symbols = require('./atom/mob.js')._symbols;
const EventEmitter = require('events');
const Component = require('./atom/component.js');

const _mob = Symbol('_mob');
const _atom_net_queue = Symbol('_atom_net_queue');
const _netid_to_atom = Symbol('_netid_to_atom');
const _tiles_to_add = Symbol('_tiles_to_add');
const _tiles_to_remove = Symbol('_tiles_to_remove');

class Client extends EventEmitter {
	constructor(socket, username, server) {
		super();
		this.socket = socket;
		this.key = username;
		this.server = server;
		this[_atom_net_queue] = {}; // It's not *really* a queue but whatever.
		this[_tiles_to_add] = new Set();
		this[_tiles_to_remove] = new Set();
		this[_netid_to_atom] = {};
		this.next_message = {};

		this.panels = new Map();

		this.socket.on("message", this.message_handler.bind(this));
		this.socket.on("close", this.disconnect_handler.bind(this));

		if(this.server.dc_mobs[this.key]) {
			if(this.mob == undefined)
				this.mob = (this.server.dc_mobs[this.key]);
			else
				this.server.dc_mobs[this.key].components.Mob.key = undefined;
		}

		this.server.emit("client_login", this);

		this.next_message.eye = {"":this.mob.components.Mob.eyes[""].components.Eye[mob_symbols._server_to_net][this.mob.components.Mob.eyes[""].object_id]};
	}
	message_handler(data) {
		try {
			var obj = JSON.parse(data);
		} catch(e) {
			console.error(e);
		}
		if(obj.ping) {
			this.socket.send(JSON.stringify({
				pong: obj.ping
			}));
		}
		if(obj.keydown) {
			this.emit("keydown", obj.keydown);
			if(this.mob) {
				this.mob.emit("keydown", obj.keydown);
			}
		}
		if(obj.keyup) {
			this.emit("keyup", obj.keyup);
			if(this.mob) {
				this.mob.emit("keyup", obj.keyup);
			}
		}
		if(obj.click_on) {
			obj.click_on.atom = this[_netid_to_atom][obj.click_on.atom];
			if(this.mob)
				obj.click_on.mob = this.mob;
			obj.click_on.client = this;
			this.emit("click_on", obj.click_on);
			if(this.mob) {
				this.mob.emit("click_on", obj.click_on);
			}
			if(obj.click_on.atom)
				obj.click_on.atom.emit("clicked", obj.click_on);
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
	}

	disconnect_handler() {
		var mob = this.mob;
		if(mob) {
			this.mob = null;
		}
		if(this.server.clients[this.key] == this)
			delete this.server.clients[this.key];
		if(mob) {
			mob.components.Mob.key = this.key;
		}
	}

	get mob() {
		return this[_mob];
	}
	set mob(val) {
		if(val == this[_mob])
			return;
		if(val && !this.server.has_component(val, "Mob"))
			throw new TypeError("Expected object with Mob component");
		if(this[_mob]) {
			this[_mob].components.Mob[mob_symbols._client] = undefined;
			this[_mob].components.Mob[mob_symbols._key] = undefined;
			for(let eyeId in this[_mob].components.Mob.eyes) {
				if(!this[_mob].components.Mob.eyes.hasOwnProperty(eyeId))
					continue;
				let eye = this[_mob].components.Mob.eyes[eyeId];
				for(let netid in eye.components.Eye[mob_symbols._viewing]) {
					if(!eye.components.Eye[mob_symbols._viewing].hasOwnProperty(netid))
						continue;
					this.enqueue_delete_atom(netid);
				}
				for(let tile of eye.components.Eye[mob_symbols._visible_tiles]) {
					this.enqueue_remove_tile(tile);
				}
			}
		}
		this[_mob] = val;
		if(this[_mob]) {
			for(let eyeId in this[_mob].components.Mob.eyes) {
				if(!this[_mob].components.Mob.eyes.hasOwnProperty(eyeId))
					continue;
				let eye = this[_mob].components.Mob.eyes[eyeId];
				for(let netid in eye.components.Eye[mob_symbols._viewing]) {
					if(!eye.components.Eye[mob_symbols._viewing].hasOwnProperty(netid))
						continue;
					this.enqueue_create_atom(netid, eye.components.Eye[mob_symbols._viewing][netid]);
				}
				for(let tile of eye.components.Eye[mob_symbols._visible_tiles]) {
					this.enqueue_add_tile(tile);
				}
			}
			this[_mob].components.Mob[mob_symbols._client] = this;
			this[_mob].components.Mob[mob_symbols._key] = this.key;
		}
	}
	enqueue_create_atom(netid, atom) {
		this[_atom_net_queue][netid] = {"create": atom};
		this[_netid_to_atom][netid] = atom;
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
				let submessage = {network_id: netid, component_vars: {}, components: []};
				for(var key of ['icon', 'icon_state', 'dir', 'layer', 'name', 'glide_size', 'screen_loc_x', 'screen_loc_y', 'overlays', 'x', 'y', 'opacity'])
					submessage[key] = atom[key];
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
				let submessage = {network_id: netid};
				if(entry.update.items) {
					for(let item of entry.update.items) {
						submessage[item] = atom[item] === undefined ? null : atom[item];
					}
				}
				if(entry.update.appearance_items) {
					submessage.appearance = {};
					for(let item of entry.update.appearance_items) {
						submessage.appearance[item] = atom.appearance[item] === undefined ? null : atom.appearance[item];
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
		this.socket.send(JSON.stringify(message));
	}
}

module.exports = Client;
