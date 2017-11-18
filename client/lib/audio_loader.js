'use strict';

function get_audio_buffer(url) {
	var old_buf = this.audio_buffers.get(url);
	if(old_buf)
		return old_buf;

	var promise = new Promise((resolve, reject) => {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', this.resRoot+url, true);
		xhr.responseType = 'arraybuffer';
		xhr.onload = () => {
			var data = xhr.response;
			resolve(this.audio_ctx.decodeAudioData(data));
		};
		xhr.onerror = (err) => {
			reject(err);
		};
		xhr.send();
	});
	this.audio_buffers.set(url, promise);
	return promise;
}

module.exports = get_audio_buffer;
