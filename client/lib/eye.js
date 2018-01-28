'use strict';
const Atom = require('./atom.js');

class Eye {
	constructor(client, id) {
		this.client = client;
		this.id = id;
		this.planes = new Map();
		this.atoms = new Set();
		this.last_planes = new WeakMap();
		if(client.eyes[id])
			throw new Error(`duplicate plane of id ${id}`);
		client.eyes[id] = this;

		for(let atom of client.atoms) {
			if(atom.eye_id == id) {
				atom.eye = this;
				this.atoms.add(atom);
			}
		}

		this.origin = {x:0, y:0};
	}

	draw(timestamp) {
		if(!this.canvas)
			return;
		let ctx = this.canvas.getContext('2d');
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		for(let atom of this.atoms) {
			let last_plane = this.last_planes.get(atom);
			let plane = atom.get_plane();
			if(last_plane != plane) {
				if(last_plane)
					last_plane.atoms.delete(atom);
				if(plane)
					plane.atoms.add(atom);
				this.last_planes.set(atom, plane);
			}
		}
		for(let plane of [...this.planes.values()].sort((a, b) => {return a.z_index - b.z_index;})) {
			plane.draw(ctx, timestamp);
		}
	}
}

class Plane {
	constructor(eye, id) {
		this.z_index = 0;
		this.canvas = document.createElement("canvas");
		this.draw_canvas = document.createElement("canvas");
		this.mask_canvas = document.createElement("canvas");
		this.atoms = new Set();
		this.dirty_atoms = new Set();
		this.last_draw = new Map();
		this.eye = eye;
		this.client = eye.client;
		this.id = id;
		eye.planes.set(id, this);
	}

	draw(eye_ctx, timestamp) {
		this.size_canvases(timestamp);
		this.draw_objects(timestamp);
		this.composite_plane(eye_ctx, timestamp);
	}

	draw_objects(timestamp) {
		var ctx = this.canvas.getContext('2d');
		var dctx = this.draw_canvas.getContext('2d');
		//ctx.fillStyle = "black";
		//ctx.fillRect(0,0,this.canvas.width,this.canvas.height);

		this.client.emit("before_draw", ctx, timestamp);
		let [originx, originy] = this.calculate_origin();

		let dirty_tiles = new Set();

		if(this.last_originx != null && this.last_originy != null) {
			let offsetx = originx - this.last_originx;
			let offsety = originy - this.last_originy;
			if(offsetx != 0 || offsety != 0) {
				dctx.clearRect(0, 0, this.draw_canvas.width, this.draw_canvas.height);
				dctx.drawImage(this.canvas, -offsetx * 32, offsety * 32);
				ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
				ctx.drawImage(this.draw_canvas, 0, 0);
			}
			let twidth = this.canvas.width / 32;
			let theight = this.canvas.height / 32;
			for(let x = Math.floor(originx); x < Math.ceil(originx + twidth); x++) {
				for(let y = Math.floor(originy); x < Math.ceil(originy + theight); y++) {
					dirty_tiles.add(`[${x},${y}]`);
				}
			}
			for(let x = Math.ceil(originx); x < Math.ceil(originx + twidth); x++) {
				for(let y = Math.ceil(originy); x < Math.ceil(originy + theight); y++) {
					dirty_tiles.add(`[${x},${y}]`);
				}
			}
		}

		this.last_originx = originx;
		this.last_originy = originy;

		for(let atom of this.atoms) {
			if(!atom)
				continue;
			if(atom.get_plane() != this) {
				this.atoms.delete(atom);
				continue;
			}
			atom.on_render_tick(timestamp);
			if(atom.get_plane() != this) {
				this.atoms.delete(atom);
				continue;
			}
		}

		for(let atom of [...this.dirty_atoms].sort(Atom.atom_comparator)) {
			if(!atom)
				continue;
			var {dispx, dispy} = atom.get_displacement(timestamp);
			dispx -= originx;
			dispy -= originy;
			ctx.save();
			ctx.translate(Math.round(dispx*32), Math.round(this.canvas.height-dispy*32-32));

			let tr = atom.get_transform(timestamp);
			ctx.translate(16, 16);
			ctx.transform(tr.a, -tr.b, -tr.c, tr.d, tr.e*32, -tr.f*32);
			ctx.translate(-16, -16);
			atom.draw(ctx, timestamp);
			ctx.restore();
		}
		this.dirty_atoms.clear();

		this.client.emit("after_draw", ctx, timestamp);
	}

	calculate_origin() {
		return [0, 0];
	}

	composite_plane(eye_ctx) {
		eye_ctx.drawImage(this.canvas, 0, 0);
	}

	calculate_canvas_size() {
		return [this.eye.canvas.width, this.eye.canvas.height];
	}

	size_canvases() {
		let [width, height] = this.calculate_canvas_size();
		if(width != this.canvas.width || height != this.canvas.height) {
			this.canvas.width = width;
			this.canvas.height = height;
			this.draw_canvas.width = width;
			this.draw_canvas.height = height;
			this.mask_canvas.width = width;
			this.mask_canvas.height = height;
			return true;
		}
		return false;
	}
}

class WorldPlane extends Plane {
	constructor(eye, id) {
		super(eye, id);
	}

	calculate_canvas_size() {
		return [Math.ceil(this.eye.canvas.width / 32 + 2) * 32, Math.ceil(this.eye.canvas.height / 32 + 2) * 32];
	}

	calculate_origin() {
		let [ox, oy] = [this.eye.origin.x, this.eye.origin.y];
		return [ox-Math.floor((this.canvas.width / 32 - 1) / 2), oy-Math.floor((this.canvas.height / 32 - 1) / 2)];
	}
}

Plane.World = WorldPlane;

module.exports = {Eye, Plane};
