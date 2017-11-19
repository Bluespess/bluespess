'use strict';

const {format_html, has_component} = require('./utils.js');

module.exports = class ChatMessage {
	constructor(type, message, server) {
		this.type = type;
		this.message = message;
		this.server = server;
	}

	self(a, ...b) {
		if(typeof a == "string") {
			this.self_message = a;
			return;
		}
		this.self(format_html(a, ...b));
	}

	deaf(a, ...b) {
		if(typeof a == "string") {
			this.deaf_message = a;
			return;
		}
		this.deaf(format_html(a, ...b));
	}

	blind(a, ...b) {
		if(typeof a == "string") {
			this.blind_message = a;
			return;
		}
		this.blind(format_html(a, ...b));
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
			hearer.c.Hearer.show_message(this);
		}
	}

	show_directly_to(target, source) {
		if(!target || !source || !has_component(target, "Hearer"))
			return;
		this.emitter = source;
		target.c.Hearer.show_message(this);
	}
};
