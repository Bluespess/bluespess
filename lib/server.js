'use strict';
const WebSocket = require('ws');
const EventEmitter = require('events');
const toposort = require('toposort');
const Client = require('./client.js');
const Atom = require('./atom/atom.js');
const Component = require('./atom/component.js');
const Panel = require('./panel.js');
const Sound = require('./sound.js');
const utils = require('./utils.js');
const VisibilityGroup = require('./atom/visgroup.js');
const Dimension = require('./dimension.js');

const _net_tick = Symbol('_net_tick');
const _is_template_processed = Symbol('_is_template_processed');
const _is_server_started = Symbol('_is_server_started');
const _construct_time = Symbol('_construct_time');

/**
 * @alias Bluespess
 * @example
 * const Bluespess = require('bluespess');
 *
 * let server = new Bluespess();
 */
class Bluespess extends EventEmitter {
	constructor() {
		super();
		this.components = {};
		this.templates = {};
		/**
		 * An object containing all the clients by their key
		 * @type {Object<string,Client>}
		 */
		this.clients = {};
		/**
		 * An object containing all the clients by their display name
		 * @type {Object<string,Client>}
		 */
		this.clients_by_name = {};
		/**
		 * An object containing mobs with keys but no client
		 * @type {Object<string,Bluespess.Atom<Mob>>}
		 */
		this.dc_mobs = {};
		this.atoms = new Map();
		/**
		 * An object containing lists of atoms for each component type
		 * @type {Object<string,Set<Bluespess.Atom>>}
		 */
		this.atoms_for_components = {};
		/**
		 * A writable stream for the demo file being written to
		 * @type {WritableStream}
		 */
		this.demo_stream = null;

		// Import default modules
		this.importModule(require('./atom/mob.js'));
		this.importModule(require('./atom/lighting.js'));
		this.importModule(require('./atom/hearer.js'));

		this.net_tick_delay = 50;

		this[_is_server_started] = false;
		this[_construct_time] = process.hrtime();
	}

	/**
	 * True if the server has been started.
	 * @type {boolean}
	 */
	get is_server_started() {return this[_is_server_started];}

	/**
	 * Imports a module into the server code.
	 * @param {Object} mod
	 * @param {Object} [mod.components] An object containing the component constructors you want to import
	 * @param {Object} [mod.templates] An object containing the templates you want to import
	 * @param {Function} [mod.now] A callback which is called immediately with an instance of this server object
	 * @param {Function} [mod.server_start] A callback which is called when the server starts (or now if it already has) with an instance of this server object
	 */
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



	/**
	 * Starts the server.
	 * @param {Object} opts
	 * @param {Object} opts.websocket The parameters passed to the websocket server
	 * @param {Object} opts.demo_stream A stream (probably to a file) to log network updates to
	 */
	startServer({websocket, demo_stream} = {}) {
		if(global.is_bs_editor_env)
			throw new Error("Server should not be started in editor mode");
		this.wss = new WebSocket.Server(websocket);

		this.wss.on('connection', (ws) => {
			ws.on('error', (err) => {
				console.error(err);
			});
			this.handle_login(ws);
		});

		setTimeout(this[_net_tick].bind(this), this.net_tick_delay);

		if(demo_stream)
			this.demo_stream = demo_stream;

		this[_is_server_started] = true;
		this.emit('server_start', this);
	}

	/**
	 * Handles login.
	 * @param {WebSocket} ws The websocket
	 * @abstract
	 */
	handle_login(ws) {
		let handle_message = (data) => {
			var obj = JSON.parse(data);

			if(obj.login) {
				let username = obj.login+"";
				ws.removeListener("message", handle_message);
				this.login(ws, username);
			}
		};
		ws.on("message", handle_message);
		ws.send(JSON.stringify({login_type:"debug"}));
	}

	/**
	 * Creates a client with the given parameters
	 * @param {WebSocket} socket The websocket
	 * @param {String|number} key The unique key string identifying the client.
	 * @param {String} name The name to display for the client
	 * @returns {Client}
	 */
	login(socket, username, name) {
		if(this.clients[username] && this.clients[username].socket) {
			var mob = this.clients[username].mob;
			this.clients[username].mob = null;
			this.clients[username].socket.close();
			delete this.clients[username];
			if(mob)
				mob.c.Mob.key = username;
		}
		var client = new Client(socket, username, this, name);
		this.clients[username] = client;
		this.clients_by_name[client.name] = client;
		return client;
	}

	[_net_tick]() {
		for(let key in this.clients) {
			if(!this.clients.hasOwnProperty(key))
				continue;
			let client = this.clients[key];
			client.send_network_updates();
		}
		this.emit("post_net_tick");
		setTimeout(this[_net_tick].bind(this), this.net_tick_delay);
	}

	/**
	 * @param {Bluespess.Atom|Location} origin The origin
	 * @param {number} dist The radius to go out
	 * @returns {Set<Location>} A set of tiles a given distance away from the origin
	 */
	compute_inrange_tiles(atom, dist) {
		var inrange_tiles = new Set();
		if(atom.base_loc == null) return inrange_tiles;
		for(var x = Math.floor(atom.x + .00001 - dist); x <= Math.ceil(atom.x - .00001 + dist); x++) {
			for(var y = Math.floor(atom.y + .00001 - dist); y <= Math.ceil(atom.y - .00001 + dist); y++) {
				inrange_tiles.add(atom.dim.location(x, y, atom.z));
			}
		}
		return inrange_tiles;
	}

	/**
	 * @param {Bluespess.Atom|Location} origin The origin
	 * @param {number} dist The radius to go out
	 * @returns {Set<Location>} A set of tiles a given distance away from the origin that are visible to the origin (not blocked by opaque atoms)
	 */
	compute_visible_tiles(atom, dist) {
		if(atom.base_loc == null)
			return new Set();
		var ring_tiles = [];
		var base_x = Math.round(atom.x);
		var base_y = Math.round(atom.y);
		var base_z = Math.floor(atom.z);
		for(let i = 1; i <= (dist*2); i++) {
			for(let j = Math.max(i-dist, 0); j < i - Math.max((i-dist-1), 0); j++) {
				ring_tiles.push(atom.dim.location(base_x + i - j, base_y + j, base_z));
				ring_tiles.push(atom.dim.location(base_x - j, base_y + i - j, base_z));
				ring_tiles.push(atom.dim.location(base_x - i + j, base_y - j, base_z));
				ring_tiles.push(atom.dim.location(base_x + j, base_y - i + j, base_z));
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
							visible_tiles.delete(atom.dim.location(x, y, base_z));
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
							visible_tiles.delete(atom.dim.location(x, y, base_z));
						}
					}
					down += down_dy;
					up += up_dy;
				}
			}
		}
		return visible_tiles;
	}

	/**
	 * Returns a precise timestamp, in milliseconds, since the server was constructed.
	 * This timestamp is sent to clients periodically.
	 * @returns {number} The timestamp
	 */
	now() {
		var hr = process.hrtime(this[_construct_time]);
		return hr[0]*1000 + hr[1]*.000001;
	}

	/**
	 * Processes a template, sorting out all the dependencies and applying default values.
	 * Usually called internally.
	 * @param {template} template
	 */
	process_template(template) {
		if(template[_is_template_processed])
			return;
		if(template.parent_template) {
			if(typeof template.parent_template == "string") {
				let ptemplate = this.templates[template.parent_template];
				this.process_template(ptemplate);
				utils.weak_deep_assign(template, ptemplate);
			} else if(template.parent_template instanceof Array) {
				for(let i = template.parent_template.length - 1; i >= 0; i--) {
					let ptemplate = this.templates[template.parent_template[i]];
					this.process_template(ptemplate);
					utils.weak_deep_assign(template, ptemplate);
				}
			}
		}
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
					utils.weak_deep_assign(template, component.template);
			}
		}

		template.vars = template.vars || {};
		template.vars.layer = template.vars.layer || 0;

		if(!template.is_variant && template.variants && template.variants.length) {
			for(let i = 0; i < template.variants.length; i++) {
				let variant = template.variants[i];
				if(variant.type == "single") {
					let curr_obj = template.vars;
					for(let j = 0; j < variant.var_path.length - 1; j++) {
						let next_obj = curr_obj[variant.var_path[j]];
						if(typeof next_obj != "object" || (next_obj instanceof Array)) {
							next_obj = {};
							curr_obj[variant.var_path[j]] = next_obj;
						}
						curr_obj = next_obj;
					}
					if(curr_obj)
						curr_obj[variant.var_path[variant.var_path.length - 1]] = variant.values[0];
				}
			}
		}

		template[_is_template_processed] = true;
	}

	/**
	 * Extends the template with the given variant.
	 * @param {template} template
	 * @param {Array} variant_leaf_path
	 */
	get_template_variant(template, variant_leaf_path, instance_vars) {
		if(!instance_vars && (!variant_leaf_path || variant_leaf_path.length == 0))
			return template;
		template = utils.weak_deep_assign({}, template);
		instance_vars = instance_vars ? JSON.parse(JSON.stringify(instance_vars)) : null;
		this.process_template(template);
		template.is_variant = true;
		if(template.variants && template.variants.length) {
			if(!variant_leaf_path)
				variant_leaf_path = [];
			variant_leaf_path.length = template.variants.length;
			for(var i = 0; i < template.variants.length; i++) {
				var variant = template.variants[i];
				if(variant.type == "single") {
					var idx = variant.values.indexOf(variant_leaf_path[i]);
					if(idx == -1 || variant_leaf_path.length <= i) {
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
					if(curr_obj)
						curr_obj[variant.var_path[variant.var_path.length - 1]] = variant.values[idx];
				}
			}
		}
		if(instance_vars) {
			utils.weak_deep_assign(instance_vars, template.vars);
			template.vars = instance_vars;
		}
		return template;
	}

	/**
	 * Instances a map, like {@link instance_map}, but synchronous, and no callback for percentage.
	 * @param {Object} obj Parsed JSON object representing the map
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	instance_map_sync(obj, x = 0, y = 0, z = 0, dim) {
		let inst_list = [];
		for(var loc in obj.locs) {
			if(!obj.locs.hasOwnProperty(loc))
				continue;
			for(var instobj of obj.locs[loc]) {
				let base_template = this.templates[instobj.template_name];
				if(!base_template) {
					console.warn(`Map references unknown template "${instobj.template_name}"`);
					continue;
				}
				let template = this.get_template_variant(base_template, instobj.variant_leaf_path, instobj.instance_vars);
				utils.weak_deep_assign(template, base_template);
				let atom = new Atom(this, template, x + instobj.x, y + instobj.y, z, dim);
				atom.emit("map_instanced", obj);
				inst_list.push(atom);
			}
		}
		for(let i = 0; i < inst_list.length; i++) {
			inst_list[i].emit("map_instance_done", obj);
		}
	}

	/**
	 * Instances a map
	 * @param {Object} obj Parsed JSON object representing the map
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @param {Function} [percentage_callback] A callback that is called periodically with a number 0 to 1 denoting how far along the instancing process is done.
	 */
	async instance_map(obj, x = 0, y = 0, z = 0, dim, percentage_callback) {
		let locs = [...Object.values(obj.locs)];
		let inst_list = [];
		let idx = 0;
		for(let loc of locs) {
			idx++;
			for(let instobj of loc) {
				let base_template = this.templates[instobj.template_name];
				if(!base_template) {
					console.warn(`Map references unknown template "${instobj.template_name}"`);
					continue;
				}
				let template = this.get_template_variant(base_template, instobj.variant_leaf_path, instobj.instance_vars);
				utils.weak_deep_assign(template, base_template);
				let atom = new Atom(this, template, x + instobj.x, y + instobj.y, z, dim);
				atom.emit("map_instanced", obj);
				inst_list.push(atom);
			}
			if(percentage_callback) {
				percentage_callback(idx / locs.length);
			}
			await utils.stoplag();
		}
		for(let i = 0; i < inst_list.length; i++) {
			inst_list[i].emit("map_instance_done", obj);
		}
	}
}

EventEmitter.defaultMaxListeners = Math.max(EventEmitter.defaultMaxListeners, 50);

Bluespess.Atom = Atom;
Bluespess.Component = Component;

utils.do_require();

Bluespess.weak_deep_assign = utils.weak_deep_assign;
Bluespess.deep_create = utils.deep_create;
Bluespess.chain_func = utils.chain_func;
Bluespess.make_watched_property = utils.make_watched_property;
Bluespess.has_component = utils.has_component;
Bluespess.is_atom = utils.is_atom;
Bluespess.turn_dir = utils.turn_dir;
Bluespess.dir_dx = utils.dir_dx;
Bluespess.dir_dy = utils.dir_dy;
Bluespess.dir_to = utils.dir_to;
Bluespess.stoplag = utils.stoplag;
Bluespess.sleep = utils.sleep;
Bluespess.visible_message = utils.visible_message;
Bluespess.audible_message = utils.audible_message;
Bluespess.to_chat = utils.to_chat;
Bluespess.format_html = utils.format_html;
Bluespess.escape_html = utils.escape_html;
Bluespess.NORTH = utils.NORTH;
Bluespess.SOUTH = utils.SOUTH;
Bluespess.EAST = utils.EAST;
Bluespess.WEST = utils.WEST;
Bluespess.readonly_traps = utils.readonly_traps;

Bluespess.Panel = Panel;
Bluespess.Sound = Sound;
Bluespess.VisibilityGroup = VisibilityGroup;
Bluespess.Dimension = Dimension;

module.exports = Bluespess;
