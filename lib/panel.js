'use strict';
class Panel {
	constructor(client, panel_props = {}) {
		this.server;
		panel_props.content_class = this.constructor.name;
	}

	send_message(message) {

	}
}

module.exports = Panel;
