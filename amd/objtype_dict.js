/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./tclobject',
	'./types',
	'./list'
], function(
	tclobj,
	types,
	list
){
'use strict';

var dicthandlers = {
	type: 'dict',
	dupJsVal: function(obj){
		var newval = {}, e;
		for (e in obj.jsval) {
			if (obj.jsval.hasOwnProperty(e)) {
				newval[e] = obj.jsval[e];
				newval[e].IncrRefCount();
			}
		}
		return newval;
		//return from_string(obj.GetString());
	},
	freeJsVal: function(obj){
		var e;
		for (e in obj.jsval) {
			if (obj.jsval.hasOwnProperty(e)) {
				obj.jsval[e].DecrRefCount();
			}
		}
		obj.jsval = null;
	},
	updateString: function(obj){
		var e, a = [];
		for (e in obj.jsval) {
			if (obj.jsval.hasOwnProperty(e)) {
				a.push(e);
				a.push(obj.jsval[e].GetString());
			}
		}
		obj.bytes = list.array2list(a);
	},
	setFromAny: function(obj){
		var i, jsval = obj.jsval, a, d, e;
		if (jsval === null) {
			obj.handlers.updateJsVal(obj);
		}
		if (jsval instanceof Array) {
			a = jsval;
		} else {
			switch (typeof jsval) {
				case 'string':
					a = list.list2array(jsval);
					break;
				case 'function':
				case 'object':
					if (jsval instanceof String) {
						a = list.list2array(jsval);
					} else {
						//throw new Error('Cannot convert type to dict: "'+typeof jsval+'"');
						d = {};
						for (e in jsval) {
							if (jsval.hasOwnProperty(e)) {
								d[e] = tclobj.AsObj(jsval[e]);
								d[e].IncrRefCount();
							}
						}
					}
					break;
				default:
					throw new Error('Cannot convert type to dict');
			}
		}

		if (d === undefined) {
			if (a.length % 2 !== 0) {
				throw new Error('No value for key: "'+a[a.length-1]+'"');
			}
			d = {};
			for (i=0; i<a.length; i+=2) {
				d[a[i]] = tclobj.AsObj(a[i+1]);
				d[a[i]].IncrRefCount();
			}
		}

		obj.FreeJsVal();
		obj.jsval = d;
	}
};

function DictObj(value) {
	var e, i;

	this.handlers = dicthandlers;
	this._init();
	if (value instanceof Array) {
		if (value.length % 2 !== 0) {
			throw new Error('Cannot convert array with odd number of elements to a dict');
		}
		this.jsval = {};
		for (i=0; i<value.length; i+=2) {
			this.jsval[value[i]] = tclobj.AsObj(value[i+1]);
			this.jsval[value[i]].IncrRefCount();
		}
	} else if (typeof value === 'object') {
		this.jsval = {};
		for (e in value) {
			if (value.hasOwnProperty(e)) {
				this.jsval[e] = tclobj.AsObj(value[e]);
				this.jsval[e].IncrRefCount();
			}
		}
	} else if (value === undefined) {
		this.jsval = {};
	} else {
		throw new Error('Cannot create dictionary from "'+value+'"');
	}
}
DictObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('dict', dicthandlers);

types.TclObjectBase.GetDict = function(){
	if (this.handlers !== dicthandlers) {
		this.ConvertToType('dict');
	}
	return this.jsval;
};

tclobj.NewDict = function(val){
	return new DictObj(val);
};

return DictObj;
});
