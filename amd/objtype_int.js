/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./tclobject',
	'./types',
	'./utils'
], function(
	tclobj,
	types,
	utils
){
'use strict';

var inthandlers = {
	type: 'int',
	dupJsVal: function(obj){
		return obj.jsval;
	},
	valueOf: function(obj){
		return obj.jsval;
	},
	updateString: function(obj){
		obj.bytes = String(obj.jsval);
	},
	setFromAny: function(obj){
		var newjsval = utils.to_int(obj);
		obj.FreeJsVal();
		obj.jsval = newjsval;
	}
};

function IntObj(value) {
	this.handlers = inthandlers;
	this._init();
	this.jsval = utils.to_int(value);
}
IntObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('int', inthandlers);

types.TclObjectBase.GetInt = function(){
	if (this.handlers !== inthandlers) {
		this.ConvertToType('int');
	}
	return this.jsval;
};

tclobj.NewInt = function(val){
	return new IntObj(val);
};

types.IntOne = new IntObj(1);
types.IntZero = new IntObj(0);

return IntObj;
});
