'use strict';

const {Component} = require('../server.js');

class LightingObject extends Component.Networked {
	constructor(atom, template) {
		super(atom, template);

		this.add_networked_var("on");
		this.add_networked_var("color");
		this.add_networked_var("radius");
	}
}

class LightingTile extends Component.Networked {
	constructor(atom, template) {
		super(atom, template);
	}
}

module.exports.components = {LightingObject, LightingTile};
