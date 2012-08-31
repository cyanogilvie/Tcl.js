/*jslint plusplus: true, white: true, nomen: true, newcap: true */
/*global define */

define(['./types'], function(types){
"use strict";

var iface, objtypes = {};

function RegisterObjType(type, objclass) {
	if (objtypes[type] !== undefined) {
		throw new Error('ObjType "'+type+'" already registered');
	}
	objtypes[type] = objclass;
}

function ConvertToType(interp, obj, type) {
	if (obj.type === type) {return;}
	if (objtypes[type].prototype['setFromAny'] === null) {
		throw new Error('Cannot convert to "'+type+'", missing setFromAny method');
	}
	objtypes[type].prototype['setFromAny'](interp, obj);
}

function NewObj(type /* args... */) {
	var a = Array.prototype.slice.call(arguments, 1);
	if (type === 'auto') {
		if (type instanceof Array) {
			type = 'list';
		} else {
			type = 'jsval';
		}
	}
	if (objtypes[type] === undefined) {
		throw new Error('ObjType not registered: "'+type+'"');
	}
	return new objtypes[type](a[0], a[1], a[2], a[3], a[4]);	// blegh
}

function TclObject(value) {
	var refcount = 0;

	this['type'] = 'jsval';
	this['jsval'] = value === undefined ? null : value;
	this['freeJsVal'] = function(){this.jsval = null;};
	this['dupJsVal'] = function(){
		// TODO: clone jsval
	};
	this['refcount'] = refcount;
	this['bytes'] = null;
	this['updateString'] = function(){this.bytes = this.jsval.toString();};
	this['updateJsVal'] = function(){};
	this['setFromAny'] = function(obj){
		obj['updateJsVal']();
		obj.bytes = null;
		obj.prototype = this;
	};
	this['incrRefCount'] = function(){this['refCount']++;};
	this['decrRefCount'] = function(){
		if (--this['refcount'] <= 0) {
			if (this['freeJsVal']) {
				this['freeJsVal']();
			}
		}
	};
	this['GetString'] = function(){
		if (this['bytes'] === null) {
			this['updateString']();
		}
		return this['bytes'];
	};
	this['DuplicateObj'] = function(){
		if (this['jsval'] === null) {
			this['updateJsVal']();
		}
		return NewObj([this['type']], this['dupJsVal'](this['jsval']));
	};
	this['IsShared'] = function(){return this['refcount'] > 1;};
	this['GetJsVal'] = function(){
		if (this['jsval'] === null) {
			this['updateJsVal']();
		}
		return this['jsval'];
	};
	this['toString'] = function(){
		return this['GetString']();
	};
}
types.TclObject = TclObject;

RegisterObjType('jsval', TclObject);

iface = {
	'TclObject': TclObject,
	'RegisterObjType': RegisterObjType,
	'NewObj': NewObj,
	'NewString': function(value){return NewObj('jsval', String(value));},
	'AsObj': function(value){return value instanceof TclObject ? value : NewObj('auto', value);},
	'AsVal': function(value){return value instanceof TclObject ? value.GetJsVal() : value;},
	'ConvertToType': ConvertToType,
	'GetString': function(obj){return obj['GetString'];},
	'GetJsVal': function(obj){return obj['GetJsVal'];},
	'DuplicateObj': function(obj){return obj['DuplicateObj'];},
	'IsShared': function(obj){return obj['IsShared'];},
	'IncrRefCount': function(obj){obj.incrRefCount();},
	'DecrRefCount': function(obj){obj.decrRefCount();}
};

return iface;
});
