'use strict';
const IconRenderer = require('./icon_renderer.js');

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
		this.client.atoms.splice(this.client.atoms.indexOf(this), 1);
		delete this.client.atoms_by_netid[this.network_id];
		for(var component of Object.values(this.components)) {
			component.destroy();
		}
	}

	mark_dirty() {
		if(this.dirty)
			return;
		this.dirty = true;
		this.client.dirty_atoms.push(this);
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
		for(var prop of ['icon', 'icon_state', 'dir'])
			overlay_renderer[prop] = value[prop];
		this.overlay_renderers_list.sort((a,b) => {a.overlay_layer-b.overlay_layer;});
	}

	get_displacement(timestamp) {
		var dispx = 0;
		var dispy = 0;
		if(this.screen_loc_x) {
			dispx = (32*this.screen_loc_x);
			dispy = 480-(32*this.screen_loc_y)-32;
		} else {
			var glidex = 0;
			var glidey = 0;
			this.update_glide(timestamp);
			if(this.glide) {
				glidex = this.glide.x;
				glidey = this.glide.y;
			}
			if(this.client.eyes[""] instanceof Atom)
				this.client.eyes[""].update_glide(timestamp);
			dispx = Math.round((this.x-this.client.eyes[""].x-(this.client.eyes[""].glide?this.client.eyes[""].glide.x:0)+7+glidex)*32);
			dispy = Math.round((this.y-this.client.eyes[""].y-(this.client.eyes[""].glide?this.client.eyes[""].glide.y:0)-7+glidey)*-32);
		}
		return {dispx, dispy};
	}

	update_glide(timestamp) {
		if(!this.glide)
			return;
		var glidex = this.glide.x;
		var glidey = this.glide.y;
		var glide_size = +this.glide_size;
		if(glide_size != glide_size) glide_size = this.client.glide_size;
		if(glide_size != glide_size || glide_size == 0) {
			this.glide = null;
			return;
		}
		var dist = Math.max(glide_size * (timestamp - this.glide.lasttime) / 1000,0);
		this.glide.lasttime = timestamp;
		if(Math.abs(glidex) < dist){glidex = 0;} else {glidex -= Math.sign(glidex) * dist;}
		if(Math.abs(glidey) < dist){glidey = 0;} else {glidey -= Math.sign(glidey) * dist;}
		this.glide.x = glidex; this.glide.y = glidey;
		if(glidex == 0 && glidey == 0) this.glide = undefined;
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
			if(overlay_bounds.x < bounds.x) {
				bounds.x += bounds.x - overlay_bounds.x;
				bounds.x = overlay_bounds.x;
			}
			if(overlay_bounds.y < bounds.y) {
				bounds.y += bounds.y - overlay_bounds.y;
				bounds.y = overlay_bounds.y;
			}
			bounds.width = Math.max(bounds.width, overlay_bounds.width);
			bounds.height = Math.max(bounds.width, overlay_bounds.height);
		}
		return bounds;
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
