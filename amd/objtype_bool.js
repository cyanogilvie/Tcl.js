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
		}
		if (obj.handlers.type === 'int') {
			newjsval = obj.GetInt() !== 0;
		} else {
			newjsval = tcllist.bool(obj.toString());
		}
		obj.FreeJsVal();
		obj.jsval = newjsval;
	}
};

function any2bool(value) {
	switch (typeof value) {
		case 'boolean':	return value;
		case 'number':	return value !== 0;
		case 'Object':
			if (value instanceof TclObject) {
				switch (value.handlers.type) {
					case 'int':		return value.GetInt() !== 0;
					case 'bool':	return value.jsval;
					default:
						if (value.cache.bool !== undefined) {
							return value.cache.bool;
						}
				}
			}
			value = obj.toString();
			// Falls through
		case 'string':	return tcllist.bool(value);
		default:		return Boolean(value);
	}
}

function BoolObj(value) {
	this.handlers = boolhandlers;

	this.jsval = any2bool(value);
}
BoolObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('bool', boolhandlers);

types.TclObjectBase.GetBool = function(){
	if (this.handlers !== boolhandlers) {
		if (this.cache.bool === undefined) {
			this.cache.bool = any2bool(this.toString());
		}
		return this.cache.bool;
	}
	return this.jsval;
};

tclobj.NewBool = function(val){
	return new BoolObj(val);
};

return BoolObj;
});

