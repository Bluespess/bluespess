'use strict';

class Sound {
	constructor(client, sndobj) {
		this.client = client;
		if(typeof sndobj.source_atom == "string")
			sndobj.source_atom = this.client.atoms_by_netid[sndobj.source_atom];
		if(sndobj.id)
			this.id = sndobj.id;
		this.client.playing_sounds.set(this.id, this);
	}
}
