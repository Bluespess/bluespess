'use strict';
const $ = require('jquery');

class Atom {
	constructor(client, {x=0,y=0,network_id,appearance={},overlays,components=[], component_vars={}} ) {
		this.client = client;
		this._appearance_vars = appearance;
		this.x = x;
		this.y = y;
		this.network_id = network_id;
		this.appearance_controller = appearance.appearance_controller_type ? new this.client.appearance_controllers[appearance.appearance_controller_type](this) : new this.client.appearance_controllers.Default(this);
		this.is_destroyed = false;
		this.client.atoms.push(this);
		if(this.network_id) {
			this.client.atoms_by_netid[this.network_id] = this;
		}

		this.on_appearance_change($.extend({}, this._appearance_vars));
		this.mark_dirty();
		this.overlays = {};
		if(overlays)
			for(var key in overlays) {
				if(!overlays.hasOwnProperty(key))
					continue;
				this.set_overlay(key, overlays[key]);
			}
		this.components = {};
		for(var component_name of components) {
			if(!client.components.hasOwnProperty(component_name)) {
				console.warn(`Server passed an unknown networked component '${component_name}'! Yell at the devs of your server.`);
				continue;
			}
			this.components[component_name] = new (client.components[component_name])(this, component_vars[component_name]);
		}
	}

	appearance(key, val) {
		if(val === undefined) {
			return this._appearance_vars[key];
		} else {
			if(this._appearance_vars[key] === val) {
				return val;
			}
			this._appearance_vars[key] = val;
			var changes = {};
			changes[key] = val;
			this.on_appearance_change(changes);
		}
	}

	on_appearance_change(changes) {
		this.appearance_controller.on_appearance_change(changes);
		for(var key in this.overlays) {
			if(!this.overlays.hasOwnProperty(key))
				continue;
			this.overlays[key].on_appearance_change(changes);
		}
	}

	del() {
		for(var key in this.overlays) {
			if(!this.overlays.hasOwnProperty(key))
				continue;
			this.overlays[key].del();
			delete this.overlays[key];
		}
		this.is_destroyed = true;
		this.client.atoms.splice(this.client.atoms.indexOf(this), 1);
		delete this.client.atoms_by_netid[this.network_id];
	}

	mark_dirty() {
		if(this.dirty)
			return;
		this.dirty = 1;
		this.client.dirty_atoms.push(this);
	}

	set_overlay(key, value) {
		if(this.overlays[key] && !value) {
			this.overlays[key].del();
			delete this.overlays[key];
			return;
		}
		if(!value)
			return;
		if(!this.overlays[key]) {
			var overlay = new Atom(this.client, {
				appearance: $.extend(Object.create(this._appearance_vars), value),
				network_id: this.network_id + "_OVERLAY_" + key,

			});
			Object.defineProperty(overlay, 'x', {get:() => {return this.x}, set:()=>{return true;}});
			Object.defineProperty(overlay, 'y', {get:() => {return this.y}, set:()=>{return true;}});
			Object.defineProperty(overlay, 'glide', {get:() => {return this.glide}, set:()=>{return true;}});
			this.overlays[key] = overlay;
			this.client.atoms.sort(Atom.atom_comparator);
			return;
		}
		$.extend(this.overlays[key]._appearance_vars, value);
		this.overlays[key].on_appearance_change(value);
		this.client.atoms.sort(Atom.atom_comparator);
	}

	get_displacement(timestamp) {
		var dispx = 0;
		var dispy = 0;
		if(this._appearance_vars.screen_loc_x) {
			dispx = (32*this._appearance_vars.screen_loc_x);
			dispy = 480-(32*this._appearance_vars.screen_loc_y)-32;
		} else {
			var glidex = 0;
			var glidey = 0;
			if(this.glide) {
				glidex = this.glide.x;
				glidey = this.glide.y;
				var glide_size = +this._appearance_vars.glide_size;
				if(glide_size != glide_size) glide_size = this.client.glide_size
				var dist = Math.max(glide_size * (timestamp - this.glide.lasttime) / 1000,0);
				this.glide.lasttime = timestamp;
				if(Math.abs(glidex) < dist){glidex = 0;} else {glidex -= Math.sign(glidex) * dist}
				if(Math.abs(glidey) < dist){glidey = 0;} else {glidey -= Math.sign(glidey) * dist}
				this.glide.x = glidex; this.glide.y = glidey;
				if(glidex == 0 && glidey == 0) this.glide = undefined;
			}
			dispx = (this.x-this.client.eyes[""].x-(this.client.eyes[""].glide?this.client.eyes[""].glide.x:0)+7+glidex)*32;
			dispy = (this.y-this.client.eyes[""].y-(this.client.eyes[""].glide?this.client.eyes[""].glide.y:0)-7+glidey)*-32;
		}
		return {dispx, dispy};
	}
}

Atom.atom_comparator = function(a, b) {
	var comparison = a._appearance_vars.layer - b._appearance_vars.layer;
	if(comparison == 0) {
		var [aol, bol] = [a._appearance_vars.overlay_layer, b._appearance_vars.overlay_layer];
		[aol, bol] = [aol == undefined ? 0 : aol, bol == undefined ? 0 : bol];
		comparison = aol-bol;
	}
	return comparison;
}

module.exports = Atom;
