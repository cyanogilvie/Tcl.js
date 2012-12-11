/*jslint plusplus: true, white: true, nomen: true, bitwise: true, continue: true */
/*global define */

define([
	'./parser',
	'./tclobject',
	'./list',
	'./types',
	'./objtype_list',
	'./objtype_script',
	'./objtype_expr',
	'./objtype_int',
	'./objtype_string'
], function(
	parser,
	tclobj,
	list,
	types,
	ListObj,
	ScriptObj,
	ExprObj,
	IntObj,
	StringObj
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
	CONTINUE = types.CONTINUE,
	OPERATOR = parser.OPERATOR,
	OPERAND = parser.OPERAND,
	MATHFUNC = parser.MATHFUNC,
	INTEGER = parser.INTEGER,
	FLOAT = parser.FLOAT,
	BOOL = parser.BOOL,
	QUOTED = parser.QUOTED,
	BRACED = parser.BRACED,
	SCRIPT = parser.SCRIPT,
	EXPR = parser.EXPR,
	VAR = parser.VAR,
	INDEX = parser.INDEX,
	ARG = parser.ARG,
	EmptyString = types.EmptyString,
	EmptyResult = new TclResult(OK, '');

function asTclError(e) {
	return e instanceof TclError ? e : new TclError(e);
}

function trampoline(res) {
	while (typeof res === "function") {res = res();}
}

return function(/* extensions... */){
	var interp_args = Array.prototype.slice.call(arguments),
		I = this, mathops, mathfuncs, mathop_cache = [null, {}, {}];

	this.vars = {};
	this.commands = {};
	this.extensions = {};

	this.str_return_codes = {
		'ok':		new IntObj(types.OK),
		'error':	new IntObj(types.ERROR),
		'return':	new IntObj(types.RETURN),
		'break':	new IntObj(types.BREAK),
		'continue':	new IntObj(types.CONTINUE)
	};

	this.resolve_var = function(varname) {
		return this.vars[varname];
	};

	this.create_var = function(varname, index) {
		if (index === undefined) {
			this.vars[varname] = {
				type: SCALAR,
				value: EmptyString
			};
			this.vars[varname].value.IncrRefCount();
		} else {
			this.vars[varname] = {
				type: ARRAY,
				value: {}
			};
		}
		return this.vars[varname];
	};

	this.delete_var = function(varname) {
		var e, arr;
		if (this.vars[varname] === undefined) {
			return;
		}
		switch (this.vars[varname].type) {
			case SCALAR:
				this.vars[varname].value.DecrRefCount();
				break;
			case ARRAY:
				arr = this.vars[varname].value;
				for (e in arr) {
					if (arr.hasOwnProperty(e)) {
						arr[e].value.DecrRefCount();
						delete arr[e];
					}
				}
				break;
		}
		delete this.vars[varname];
	};

	this.var_exists = function(varname) {
		return this.resolve_var(varname) !== undefined;
	};

	this.scalar_exists = function(varname) {
		var vinfo = this.resolve_var(varname);
		return	vinfo !== undefined &&
				vinfo.type === SCALAR;
	};

	this.array_exists = function(varname) {
		var vinfo = this.resolve_var(varname);
		return	vinfo !== undefined &&
				vinfo.type === ARRAY;
	};

	this.get_scalar = function(varname, make_unshared) {
		var vinfo = this.resolve_var(varname), obj;
		if (vinfo === undefined) {
			throw new TclError('can\'t read "'+varname+'": no such variable',
				['TCL', 'LOOKUP', 'VARNAME', varname]);
		}
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t read "'+varname+'": variable is array',
				['TCL', 'READ', 'VARNAME']);
		}
		obj = vinfo.value;
		if (make_unshared && obj.refCount > 1) {
			obj = obj.DuplicateObj();
			vinfo.value.DecrRefCount();
			vinfo.value = obj;
			obj.IncrRefCount();
		}
		return obj;
	};

	this.get_array = function(array, index, make_unshared) {
		var vinfo = this.resolve_var(array), obj;
		if (vinfo === undefined) {
			throw new TclError('can\'t read "'+array+'": no such variable',
				['TCL', 'LOOKUP', 'VARNAME', array]);
		}
		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t read "'+array+'('+index+')": variable isn\'t array',
				['TCL', 'LOOKUP', 'VARNAME', array]);
		}
		if (index !== undefined) {
			if (vinfo.value[index] === undefined) {
				throw new TclError('can\'t read "'+array+'('+index+')": no such element in array',
					['TCL', 'READ', 'VARNAME']);
			}
			obj = vinfo.value[index];
			if (make_unshared && obj.refCount > 1) {
				obj = obj.DuplicateObj();
				vinfo.value[index].DecrRefCount();
				vinfo.value[index] = obj;
				obj.IncrRefCount();
			}
			return obj;
		}
		return vinfo.value;
	};

	this.set_scalar = function(varname, value) {
		var vinfo = this.resolve_var(varname);
		if (vinfo === undefined) {
			vinfo = this.create_var(varname);
		}
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t set "'+varname+'": variable is array',
				['TCL', 'WRITE', 'VARNAME']);
		}
		if (vinfo.value !== undefined) {
			vinfo.value.DecrRefCount();
		}
		vinfo.value = tclobj.AsObj(value);
		vinfo.value.IncrRefCount();
		return value;
	};

	this.set_array = function(array, index, value) {
		var vinfo = this.resolve_var(array);
		if (vinfo === undefined) {
			vinfo = this.create_var(array, '');
		}
		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t set "'+array+'('+index+')": variable isn\'t array',
				['TCL', 'LOOKUP', 'VARNAME', array]);
		}
		if (index) {
			if (vinfo.value[index] !== undefined) {
				vinfo.value[index].DecrRefCount();
			}
			vinfo.value[index] = tclobj.AsObj(value);
			vinfo.value[index].IncrRefCount();
		}
		return value;
	};

	function parse_varname(varname) {
		var array, index, idx;

		// TODO: properly
		idx = varname.lastIndexOf('(');
		array = varname.substr(0, idx);
		index = varname.substr(idx+1, varname.length-idx-2);

		return [array, index];
	}

	this.unset_var = function(varname, report_errors) {
		var parts, vinfo;
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = parse_varname(varname);
			vinfo = this.resolve_var(parts[0]);
			if (report_errors && (vinfo === undefined || vinfo[parts[1]] === undefined)) {
				throw new TclError('can\'t unset "'+varname+'": no such variable', ['TCL', 'LOOKUP', 'VARNAME']);
			}

			delete vinfo[parts[1]];
			return;
		}
		if (report_errors && this.resolve_var(varname) === undefined) {
			throw new TclError('can\'t unset "'+varname+'": no such variable', ['TCL', 'LOOKUP', 'VARNAME']);
		}
		this.delete_var(varname);
		return;
	};

	this.get_var = function(varname, make_unshared) {
		var parts, obj;
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = parse_varname(varname);
			return this.get_array(parts[0], parts[1], make_unshared);
		}
		obj = this.get_scalar(varname, make_unshared);
		return obj;
	};

	this.set_var = function(varname, value) {
		var parts;
		varname = tclobj.AsVal(varname);
		if (varname[varname.length-1] === ')') {
			parts = parse_varname(varname);
			return this.set_array(parts[0], parts[1], value);
		}
		return this.set_scalar(varname, value);
	};

	this.lookup_command = function(commandname) {
		return this.commands[commandname];
	};

	this.resolve_command = function(commandname) {
		var cinfo = this.lookup_command(commandname);
		if (cinfo === undefined) {
			throw new TclError('invalid command name "'+commandname+'"');
		}
		return cinfo;
	};

	function registerCmd(async, commandname, handler, priv, onDelete) {
		var cinfo = I.lookup_command(commandname);
		if (cinfo !== undefined && cinfo.onDelete) {
			cinfo.onDelete(cinfo.priv);
		} else {
			cinfo = I.commands[commandname] = {};
		}
		cinfo.handler = handler;
		cinfo.async = async;
		cinfo.priv = priv;
		cinfo.onDelete = onDelete;
	}

	this.registerCommand = function(commandname, handler, priv, onDelete) {
		return registerCmd(false, commandname, handler, priv, onDelete);
	};
	this.registerAsyncCommand = function(commandname, handler, priv, onDelete) {
		return registerCmd(true, commandname, handler, priv, onDelete);
	};

	this.checkArgs = function(args, count, msg) {
		var min, max;
		if (count instanceof Array) {
			min = count[0];
			max = count[1] || 9007199254740992;	// javascript maxint
		} else {
			min = count;
			max = count;
		}
		if (args.length-1 < min || args.length-1 > max) {
			throw new TclError('wrong # args: should be "'+args[0]+' '+msg+'"',
				['TCL', 'WRONGARGS']);
		}
	};

	function resolve_word(tokens, c_ok, c_err) {
		var parts=[], expand=false, array, i=0;

		return function next_tokens(){
			var res, index, token;

			while (i < tokens.length) {
				token = tokens[i++];
				switch (token[0]) {
					case parser.EXPAND:
						expand = true;
						break;

					case parser.TXT:
						parts.push(new StringObj(token[1]));
						break;

					case parser.VAR:
						parts.push(I.get_scalar(token[1]));
						break;

					case parser.ARRAY:
						array = token[1];
						break;

					case parser.INDEX:
						return resolve_word(token[1], function(indexwords){
							index = indexwords.join('');
							parts.push(I.get_array(array, index));
							array = null;
							return next_tokens;
						}, function(err){
							return c_err(err);
						});

					case parser.SCRIPT:
						if (!(token[1] instanceof tclobj.TclObject)) {
							token[1] = new ScriptObj([parser.SCRIPT, token[1].slice()]);
						}
						return I.exec(token[1], function(result){
							if (result.code === OK) {
								parts.push(result.result);
								return next_tokens;
							}
							return c_err(result);
						});
				}
			}

			if (parts.length === 0) {
				return c_ok([]);
			}
			if (parts.length > 1) {
				res = new StringObj(parts.join(''));
			} else {
				res = parts[0];
			}
			return c_ok(expand ? tclobj.GetList(res) : [res]);
		};
	}

	function exec_command(args, c) {
		var cinfo = I.resolve_command(args[0]),
			result, needs_trampoline = false, asyncres;

		function normalize_result(result) {
			if (!(result instanceof TclResult)) {
				if (result instanceof TclError) {
					result = result.toTclResult();
				} else if (result instanceof Error) {
					result = new TclResult(ERROR, new StringObj(result));
				} else {
					result = new TclResult(OK, result);
				}
			}
			return result;
		}

		function got_result(result) {
			return c(normalize_result(result));
		}

		try {
			if (cinfo.async) {
				asyncres = cinfo.handler(function(result){
					try {
						while (typeof result === 'function') {
							// Support tailcalls
							result = result();
						}
						if (!needs_trampoline) {
							return got_result(result);
						}
						return trampoline(got_result(result));
					} catch(e2){
						return got_result(asTclError(e2));
					}
				}, args, I, cinfo.priv);
				if (typeof asyncres !== 'function') {
					needs_trampoline = true;
				}
				return asyncres;
			}
			result = cinfo.handler(args, I, cinfo.priv);
			while (typeof result === 'function') {
				// Support tailcalls
				result = result();
			}
		} catch(e) {
			result = e;
		}
		return got_result(result);
	}

	this.compile_script = function(commands) {
		var i, j, word, command = [], out = [];

		function compile_word(tokens) {
			var i, token, word = [], async = false, array, expand = false;

			function fetch_array(array, indexfunc) {
				var f;
				if (indexfunc.async) {
					f = function(c_ok, c_err){
						var indexwords = [];
						return indexfunc(indexwords, function(){
							return c_ok(I.get_array(array, indexwords[0]));
						}, c_err);
					};
					f.async = true;
					return f;
				} else {
					f = function(){
						var indexwords = [];
						indexfunc(indexwords);
						return I.get_array(array, indexwords[0]);
					};
					f.async = false;
					return f;
				}
			}
			function run_script(obj) {
				var f = function(c_ok, c_err){
					return I.exec(obj, function(res){
						if (res.code === OK) {
							return c_ok(res.result);
						}
						return c_err(res);
					}, c_err);
				};
				f.async = true;
				return f;
			}
			function fetch_scalar(varname) {
				var f = function(){
					return I.get_scalar(varname);
				};
				f.async = false;
				return f;
			}

			function static_obj(obj) {
				obj.IncrRefCount();
				var f = function(words){
					words.push(obj);
				};
				f.async = false;
				return f;
			}
			function resolve_async(words, c_ok, c_err) {
				var parts = [], outwords, obj, i = 0;

				return (function next_tokens(){
					var token;
					while (i<word.length) {
						token = word[i++];
						if (typeof token === "function") {
							if (token.async) {
								return token(function(resolved){
									parts.push(resolved);
									return next_tokens;
								}, c_err);
							}
							parts.push(token());
						} else {
							parts.push(token);
						}
					}

					if (parts.length > 1) {
						obj = new StringObj(parts.join(''));
					} else {
						obj = parts[0];
					}

					if (!expand) {
						words.push(obj);
						return c_ok;
					}
					outwords = obj.GetList();
					while (i<outwords.length) {
						words.push(outwords[i++]);
					}
					return c_ok;
				}());
			}
			resolve_async.async = true;

			for (i=0; i<tokens.length; i++) {
				token = tokens[i];
				switch (token[0]) {
					case parser.SCRIPT:
						word.push(run_script(new ScriptObj(token)));
						async = true;
						break;

					case parser.INDEX:
						word.push(fetch_array(array, compile_word(token[1])));
						// TODO: scan index tokens to see if they can be
						// processed synchronously
						async = true;
						array = undefined;
						break;

					case parser.ARRAY:
						array = token[1];
						break;

					case parser.EXPAND:
						expand = true;
						break;

					case parser.TXT:
						word.push(token[1]);
						break;

					case parser.VAR:
						word.push(fetch_scalar(token[1]));
						break;

					default:
						//console.log('stripping token: ', token.slice());
						break;
				}
			}
			if (word.length === 1 && typeof word[0] === "string") {
				return static_obj(new tclobj.NewString(word[0]));
			}
			if (word.length === 0) {
				return;
			}
			return resolve_async;
		}

		function compile_command(command) {
			var i, word, async = false, f;
			for (i=0; i<command.length; i++) {
				word = command[i];
				if (word.async) {
					async = true;
					break;
				}
			}
			if (async) {
				f = function(c){
					var args = [], i = 0;
					function err(e){
						if (e instanceof TclResult || e instanceof TclError) {
							return c(e);
						}
						return c((new TclError(e)).toTclResult());
					}
					return (function next_args(){
						var wordfunc;
						while (i<command.length) {
							wordfunc = command[i++];
							if (wordfunc.async) {
								return wordfunc(args, next_args, err);
							}
							wordfunc(args);
						}
						return exec_command(args, c);
					}());
				};
				f.async = true;
				return f;
			}
			f = function(c) {
				var args = [], i;
				for (i=0; i<command.length; i++) {
					command[i](args);
				}
				return exec_command(args, c);
			};
			f.async = false;
			return f;
		}

		for (i=0; i<commands.length; i++) {
			command = [];
			for (j=0; j<commands[i].length; j++) {
				word = compile_word(commands[i][j]);
				if (word !== undefined) {
					command.push(word);
				}
			}
			if (command.length) {
				out.push(compile_command(command));
			}
		}
		return function(c){
			var i = 0, last_res = EmptyResult;
			return (function next_command(){
				var cmd;
				while (i<out.length) {
					cmd = out[i++];
					return cmd(function(res){
						last_res = res;
						if (res.code === OK) {
							return next_command;
						}
						return c(res);
					});
				}
				return c(last_res);
			}());
		};
	};

	this.exec = function(script, c) {
		return tclobj.AsObj(script).GetExecParse(I)(c);
	};

	this.TclEval = function(script, c) {
		try {
			trampoline(this.exec(script, c));
		} catch(e){
			return c(asTclError(e).toTclResult());
		}
	};

	function resolve_operand(operand, c) {
		var i = 2,	// 0 is funcname, 1 is (
			parts, funcname, args;

		function next_part(){
			var part = parts[i++], func_handler;
			if (part === undefined) {
				if (mathfuncs[funcname] === undefined) {
					// Not really true yet
					throw new TclError('invalid command name "tcl::mathfunc::'+funcname+'"');
				}
				func_handler = mathfuncs[funcname];
				if (typeof func_handler === 'string') {
					return c(Math[func_handler].apply(Math, args));
				}
				if (func_handler.args) {
					if (args.length < func_handler.args[0]) {
						throw new TclError('too few arguments to math function "'+funcname+'"', ['TCL', 'WRONGARGS']);
					}
					if (func_handler.args[1] !== null && args.length > func_handler.args[1]) {
						throw new TclError('too many arguments to math function "'+funcname+'"', ['TCL', 'WRONGARGS']);
					}
				}
				return c(func_handler.handler(args, I, func_handler.priv));
			}
			if (part[0] === ARG) {
				if (part[1] === EXPR) {
					return I._TclExpr(tclobj.NewExpr(part[2]),
						function(res) {
							args.push(res);
							return next_part;
						}, function(res) {
							throw new Error('Error resolving expression: '+res);
						}
					);
				}
				args.push(part[2]);
			}
			return next_part;
		}

		if (!(operand instanceof Array)) {
			return c(operand);
		}
		//console.log('resolving operand: ', operand.slice());
		switch (operand[1]) {
			case MATHFUNC:
				parts = operand[2];
				funcname = parts[0][3];
				args = [];
				return next_part;
			case INTEGER:
			case FLOAT:
			case BOOL:
				return c(operand[2]);
			case BRACED:
			case QUOTED:
				return resolve_word(operand[2], function(chunks){
					if (chunks.length === 1) {
						return c(chunks[0]);
					}
					return c(chunks.join(''));
				}, function(err){
					throw new Error('Error resolving quoted word: '+err);
				});
			case VAR:
				if (operand[2].length === 1) {
					return c(I.get_scalar(operand[2][0]));
				}
				if (typeof operand[2][1] === 'string') {
					return c(I.get_array(operand[2][0], operand[2][1]));
				}
				return resolve_word(operand[2][1], function(indexwords){
					var index;
					index = indexwords.join('');
					return c(I.get_array(operand[2][0], index));
				}, function(err){
					throw new Error('Error resolving array index: '+err);
				});
			case SCRIPT:
				if (operand[2] instanceof Array) {
					operand[2] = new ScriptObj(operand[2]);
				}
				return I.exec(operand[2], function(res){
					return c(res.result);
				});
			default:
				throw new Error('Unexpected operand type: '+operand[1]);
		}
	}

	function resolve_operands(operands, body, c) {
		var resolved_operands = [], i=0;

		return (function next_operands(){
			var operand;
			while (i<operands.length) {
				operand = operands[i++];
				if (operand instanceof Array) {
					switch (operand[1]) {
						case INTEGER:
						case FLOAT:
						case BOOL:
							resolved_operands.push(operand[2]);
							continue;
						case VAR:
							if (operand[2].length === 1) {
								resolved_operands.push(I.get_scalar(operand[2][0]));
								continue;
							}
							if (typeof operand[2][1] === 'string') {
								resolved_operands.push(I.get_array(operand[2][0], operand[2][1]));
								continue;
							}
					}

					return resolve_operand(operand, function(resolved){
						resolved_operands.push(resolved);
						return next_operands;
					});
				}
				resolved_operands.push(operand);
			}
			return c(body.apply(null, resolved_operands));
		}());
	}

	function not_implemented(){throw new Error('Not implemented yet');}
	function bignum_not_implemented(){throw new Error('Bignum support not implemented yet');}
	mathfuncs = {
		abs: 'abs',
		acos: 'acos',
		asin: 'asin',
		atan: 'atan',
		atan2: 'atan2',
		bool: {args: [1, 1],
			handler: function(args) {return [OPERAND, BOOL, list.bool(args[0])];}
		},
		ceil: 'ceil',
		cos: 'cos',
		cosh: {args: [1, 1], handler: not_implemented},
		'double': {args: [1, 1],
			handler: function(args) {return [OPERAND, FLOAT, args[0]];}
		},
		entier: {args: [1, 1], handler: bignum_not_implemented},
		exp: 'exp',
		floor: 'floor',
		fmod: {args: [2, 2],
			handler: function(args){ var a = args[0], b = args[1];
				return a - (Math.floor(a / b) * b);
			}
		},
		hypot: {args: [2, 2],
			handler: function(args){ var a = args[0], b = args[1];
				// I don't think this exactly does what the Tcl hypot does
				return Math.sqrt(a*a + b*b);
			}
		},
		'int': {args: [1, 1],
			handler: function(args) {
				return [OPERATOR, INTEGER, Math.floor(args[0])];
			}
		},
		isqrt: {args: [1, 1], handler: bignum_not_implemented},
		log: 'log',
		log10: {args: [1, 1], handler: not_implemented},
		max: 'max',
		min: 'min',
		pow: 'pow',
		rand: 'random',	// Doesn't precisely match the bounds of the Tcl rand
		round: {args: [1, 1],
			handler: function(args) {
				return [OPERATOR, INTEGER, Math.round(args[0])];
			}
		},
		sin: 'sin',
		sinh: {args: [1, 1], handler: not_implemented},
		sqrt: 'sqrt',
		srand: {args: [1, 1],	// TODO: implement an RNG that can be seeded?
			handler: function() {}
		},
		tan: 'tan',
		tanh: {args: [1, 1], handler: not_implemented},
		wide: {args: [1, 1],
			handler: function(args){
				if (console) {
					console.warn('Javascript doesn\'t support 64bit integers');
				}
				return [OPERATOR, INTEGER, Math.floor(args[0])];
			}
		}
	};
	mathops = {
		1: {
			'!': function(args, c) {return resolve_operands(args, function(a){return ! list.bool(a);}, c);},
			'~': '~',
			'-': '-',
			'+': function(args, c) {return c(args[0]);}
		},
		2: {
			'*': '*',
			'/': '/',
			'%': '%',
			'+': '+',
			'-': '-',
			'<<': '<<',
			'>>': '>>',
			'**': function(args, c) {return resolve_operands(args, function(a, b){
				return Math.pow(a, b);
			}, c);},
			'||': function(args, c) {return resolve_operands([args[0]], function(a){
				return list.bool(a) || args[1];
			}, c);},
			'&&': function(args, c) {return resolve_operands([args[0]], function(a){
				return list.bool(a) && args[1];
			}, c);},
			'<': '<',
			'>': '>',
			'<=': '<=',
			'>=': '>=',
			'==': '==',
			'!=': '!=',
			'eq': function(args, c) {return resolve_operands(args, function(a, b){
				return String(a) === String(b);
			}, c);},
			'ne': function(args, c) {return resolve_operands(args, function(a, b){
				return String(a) !== String(b);
			}, c);},
			'&': '&',
			'^': '^',
			'|': '|',
			'in': function(args, c) {return resolve_operands(args, function(a, b){
				return tclobj.AsObj(b).GetList().indexOf(a) !== -1;
			}, c);},
			'ni': function(args, c) {return resolve_operands(args, function(a, b){
				return tclobj.AsObj(b).GetList().indexOf(a) === -1;
			}, c);}
		},
		3: {
			'?': function(args, c) {
				return resolve_operands([args[0]], function(a){
					return list.bool(a) ? args[1] : args[2];
				}, c);
			}
		},
		any: {}
	};

	function eval_operator(op, args, c) {
		var name = op[3], takes = args.length,
			mathop = mathops[takes][name], cached;
		if (mathop === undefined) {
			throw new TclError('Invalid operator "'+name+'"');
		}
		if (typeof mathop === "string") {
			cached = mathop_cache[takes];
			if (cached[name] === undefined) {
				/*jslint evil: true */
				if (takes === 1) {
					cached[name] = new Function('a',
						'return '+mathop+' a;'
					);
				} else {
					cached[name] = new Function('a', 'b',
						'return a '+mathop+' b;'
					);
				}
				/*jslint evil: false */
			}
			return resolve_operands(args, cached[name], c);
		}
		return mathop(args, c);
	}

	this.TclExpr = function(expr, c) {
		try {
			trampoline(this._TclExpr(expr, c));
		} catch(e){
			return c(asTclError(e).toTclResult());
		}
	};

	this._TclExpr = function(expr, c) {
		var P = tclobj.AsObj(expr).GetExprStack(), i=0, stack = [];
		// Algorithm from Harry Hutchins http://faculty.cs.niu.edu/~hutchins/csci241/eval.htm
		return (function next_P(){
			var thisP, res, j, args;
			while (i<P.length) {
				thisP = P[i++];

				switch (thisP[0]) {
					case OPERAND:
						stack.push(thisP);
						break;
					case OPERATOR:
						j = thisP[2];
						args = new Array(j);
						while (j--) {
							args[j] = stack.pop();
						}
						return eval_operator(thisP, args, function(res){
							//console.log('eval_operator '+thisP[3]+' (', args, ') = ', res);
							stack.push(res);
							return next_P;
						});
				}
			}
			res = stack.pop();
			if (stack.length) {
				throw new Error('Expr stack not empty at end of eval:'+stack);
			}
			if (!(res instanceof Array)) {
				return c(new TclResult(OK, res));
			}
			return resolve_operand(res, function(res){
				return c(new TclResult(OK, res));
			});
		}());
	};

	this.TclError = TclError;
	this.TclResult = TclResult;
	this.tclobj = tclobj;
	this.EmptyResult = EmptyResult;
	this.types = types;

	this.register_extension = function(ex) {
		if (this.extensions[ex] === undefined) {
			this.extensions[ex] = true;
			return false;
		}
		return true;
	};

	this.override = function(fn, new_implmentation){
		I[fn] = new_implmentation;
	};

	(function(){
		var i;
		// Load the extensions
		for (i=0; i<interp_args.length; i++) {
			interp_args[i].install(this);
		}
	}());
};
});
