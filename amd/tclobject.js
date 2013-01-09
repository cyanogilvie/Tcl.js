/*jslint plusplus: true, white: true, nomen: true, newcap: true */
/*global define */

define(function(){
'use strict';

var iface, objtypes = {}, TclObjectBase, jsvalhandlers, NewObj;

jsvalhandlers = {
	type: 'jsval',
	freeJsVal: function(obj){
		obj.jsval = null;
	},
	dupJsVal: function(obj){
		return obj.jsval;
	},
	updateString: function(obj){
		obj.bytes = obj.jsval.toString();
	},
	updateJsVal: function(){},
	setFromAny: function(obj){
		obj.updateJsVal();
		obj.InvalidateCaches();
		obj.handlers = jsvalhandlers;
	}
};

TclObjectBase = {
	IncrRefCount: function(){
		this.refCount++;
	},
	DecrRefCount: function(){
		if (--this.refCount <= 0) {
			this.FreeJsVal();
		}
	},
	FreeJsVal: function(){
		if (this.handlers.freeJsVal) {
			this.handlers.freeJsVal(this);
		}
	},
	toString: function(){
		if (this.bytes === null) {
			this.handlers.updateString(this);
		}
		return this.bytes;
	},
	GetString: function(){
		return this.toString();
	},
	DuplicateObj: function(){
		if (this.jsval === null) {
			this.handlers.updateJsVal(this);
		}
		return NewObj([this.handlers.type], this.handlers.dupJsVal(this));
	},
	IsShared: function(){
		return this.refCount > 1;
	},
	valueOf: function(){
		if (this.jsval === null) {
			this.handlers.updateJsVal(this);
		}
		return this.jsval;
	},
	GetJsVal: function(){
		return this.valueOf();
	},
	ConvertToType: function(type){
		if (this.handlers.type === type) {return;}
		objtypes[type].setFromAny(this);
		this.handlers = objtypes[type];
		this.InvalidateCaches();
	},
	InvalidateCaches: function(){
		this.bytes = null;
		this.cache = {};
	}
};

function RegisterObjType(type, handlers) {
	if (objtypes[type] !== undefined) {
		throw new Error('ObjType "'+type+'" already registered');
	}
	objtypes[type] = handlers;
}

function TclObject() {
	this.handlers = jsvalhandlers;
	this.jsval = null;
	this.refCount = 0;
	this.bytes = null;
	this.cache = {};
}
TclObject.prototype = TclObjectBase;

NewObj = function(type, value) {
	var obj;
	if (type === undefined) {
		type = 'auto';
	}
	if (type === 'auto') {
		if (value instanceof Array) {
			type = 'list';
		} else if (typeof value === 'object') {
			if (value instanceof Date) {
				// TODO: possibly build a date objtype, that preserves the js Date
				// instance in its jsval?  (With smart toString and setFromAny)
				type = 'jsval';
				value = value.toUTCString();
			} else {
				type = 'dict';
			}
		} else {
			type = 'jsval';
		}
	}
	if (objtypes[type] === undefined) {
		throw new Error('ObjType not registered: "'+type+'"');
	}
	obj = new TclObject();
	obj.jsval = value;
	obj.ConvertToType(type);
	return obj;
};

RegisterObjType('jsval', jsvalhandlers);

iface = {
	'TclObject': TclObject,
	'TclObjectBase': TclObjectBase,
	'RegisterObjType': RegisterObjType,
	'NewObj': NewObj,
	'AsObj': function(value){return value instanceof TclObject ? value : NewObj('auto', value);},
	'AsVal': function(value){return value instanceof TclObject ? value.valueOf() : value;}
};

return iface;
});
