/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./parser',
	'./tclobject',
	'./list',
	'./types',
	'cflib/promise',
	'cflib/tailcall',

	'./objtype_list'
], function(
	parser,
	tclobj,
	list,
	types,
	Promise,
	TailCall
){
"use strict";

var TclError = types.TclError,
	TclResult = types.TclResult,
	SCALAR = types.SCALAR,
	ARRAY = types.ARRAY,
	OK = types.OK,
	ERROR = types.ERROR,
	RETURN = types.RETURN,
	BREAK = types.BREAK,
	CONTINUE = types.CONTINUE;

return function(/* extensions... */){
	var args = Array.prototype.slice.call(arguments), i;

	this.vars = {};
	this.commands = {};
	this.extensions = {};

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
		if (index !== undefined) {
			if (vinfo.value[index] === undefined) {
				throw new TclError('can\'t read "'+array+'('+index+')": no such element in array',
					'TCL', 'READ', 'VARNAME');
			}
			return vinfo.value[index];
		}
		return vinfo.value;
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
		}
		return this.get_scalar(varname);
	};

	this.set_var = function(varname, value) {
		var parts;
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = this._parse_varname(varname);
			return this.set_array(parts[0], parts[1], value);
		}
		return this.set_scalar(varname, value);
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

	this.checkArgs = function(args, count, msg) {
		var min, max;
		if (count instanceof Array) {
			min = count[0];
			max = count[1];
		} else {
			min = count;
			max = count;
		}
		if (args.length-1 < min || args.length-1 > max) {
			throw new TclError('wrong # args: should be "'+args[0]+' '+msg+'"',
				'TCL', 'WRONGARGS');
		}
	};

	this.resolve_word = function(tokens, c_ok, c_err) {
		var parts=[], expand=false, array, self=this;

		function callnext(token){
			var i, word, res, index;

			if (token === undefined) {
				if (parts.length === 0) {
					return c_ok([]);
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
				return c_ok(expand ? tclobj.GetList(res) : [res]);
			}

			switch (token[0]) {
				case parser.EXPAND:
					expand = true;
					break;

				case parser.TXT:
					parts.push(tclobj.NewString(token[1]));
					break;

				case parser.VAR:
					parts.push(self.get_scalar(token[1]));
					break;

				case parser.ARRAY:
					array = token[1];
					break;

				case parser.INDEX:
					return new TailCall(self.resolve_word, [token[1], function(indexwords){
						index = indexwords.join('');
						parts.push(self.get_array(array, index));
						array = null;
						return new TailCall(callnext, [tokens.shift()]);
					}, function(err){
						return c_err(err);
					}], self);

				case parser.SCRIPT:
					return new TailCall(self.exec, [token[1], function(result){
						parts.push(result.result);
						return new TailCall(callnext, [tokens.shift()]);
					}, function(err){
						return c_err(err);
					}], self);
			}

			return new TailCall(callnext, [tokens.shift()]);
		}

		return callnext(tokens.shift());
	};

	this.get_words = function(remaining, c_ok, c_err) {
		var self = this, sofar = [];

		function get_next(next){
			var resolved;

			if (next === undefined) {
				if (sofar.length > 0) {
					try {
						resolved = self.resolve_command(sofar[0]);
					} catch(e){
						return c_err(e);
					}
					sofar[0] = {
						text: sofar[0],
						cinfo: resolved
					};
				}
				return c_ok(sofar);
			}

			return new TailCall(self.resolve_word, [next, function(addwords){
				var i;
				for (i=0; i<addwords.length; i++) {
					sofar.push(addwords[i]);
				}
				return get_next(remaining.shift());
			}, function(err){
				return c_err(err);
			}], self);
		}

		return get_next(remaining.shift());
	};

	this.eval_command = function(commandline, c) {
		var command, result, args, i, self=this;

		function normalize_result(result) {
			if (!(result instanceof TclResult)) {
				if (result instanceof Error) {
					result = new TclResult(ERROR, tclobj.NewString(result));
				} else {
					result = new TclResult(OK, result);
				}
			}
			if (!(result.result instanceof tclobj.TclObject)) {
				result.result = tclobj.NewObj('auto', result.result);
			}
			return result;
		}

		function got_result(result) {
			return c(normalize_result(result));
		}

		return this.get_words(commandline, function(words){
			if (words.length === 0) {
				return c(null);
			}
			command = words.shift();
			args = [command.text];
			for (i=0; i<words.length; i++) {
				args.push(words[i]);
			}
			try {
				result = command.cinfo.handler.call(command.thisobj, args, self, command.priv);
			} catch(e) {
				result = e;
			}
			if (result instanceof Promise) {
				result.then(function(result){
					self._trampoline(got_result(result));
				}, function(err){
					self._trampoline(got_result(new TclResult(ERROR, tclobj.NewString(err))));
				});
			} else {
				return got_result(result);
			}
		}, function(err){
			return c(err);
		});
	};

	this.exec = function(commands, c_ok, c_err) {
		var lastresult=new TclResult(OK), self=this;

		function eval_next(command){
			if (command === undefined) {
				if (lastresult.code === OK || lastresult.code === RETURN) {
					return c_ok(lastresult);
				}
				return c_err(lastresult);
			}

			return new TailCall(self.eval_command, [command, function(result){
				if (result !== null) {
					if (result.code === ERROR) {
						return c_err(result);
					}
					lastresult = result;
				}
				return eval_next(commands.shift());
			}], self);
		}

		return eval_next(commands.shift());
	};

	this._trampoline = function(res) {
		while (res instanceof TailCall) {
			res = res.invoke();
		}
	};

	this._getParseFromObj = function(obj) {
		// TODO: as a new TclObject type 'parse', that caches the parsed
		// script
		return parser.parse_script(obj.GetString());
	};

	this.TclEval = function(script) {
		var promise = new Promise(), parse;
		parse = this._getParseFromObj(tclobj.AsObj(script));
		this._trampoline(this.exec(parse[1], function(res){
			promise.resolve(res);
		}, function(err){
			promise.reject(err);
		}));
		return promise;
	};

	this.TclExpr = function(expr) {
		throw new Error('Not implemented yet');
	};

	this['TclEval'] = this.TclEval;
	this['TclExpr'] = this.TclExpr;
	this['TclError'] = TclError;
	this['TclResult'] = TclResult;
	this['tclobj'] = tclobj;
	this['registerCommand'] = this.registerCommand;
	this['checkArgs'] = this.checkArgs;
	this['get_var'] = this.get_var;
	this['get_scalar'] = this.get_scalar;
	this['get_array'] = this.get_array;
	this['set_var']  = this.set_var;
	this['set_scalar']  = this.set_scalar;
	this['set_array']  = this.set_array;

	this['register_extension'] = function(ex) {
		if (this.extensions[ex] === undefined) {
			this.extensions[ex] = true;
			return false;
		}
		return true;
	};

	// Load the extensions
	for (i=0; i<args.length; i++) {
		args[i].install(this);
	}
};
});
