'use strict';
function applyTrap(target, thisArg, args) {
	if(target.arr.length == 0) return;
	var callers = [];
	callers.length = target.arr.length;
	for(var j = 0; j < callers.length; j++) { // It has to be let. Can't be var.
		let i = j;
		callers[i] = function callPrev() {
			var prev;
			if(i == 0) {
				prev = (() => {});
			} else {
				prev = callers[i-1];
			}
			var passed_args = [prev];
			if(arguments.length)
				arguments.forEach((item) => {passed_args.push(item);});
			else
				args.forEach((item) => {passed_args.push(item);});
			return target.arr[i].apply(thisArg, passed_args);
		};
	}
	return callers[callers.length - 1]();
}

function setTrap(target, property, value) {
	if(property == "arr")return false;
	if(+property == +property || target.arr[property] || Array.prototype[property]) {
		target.arr[property] = value;
		return true;
	}
	if(+property == +property && !(value instanceof Function))
		throw new TypeError(`Expected a function for function chain, got ${value} instead`);
	target[property] = value;
	return true;
}

function getTrap(target, property) {
	if(property == "arr")return;
	if(property == "constructor")return FunctionChain;
	if((typeof property != "symbol" && +property == +property) || target.arr[property] || Array.prototype[property])
		return target.arr[property];
	return target[property];
}

var traps = {apply: applyTrap, set: setTrap, get: getTrap};

function FunctionChain(func) {
	var placeholder = () => {};
	placeholder.arr = func instanceof Function ? [func] : [];
	var prox = new Proxy(placeholder, traps);
	return prox;
}

FunctionChain.chain_func = function(func1, func2) {
	if(func1.constructor == FunctionChain) {
		func1.push(func2);
		return func1;
	}
	if(!func1 instanceof Function)
		return new FunctionChain(func2);
	var funcChain = new FunctionChain();
	funcChain.push(function(prev, ...args) {return func1.apply(this,args);});
	if(func2 instanceof Function)
		funcChain.push(func2);
	return funcChain;
}

module.exports = FunctionChain;
