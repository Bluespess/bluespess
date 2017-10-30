'use strict';
const {chain_func, Component} = require('../index.js');
const Atom = require('./atom.js');

var buffer_canvas = document.createElement("canvas");

class LightingObject extends Component {
	constructor(atom, template) {
		super(atom, template);
		this.atom.draw = chain_func(this.atom.draw, this.draw.bind(this));
		this.atom.is_mouse_over = ()=>{return false;};
		console.log(this);
	}

	draw(prev, ctx, timestamp) {
		if(this.atom.screen_loc_x != null || this.radius !== +this.radius || !this.on)
			return;

		buffer_canvas.width = ctx.canvas.width;
		buffer_canvas.height = ctx.canvas.height;

		var bctx = buffer_canvas.getContext('2d');
		bctx.fillStyle = "black";
		bctx.fillRect(0,0,480,480);

		var {dispx, dispy} = this.atom.get_displacement(timestamp);
		var cx = dispx+16;
		var cy = dispy+16;
		var gradient = bctx.createRadialGradient(cx,cy,0,cx,cy,16+(this.radius*32));
		gradient.addColorStop(0, this.color);
		gradient.addColorStop(1, 'black');
		bctx.fillStyle = gradient;
		bctx.fillRect(-this.radius*32+dispx, -this.radius*32+dispy, this.radius*2*32+32, this.radius*2*32+32);

		/*var walls = [];
		for(let i = 0; i < this.atom.client.atoms.length; i++) {
			var atom = this.atom.client.atoms[i];
			if(atom.opacity) {
				({dispx, dispy} = atom.get_displacement(timestamp));
				let wall = {x1: Math.round(dispx)-cx, y1: Math.round(dispy)-cy, x2: Math.round(dispx+32)-cx, y2: Math.round(dispy+32)-cy, base_width: 32, base_height: 32};
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
		var wall_offset_x = -16 - (this.atom.x+(this.atom.glide?this.atom.glide.x:0))*32;
		var wall_offset_y = 16 + (this.atom.y+(this.atom.glide?this.atom.glide.y:0))*32;
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
				bctx.moveTo(cx + x1*sx, cy + (y1+wall.base_height)*sy);
				bctx.lineTo(cx + x1*sx, cy + y1*sy);
				let scalar = (this.radius*32+48) / y1;
				bctx.lineTo(cx + x1*sx*scalar, cy + y1*sy*scalar);
				scalar = (this.radius*32+48) / y1;
				bctx.lineTo(cx + x2*sx*scalar, cy + y1*sy*scalar);
				bctx.lineTo(cx + x2*sx, cy + y1*sy);
				bctx.lineTo(cx + x2*sx, cy + (y1+wall.base_height)*sy);
				bctx.fill();
			} else if(y1 <= 0 && y2 >= 0) {
				bctx.beginPath();
				bctx.moveTo(cx + (x1+wall.base_height)*sx,cy + y1*sy);
				bctx.lineTo(cx + x1*sx,cy + y1*sy);
				let scalar = (this.radius*32+48) / x1;
				bctx.lineTo(cx + x1*sx*scalar,cy + y1*sy*scalar);
				scalar = (this.radius*32+48) / x1;
				bctx.lineTo(cx + x1*sx*scalar,cy + y2*sy*scalar);
				bctx.lineTo(cx + x1*sx,cy + y2*sy);
				bctx.lineTo(cx + (x1+wall.base_height)*sx,cy + y2*sy);
				bctx.fill();
			} else {
				bctx.beginPath();
				bctx.moveTo(cx + (x1+wall.base_width)*sx,cy + (y1+wall.base_height)*sy);
				bctx.lineTo(cx + (x1+wall.base_width)*sx,cy + (y2)*sy);
				bctx.lineTo(cx + (x1)*sx,cy + (y2)*sy);

				let scalar = (this.radius*32+48) / Math.max(x1,y2);
				bctx.lineTo(cx + (x1)*sx*scalar,cy + (y2)*sy*scalar);

				bctx.lineTo(cx + (this.radius*32+48)*sx,cy + (this.radius*32+48)*sy);

				scalar = (this.radius*32+48) / Math.max(x2,y1);
				bctx.lineTo(cx + (x2)*sx*scalar,cy + (y1)*sy*scalar);

				bctx.lineTo(cx + (x2)*sx,cy + (y1)*sy);
				bctx.lineTo(cx + (x2)*sx,cy + (y1+wall.base_height)*sy);
				bctx.fill();
			}
		}

		var lctx = this.atom.client.lighting_canvas.getContext('2d');
		lctx.globalCompositeOperation = "lighter";
		lctx.drawImage(buffer_canvas,0,0);
		lctx.globalCompositeOperation = "source-over";
	}
}

class LightingTile extends Component {
	constructor(atom, template) {
		super(atom, template);
	}
}

function overlay_lighting_layer(ctx) {
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

	ctx.globalCompositeOperation = "multiply";
	ctx.drawImage(this.lighting_canvas, 0, 0);
	ctx.globalCompositeOperation = "source-over";

	lctx.fillStyle = "#000000";
	lctx.fillRect(0,0,480,480);
}

module.exports.now = function now(client) {
	client.lighting_canvas = document.createElement("canvas");
	client.lighting_canvas.width = 480;
	client.lighting_canvas.height = 480;
	var lighting_atom = new Atom(client, {});
	lighting_atom.layer = 20;
	lighting_atom.draw = overlay_lighting_layer.bind(client);
	lighting_atom.get_displacement = ()=>{return {dispx:0,dispy:0};};
	//client.on("after_draw", overlay_lighting_layer.bind(client));
};

module.exports.components = {LightingObject, LightingTile};
