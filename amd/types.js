/*jslint plusplus: true, white: true, nomen: true */
/*global define */
define(function(){
'use strict';

function TclError(message) {
	var errorcode = Array.prototype.slice.call(arguments, 1);
	this.name = 'TclError';
	this.errorcode = errorcode.length !== 0 ? errorcode : ['NONE'];
	this.message = message;
}
TclError.prototype = new Error();

function TclResult(code, result, options) {
	this.code = code;
	this.result = result !== undefined ? result : '';
	this.options = options || {};
	this.options.code = code;
	this.toString = function(){
		return this.result.toString();
	};
}

var types = {
	SCALAR: 0,
	ARRAY: 1,
	OK: 0,
	ERROR: 1,
	RETURN: 2,
	BREAK: 3,
	CONTINUE: 4,
	TclResult: TclResult,
	TclError: TclError
};

return types;
});
