'use strict';
function anim_loop(timestamp) {

	for(let eye of Object.values(this.eyes)) {
		eye.draw(timestamp);
	}

	if(this.audio_ctx) {
		//this.audio_ctx.listener.setPosition(this.eyes[""].origin.x, 0, -this.eyes[""].origin.y);
	}

	requestAnimationFrame(anim_loop.bind(this));
}

module.exports = anim_loop;
