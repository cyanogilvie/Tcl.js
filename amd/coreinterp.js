/*jslint plusplus: true, white: true, nomen: true, bitwise: true */
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
	EmptyString = types.EmptyString;

function asTclError(e) {
	return e instanceof TclError ? e : new TclError(e);
}

function trampoline(res) {
	while (typeof res === "function") {res = res();}
}

return function(/* extensions... */){
	var args = Array.prototype.slice.call(arguments),
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
		var vinfo = this.vars[varname];
		if (vinfo === undefined) {
			throw new TclError('can\'t read "'+varname+'": no such variable',
				['TCL', 'LOOKUP', 'VARNAME', varname]);
		}
		return vinfo;
	};

	this.var_exists = function(varname) {
		return this.vars[varname] !== undefined;
	};

	this.scalar_exists = function(varname) {
		return	this.vars[varname] !== undefined &&
				this.vars[varname].type === SCALAR;
	};

	this.array_exists = function(varname) {
		return	this.vars[varname] !== undefined &&
				this.vars[varname].type === ARRAY;
	};

	this.get_scalar = function(varname, make_unshared) {
		var vinfo = this.resolve_var(varname), obj;
		if (vinfo.type === ARRAY) {
			throw new TclError('can\'t read "'+varname+'": variable is array',
				['TCL', 'READ', 'VARNAME']);
		}
		obj = vinfo.value;
		if (make_unshared && obj.refCount > 1) {
			obj = obj.DuplicateObj();
			vinfo.value = obj;
			obj.IncrRefCount();
		}
		return obj;
	};

	this.get_array = function(array, index, make_unshared) {
		var vinfo = this.resolve_var(array), obj;
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
				vinfo.value[index] = obj;
				obj.IncrRefCount();
			}
			return obj;
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
		var vinfo = this.vars[array];
		if (vinfo === undefined) {
			vinfo = this.vars[array] = {type: ARRAY, value: {}};
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
			vinfo = this.vars[parts[0]];
			if (report_errors && (vinfo === undefined || vinfo[parts[1]] === undefined)) {
				throw new TclError('can\'t unset "'+varname+'": no such variable', ['TCL', 'LOOKUP', 'VARNAME']);
			}

			delete vinfo[parts[1]];
			return;
		}
		if (report_errors && this.vars[varname] === undefined) {
			throw new TclError('can\'t unset "'+varname+'": no such variable', ['TCL', 'LOOKUP', 'VARNAME']);
		}
		delete this.vars[varname];
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

	this.resolve_command = function(commandname, failifmissing) {
		var cinfo = this.commands[commandname];
		failifmissing = failifmissing === undefined ? true : failifmissing;
		if (cinfo === undefined && failifmissing) {
			throw new TclError('invalid command name "'+commandname+'"');
		}
		return cinfo;
	};

	function registerCmd(async, commandname, handler, priv, onDelete) {
		var cinfo = I.resolve_command(commandname, false);
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
						if (!(token[1] instanceof ScriptObj)) {
							token[1] = new ScriptObj(token);
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

	function get_words(commandline, c_ok, c_err) {
		var sofar = [], i = 0;

		return function next_words(){
			var resolved;

			while (i < commandline.length) {
				return resolve_word(commandline[i++], function(addwords){
					var i;
					for (i=0; i<addwords.length; i++) {
						sofar.push(addwords[i]);
					}
					return next_words;
				}, function(err){
					return c_err(err);
				});
			}

			if (sofar.length === 0) {return c_ok(sofar);}
			try {
				resolved = I.resolve_command(sofar[0]);
			} catch(e){
				return c_err(e);
			}
			sofar[0] = {
				text: sofar[0],
				cinfo: resolved
			};
			return c_ok(sofar);
		};
	}

	function eval_command(commandline, c) {
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

		return get_words(commandline, function(words){
			var i, result, args, command, needs_trampoline = false, asyncres;
			if (words.length === 0) {
				return c(null);
			}
			command = words[0];
			args = [command.text];
			for (i=1; i<words.length; i++) {
				args.push(words[i]);
			}
			try {
				if (command.cinfo.async) {
					asyncres = command.cinfo.handler(function(result){
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
					}, args, I, command.priv);
					needs_trampoline = true;
					return asyncres;
				}
				result = command.cinfo.handler(args, I, command.priv);
				while (typeof result === 'function') {
					// Support tailcalls
					result = result();
				}
			} catch(e) {
				result = e;
			}
			return got_result(result);
		}, function(err){
			if (!(err instanceof TclResult)) {
				if (!(err instanceof TclError)) {
					err = new TclError(err);
				}
				err = err.toTclResult();
			}
			return c(err);
		});
	}

	this.exec = function(script, c) {
		var lastresult = new TclResult(OK),
			parse = tclobj.AsObj(script).GetExecParse(),
			commands = parse[1], i = 0;

		return function next_commands(){
			while (i<commands.length) {
				return eval_command(commands[i++], function(result){
					if (result !== null) {
						if (result.code !== OK) {
							return c(result);
						}
						lastresult = result;
					}
					return next_commands;
				});
			}
			return c(lastresult);
		};
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

		// Optimize the case when all the operands are already resolved
		for (i=0; i<operands.length; i++) {
			if (operands[i] instanceof Array) {
				break;
			}
			resolved_operands.push(operands[i]);
		}
		if (i === operands.length) {
			return c(body.apply(null, resolved_operands));
		}

		return function next_operand() {
			var operand = operands[i++];
			if (operand === undefined) {
				//console.log('operands: ', operands, ' resolve to: ', resolved_operands);
				return c(body.apply(null, resolved_operands));
			}
			return resolve_operand(operand, function(resolved){
				resolved_operands.push(resolved);
				return next_operand;
			});
		};
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
		var name = op[3], takes = args.length;
		if (mathops[takes][name] === undefined) {
			throw new TclError('Invalid operator "'+name+'"');
		}
		if (typeof mathops[takes][name] === "string") {
			if (mathop_cache[takes][name] === undefined) {
				/*jslint evil: true */
				if (takes === 1) {
					mathop_cache[takes][name] = new Function('a',
						'return '+mathops[takes][name]+' a;'
					);
				} else {
					mathop_cache[takes][name] = new Function('a', 'b',
						'return a '+mathops[takes][name]+' b;'
					);
				}
				/*jslint evil: false */
			}
			return resolve_operands(args, mathop_cache[takes][name], c);
		}
		return mathops[takes][name](args, c);
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
		return function next_P(){
			var thisP = P[i++], res, j, args;
			if (thisP === undefined) {
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
			}

			switch (thisP[0]) {
				case OPERAND:
					stack.push(thisP);
					break;
				case OPERATOR:
					args = [];
					j = thisP[2];
					while (j--) {
						args.push(stack.pop());
					}
					return eval_operator(thisP, args.reverse(), function(res){
						//console.log('eval_operator '+thisP[3]+' (', args, ') = ', res);
						stack.push(res);
						return next_P;
					});
			}
			return next_P;
		};
	};

	this.TclError = TclError;
	this.TclResult = TclResult;
	this.tclobj = tclobj;

	this.register_extension = function(ex) {
		if (this.extensions[ex] === undefined) {
			this.extensions[ex] = true;
			return false;
		}
		return true;
	};

	(function(){
		var i;
		// Load the extensions
		for (i=0; i<args.length; i++) {
			args[i].install(this);
		}
	}());
};
});
