'use strict';

const $ = require('jquery');

class Panel {
	constructor(manager, id, {width=400, height=400, title="", can_close=true}={}) {
		var left = $(document).width() / 2 - width / 2;
		var top = $(document).height() / 2 - height / 2;
		this.containerObj = $(`<div class='uiframe-container' style='width:${width}px;height:${height}px;left:${left}px;top:${top}px'></div>`);
		this.panelObj = $(`<div class='uiframe' style=''></div>`);
		this.headerObj = $(`<div class='uiframe-header' unselectable="on">${title}</div>`);
		this.contentObj = $("<div class='uiframe-content'></div>");
		this.panelObj.append(this.headerObj);
		this.panelObj.append(this.contentObj);
		this.containerObj.append(this.panelObj);
		$('#uiframes-container').append(this.containerObj);

		this.headerObj.mousedown(this._start_drag.bind(this));
		this.containerObj.mousedown(this._start_resize.bind(this));
		this.containerObj.mousemove(this._container_mousemove.bind(this));
		this.containerObj.mouseout(this._container_mouseout.bind(this));
		this.can_close = can_close;
	}

	_start_drag(e) {
		if(e.target != this.headerObj[0]) {
			return;
		}
		var pad = (this.containerObj.outerWidth() - this.panelObj.width())/2;
		e.preventDefault();
		var lastclientx = e.clientX;
		var lastclienty = e.clientY;
		var mousemove = (e) => {
			var dx = e.clientX - lastclientx;
			var dy = e.clientY - lastclienty;
			lastclientx = e.clientX;
			lastclienty = e.clientY;
			this.containerObj.css("left", Math.max(-pad,this.containerObj.position().left + dx) + "px");
			this.containerObj.css("top", Math.max(-pad,this.containerObj.position().top + dy) + "px");
		};
		var mouseup = () => {
			$(document).off("mousemove", mousemove);
			$(document).off("mouseup", mouseup);
		};
		$(document).mousemove(mousemove);
		$(document).mouseup(mouseup);
	}

	_resize_meta(e) {
		var pad = (this.containerObj.outerWidth() - this.panelObj.width())/2;
		var width = this.containerObj.width();
		var height = this.containerObj.height();
		var out = {drag_right: false, drag_left: false, drag_up: false, drag_down: false, cursor: "default"};
		if(e.target == this.containerObj[0]) {
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
		var pad = (this.containerObj.outerWidth() - this.panelObj.width())/2;
		e.preventDefault();
		var lastclientx = e.clientX;
		var lastclienty = e.clientY;
		var mousemove = (e) => {
			var dx = e.clientX - lastclientx;
			var dy = e.clientY - lastclienty;
			lastclientx = e.clientX;
			lastclienty = e.clientY;
			if(resize_meta.drag_left) {
				this.containerObj.css("left", Math.max(-pad,this.containerObj.position().left + dx) + "px");
				this.containerObj.css("width", Math.max(160,this.containerObj.width() - dx) + "px");
			} else if(resize_meta.drag_right) {
				this.containerObj.css("width", Math.max(160,this.containerObj.width() + dx) + "px");
			}
			if(resize_meta.drag_up) {
				this.containerObj.css("top", Math.max(-pad,this.containerObj.position().top + dy) + "px");
				this.containerObj.css("height", Math.max(35,this.containerObj.height() - dy) + "px");
			} else if(resize_meta.drag_down) {
				this.containerObj.css("height", Math.max(35,this.containerObj.height() + dy) + "px");
			}
		};
		var mouseup = () => {
			$(document).off("mousemove", mousemove);
			$(document).off("mouseup", mouseup);
		};
		$(document).mousemove(mousemove);
		$(document).mouseup(mouseup);
	}

	_container_mousemove(e) {
		var resize_meta = this._resize_meta(e);
		this.containerObj.css("cursor", resize_meta.cursor);
	}
	_container_mouseout() {
		this.containerObj.css("cursor", "default");
	}
}

module.exports = Panel;
