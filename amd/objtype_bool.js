/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./tclobject',
	'./types',
	'./list'
], function(
	tclobj,
	types,
	tcllist
){
'use strict';

var boolhandlers = {
	type: 'bool',
	dupJsVal: function(obj){
		return obj.jsval;
	},
	updateString: function(obj){
		obj.bytes = obj.jsval ? '1' : '0';
	},
	valueOf: function(obj){
		return obj.jsval;
	},
	setFromAny: function(obj){
		var newjsval;
		if (obj.handlers.type === 'jsval') {
			switch (typeof obj.jsval) {
				case 'boolean': break;
				case 'number':
					obj.jsval = obj.jsval !== 0;
					break;
				case 'string':
					obj.jsval = tcllist.bool(obj.jsval);
					break;
				default:
					obj.jsval = tcllist.bool(obj.toString());
			}
			return;
		} else if (obj.handlers.type === 'int') {
			newjsval = obj.GetInt() !== 0;
		} else {
			newjsval = tcllist.bool(obj.toString());
		}
		obj.FreeJsVal();
		obj.jsval = newjsval;
	}
};

function BoolObj(value) {
	this.handlers = boolhandlers;

	switch (typeof value) {
		case 'boolean': this.jsval = value; break;
		case 'number': this.jsval = value !== 0; break;
		case 'string': this.jsval = tcllist.bool(value); break;
		default:
			this.jsval = Boolean(value);
	}
}
BoolObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('bool', boolhandlers);

types.TclObjectBase.GetBool = function(){
	if (this.handlers !== boolhandlers) {
		this.ConvertToType('bool');
	}
	return this.jsval;
};

tclobj.NewBool = function(val){
	return new BoolObj(val);
};

return BoolObj;
});

