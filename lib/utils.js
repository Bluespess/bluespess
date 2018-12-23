/// <reference path="./utils_overloads.d.ts">
'use strict';

var Atom, Client, ChatMessage;

const _chain_parent = Symbol('_chain_parent');
const _chain_spliced = Symbol('_chain_spliced');

/**
 * @typedef {import('./atom/atom')} Bluespess.Atom
 * @typedef {import('./client')} Client
 * @typedef {import('./chat_message')} Bluespess.ChatMessage
 */


module.exports = {
	/**
	 * Sort of like Object.assign(), but it assigns *behind* the other object, and it's also recursive.
	 * @memberof Bluespess
	 * @param {Object} a
	 * @param {Object} b
	 */
	weak_deep_assign(a, b) {
		for(var key in b) {
			if(!b.hasOwnProperty(key))
				continue;
			if(typeof b[key] == "object" && b[key] != null && !(b[key] instanceof Array) && (!a.hasOwnProperty(key) || typeof a[key] != "object" || a[key] == null || (a[key] instanceof Array)))
				a[key] = {};
			if(a.hasOwnProperty(key)) {
				if((typeof a[key] == "object" && a[key] != null && !(a[key] instanceof Array)) && (typeof b[key] == "object" && b[key] != null && !(b[key] instanceof Array)))
					module.exports.weak_deep_assign(a[key], b[key]);
			} else {
				a[key] = b[key];
			}
		}
		return a;
	},

	// Recursive version of Object.create()
	deep_create(obj) {
		var newobj = Object.create(obj);
		for(var key in obj) {
			if(!obj.hasOwnProperty(key))
				continue;
			if(typeof obj[key] == "object" && !(obj[key] instanceof Array))
				newobj[key] = module.exports.deep_create(obj[key]);
		}
		return newobj;
	},

	/**
	 * Used for overriding functions. Similar to underscore's <code>wrap</code> function.
	 * @example
	 * function foo(a) {
	 * 	return a;
 	 * }
	 * console.log(foo("bar")); // logs "bar"
	 * foo = chain_func(foo, function(prev) {
	 * 	return prev() + "baz";
	 * });
	 * let splice = foo.splice;
	 * console.log(foo("bar")); // logs "barbaz"
	 * splice();
	 * console.log(foo("bar")); // logs "bar"
	 * @memberof! Bluespess
	 * @static
	 * @param {Function} func1 The original Function
	 * @param {Function} func2 The function overriding this one. The first argument should be <code>prev</code>
	 * @returns {Function}
	 */
	chain_func(func1, func2) {
		if(func2 == undefined)
			throw new Error('Chaining undefined function!');
		function chained_func(...args) {
			while(chained_func[_chain_parent] && chained_func[_chain_parent][_chain_spliced]) {
				chained_func[_chain_parent] = chained_func[_chain_parent][_chain_parent];
			}
			let prev = (...override_args)=>{
				if(!chained_func[_chain_parent])
					return;
				if(override_args.length)
					return chained_func[_chain_parent].call(this, ...override_args);
				else
					return chained_func[_chain_parent].call(this, ...args);
			};
			if(chained_func[_chain_spliced])
				return prev();
			return func2.call(this, prev, ...args);
		}
		chained_func.splice = function() {
			chained_func[_chain_spliced] = true;
		};
		chained_func[_chain_spliced] = false;
		chained_func[_chain_parent] = func1;
		return chained_func;
	},

	/**
	 * 
	 * @param {any} obj 
	 * @param {string} name 
	 * @param {string|((val) => boolean)} check 
	 */
	make_watched_property(obj, name, check) {
		let init_value = obj[name];
		let value = null;
		let event_name = `${name}_changed`;
		if(typeof check == "string") {
			let type = check;
			check = function(val) {
				if(typeof val != type)
					return true;
			};
		}
		if(check && init_value !== undefined && check(init_value))
			throw new Error(`Initial value ${init_value} for ${name} failed type check!`);
		Object.defineProperty(obj, name, {
			get() {
				return value;
			},
			set(val) {
				if(check && check(val))
					throw new Error(`Setting ${name} to ${val} failed type check!`);
				if(val === value)
					return;
				let old = value;
				value = val;
				obj.emit(event_name, old, val);
			},
			enumerable: true
		});
		if(init_value !== undefined)
			obj[name] = init_value;
	},

	/**
	 * Checks if a given object is an atom and has the given component
	 * @memberof Bluespess
	 * @param {Bluespess.Atom} atom The object to check
	 * @param {string} name The name of the component
	 * @returns {boolean}
	 */
	has_component(atom, name) {
		return atom && (atom instanceof Atom) && !!atom.components[name];
	},

	/**
	 * Checks if a given object is an atom
	 * @memberof Bluespess
	 * @param {Bluespess.Atom} atom The object to check
	 * @returns {boolean}
	 */
	is_atom(atom) {
		return atom && (atom instanceof Atom);
	},

	/**
	 * Rotates the given direction by the given angle clockwise
	 * @memberof Bluespess
	 * @param {number} dir The direction to turn
	 * @param {number} angle The angle to turn it by
	 * @returns {number} The resulting direction
	 */
	turn_dir(dir, angle) {
		dir = dir & 15;
		angle = ((angle % 360 + 360) % 360);
		return [ // woo lookup table time
			[0, 1, 2 ,3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,15],
			[0, 5,10,15, 6, 4, 2,15, 9, 1, 8,15,15,15,15,15],
			[0, 4, 8,12, 2, 6,10,14, 1, 5, 9,13, 3, 7,11,15],
			[0, 6, 9,15,10, 2, 8,15, 5, 4, 1,15,15,15,15,15],
			[0, 2, 1, 3, 8,10, 9,11, 4, 6, 5, 7,12,14,13,15],
			[0,10, 5,15, 9, 8, 1,15, 6, 2, 4,15,15,15,15,15],
			[0, 8, 4,12, 1, 9, 5,13, 2,10, 6,14, 3,11, 7,15],
			[0, 9, 6,15, 5, 1, 4,15,10, 8, 2,15,15,15,15,15]
		][Math.floor(angle / 90) * 2 + ((angle % 90) == 0 ? 0 : 1)][dir];
	},

	dir_dx(dir) {
		var dx = 0;
		if(dir & 4)
			dx++;
		if(dir & 8)
			dx--;
		return dx;
	},

	dir_dy(dir) {
		var dy = 0;
		if(dir & 1)
			dy++;
		if(dir & 2)
			dy--;
		return dy;
	},

	dir_to(dx, dy) {
		let dir = 0;
		if(dy > 0) dir |= 1;
		if(dy < 0) dir |= 2;
		if(dx > 0) dir |= 4;
		if(dx < 0) dir |= 8;
		return dir;
	},

	/**
	 * Returns a promise that resolves on setImmediate(). Useful for doing expensive things without blocking the node.js event loop.
	 * @memberof Bluespess
	 * @async
	 */
	stoplag() {
		return new Promise((resolve) => {
			setImmediate(resolve);
		});
	},

	/**
	 * Returns a promise that resolves in the given amount of time.
	 * @memberof Bluespess
	 * @param {number} time The amount of time before resolving the promise, in milliseconds.
	 * @async
	 */
	sleep(time = 0) {
		return new Promise((resolve) => {
			setTimeout(resolve, time);
		});
	},

	/**
	 * Has template literal form, see {@link Bluespess.format_html}
	 * Builds a visible chat message object
	 * @param {string} message
	 * @returns {Bluespess.ChatMessage} (this object)
	 * @memberof Bluespess
	 */
	visible_message(a, ...b) {
		if(typeof a == "string") {
			return new ChatMessage("see", a);
		}
		return module.exports.visible_message(module.exports.format_html(a, ...b));
	},

	/**
	 * Has template literal form, see {@link Bluespess.format_html}
	 * Builds an audible chat message object
	 * @param {string} message
	 * @returns {Bluespess.ChatMessage} (this object)
	 * @memberof Bluespess
	 */
	audible_message(a, ...b) {
		if(typeof a == "string") {
			return new ChatMessage("hear", a);
		}
		return module.exports.audible_message(module.exports.format_html(a, ...b));
	},

	/**
	 * Sends the given chat message to the given clients. There's a tagged template literal form of this function that uses format_html that is demonstrated in the example
	 * @example
	 * to_chat(user, "<span class='warning'>The action failed</span>");
	 *
	 * // If you use this in tagged template literal form:
	 * to_chat`<span class='warning'>The ${this.a} explodes!</span>`(user);
	 * // It's the equivalent to:
	 * to_chat(user, format_html`<span class='warning'>The ${this.a} explodes!</span>`);
	 *
	 * // Be careful, if you do this, the HTML will not be escaped! Use one of the above 2 formats to ensure that your HTML is escaped to prevent XSS exploits.
	 * to_chat(user, `<span class='warning'>The ${this.a} explodes!</span>`);
	 * @memberof Bluespess
	 * @see {@link Bluespess#format_html}
	 * @param {Bluespess.Atom|Client|Array<Bluespess.Atom|Client>} target
	 * @param {string} message
	 */
	to_chat(a, ...b) {
		if(a instanceof Atom || a instanceof Client) {
			var cl;
			if(a instanceof Client)
				cl = a;
			else
				cl = a.c.Mob.client;
			if(!cl)
				return;
			if(!cl.next_message.to_chat)
				cl.next_message.to_chat = [];
			cl.next_message.to_chat.push(b.join(""));
		} else if(a instanceof Array && a.length && (a[0] instanceof Atom || a[0] instanceof Client || a[0] instanceof Array)) {
			for(var item of a) {
				module.exports.to_chat(item, ...b);
			}
		} else {
			var formatted = module.exports.format_html(a, ...b);
			return (...items) => {
				module.exports.to_chat(items, formatted);
			};
		}
	},

	/**
	 * A tagged template literal function.
	 * Anything in the <code>${}</code> is escaped.
	 * @example
	 * // obj gets html-escaped.
	 * let obj = "<b>hah</b>";
	 * let formatted = format_html`<span class='warning'>The ${str} explodes!</span>`;
	 * console.log(formatted);
	 * // <span class='warning'>The &lt;b&gt;hah&lt;/b&gt; explodes!</span>
	 * @param {TemplateStringsArray} strs
	 * @param {...(string|Bluespess.Atom)} tags
	 * @returns {string}
	 * @memberof Bluespess
	 */
	format_html(strs, ...tags) {
		var out_str = '';
		for(let i = 0; i < strs.length; i++) {
			var pre_tag = strs[i];
			if(i == strs.length - 1) {
				out_str += pre_tag;
				continue;
			}
			var str_tag = ""+tags[i];
			var is_proper = str_tag.length && str_tag[0] == str_tag[0].toUpperCase();
			var gender = "neuter";
			if(tags[i] instanceof Atom) {
				if(tags[i].force_improper)
					is_proper = false;
				if(tags[i].force_proper)
					is_proper = true;
				gender = tags[i].gender;
			}
			if(is_proper)
				pre_tag = pre_tag.replace(/(^|[ \t.,>])(?:the|a) (?=(?:[ \t]|(?:<[^>]+>))*$)/i, "$1");
			else if(gender == "plural")
				pre_tag = pre_tag.replace(/((?:^|[ \t.,>]))a(?= (?:[ \t]|(?:<[^>]+>))*$)/i, "$1some");
			else if(str_tag.match(/^[aeiou]/i))
				pre_tag = pre_tag.replace(/((?:^|[ \t.,>])a)(?= (?:[ \t]|(?:<[^>]+>))*$)/i, "$1n");
			tags[i] = ""+tags[i];
			out_str += pre_tag;
			out_str += module.exports.escape_html(tags[i]);
		}
		return out_str;
	},

	/**
	 * Escapes the characters &, <, >, ", and ' using their HTML encodings.
	 * @memberof Bluespess
	 * @param {string} str
	 * @returns {string}
	 */
	escape_html(str) {
		return str.replace(/[&<>"']/gi, (chr) => {
			if(chr == '&') return '&amp;';
			if(chr == '<') return '&lt;';
			if(chr == '>') return '&gt;';
			if(chr == '"') return '&quot;';
			if(chr == "'") return '&#039;';
		});
	},

	do_require() {
		Atom = require('./atom/atom.js');
		Client = require('./client.js');
		ChatMessage = require('./chat_message.js');
	},

	/**
	 * @memberof Bluespess
	 * @default 1
	 * @constant
	 */
	NORTH: 1,
	/**
	 * @memberof Bluespess
	 * @default 2
	 * @constant
	 */
	SOUTH: 2,
	/**
	 * @memberof Bluespess
	 * @default 4
	 * @constant
	 */
	EAST: 4,
	/**
	 * @memberof Bluespess
	 * @default 8
	 * @constant
	 */
	WEST: 8,

	readonly_traps: {set: ()=>{},deleteProperty: ()=>{},defineProperty: ()=>{},setPrototypeOf: ()=>{},isExtensible:()=>{return false;}}
};
