'use strict';
const {Component} = require('../index.js');

class LightingObject extends Component {
	constructor(atom, template) {
		super(atom, template);
		this.atom.draw = this.draw.bind(this);
		this.atom.get_bounds = this.get_bounds.bind(this);
		this.atom.on_render_tick = this.on_render_tick.bind(this);
		this.atom.is_mouse_over = ()=>{return false;};
		this.atom.get_plane_id = ()=>{return "lighting";};
		this.canvas = document.createElement("canvas");
	}

	on_render_tick(timestamp) {
		let disp = this.a.get_displacement(timestamp);
		if(this.color != this.last_color) {
			this.dirty = true;
		} else if(this.radius != this.last_radius) {
			this.dirty = true;
		} else if(this.shadows_list != this.last_shadows_list) {
			this.dirty = true;
		} else if(!this.last_disp || this.last_disp.dispx != disp.dispx || this.last_disp.dispy != disp.dispy) {
			this.dirty = true;
		}
		if(this.dirty)
			this.a.mark_dirty();

		this.last_color = this.color;
		this.last_radius = this.radius;
		this.last_shadows_list = this.shadows_list;
		this.last_disp = disp;
	}

	get_bounds() {
		return {x: -this.radius, y: -this.radius, width: this.radius*2+1, height: this.radius*2+1};
	}

	draw(ctx, timestamp) {
		if(this.atom.screen_loc_x != null || this.radius !== +this.radius || !this.on)
			return;

		if(this.dirty) {
			this.canvas.width = 32+(this.radius*64);
			this.canvas.height = 32+(this.radius*64);
			var bctx = this.canvas.getContext('2d');
			bctx.fillStyle = "black";
			bctx.fillRect(0,0,bctx.width,bctx.height);

			let c = this.canvas.width*0.5;

			var {dispx, dispy} = this.atom.get_displacement(timestamp);
			if(dispx != +dispx || dispy != +dispy)
				return;
			var gradient = bctx.createRadialGradient(c, c, 0, c, c, c);
			gradient.addColorStop(0, this.color);
			gradient.addColorStop(1, 'black');
			bctx.fillStyle = gradient;
			bctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

			/*var walls = [];
			for(let i = 0; i < this.atom.client.atoms.length; i++) {
				var atom = this.atom.client.atoms[i];
				if(atom.opacity) {
					({dispx, dispy} = atom.get_displacement(timestamp));
					let wall = {x1: Math.round(dispx)-c, y1: Math.round(dispy)-c, x2: Math.round(dispx+32)-c, y2: Math.round(dispy+32)-c, base_width: 32, base_height: 32};
					if(wall.x1 > (16+this.radius*32)
					|| wall.x2 < (16-this.radius*32)
					|| wall.y1 > (16+this.radius*32)
					|| wall.y2 < (16-this.radius*32))
						continue;
					if(wall.x1 < 0 && wall.y1 < 0 && wall.x2 > 0 && wall.y2 > 0)
						continue;
					let hdist = Math.min(Math.abs(wall.x1), Math.abs(wall.x2));
					let vdist = Math.min(Math.abs(wall.y1), Math.abs(wall.y2));
					if(wall.x1 <= 0 && wall.x2 >= 0) hdist = 0;
					if(wall.y1 <= 0 && wall.y2 >= 0) vdist = 0;
					wall.dist = hdist + vdist;
					walls.push(wall);
				}
			}*/

			var wall_offset_x = -16 - dispx*32;
			var wall_offset_y = 16 + dispy*32;
			var walls = [];
			for(var shadow of this.shadows_list){
				let wall = {};
				wall.x1 = shadow.x1 * 32 + wall_offset_x;
				wall.y1 = -shadow.y2 * 32 + wall_offset_y;
				wall.x2 = shadow.x2 * 32 + wall_offset_x;
				wall.y2 = -shadow.y1 * 32 + wall_offset_y;
				wall.base_width = wall.x2 - wall.x1;
				wall.base_height = wall.y2 - wall.y1;
				if(wall.x1 < 0 && wall.y1 < 0 && wall.x2 > 0 && wall.y2 > 0)
					continue;
				let hdist = Math.min(Math.abs(wall.x1), Math.abs(wall.x2));
				let vdist = Math.min(Math.abs(wall.y1), Math.abs(wall.y2));
				if(wall.x1 <= 0 && wall.x2 >= 0) hdist = 0;
				if(wall.y1 <= 0 && wall.y2 >= 0) vdist = 0;
				wall.dist = hdist + vdist;
				walls.push(wall);
			}

			walls.sort((a,b) => {
				return a.dist - b.dist;
			});

			for(let i = 0; i < walls.length; i++) {
				var wall1 = walls[i];
				if(wall1.used_horizontally || wall1.used_vertically) {
					walls.splice(i, 1);
					i--;
					continue;
				}
				for(let j = i+1; j < walls.length; j++) {
					var wall2 = walls[j];
					if((wall1.x1 > 0 && wall1.x1 == wall2.x1 && (wall1.y1 == wall2.y2 || wall1.y2 == wall2.y1))
					|| (wall1.y1 > 0 && wall1.y1 == wall2.y1 && (wall1.x1 == wall2.x2 || wall1.x2 == wall2.x1))
					|| (wall1.x2 < 0 && wall1.x2 == wall2.x2 && (wall1.y1 == wall2.y2 || wall1.y2 == wall2.y1))
					|| (wall1.y2 < 0 && wall1.y2 == wall2.y2 && (wall1.x1 == wall2.x2 || wall1.x2 == wall2.x1))) {
						if(wall1.x1 == wall2.x1 || wall1.x2 == wall2.x2) {
							if(wall2.used_vertically)
								continue;
							wall2.used_vertically = true;
						}
						if(wall1.y1 == wall2.y1 || wall1.y2 == wall2.y2) {
							if(wall2.used_horizontally)
								continue;
							wall2.used_horizontally = true;
						}
						wall1.x1 = Math.min(wall1.x1, wall2.x1);
						wall1.y1 = Math.min(wall1.y1, wall2.y1);
						wall1.x2 = Math.max(wall1.x2, wall2.x2);
						wall1.y2 = Math.max(wall1.y2, wall2.y2);
						if(wall2.used_vertically && wall2.used_horizontally) {
							walls.splice(j,1);
							j--;
						}
					}
				}
			}

			({dispx, dispy} = this.atom.get_displacement(timestamp));
			bctx.fillStyle = "#000000";
			for(let wall of walls) {

				var sx = 1;
				var sy = 1;
				var x1 = wall.x1;
				var y1 = wall.y1;
				var x2 = wall.x2;
				var y2 = wall.y2;
				if(wall.x2 < 0) {sx = -1; [x1,x2] = [-x2,-x1];}
				if(wall.y2 < 0) {sy = -1; [y1,y2] = [-y2,-y1];}
				if(x1 <= 0 && x2 >= 0) {
					bctx.beginPath();
					bctx.moveTo(c + x1*sx, c + (y1+wall.base_height)*sy);
					bctx.lineTo(c + x1*sx, c + y1*sy);
					let scalar = (this.radius*32+48) / y1;
					bctx.lineTo(c + x1*sx*scalar, c + y1*sy*scalar);
					scalar = (this.radius*32+48) / y1;
					bctx.lineTo(c + x2*sx*scalar, c + y1*sy*scalar);
					bctx.lineTo(c + x2*sx, c + y1*sy);
					bctx.lineTo(c + x2*sx, c + (y1+wall.base_height)*sy);
					bctx.fill();
				} else if(y1 <= 0 && y2 >= 0) {
					bctx.beginPath();
					bctx.moveTo(c + (x1+wall.base_height)*sx,c + y1*sy);
					bctx.lineTo(c + x1*sx,c + y1*sy);
					let scalar = (this.radius*32+48) / x1;
					bctx.lineTo(c + x1*sx*scalar,c + y1*sy*scalar);
					scalar = (this.radius*32+48) / x1;
					bctx.lineTo(c + x1*sx*scalar,c + y2*sy*scalar);
					bctx.lineTo(c + x1*sx,c + y2*sy);
					bctx.lineTo(c + (x1+wall.base_height)*sx,c + y2*sy);
					bctx.fill();
				} else {
					bctx.beginPath();
					bctx.moveTo(c + (x1+wall.base_width)*sx,c + (y1+wall.base_height)*sy);
					bctx.lineTo(c + (x1+wall.base_width)*sx,c + (y2)*sy);
					bctx.lineTo(c + (x1)*sx,c + (y2)*sy);

					let scalar = (this.radius*32+48) / Math.max(x1,y2);
					bctx.lineTo(c + (x1)*sx*scalar,c + (y2)*sy*scalar);

					bctx.lineTo(c + (this.radius*32+48)*sx,c + (this.radius*32+48)*sy);

					scalar = (this.radius*32+48) / Math.max(x2,y1);
					bctx.lineTo(c + (x2)*sx*scalar,c + (y1)*sy*scalar);

					bctx.lineTo(c + (x2)*sx,c + (y1)*sy);
					bctx.lineTo(c + (x2)*sx,c + (y1+wall.base_height)*sy);
					bctx.fill();
				}
			}
			this.dirty = false;
		}

		ctx.globalCompositeOperation = "lighter";
		ctx.drawImage(this.canvas,-this.radius*32,-this.radius*32);
		ctx.globalCompositeOperation = "source-over";
	}
}

class LightingTile extends Component {
	constructor(atom, template) {
		super(atom, template);
	}
}

/*function overlay_lighting_layer(ctx, timestamp) {
	// draw the night vision area
	var lctx = this.lighting_canvas.getContext('2d');

	var gradient = lctx.createRadialGradient(240,240,0,240,240,48);
	gradient.addColorStop(0, "#444");
	gradient.addColorStop(0.6, "#444");
	gradient.addColorStop(1, 'black');
	lctx.fillStyle = gradient;
	lctx.globalCompositeOperation = "lighten";
	lctx.fillRect(192, 192, 288, 288);
	lctx.globalCompositeOperation = "source-over";

	lctx.save();
	lctx.beginPath();
	lctx.rect(0,0,480,480);
	for(var atom of this.atoms) {
		if (atom && atom.components && atom.components.LightingTile) {
			let {dispx, dispy} = atom.get_displacement(timestamp);
			lctx.rect(dispx, dispy, 32, 32);
		}
	}
	lctx.clip("evenodd");
	lctx.clearRect(0,0,480,480);
	lctx.restore();

	ctx.globalCompositeOperation = "multiply";
	ctx.drawImage(this.lighting_canvas, 0, 0);
	ctx.globalCompositeOperation = "source-over";

	ctx.restore();

	lctx.fillStyle = "#000000";
	lctx.fillRect(0,0,480,480);
}*/

module.exports.now = function now(client) {
	client.lighting_canvas = document.createElement("canvas");
	client.lighting_canvas.width = 480;
	client.lighting_canvas.height = 480;
	/*var lighting_atom = new Atom(client, {});
	lighting_atom.layer = 20;
	lighting_atom.draw = overlay_lighting_layer.bind(client);
	lighting_atom.get_displacement = ()=>{return {dispx:0,dispy:0};};*/
};

module.exports.components = {LightingObject, LightingTile};
