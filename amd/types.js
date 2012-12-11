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

	EmptyString: tclobj.NewObj('jsval', '')
};

types.EmptyString.IncrRefCount();

function TclResult(code, result, options, level, finalcode) {
	var i;
	this.code = code;
	if (result === undefined || (typeof result === 'string' && result === '')) {
		this.result = types.EmptyString;
	} else {
		this.result = tclobj.AsObj(result);
	}
	this.options = options || [];
	this.level = level || 0;
	this.finalcode = finalcode || 0;
}
TclResult.prototype = {
	toString: function(){
		return this.result.toString();
	}
};

function TclError(message, errorcode, errorinfo) {
	this.name = 'TclError';
	this.errorcode = errorcode !== undefined ? errorcode : ['NONE'];
	this.errorinfo = errorinfo;
	this.message = message;
	this.toTclResult = function(){
		return new TclResult(types.ERROR, String(message), [
			'-errorcode', this.errorcode
		]);
	};
}
TclError.prototype = new Error();

types.TclResult = TclResult;
types.TclError = TclError;
types.TclObject = tclobj.TclObject;
types.TclObjectBase = tclobj.TclObjectBase;

return types;
});
