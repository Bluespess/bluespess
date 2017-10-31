'use strict';

const Panel = require('./panel.js');

class PanelManager {
	constructor(client) {
		this.client = client;
		this.panels = {};
	}

	send_message(obj) {
		if(!this.client.connection)
			return;
		this.client.connection.send(JSON.stringify({panel: obj}));
	}

	handle_message(obj) {
		if(obj.create_panel) {
			for(let id in obj.create_panel) {
				if(!obj.create_panel.hasOwnProperty(id))
					continue;
				if(this.panels[id])
					this.panels[id].close();
				new Panel(this, id, obj.create_panel[id]);
			}
		}
	}
}

module.exports = PanelManager;
