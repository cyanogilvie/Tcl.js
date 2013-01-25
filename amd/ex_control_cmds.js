/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./types',
	'./utils',
	'./objtype_bool',
	'./objtype_dict',
	'./objtype_list',
	'./objtype_int'
], function(
	types,
	utils,
	BoolObj,
	DictObj,
	ListObj,
	IntObj
){
'use strict';

var TclError = types.TclError,
	TclResult = types.TclResult,
	EmptyString = types.EmptyString,
	intZero = new IntObj(0),
	intThree = new IntObj(3),
	intFour = new IntObj(4);

function install(interp){
	if (interp.register_extension('ex_control_cmds')) {return;}

	/* Core control structures still to implement:
	 switch
	 */

	interp.registerCommand('continue', function(args){
		interp.checkArgs(args, 0, '');
		return new TclResult(types.CONTINUE, EmptyString,
			['-level', intZero, '-code', intFour], 0, 4);
	});

	interp.registerCommand('break', function(args){
		interp.checkArgs(args, 0, '');
		return new TclResult(types.BREAK, EmptyString,
			['-level', intZero, '-code', intThree], 0, 3);
	});

	interp.registerCommand('error', function(args){
		interp.checkArgs(args, [1, 3], 'message ?info? ?code?');
		return new TclError(args[1],
			args[2] !== undefined ? args[2].GetList() : ['NONE'],
			args[3]);
	});

	interp.registerCommand('throw', function(args){
		interp.checkArgs(args, 2, 'type message');
		return new TclError(args[2],
			args[1] !== undefined ? args[1].GetList() : ['NONE']);
	});

	interp.registerAsyncCommand('try', function(c, args){
		var body, finallyscript, handlers = [],
			type, match, varlist, script, i = 0;
		interp.checkArgs(args, [1, null], 'body ?handler...? ?finally script?');
		args.shift();
		body = args.shift();
		if (args.length >= 2) {
			if (args[args.length-2] === 'finally') {
				finallyscript = args.pop();
				args.pop();
			}
		}
		if (args % 4 !== 0) {
			interp.checkArgs(args, 0, 'body ?handler...? ?finally script?');
		}
		while (i<args.length) {
			type = args[i++];
			match = args[i++];
			varlist = args[i++].GetList();
			if (varlist.length > 2) {
				throw new TclError('Too many variable names for try handler');
			}
			script = args[i++];
			switch (type.toString()) {
				case 'on':
					type = 0;
					if (interp.str_return_codes[match.toString()] !== undefined) {
						match = interp.str_return_codes[match.toString()];
					} else {
						match = match.GetInt();
					}
					break;
				case 'trap':
					match = match.GetList();
					type = 1;
					break;
				default:
					throw new TclError('Invalid handler type: "'+type.toString()+'"');
			}
			handlers.push([type, match, varlist, script]);
		}

		function dofinally(res) {
			if (finallyscript) {
				return interp.exec(finallyscript, function(finally_res){
					if (finally_res.code === types.OK) {
						return c(res);
					}
					return c(finally_res);
				});
			}
			return c(res);
		}

		function matches(res, handler) {
			var i, errorcode;
			if (handler[0] === 0) { // on handler
				return res.code === handler[1];
			}
			// trap handler
			errorcode = res.options['-errorcode'] || [];
			for (i=0; i<handler[1].length; i++) {
				if (handler[1][i].toString() !== errorcode[i].toString()) {
					return false;
				}
			}
			return true;
		}

		return interp.exec(body, function(res){
			var handler;
			for (i=0; i<handlers.length; i++) {
				if (matches(res, handlers[i])) {
					handler = handlers[i];
					break;
				}
			}
			if (handler) {
				if (handler[2][0]) {
					interp.set_scalar(handler[2][0], res.result);
				}
				if (handler[2][1]) {
					interp.set_scalar(handler[2][1], new DictObj(res.options));
				}
				return interp.exec(handler[3], function(res){
					return dofinally(res);
				});
			}
			return dofinally(res);
		});
	});

	interp.registerAsyncCommand('if', function(c, args, interp){
		interp.checkArgs(args, [2, null], 'expression script ?args ...?');
		var i = 1;

		return function next(){
			return interp._TclExpr(args[i++], function(res){
				if (res.code !== types.OK) {return c(res);}
				if (res.result.GetBool()) {
					if (args[i].toString() === 'then') {i++;}
					return interp.exec(args[i], c);
				}
				i++; // skip then body
				if (i >= args.length) {return c(interp.EmptyString);}
				switch (args[i++].toString()) {
					case 'elseif':	return next;
					case 'else':	return interp.exec(args[i], c);
					default:		return interp.exec(args[i-1], c);
				}
			});
		};
	});

	interp.registerAsyncCommand('switch', function(c, args, I){
		var arg, cmp, eating_args = true, ignorecase = false, default_handler,
			matchvar, indexvar, str, patterns, cmdname = args.shift(), i;

		function cmp_exact(pat) {
			return pat.toString() === str;
		}
		function cmp_exact_nocase(pat) {
			return pat.toString().toLowerCase() === str;
		}
		function cmp_glob(pat) {
			return utils.glob2regex(pat).test(str, ignorecase);
		}
		function cmp_regexp(pat) {
			var m, re, indices = [], i;
			// TODO somehow translate pat (which is a Tcl style regex) to a
			// javascript style regex
			re = new RegExp(pat, ignorecase ? 'i' : '');
			if ((m = re.exec(str))) {
				if (matchvar !== undefined) {
					I.set_var(matchvar, new ListObj(m));
				}
				if (indexvar !== undefined) {
					indices.push(new ListObj([m.index, m.index + m[0].length]));
					// TODO: somehow get the indices of the submatches, the
					// hack below is not reliable
					for (i=1; i<m.length; i++) {
						indices.push(str.indexOf(m[i], m.index));
					}
					I.set_var(indexvar, new ListObj(indices));
				}
				return true;
			}
			return false;
		}

		cmp = cmp_glob;

		while (eating_args && args.length > 2) {
			arg = args[0].toString();
			if (arg.charAt(0) !== '-') {break;}
			args.shift();
			switch (arg) {
				case '-exact': cmp = cmp_exact; break;
				case '-glob': cmp = cmp_glob; break;
				case '-regexp': cmp = cmp_regexp; break;
				case '-nocase': ignorecase = true; break;
				case '-matchvar': matchvar = args.shift(); break;
				case '-indexvar': indexvar = args.shift(); break;
				case '--': eating_args = false; break;
				default:
					throw new TclError('bad option "'+arg+'" must be -exact, -glob, -indexvar, -matchvar, -nocase, -regexp, or --', ['TCL', 'LOOKUP', 'INDEX', 'option', arg]);
			}
		}

		str = args.shift();
		if (args.length === 1) {
			patterns = args[0];
		} else {
			patterns = args;
		}
		if (str === undefined || patterns === undefined || patterns.length % 2 !== 0) {
			I.checkArgs([cmdname], 2, '?options? string {pattern body ?pattern body ...?}');
		}
		if (ignorecase) {
			str = str.toString().tolowerCase();
		} else {
			str = str.toString();
		}
		if (cmp !== cmp_regexp) {
			if (matchvar !== undefined) {
				throw new TclError('-matchvar option requries -regexp option',
					['TCL', 'OPERATION', 'SWITCH', 'MODERESTRICTION']);
			}
			if (indexvar !== undefined) {
				throw new TclError('-indexvar option requries -regexp option',
					['TCL', 'OPERATION', 'SWITCH', 'MODERESTRICTION']);
			}
		}
		if (cmp === cmp_exact && ignorecase) {
			cmp = cmp_exact_nocase;
		}

		if (patterns[patterns.length-2].toString() === 'default') {
			default_handler = patterns.pop();
			patterns.pop();
		}

		for (i=0; i<patterns.length; i+=2) {
			if (cmp(patterns[i])) {
				return I.exec(patterns[i+1], c);
			}
		}
		if (default_handler !== undefined) {
			if (matchvar !== undefined) {
				I.set_var(matchvar, new ListObj());
			}
			if (indexvar !== undefined) {
				I.set_var(indexvar, new ListObj());
			}
			return I.exec(default_handler, c);
		}
		return EmptyString;
	});

	interp.registerAsyncCommand('for', function(c, args){
		interp.checkArgs(args, 4, 'start test next body');
		var start = args[1],
			test = interp.compile_expr(args[2]),
			next = args[3], body = args[4];
		if (test.async) {
			return interp.exec(start, function(res){
				if (res.code !== types.OK) {return c(res);}
				return function loop(){
					return test(function(v){
						if (!utils.bool(v)) return c();
						return interp.exec(body, function(res){
							switch (res.code) {
								case types.CONTINUE:
								case types.OK:
									return interp.exec(next, function(res){
										if (res.code !== types.OK) {return c(res);}
										return loop;
									});
								case types.BREAK:
									return c();
								default:
									return c(res);
							}
						});
					});
				};
			});
		} else {
			return interp.exec(start, function(res){
				if (res.code !== types.OK) {return c(res);}
				return function loop(){
					if (!utils.bool(test())) return c();
					return interp.exec(body, function(res){
						switch (res.code) {
							case types.CONTINUE:
							case types.OK:
								return interp.exec(next, function(res){
									if (res.code !== types.OK) {return c(res);}
									return loop;
								});
							case types.BREAK:
								return c();
							default:
								return c(res);
						}
					});
				};
			});
		}
	});

	interp.registerAsyncCommand('while', function(c, args){
		interp.checkArgs(args, 2, 'test body');
		var test = args[1], body = args[2];
		return function loop(){
			return interp._TclExpr(test, function(res){
				if (res.code !== types.OK) {return c(res);}
				if (!(res.result.GetBool())) {return c();}
				return interp.exec(body, function(res){
					switch (res.code) {
						case types.CONTINUE:
						case types.OK:
							return loop;
						case types.BREAK:
							return c();
						default:
							return c(res);
					}
				});
			});
		};
	});

	function foreach(collecting) {
		return function(c, args) {
			if (args.length < 4 || args.length % 2 !== 0) {
				interp.checkArgs(args, 3, 'varlist1 list1 ?varlist2 list2 ...? body');
			}
			var acc = collecting ? [] : undefined,
				loopvardesc = args.slice(1, args.length-2),
				body = args[args.length-1], i, j,
				varlists = [], lists = [], listptrs = [];

			function done(){
				var i = lists.length;
				while (i-- > 0) {
					if (listptrs[i] < lists[i].length) {return false;}
				}
				return true;
			}

			while (i<loopvardesc.length) {
				varlists.push(loopvardesc[i++].GetList());
				lists.push(loopvardesc[i++].GetList());
				listptrs.push(0);
			}
			return function loop(){
				if (done()) {
					return c(acc);
				}
				for (i=0; i<varlists.length; i++) {
					for (j=0; j<varlists[i].length; j++) {
						interp.set_scalar(varlists[i][j],
							listptrs[i]++ || types.EmptyString);
					}
				}
				return interp.exec(body, function(res){
					switch (res.code) {
						case types.OK:
							if (acc) {acc.push(res.result);}
							// falls through
						case types.CONTINUE:
							return loop;

						case types.BREAK: return c(acc);
						case types.ERROR: return c(res);
						default:
							return c(new TclError('Unexpected result code: "'+res.code+'"'));
					}
				});
			};
		};
	}

	interp.registerAsyncCommand('foreach', foreach(false));
	interp.registerAsyncCommand('lmap', foreach(true));
}

return {'install': install};
});
