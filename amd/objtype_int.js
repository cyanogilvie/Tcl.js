/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define(['./tclobject'], function(tclobj){
"use strict";

function IntObj(value) {
	this['type'] = 'int';
	this['dupJsVal'] = function(){
		return this['jsval'];
	};

	// TODO: force integer (not float)
	this['jsval'] = Number(value);
	this['updateString'] = String(this['jsval']);
	this['setFromAny'] = function(obj){
		obj.updateString();
		obj.jsval = Number(obj.bytes);
		obj.bytes = null;
		obj.prototype = this;
	};
}
IntObj.prototype = new tclobj.TclObject();

tclobj.RegisterObjType('int', IntObj);

tclobj['GetInt'] = function(obj){
	if (obj.prototype !== IntObj) {
		tclobj.ConvertToType('int', obj);
	}
	return obj['jsval'];
};

tclobj['NewInt'] = function(val){
	return new IntObj(val);
};

return IntObj;
});
