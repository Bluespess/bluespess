'use strict';

const mob_symbols = require('./atom/mob.js')._symbols;
const EventEmitter = require('events');

const _mob = Symbol('_mob');
const _atom_net_queue = Symbol('_atom_net_queue');
const _netid_to_atom = Symbol('_netid_to_atom');

class Client extends EventEmitter {
	constructor(socket, username, server) {
		super();
		this.socket = socket;
		this.key = username;
		this.server = server;
		this[_atom_net_queue] = {}; // It's not *really* a queue but whatever.
		this[_netid_to_atom] = {};
		this.next_message = {};

		this.socket.on("message", (data, flags) => {this.message_handler(data, flags);});
		this.server.emit("client_login", this);

		if(this.server.dc_mobs[this.key]) {
			if(this.mob == undefined)
				this.mob = (this.server.dc_mobs[this.key]);
			else
				this.server.dc_mobs[this.key].components.Mob.key = undefined;
		}

		this.socket.send(JSON.stringify({"eye":{"":this.mob.components.Mob.eyes[""].components.Eye[mob_symbols._server_to_net][this.mob.components.Mob.eyes[""].object_id]}}))
	}
	message_handler(data, flags) {
		try {
			var obj = JSON.parse(data);
		} catch(e) {}
		if(obj.keydown) {
			this.emit("keydown", obj.keydown);
			if(this.mob) {
				this.mob.emit("keydown", obj.keydown);
			}
		}
		if(obj.keyup) {
			this.emit("keyup", obj.keyup);
			if(this.mob) {
				this.mob.emit("keydown", obj.keydown);
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
			for(var eyeId in this[_mob].components.Mob.eyes) {
				if(!this[_mob].components.Mob.eyes.hasOwnProperty(eyeId))
					continue;
				var eye = this[_mob].components.Mob.eyes[eyeId];
				for(var netid in eye.components.Eye[mob_symbols._viewing]) {
					if(!eye.components.Eye[mob_symbols._viewing].hasOwnProperty(netid))
						continue
					this.enqueue_delete_atom(netid);
				}
			}
		}
		this[_mob] = val;
		if(this[_mob]) {
			for(var eyeId in this[_mob].components.Mob.eyes) {
				if(!this[_mob].components.Mob.eyes.hasOwnProperty(eyeId))
					continue;
				var eye = this[_mob].components.Mob.eyes[eyeId];
				for(var netid in eye.components.Eye[mob_symbols._viewing]) {
					if(!eye.components.Eye[mob_symbols._viewing].hasOwnProperty(netid))
						continue
					this.enqueue_create_atom(netid, eye.components.Eye[mob_symbols._viewing][netid]);
				}
			}
		}
		val.components.Mob[mob_symbols._client] = this;
		this[_mob].components.Mob[mob_symbols._key] = this.key;
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
		var subentry = entry.update;
		var setname = type == 1 ? "appearance_items" : type == 2 ? "overlays" : "items";
		if(!subentry[setname])
			subentry[setname] = new Set();
		subentry[setname].add(varname);
	}
	enqueue_delete_atom(netid) {
		this[_netid_to_atom][netid] = undefined;
		this[_atom_net_queue][netid] = {"delete": true};
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
				let submessage = {appearance: atom.appearance, overlays: atom.overlays, x: atom.x, y: atom.y, network_id: netid};
				message.create_atoms.push(submessage);
			} else if(entry.update) {
				if(!message.update_atoms)
					message.update_atoms = [];
				let atom = entry.update.atom;
				let submessage = {network_id: netid}
				if(entry.update.items) {
					for(var item of entry.update.items) {
						submessage[item] = atom[item] === undefined ? null : atom[item];
					}
				}
				if(entry.update.appearance_items) {
					submessage.appearance = {};
					for(var item of entry.update.appearance_items) {
						submessage.appearance[item] = atom.appearance[item] === undefined ? null : atom.appearance[item];
					}
				}
				if(entry.update.overlays) {
					submessage.overlays = {};
					for(var item of entry.update.overlays) {
						submessage.overlays[item] = atom.overlays[item] === undefined ? null : atom.overlays[item];
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
		for(var key in this.next_message) {

		}
		if(JSON.stringify(message) == "{}")
			return;
		message.timestamp = this.server.now();
		this.socket.send(JSON.stringify(message));
	}
}

module.exports = Client;
