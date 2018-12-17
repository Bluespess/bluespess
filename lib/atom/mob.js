'use strict';

const {chain_func, is_atom, to_chat, has_component} = require('../utils.js');
const _observers = Symbol('_observers');
const _viewers = Symbol('_viewers');
const _viewing = Symbol('_viewing');
const _key = Symbol('_key');
const _client = Symbol('_client');
const _server_to_net = Symbol('_server_to_net');
const _visible_tiles = Symbol('_visible_tiles');
const _screen_set = Symbol('_screen_set');
const _update_var = Symbol('_update_var');
const _add_viewing = Symbol('_add_viewing');
const _remove_viewing = Symbol('_remove_viewing');
const _common_tiles_count = Symbol('_common_tiles_count');
const _panel_map = Symbol('_panel_map');
const _visgroups = Symbol('_visgroups');
const _eye_to_eyeid = Symbol('_eye_to_eyeid');
module.exports._symbols = {_observers, _client, _viewers, _viewing, _visible_tiles, _server_to_net, _add_viewing, _remove_viewing, _update_var, _common_tiles_count, _visgroups, _key};

const Component = require('./component.js');

var id_counter = 0;

/**
 * Represents an origin that a {@link Mob} can look from.
 * Depends on {@link Hearer}
 * @alias Eye
 * @extends Bluespess.Component
 */
class Eye extends Component {
	constructor(atom, template) {
		super(atom, template);
		this[_observers] = [];

		// Key maps. Yes we could just directly use the IDs but then clients would be able to cheat
		this[_server_to_net] = {};

		// The things we can see
		this[_viewing] = {};
		this[_visible_tiles] = new Set();
		this[_screen_set] = new Set();
		this[_common_tiles_count] = new Map();
		this[_visgroups] = new Set();

		// Event handler
		this.a.on("parent_moved", () => {this.recalculate_visible_tiles();});
		this.a.on("moved", () => {this.recalculate_visible_tiles();});

		this.recalculate_visible_tiles();

		this.screen = new Proxy({}, {
			set: (target, key, value) => {
				if(value != undefined && !is_atom(value))
					throw new TypeError(`${value} is not an atom`);
				if(target[key] == value)
					return true;
				if(target[key]) {
					this[_screen_set].delete(target[key]);
					if(!this.can_see(target[key]))
						this[_remove_viewing](target[key]);
				}
				target[key] = value;
				if(target[key]) {
					this[_screen_set].add(target[key]);
					this[_add_viewing](target[key]);
				}
				return true;
			}, deleteProperty: (target, key) => {
				this.screen[key] = null;
				delete target[key];
				return true;
			}
		});

		if(this.a.c.Hearer)
			this.a.c.Hearer.show_message = chain_func(this.a.c.Hearer.show_message, this.show_message.bind(this));
		
		/** @type {boolean} */this.xray;
	}

	[_add_viewing](item) {
		if(item instanceof Array || item instanceof Set) {
			item.forEach((i) => {
				this[_add_viewing](i);
			});
			return;
		}
		if(!is_atom(item))
			throw new TypeError(`${item} is not an atom!`);
		if(this[_viewing][this[_server_to_net][item.object_id]])
			return; // We already have this item.
		var netid = "NET_" + (id_counter++);
		if(this[_server_to_net][item.object_id])
			netid = this[_server_to_net][item.object_id];
		else
			this[_server_to_net][item.object_id] = netid;
		this[_viewing][netid] = item;
		item[_viewers].push(this.atom);

		this.enqueue_create_atom(netid, item);
	}

	[_remove_viewing](item) {
		if(item instanceof Array || item instanceof Set) {
			item.forEach((i) => {
				this[_remove_viewing](i);
			});
			return;
		}
		if(!is_atom(item))
			throw new TypeError(`${item} is not an atom!`);
		var netid = this[_server_to_net][item.object_id];
		if(!netid)
			return; // This item is not being tracked, and even if it is there's no way to find out the network id.
		delete this[_viewing][netid];
		delete this[_server_to_net][item.object_id];
		var idx;
		if((idx = item[_viewers].indexOf(this.atom)) != -1)
			item[_viewers].splice(idx, 1);

		this.enqueue_delete_atom(netid);
	}
	enqueue_create_atom(netid, atom) {
		for(var observer of this[_observers]) {
			var client = observer.c.Mob.client;
			if(!client)
				continue;
			client.enqueue_create_atom(netid, atom, this.a);
		}
	}
	enqueue_update_atom_var(netid, atom, varname, is_appearance) {
		for(var observer of this[_observers]) {
			var client = observer.c.Mob.client;
			if(!client)
				continue;
			client.enqueue_update_atom_var(netid, atom, varname, is_appearance);
		}
	}
	enqueue_delete_atom(netid) {
		for(var observer of this[_observers]) {
			var client = observer.c.Mob.client;
			if(!client)
				continue;
			client.enqueue_delete_atom(netid);
		}
	}

	enqueue_add_tile(tile) {
		for(var observer of this[_observers]) {
			var client = observer.c.Mob.client;
			if(!client)
				continue;
			client.enqueue_add_tile(tile);
		}
	}

	enqueue_remove_tile(tile) {
		for(var observer of this[_observers]) {
			var client = observer.c.Mob.client;
			if(!client)
				continue;
			client.enqueue_remove_tile(tile);
		}
	}

	compute_visible_tiles() {
		if(this.xray == true)
			return this.a.server.compute_inrange_tiles(this.a, this.view_range);
		else
			return this.a.server.compute_visible_tiles(this.a, this.view_range);
	}

	recalculate_visible_tiles() {
		process.nextTick(() => {
			for(let observer of this[_observers]) {
				let client = observer.c.Mob.client;
				if(!client)
					continue;
				client.next_message.eye = client.next_message.eye || {};
				client.next_message.eye[observer.c.Mob[_eye_to_eyeid].get(this.a)] = {x:this.a.base_mover.x,y:this.a.base_mover.y,glide_size:this.a.base_mover.glide_size};
			}
		});

		var new_visible = this.compute_visible_tiles();
		var old_visible = this[_visible_tiles];
		var added = [...new_visible].filter((item) => {return !old_visible.has(item);});
		var removed = [...old_visible].filter((item) => {return !new_visible.has(item);});
		this[_visible_tiles] = new_visible;
		for(let tile of added) {
			this.enqueue_add_tile(tile);
			tile.viewers.push(this.atom);
			for(let item of tile.partial_contents) {
				this[_common_tiles_count].set(item, this[_common_tiles_count].get(item) + 1 || 1);
				if(this.can_see(item)) {
					this[_add_viewing](item);
				}
			}
		}
		for(let tile of removed) {
			this.enqueue_remove_tile(tile);
			tile.viewers.splice(tile.viewers.indexOf(this.atom), 1);
			for(let item of tile.partial_contents) {
				this[_common_tiles_count].set(item, this[_common_tiles_count].get(item) - 1);
				if(!this.can_see(item)) {
					this[_remove_viewing](item);
				}
			}
		}
	}
	/**
	 * @param {Bluespess.Atom} item
	 * @returns {boolean}
	 */
	can_see(item) {
		if(this[_screen_set].has(item))
			return true;
		let visible_value = item.visible;
		for(let visgroup of item[_visgroups]) {
			if(this[_visgroups].has(visgroup) && visgroup.overrides.has("visible")) {
				visible_value = visgroup.overrides.get("visible");
			}
		}
		var visible = (visible_value && this[_common_tiles_count].get(item) > 0);
		if(visible)
			return !item.can_be_seen || item.can_be_seen(this.atom, this[_visible_tiles]);
		return false;
	}
	/**
	 * @param {Bluespess.Atom} item
	 * @returns {string}
	 */
	get_netid_for_atom(atom) {
		return this[_server_to_net][atom.object_id];
	}
	show_message(prev) {
		var to_show = prev();
		to_chat(this.a, to_show);
		return to_show;
	}

	/**
	 * Returns the mobs that are looking from this mob
	 * @generator
	 * @yields {Bluespess.Atom<Mob>}
	 */
	observers() {
		return this[_observers][Symbol.iterator]();
	}
}

Eye.template = {
	vars: {
		components: {
			"Eye": {
				xray: false,
				view_range: 8
			}
		}
	}
};

Eye.loadBefore = ["Hearer"];

/**
 * @event Mob#keydown
 * @type {Object}
 * @property {number} which keycode
 */
/**
 * @event Mob#keyup
 * @type {Object}
 * @property {number} which keycode
 */
/**
 * Event name is prepended with, if applicable: ctrl_, alt_, shift_, middle_ in that order.
 * @event Mob#click_on
 * @type {mouse_event}
 */
/**
 * @event Mob#mouse_dragged
 * @type {Object}
 * @property {mouse_event} from
 * @property {mouse_event} to
 */
/**
 * @event Mob#message
 * @type {Object}
 */
/**
 * @event Mob#message_pre
 * @type {Object}
 */

/**
 * The ability to be posessed by a client
 * @alias Mob
 * @extends Bluespess.Component
 */
class Mob extends Component {
	constructor(atom, template) {
		super(atom, template);

		this[_client] = undefined;
		this[_key] = undefined;
		this[_panel_map] = new Map();
		this[_eye_to_eyeid] = new WeakMap();

		/**
		 * @type {Object<string,Bluespess.Atom<Mob>>}
		 * @member eyes
		 * @memberof Mob
		 * @instance
		 */
		// Eyes map
		Object.defineProperty(this, 'eyes', {enumerable: true,configurable: false, writable: false, value: new Proxy({}, {
			set: (target, property, value) => {
				property = ""+property;
				if(value instanceof Eye)
					value = value.atom;
				if(value != undefined && !has_component(value, "Eye"))
					throw new TypeError(`Expected object with Eye component`);
				if(value && value.c.Eye[_observers].indexOf(this) != -1)
					return false;
				var oldEye = target[property];
				if(oldEye && this.client) {
					for(let netid in oldEye.c.Eye[_viewing]) {
						if(!oldEye.c.Eye[_viewing].hasOwnProperty(netid))
							continue;
						this.client.enqueue_delete_atom(netid);
					}
					for(let tile of oldEye.c.Eye[_visible_tiles]) {
						this.client.enqueue_remove_tile(tile);
					}
				}
				if(oldEye) {
					var idx = oldEye.c.Eye[_observers].indexOf(this.a);
					if(idx != -1) {
						oldEye.c.Eye[_observers].splice(idx, 1);
					}
				}
				target[property] = value;
				this[_eye_to_eyeid].set(value, property);
				if(value) {
					value.c.Eye[_observers].push(this.a);
				}
				if(value && this.client) {
					for(let netid in value.c.Eye[_viewing]) {
						if(!value.c.Eye[_viewing].hasOwnProperty(netid))
							continue;
						var atom = value.c.Eye[_viewing][netid];
						this.client.enqueue_create_atom(netid, atom, value);
					}
					for(let tile of value.c.Eye[_visible_tiles]) {
						this.client.enqueue_add_tile(tile);
					}
					this.client.next_message.eye = this.client.next_message.eye || {};
					this.client.next_message.eye[property] = {x:value.base_mover.x,y:value.base_mover.y,glide_size:0};
				}
				return true;
			}, defineProperty: () => {throw new Error(`Cannot define property on eyes map`);},
			deleteProperty: (target, property) => {
				this.eyes[property] = undefined;
				delete target[property];
			}
		})});

		this.eyes[""] = this.atom;
	}

	/**
	 * @see Client#key
	 * @type {string}
	 */
	get key() {
		return this[_key];
	}
	set key(val) {
		this.a.server.dc_mobs[this[_key]] = undefined;
		if(val && val != "") {
			if(this.a.server.clients[val])
				this.client = this.a.server.clients[val];
			else {
				if(this.a.server.dc_mobs[val])
					this.a.server.dc_mobs[val].c.Mob.key = undefined;
				this.a.server.dc_mobs[val] = this.atom;
			}
		}
		this[_key] = val || undefined;
	}

	/**
	 * @type {Client}
	 */
	get client() {
		return this[_client];
	}
	set client(val) {
		if(!val) {
			this[_key] = null;
			if(this[_client]) {
				this[_client].mob = null;
				this[_client] = null;
			}
			return;
		}
		this[_key] = val.key;
		val.mob = this.atom;
	}

	/**
	 * @param {Bluespess.Atom<Eye>}
	 * @returns {string}
	 */
	get_eyeid_for_eye(eye) {
		return this[_eye_to_eyeid].get(eye);
	}

	/**
	 * @param {Bluespess.Atom} atom
	 * @param {Bluespess.Panel|Constructor} panel
	 * @param {string} key=""
	 * @returns {boolean}
	 * @abstract
	 */
	can_interact_with_panel() {
		return true;
	}

	basic_panel_read_checks(atom, panel) {
		if(typeof panel == "object") {
			if(panel.client != this.client || (panel.bound_mob && panel.bound_mob != this.a))
				return false;
		}
		return true;
	}

	/**
	 * @param {Bluespess.Atom} atom
	 * @param {Bluespess.Panel|Constructor} panel
	 * @param {string} key=""
	 * @returns {boolean}
	 * @abstract
	 */
	can_read_panel(atom, panel, key = "") {
		if(atom.can_user_read_panel && !atom.can_user_read_panel(this.a, panel, key))
			return false;
		for(var eye of Object.values(this.eyes))
			if(eye.c.Eye.can_see(atom))
				return true;
		return false;
	}

	/**
	 * Binds the panel to this mob and the panel.
	 * @param {Bluespess.Atom} atom
	 * @param {Bluespess.Panel} panel
	 * @param {string} [key=""]
	 */
	bind_panel(atom, panel, key = "") {
		if(!this.basic_panel_read_checks(atom, panel, key) || !this.can_read_panel(atom, panel, key))
			throw new Error(`Check that your panel can be opened *before* creating and trying to bind it you tit`);
		if(this.get_panel(atom, panel, key))
			throw new Error(`A panel of this type has already been opened before for this atom and key`);

		panel.bound_atom = atom;
		var check = () => {
			if(panel.is_open && this.basic_panel_read_checks(atom, panel, key) && this.can_read_panel(atom, panel, key)) {
				panel.visibility_indicator = this.can_interact_with_panel(atom, panel, key) ? "can_interact" : "can_see";
				return;
			}
			panel.removeListener("close", check);
			panel.removeListener("message", check);
			this.a.removeListener("moved", check);
			this.a.removeListener("parent_moved", check);
			atom.removeListener("moved", check);
			atom.removeListener("parent_moved", check);
			this.removeListener("client_changed", check);
			this[_panel_map].delete(`${atom.object_id},${panel.constructor.name},${key}`);
			panel.close();
		};

		panel.on("close", check);
		panel.on("message", check);
		this.a.on("moved", check);
		this.a.on("parent_moved", check);
		atom.on("moved", check);
		atom.on("parent_moved", check);
		this.on("client_changed", check);

		panel.bound_atom = atom;
		panel.bound_key = key;
		panel.bound_mob = this.a;
		this[_panel_map].set(`${atom.object_id},${panel.constructor.name},${key}`, panel);
	}

	/**
	 * Binds the panel to this mob and the panel.
	 * @param {Bluespess.Atom} atom
	 * @param {Constructor} panel
	 * @param {string} [key=""]
	 */
	get_panel(atom, panel, key = "") {
		return this[_panel_map].get(`${atom.object_id},${typeof panel == "function" ? panel.name : panel.constructor.name},${key}`);
	}
}
Mob.depends = ["Eye"];
Mob.loadBefore = ["Eye"];

module.exports.components = {"Mob": Mob, "Eye": Eye};
