/*jshint curly:false */
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
	'./objtype_string',
	'./objtype_bool'
], function(
	parser,
	tclobj,
	list,
	types,
	ListObj,
	ScriptObj,
	ExprObj,
	IntObj,
	StringObj,
	BoolObj
){
"use strict";

var TclError = types.TclError,
	TclResult = types.TclResult,
	TclObject = tclobj.TclObject,
	SCALAR = types.SCALAR,
	ARRAY = types.ARRAY,
	OK = types.OK,
	ERROR = types.ERROR,
	RETURN = types.RETURN,
	BREAK = types.BREAK,
	CONTINUE = types.CONTINUE,
	OPERAND = parser.OPERAND,
	OPERATOR = parser.OPERATOR,
	BOOL = parser.BOOL,
	FLOAT = parser.FLOAT,
	INTEGER = parser.INTEGER,
	ARG = parser.ARG,
	MATHFUNC = parser.MATHFUNC,
	BRACED = parser.BRACED,
	QUOTED = parser.QUOTED,
	VAR = parser.VAR,
	// ARRAY = parser.ARRAY,  <-- don't do this - it clashes with the import from types.ARRAY
	SCRIPT = parser.SCRIPT,
	EmptyString = types.EmptyString,
	EmptyResult = new TclResult(OK, ''),
	TrueResult = new TclResult(OK, new BoolObj(true)),
	FalseResult = new TclResult(OK, new BoolObj(false));

function asTclError(e) {
	return e instanceof TclError ? e : new TclError(e);
}

function trampoline(res) {
	while (typeof res === "function" && res.tcl_break_trampoline === undefined) {
		res = res();
	}
	return res;
}

return function(/* extensions... */){
	var interp_args = Array.prototype.slice.call(arguments),
		I = this, mathops, mathfuncs, mathop_cache = [null, {}, {}];

	this.vars = {};
	this.commands = {};
	this.extensions = {};

	this.str_return_codes = {
		'ok':		new IntObj(OK),
		'error':	new IntObj(ERROR),
		'return':	new IntObj(RETURN),
		'break':	new IntObj(BREAK),
		'continue':	new IntObj(CONTINUE)
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

	this.resolve_command = function(cmdObj) {
		var cinfo;
		if (cmdObj.cache.command === undefined) {
			cinfo = this.lookup_command(cmdObj);
			if (cinfo === undefined) {
				throw new TclError('invalid command name "'+cmdObj+'"');
			}
			cmdObj.cache.command = cinfo;
			cinfo.cacheRefs.push(function(){
				if (cmdObj && cmdObj.cache) {
					delete cmdObj.cache.command;
				}
			});
		} else {
			cinfo = cmdObj.cache.command;
		}

		return cinfo;
	};

	function registerCmd(async, commandname, handler, priv, onDelete) {
		var cinfo = I.lookup_command(commandname);
		if (cinfo !== undefined) {
			if (cinfo.onDelete) {
				cinfo.onDelete(cinfo.priv);
			}
			while (cinfo.cacheRefs.length > 0) {
				cinfo.cacheRefs.pop()();
			}
		} else {
			cinfo = I.commands[commandname] = {};
		}
		cinfo.handler = handler;
		cinfo.async = async;
		cinfo.priv = priv;
		cinfo.onDelete = onDelete;
		cinfo.cacheRefs = [];
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

		function resolve_index(indexwords) {
			var index = indexwords.join('');
			parts.push(I.get_array(array, index));
			array = null;
			return next_tokens;
		}

		function script_result(result) {
			if (result.code === OK) {
				parts.push(result.result);
				return next_tokens;
			}
			return c_err(result);
		}

		function next_tokens() {
			var res, token;

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
						return resolve_word(token[1], resolve_index, c_err);

					case parser.SCRIPT:
						if (!(token[1] instanceof TclObject)) {
							token[1] = new ScriptObj([parser.SCRIPT, token[1].slice()]);
						}
						return I.exec(token[1], script_result);
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
		}
		return next_tokens;
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

				function token_result(resolved) {
					parts.push(resolved);
					return next_tokens;
				}

				function next_tokens() {
					var token;
					while (i<word.length) {
						token = word[i++];
						if (typeof token === "function") {
							if (token.async) {
								return token(token_result, c_err);
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
				}
				return next_tokens();
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
			function got_res(res) {
				last_res = res;
				return res.code === OK ? next_command : c(res);
			}
			function next_command() {
				while (i<out.length) {
					return out[i++](got_res);
				}
				return c(last_res);
			}
			return next_command();
		};
	};

	this.exec = function(script, c) {
		return tclobj.AsObj(script).GetExecParse(I)(c);
	};

	this.TclEval = function(script, c) {
		try {
			return trampoline(this.exec(script, c));
		} catch(e){
			return c(asTclError(e).toTclResult());
		}
	};

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
	var mathfunc_contracts = { // Flag functions that aren't const and sync here
		rand:	{constant: false},
		srand:	{constant: false}
	};
	mathops = {
		1: {
			'!': function(a) {return !list.bool(a);},
			'~': '~',
			'-': '-',
			'+': function(a) {return a;}
		},
		2: {
			'*': '*',
			'/': '/',
			'%': '%',
			'+': '+',
			'-': '-',
			'<<': '<<',
			'>>': '>>',
			'**': function(a, b) {return Math.pow(a, b);},
			'||': {
				compiler: function(args){
					var f, a=args[0], b=args[1];
					if (a.constant) {
						return list.bool(a()) ? a : b;
					}
					if (a.async) {
						f = b.async ?
							function(c){
								return a(function(v){
									return list.bool(v) ? c(v) : b(c);
								});
							} :
							function(c){
								return a(function(v){
									return list.bool(v) ? c(v) : c(b());
								});
							};
						f.async = true;
						return f;
					}
					f = b.async ?
						function(c){
							var v = a();
							return list.bool(v) ? c(v) : b(c);
						} :
						function(){
							var v = a();
							return list.bool(v) ? v : b();
						};
					f.async = b.async;
					return f;
				}
			},
			'&&': {
				compiler: function(args){
					var f, a=args[0], b=args[1];
					if (a.constant) {
						return list.bool(a()) ? b : a;
					}
					if (a.async) {
						f = b.async ?
							function(c){
								return a(function(v){
									return list.bool(v) ? b(c) : c(v);
								});
							} :
							function(c){
								return a(function(v){
									return list.bool(v) ? c(b()) : c(v);
								});
							};
						f.async = true;
						return f;
					}
					f = b.async ?
						function(c){
							var v = a();
							return list.bool(v) ? b(c) : c(v);
						} :
						function(){
							var v = a();
							return list.bool(v) ? b() : v;
						};
					f.async = b.async;
					return f;
				}
			},
			'<': '<',
			'>': '>',
			'<=': '<=',
			'>=': '>=',
			'==': '==',
			'!=': '!=',
			'eq': function(a, b) {return String(a) === String(b);},
			'ne': function(a, b) {return String(a) !== String(b);},
			'&': '&',
			'^': '^',
			'|': '|',
			'in': function(a, b){
				// TODO: add compiler so that the case that b is const can be
				// optimized by building an object captured by a closure to
				// test using hasOwnProperty()
				var i, l = tclobj.AsObj(b).GetList();
				for (i=0; i<l.length; i++) {
					if (String(l[i]) === String(a)) {
						return true;
					}
				}
				return false;
			},
			'ni': function(a, b){
				var i, l = tclobj.AsObj(b).GetList();
				for (i=0; i<l.length; i++) {
					if (String(l[i]) === String(a)) {
						return false;
					}
				}
				return true;
			}
		},
		3: {
			'?': {
				compiler: function(args){
					var f, t=args[0], a=args[1], b=args[2];
					if (t.constant) {
						return list.bool(t()) ? a : b;
					}
					if (t.async) {
						f = function(c){
							return t(function(v){
								return list.bool(v) ?
									(a.async ? a(c) : c(a())) :
									(b.async ? b(c) : c(b()));
							});
						};
						f.async = true;
						return f;
					} else if (a.async || b.async) {
						f = function(c){
							return list.bool(t()) ?
								(a.async ? a(c) : c(a())) :
								(b.async ? b(c) : c(b()));
						};
						f.async = true;
						return f;
					} else {
						return function(){
							return list.bool(t()) ? a() : b();
						};
					}
				}
			}
		},
		any: {}
	};

	this.TclExpr = function(expr, c) {
		try {
			return trampoline(this._TclExpr(expr, c));
		} catch(e){
			return c(asTclError(e).toTclResult());
		}
	};

	this._TclExpr = function(expr, c) {
		var f = compile_expr(expr);

		function got_val(v) {
			switch (typeof v) {
				case 'boolean': return c(v ? TrueResult : FalseResult);
				case 'string': return c(new TclResult(OK, new StringObj(v)));
				case 'number': return c(new TclResult(OK, tclobj.NewObj('jsval', v)));
				default: return c(new TclResult(OK, tclobj.NewObj('auto', v)));
			}
		}
		return f.async ? f(got_val) : got_val(f());
	};

	function check_tokens(tokens) {
		var i, token, async=false, constant=true, r, constval='';
		for (i=0; i<tokens.length; i++) {
			token = tokens[i];
			switch (token[0]) {
				case parser.TXT:
					if (constant) {constval += token[1];}
					break;

				case parser.EXPAND:
				case parser.VAR:
				case parser.ARRAY:
					constant = false;
					break;

				case parser.INDEX:
					r = check_tokens(token[1]);
					if (r.async) {async = true;}
					break;
				case parser.SCRIPT:
					async = true;
					constant = false;
					break;
			}
		}
		return {
			async: async,
			constant: constant,
			constval: constant ? constval : undefined
		};
	}

	function constant_op(operand) {
		var f = function(){return operand;};
		f.constant = true;
		return f;
	}

	function string_op(tokens) {
		var f, r=check_tokens(tokens);
		if (r.constant) {
			return constant_op(r.constval);
		}
		function err(errmsg) {
			throw new Error('Error resolving quoted word: '+errmsg);
		}
		if (r.async) {
			f = function(c){
				return resolve_word(tokens, function(chunks){
					return chunks.length === 1 ?
							c(chunks[0]) : c(chunks.join(''));
				}, err);
			};
		} else {
			f = function(){
				return trampoline(resolve_word(tokens, function(chunks){
					return chunks.length === 1 ?  chunks[0] : chunks.join('');
				}, err));
			};
		}
		f.async = r.async;
		return f;
	}

	function scalar_op(varname) {
		return function(){ return I.get_scalar(varname); };
	}

	function array_op(varname, index) {
		var r, f;
		function err(errmsg) {
			throw new Error('Error resolving array index: '+errmsg);
		}
		if (typeof index === 'string') {
			return function(){ return I.get_array(varname, index); };
		} else {
			r = check_tokens(index);
			if (r.async) {
				f = function(c){
					return resolve_word(index, function(indexwords){
						var index = indexwords.length === 1 ?
								indexwords[0] : indexwords.join('');
						return c(I.get_array(varname, index));
					}, err);
				};
			} else {
				f = function(){
					return trampoline(resolve_word(index, function(indexwords){
						return I.get_array(varname, indexwords.length === 1 ?
							indexwords[0] : indexwords.join(''));
					}, err));
				};
			}
			f.async = r.async;
			return f;
		}
	}

	function script_op(script) {
		var f;
		if (script instanceof Array) {
			script = new ScriptObj(script);
		}
		f = function(c){
			return I.exec(script, function(res){ return c(res.result); });
		};
		f.async = true;
		return f;
	}

	function mathfunc_op(parts) {
		var part, args=[], arg, i, j=0, f, async=false, constant=true, constval,
			nativefunc, outargs=[], apply, handler,
			funcname = parts[0][3],
			func_handler = mathfuncs[funcname];

		for (i=2; i<parts.length; i++) {	// 0 is funcname, 1 is (
			part = parts[i];
			if (part[0] === ARG) {
				arg = part[1] === parser.EXPR ?
					compile_expr(part[2]) :
					constant_op(part[2]);

				if (!async && arg.async) {
					async = true;
				}
				if (arg.constant) {
					outargs.push(arg());
				} else {
					args.push(j, arg);
					outargs.push(undefined);
					if (constant) {
						constant = false;
					}
				}
				j++;
			}
		}

		// TODO: when we allow runtime definitions of math funcs, any change
		// to the math funcs must invalidate all the expr caches
		if (func_handler === undefined) {
			// Not really true yet
			throw new TclError('invalid command name "tcl::mathfunc::'+funcname+'"');
		}

		if (func_handler.args) {
			if (args.length < func_handler.args[0]) {
				throw new TclError('too few arguments to math function "'+funcname+'"', ['TCL', 'WRONGARGS']);
			}
			if (func_handler.args[1] !== null && outargs.length > func_handler.args[1]) {
				throw new TclError('too many arguments to math function "'+funcname+'"', ['TCL', 'WRONGARGS']);
			}
		}

		if (mathfunc_contracts[funcname]) {
			if (constant && mathfunc_contracts[funcname].constant !== true) {
				constant = false;
			}
			if (!async && mathfunc_contracts[funcname].async) {
				async = true;
			}
		}

		if (typeof func_handler === 'string') {
			nativefunc = Math[func_handler];
		} else {
			handler = func_handler.handler;
		}

		if (constant) {
			if (nativefunc) {
				constval = nativefunc.apply(Math, outargs);
			} else {
				constval = handler(outargs, I, func_handler.priv);
			}
			return constant_op(constval);
		}

		apply = nativefunc ?
			function(){ return nativefunc.apply(Math, outargs); } :
			function(){ return handler(outargs, I, func_handler.priv); };

		if (async) {
			f = function(c){
				var i=0;
				function setarg(j) {
					return function(res){
						outargs[j] = res;
						return loop;
					};
				}
				function loop() {
					var j, argfunc;
					while (i<args.length) {
						j = args[i++];
						argfunc = args[i++];
						if (argfunc.async)
							return argfunc(setarg(j));
						outargs[j] = argfunc();
					}
					return c(apply());
				}
				return loop();
			};
		} else {
			f = function(){
				var i;
				for (i=0; i<args.length; i+=2) {
					outargs[args[i]] = args[i+1]();
				}
				return apply();
			};
		}
		f.async = async;
		return f;
	}

	function operand2func(operand) {
		if (!(operand instanceof Array)) {
			debugger;	// Shouldn't happen
			return constant_op(operand);
		}
		//console.log('resolving operand: ', operand.slice());
		switch (operand[1]) {
			case MATHFUNC:
				return mathfunc_op(operand[2]);
			case INTEGER:
			case FLOAT:
			case BOOL:
				return constant_op(operand[2]);
			case BRACED:
			case QUOTED:
				return string_op(operand[2]);
			case VAR:
				return operand[2].length === 1 ?
					scalar_op(operand[2][0]) :
					array_op(operand[2][0], operand[2][1]);
			case SCRIPT:
				return script_op(operand[2]);
			default:
				throw new Error('Unexpected operand type: '+operand[1]);
		}
	}

	function operator2func(name, args) {
		var takes = args.length, mathop = mathops[takes][name], cached, f, i,
			constant=true, async=false, outargs, dynargs, apply;

		if (mathop === undefined)
			throw new TclError('Invalid operator "'+name+'"');

		if (typeof mathop === 'string') {
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
			mathop = cached[name];
		}

		if (mathop.compiler)
			return mathop.compiler(args);

		outargs = new Array(args.length);
		dynargs = [];
		for (i=0; i<args.length; i++) {
			if (args[i].constant) {
				outargs[i] = args[i]();
			} else {
				outargs[i] = undefined;
				dynargs.push(i, args[i]);
				if (constant)
					constant = false;
				if (!async && args[i].async)
					async = true;
			}
		}

		if (constant)
			return constant_op(mathop.apply(null, outargs));

		switch (args.length) {
			case 1:
				apply = function(){
					return mathop(outargs[0]);
				};
				break;
			case 2:
				apply = function(){
					return mathop(outargs[0], outargs[1]);
				};
				break;
			case 3:
				apply = function(){
					return mathop(outargs[0], outargs[1], outargs[2]);
				};
				break;
			default:
				throw new TclError('Operator "'+name+'" received incorrect number of arguments: '+args.length);
		}

		if (async) {
			f = function(c){
				var i=0;
				function setarg(j) {
					return function(v){
						outargs[j] = v;
						return loop;
					};
				}
				function loop() {
					var j, fv;
					while (i<dynargs.length) {
						j = dynargs[i++];
						fv = dynargs[i++];
						if (fv.async)
							return fv(setarg(j));
						outargs[j] = fv();
					}
					return c(apply());
				}
				return loop();
			};
		} else {
			f = function(){
				var i;
				for (i=0; i<dynargs.length; i+=2) {
					outargs[dynargs[i]] = dynargs[i+1]();
				}
				return apply();
			};
		}
		f.async = async;
		return f;
	}

	function compile_expr(expr) {
		var exprObj = expr instanceof TclObject ? expr : new ExprObj(expr),
			f = exprObj.cache.expr_f, P,
			i, numargs, stack, thisP, args;

		if (f) return f;

		P = exprObj.GetExprStack();

		stack = [];
		for (i=0; i<P.length; i++) {
			thisP = P[i];
			switch (thisP[0]) {
				case OPERAND: stack.push(operand2func(thisP)); break;
				case OPERATOR:
					numargs = thisP[2];
					args = stack.splice(-numargs, numargs);
					stack.push(operator2func(thisP[3], args));
					break;
			}
		}

		f = stack.pop();
		if (stack.length) {
			throw new Error('Expr stack not empty at end of compile: '+stack);
		}
		exprObj.cache.expr_f = f;
		return f;
	}
	this.compile_expr = compile_expr;

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
