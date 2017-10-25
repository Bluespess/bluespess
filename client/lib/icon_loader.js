'use strict';
const $ = require('jquery');

function enqueue_icon_meta_load(newIcon, doneFunc) {
	if(this.icon_meta_load_queue[newIcon]) {
		this.icon_meta_load_queue[newIcon].push(doneFunc);
		return;
	}

	this.icon_meta_load_queue[newIcon] = doneFunc ? [doneFunc] : [];
	$.ajax({url: this.resRoot+newIcon+".json"}).done((meta) => {
		if(typeof meta === 'string') {
			meta = JSON.parse(meta);
		}
		for(var statekey in meta) {
			if(!meta.hasOwnProperty(statekey)) {
				continue;
			}
			var state = meta[statekey];
			var totalDelays = {};
			for(var dir in state.dirs) {
				if(!state.dirs.hasOwnProperty(dir)) {
					continue;
				}
				var totalDelay = 0;
				var frames = state.dirs[dir];
				for(var i = 0; i < frames.length; i++) {
					var frame = frames[i];
					totalDelay += frame.delay;
				}
				totalDelays[dir] = totalDelay;
			}
			state.totalDelays = totalDelays;
		}
		meta.__image_object = new Image();
		meta.__image_object.src = this.resRoot+newIcon;
		meta.__image_object.addEventListener("load", () => {
			// Make an image data object.
			var canvas = document.createElement("canvas");
			var ctx = canvas.getContext('2d');
			canvas.width = meta.__image_object.width;
			canvas.height = meta.__image_object.height;
			ctx.drawImage(meta.__image_object, 0, 0);
			meta.__image_data = ctx.getImageData(0, 0, canvas.width, canvas.height);

			var load_queue = this.icon_meta_load_queue[newIcon];
			for(var i = 0; i < load_queue.length; i++) {
				load_queue[i]();
			}
			this.icon_meta_load_queue[newIcon] = undefined;
		});
		this.icon_metas[newIcon] = meta;
	}).fail(function(error) {
		// Failure occured
		this.icon_metas[newIcon] = {};
		var load_queue = this.icon_meta_load_queue[newIcon];
		for(var i = 0; i < load_queue.length; i++) {
			load_queue[i](error || new Error(`Loading failed`));
		}
	});
}

module.exports = enqueue_icon_meta_load;
