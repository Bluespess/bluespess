'use strict';

const {format_html, has_component} = require('./utils.js');

module.exports = class ChatMessage {
	constructor(type, message) {
		this.type = type;
		this.message = message;
		this.msg_range = 1000;
	}

	self(a, ...b) {
		if(typeof a == "string") {
			this.self_message = a;
			return this;
		}
		return this.self(format_html(a, ...b));
	}

	deaf(a, ...b) {
		if(typeof a == "string") {
			this.deaf_message = a;
			return this;
		}
		return this.deaf(format_html(a, ...b));
	}

	blind(a, ...b) {
		if(typeof a == "string") {
			this.blind_message = a;
			return this;
		}
		return this.blind(format_html(a, ...b));
	}

	range(num) {
		this.msg_range = num;
		return this;
	}

	emit_from(atom) {
		if(!atom)
			return;
		this.emitter = atom;
		var hearers = new Set();
		for(var loc of atom.base_mover.partial_locs()) {
			for(let hearer of loc.hearers)
				hearers.add(hearer);
		}
		for(let hearer of hearers) {
			if(Math.max(Math.abs(hearer.x - atom.x), Math.abs(hearer.y - atom.y)) <= this.msg_range)
				hearer.c.Hearer.show_message(this);
		}
		return this;
	}

	show_directly_to(target, source) {
		if(!target || !source || !has_component(target, "Hearer"))
			return;
		this.emitter = source;
		target.c.Hearer.show_message(this);
		return this;
	}
};
