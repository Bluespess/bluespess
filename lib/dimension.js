'use strict';
const _locations = Symbol('_locations');
const _step_cache = Symbol('_step_cache');

/** @typedef {import('./server')} Bluespess */
/** @typedef {import('./atom/atom')} Bluespess.Atom */

class Dimension {
	constructor(server) {
		this.server = server;
		this[_locations] = new Map();
	}

	/**
	 * Used for getting a specific location.
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @return {Location} The location object.
	 */
	location(x,y,z) {
		if(x !== +x || y !== +y || z !== +z) { // OI THERE NUMBERS only
			// This will catch them being not numbers, and also them being NaN
			throw new TypeError(`Invalid location: ${x},${y},${z}`);
		}
		x = Math.round(x)|0;y = Math.round(y)|0;z = Math.floor(z)|0;
		var id = `${x},${y},${z}`;
		var loc = this[_locations].get(id);
		if(loc) {
			return loc;
		}
		loc = new Location(x,y,z, this, this.server);
		this[_locations].set(id, loc);
		return loc;
	}
}

/**
  * @alias Location
  * @property {number} x
  * @property {number} y
  * @property {number} z
  * @property {boolean} is_base_loc=true Always true for Location, used to check if this is the Location
  * @property {Array} partial_contents A list of all atoms this location intersects
  * @property {Array} contents A list of all atoms whose origin this location contains
  * @property {Array} viewers A list of atoms with the Eye component that can see this one
  * @property {Array} hearers A list of atoms with the Hearer component that can see this one
  * @property {Bluespess} server A reference to the server object
  */
class Location {
	constructor(x,y,z, dim, server) {
		// Define these so that they can't be changed.
		Object.defineProperty(this, 'x', {enumerable: true,configurable: false,writable: false,value: x});
		Object.defineProperty(this, 'y', {enumerable: true,configurable: false,writable: false,value: y});
		Object.defineProperty(this, 'z', {enumerable: true,configurable: false,writable: false,value: z});
		Object.defineProperty(this, 'dim', {enumerable: false,configurable: false,writable: false,value: dim});

		Object.defineProperty(this, 'is_base_loc', {enumerable: false,configurable: false, writable: false, value: true});
		// Atoms partially in this location
		Object.defineProperty(this, 'partial_contents', {enumerable: true,configurable: false, writable: false, value: []});
		Object.defineProperty(this, 'contents', {enumerable: true,configurable: false, writable: false, value: []});
		Object.defineProperty(this, 'viewers', {enumerable: true,configurable: false, writable: false, value: []});
		Object.defineProperty(this, 'hearers', {enumerable: true,configurable: false, writable: false, value: []});

		Object.defineProperty(this, 'server', {enumerable: false,configurable: false, writable: false, value: server});
		this[_step_cache] = new Array(16);

		/** @type {number} */this.x;
		/** @type {number} */this.y;
		/** @type {number} */this.z;
		/** @type {Dimension} */this.dim;
		/** @type {boolean} */this.is_base_loc;
		/** @type {Array<Bluespess.Atom>} */this.partial_contents;
		/** @type {Array<Bluespess.Atom>} */this.contents;
		/** @type {Array<Bluespess.Atom>} */this.viewers;
		/** @type {Array<Bluespess.Atom>} */this.hearers;
		/** @type {Bluespess} */this.server;
	}

	/**
	 * Returns a location in the given direction
	 * @param {number} dir
	 * @returns {Location}
	 */
	get_step(dir) {
		if ((dir & 3) == 3) dir &= ~3;
		if((dir & 12) == 12) dir &= ~12;
		var cached = this[_step_cache][dir];
		if(cached)
			return cached;
		var newx = this.x;
		var newy = this.y;
		if(dir & 1)
			newy++;
		if(dir & 2)
			newy--;
		if(dir & 4)
			newx++;
		if(dir & 8)
			newx--;
		return this[_step_cache][dir] = this.dim.location(newx,newy,this.z);
	}

	get opacity() {
		for(var atom of this.partial_contents)
			if(atom.opacity && atom.does_enclose_tile(this))
				return atom.opacity;
		return false;
	}

	* recursive_contents() {
		for(var item of this.contents) {
			yield item;
			yield* item.recursive_contents();
		}
	}
}

module.exports = Dimension;
