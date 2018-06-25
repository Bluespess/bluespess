'use strict';
const IconRenderer = require('./icon_renderer.js');
const Matrix = require('./matrix.js');

class Atom {
	constructor(client, instobj = {}) {
		if(!instobj.hasOwnProperty('x'))
			instobj.x = 0;
		if(!instobj.hasOwnProperty('y'))
			instobj.y = 0;
		this.client = client;
		this.main_icon_renderer = new IconRenderer(this);
		this.overlays = {};
		this.overlay_renderers_list = [];
		this.overlay_renderers = {};

		for(let key in instobj) {
			if(!instobj.hasOwnProperty(key))
				continue;
			if(key == "overlays" || key == "components" || key == "component_vars")
				continue;
			this[key] = instobj[key];
		}

		this.is_destroyed = false;
		this.client.atoms.push(this);
		if(this.network_id) {
			this.client.atoms_by_netid[this.network_id] = this;
		}

		this.eye_id = instobj.eye_id || "";
		this.eye = client.eyes[this.eye_id];
		if(this.eye)
			this.eye.atoms.add(this);

		this.mark_dirty();

		if(instobj.overlays)
			for(let key in instobj.overlays) {
				if(!instobj.overlays.hasOwnProperty(key))
					continue;
				this.set_overlay(key, instobj.overlays[key]);
			}

		this.components = {};
		for(var component_name of instobj.components || []) {
			if(!client.components.hasOwnProperty(component_name)) {
				console.warn(`Server passed an unknown networked component '${component_name}'! Yell at the devs of your server.`);
				continue;
			}
			var ctor = client.components[component_name];
			this.components[component_name] = new ctor(this, instobj.component_vars ? instobj.component_vars[component_name] : {});
		}
	}

	del() {
		this.is_destroyed = true;
		if(this.eye) {

			this.eye.atoms.delete(this);
			let plane = this.get_plane();
			if(plane)
				plane.atoms.delete(this);
		}
		this.client.atoms.splice(this.client.atoms.indexOf(this), 1);
		delete this.client.atoms_by_netid[this.network_id];
		for(var component of Object.values(this.components)) {
			component.destroy();
		}
	}

	get_plane_id() {
		if(this.screen_loc_x != null || this.screen_loc_y != null)
			return "ui";
		return "";
	}

	get_plane() {
		return this.eye && this.eye.planes.get(this.get_plane_id());
	}

	mark_dirty() {
		let plane = this.get_plane();
		if(plane)
			plane.dirty_atoms.add(this);
	}

	set_overlay(key, value) {
		var overlay_renderer;
		if(this.overlays[key] && !value) {
			delete this.overlays[key];
			overlay_renderer = this.overlay_renderers[key];
			var idx = this.overlay_renderers_list.indexOf(overlay_renderer);
			if(idx != -1)
				this.overlay_renderers_list.splice(idx, 1);
			delete this.overlay_renderers[key];
			this.mark_dirty();
			return;
		}
		if(!this.overlays[key] && value) {
			this.overlays[key] = value;
			overlay_renderer = new IconRenderer(this);
			this.overlay_renderers_list.push(overlay_renderer);
			this.overlay_renderers[key] = overlay_renderer;
			overlay_renderer.parent = this.main_icon_renderer;
		} else if(this.overlays[key] && value) {
			overlay_renderer = this.overlay_renderers[key];
			this.overlays[key] = value;
		} else {
			return;
		}
		overlay_renderer.overlay_layer = value.overlay_layer || 0;
		for(var prop of ['icon', 'icon_state', 'dir', 'color', 'alpha', 'offset_x', 'offset_y'])
			overlay_renderer[prop] = value[prop];
		this.overlay_renderers_list.sort((a,b) => {return a.overlay_layer-b.overlay_layer;});
	}

	get_displacement(timestamp) {
		var dispx = 0;
		var dispy = 0;
		if(this.screen_loc_x != null) {
			dispx = this.screen_loc_x;
			dispy = this.screen_loc_y;
		} else {
			var glidex = 0;
			var glidey = 0;
			this.update_glide(timestamp);
			if(this.glide) {
				glidex = this.glide.x;
				glidey = this.glide.y;
			}
			dispx = (this.x+glidex);
			dispy = (this.y+glidey);
		}
		return {dispx, dispy};
	}

	get_transform() {
		return Matrix.identity;
	}

	update_glide(timestamp) {
		if(!this.glide)
			return;
		this.glide.update(timestamp);
	}

	is_mouse_over(x, y) {
		for(var overlay of this.overlay_renderers_list) {
			if(overlay.is_mouse_over(x,y))
				return true;
		}
		return this.main_icon_renderer.is_mouse_over(x,y);
	}

	on_render_tick(timestamp) {
		for(var overlay of this.overlay_renderers_list) {
			overlay.on_render_tick(timestamp);
		}
		return this.main_icon_renderer.on_render_tick(timestamp);
	}

	draw(ctx, timestamp) {
		for(let overlay of this.overlay_renderers_list) {
			overlay.draw(ctx, timestamp);
		}
		var i;
		for(i = 0; i < this.overlay_renderers_list.length; i++) {
			let overlay = this.overlay_renderers_list[i];
			if(overlay.overlay_layer >= 0)
				break;
			overlay.draw(ctx, timestamp);
		}
		this.main_icon_renderer.draw(ctx, timestamp);
		for(;i < this.overlay_renderers_list.length; i++) {
			let overlay = this.overlay_renderers_list[i];
			overlay.draw(ctx, timestamp);
		}
	}

	get_bounds() {
		var bounds = this.main_icon_renderer.get_bounds();
		for(var overlay of this.overlay_renderers_list) {
			var overlay_bounds = overlay.get_bounds();
			if(!overlay_bounds)
				continue;
			if(!bounds) {
				bounds = overlay_bounds;
				continue;
			}
			if(overlay_bounds.x < bounds.x) {
				bounds.width += bounds.x - overlay_bounds.x;
				bounds.x = overlay_bounds.x;
			}
			if(overlay_bounds.y < bounds.y) {
				bounds.height += bounds.y - overlay_bounds.y;
				bounds.y = overlay_bounds.y;
			}
			bounds.width = Math.max(bounds.width, (overlay_bounds.x - bounds.x) + overlay_bounds.width);
			bounds.height = Math.max(bounds.height, (overlay_bounds.y - bounds.y) + overlay_bounds.height);
		}
		return bounds;
	}

	get_transformed_bounds(timestamp) {
		let transform = this.get_transform(timestamp);
		let bounds = this.get_bounds(timestamp);
		if(!bounds)
			return bounds;
		let corners = [
			[bounds.x, bounds.y],
			[bounds.x + bounds.width, bounds.y],
			[bounds.x, bounds.y + bounds.height],
			[bounds.x + bounds.width, bounds.y + bounds.height]
		];
		let [left, right, top, bottom] = [Infinity, -Infinity, -Infinity, Infinity];
		for(let corner of corners) {
			let transformed_corner = transform.multiply([corner[0] - 0.5, corner[1] - 0.5]);
			transformed_corner[0] += 0.5;
			transformed_corner[1] += 0.5;
			left = Math.min(left, transformed_corner[0]);
			right = Math.max(right, transformed_corner[0]);
			top = Math.max(top, transformed_corner[1]);
			bottom = Math.min(bottom, transformed_corner[1]);
		}
		return {
			x: left,
			y: bottom,
			width: right - left,
			height: top - bottom
		};
	}

	fully_load() {
		var promises = [];
		promises.push(this.main_icon_renderer.fully_load());
		for(var overlay of this.overlay_renderers_list) {
			promises.push(overlay.fully_load());
		}
		return Promise.all(promises);
	}

	get icon() {return this.main_icon_renderer.icon;}
	set icon(val) {
		this.main_icon_renderer.icon = val;
	}

	get icon_state() {return this.main_icon_renderer.icon_state;}
	set icon_state(val) {
		this.main_icon_renderer.icon_state = val;
	}

	get dir() {return this.main_icon_renderer.dir;}
	set dir(val) {
		this.main_icon_renderer.dir = val;
	}

	get color() {return this.main_icon_renderer.color;}
	set color(val) {
		this.main_icon_renderer.color = val;
	}

	get alpha() {return this.main_icon_renderer.alpha;}
	set alpha(val) {
		this.main_icon_renderer.alpha = val;
	}

	get flick() {
		return this.main_icon_renderer.flick;
	}
	set flick(val) {
		for(var overlay_renderer of this.overlay_renderers_list)
			overlay_renderer.flick = null;
		this.main_icon_renderer.flick = val;
		if(val.overlays) {
			for(var key in val.overlays) {
				if(!this.overlay_renderers.hasOwnProperty(key))
					continue;
				var overlay_flick = val.overlays[key];
				this.overlay_renderers[key].flick = overlay_flick;
				for(var prop of ['icon', 'icon_state', 'dir', 'time_begin'])
					if(!overlay_flick[prop])
						overlay_flick[prop] = val[prop];
			}
		}
	}

	get c() {
		return this.components;
	}
}

class Glide {
	constructor(object, params) {
		this.object = object;
		this.lasttime = params.lasttime || performance.now();
		this.x = 0;
		this.y = 0;
		if(params.oldx == +params.oldx && params.oldy == +params.oldy && (params.oldx != object.x || params.oldy != object.y) && Math.abs(Math.max(object.x-params.oldx,object.y-params.oldy)) <= 1.50001) {
			var pgx = (object.glide && object.glide.x) || 0;
			if(Math.sign(pgx) == params.oldx-object.x)
				pgx = 0;
			var pgy = (object.glide && object.glide.y) || 0;
			if(Math.sign(pgy) == params.oldy-object.y)
				pgy = 0;
			Object.assign(this, {x:params.oldx-object.x+pgx,y:params.oldy-object.y+pgy});
			return this;
		}
		return object.glide;
	}
	update(timestamp) {
		var glidex = this.x;
		var glidey = this.y;
		var glide_size = +this.object.glide_size;
		if(glide_size != glide_size) glide_size = this.object.client.glide_size;
		if(glide_size != glide_size || glide_size == 0) {
			this.object.glide = null;
			return;
		}
		var dist = Math.max(glide_size * (timestamp - this.lasttime) / 1000,0);
		this.lasttime = timestamp;
		if(Math.abs(glidex) < dist){glidex = 0;} else {glidex -= Math.sign(glidex) * dist;}
		if(Math.abs(glidey) < dist){glidey = 0;} else {glidey -= Math.sign(glidey) * dist;}
		this.x = glidex; this.y = glidey;
		if(glidex == 0 && glidey == 0) this.object.glide = undefined;
	}
}

Atom.Glide = Glide;

Atom.atom_comparator = function(a, b) {
	if(!a && !b)
		return 0;
	if(!a)
		return 1;
	if(!b)
		return -1;
	var comparison = a.layer - b.layer;
	if(comparison == 0)
		comparison = b.y - a.y;
	if(comparison == 0)
		if(a.network_id > b.network_id)
			comparison = 1;
		else if(a.network_id < b.network_id)
			comparison = -1;
	return comparison;
};

module.exports = Atom;
