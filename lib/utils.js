'use strict';
// Sort of like Object.assign(), but it assigns *behind* the other object, and it's also recursive.
function weakDeepAssign(a, b) {
	for(var key in b) {
		if(!b.hasOwnProperty(key))
			continue;
		if(typeof b[key] == "object" && !(b[key] instanceof Array) && (!a.hasOwnProperty(key) || typeof a[key] != "object" || (a[key] instanceof Array)))
			a[key] = {};
		if(a.hasOwnProperty(key)) {
			if((typeof a[key] == "object" && !(a[key] instanceof Array)) && (typeof b[key] == "object" && !(b[key] instanceof Array)))
				weakDeepAssign(a[key], b[key]);
		} else {
			a[key] = b[key];
		}
	}
	return a;
}

// Recursive version of Object.create()
function deepCreate(obj) {
	var newobj = Object.create(obj);
	for(var key in obj) {
		if(!obj.hasOwnProperty(key))
			continue;
		if(typeof obj[key] == "object" && !(obj[key] instanceof Array))
			newobj[key] = deepCreate(obj[key]);
	}
	return newobj;
}

// Chaining:
// Basically, you do it like this:
// *original func* = chain_func(*original func*, *replacement func*);
// This outputs a function which when called, calls the replacement function
// but with an argument inserted at the beginning that is a reference to a function
// referencing the original function.
function chain_func(func1, func2) {
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
}

var readonlyTraps = {set: ()=>{},deleteProperty: ()=>{},defineProperty: ()=>{},setPrototypeOf: ()=>{},isExtensible:()=>{return false;}};

module.exports = {weakDeepAssign, deepCreate, readonlyTraps, chain_func};
