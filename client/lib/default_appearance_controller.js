'use strict';
const $ = require('jquery');
const dir_progressions = require('./dir_progressions.js');

class Default {
	constructor(atom) {
		this.atom = atom;
	}

	on_appearance_change(changes) {
		var appearance_vars = this.atom._appearance_vars
		if(changes.icon != undefined) {
			this.icon_meta = this.atom.client.icon_metas[changes.icon];
			if(this.icon_meta == undefined) {
				this.atom.client.enqueue_icon_meta_load(changes.icon, () => {
					if(appearance_vars.icon == changes.icon) {
						this.on_appearance_change({icon: changes.icon});
					}
				});
				return
			}
		}
		if(changes.icon != undefined || changes.icon_state != undefined || changes.moving != undefined) {
			this.computed_icon_state = appearance_vars.icon_state;
			if(appearance_vars.moving && this.icon_meta[this.computed_icon_state + "_movement"] != undefined) {
				this.computed_icon_state += "_movement";
			}
			this.icon_state_meta = this.icon_meta[this.computed_icon_state];
			if(!this.icon_state_meta)
				this.icon_state_meta = this.icon_meta[" "];
			if(!this.icon_state_meta)
				this.icon_state_meta = this.icon_meta[""];
			if(!this.icon_state_meta)
				return;
		}
		if(changes.icon != undefined || changes.icon_state != undefined || changes.dir != undefined || changes.moving != undefined) {
			var progression = this.icon_state_meta.dir_progression;
			if(!progression)
				progression = dir_progressions[this.icon_state_meta.dirCount];
			if(!progression)
				progression = dir_progressions[1];
			this.computed_dir = progression[appearance_vars.dir];
			if(this.computed_dir == undefined || !this.icon_state_meta.dirs[this.computed_dir])
				this.computed_dir = 2;
			if(this.computed_dir == undefined || !this.icon_state_meta.dirs[this.computed_dir])
				return;
			this.dir_meta = this.icon_state_meta.dirs[this.computed_dir];
		}
		this.icon_frame = -1;
		this.atom.mark_dirty();
	}

	get_bounds() {
		if(!this.dir_meta || !this.icon_meta || !this.icon_state_meta)
			return;
		return {x:0,y:0,width:this.icon_state_meta.width/32,height:this.icon_state_meta.height/32};
	}

	on_render_tick(timestamp) {
		if(!this.dir_meta || this.dir_meta.length <= 1) {
			this.icon_frame = 0;
			return;
		}
		timestamp = timestamp % this.icon_state_meta.totalDelays[this.computed_dir];
		var accum_delay = 0;
		for(var i = 0; i < this.dir_meta.length; i++) {
			accum_delay += this.dir_meta[i].delay;
			if(accum_delay > timestamp) {
				if(i != this.icon_frame) {
					this.atom.mark_dirty();
				}
				this.icon_frame = i;
				return;
			}
		}
		if(this.atom.glide)
			this.atom.mark_dirty();
	}

	draw(ctx, timestamp) {
		if(!this.dir_meta || !this.icon_meta || !this.icon_meta.__image_object)
			return;
		var frame_meta = this.dir_meta[this.icon_frame >= 0 && this.icon_frame < this.dir_meta.length ? this.icon_frame : 0];

		ctx.drawImage(this.icon_meta.__image_object, frame_meta.x, frame_meta.y, this.icon_state_meta.width, this.icon_state_meta.height,
			0, 0, this.icon_state_meta.width, this.icon_state_meta.height);
	}

	is_mouse_over(x, y, timestamp) {
		if(!this.icon_meta || !this.dir_meta || !this.icon_meta.__image_data)
			return false;
		var pxx = Math.floor(x*32);
		var pxy = Math.floor(32-y*32);
		var frame_meta = this.dir_meta[this.icon_frame >= 0 && this.icon_frame < this.dir_meta.length ? this.icon_frame : 0];
		var idx = 3+4*((pxx+frame_meta.x)+((pxy+frame_meta.y)*this.icon_meta.__image_data.width));
		return this.icon_meta.__image_data.data[idx] > 0;
	}
}

module.exports = Default;
