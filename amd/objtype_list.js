/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./tclobject',
	'./list',
	'./types'
], function(
	tclobj,
	list,
	types
){
'use strict';

var listhandlers;

listhandlers = {
	type: 'list',
	dupJsVal: function(obj){
		return obj.jsval.slice(0);
	},
	updateString: function(obj){
		obj.bytes = list.to_tcl(obj.jsval);
	},
	setFromAny: function(obj){
		var i, jsval = [];
		if (obj.jsval === null) {
			obj.updateJsVal();
		}
		if (obj.jsval instanceof Array) {
			jsval = obj.jsval.slice();
		} else {
			switch (typeof obj.jsval) {
				case 'string':
					jsval = list.list2array(obj.jsval);
					break;
				case 'function':
				case 'object':
					if (obj.jsval instanceof String) {
						jsval = list.list2array(obj.jsval);
					} else {
						throw new Error('Cannot convert type to list');
					}
					break;
				default:
					throw new Error('Cannot convert type to list');
			}
		}
		for (i=0; i<jsval.length; i++) {
			jsval[i] = tclobj.AsObj(jsval[i]);
			jsval[i].IncrRefCount();
		}
		obj.FreeJsVal();
		obj.jsval = jsval;
	}
};

function ListObj(value) {
	var i;
	this.handlers = listhandlers;
	this._init();
	if (value instanceof Array) {
		this.jsval = [];
		for (i=0; i<value.length; i++) {
			this.jsval.push(tclobj.AsObj(value[i]));
		}
	} else if (value === undefined) {
		this.jsval = [];
	} else {
		// TODO: be stricter?
		this.jsval = [value];
	}
	this.handlers.setFromAny(this);
}
ListObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('list', listhandlers);

types.TclObjectBase.GetList = function(){
	if (this.handlers !== listhandlers) {
		this.ConvertToType('list');
	}
	return this.jsval;
};

tclobj.NewList = function(val){
	return new ListObj(val);
};

return ListObj;
});
