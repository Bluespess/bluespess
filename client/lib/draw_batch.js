'use strict';

class DrawBatch {
	constructor(client) {
		this.icon_list = [];
		this.num_vertices = 0;
		this.client = client;
		this.init_buffers();
	}

	init_buffers() {
		let gl = this.client.gl;
		this.buffers = {
			vertices: {buf: new Float32Array(2048), size: 2, attrib: "a_position", gl_buf: null, gl_pos: null, type: gl.FLOAT},
			uv: {buf: new Float32Array(2048), size: 2, attrib: "a_uv", gl_buf: null, gl_pos: null, type: gl.FLOAT},
			colors: {buf: new Float32Array(4096), size: 4, attrib: "a_color", gl_buf: null, gl_pos: null, type: gl.FLOAT},
			texture_indices: {buf: new Uint8Array(1024), size: 1, attrib: "a_tex_index", gl_buf: null, gl_pos: null, type: gl.UNSIGNED_BYTE},
			attrib_bits: {buf: new Uint8Array(1024), size: 1, attrib: "a_properties", gl_buf: null, gl_pos: null, type: gl.UNSIGNED_BYTE},
		};
		this.max_vertices = 1024;
	}

	draw() {
		if(!this.num_vertices)
			return;
		let gl = this.client.gl;
		let program = this.client.shader_default;
		gl.useProgram(program);
		for(let obj of Object.values(this.buffers)) {
			let gl_buffer = obj.gl_buf = gl.createBuffer();
			gl.bindBuffer(gl_buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new obj.buf.constructor(obj.buf.buffer, 0, this.num_vertices * obj.size), gl.STREAM_DRAW);
			let gl_pos = obj.gl_pos = gl.getAttribLocation(program, obj.attrib);
			gl.vertexAttribPointer(gl_pos, obj.size, obj.type, false, 0, 0);
			gl.enableVertexAttribArray(gl_buffer);
		}
		gl.drawArrays();
		for(let obj of Object.values(this.buffers)) {
			gl.deleteBuffer(obj.gl_buf);
			obj.gl_buf = null;
		}
	}
}

module.exports = DrawBatch;
