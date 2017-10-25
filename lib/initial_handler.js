'use strict';

class InitialHandler {
	constructor(server, ws) {
		this.socket = ws;
		this.server = server;
		this._callback = (data, flags) => {
			this.handleMessage(data, flags);
		};
		this.socket.on("message", this._callback);
	}

	handleMessage(data) {
		var obj = JSON.parse(data);

		if(obj.login) {
			let username = obj.login+"";
			if(this.server.clients[obj.username])
				return;
			this.socket.removeListener("message", this._callback);
			this.server.login(this.socket, username);
		}
	}
}

module.exports = InitialHandler;
