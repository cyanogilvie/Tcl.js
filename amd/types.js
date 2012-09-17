/*jslint plusplus: true, white: true, nomen: true */
/*global define */
define(['./tclobject'], function(tclobj){
'use strict';

var types = {
	SCALAR: 0,
	ARRAY: 1,
	OK: 0,
	ERROR: 1,
	RETURN: 2,
	BREAK: 3,
	CONTINUE: 4,

	EmptyString: tclobj.NewString('')
};

types.EmptyString.IncrRefCount();

function TclResult(code, result, options) {
	this.code = code;
	if (result === undefined || (typeof result === 'string' && result === '')) {
		result = types.EmptyString;
	}
	this.result = tclobj.AsObj(result);
	this.options = options || {};
	this.options.code = code;
	this.toString = function(){
		return this.result.toString();
	};
}

function TclError(message) {
	var errorcode = Array.prototype.slice.call(arguments, 1);
	this.name = 'TclError';
	this.errorcode = errorcode.length !== 0 ? errorcode : ['NONE'];
	this.message = message;
	this.toTclResult = function(){
		return new TclResult(types.ERROR, String(message), {
			errorcode: this.errorcode
		});
	};
}
TclError.prototype = new Error();

types.TclResult = TclResult;
types.TclError = TclError;
types.TclObject = tclobj.TclObject;
types.TclObjectBase = tclobj.TclObjectBase;

return types;
});
