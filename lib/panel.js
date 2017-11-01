'use strict';

const EventEmitter = require('events');

var id_ctr = 0;

class Panel extends EventEmitter {
	constructor(client, panel_props = {}) {
		super();
		this.client = client;
		this.id = "panel_" + (++id_ctr);
		this.is_open = false;
		panel_props.content_class = this.constructor.name;
		this.client.panels.set(this.id, this);
		this.panel_props = panel_props;
		this.client.emit("create_panel", this);
	}

	open() {
		if(!this.client || !this.client.panels.has(this.id) || this.is_open)
			throw new Error('Reopening a panel is forbidden! Create a new panel instead.');
		var pm = (this.client.next_message.panel || (this.client.next_message.panel = {}));
		if(!pm.create)
			pm.create = {};
		pm.create[this.id] = this.panel_props;
		this.is_open = true;
		this.emit("open");
	}

	send_message(message) {
		if(!this.is_open) {
			console.warn(new Error('Cannot send message on a closed panel!'));
			return;
		}
		if(!this.client)
			return;
		var pm = (this.client.next_message.panel || (this.client.next_message.panel = {}));
		if(!pm.message)
			pm.message = [];
		pm.message.push({id: this.id, contents: message});
	}

	close(send_message = true) {
		if(!this.is_open)
			return;
		if(this.client && send_message) {
			var pm = (this.client.next_message.panel || (this.client.next_message.panel = {}));
			if(!pm.close)
				pm.close = [];
			pm.close.push(this.id);
		}
		this.client.panels.delete(this.id);
		this.is_open = false;
		this.emit("close");
		this.client = null;
	}
}

module.exports = Panel;
