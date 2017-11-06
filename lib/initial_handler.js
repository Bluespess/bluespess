'use strict';

class InitialHandler {
	constructor(server, ws) {
		this.socket = ws;
		this.server = server;
		this.handle_message = this.handle_message.bind(this);
		this.socket.on("message", this.handle_message);
		this.socket.send(JSON.stringify({login_type:"debug"}));
	}

	handle_message(data) {
		var obj = JSON.parse(data);

		if(obj.login) {
			let username = obj.login+"";
			if(this.server.clients[obj.username])
				return;
			this.socket.removeListener("message", this.handle_message);
			this.server.login(this.socket, username);
		}
	}
}

module.exports = InitialHandler;
