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

var TclResult = types.TclResult,
	SCALAR = types.SCALAR,
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

	interp.registerCommand('proc', function(args){
		interp.checkArgs(args, 3, 'name args body');

		var args_desc = [args[1].toString()], arg_assigners = [],
			args_list = args[2].GetList(), i, arg_info;

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
					throw new TclError('too many fields in argument specifier "'+args[i].toString()+'"', ['TCL', 'OPERATION', 'PROC', 'FORMALARGUMENTFORMAT']);
					
			}
		}

		args_desc = args_desc.join(' ');

		interp.registerAsyncCommand(args[1], function(c, pargs){
			var i;
			pargs.shift();
			interp.push_callframe();
			try {
				for (i=0; i<arg_assigners.length; i++) {
					arg_assigners[i](pargs);
				}
				if (pargs.length > 0) {
					throw new TclError('wrong # args: should be "'+args_desc+'"', ['TCL', 'WRONGARGS']);
				}
				return interp.exec(args[3], function(res){
					// TODO: for errors, assemble errorInfo and friends
					interp.pop_callframe();
					return c(res);
				});
			} catch(e){
				interp.pop_callframe();
				throw e;
			}
		});

		return interp.EmptyResult;
	});
}

return {'install': install};
});

