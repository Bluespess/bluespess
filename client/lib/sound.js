'use strict';

class Sound {
	constructor(client, sndobj = {}) {
		this.client = client;
		if(typeof sndobj.emitter == "string")
			sndobj.emitter = this.client.atoms_by_netid[sndobj.emitter];
		this.emitter = sndobj.emitter;
		this.id = sndobj.id || ("id"+Math.random());
		this.client.playing_sounds.set(this.id, this);
		this.buffer_promise = this.client.get_audio_buffer(sndobj.path);
		if(!this.client.audio_ctx)
			return;
		this.source = this.client.audio_ctx.createBufferSource();
		if(sndobj.detune)
			this.source.detune.value = sndobj.detune;
		if(sndobj.playback_rate)
			this.source.playbackRate.value = sndobj.playback_rate;
		if(sndobj.loop)
			this.source.loop = true;
		this.apply_effects(sndobj, this.source).connect(this.client.audio_ctx.destination);
	}

	apply_effects(sndobj, node) {
		if(sndobj.volume)
			node = this.apply_volume(sndobj.volume, node);
		if(sndobj.emitter)
			node = this.apply_spatial(sndobj.emitter, node);
		return node;
	}

	apply_volume(amount, node) {
		var gain = this.client.audio_ctx.createGain();
		gain.gain.value = amount;
		node.connect(gain);
		return gain;
	}

	apply_spatial(emitter, node) {
		this.spatial_node = this.client.audio_ctx.createPanner();
		this.spatial_node.panningModel = "HRTF";
		node.connect(this.spatial_node);
		this.update_spatial(emitter);
		return this.spatial_node;
	}

	update_spatial(emitter) {
		if(this.spatial_node)
			this.spatial_node.setPosition(emitter.x, 0, -emitter.y);
	}

	start() {
		this.buffer_promise.then((buf) => {
			this.source.buffer = buf;
			this.source.addEventListener("ended", this.ended.bind(this));
			this.source.start();
			this.stop = () => {
				this.source.stop();
				this.source = null;
			};
		});
	}

	stop() {
		this.ended();
		this.source = null;
	}

	ended() {
		this.client.playing_sounds.delete(this.id);
	}
}

module.exports = Sound;
