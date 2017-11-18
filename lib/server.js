'use strict';
const WebSocket = require('ws');
const EventEmitter = require('events');
const toposort = require('toposort');
const InitialHandler = require('./initial_handler.js');
const Client = require('./client.js');
const Atom = require('./atom/atom.js');
const Component = require('./atom/component.js');
const Panel = require('./panel.js');
const {weakDeepAssign, chain_func} = require('./utils.js');
const ChatMessage = require('./chat_message.js');

const _locations = Symbol('_locations');
const _net_tick = Symbol('_net_tick');
const _is_template_processed = Symbol('_is_template_processed');
const _is_server_started = Symbol('_is_server_started');
const _construct_time = Symbol('_construct_time');
const _step_cache = Symbol('_step_cache');

class Bluespess extends EventEmitter {
	constructor() {
		super();
		this.components = {};
		this.templates = {};
		this.clients = {};
		this.dc_mobs = {};
		this.atoms = new Map();
		this.atoms_for_components = {};
		this[_locations] = new Map();

		// Import default modules
		this.importModule(require('./atom/mob.js'));
		this.importModule(require('./atom/lighting.js'));
		this.importModule(require('./atom/hearer.js'));

		this.net_tick_delay = 50;

		this[_is_server_started] = false;
		this[_construct_time] = process.hrtime();
	}

	get is_server_started() {return this[_is_server_started];}

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
		if(mod.templates) {
			for(var templateName in mod.templates) {
				if(!mod.templates.hasOwnProperty(templateName))
					continue;
				if(this.templates[templateName])
					throw new Error(`Template ${templateName} already exists!`);
				var template = mod.templates[templateName];

				this.templates[templateName] = template;
			}
		}
		if(mod.now instanceof Function) {
			mod.now(this);
		}
		if(mod.server_start instanceof Function) {
			if(this.is_server_started)
				mod.server_start(this);
			else
				this.on('server_start', mod.server_start);
		}
	}

	location(x,y,z) {
		if(x !== +x || y !== +y || z !== +z) { // OI THERE NUMBERS only
			// This will catch them being not numbers, and also them being NaN
			throw new TypeError(`Invalid location: ${x},${y},${z}`);
		}
		x = Math.round(x)|0;y = Math.round(y)|0;z = Math.floor(z)|0;
		var id = `${x},${y},${z}`;
		var loc = this[_locations].get(id);
		if(loc) {
			return loc;
		}
		loc = new Location(x,y,z, this);
		this[_locations].set(id, loc);
		return loc;
	}

	startServer(opts) {
		if(global.is_bs_editor_env)
			throw new Error("Server should not be started in editor mode");
		this.wss = new WebSocket.Server(opts.websocket);

		this.wss.on('connection', (ws) => {
			new InitialHandler(this, ws);
		});

		setTimeout(this[_net_tick].bind(this), this.net_tick_delay);

		this[_is_server_started] = true;
		this.emit('server_start', this);
	}

	login(socket, username) {
		if(this.clients[username] && this.clients[username].socket) {
			var mob = this.clients[username].mob;
			this.clients[username].mob = null;
			this.clients[username].socket.close();
			delete this.clients[username];
			if(mob)
				mob.c.Mob.key = username;
		}
		var client = new Client(socket, username, this);
		this.clients[username] = client;
	}

	[_net_tick]() {
		for(let key in this.clients) {
			if(!this.clients.hasOwnProperty(key))
				continue;
			let client = this.clients[key];
			client.send_network_updates();
		}
		setTimeout(this[_net_tick].bind(this), this.net_tick_delay);
	}

	has_component(atom, name) {
		return atom && (atom instanceof Atom) && !!atom.components[name];
	}

	is_atom(atom) {
		return atom && (atom instanceof Atom);
	}

	turn_dir(dir, angle) {
		dir = dir & 15;
		angle = ((angle % 360 + 360) % 360);
		return [ // woo lookup table time
			[0, 1, 2 ,3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15],
			[0, 5,10,15, 6, 4, 2,15, 9, 1, 8,15,15,15,15,15],
			[0, 4, 8,12, 2, 6,10,14, 1, 5, 9,13, 3, 7,11,15],
			[0, 6, 9,15,10, 2, 8,15, 5, 4, 1,15,15,15,15,15],
			[0, 2, 1, 3, 8,10, 9,11, 4, 6, 5, 7,12,14,13,15],
			[0,10, 5,15, 9, 8, 1,15, 6, 2, 4,15,15,15,15,15],
			[0, 8, 4,12, 1, 9, 5,13, 2,10, 6,14, 3,11, 7,15],
			[0, 9, 6,15, 5, 1, 4,15,10, 8, 2,15,15,15,15,15]
		][Math.floor(angle / 90) * 2 + ((angle % 90) == 0 ? 0 : 1)][dir];
	}

	compute_inrange_tiles(atom, dist) {
		var inrange_tiles = new Set();
		if(atom.base_loc == null) return inrange_tiles;
		for(var x = Math.floor(atom.x + .00001 - dist); x <= Math.ceil(atom.x - .00001 + dist); x++) {
			for(var y = Math.floor(atom.y + .00001 - dist); y <= Math.ceil(atom.y - .00001 + dist); y++) {
				inrange_tiles.add(this.location(x, y, atom.z));
			}
		}
		return inrange_tiles;
	}

	compute_visible_tiles(atom, dist) {
		if(atom.base_loc == null)
			return new Set();
		var ring_tiles = [];
		var base_x = atom.x;
		var base_y = atom.y;
		var base_z = atom.z;
		for(let i = 1; i <= (dist*2); i++) {
			for(let j = Math.max(i-dist, 0); j < i - Math.max((i-dist-1), 0); j++) {
				ring_tiles.push(this.location(base_x + i - j, base_y + j, base_z));
				ring_tiles.push(this.location(base_x - j, base_y + i - j, base_z));
				ring_tiles.push(this.location(base_x - i + j, base_y - j, base_z));
				ring_tiles.push(this.location(base_x + j, base_y - i + j, base_z));
			}
		}
		var visible_tiles = new Set(ring_tiles);
		visible_tiles.add(atom.base_loc);
		var used_tiles = new Set();
		for(var tile of ring_tiles) {
			if(used_tiles.has(tile))
				continue;
			let dx = tile.x - base_x;
			let dy = tile.y - base_y;
			if(!tile.opacity)
				continue;
			if(tile.y != base_y) {
				let left = base_x;
				let right = base_x;
				let iter_tile = tile;
				while(iter_tile.opacity && iter_tile.x >= base_x - dist) {
					left = iter_tile.x;
					//used_tiles.add(iter_tile);
					iter_tile = iter_tile.get_step(8);
				}
				iter_tile = tile;
				while(iter_tile.opacity && iter_tile.x <= base_x + dist) {
					right = iter_tile.x;
					//used_tiles.add(iter_tile);
					iter_tile = iter_tile.get_step(4);
				}
				let vdir = tile.y > base_y ? 1 : -1;
				let left_dx = (left - base_x) / Math.abs(dy);
				let right_dx = (right - base_x) / Math.abs(dy);
				for(let y = tile.y; Math.abs(y - base_y) <= dist; y += vdir) {
					if(y != tile.y) {
						for(let x = Math.ceil(left); x <= Math.floor(right); x++) {
							visible_tiles.delete(this.location(x, y, base_z));
						}
					}
					left += left_dx;
					right += right_dx;
				}
			}

			if(tile.x != base_x) {
				let down = base_y;
				let up = base_y;
				let iter_tile = tile;
				while(iter_tile.opacity && iter_tile.y >= base_y - dist) {
					down = iter_tile.y;
					used_tiles.add(iter_tile);
					iter_tile = iter_tile.get_step(2);
				}
				iter_tile = tile;
				while(iter_tile.opacity && iter_tile.y <= base_y + dist) {
					up = iter_tile.y;
					used_tiles.add(iter_tile);
					iter_tile = iter_tile.get_step(1);
				}
				let hdir = tile.x > base_x ? 1 : -1;
				let down_dy = (down - base_y) / Math.abs(dx);
				let up_dy = (up - base_y) / Math.abs(dx);
				for(let x = tile.x; Math.abs(x - base_x) <= dist; x += hdir) {
					if(x != tile.x) {
						for(let y = Math.ceil(down); y <= Math.floor(up); y++) {
							visible_tiles.delete(this.location(x, y, base_z));
						}
					}
					down += down_dy;
					up += up_dy;
				}
			}
		}
		return visible_tiles;
	}

	process_template(template) {
		if(template[_is_template_processed])
			return;
		if(template.components) {
			// Ensure all the component dependencies are added.
			var hasAddedDependencies = true;
			while(hasAddedDependencies) {
				hasAddedDependencies = false;
				for(let componentName of template.components) {
					let component = this.components[componentName];
					if(component == null)
						throw new Error(`Component ${componentName} does not exist!`);
					if(component.depends)
						for(var depends of component.depends) {
							if(!template.components.includes(depends)) {
								template.components.push(depends);
								hasAddedDependencies = true;
							}
						}
				}
			}
			// Sort the dependencies.
			var edges = [];
			for(let componentName of template.components) {
				let component = this.components[componentName];
				if(component.loadAfter)
					for(var after of component.loadAfter) {
						if(template.components.includes(after))
							edges.push([componentName, after]);
					}
				if(component.loadBefore)
					for(var before of component.loadBefore) {
						if(template.components.includes(before))
							edges.push([before,componentName]);
					}
			}
			template.components = toposort.array(template.components, edges);

			// Iterate backwards over the list so that the last loaded component gets priority over the default values.
			// Apply the default values in those components behind this template.
			for(var i = template.components.length - 1; i >= 0; i--) {
				var componentName = template.components[i];
				var component = this.components[componentName];
				if(component.template)
					weakDeepAssign(template, component.template);
			}
		}

		template.vars = template.vars || {};
		template.vars.layer = template.vars.layer || 0;

		template[_is_template_processed] = true;
	}

	// setImmediate in promise form basically.
	stoplag() {
		return new Promise((resolve) => {
			setImmediate(resolve);
		});
	}

	sleep(time = 0) {
		return new Promise((resolve) => {
			setTimeout(resolve, time);
		});
	}

	now() {
		var hr = process.hrtime(this[_construct_time]);
		return hr[0]*1000 + hr[1]*.000001;
	}

	visible_message(a, ...b) {
		if(typeof a == "string") {
			return new ChatMessage("see", a, this);
		}
		return this.visible_message(this.format_html(a, ...b));
	}

	audible_message(a, ...b) {
		if(typeof a == "string") {
			return new ChatMessage("hear", a, this);
		}
		return this.audible_message(this.format_html(a, ...b));
	}

	to_chat(a, ...b) {
		if(a instanceof Atom || a instanceof Client) {
			var cl;
			if(a instanceof Client)
				cl = a;
			else
				cl = a.c.Mob.client;
			if(!cl)
				return;
			if(!cl.next_message.to_chat)
				cl.next_message.to_chat = [];
			cl.next_message.to_chat.push(b.join(""));
		} else if(a instanceof Array && a.length && (a[0] instanceof Atom || a[0] instanceof Client || a[0] instanceof Array)) {
			for(var item of a) {
				this.to_chat(item, ...b);
			}
		} else {
			var formatted = this.format_html(a, ...b);
			return (...items) => {
				this.to_chat(items, formatted);
			};
		}
	}

	format_html(strs, ...tags) {
		var out_str = '';
		for(let i = 0; i < strs.length; i++) {
			var pre_tag = strs[i];
			if(i == strs.length - 1) {
				out_str += pre_tag;
				continue;
			}
			var str_tag = ""+tags[i];
			var is_proper = str_tag.length && str_tag[0] == str_tag[0].toUpperCase();
			var gender = "neutral";
			if(tags[i] instanceof Atom) {
				if(tags[i].force_improper)
					is_proper = false;
				if(tags[i].force_proper)
					is_proper = true;
				gender = tags[i].gender;
			}
			if(is_proper)
				pre_tag = pre_tag.replace(/(^|[ \t.,>])(?:the|a) (?=(?:[ \t]|(?:<[^>]+>))*$)/i, "$1");
			else if(gender == "plural")
				pre_tag = pre_tag.replace(/((?:^|[ \t.,>]))a(?= (?:[ \t]|(?:<[^>]+>))*$)/i, "$1some");
			else if(str_tag.match(/^[aeiou]/i))
				pre_tag = pre_tag.replace(/((?:^|[ \t.,>])a)(?= (?:[ \t]|(?:<[^>]+>))*$)/i, "$1n");
			tags[i] = ""+tags[i];
			out_str += pre_tag;
			out_str += this.escape_html(tags[i]);
		}
		return out_str;
	}

	escape_html(str) {
		return str.replace(/[&<>"']/gi, (chr) => {
			if(chr == '&') return '&amp;';
			if(chr == '<') return '&lt;';
			if(chr == '>') return '&gt;';
			if(chr == '"') return '&quot;';
			if(chr == "'") return '&#039;';
		});
	}

	instance_map(obj, x = 0, y = 0, z = 0) {
		for(var loc in obj.locs) {
			if(!obj.locs.hasOwnProperty(loc))
				continue;
			for(var instobj of obj.locs[loc]) {
				var template = {};
				var base_template = this.templates[instobj.template_name];
				if(instobj.instance_vars) {
					template.vars = JSON.parse(JSON.stringify(instobj.instance_vars));
				} else {
					template.vars = {};
				}
				if(base_template.variants && base_template.variants.length) {
					if(!instobj.variant_leaf_path)
						instobj.variant_leaf_path = [];
					instobj.variant_leaf_path.length = base_template.variants.length;
					for(var i = 0; i < base_template.variants.length; i++) {
						var variant = base_template.variants[i];
						if(variant.type == "single") {
							var idx = variant.values.indexOf(instobj.variant_leaf_path[i]);
							if(idx == -1 || instobj.variant_leaf_path.length <= i) {
								idx = 0;
							}
							var curr_obj = template.vars;
							for(var j = 0; j < variant.var_path.length - 1; j++) {
								var next_obj = curr_obj[variant.var_path[j]];
								if(typeof next_obj != "object" || (next_obj instanceof Array)) {
									next_obj = {};
									curr_obj[variant.var_path[j]] = next_obj;
								}
								curr_obj = next_obj;
							}
							if(curr_obj && !curr_obj.hasOwnProperty(variant.var_path[variant.var_path.length - 1]))
								curr_obj[variant.var_path[variant.var_path.length - 1]] = variant.values[idx];
						}
					}
				}
				weakDeepAssign(template, this.templates[instobj.template_name]);
				new Atom(this, template, x + instobj.x, y + instobj.y, z);
			}
		}
	}
}

class Location {
	constructor(x,y,z, server) {
		// Define these so that they can't be changed.
		Object.defineProperty(this, 'x', {enumerable: true,configurable: false,writable: false,value: x});
		Object.defineProperty(this, 'y', {enumerable: true,configurable: false,writable: false,value: y});
		Object.defineProperty(this, 'z', {enumerable: true,configurable: false,writable: false,value: z});

		Object.defineProperty(this, 'is_base_loc', {enumerable: false,configurable: false, writable: false, value: true});
		// Atoms partially in this location
		Object.defineProperty(this, 'partial_contents', {enumerable: true,configurable: false, writable: false, value: []});
		Object.defineProperty(this, 'contents', {enumerable: true,configurable: false, writable: false, value: []});
		Object.defineProperty(this, 'viewers', {enumerable: true,configurable: false, writable: false, value: []});
		Object.defineProperty(this, 'hearers', {enumerable: true, configurable: false, writable: false, value: []});

		Object.defineProperty(this, 'server', {enumerable: false,configurable: false, writable: false, value: server});
		this[_step_cache] = new Array(16);
	}

	get_step(dir) {
		if ((dir & 3) == 3) dir &= ~3;
		if((dir & 12) == 12) dir &= ~12;
		var cached = this[_step_cache][dir];
		if(cached)
			return cached;
		var newx = this.x;
		var newy = this.y;
		if(dir & 1)
			newy++;
		if(dir & 2)
			newy--;
		if(dir & 4)
			newx++;
		if(dir & 8)
			newx--;
		return this[_step_cache][dir] = this.server.location(newx,newy,this.z);
	}

	get opacity() {
		for(var atom of this.partial_contents)
			if(atom.opacity && atom.does_enclose_tile(this))
				return atom.opacity;
		return false;
	}

	* recursive_contents() {
		for(var item of this.contents) {
			yield item;
			yield* item.recursive_contents();
		}
	}
}

EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners, 50);

Bluespess.Atom = Atom;
Bluespess.Component = Component;
Bluespess.chain_func = chain_func;
Bluespess.Panel = Panel;

module.exports = Bluespess;
