'use strict';

const {format_html, has_component} = require('./utils.js');

/** @typedef {ChatMessage} Bluespess.ChatMessage */

/**
 * @memberof Bluespess
 */
class ChatMessage {
	constructor(type, message) {
		/**
		 * Should be 'see' or 'hear'
		 * @type {string}
		 */
		this.type = type;
		/**
		 * @type {string}
		 */
		this.message = message;
		/**
		 * Limited to the range of the hearers
		 * @type {number}
		 * @default 1000
		 */
		this.msg_range = 1000;
	}

	/**
	 * Has template literal form, see {@link Bluespess.format_html}
	 * Sets the {@link Bluespess.ChatMessage#self_message} property, with chaining.
	 * @param {string} message
	 * @returns {Bluespess.ChatMessage} (this object)
	 */
	self(a, ...b) {
		if(typeof a == "string") {
			this.self_message = a;
			return this;
		}
		return this.self(format_html(a, ...b));
	}

	/**
	 * Has template literal form, see {@link Bluespess.format_html}
	 * Sets the {@link Bluespess.ChatMessage#deaf_message} property, with chaining.
	 * @param {string} message
	 * @returns {Bluespess.ChatMessage} (this object)
	 */
	deaf(a, ...b) {
		if(typeof a == "string") {
			this.deaf_message = a;
			return this;
		}
		return this.deaf(format_html(a, ...b));
	}

	/**
	 * Has template literal form, see {@link Bluespess.format_html}
	 * Sets the {@link Bluespess.ChatMessage#blind_message} property, with chaining.
	 * @param {string} message
	 * @returns {Bluespess.ChatMessage} (this object)
	 */
	blind(a, ...b) {
		if(typeof a == "string") {
			this.blind_message = a;
			return this;
		}
		return this.blind(format_html(a, ...b));
	}

	/**
	 * Sets the {@link Bluespess.ChatMessage#msg_range} property, with chaining
	 * @param {number} range
	 * @returns {Bluespess.ChatMessage} (this object)
	 */
	range(num) {
		this.msg_range = num;
		return this;
	}

	/**
	 * Emits this message from the atom
	 * @param {Bluespess.Atom} atom
	 * @returns {Bluespess.ChatMessage} (this object)
	 */
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

	/**
	 * Emits this message directly to the target from the source
	 * @param {Bluespess.Atom} target
	 * @param {Bluespess.Atom} source
	 * @returns {Bluespess.ChatMessage} (this object)
	 */
	show_directly_to(target, source) {
		if(!target || !source || !has_component(target, "Hearer"))
			return;
		this.emitter = source;
		target.c.Hearer.show_message(this);
		return this;
	}
}

module.exports = ChatMessage;