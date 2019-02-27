'use strict';

class DrawBatch {
	constructor(client) {
		this.max_icons = Math.min(client.gl.getParameter(client.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS), 255) - 1; // texture 0 is used for the lightmap
		this.icon_list = [];
		this.init_buffers();
		this.num_vertices = 0;
		this.client = client;
	}

	init_buffers() {
		this.vertices = new Float32Array(2048);
		this.colors = new Float32Array(4096);
		this.texture_indices = new Uint8Array(1024);
		this.attrib_bits = new Uint8Array(1024); // whether its lit, whether its screen-space or world-space, etc
	}

	draw() {
		if(!this.num_vertices)
			return;
		let gl = this.gl;
		let verts_buffer = gl.createBuffer();
		let colors_buffer = gl.createBuffer();
		let texture_indices_buffer = gl.createBuffer();
		let attrib_bits_buffer = gl.createBuffer();
		gl.bindBuffer(verts_buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices.buffer, 0, this.num_vertices * 2), gl.STREAM_DRAW);
		gl.bindBuffer(colors_buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices.buffer, 0, this.num_vertices * 4), gl.STREAM_DRAW);
		gl.bindBuffer(texture_indices_buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(this.vertices.buffer, 0, this.num_vertices), gl.STREAM_DRAW);
		gl.bindBuffer(attrib_bits_buffer);
		gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(this.vertices.buffer, 0, this.num_vertices), gl.STREAM_DRAW);
	}
}

module.exports = DrawBatch;
