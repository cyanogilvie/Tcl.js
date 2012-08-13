/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define(['./tclobject', './list'], function(tclobj, list){
"use strict";

function ListObj(value) {
	this['type'] = 'list';
	this['dupJsVal'] = function(){
		return this['jsval'].slice(0);
	};

	if (value instanceof Array) {
		this['jsval'] = value.slice(0);
	} else {
		// TODO: be stricter?
		this['jsval'] = [value];
	}
	this['updateString'] = list.to_tcl(this['jsval']);
	this['setFromAny'] = function(obj){
		var i, jsval = obj['jsval'];
		if (jsval === null) {
			obj['updateJsVal']();
		}
		if (!(jsval instanceof Array)) {
			switch (typeof jsval) {
				case 'string':
					this['jsval'] = list.list2array(jsval);
					break;
				case 'function':
				case 'object':
					if (jsval instanceof String) {
						this['jsval'] = list.list2array(jsval);
					} else {
						throw new Error('Cannot convert type to list');
					}
					break;
				default:
					throw new Error('Cannot convert type to list');
			}
		}
		for (i=0; i<jsval.length; i++) {
			if (!(jsval[i] instanceof tclobj.TclObject)) {
				jsval[i] = tclobj.NewObj('auto', jsval[i]);
			}
		}
		obj.bytes = null;
		obj.prototype = this;
	};
}
ListObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('list', ListObj);

tclobj['GetList'] = function(obj){
	if (obj.prototype !== ListObj) {
		tclobj.ConvertToType('list', obj);
	}
	return obj['jsval'];
};

tclobj['NewList'] = function(val){
	return new ListObj(val);
};

return ListObj;
});
