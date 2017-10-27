'use strict';
const dir_progressions = require('./dir_progressions.js');

const CHANGE_LEVEL_NONE = 0;
const CHANGE_LEVEL_DIR = 1;
const CHANGE_LEVEL_ICON_STATE = 2;
const CHANGE_LEVEL_ICON = 3;

class IconRenderer {
	constructor(obj) {
		if(!obj.client) {
			this.client = obj;
		} else {
			this.atom = obj;
			this.client = obj.client;
		}
		this._overlay_layer = 0;
		this.change_level = 0;
	}

	// Returns a promise that is resolved when the icon is fully loaded (json and image)
	fully_load() {
		if(this.icon_meta || !this.icon)
			return Promise.resolve();
		return new Promise((resolve, reject) => {
			this.client.enqueue_icon_meta_load(this.icon, (err) => {
				if(err)
					reject(err);
				else
					resolve();
			});
		});
	}

	get_bounds() {
		if(!this.dir_meta || !this.icon_meta || !this.icon_state_meta)
			return;
		return {x:0,y:1-(this.icon_state_meta.height/32),width:this.icon_state_meta.width/32,height:this.icon_state_meta.height/32};
	}

	on_render_tick(timestamp) {
		if(this.change_level >= CHANGE_LEVEL_ICON) {
			this.icon_meta = this.atom.client.icon_metas[this.icon];
			this.dir_meta = null;
			if(this.icon_meta == undefined) {
				this.change_level = CHANGE_LEVEL_NONE;
				var enqueued_icon = this.icon;
				this.atom.client.enqueue_icon_meta_load(this.icon, (err) => {
					if(err)
						console.error(err);
					else if(this.icon == enqueued_icon) {
						this.change_level = CHANGE_LEVEL_ICON;
					}
				});
				this.change_level = CHANGE_LEVEL_NONE;
				return;
			}
		}
		if(this.change_level >= CHANGE_LEVEL_ICON_STATE) {
			this.dir_meta = null;
			if(!this.icon_meta) {
				this.change_level = CHANGE_LEVEL_NONE;
				return;
			}
			this.computed_icon_state = this.icon_state;
			if(this.moving && this.icon_meta[this.computed_icon_state + "_movement"] != undefined) {
				this.computed_icon_state += "_movement";
			}
			this.icon_state_meta = this.icon_meta[this.computed_icon_state];
			if(!this.icon_state_meta)
				this.icon_state_meta = this.icon_meta[" "];
			if(!this.icon_state_meta)
				this.icon_state_meta = this.icon_meta[""];
			if(!this.icon_state_meta) {
				this.change_level = CHANGE_LEVEL_NONE;
				return;
			}
		}
		if(this.change_level >= CHANGE_LEVEL_DIR) {
			this.dir_meta = null;
			if(!this.icon_state_meta) {
				this.change_level = CHANGE_LEVEL_NONE;
				return;
			}
			var progression = this.icon_state_meta.dir_progression;
			if(!progression)
				progression = dir_progressions[this.icon_state_meta.dirCount];
			if(!progression)
				progression = dir_progressions[1];
			this.computed_dir = progression[this.dir];
			if(this.computed_dir == undefined || !this.icon_state_meta.dirs[this.computed_dir])
				this.computed_dir = 2;
			if(this.computed_dir == undefined || !this.icon_state_meta.dirs[this.computed_dir]) {
				this.change_level = CHANGE_LEVEL_NONE;
				return;
			}
			this.dir_meta = this.icon_state_meta.dirs[this.computed_dir];
			if(this.atom)
				this.atom.mark_dirty();
			this.icon_frame = -1;
		}
		this.change_level = CHANGE_LEVEL_NONE;

		if(!this.dir_meta || this.dir_meta.length <= 1) {
			this.icon_frame = 0;
			return;
		}
		timestamp = timestamp % this.icon_state_meta.totalDelays[this.computed_dir];
		var accum_delay = 0;
		for(var i = 0; i < this.dir_meta.length; i++) {
			accum_delay += this.dir_meta[i].delay;
			if(accum_delay > timestamp) {
				if(i != this.icon_frame && this.atom) {
					this.atom.mark_dirty();
				}
				this.icon_frame = i;
				return;
			}
		}
	}

	draw(ctx) {
		if(!this.dir_meta || !this.icon_meta || !this.icon_meta.__image_object)
			return;
		var frame_meta = this.dir_meta[this.icon_frame >= 0 && this.icon_frame < this.dir_meta.length ? this.icon_frame : 0];

		ctx.drawImage(this.icon_meta.__image_object, frame_meta.x, frame_meta.y, this.icon_state_meta.width, this.icon_state_meta.height,
			0, 0, this.icon_state_meta.width, this.icon_state_meta.height);
	}

	is_mouse_over(x, y) {
		if(!this.icon_meta || !this.dir_meta || !this.icon_meta.__image_data)
			return false;
		var pxx = Math.floor(x*32);
		var pxy = Math.floor(32-y*32);
		var frame_meta = this.dir_meta[this.icon_frame >= 0 && this.icon_frame < this.dir_meta.length ? this.icon_frame : 0];
		var idx = 3+4*((pxx+frame_meta.x)+((pxy+frame_meta.y)*this.icon_meta.__image_data.width));
		return this.icon_meta.__image_data.data[idx] > 0;
	}

	get icon() { return this._icon; }
	set icon(val) {
		if(val == this._icon)
			return;
		this._icon = val;
		this.change_level = Math.max(CHANGE_LEVEL_ICON, this.change_level);
	}

	get icon_state() { return this._icon_state; }
	set icon_state(val) {
		if(val == this._icon_state)
			return;
		this._icon_state = val;
		this.change_level = Math.max(CHANGE_LEVEL_ICON_STATE, this.change_level);
	}

	get dir() { return this._dir; }
	set dir(val) {
		if(val == this._dir)
			return;
		this._dir = val;
		this.change_level = Math.max(CHANGE_LEVEL_DIR, this.change_level);
	}

	get overlay_layer() { return this._overlay_layer; }
	set overlay_layer(val) {
		if(val == this._overlay_layer)
			return;
		this._dir = val;
		if(this.atom)
			this.atom.mark_dirty();
	}
}

module.exports = IconRenderer;
