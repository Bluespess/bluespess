'use strict';
function anim_loop(timestamp) {
	var ctx = document.getElementById('mainlayer').getContext('2d');
	ctx.fillStyle = "black";
	ctx.fillRect(0,0,480,480);
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

	this.emit("after_draw", ctx);

	requestAnimationFrame(anim_loop.bind(this));
}

module.exports = anim_loop;
