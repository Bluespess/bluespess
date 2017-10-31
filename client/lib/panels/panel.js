'use strict';

class Panel {
	constructor(manager, id, {width=400, height=400, title="", can_close=true}={}) {
		console.log(this);
		var left = document.clientWidth / 2 - width / 2;
		var top = document.clientHeight / 2 - height / 2;
		this.containerObj = document.createElement('div');
		Object.assign(this.containerObj.style, {width:width+"px", height:height+"px", left:left+"px", top:top+"px"});
		this.containerObj.classList.add('uiframe-container');
		this.panelObj = document.createElement('div');
		this.panelObj.classList.add('uiframe');
		this.headerObj = document.createElement('div');
		this.headerObj.classList.add('uiframe-header');
		this.titleNode = document.createTextNode(title);
		this.headerObj.appendChild(this.titleNode);
		this.contentObj = document.createElement('div');
		this.contentObj.classList.add('uiframe-content');
		this.panelObj.appendChild(this.headerObj);
		this.panelObj.appendChild(this.contentObj);
		this.containerObj.appendChild(this.panelObj);
		document.getElementById('uiframes-container').appendChild(this.containerObj);

		this.headerObj.addEventListener("mousedown", this._start_drag.bind(this));
		this.containerObj.addEventListener("mousedown", this._start_resize.bind(this));
		this.containerObj.addEventListener("mousemove", this._container_mousemove.bind(this));
		this.containerObj.addEventListener("mouseout", this._container_mouseout.bind(this));

		this.can_close = can_close;
		this.manager = manager;
		manager.panels[id] = this;
		this.id = id;
	}

	_start_drag(e) {
		if(e.target != this.headerObj) {
			return;
		}
		var pad = (this.containerObj.offsetWidth - this.panelObj.offsetWidth)/2;
		e.preventDefault();
		var lastclientx = e.clientX;
		var lastclienty = e.clientY;
		var mousemove = (e) => {
			var dx = e.clientX - lastclientx;
			var dy = e.clientY - lastclienty;
			lastclientx = e.clientX;
			lastclienty = e.clientY;
			this.containerObj.style.left = Math.max(-pad,this.containerObj.getBoundingClientRect().left + dx) + "px";
			this.containerObj.style.top = Math.max(-pad,this.containerObj.getBoundingClientRect().top + dy) + "px";
		};
		var mouseup = () => {
			document.removeEventListener("mousemove", mousemove);
			document.removeEventListener("mouseup", mouseup);
		};
		document.addEventListener("mousemove", mousemove);
		document.addEventListener("mouseup", mouseup);
	}

	_resize_meta(e) {
		var pad = (this.containerObj.offsetWidth - this.panelObj.offsetWidth)/2;
		var width = this.panelObj.offsetWidth;
		var height = this.panelObj.offsetHeight;
		var out = {drag_right: false, drag_left: false, drag_up: false, drag_down: false, cursor: "default"};
		if(e.target == this.containerObj) {
			if(e.offsetX < pad)
				out.drag_left = true;
			if(e.offsetY < pad)
				out.drag_up = true;
			if(e.offsetX > (width + pad))
				out.drag_right = true;
			if(e.offsetY > (height + pad))
				out.drag_down = true;
			if((out.drag_left && out.drag_down) || (out.drag_up && out.drag_right)) {
				out.cursor = "nesw-resize";
			} else if((out.drag_left && out.drag_up) || (out.drag_down && out.drag_right)) {
				out.cursor = "nwse-resize";
			} else if(out.drag_left || out.drag_right) {
				out.cursor = "ew-resize";
			} else if(out.drag_up || out.drag_down) {
				out.cursor = "ns-resize";
			}
		}
		out.can_resize = out.drag_right || out.drag_left || out.drag_up || out.drag_down;
		return out;
	}

	_start_resize(e) {
		var resize_meta = this._resize_meta(e);
		if(!resize_meta.can_resize)
			return;
		var pad = (this.containerObj.offsetWidth - this.panelObj.offsetWidth)/2;
		e.preventDefault();
		var lastclientx = e.clientX;
		var lastclienty = e.clientY;
		var mousemove = (e) => {
			var dx = e.clientX - lastclientx;
			var dy = e.clientY - lastclienty;
			lastclientx = e.clientX;
			lastclienty = e.clientY;
			if(resize_meta.drag_left) {
				this.containerObj.style.left = Math.max(-pad,this.containerObj.getBoundingClientRect().left + dx) + "px";
				this.containerObj.style.width = Math.max(160,this.panelObj.clientWidth - dx) + "px";
			} else if(resize_meta.drag_right) {
				this.containerObj.style.width = Math.max(160,this.panelObj.clientWidth + dx) + "px";
			}
			if(resize_meta.drag_up) {
				this.containerObj.style.top = Math.max(-pad,this.containerObj.getBoundingClientRect().top + dy) + "px";
				this.containerObj.style.height = Math.max(35,this.panelObj.clientHeight - dy) + "px";
			} else if(resize_meta.drag_down) {
				this.containerObj.style.height = Math.max(35,this.panelObj.clientHeight + dy) + "px";
			}
		};
		var mouseup = () => {
			document.removeEventListener("mousemove", mousemove);
			document.removeEventListener("mouseup", mouseup);
		};
		document.addEventListener("mousemove", mousemove);
		document.addEventListener("mouseup", mouseup);
	}

	_container_mousemove(e) {
		var resize_meta = this._resize_meta(e);
		this.containerObj.style.cursor = resize_meta.cursor;
	}
	_container_mouseout() {
		this.containerObj.style.cursor = "default";
	}

	get title() {
		return this.titleNode.textContent;
	}

	set title(val) {
		this.titleNode.textContent = val;
	}

	close() {
		this.manager.send_message({closed_panel:this.id});
		if(this.manager.panels[this.id] == this)
			this.manager.panels[this.id] = null;
		document.getElementById('uiframes-container').removeChild(this.containerObj);
	}
}

module.exports = Panel;
