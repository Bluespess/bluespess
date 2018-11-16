'use strict';
const dir_progressions = require('./dir_progressions.js');

const CHANGE_LEVEL_NONE = 0;
const CHANGE_LEVEL_DIR = 1;
const CHANGE_LEVEL_ICON_STATE = 2;
const CHANGE_LEVEL_ICON = 3;

const color_canvas = document.createElement("canvas");
global.color_canvas = color_canvas;

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
		this._offset_x = 0;
		this._offset_y = 0;
	}

	// Returns a promise that is resolved when the icon is fully loaded (json and image)
	fully_load() {
		if(this.icon_meta || !this.icon)
			return Promise.resolve();
		return this.client.enqueue_icon_meta_load(this.icon);
	}

	get_bounds() {
		if(!this.dir_meta || !this.icon_meta || !this.icon_state_meta)
			return;
		let offset = this.get_offset();
		return {x:offset[0],y:1-(this.icon_state_meta.height/32)+offset[1],width:this.icon_state_meta.width/32,height:this.icon_state_meta.height/32};
	}

	on_render_tick(timestamp) {
		if(this.parent)
			this.parent.check_flick_validity(timestamp);
		this.check_flick_validity(timestamp);
		if(this.icon != this.last_icon) {
			this.change_level = Math.max(this.change_level, CHANGE_LEVEL_ICON);
			this.last_icon = this.icon;
		} else if(this.icon_state != this.last_icon_state) {
			this.change_level = Math.max(this.change_level, CHANGE_LEVEL_ICON_STATE);
			this.last_icon_state = this.icon_state;
		} else if(this.dir != this.last_dir) {
			this.change_level = Math.max(this.change_level, CHANGE_LEVEL_DIR);
			this.last_dir = this.dir;
		}
		if(this.change_level > CHANGE_LEVEL_NONE && this.atom)
			this.atom.mark_dirty();
		if(this.change_level >= CHANGE_LEVEL_ICON) {
			this.icon_meta = this.atom.client.icon_metas[this.icon];
			this.dir_meta = null;
			if(this.icon_meta == undefined) {
				this.change_level = CHANGE_LEVEL_NONE;
				var enqueued_icon = this.icon;
				this.atom.client.enqueue_icon_meta_load(this.icon).then(()=>{
					if(this.icon == enqueued_icon) {
						this.change_level = CHANGE_LEVEL_ICON;
					}
				}).catch((err) => {
					console.error(err);
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
			this.icon_state_meta = this.icon_meta[this.icon_state] || this.icon_meta[" "] || this.icon_meta[""];
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
			var progression = this.icon_state_meta.dir_progression || dir_progressions[this.icon_state_meta.dir_count] || dir_progressions[1];

			this.dir_meta = this.icon_state_meta.dirs[progression[this.dir]] || this.icon_state_meta.dirs[2];

			if(!this.dir_meta) {
				this.change_level = CHANGE_LEVEL_NONE;
				return;
			}
			if(this.atom)
				this.atom.mark_dirty();
			this.icon_frame = -1;
		}
		this.change_level = CHANGE_LEVEL_NONE;

		if(!this.dir_meta || this.dir_meta.frames.length <= 1) {
			this.icon_frame = 0;
			return;
		}
		var icon_time = timestamp % this.dir_meta.total_delay;
		if(this.flick)
			icon_time = timestamp - (this.flick.time_begin + this.client.server_time_to_client);
		else if(this.parent && this.parent.flick && ((!this._icon && this.parent.flick.icon) || ((!this._icon_state || this._icon_state.includes("[parent]")) && this.parent.flick.icon_state) || (!this._dir && this.parent.flick.dir)))
			icon_time = timestamp - (this.parent.flick.time_begin + this.client.server_time_to_client);
		var accum_delay = 0;
		for(var i = 0; i < this.dir_meta.frames.length; i++) {
			accum_delay += this.dir_meta.frames[i].delay;
			if(accum_delay > icon_time) {
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
		var frame_meta = this.dir_meta.frames[this.icon_frame >= 0 && this.icon_frame < this.dir_meta.frames.length ? this.icon_frame : 0];

		let image = this.icon_meta.__image_object;
		if(this.color) {
			color_canvas.width = Math.max(color_canvas.width, this.icon_state_meta.width);
			color_canvas.height = Math.max(color_canvas.height, this.icon_state_meta.height);
			let cctx = color_canvas.getContext('2d');
			cctx.clearRect(0, 0, this.icon_state_meta.width + 1, this.icon_state_meta.height + 1);
			cctx.fillStyle = this.color;
			cctx.globalCompositeOperation = "source-over";
			cctx.drawImage(image, frame_meta.x, frame_meta.y, this.icon_state_meta.width, this.icon_state_meta.height, 0, 0, this.icon_state_meta.width, this.icon_state_meta.height);
			cctx.globalCompositeOperation = "multiply";
			cctx.fillRect(0, 0, this.icon_state_meta.width, this.icon_state_meta.height);
			cctx.globalCompositeOperation = "destination-in";
			cctx.drawImage(image, frame_meta.x, frame_meta.y, this.icon_state_meta.width, this.icon_state_meta.height, 0, 0, this.icon_state_meta.width, this.icon_state_meta.height);
			cctx.globalCompositeOperation = "source-over";
			image = color_canvas;
			frame_meta = {x:0, y:0};
		}
		let offset = this.get_offset();

		ctx.drawImage(image, frame_meta.x, frame_meta.y, this.icon_state_meta.width, this.icon_state_meta.height,
			Math.round(offset[0] * 32), Math.round(-offset[1] * 32), this.icon_state_meta.width, this.icon_state_meta.height);
	}

	is_mouse_over(x, y) {
		if(!this.icon_meta || !this.dir_meta || !this.icon_meta.__image_data)
			return false;
		let offset = this.get_offset();
		x -= offset[0];
		y -= offset[1];
		var pxx = Math.floor(x*32);
		var pxy = Math.floor(32-y*32);
		var frame_meta = this.dir_meta.frames[this.icon_frame >= 0 && this.icon_frame < this.dir_meta.frames.length ? this.icon_frame : 0];
		if(pxx < 0 || pxy < 0 || pxx > this.icon_state_meta.width || pxy > this.icon_state_meta.height)
			return false;
		var idx = 3+4*((pxx+frame_meta.x)+((pxy+frame_meta.y)*this.icon_meta.__image_data.width));
		return this.icon_meta.__image_data.data[idx] > 0;
	}

	get icon() {
		if(this._icon == null && this.parent)
			return this.parent.icon;
		var icon = this._icon;
		if(this.flick && this.flick.icon) {
			icon = this.flick.icon;
		}
		return icon;
	}
	set icon(val) {
		this._icon = val;
	}

	get icon_state() {
		if(this._icon_state == null && this.parent)
			return this.parent.icon_state;
		var icon_state = this._icon_state;
		if(this.flick && this.flick.icon_state) {
			icon_state = this.flick.icon_state;
		}
		if(this.parent) {
			icon_state = (""+icon_state).replace(/\[parent\]/g, this.parent.icon_state);
		}
		return icon_state;
	}
	set icon_state(val) {
		this._icon_state = val;
	}

	get dir() {
		if(this._dir == null && this.parent)
			return this.parent.dir;
		var dir = this._dir;
		if(this.flick && this.flick.dir) {
			dir = this.flick.dir;
		}
		return dir;
	}
	set dir(val) {
		this._dir = val;
	}

	check_flick_validity(timestamp) {
		if(!this.flick)
			return;
		var icon_meta = this.client.icon_metas[this.icon];
		if(!icon_meta)
			return;
		var icon_state_meta = icon_meta[this.icon_state] || icon_meta[" "] || icon_meta[""];
		if(!icon_state_meta) {
			this.flick = null;
			return;
		}
		var progression = icon_state_meta.dir_progression || dir_progressions[icon_state_meta.dir_count] || dir_progressions[1];
		var dir_meta = icon_state_meta.dirs[progression[this.dir]] || icon_state_meta.dirs[2];
		if(!dir_meta) {
			this.flick = null;
			return;
		}
		var flick_time = timestamp - (this.flick.time_begin + this.client.server_time_to_client);
		if(flick_time > dir_meta.total_delay)
			this.flick = null;
	}

	get overlay_layer() { return this._overlay_layer; }
	set overlay_layer(val) {
		if(val == this._overlay_layer)
			return;
		this._overlay_layer = val;
		if(this.atom)
			this.atom.mark_dirty();
	}

	get offset_x() {return this._offset_x;}
	set offset_x(val) {
		if(val == this._offset_x)
			return;
		this._offset_x = +val || 0;
		if(this.atom)
			this.atom.mark_dirty();
	}
	get offset_y() {return this._offset_y;}
	set offset_y(val) {
		if(val == this._offset_y)
			return;
		this._offset_y = +val || 0;
		if(this.atom)
			this.atom.mark_dirty();
	}

	get_offset() {
		let dx = this.offset_x;
		let dy = this.offset_y;
		if(this.icon_state_meta && this.icon_state_meta.directional_offset) {
			let world_amt = this.icon_state_meta.directional_offset / 32;
			if(this.dir & 1)
				dy += world_amt;
			if(this.dir & 2)
				dy -= world_amt;
			if(this.dir & 4)
				dx += world_amt;
			if(this.dir & 8)
				dx -= world_amt;
		}
		return [dx, dy];
	}

	get color() {
		if(this._color == null && this.parent)
			return this.parent.color;
		return this._color;
	}
	set color(val) {
		if(val == this._color)
			return;
		this._color = "" + val;
		if(this.atom)
			this.atom.mark_dirty();
	}

	get alpha() {return this._alpha;}
	set alpha(val) {
		if(val == this._alpha)
			return;
		this._alpha = "" + val;
		if(this.atom)
			this.atom.mark_dirty();
	}
}

module.exports = IconRenderer;
