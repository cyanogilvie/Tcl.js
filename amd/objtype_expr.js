/*jslint plusplus: true, white: true, nomen: true, continue: true */
/*global define */

define([
	'./tclobject',
	'./parser',
	'./types'
], function(
	tclobj,
	parser,
	types
){
'use strict';

function parse2string(parse) {
	return 'TODO: objtype_expr parse2string';
}

function jsval_from_string(str) {
	return {
		orig_string: value,
		parse: parser.parse_expr(str)
	};
}

var expr_handlers = {
	type: 'expr',
	dupJsVal: function(obj){
		var newjsval = jsval_from_string(obj.toString());
		return newjsval;
	},
	updateString: function(obj){
		//obj.bytes = parse2string(obj.jsval.commands[1]);
		//obj.bytes = parse2string(obj.jsval.parse);
		obj.bytes = obj.jsval.orig_string;
	},
	setFromAny: function(obj){
		var newjsval = jsval_from_string(obj.toString());
		obj.FreeJsVal();
		obj.jsval = newjsval;
	}
};

function ExprObj(value) {
	this.handlers = expr_handlers;
	this._init();
	if (value instanceof Array) {
		this.jsval = {parse: value};
	} else {
		this.jsval = jsval_from_string(String(value));
	}
}
ExprObj.prototype = new types.TclObject();

tclobj.RegisterObjType('expr', expr_handlers);

types.TclObjectBase.GetExprParse = function(){
	if (this.handlers !== expr_handlers) {
		this.ConvertToType('expr');
	}
	return this.jsval.parse;
};
types.TclObjectBase.GetExprStack = function(){
	if (this.handlers !== expr_handlers) {
		this.ConvertToType('expr');
	}
	if (this.jsval.stack === undefined) {
		this.jsval.stack = parser.expr2stack(this.jsval.parse);
	}
	return this.jsval.stack;
};

tclobj.NewExpr = function(val){
	return new ExprObj(val);
};

return ExprObj;
});
