'use strict';

const {is_atom, has_component} = require('./utils.js');

var idctr = 0;

const _playing = Symbol('_playing');
const _clients = Symbol('_clients');

/**
 * @memberof Bluespess
 */
class Sound {
	/**
	 * @param {Bluespess} server
	 * @param {Object} sndobj
	 * @param {string} sndobj.path
	 * @param {number} sndobj.playback_rate How fast to play it, also affects pitch
	 * @param {boolean} sndobj.vary Multiplies playback_rate by a number between 0.75 and 1.25
	 */
	constructor(server, sndobj) {
		Object.assign(this, sndobj);
		Object.defineProperty(this, 'id', {enumerable: true,configurable: false,writable: false,value: "ID_" + idctr++});
		Object.defineProperty(this, 'server', {enumerable: false,configurable: false,writable: false,value: server});
		this[_playing] = null;

		if(this.vary) {
			if(!this.playback_rate)
				this.playback_rate = 1;
			this.playback_rate *= Math.random() * 0.5 + 0.75;
		}
	}

	/**
	 * @param {Array<Bluespess.Atom<Mob>|Client>|Bluespess.Atom<Mob>|Client} mobs
	 */
	play_to(mobs) {
		if(!(mobs instanceof Array))
			mobs = [mobs];
		if(this.playing != null)
			throw new Error('Cannot play sound more than once. Create new sound instead.');
		this[_playing] = true;
		var clients = new Set();
		for(let mob of mobs) {
			if(!is_atom(mob) && mob && mob.mob)
				clients.add(mob);
			if(!has_component(mob, "Eye"))
				continue;
			for(let observer of mob.c.Eye.observers()) {
				if(observer.c.Hearer.can_hear_sound(this) && observer.c.Mob.client)
					clients.add(observer.c.Mob.client);
			}
			if(has_component(mob, "Mob"))
				if(mob.c.Hearer.can_hear_sound(this) && mob.c.Mob.client)
					clients.add(mob.c.Mob.client);
		}
		for(let client of clients) {
			if(!client.next_message.sound)
				client.next_message.sound = {};
			if(!client.next_message.sound.play)
				client.next_message.sound.play = [];
			client.next_message.sound.play.push(this);
		}
		this[_clients] = clients;
	}

	/**
	 * Emits the sound from the given atom
	 * @param {Bluespess.Atom} emitter
	 */
	emit_from(atom) {
		if(!this.emitter)
			this.emitter = {x:atom.x, y:atom.y};
		var hearers = new Set();
		for(var loc of atom.base_mover.partial_locs()) {
			for(let hearer of loc.hearers) {
				hearers.add(hearer);
			}
		}
		var clients = [];
		for(let hearer of hearers) {
			if(has_component(hearer, "Mob") && hearer.c.Hearer.can_hear_sound(this)) {
				clients.push(hearer.c.Mob.client);
			}
		}
		this.play_to(clients);
	}

	/**
	 * Makes the sound stop playing.
	 */
	stop() {
		if(!this.playing)
			return;
		this[_playing] = false;
		for(let client of this[_clients]) {
			if(!client.next_message.sound)
				client.next_message.sound = {};
			if(!client.next_message.sound.stop)
				client.next_message.sound.stop = [];
			client.next_message.sound.stop.push(this.id);
		}
	}

	/**
	 * @type {boolean}
	 */
	get playing() {
		return this[_playing];
	}
}

module.exports = Sound;
