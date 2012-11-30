/*jslint plusplus: true, white: true, nomen: true, regexp: true */
/*global define */

define([
	'./types',
	'./objtype_list'
], function(
	types,
	List
){
'use strict';

var SCALAR = types.SCALAR,
	ARRAY = types.ARRAY,
	EmptyString = types.EmptyString;

function install(interp) {
	if (interp.register_extension('ex_callframes')) {return;}

	var callframes = [{}],
		frame = callframes[0],
		TclError = interp.TclError;

	interp.override('resolve_var', function(varname){
		return frame[varname];
	});

	interp.override('create_var', function(varname, index){
		if (index === undefined) {
			frame[varname] = {
				type: SCALAR,
				value: EmptyString
			};
			frame[varname].value.IncrRefCount();
		} else {
			frame[varname] = {
				type: ARRAY,
				value: {}
			};
		}
		return frame[varname];
	});

	interp.override('delete_var', function(varname){
		var e, arr;
		if (frame[varname] === undefined) {
			return;
		}
		switch (frame[varname].type) {
			case SCALAR:
				frame[varname].value.DecrRefCount();
				break;
			case ARRAY:
				arr = frame[varname].value;
				for (e in arr) {
					if (arr.hasOwnProperty(e)) {
						arr[e].value.DecrRefCount();
						delete arr[e];
					}
				}
				break;
		}
		delete frame[varname];
	});

	interp.push_callframe = function(){
		callframes.push({});
		frame = callframes[callframes.length-1];
	};

	interp.pop_callframe = function() {
		if (callframes.length === 1) {
			return;
		}
		var expiring_vars = callframes.pop(), e, v, index;

		for (e in expiring_vars) {
			if (expiring_vars.hasOwnProperty(e)) {
				v = expiring_vars[e];
				switch (v.type) {
					case SCALAR:
						v.value.DecrRefCount();
						delete v.value;
						break;
					case ARRAY:
						for (index in v) {
							if (v.hasOwnProperty(index)) {
								v[index].value.DecrRefCount();
								delete v[index];
							}
						}
						break;
					default:
						// Alias?
				}
			}
		}

		frame = callframes[callframes.length-1];
	};

	function compile_args(args_list, initial_args) {
		var args_desc = initial_args, arg_assigners = [], arg_info, i;

		function assign_required_arg(name) {
			return function(a){
				if (a.length === 0) {
					throw new TclError('wrong # args: should be "'+args_desc+'"', ['TCL', 'WRONGARGS']);
				}
				interp.set_scalar(name, a.shift());
			};
		}

		function assign_optional_arg(name, defaultval) {
			return function(a){
				interp.set_scalar(name, a.length ? a.shift() : defaultval);
			};
		}

		function assign_args() {
			return function(a){
				interp.set_scalar('args', new List(a));
				a.length = 0;
			};
		}

		for (i=0; i<args_list.length; i++) {
			arg_info = args_list[i].GetList();
			if (i === args_list.length-1 && arg_info[0].toString() === 'args') {
				args_desc.push('?arg ...?');
				arg_assigners.push(assign_args());
				break;
			}
			switch (arg_info.length) {
				case 0:
					throw new TclError('argument with no name',
						['TCL', 'OPERATION', 'PROC', 'FORMALARGUMENTFORMAT']);
				case 1:
					args_desc.push(arg_info[0]);
					arg_assigners.push(assign_required_arg(arg_info[0]));
					break;
				case 2:
					args_desc.push('?'+arg_info[0]+'?');
					arg_assigners.push(assign_optional_arg(arg_info[0], arg_info[1]));
					break;
				default:
					throw new TclError('too many fields in argument specifier "'+args_list[i].toString()+'"', ['TCL', 'OPERATION', 'PROC', 'FORMALARGUMENTFORMAT']);
					
			}
		}

		return {
			args_desc: args_desc.join(' '),
			arg_assigners: arg_assigners
		};
	}

	interp.registerCommand('proc', function(args){
		interp.checkArgs(args, 3, 'name args body');

		var arg_info = compile_args(args[2].GetList(), [args[1].toString()]);

		interp.registerAsyncCommand(args[1], function(c, pargs){
			var i;
			pargs.shift();
			interp.push_callframe();
			try {
				for (i=0; i<arg_info.arg_assigners.length; i++) {
					arg_info.arg_assigners[i](pargs);
				}
				if (pargs.length > 0) {
					throw new TclError('wrong # args: should be "'+arg_info.args_desc+'"', ['TCL', 'WRONGARGS']);
				}
				return interp.exec(args[3], function(res){
					// TODO: for errors, assemble errorInfo and friends
					interp.pop_callframe();
					if (res.code === types.RETURN) {
						if (--res.level <= 0) {
							res.code = res.finalcode.GetInt();
							res.level = 0;
						}
					}
					return c(res);
				});
			} catch(e){
				interp.pop_callframe();
				throw e;
			}
		});

		return interp.EmptyResult;
	});

	interp.registerAsyncCommand('apply', function(c, args){
		interp.checkArgs(args, [1, null], 'lambdaExpr ?arg ...?');
		var l, i, linfo;
		if (args[1].cache.lambda === undefined) {
			linfo = args[1].GetList();
			args[1].cache.lambda = compile_args(linfo[0].GetList(),
					['apply', 'lambdaExpr']);
			args[1].cache.lambda.body = linfo[1];
			args[1].cache.lambda.ns = linfo[2];
		}
		l = args[1].cache.lambda;
		args.shift();
		interp.push_callframe();
		try {
			for (i=0; i<l.arg_assigners.length; i++) {
				l.arg_assigners[i](args);
			}
			if (args.length > 0) {
				throw new TclError('wrong # args: should be "'+l.args_desc+'"',
						['TCL', 'WRONGARGS']);
			}
			return interp.exec(l.body, function(res){
				interp.pop_callframe();
				if (res.code === types.RETURN) {
					if (--res.level <= 0) {
						res.code = res.finalcode.GetInt();
						res.level = 0;
					}
				}
				return c(res);
			});
		} catch(e){
			interp.pop_callframe();
			throw e;
		}
	});
}

return {'install': install};
});

