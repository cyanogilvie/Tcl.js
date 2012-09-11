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

function commands2string(commands) {
	var i, j, out = '';

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

	for (i=0; i<commands.length; i++) {
		for (j=0; j<commands[i].length; j++) {
			out += tokens2string(commands[i][j]);
		}
	}
	return out;
}

function strip_for_exec(commands) {
	var i, j, word, command = [], out = [];

	function strip_word_for_exec(tokens) {
		var i, token, word = [];
		for (i=0; i<tokens.length; i++) {
			token = tokens[i];
			switch (token[0]) {
				case parser.SCRIPT:
					word.push([token[0], strip_for_exec(token[1])]);
					break;

				case parser.INDEX:
					word.push([token[0], strip_word_for_exec(token[1])]);
					break;

				case parser.EXPAND:
				case parser.TXT:
				case parser.VAR:
				case parser.ARRAY:
					word.push([token[0], token[1]]);
					break;

				default:
					break;
			}
		}
		return word;
	}

	for (i=0; i<commands.length; i++) {
		command = [];
		for (j=0; j<commands[i].length; j++) {
			word = strip_word_for_exec(commands[i][j]);
			if (word.length > 0) {
				command.push(word);
			}
		}
		out.push(command);
	}
	return out;
}

function jsval_from_string(str) {
	var jsval = {}, commands = parser.parse_script(str);
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
		obj.bytes = commands2string(obj.jsval.commands[1]);
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
	return this.jsval.commands;
};
types.TclObjectBase.GetExecParse = function(){
	if (this.handlers !== script_handlers) {
		this.ConvertToType('script');
	}
	if (this.jsval.exec_commands === undefined) {
		this.jsval.exec_commands = [parser.SCRIPT, strip_for_exec(this.jsval.commands[1])];
	}
	return this.jsval.exec_commands;
};

tclobj.NewScript = function(val){
	return new ScriptObj(val);
};

return ScriptObj;
});
