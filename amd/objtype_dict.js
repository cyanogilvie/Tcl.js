/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define(['./tclobject', './list'], function(tclobj, list){
"use strict";

function from_string(str){
	var d = {};

	return d;
}

function DictObj(value) {
	var e, d;

	this['type'] = 'dict';
	this['dupJsVal'] = function(){
		return from_string(this.GetString());
	};

	if (value instanceof Array) {
		this['jsval'] = value.slice(0);
	} else if (typeof value === 'object') {
		d = {};
		for (e in value) {
			if (value.hasOwnProperty(e)) {
				d[e] = tclobj.NewObj('auto', value[e]);
			}
		}
	}
	this['updateString'] = function(){
		var e, a = [];
		for (e in this['jsval']) {
			if (this['jsval'].hasOwnProperty(e)) {
				a.push(e);
				a.push(this['jsval'][e].GetString());
			}
		}
		return list.array2list(a);
	};
	this['setFromAny'] = function(obj){
		var i, jsval = obj['jsval'], a;
		if (jsval === null) {
			obj['updateJsVal']();
		}
		if (!(jsval instanceof Array)) {
			switch (typeof jsval) {
				case 'string':
					a = list.list2array(jsval);
					break;
				case 'function':
				case 'object':
					if (jsval instanceof String) {
						a = list.list2array(jsval);
					} else {
						throw new Error('Cannot convert type to dict');
					}
					break;
				default:
					throw new Error('Cannot convert type to dict');
			}
		}
		if (a.length % 2 !== 0) {
			throw new Error('No value for key: "'+a[a.length-1]+'"')
		}
		for (i=0; i<a.length; i+=2) {
			if (!(a[i+1] instanceof tclobj.TclObject)) {
				a[i+1] = tclobj.NewObj('auto', a[i+1]);
			}
		}
		obj.freeJsVal();
		obj.jsval = a;
		obj.bytes = null;
		obj.prototype = this;
	};
}
DictObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('dict', DictObj);

tclobj['GetDict'] = function(obj){
	if (obj.prototype !== DictObj) {
		tclobj.ConvertToType('dict', obj);
	}
	return obj['jsval'];
};

tclobj['NewDict'] = function(val){
	return new DictObj(val);
};

return DictObj;
});
