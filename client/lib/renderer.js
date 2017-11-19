'use strict';
function anim_loop(timestamp) {
	var ctx = document.getElementById('mainlayer').getContext('2d');
	ctx.fillStyle = "black";
	ctx.fillRect(0,0,480,480);

	this.emit("before_draw", ctx, timestamp);

	for(var i = 0; i < this.atoms.length; i++) {
		var atom = this.atoms[i];
		if(atom) {
			atom.on_render_tick(timestamp);
			var {dispx, dispy} = atom.get_displacement(timestamp);
			ctx.save();
			ctx.translate(dispx, dispy);
			atom.draw(ctx, timestamp);
			ctx.restore();
		}
	}

	this.emit("after_draw", ctx, timestamp);

	if(this.audio_ctx) {
		this.audio_ctx.listener.setPosition(this.eyes[""].x, 0, -this.eyes[""].y);
	}

	requestAnimationFrame(anim_loop.bind(this));
}

module.exports = anim_loop;
