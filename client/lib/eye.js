'use strict';
const Atom = require('./atom.js');
const EventEmitter = require('events');

class Eye extends EventEmitter {
	constructor(client, id) {
		super();
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

		this.mouse_over_atom = null;
		this.last_mouse_event = null;

		this.origin = {x:0, y:0, glide_size: 10, update_glide: Atom.prototype.update_glide, client: this.client, get_displacement: Atom.prototype.get_displacement};
	}

	draw(timestamp) {
		if(!this.canvas)
			return;
		let ctx = this.canvas.getContext('2d');
		ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		for(let atom of this.atoms) {
			atom.on_render_tick(timestamp);
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
		if(this.last_mouse_event)
			this.handle_mousemove(this.last_mouse_event, timestamp);
	}
	get_world_draw_pos(x, y, timestamp) {
		let {dispx, dispy} = (this.origin && this.origin.get_displacement && this.origin.get_displacement(timestamp)) || {dispx:0,dispy:0};
		dispx = Math.round(dispx*32)/32;
		dispy = Math.round(dispy*32)/32;
		return [(x-dispx+7)*32, -(y-dispy-7)*32];
	}
	screen_to_world(x, y, timestamp) {
		let {dispx, dispy} = (this.origin && this.origin.get_displacement && this.origin.get_displacement(timestamp)) || {dispx:0,dispy:0};
		return [(x/32-7+dispx), (-y/32+8+dispy)];
	}
	create_click_handlers() {
		this.canvas.addEventListener("mousedown", this.handle_mousedown.bind(this));
		this.canvas.addEventListener("mouseover", this.handle_mouseout.bind(this));
		this.canvas.addEventListener("mousemove", this.handle_mousemove.bind(this));
		this.canvas.addEventListener("mouseout", this.handle_mouseout.bind(this));
	}
	get_mouse_target(e, timestamp = performance.now()) {
		var rect = e.target.getBoundingClientRect();
		var clickX = (e.clientX - rect.left) / rect.width * e.target.width;
		var clickY = (e.clientY - rect.top) / rect.height * e.target.height;
		// Iterate through the atoms from top to bottom.
		var clickedAtom;
		for(let plane of [...this.planes.values()].sort((a, b) => {return b.z_index - a.z_index;})) {
			if(plane.no_click)
				continue;
			let [originx, originy] = plane.calculate_origin(timestamp);
			let [offsetx, offsety] = plane.calculate_composite_offset(timestamp);
			let loc = `[${Math.floor((clickX-offsetx)/32+originx)},${Math.floor((-clickY+plane.canvas.height+offsety)/32+originy)}]`;
			let tile = plane.tiles.get(loc);
			if(!tile)
				continue; //there's nothing there.
			for(let atom of [...tile].sort((a,b) => {return Atom.atom_comparator(b,a);})) {
				if(atom.mouse_opacity == undefined) {
					atom.mouse_opacity = 1;
				}
				if(atom.mouse_opacity == 0)
					continue;
				var {dispx, dispy} = atom.get_displacement(timestamp);
				dispx = Math.round(dispx*32)/32;
				dispy = Math.round(dispy*32)/32;
				let [scrx, scry] = [Math.round((dispx-originx)*32+offsetx), Math.round(plane.canvas.height-(dispy-originy)*32-32+offsety)];

				var localX = (clickX - scrx)/32;
				var localY = 1-(clickY - scry)/32;
				[localX, localY] = atom.get_transform(timestamp).inverse().multiply([localX - 0.5, localY - 0.5]);
				localX += 0.5; localY += 0.5;
				var bounds = atom.get_bounds(timestamp);
				if(bounds && localX >= bounds.x && localX < (bounds.x + bounds.width) && localY >= bounds.y && localY < (bounds.y + bounds.height)) {
					if(atom.mouse_opacity == 2 || atom.is_mouse_over(localX, localY, timestamp)) {
						clickedAtom = atom;
						break;
					}
				}
			}
			if(clickedAtom)
				break;
		}
		let [world_x, world_y] = this.screen_to_world(clickX, clickY, timestamp);
		return {"atom":clickedAtom,"x":localX,"y":localY, "ctrlKey": e.ctrlKey, "shiftKey": e.shiftKey, "altKey": e.altKey, "button": e.button, world_x, world_y};
	}

	handle_mousedown(e) {
		e.preventDefault();
		var start_meta = this.get_mouse_target(e);
		var start_time = performance.now();
		var mouseup = (e2) => {
			if(e2.button != e.button)
				return;
			document.removeEventListener("mouseup", mouseup);
			var end_time = performance.now();
			var end_meta = this.get_mouse_target(e2);
			if(end_time - start_time < 200 || end_meta.atom == start_meta.atom) {
				if(this.client.connection)
					this.client.connection.send(JSON.stringify({"click_on":Object.assign({}, start_meta, {atom: start_meta && start_meta.atom && start_meta.atom.network_id})}));
				return;
			}
			this.client.connection.send(JSON.stringify({
				"drag": {
					from: Object.assign({}, start_meta, {atom: start_meta && start_meta.atom && start_meta.atom.network_id}),
					to: Object.assign({}, end_meta, {atom: end_meta && end_meta.atom && end_meta.atom.network_id})
				}
			}));
		};
		document.addEventListener("mouseup", mouseup);
	}

	handle_mouseover(e) {
		this.last_mouse_event = e;
		let meta = this.get_mouse_target(e);
		let old = this.mouse_over_atom;
		if(this.mouse_over_atom)
			this.mouse_over_atom.emit("mouseout");
		this.mouse_over_atom = meta.atom;
		if(this.mouse_over_atom) {
			this.mouse_over_atom.emit("mouseover", Object.assign(meta, {original_event: e}));
			this.emit("mouse_over_atom_changed", old, this.mouse_over_atom);
		}
	}
	handle_mouseout() {
		let old = this.mouse_over_atom;
		if(this.mouse_over_atom) {
			this.mouse_over_atom.emit("mouseout");
		}
		this.mouse_over_atom = null;
		this.last_mouse_event = null;
		if(old)
			this.emit("mouse_over_atom_changed", old, null);
	}

	handle_mousemove(e, timestamp = performance.now()) {
		this.last_mouse_event = e;
		let meta = this.get_mouse_target(e, timestamp);
		if(meta.atom != this.mouse_over_atom) {
			if(this.mouse_over_atom)
				this.mouse_over_atom.emit("mouseout");
			let old = this.mouse_over_atom;
			this.mouse_over_atom = meta.atom;
			if(this.mouse_over_atom) {
				this.mouse_over_atom.emit("mouseover", Object.assign(meta, {original_event: e}));
			}
			this.emit("mouse_over_atom_changed", old, this.mouse_over_atom);
		} else {
			if(this.mouse_over_atom)
				this.mouse_over_atom.emit("mousemove", Object.assign(meta, {original_event: e}));
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
		this.tiles = new Map();
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
		// I know what you're thinking. "Why not use just one canvas and clip()?"
		// Well it doesn't seem to work so well in firefox if I do that.
		let ctx = this.canvas.getContext('2d');
		let dctx = this.draw_canvas.getContext('2d');
		let mctx = this.mask_canvas.getContext('2d');

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
				for(let y = Math.floor(originy); y < Math.ceil(originy + theight); y++) {
					dirty_tiles.add(`[${x},${y}]`);
				}
			}
			for(let x = Math.ceil(this.last_originx); x < Math.floor(this.last_originx + twidth); x++) {
				for(let y = Math.ceil(this.last_originy); y < Math.floor(this.last_originy + theight); y++) {
					dirty_tiles.delete(`[${x},${y}]`);
				}
			}
		}

		this.last_originx = originx;
		this.last_originy = originy;

		for(let [atom, lastbounds] of this.last_draw) {
			let dirty = false;
			if(!this.atoms.has(atom)) {
				for(let x = Math.floor(lastbounds.x); x < Math.ceil(lastbounds.x + lastbounds.width); x++) {
					for(let y = Math.floor(lastbounds.y); y < Math.ceil(lastbounds.y + lastbounds.height); y++) {
						let loc = `[${x},${y}]`;
						let set = this.tiles.get(loc);
						if(set)
							set.delete(atom);
					}
				}
				this.last_draw.delete(atom);
				dirty = true;
			} else {
				let newbounds = atom.get_transformed_bounds(timestamp);
				if(newbounds) {
					let {dispx, dispy} = atom.get_displacement(timestamp);
					dispx = Math.round(dispx*32)/32;
					dispy = Math.round(dispy*32)/32;
					newbounds.x += dispx;
					newbounds.y += dispy;
					newbounds.transform = atom.get_transform(timestamp);
					if(newbounds.x != lastbounds.x || newbounds.y != lastbounds.y || newbounds.width != lastbounds.width || newbounds.height != lastbounds.height || !newbounds.transform.equals(lastbounds.transform)) {
						for(let x = Math.floor(lastbounds.x); x < Math.ceil(lastbounds.x + lastbounds.width); x++) {
							for(let y = Math.floor(lastbounds.y); y < Math.ceil(lastbounds.y + lastbounds.height); y++) {
								let loc = `[${x},${y}]`;
								let set = this.tiles.get(loc);
								if(set)
									set.delete(atom);
							}
						}
						for(let x = Math.floor(newbounds.x); x < Math.ceil(newbounds.x + newbounds.width); x++) {
							for(let y = Math.floor(newbounds.y); y < Math.ceil(newbounds.y + newbounds.height); y++) {
								let loc = `[${x},${y}]`;
								let set = this.tiles.get(loc);
								if(!set) {
									set = new Set();
									this.tiles.set(loc, set);
								}
								set.add(atom);
								dirty_tiles.add(`[${x},${y}]`);
							}
						}
						this.last_draw.set(atom, newbounds);
						dirty = true;
					}
				} else {
					for(let x = Math.floor(lastbounds.x); x < Math.ceil(lastbounds.x + lastbounds.width); x++) {
						for(let y = Math.floor(lastbounds.y); y < Math.ceil(lastbounds.y + lastbounds.height); y++) {
							let loc = `[${x},${y}]`;
							let set = this.tiles.get(loc);
							if(set)
								set.delete(atom);
						}
					}
					this.last_draw.delete(atom);
					dirty = true;
				}
			}
			if(dirty) {
				for(let x = Math.floor(lastbounds.x); x < Math.ceil(lastbounds.x + lastbounds.width); x++) {
					for(let y = Math.floor(lastbounds.y); y < Math.ceil(lastbounds.y + lastbounds.height); y++) {
						dirty_tiles.add(`[${x},${y}]`);
					}
				}
			}
		}

		for(let atom of this.atoms) {
			let add_to_tiles = false;
			if(this.last_draw.has(atom)) {
				if(!this.dirty_atoms.has(atom))
					continue;
			} else {
				add_to_tiles = true;
			}
			let bounds = atom.get_transformed_bounds(timestamp);
			if(!bounds)
				continue;
			let {dispx, dispy} = atom.get_displacement(timestamp);
			dispx = Math.round(dispx*32)/32;
			dispy = Math.round(dispy*32)/32;
			bounds.x += dispx;
			bounds.y += dispy;
			bounds.transform = atom.get_transform(timestamp);
			for(let x = Math.floor(bounds.x); x < Math.ceil(bounds.x + bounds.width); x++) {
				for(let y = Math.floor(bounds.y); y < Math.ceil(bounds.y + bounds.height); y++) {
					let loc = `[${x},${y}]`;
					if(add_to_tiles) {
						let set = this.tiles.get(loc);
						if(!set) {
							set = new Set();
							this.tiles.set(loc, set);
						}
						set.add(atom);
					}
					dirty_tiles.add(loc);
				}
			}
			this.last_draw.set(atom, bounds);
		}
		this.dirty_atoms.clear();

		dctx.clearRect(0, 0, this.draw_canvas.width, this.draw_canvas.height);
		mctx.clearRect(0, 0, this.mask_canvas.width, this.mask_canvas.height);

		mctx.fillStyle = "#ffffff";
		for(let tile of dirty_tiles) {
			let [x,y] = JSON.parse(tile);
			mctx.fillRect((x-originx) * 32, this.mask_canvas.height - (y-originy) * 32 - 32, 32, 32);
		}

		for(let atom of [...this.atoms].sort(Atom.atom_comparator)) {
			if(!atom)
				continue;
			let bounds = atom.get_transformed_bounds(timestamp);
			if(!bounds)
				continue;
			let {dispx, dispy} = atom.get_displacement(timestamp);
			dispx = Math.round(dispx*32)/32;
			dispy = Math.round(dispy*32)/32;
			bounds.x += dispx;
			bounds.y += dispy;
			let should_draw = false;
			for(let x = Math.floor(bounds.x); x < Math.ceil(bounds.x + bounds.width); x++) {
				for(let y = Math.floor(bounds.y); y < Math.ceil(bounds.y + bounds.height); y++) {
					if(dirty_tiles.has(`[${x},${y}]`)) {
						should_draw = true;
						break;
					}
				}
				if(should_draw)
					break;
			}
			if(!should_draw)
				continue;

			dispx -= originx;
			dispy -= originy;
			dctx.save();
			dctx.translate(Math.round(dispx*32), Math.round(this.canvas.height-dispy*32-32));

			let tr = atom.get_transform(timestamp);
			dctx.translate(16, 16);
			dctx.transform(tr.a, -tr.b, -tr.c, tr.d, tr.e*32, -tr.f*32);
			dctx.translate(-16, -16);
			atom.draw(dctx, timestamp);
			dctx.restore();
		}

		ctx.globalCompositeOperation = "destination-out";
		ctx.drawImage(this.mask_canvas, 0, 0);
		ctx.globalCompositeOperation = "source-over";

		dctx.globalCompositeOperation = "destination-in";
		dctx.drawImage(this.mask_canvas, 0, 0);
		dctx.globalCompositeOperation = "source-over";

		ctx.drawImage(this.draw_canvas, 0, 0);

		this.client.emit("after_draw", ctx, timestamp);
	}

	calculate_origin() {
		return [0, 0];
	}

	calculate_composite_offset() {
		return [0, 0];
	}

	composite_plane(eye_ctx, timestamp) {
		let [ox, oy] = this.calculate_composite_offset(timestamp);
		eye_ctx.drawImage(this.canvas, ox, oy);
		//eye_ctx.globalAlpha = 0.5;
		//eye_ctx.drawImage(this.mask_canvas, 0, 0);
		//eye_ctx.globalAlpha = 1;
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
		let [ox, oy] = [Math.round(this.eye.origin.x), Math.round(this.eye.origin.y)];
		return [ox-Math.floor((this.canvas.width / 32 - 1) / 2), oy-Math.floor((this.canvas.height / 32 - 1) / 2)];
	}

	calculate_composite_offset(timestamp) {
		let [originx, originy] = this.calculate_origin();
		let {dispx, dispy} = (this.eye.origin && this.eye.origin.get_displacement) ? this.eye.origin.get_displacement(timestamp) : {dispx: 0, dispy: 0};
		dispx = Math.round(dispx*32)/32;
		dispy = Math.round(dispy*32)/32;
		return [originx*32 - dispx*32+ (7*32), -originy*32 + dispy*32 - (9*32)];
	}
}

class LightingPlane extends WorldPlane {
	constructor(eye, id) {
		super(eye, id);
		this.no_click = true;
	}

	composite_plane(eye_ctx, timestamp) {
		let dctx = this.draw_canvas.getContext('2d');
		//let mctx = this.mask_plane.getContext('2d');
		let ctx = this.canvas.getContext('2d');
		ctx.globalCompositeOperation = "destination-over";
		ctx.fillStyle = "#000000";
		ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		ctx.globalCompositeOperation = "source-over";
		dctx.clearRect(0, 0, this.draw_canvas.width, this.draw_canvas.height);
		dctx.globalCompositeOperation = "copy";
		dctx.drawImage(eye_ctx.canvas, 0, 0);
		dctx.globalCompositeOperation = "source-over";
		eye_ctx.globalCompositeOperation = "multiply";
		super.composite_plane(eye_ctx, timestamp);
		eye_ctx.globalCompositeOperation = "destination-in";
		eye_ctx.drawImage(this.draw_canvas, 0, 0);
		eye_ctx.globalCompositeOperation = "source-over";
	}
}

Plane.World = WorldPlane;
Plane.Lighting = LightingPlane;

module.exports = {Eye, Plane};
