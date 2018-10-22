'use strict';

const {Component, Atom} = require('../server.js');

const _enabled = Symbol('_enabled');
const _color = Symbol('_color');
const _radius = Symbol('_radius');
const _lighting_object = Symbol('_lighting_object');

class LightingObject extends Component.Networked {
	constructor(atom, template) {
		super(atom, template);

		this.add_networked_var("enabled");
		this.add_networked_var("color");
		this.add_networked_var("radius", this.change_radius.bind(this));
		this.add_networked_var("shadows_list");
		this.shadows = new Map();
		this.move_callbacks = new Map();
		this.a.on("crossed", this.crossed.bind(this));
		this.a.on("crossed_by", this.crossed.bind(this));
		this.a.on("uncrossed", this.uncrossed.bind(this));
		this.a.on("uncrossed_by", this.uncrossed.bind(this));
		this.change_radius(this.radius);
		this.update_shadows_string();
	}

	crossed(item) {
		if(!item.opacity)
			return;
		if(this.shadows.has(item))
			return;
		var move_callback = this.update_shadow.bind(this, item);
		this.move_callbacks.set(item, move_callback);
		item.on("moved", move_callback);
		var shadow = {};
		shadow.x1 = item.x + item.bounds_x;
		shadow.y1 = item.y + item.bounds_y;
		shadow.x2 = item.x + item.bounds_x + item.bounds_width;
		shadow.y2 = item.y + item.bounds_y + item.bounds_height;
		this.shadows.set(item, shadow);
		this.update_shadows_string();
	}

	uncrossed(item) {
		if(!this.shadows.has(item))
			return;
		var move_callback = this.move_callbacks.get(item);
		if(move_callback) {
			item.removeListener("moved", move_callback);
		}
		this.shadows.delete(item);
		this.update_shadows_string();
	}

	update_shadow(item) {
		if(!item.opacity)
			return this.uncrossed(item);
		var shadow = this.shadows.get(item);
		if(!shadow)
			return this.crossed(item);
		shadow.x1 = item.x + item.bounds_x;
		shadow.y1 = item.y + item.bounds_y;
		shadow.x2 = item.x + item.bounds_x + item.bounds_width;
		shadow.y2 = item.y + item.bounds_y + item.bounds_height;
		this.update_shadows_string();
	}

	update_shadows_string() {
		this.shadows_list = Array.from(this.shadows.values());
	}

	change_radius(newval) {
		if(newval === +newval) {
			this.a.bounds_x = -newval;
			this.a.bounds_y = -newval;
			this.a.bounds_width = newval*2+1;
			this.a.bounds_height = newval*2+1;
		} else {
			this.a.bounds_width = 1;
			this.a.bounds_height = 1;
			this.a.bounds_x = 0;
			this.a.bounds_y = 0;
		}
		return true;
	}
}

/**
 * For things that emit light
 * @alias LightSource
 * @extends Bluespess.Component
 */
class LightSource extends Component {
	constructor(atom, template) {
		super(atom, template);
		this[_lighting_object] = new Atom(this.a.server, {components:["LightingObject"]});
		this.update_lighting_object();
		this.a.on("moved", this.update_lighting_object.bind(this));
		this.a.on("parent_moved", this.update_lighting_object.bind(this));
		this.update_queued = false;
	}
	update_lighting_object() {
		if(this.update_queued)
			return;
		this.update_queued = true;
		process.nextTick(() => {
			try {
				if(!this[_lighting_object])
					return;
				if(!this[_enabled] || !this.a.loc || (!this.a.loc.is_base_loc && (!this.a.loc.loc || !this.a.loc.loc.is_base_loc))) {
					this[_lighting_object].loc = null;
					this[_lighting_object].c.LightingObject.enabled = false;
					return;
				}
				this[_lighting_object].glide_size = this.a.base_mover == this.last_base_mover ? this.a.base_mover.glide_size : 0;
				this[_lighting_object].fine_loc = this.a.base_mover.fine_loc;
				this[_lighting_object].c.LightingObject.enabled = true;
				this[_lighting_object].c.LightingObject.color = this[_color];
				this[_lighting_object].c.LightingObject.radius = this[_radius];
				this.last_base_mover = this.a.base_mover;
			} finally {
				this.update_queued = false;
			}
		});
	}
	/**
	 * @type {boolean}
	 * @default false
	 */
	get enabled() {return this[_enabled];}
	set enabled(val) {
		let old = this[_enabled];
		if(old == val)
			return;
		this[_enabled] = val;
		this.update_lighting_object();
		this.emit("enabled_changed", old, val);
	}

	/**
	 * CSS color of the light
	 * @type {string}
	 * @default "#FFFFFF"
	 */
	get color() {return this[_color];}
	set color(val) {
		let old = this[_color];
		if(old == val)
			return;
		this[_color] = val;
		this.update_lighting_object();
		this.emit("color_changed", old, val);
	}

	/**
	 * How many tiles away this emits light
	 * @type {number}
	 * @default 2
	 */
	get radius() {return this[_radius];}
	set radius(val) {
		let old = this[_radius];
		if(old == val)
			return;
		this[_radius] = val;
		this.update_lighting_object();
		this.emit("radius_changed", old, val);
	}
}

LightSource.template = {
	vars: {
		components: {
			"LightSource": {
				enabled: false,
				radius: 2,
				color: "#ffffff"
			}
		}
	}
};

module.exports.components = {LightingObject, LightSource};
