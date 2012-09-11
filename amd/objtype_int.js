/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./tclobject',
	'./types'
], function(
	tclobj,
	types
){
'use strict';

var inthandlers = {
	type: 'int',
	dupJsVal: function(){
		return this.jsval;
	},
	updateString: function(obj){
		obj.bytes = String(obj.jsval);
	},
	setFromAny: function(obj){
		obj.handlers.updateString(obj);
		obj.FreeJsVal();
		obj.jsval = Number(obj.bytes);
		obj.bytes = null;
		obj.handlers = inthandlers;
	}
};

function IntObj(value) {
	this.handlers = inthandlers;

	// TODO: force integer (not float)
	this.jsval = Number(value);
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

return IntObj;
});
