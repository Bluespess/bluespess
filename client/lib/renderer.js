'use strict';
function anim_loop(timestamp) {
	var ctx = document.getElementById('mainlayer').getContext('2d');
	ctx.clearRect(0,0,480,480);
	for(var i = 0; i < this.atoms.length; i++) {
		var atom = this.atoms[i];
		if(atom && atom.appearance_controller) {
			atom.appearance_controller.on_render_tick(timestamp);
			var {dispx, dispy} = atom.get_displacement(timestamp);
			ctx.save();
			ctx.translate(dispx, dispy);
			atom.appearance_controller.draw(ctx, timestamp);
			ctx.restore();
		}
	}


	requestAnimationFrame(anim_loop.bind(this));
}

module.exports = anim_loop;
