'use strict';
function anim_loop(timestamp) {

	for(let eye of Object.values(this.eyes)) {
		eye.draw(timestamp);
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

}

module.exports = {anim_loop, init_rendering};
