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

function tokens2string(tokens) {
	var i, token, out = '';
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (token[0] === parser.SCRIPT) {
			out += commands2string(token[1]);
		} else if (token[0] === parser.INDEX) {
			continue;
		} else {
			out += token[1];
		}
	}
	return out;
}

function commands2string(commands) {
	var i, j, out = '';
	for (i=0; i<commands.length; i++) {
		for (j=0; j<commands[i].length; j++) {
			out += tokens2string(commands[i][j]);
		}
	}
	return out;
}

function jsval_from_string(str) {
	var jsval = {}, commands = parser.parse_script(str);
	console.log('Parsing script: {'+str+'}');
	jsval.commands = commands;
	return jsval;
}

var script_handlers = {
	type: 'script',
	dupJsVal: function(obj){
		var newjsval = jsval_from_string(obj.toString());
		return newjsval;
	},
	updateString: function(obj){
		obj.bytes = commands2string(obj.jsval.commands);
	},
	setFromAny: function(obj){
		var newjsval = jsval_from_string(obj.toString());
		obj.FreeJsVal();
		obj.jsval = newjsval;
		obj.bytes = null;
		obj.handlers = script_handlers;
	}
};

function ScriptObj(value) {
	this.handlers = script_handlers;
	this.jsval = jsval_from_string(String(value));
}
ScriptObj.prototype = new types.TclObject();

tclobj.RegisterObjType('script', script_handlers);

types.TclObjectBase.GetParsedScript = function(){
	if (this.handlers !== script_handlers) {
		this.ConvertToType('script');
	}
	console.log('Returning parsed script:', this.jsval.commands);
	return this.jsval.commands;
};

tclobj.NewScript = function(val){
	return new ScriptObj(val);
};

return ScriptObj;
});
