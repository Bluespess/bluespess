'use strict';
const Atom = require('./atom/atom.js');
const Client = require('./client.js');
const ChatMessage = require('./chat_message.js');
module.exports = {
	// Sort of like Object.assign(), but it assigns *behind* the other object, and it's also recursive.
	weak_deep_assign(a, b) {
		for(var key in b) {
			if(!b.hasOwnProperty(key))
				continue;
			if(typeof b[key] == "object" && b[key] != null && !(b[key] instanceof Array) && (!a.hasOwnProperty(key) || typeof a[key] != "object" || a[key] == null || (a[key] instanceof Array)))
				a[key] = {};
			if(a.hasOwnProperty(key)) {
				if((typeof a[key] == "object" && a[key] != null && !(a[key] instanceof Array)) && (typeof b[key] == "object" && b[key] != null && !(b[key] instanceof Array)))
					module.exports.weakDeepAssign(a[key], b[key]);
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
				newobj[key] = module.exports.deepCreate(obj[key]);
		}
		return newobj;
	},

	// Chaining:
	// Basically, you do it like this:
	// *original func* = chain_func(*original func*, *replacement func*);
	// This outputs a function which when called, calls the replacement function
	// but with an argument inserted at the beginning that is a reference to a function
	// referencing the original function.
	chain_func(func1, func2) {
		if(func2 == undefined)
			throw new Error('Chaining undefined function!');
		return function chained_func(...args) {
			return func2.call(this, (...override_args)=>{
				if(!func1)
					return;
				if(override_args.length)
					return func1.call(this, ...override_args);
				else
					return func1.call(this, ...args);
			}, ...args);
		};
	},

	has_component(atom, name) {
		return atom && (atom instanceof Atom) && !!atom.components[name];
	},

	is_atom(atom) {
		return atom && (atom instanceof Atom);
	},

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

	// setImmediate in promise form basically.
	stoplag() {
		return new Promise((resolve) => {
			setImmediate(resolve);
		});
	},

	sleep(time = 0) {
		return new Promise((resolve) => {
			setTimeout(resolve, time);
		});
	},

	visible_message(a, ...b) {
		if(typeof a == "string") {
			return new ChatMessage("see", a, this);
		}
		return this.visible_message(this.format_html(a, ...b));
	},

	audible_message(a, ...b) {
		if(typeof a == "string") {
			return new ChatMessage("hear", a, this);
		}
		return this.audible_message(this.format_html(a, ...b));
	},

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
				this.to_chat(item, ...b);
			}
		} else {
			var formatted = this.format_html(a, ...b);
			return (...items) => {
				this.to_chat(items, formatted);
			};
		}
	},

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
			var gender = "neutral";
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
			out_str += this.escape_html(tags[i]);
		}
		return out_str;
	},

	escape_html(str) {
		return str.replace(/[&<>"']/gi, (chr) => {
			if(chr == '&') return '&amp;';
			if(chr == '<') return '&lt;';
			if(chr == '>') return '&gt;';
			if(chr == '"') return '&quot;';
			if(chr == "'") return '&#039;';
		});
	},

	readonly_traps: {set: ()=>{},deleteProperty: ()=>{},defineProperty: ()=>{},setPrototypeOf: ()=>{},isExtensible:()=>{return false;}}
};
