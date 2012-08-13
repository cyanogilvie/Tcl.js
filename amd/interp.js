/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define(['./parser', './list'], function(parser, list){
"use strict";

function TclError(message) {
	var errorcode = Array.prototype.slice(arguments, 1);
	this.name = 'TclError';
	this.errorcode = errorcode.length !== 0 ? errorcode : ['NONE'];
	this.message = message;
}
TclError.prototype = new Error();

var SCALAR = 0,
	ARRAY = 1;

return function(){
	this.vars = {};
	this.commands = {};

	this.resolve_var = function(varname) {
		var vinfo = this.vars[varname];
		if (vinfo === undefined) {
			throw new TclError('can\'t read "'+varname+'": no such variable',
				'TCL', 'LOOKUP', 'VARNAME', varname);
		}
		return vinfo;
	};

	this.get_scalar = function(varname) {
		var vinfo = this.resolve_var(varname);
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t read "'+varname+'": variable is array',
				'TCL', 'READ', 'VARNAME');
		}
		return vinfo.value;
	};

	this.get_array = function(array, index) {
		var vinfo = this.resolve_var(array);
		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t read "'+array+'('+index+')": variable isn\'t array',
				'TCL', 'LOOKUP', 'VARNAME', array);
		}
		if (vinfo.value[index] === undefined) {
			throw new TclError('can\'t read "'+array+'('+index+')": no such element in array',
				'TCL', 'READ', 'VARNAME');
		}
		return vinfo.value[index];
	};

	this.set_scalar = function(varname, value) {
		var vinfo = this.vars[varname];
		if (vinfo === undefined) {
			vinfo = this.vars[varname] = {type: SCALAR};
		}
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t set "'+varname+'": variable is array',
				'TCL', 'WRITE', 'VARNAME');
		}
		vinfo.value = value;
		return value;
	};

	this.set_array = function(array, index, value) {
		var vinfo = this.vars[array];
		if (vinfo === undefined) {
			vinfo = this.vars[array] = {type: ARRAY, value: {}};
		}
		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t set "'+array+'('+index+')": variable isn\'t array',
				'TCL', 'LOOKUP', 'VARNAME', array);
		}
		vinfo.value[index] = value;
		return value;
	};

	this._parse_varname = function(varname) {
		var array, index, idx;

		// TODO: properly
		idx = varname.lastIndexOf('(');
		array = varname.substr(0, idx);
		index = varname.substr(idx+1, varname.length-idx-2);

		return [array, index];
	};

	this.get_var = function(varname) {
		var parts;
		if (varname[varname.length-1] === ')') {
			parts = this._parse_varname(varname);
			return this.get_array(parts[0], parts[1]);
		} else {
			return this.get_scalar(varname);
		}
	};

	this.set_var = function(varname, value) {
		var parts;
		if (varname[varname.length-1] === ')') {
			parts = this._parse_varname(varname);
			return this.set_array(parts[0], parts[1], value);
		} else {
			return this.set_scalar(varname, value);
		}
	};

	this.resolve_command = function(commandname, failifmissing) {
		var cinfo = this.commands[commandname];
		failifmissing = failifmissing === undefined ? true : failifmissing;
		if (cinfo === undefined && failifmissing) {
			throw new TclError('invalid command name "'+commandname+'"');
		}
		return cinfo;
	};

	this.registerCommand = function(commandname, handler, thisobj, priv, onDelete) {
		var cinfo = this.resolve_command(commandname, false);
		if (cinfo !== undefined && cinfo.onDelete) {
			cinfo.onDelete(cinfo.priv);
		} else {
			cinfo = this.commands[commandname] = {
			};
		}
		cinfo.handler = handler;
		cinfo.priv = priv;
		cinfo.thisobj = thisobj !== undefined ? thisobj : null;
		cinfo.onDelete = onDelete;
	};

	this.resolve_word = function(tokens) {
		var i, word, token, array, index, expand = false;

		//console.log('tokens: ', tokens);
		for (i=0; i<tokens.length; i++) {
			token = tokens[i];
			switch (token[0]) {
				case parser.EXPAND:
					expand = true;
					break;

				case parser.TXT:
					if (word === undefined) {word = '';}
					word += token[1];
					break;

				case parser.VAR:
					if (word === undefined) {word = '';}
					word += this.get_scalar(token[1]);
					break;

				case parser.ARRAY:
					if (word === undefined) {word = '';}
					array = token[1];
					i += 2; token = tokens[i];
					if (token[0] !== parser.INDEX) {
						throw new parser.ParseError('Expecting INDEX token, found: '+parser.tokenname[token[0]]);
					}
					console.log('resolving array index:', token[1]);
					index = this.resolve_word(token[1]).join('');
					word += this.get_array(array, index);
					break;

				case parser.SCRIPT:
					if (word === undefined) {word = '';}
					word += this.exec(token[1]);
					break;
			}
		}

		if (word === undefined) {
			return [];
		}
		return expand ? list.list2array(word) : [word];
	};

	this.get_words = function(command) {
		var i, j, words = [], addwords;
		for (i=0; i<command.length; i++) {
			addwords = this.resolve_word(command[i]);
			for (j=0; j<addwords.length; j++) {
				words.push(addwords[j]);
			}
		}
		if (words.length > 0) {
			words[0] = {
				text: words[0],
				cinfo: this.resolve_command(words[0])
			};
		}
		return words;
	};

	this.eval_command = function(commandline) {
		var words = this.get_words(commandline), command, result, args, i;
		if (words.length === 0) {return null;}

		command = words.shift();
		args = [command.text];
		for (i=0; i<words.length; i++) {
			args.push(words[i]);
		}
		console.log('eval_command running '+command.text);
		result = command.cinfo.handler.call(command.thisobj, args, this, command.priv);
		return result;
	};

	this.exec = function(commands) {
		var i, lastresult, result;

		for (i=0; i<commands.length; i++) {
			result = this.eval_command(commands[i]);
			if (result !== null) {
				lastresult = result;
			}
		}

		return lastresult;
	};

	this.TclEval = function(script) {
		return this.exec(parser.parse_script(script)[1]);
	};

	this['TclEval'] = this.TclEval;
	this['TclError'] = TclError;
	this['registerCommand'] = this.registerCommand;
	this['get_var'] = this.get_var;
	this['get_scalar'] = this.get_scalar;
	this['get_array'] = this.get_array;
	this['set_var']  = this.set_var;
	this['set_scalar']  = this.set_scalar;
	this['set_array']  = this.set_array;

	// Built-ins
	this.registerCommand('set', function(args, interp){
		if (args.length < 2 || args.length > 3) {
			throw new TclError('wrong # args: should be "set varName ?newValue?"',
				'TCL', 'WRONGARGS');
		}
		if (args.length === 2) {
			return interp.get_var(args[1]);
		} else {
			return interp.set_var(args[1], args[2]);
		}
	});

	this.registerCommand('list', function(args){
		return list.array2list(args.slice(1));
	});

	console.log('registered commands: ', this.commands);
	console.log('registered variables: ', this.variables);
};
});
