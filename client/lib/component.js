'use strict';
const EventEmitter = require('events');

class Component extends EventEmitter {
	constructor(atom, template) {
		super();
		if(template) {
			Object.assign(this, template);
		}
		Object.defineProperty(this, 'atom', {enumerable: false, configurable: false, writable: false, value: atom});
	}

	get a() {
		return this.atom;
	}

	destroy() {

	}
}

module.exports = Component;
