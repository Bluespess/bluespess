'use strict';

const Panel = require('./panel.js');
const EventEmitter = require('events');

class PanelManager extends EventEmitter {
	constructor(client) {
		super();
		this.client = client;
		this.panels = {};
	}

	send_message(obj) {
		if(!this.client.connection)
			return;
		this.client.connection.send(JSON.stringify({panel: obj}));
	}

	create_client_panel(obj) {
		let panel = new Panel(this, null, obj);
		this.emit("create", panel, obj);
		return panel;
	}

	handle_message(obj) {
		if(obj.create) {
			for(let id in obj.create) {
				if(!obj.create.hasOwnProperty(id))
					continue;
				if(this.panels[id])
					console.warn(`The server tried to open a panel with the same ID ${id} twice! ${JSON.stringify(obj.create[id])}`);
				let panel = new Panel(this, id, obj.create[id]);
				this.emit("create", panel, obj.create[id]);
			}
		}
		if(obj.message) {
			for(let message of obj.message) {
				let panel = this.panels[message.id];
				if(!panel)
					continue;
				panel.emit("message", message.contents);
			}
		}
		if(obj.close) {
			for(let id of obj.close) {
				let panel = this.panels[id];
				if(!panel)
					continue;
				panel.close();
			}
		}
	}
}

module.exports = PanelManager;
