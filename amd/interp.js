/*jslint plusplus: true, white: true, nomen: true */
/*global define, setTimeout */

define([
	'./parser',
	'./tclobject',
	'./list',
	'./promise',

	'./objtype_list'
], function(
	parser,
	tclobj,
	list,
	Promise
){
"use strict";

function TclError(message) {
	var errorcode = Array.prototype.slice(arguments, 1);
	this.name = 'TclError';
	this.errorcode = errorcode.length !== 0 ? errorcode : ['NONE'];
	this.message = message;
}
TclError.prototype = new Error();

function TclResult(code, result, options) {
	this.code = code;
	this.result = result;
	this.options = options;
}

var SCALAR = 0,
	ARRAY = 1,
	OK = 0,
	ERROR = 1,
	RETURN = 2,
	BREAK = 3,
	CONTINUE = 4;

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
		vinfo.value = tclobj.AsObj(value);
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
		vinfo.value[index] = tclobj.AsObj(value);
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
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = this._parse_varname(varname);
			return this.get_array(parts[0], parts[1]);
		} else {
			return this.get_scalar(varname);
		}
	};

	this.set_var = function(varname, value) {
		var parts;
		varname = tclobj.AsVal(varname);
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

	this.resolve_word = function(tokens, parts, promise, expand, array) {
		var i, word, res, token, index, self=this;
		if (parts === undefined) {parts = [];}
		if (promise === undefined) {promise = new Promise();}
		if (expand === undefined) {expand = false;}

		token = tokens.shift();

		function callnext(){
			if (tokens.length === 0) {
				if (parts.length === 0) {
					return promise.resolve([]);
				}
				if (parts.length > 1) {
					word = '';
					for (i=0; i<parts.length; i++) {
						word += parts[i].GetString();
					}
					res = tclobj.NewString(word);
				} else {
					res = parts[0];
				}
				return promise.resolve(expand ? tclobj.GetList(res) : [res]);
			}
			self.resolve_word(tokens, parts, promise, expand, array);
		}

		switch (token[0]) {
			case parser.EXPAND:
				expand = true;
				callnext();
				break;

			case parser.TXT:
				parts.push(tclobj.NewString(token[1]));
				callnext();
				break;

			case parser.VAR:
				parts.push(this.get_scalar(token[1]));
				callnext();
				break;

			case parser.ARRAY:
				array = token[1];
				callnext();
				break;

			case parser.INDEX:
				this.resolve_word(token[1]).then(function(indexwords){
					index = indexwords.join('');
					parts.push(self.get_array(array, index));
					array = null;
					callnext();
				});
				break;

			case parser.SCRIPT:
				this.exec(token[1]).then(function(result){
					parts.push(result.result);
					callnext();
				}, function(err){
					promise.reject(err);
				});
				break;

			default:
				callnext();
		}

		return promise;
	};

	this.get_words = function(remaining, sofar, promise) {
		var next = remaining.shift(), self = this;

		if (sofar === undefined) {sofar = [];}
		if (promise === undefined) {promise = new Promise();}

		function callnext() {
			if (remaining.length === 0) {
				if (sofar.length > 0) {
					sofar[0] = {
						text: sofar[0],
						cinfo: self.resolve_command(sofar[0])
					};
				}
				promise.resolve(sofar);
				return;
			}
			self.get_words(remaining, sofar, promise);
		}

		this.resolve_word(next).then(function(addwords){
			var i;
			for (i=0; i<addwords.length; i++) {
				sofar.push(addwords[i]);
			}
			callnext();
		}, function(err){
			promise.reject(err);
		});

		return promise;
	};

	this.eval_command = function(commandline) {
		var command, result, args, i, self=this, promise=new Promise();

		function normalize_result(result) {
			if (typeof result !== 'object' || !(result instanceof TclResult)) {
				result = new TclResult(OK, result);
			}
			if (!(result.result instanceof tclobj.TclObject)) {
				result.result = tclobj.NewObj('auto', result.result);
			}
			return result;
		}

		this.get_words(commandline).then(function(words){
			if (words.length > 0) {
				command = words.shift();
				args = [command.text];
				for (i=0; i<words.length; i++) {
					args.push(words[i]);
				}
				try {
					result = command.cinfo.handler.call(command.thisobj, args, self, command.priv);
				} catch (e){
					result = new TclResult(ERROR, tclobj.NewString(e));
				}
				if (typeof result === 'object' && result instanceof Promise) {
					result.then(function(result){
						result = normalize_result(result);
						promise.resolve(result);
					}, function(err){
						result = new TclResult(ERROR, tclobj.NewString(err));
						promise.reject(result);
					});
					return promise;
				}
				result = normalize_result(result);
			} else {
				result = null;
			}
			promise.resolve(result);
		}, function(err){
			promise.reject(err);
		});

		return promise;
	};

	this.exec = function(commands, promise, lastresult) {
		var command, self = this;

		if (promise === undefined) {promise = new Promise();}
		if (lastresult === undefined) {lastresult = new TclResult(OK, '');}

		command = commands.shift();

		function callnext(){
			if (commands.length === 0) {
				if (lastresult.code === OK || lastresult.code === RETURN) {
					promise.resolve(lastresult);
				} else {
					promise.reject(lastresult);
				}
				return;
			}
			setTimeout(function(){
				self.exec(commands, promise, lastresult);
			}, 0);
		}

		this.eval_command(command).then(function(result){
			if (result !== null) {
				lastresult = result;
			}
			callnext();
		}, function(err){
			promise.reject(err);
		});

		return promise;
	};

	this.TclEval = function(script) {
		return this.exec(parser.parse_script(script)[1]);
	};

	this['TclEval'] = this.TclEval;
	this['TclError'] = TclError;
	this['TclResult'] = TclResult;
	this['tclobj'] = tclobj;
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
};
});
