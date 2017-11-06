'use strict';
const EventEmitter = require('events');
const mob_symbols = require('./mob.js')._symbols;
const _networked_vars = Symbol('_networked_vars');

class Component extends EventEmitter {
	constructor(atom, template) {
		super();
		if(template) {
			Object.assign(this, template);
		}
		Object.defineProperty(this, 'atom', {enumerable: false, configurable: false, writable: false, value: atom});
		if(!this.a.server.atoms_for_components[this.constructor.name]) {
			this.a.server.atoms_for_components[this.constructor.name] = new Set();
		}
		this.a.server.atoms_for_components[this.constructor.name].add(atom);
	}

	get a() {
		return this.atom;
	}

	destroy() {
		this.a.server.atoms_for_components[this.constructor.name].delete(this.atom);
	}
}

class NetworkedComponent extends Component {
	constructor(atom, template) {
		super(atom, template);
		this[_networked_vars] = {};
	}

	add_networked_var(name, on_set) {
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
				if(on_set && !on_set(val))
					return;
				this[_networked_vars][name] = val;
				this.atom[mob_symbols._update_var](name, this.constructor.name);
			}
		});
	}

	get_networked_vars() {
		// This isn't as slow as you think it is.
		return Object.assign({}, this[_networked_vars]);
	}
}

Component.Networked = NetworkedComponent;

module.exports = Component;
