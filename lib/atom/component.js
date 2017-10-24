'use strict';
const EventEmitter = require('events');
const mob_symbols = require('./mob.js')._symbols;
const _networked_vars = Symbol('_networked_vars');

class Component  extends EventEmitter {
	constructor(atom, template) {
		super();
		if(template) {
			Object.assign(this, template);
		}
		Object.defineProperty(this, 'atom', {enumerable: false, configurable: false, writable: false, value: atom});
	}
}

class NetworkedComponent extends Component {
	constructor(atom, template) {
		super(atom, template);
		this[_networked_vars] = {};
	}

	add_networked_var(name) {
		if(this[_networked_vars].hasOwnProperty(name))
			return;
		this[_networked_vars][name] = this[name];
		Object.defineProperty(this, name, {
			configurable: false,
			enumerable: true,
			get: () => {
				return this[_networked_vars][name];
			},
			set: (val) => {
				if(val === this[_networked_vars][name])
					return;
				this[_networked_vars][name] = val;
				this.atom[mob_symbols._update_var](name, this.constructor.name);
			}
		})
	}

	get_networked_vars() {
		// This isn't as slow as you think it is.
		return Object.assign({}, this[_networked_vars]);
	}
}

Component.Networked = NetworkedComponent;

module.exports = Component;
