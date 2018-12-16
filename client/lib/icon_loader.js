'use strict';

function enqueue_icon_meta_load(newIcon) {
	if(this.icon_meta_load_queue[newIcon]) {
		return this.icon_meta_load_queue[newIcon];
	}
	var promise = new Promise((resolve, reject)=>{
		var xhr = new XMLHttpRequest();
		xhr.open("GET", this.resRoot+newIcon+".json", true);
		xhr.responseType = "json";
		xhr.onload = () => {
			var meta = xhr.response;
			let default_meta = false;
			if(!meta) {
				default_meta = true;
				meta = {
					"": {
						"dir_count": 1,
						"width": 32,
						"height": 32,
						"dirs": {
							"2": {
								"frames": [
									{
										"x": 0,
										"y": 0,
										"delay": 500
									}
								]
							}
						},
						"tile_size": 32
					}
				};
			}
			for(var statekey in meta) {
				if(!meta.hasOwnProperty(statekey)) {
					continue;
				}
				var state = meta[statekey];
				for(var dir in state.dirs) {
					if(!state.dirs.hasOwnProperty(dir)) {
						continue;
					}
					var total_delay = 0;
					var dir_meta = state.dirs[dir];
					for(var i = 0; i < dir_meta.frames.length; i++) {
						var frame = dir_meta.frames[i];
						total_delay += frame.delay;
					}
					dir_meta.total_delay = total_delay;
				}
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
				if(default_meta) {
					meta[""].width = meta.__image_object.width;
					meta[""].height = meta.__image_object.height;
				}
				resolve();
				this.icon_meta_load_queue[newIcon] = undefined;
			});
			meta.__image_object.addEventListener("error", (error) => {
				reject(error || new Error(`Loading failed for ${newIcon}`));
			});
			this.icon_metas[newIcon] = meta;
		};
		xhr.send();
	});
	this.icon_meta_load_queue[newIcon] = promise;
	return promise;
}

module.exports = enqueue_icon_meta_load;
