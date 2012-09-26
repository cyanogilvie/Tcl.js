/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./tclobject'
], function(
	tclobj
){
'use strict';

var stringhandlers = {
	type: 'string',
	dupJsVal: function(obj){
		return obj.jsval;
	},
	updateString: function(obj){
		obj.bytes = obj.jsval;
	},
	valueOf: function(obj){
		return obj.jsval;
	},
	setFromAny: function(obj){
		var str = obj.toString();
		obj.FreeJsVal();
		obj.jsval = str;
	}
};

function StringObj(value) {
	this.handlers = stringhandlers;
	this.jsval = String(value);
}
StringObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('string', stringhandlers);

tclobj.NewString = function(val){
	return new StringObj(val);
};

return StringObj;
});
