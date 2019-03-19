'use strict';

function anim_loop(timestamp) {

	for(let eye of Object.values(this.eyes)) {
		eye.draw_gl(timestamp);
	}

	if(this.audio_ctx) {
		for(let sound of this.playing_sounds.values()) {
			sound.update_spatial(sound.emitter, timestamp);
		}
	}

	requestAnimationFrame(anim_loop.bind(this));
}

function init_rendering() {
	this.gl = document.createElement("canvas").getContext("webgl");
	const gl = this.gl;
	// build the default shader
	this.max_icons_per_batch = Math.min(gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),256);
	let texture_switch = (function build_texture_switch(s, l) { // fancy ass recursive binary tree thingy for SANIC SPEED... I hope
		if(l == 0)
			return "";
		else if(l == 1)
			return s == 0 ? "" : `color *= texture2D(u_texture[${s}], v_uv);`;
		else {
			let split_point = Math.ceil(l/2);
			return `if(v_tex_index < ${split_point+s}.0){${build_texture_switch(s, split_point)}}else{${build_texture_switch(s+split_point, l-split_point)}}`;
		}
	}(0, this.max_icons_per_batch)); // it would be so much easier if I could just index the goddamn array normally but no they had to be fuckers and now I have this super convoluted if/else tree god damn it glsl why you do this to me
	this.shader_default = this.compile_shader_program(`
precision mediump float;

attribute vec2 a_position;
attribute vec4 a_color;
varying vec4 v_color;
attribute vec2 a_uv;
varying vec2 v_uv;
attribute float a_tex_index;
varying float v_tex_index;
attribute float a_properties;
varying float v_properties;

uniform vec2 u_world_origin;
uniform vec2 u_viewport_tile_size;

void main() {
	v_color = a_color;
	v_uv = a_uv;
	v_tex_index = a_tex_index;
	v_properties = a_properties;
	gl_Position = vec4((a_position - (mod(a_properties, 2.0) > 0.5 ? (u_world_origin+vec2(0.5,0.5)) : (u_viewport_tile_size/2.0))) / u_viewport_tile_size * 2.0, 0.0, 1.0);
}
`,`
precision mediump float;
uniform sampler2D u_texture[${this.max_icons_per_batch}];
varying vec4 v_color;
varying vec2 v_uv;
varying float v_tex_index;
varying float v_properties;
uniform vec2 u_viewport_size;


void main() {     // fucking shit why is there no bitwise and
	vec4 color = (mod(v_properties, 4.0)/2.0 > 0.5) ? texture2D(u_texture[0], gl_FragCoord.xy/u_viewport_size) : vec4(1,1,1,1);
	color *= v_color;
	${texture_switch}
	gl_FragColor = color;
}
`);

	this.gl_world_origin = [0, 0];
	this.gl_viewport_tile_size = [1, 1];
	this.gl_viewport = [32, 32];
	this.gl_world_space = true;
	this.gl_current_batch = null;

	this.gl_texture_cache = new Map();
	this.gl_uniform_cache = new Map();

	this.gl_uniform_cache.set(this.shader_default, {
		u_viewport_size: gl.getUniformLocation(this.shader_default, "u_viewport_size"),
		u_viewport_tile_size: gl.getUniformLocation(this.shader_default, "u_viewport_tile_size"),
		u_world_origin: gl.getUniformLocation(this.shader_default, "u_world_origin")
	});

	this.gl_white_texture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, this.gl_white_texture);
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));

	gl.enable(gl.BLEND);
	gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

function get_texture(key) {
	const gl = this.gl;
	if(this.gl_texture_cache.has(key)) {
		return this.gl_texture_cache.get(key);
	}
	if(this.icon_metas[key]) {
		let img = this.icon_metas[key].__image_object;
		if(!img || !img.complete)
			return this.gl_white_texture;
		let texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		this.gl_texture_cache.set(key, texture);
		return texture;
	}
	return this.gl_white_texture;
}

function compile_shader(code, type) {
	const gl = this.gl;
	let shader = gl.createShader(type);
	gl.shaderSource(shader, code);
	gl.compileShader(shader);
	if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
		throw new Error((type == gl.VERTEX_SHADER ? "VERTEX SHADER " : "FRAGMENT SHADER ") + gl.getShaderInfoLog(shader));
	}
	return shader;
}

function compile_shader_program(vertex_code, fragment_code) {
	const gl = this.gl;
	let program = gl.createProgram();
	gl.attachShader(program, this.compile_shader(vertex_code, gl.VERTEX_SHADER));
	gl.attachShader(program, this.compile_shader(fragment_code, gl.FRAGMENT_SHADER));
	gl.linkProgram(program);
	if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(gl.getProgramInfoLog (program));
	}
	return program;
}

module.exports = {anim_loop, init_rendering, compile_shader, compile_shader_program, get_texture};
