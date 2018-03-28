'use strict';
const EventEmitter = require('events');
const mob_symbols = require('./mob.js')._symbols;
const {has_component} = require('../utils.js');

var id_counter = 0;

const _loc = Symbol('_loc');
const _x = Symbol('_x');
const _y = Symbol('_y');
const _z = Symbol('_z');
const _bounds_x = Symbol('_bounds_x');
const _bounds_y = Symbol('_bounds_y');
const _bounds_width = Symbol('_bounds_width');
const _bounds_height = Symbol('_bounds_height');
const _crosses = Symbol('_crosses');

const _walking = Symbol('_walking');
const _walk_stepping = Symbol('_walk_stepping');
const _walk_step = Symbol('_walk_step');

const _icon = Symbol('_icon');
const _icon_state = Symbol('_icon_state');
const _dir = Symbol('_dir');
const _layer = Symbol('_layer');
const _name = Symbol('_name');
const _glide_size = Symbol('_glide_size');
const _screen_loc_x = Symbol('_screen_loc_x');
const _screen_loc_y = Symbol('_screen_loc_y');
const _mouse_opacity = Symbol('_mouse_opacity');
const _flick = Symbol('_flick');
const _color = Symbol('_color');
const _alpha = Symbol('_alpha');
const _visible = Symbol('_visible');

const _opacity = Symbol('_opacity');

const _changeloc = Symbol('_changeloc');
const _emit_parent_move = Symbol('_emit_parent_move');

class Atom extends EventEmitter {
	constructor(server, template, x, y, z) {
		if(typeof template == "string")
			template = server.templates[template];
		if(template && template.pick_from) {
			template = template.pick_from[Math.floor(Math.random() * template.pick_from.length)];
			if(typeof template == "string")
				template = server.templates[template];
		}
		if(template && template.use_random_variant && !template.is_variant && template.variants && template.variants.length) {
			let new_variant_leaf_path = new Array(template.variants.length);
			for(let i = 0; i < template.variants.length; i++) {
				let variant = template.variants[i];
				if(variant.type == "single") {
					new_variant_leaf_path[i] = variant.values[Math.floor(Math.random() * variant.values.length)];
				}
			}
			template = server.get_template_variant(template, new_variant_leaf_path);
		}

		if(!server || !template)
			throw new Error(`Invalid arguments while instantiating: server: ${server}, template: ${template}`);
		super();

		this.template = template;

		Object.defineProperty(this, 'server', {enumerable: false,configurable: false,writable: false,value: server});
		Object.defineProperty(this, 'object_id', {enumerable: true,configurable: false,writable: false,value: `ID_${id_counter++}`});
		Object.defineProperty(this, 'contents', {enumerable: true,configurable: false,writable: false,value: []});

		this[_name] = "object";
		this[_glide_size] = 10;
		this[_layer] = 0;
		this[_dir] = 2;
		this.gender = "neutral";

		this[_crosses] = [];

		this.server.process_template(template);
		server.atoms.set(this.object_id, this);

		this[_bounds_x] = 0;
		this[_bounds_y] = 0;
		this[_bounds_width] = 1;
		this[_bounds_height] = 1;
		this[mob_symbols._viewers] = [];
		this[mob_symbols._visgroups] = [];

		this.density = 0;
		this.pass_flags = 0;
		this.let_pass_flags = 0;
		this[_opacity] = false;
		this[_visible] = true;

		this[_walking] = false;
		this[_walk_stepping] = false;
		this.walk_dir = 0;
		this.walk_size = 1;
		this.walk_delay = 150;
		this.walk_reason = "walking";

		if(template.vars) {
			for(var key in template.vars) {
				if(!template.vars.hasOwnProperty(key) || key == "appearance" || key == "components" || key == "overlays")
					continue;
				this[key] = template.vars[key];
			}
		}

		if(template.vars && template.vars.appearance)
			Object.assign(this, template.vars.appearance);

		this.overlays = new Proxy({}, {
			set: (target, key, value) => {
				if(value === undefined || value === null) {
					target[key] = undefined;
					this[mob_symbols._update_var](key, 2);
					return true;
				}
				if((typeof value) == "string")
					value = {"icon_state": value, "overlay_layer": 1};
				if(value instanceof Atom)
					value = value.appearance;
				if(typeof value != "object")
					throw new TypeError(`Object or string expected for overlay. Got ${value} instead.`);
				value = new Proxy(Object.assign({}, value), {
					set: (target2, key2, value2) => {
						target2[key2] = value2;
						this[mob_symbols._update_var](key, 2);
						return true;
					}
				});
				target[key] = value;
				this[mob_symbols._update_var](key, 2);
				return true;
			}
		});

		this.components = {};
		if(template.components) {
			for(let i = 0; i < template.components.length; i++) {
				let componentName = template.components[i];
				if(this.components[componentName])
					throw new Error(`Template '${template.id}' defines component '${componentName}' multiple times`);
				let componentConstructor = this.server.components[componentName];
				if(!componentConstructor)
					throw new Error(`Template '${template.id}' references non-existent component '${componentName}'`);
				let templateVars = template.vars && template.vars.components && template.vars.components[componentName] ? template.vars.components[componentName] : {};
				this.components[componentName] = new this.server.components[componentName](this, templateVars);
			}
		}

		if(typeof x === "number") {
			x = +x;
			y = +y;
			z = +z;
			if(x !== x) x = 0;
			if(y !== y) y = 0;
			if(z !== z) z = 0;
			z = Math.floor(z);

			this[_changeloc](x, y, z, this.server.location(x,y,z));
		} else if(typeof x === "object" && x !== null) {
			if(x.is_base_loc) {
				this[_changeloc](x.x, x.y, x.z, x);
			} else {
				this[_changeloc](0, 0, 0, x);
			}
		} else {
			this[_changeloc](0, 0, 0, undefined);
		}
	}

	get c() {
		return this.components;
	}

	[_changeloc](newX, newY, newZ = this[_z], newLoc, newBounds_x, newBounds_y, newBounds_width, newBounds_height) {
		if(newLoc && !newLoc.is_base_loc && this[_loc] && !this[_loc].is_base_loc && newLoc == this[_loc])
			return;
		var old_fine_loc = this.fine_loc;
		var new_fine_loc = {x:newX, y:newY, z:newZ, loc:newLoc, is_fine_loc: true};
		var movement = {old: old_fine_loc, new: new_fine_loc};
		if(old_fine_loc.loc && old_fine_loc.loc.is_base_loc && new_fine_loc.loc && new_fine_loc.loc.is_base_loc) {
			movement.offset = {};
			movement.offset.x = new_fine_loc.x - old_fine_loc.x;
			movement.offset.y = new_fine_loc.y - old_fine_loc.y;
			movement.offset.z = new_fine_loc.z - old_fine_loc.z;
		}
		movement.atom = this;
		this.emit('before_move', movement);
		if(old_fine_loc.loc && old_fine_loc.loc.emit) {
			old_fine_loc.loc.emit('before_exit', movement);
		}
		if(new_fine_loc.loc && new_fine_loc.loc.emit) {
			new_fine_loc.loc.emit('before_enter', movement);
		}
		if(newLoc && !newLoc.is_base_loc && this.loc && !this.loc.is_base_loc && newLoc == this.loc)
			return;
		old_fine_loc = this.fine_loc;
		movement.old = old_fine_loc;
		if(old_fine_loc.loc && old_fine_loc.loc.is_base_loc && new_fine_loc.loc && new_fine_loc.loc.is_base_loc) {
			movement.offset = {};
			movement.offset.x = new_fine_loc.x - old_fine_loc.x;
			movement.offset.y = new_fine_loc.y - old_fine_loc.y;
			movement.offset.z = new_fine_loc.z - old_fine_loc.z;
		}
		// Test for cycles, but don't bother if the new location is in the world
		if (newLoc && !newLoc.is_base_loc) {
			let slowPointer = newLoc;
			let fastPointer = newLoc;
			while(slowPointer != null) {
				slowPointer = slowPointer[_loc];
				if(fastPointer)
					fastPointer = fastPointer[_loc];
				if(fastPointer)
					fastPointer = fastPointer[_loc];
				if((fastPointer && fastPointer == slowPointer) || fastPointer == this || slowPointer == this)
					throw new Error(`Cycle detected when assigning the location of ${this} to ${newLoc}`);
			}
		}

		var lost_viewers = [];
		var gained_viewers = [];

		var lost_crossers = [];
		var gained_crossers = [];
		var common_crossers = [];

		if(this[_loc]) {
			if(this[_loc].contents) {
				let idx = this[_loc].contents.indexOf(this);
				if(idx != -1)
					this[_loc].contents.splice(idx, 1);
			}
			if(this[_loc].is_base_loc) {
				for(let x = Math.floor(this[_x]+this[_bounds_x]+0.00001); x < Math.ceil(this[_x]+this[_bounds_x]+this[_bounds_width]-0.00001); x++) {
					for(let y = Math.floor(this[_y]+this[_bounds_y]+0.00001); y < Math.ceil(this[_y]+this[_bounds_y]+this[_bounds_height]-0.00001); y++) {
						let thisloc = this.server.location(x,y,this[_z]);
						let idx = thisloc.partial_contents.indexOf(this);
						if(idx != -1)
							thisloc.partial_contents.splice(idx, 1);
						thisloc.viewers.forEach((item) => {lost_viewers.push(item);});
						for(let atom of thisloc.partial_contents) {
							if(atom != this && atom.does_cross(this)) {
								if(!lost_crossers.includes(atom))
									lost_crossers.push(atom);
							}
						}
					}
				}
			}
		}

		this[_x] = newX;
		this[_y] = newY;
		this[_z] = newZ;
		this[_loc] = newLoc;
		if(newBounds_x !== undefined) {
			this[_bounds_x] = newBounds_x;
			this[_bounds_y] = newBounds_y;
			this[_bounds_width] = newBounds_width;
			this[_bounds_height] = newBounds_height;
		}

		this[_crosses].length = 0;

		if(this[_loc]) {
			if(this[_loc].contents) {
				this[_loc].contents.push(this);
			}
			if(this[_loc].is_base_loc) {
				for(let x = Math.floor(this[_x]+this[_bounds_x]+0.00001); x < Math.ceil(this[_x]+this[_bounds_x]+this[_bounds_width]-0.00001); x++) {
					for(let y = Math.floor(this[_y]+this[_bounds_y]+0.00001); y < Math.ceil(this[_y]+this[_bounds_y]+this[_bounds_height]-0.00001); y++) {
						let thisloc = this.server.location(x,y,this[_z]);
						if(!thisloc.partial_contents.includes(this))
							thisloc.partial_contents.push(this);
						thisloc.viewers.forEach((item) => {gained_viewers.push(item);});
						for(let atom of thisloc.partial_contents) {
							if(atom != this && this.does_cross(atom)) {
								let idx = lost_crossers.indexOf(atom);
								if(idx == -1) {
									if(!gained_crossers.includes(atom) && !common_crossers.includes(atom))
										gained_crossers.push(atom);
								} else {
									lost_crossers.splice(idx, 1);
									common_crossers.push(atom);
								}
								if(!this[_crosses].includes(atom))
									this[_crosses].push(atom);
							}
						}
					}
				}
			}
		}

		for(let gained of gained_crossers) {
			if(!gained[_crosses].includes(this))
				gained[_crosses].push(this);
			this.emit("crossed", gained);
			gained.emit("crossed_by", this);
		}

		for(let lost of lost_crossers) {
			let idx = lost[_crosses].indexOf(this);
			if(idx != -1)
				lost[_crosses].splice(idx, 1);
			this.emit("uncrossed", lost);
			lost.emit("uncrossed_by", this);
		}
		for(let lost of lost_viewers) {
			lost.c.Eye[mob_symbols._common_tiles_count].set(this, lost.c.Eye[mob_symbols._common_tiles_count].get(this) - 1);
		}
		for(let gained of gained_viewers) {
			gained.c.Eye[mob_symbols._common_tiles_count].set(this, gained.c.Eye[mob_symbols._common_tiles_count].get(this) + 1 || 1);
		}
		for(let lost of lost_viewers) {
			if(!lost.c.Eye.can_see(this))
				lost.c.Eye[mob_symbols._remove_viewing](this);
		}
		for(let gained of gained_viewers) {
			if(gained.c.Eye.can_see(this))
				gained.c.Eye[mob_symbols._add_viewing](this);
		}

		this.emit("moved", movement);
		this[_emit_parent_move](movement);
		if(old_fine_loc.loc && old_fine_loc.loc.emit) {
			old_fine_loc.loc.emit('exited', movement);
		}
		if(new_fine_loc.loc && new_fine_loc.loc.emit) {
			new_fine_loc.loc.emit('entered', movement);
		}
		this[mob_symbols._update_var]('x', 0); // Send the changes to the network.
		this[mob_symbols._update_var]('y', 0);
	}

	[_emit_parent_move](movement) {
		for(var child of this.contents) {
			child.emit("parent_moved", movement);
			child[_emit_parent_move](movement);
		}
	}

	test_move(newX, newY) {
		var lost_crossers = [];
		var gained_crossers = [];
		var common_crossers = [];

		if(this[_loc] && this[_loc].is_base_loc) {
			if(this[_loc].is_base_loc) {
				for(let x = Math.floor(this[_x]+this[_bounds_x]+0.00001); x < Math.ceil(this[_x]+this[_bounds_x]+this[_bounds_width]-0.00001); x++) {
					for(let y = Math.floor(this[_y]+this[_bounds_y]+0.00001); y < Math.ceil(this[_y]+this[_bounds_y]+this[_bounds_height]-0.00001); y++) {
						let thisloc = this.server.location(x,y,this[_z]);
						for(let atom of thisloc.partial_contents) {
							if(atom != this && atom.does_cross(this)) {
								if(!lost_crossers.includes(atom))
									lost_crossers.push(atom);
							}
						}
					}
				}
			}

			if(this[_loc].is_base_loc) {
				for(let x = Math.floor(newX+this[_bounds_x]+0.00001); x < Math.ceil(newX+this[_bounds_x]+this[_bounds_width]-0.00001); x++) {
					for(let y = Math.floor(newY+this[_bounds_y]+0.00001); y < Math.ceil(newY+this[_bounds_y]+this[_bounds_height]-0.00001); y++) {
						let thisloc = this.server.location(x,y,this[_z]);
						for(let atom of thisloc.partial_contents) {
							if(atom != this && this.does_cross(atom,{x: newX, y: newY})) {
								var idx = lost_crossers.indexOf(atom);

								if(idx == -1) {
									if(!gained_crossers.includes(atom) && !common_crossers.includes(atom))
										gained_crossers.push(atom);
								} else {
									lost_crossers.splice(idx, 1);
									common_crossers.push(atom);
								}
							}
						}
					}
				}
			}
		}
		return {gained_crossers, lost_crossers, common_crossers};
	}

	get x() {
		if(this[_loc] && !this[_loc].is_base_loc)
			return this[_loc].x;
		return this[_x];
	}
	set x(newX) {
		newX = +newX; // cast to number
		if(newX === this[_x] && this[_loc] && this[_loc].is_base_loc)
			return;
		if(newX !== newX) // NaN check, NaN != NaN
			throw new TypeError(`New X value ${newX} is not a number!`);
		this[_changeloc](newX, this[_y], this[_z], this.server.location(newX,this[_y],this[_z]));
	}

	get y() {
		if(this[_loc] && !this[_loc].is_base_loc)
			return this[_loc].y;
		return this[_y];
	}
	set y (newY) {
		newY = +newY; // cast to number
		if(newY === this[_y] && this[_loc] && this[_loc].is_base_loc)
			return;
		if(newY !== newY) // NaN check, NaN != NaN
			throw new TypeError(`New Y value ${newY} is not a number!`);
		this[_changeloc](this[_x], newY, this[_z], this.server.location(this[_x],newY,this[_z]));
	}

	get z() {
		if(this[_loc] && !this[_loc].is_base_loc)
			return this[_loc].z;
		return this[_z];
	}
	set z(newZ) {
		newZ = +newZ; // ast to number
		if(newZ === this[_z] && this[_loc] && this[_loc].is_base_loc)
			return;
		if(newZ !== newZ) // NaN check, NaN != NaN
			throw new TypeError(`New Z value ${newZ} is not a number!`);
		this[_loc] = this.server.location(this[_x],this[_y],this[_z]);
		this[_changeloc](this[_x], this[_y], newZ, this.server.location(this[_x],this[_y],newZ));
	}

	get loc() {
		return this[_loc];
	}
	set loc(newLoc){
		if(newLoc === this[_loc])
			return;
		if(newLoc !== null && (typeof newLoc !== "object" || (!(newLoc.contents instanceof Array) && !newLoc.is_fine_loc)))
			throw new TypeError(`New loc '${newLoc}' is not a valid location (null, object with contents list, or fine loc)`);
		if(newLoc !== null && newLoc.is_fine_loc) {
			if(!newLoc.hasOwnProperty('x') || !newLoc.hasOwnProperty('y')) {
				this.loc = newLoc.loc || null;
				return;
			}
			if(newLoc.loc != null && !newLoc.loc.is_base_loc) {
				this.loc = newLoc.loc;
				return;
			}
			if((newLoc.hasOwnProperty('z') && newLoc.z !== +newLoc.z) || newLoc.x !== +newLoc.x || newLoc.y !== +newLoc.y)
				throw new TypeError(`new fine loc is invalid`);
			var newz = newLoc.z != null ? newLoc.z : this.z;
			this[_changeloc](newLoc.x, newLoc.y, newz, this.server.location(newLoc.x, newLoc.y, newz));
			return;
		}
		if(newLoc !== null && newLoc.is_base_loc) {
			this[_changeloc](newLoc.x,newLoc.y,newLoc.z,newLoc);
		} else {
			this[_changeloc](0, 0, 0, newLoc);
		}
	}

	get base_loc() { // gets the Location object this belongs to
		var a = this;
		while(a && !a.is_base_loc)
			a = a.loc;
		return a;
	}

	get base_mover() { // gets the lowest atom
		var a = this;
		while(a.loc && !a.loc.is_base_loc)
			a = a.loc;
		return a;
	}

	get fine_loc() {
		return {x: this.x, y: this.y, z: this.z, loc: this.loc, is_fine_loc: true};
	}
	set fine_loc(val) {
		this.loc = val;
	}

	get bounds_x() {
		return this[_bounds_x];
	}
	set bounds_x(newval) {
		newval = +newval;
		if(newval == this[_bounds_x])
			return;
		if(newval != newval)
			throw new TypeError(`New boundary ${newval} is not a number`);
		this[_changeloc](this[_x], this[_y], this[_z], this[_loc], newval, this[_bounds_y], this[_bounds_width], this[_bounds_height]);
	}

	get bounds_y(){
		return this[_bounds_y];
	}
	set bounds_y(newval) {
		newval = +newval;
		if(newval == this[_bounds_y])
			return;
		if(newval != newval)
			throw new TypeError(`New boundary ${newval} is not a number`);
		this[_changeloc](this[_x], this[_y], this[_z], this[_loc], this[_bounds_x], newval, this[_bounds_width], this[_bounds_height]);
	}

	get bounds_width(){
		return this[_bounds_width];
	}
	set bounds_width(newval) {
		newval = +newval;
		if(newval == this[_bounds_width])
			return;
		if(newval != newval)
			throw new TypeError(`New boundary ${newval} is not a number`);
		this[_changeloc](this[_x], this[_y], this[_z], this[_loc], this[_bounds_x], this[_bounds_y], newval, this[_bounds_height]);
	}

	get bounds_height() {
		return this[_bounds_height];
	}
	set bounds_height(newval) {
		newval = +newval;
		if(newval == this[_bounds_height])
			return;
		if(newval != newval)
			throw new TypeError(`New boundary ${newval} is not a number`);
		this[_changeloc](this[_x], this[_y], this[_z], this[_loc], this[_bounds_x], this[_bounds_y], this[_bounds_width], newval);
	}

	move(offsetx, offsety, reason) {
		if(!this.loc || !this.loc.is_base_loc)
			return false;
		if(!this.can_move(offsetx, offsety, reason))
			return false;
		var remaining_x = offsetx;
		var remaining_y = offsety;
		var move_splits = Math.ceil(Math.max(Math.abs(offsetx) / this[_bounds_width], Math.abs(offsety) / this[_bounds_height]));
		var step_x = offsetx / move_splits;
		var step_y = offsety / move_splits;
		var clang = false;
		var first_bump = null;
		for(let i = 0; i < move_splits; i++) {
			let result = this.test_move(this.x + step_x, this.y + step_y);
			for(let gained of result.gained_crossers) {
				if(!this.can_cross(gained, remaining_x, remaining_y, reason)) {
					clang = true;
					first_bump = gained;
				}
			}
			if(clang)
				break;
			for(let lost of result.lost_crossers) {
				if(!this.can_uncross(lost, remaining_x, remaining_y, reason)) {
					clang = true;
				}
			}
			if(clang)
				break;
			this[_changeloc](this[_x] + step_x, this[_y] + step_y, this[_z], this.server.location(this[_x] + step_x, this[_y] + step_y, this[_z]));
			remaining_x -= step_x; remaining_y -= step_y;
		}
		if(!clang) {
			return true;
		}
		for(let i = 1; (i*Math.max(Math.abs(step_x),Math.abs(step_y))) >= (0.000005); i /= 2) {
			let result = this.test_move(this.x + (step_x * i), this.y + (step_y * i));
			clang = false;

			for(let gained of result.gained_crossers) {
				if(!this.can_cross(gained, remaining_x, remaining_y, reason)) {
					clang = true;
					break;
				}
			}
			if(!clang) for (let lost of result.lost_crossers) {
				if(!this.can_uncross(lost, remaining_x, remaining_y, reason)) {
					clang = true;
					break;
				}
			}
			if(clang)
				continue;
			this[_changeloc](this[_x] + step_x*i, this[_y] + step_y*i, this[_z], this.server.location(this[_x] + step_x*i, this[_y] + step_y*i, this[_z]));
			remaining_x -= step_x*i; remaining_y -= step_y*i;
		}
		if(first_bump) {
			this.emit("bumped", first_bump, remaining_x, remaining_y, reason);
			first_bump.emit("bumped_by", this, remaining_x, remaining_y, reason);
		}
		return false;
	}

	can_move() {
		return true;
	}

	can_cross(crossing, offsetx, offsety, reason) {
		return crossing.can_be_crossed(this, offsetx, offsety, reason);
	}

	can_uncross(uncrossing, offsetx, offsety, reason) {
		return uncrossing.can_be_uncrossed(this, offsetx, offsety, reason);
	}

	can_be_crossed(crosser) {
		if(this.let_pass_flags & crosser.pass_flags)
			return true;
		return crosser.density < 0 || this.density <= 0;
	}

	can_be_uncrossed() {
		return true;
	}

	// Checks if this thing encloses the tile.
	does_enclose_tile(tile) {
		if(!tile.is_base_loc || !this[_loc] || !this[_loc].is_base_loc || this[_z] != tile.z)
			return false;
		return (this[_x] + this[_bounds_x] - 0.00001 <= tile.x &&
			this[_y] + this[_bounds_y] - 0.00001 <= tile.y &&
			this[_x] + this[_bounds_x] + this[_bounds_width] + 0.00001 >= tile.x + 1 &&
			this[_y] + this[_bounds_y] + this[_bounds_height] + 0.00001 >= tile.y + 1);
	}

	does_cross(atom, {x = this[_x], y = this[_y], z = this[_z], bounds_x = this[_bounds_x], bounds_y = this[_bounds_y], bounds_width = this[_bounds_width], bounds_height = this[_bounds_height]} = {}) {
		if(atom[_x] == +atom[_x] && atom[_y] == +atom[_y] && atom[_z] == z && this[_loc] && atom[_loc] && this[_loc].is_base_loc && atom[_loc].is_base_loc) {
			return ((x + bounds_x + bounds_width - 0.00001) > (atom[_x] + atom[_bounds_x]))
				&& ((x + bounds_x + 0.00001) < (atom[_x] + atom[_bounds_x] + atom[_bounds_width]))
				&& ((y + bounds_y + bounds_height - 0.00001) > (atom[_y] + atom[_bounds_y]))
				&& ((y + bounds_y + 0.00001) < (atom[_y] + atom[_bounds_y] + atom[_bounds_height]));
		}
	}

	// WALKING

	get walking() {
		return this[_walking];
	}
	set walking(val) {
		this[_walking] = val;
		this[_walk_step]();
	}

	[_walk_step]() {
		if(this[_walk_stepping] || !this[_walking])
			return;
		this[_walk_stepping] = true;
		var offsetx = 0;
		var offsety = 0;
		if(this.walk_dir & 1)
			offsety += this.walk_size;
		if(this.walk_dir & 2)
			offsety -= this.walk_size;
		if(this.walk_dir & 4)
			offsetx += this.walk_size;
		if(this.walk_dir & 8)
			offsetx -= this.walk_size;
		this.glide_size = this.walk_size / this.walk_delay * 1000;
		this.move(offsetx, offsety, this.walk_reason);
		// in case the move proc cause it to change
		this.glide_size = this.walk_size / this.walk_delay * 1000;
		setTimeout(() => {
			this[_walk_stepping] = false;
			this[_walk_step]();
		}, this.walk_delay);
	}

	// main appearance

	get icon() {return this[_icon];}
	set icon(val) {this[_icon] = val; this[mob_symbols._update_var]('icon', 0);}

	get icon_state() {return this[_icon_state];}
	set icon_state(val) {this[_icon_state] = val; this[mob_symbols._update_var]('icon_state', 0);}

	get dir() {return this[_dir];}
	set dir(val) {this[_dir] = val; this[mob_symbols._update_var]('dir', 0);}

	get layer() {return this[_layer];}
	set layer(val) {this[_layer] = val; this[mob_symbols._update_var]('layer', 0);}

	get name() {return this[_name];}
	set name(val) {if(val === undefined) val = null; this[_name] = val; this[mob_symbols._update_var]('name', 0);}

	get glide_size() {return this[_glide_size];}
	set glide_size(val) {this[_glide_size] = val; this[mob_symbols._update_var]('glide_size', 0);}

	get screen_loc_x() {return this[_screen_loc_x];}
	set screen_loc_x(val) {if(val === undefined) val = null; this[_screen_loc_x] = val; this[mob_symbols._update_var]('screen_loc_x', 0);}

	get screen_loc_y() {return this[_screen_loc_y];}
	set screen_loc_y(val) {if(val === undefined) val = null; this[_screen_loc_y] = val; this[mob_symbols._update_var]('screen_loc_y', 0);}

	get mouse_opacity() {return this[_mouse_opacity];}
	set mouse_opacity(val) {if(val === undefined) val = null; this[_mouse_opacity] = val; this[mob_symbols._update_var]('mouse_opacity', 0);}

	get color() {return this[_color];}
	set color(val) {if(val === undefined) val = null; this[_color] = val; this[mob_symbols._update_var]('color', 0);}

	get alpha() {return this[_alpha];}
	set alpha(val) {if(val === undefined) val = null; this[_alpha] = val; this[mob_symbols._update_var]('alpha', 0);}

	get visible() {return this[_visible];}
	set visible(val) {
		val = !!val; // cast to boolean
		this[_visible] = val;
		if(this[_loc] && this[_loc].is_base_loc) {
			if(this[_loc].is_base_loc) {
				for(let x = Math.floor(this[_x]+this[_bounds_x]+0.00001); x < Math.ceil(this[_x]+this[_bounds_x]+this[_bounds_width]-0.00001); x++) {
					for(let y = Math.floor(this[_y]+this[_bounds_y]+0.00001); y < Math.ceil(this[_y]+this[_bounds_y]+this[_bounds_height]-0.00001); y++) {
						let thisloc = this.server.location(x,y,this[_z]);
						for(let atom of thisloc.viewers) {
							if(atom.c.Eye.can_see(this))
								atom.c.Eye[mob_symbols._add_viewing](this);
							else
								atom.c.Eye[mob_symbols._remove_viewing](this);
						}
					}
				}
			}
		}
	}

	get flick() {
		return this[_flick];
	}

	set flick(val) {
		if(typeof val != "object" && val != undefined)
			throw new TypeError(`${val} is not an object!`);
		if(!(val instanceof Flick) && val != undefined) {
			val = new Flick(this.server, val);
		}
		if(val === undefined)
			val = null;
		this[_flick] = val;
		this[mob_symbols._update_var]('flick', 0);
	}

	get opacity() {return this[_opacity];}
	set opacity(val) {
		if(this[_opacity] == val)
			return;
		this[_opacity] = val;
		this[mob_symbols._update_var]('opacity', 0);
		for(let viewer of this[mob_symbols._viewers]) {
			viewer.c.Eye.recalculate_visible_tiles();
		}
		for(let crosser of this[_crosses]) {
			if(has_component(crosser, "LightingObject")) {
				crosser.c.LightingObject.update_shadow(this);
			}
		}
		for(let loc of this.partial_locs()) {
			if(!loc.is_base_loc)
				continue;
			for(let hearer of loc.hearers)
				hearer.c.Hearer.enqueue_update_visible_tiles();
		}
	}

	[Symbol.iterator]() {
		return this.contents[Symbol.iterator]();
	}
	[mob_symbols._update_var](varname, type) {
		for(let viewer of this[mob_symbols._viewers]) {
			viewer.c.Eye.enqueue_update_atom_var(viewer.c.Eye[mob_symbols._server_to_net][this.object_id], this, varname, type);
		}
	}

	crosses() {
		return this[_crosses][Symbol.iterator]();
	}

	* partial_locs() {
		if(!this.loc || !this.loc.is_base_loc)
			return this.loc;
		for(let x = Math.floor(this[_x]+this[_bounds_x]+0.00001); x < Math.ceil(this[_x]+this[_bounds_x]+this[_bounds_width]-0.00001); x++) {
			for(let y = Math.floor(this[_y]+this[_bounds_y]+0.00001); y < Math.ceil(this[_y]+this[_bounds_y]+this[_bounds_height]-0.00001); y++) {
				yield this.server.location(x,y,this[_z]);
			}
		}
	}

	* marginal_locs() {
		if(!this.loc || !this.loc.is_base_loc)
			return this.loc;
		for(let x = Math.floor(this[_x]+this[_bounds_x]-0.00001); x < Math.ceil(this[_x]+this[_bounds_x]+this[_bounds_width]+0.00001); x++) {
			for(let y = Math.floor(this[_y]+this[_bounds_y]-0.00001); y < Math.ceil(this[_y]+this[_bounds_y]+this[_bounds_height]+0.00001); y++) {
				yield this.server.location(x,y,this[_z]);
			}
		}
	}

	* recursive_contents() {
		for(var item of this.contents) {
			yield item;
			yield* item.recursive_contents();
		}
	}

	toString() {
		return this.name;
	}

	destroy() {
		this.destroyed = true;
		for(var component of Object.values(this.c)) {
			if(component.destroy)
				component.destroy();
		}
		this.loc = null;
		this.server.atoms.delete(this.object_id);
		this.emit("destroyed");
	}
}

class Flick {
	constructor(server, {icon, icon_state, dir, overlays, time_begin} = {}) {
		time_begin = time_begin || server.now();
		Object.assign(this, {icon, icon_state, dir, overlays, time_begin});
		Object.freeze(this);
		if(this.overlays) {
			Object.freeze(this.overlays);
			for(var overlay_key in Reflect.ownKeys(this.overlays)) {
				Object.freeze(this.overlays[overlay_key]);
			}
		}
	}
}

Atom.Flick = Flick;

module.exports = Atom;
