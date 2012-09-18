/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./ex_control_cmds',
	'./ex_list_cmds',
	'./ex_dict_cmds',
	'./ex_string_cmds',
	'./types',

	'./objtype_int'
], function(
	ex_control_cmds,
	ex_list_cmds,
	ex_dict_cmds,
	ex_string_cmds,
	types
){
'use strict';

var TclResult = types.TclResult;

function install(interp) {
	if (interp.register_extension('ex_core_cmds')) {return;}

	/* Core commands still to implement:
	 subst time eval proc variable catch clock info array
	 coroutine global update append format package namespace binary scan apply
	 trace zlib after vwait uplevel rename regexp upvar tailcall
	 unset regsub interp yield
	 */

	interp.registerCommand('set', function(args){
		interp.checkArgs(args, [1, 2], 'varName ?newValue?');
		if (args.length === 2) {
			return interp.get_var(args[1]);
		}
		return interp.set_var(args[1], args[2]);
	});

	interp.registerCommand('expr', function(args){
		interp.checkArgs(args, [1, null], 'arg ?arg ...?');
		if (args.length === 2) {
			return interp.TclExpr(args[1]);
		}
		var i, str_args = [];
		for (i=1; i<args.length; i++) {
			str_args.push(args.toString());
		}
		return interp.TclExpr(str_args.join(' '));
	});

	interp.registerCommand('incr', function(args){
		interp.checkArgs(args, [1, 2], 'varname ?increment?');
		var intobj = interp.get_var(args[1], true),
			increment = args[2] === undefined ? 1 : args[2].GetInt();
		intobj.jsval = intobj.GetInt() + increment;
		intobj.InvalidateCaches();
		return intobj;
	});

	interp.registerCommand('return', function(args){
		interp.checkArgs(args, [0, null], '?value?');
		var pairs = args.slice(0, args.length-1), i, k, v, options = {},
			code = types.RETURN, value;

		if (args.length % 2 === 1) {
			value = args.pop();
		} else {
			value = types.EmptyString;
		}
		while (i<args.length) {
			k = args[i++]; v = args[i++];
			options[k] = v;
		}
		if (options['-code'] === undefined) {
			options['-code'] = interp.str_return_codes['return'];
		}
		if (interp.str_return_codes[options['-code']] !== undefined) {
			options['-code'] = interp.str_return_codes[options['-code']];
		}
		if (options['-level'] === undefined) {
			options['-level'] = types.IntOne;
		}
		return new TclResult(options['-code'].GetInt(), value, options);
	});

	ex_control_cmds.install(interp);
	ex_list_cmds.install(interp);
	ex_dict_cmds.install(interp);
	ex_string_cmds.install(interp);
}

return {'install': install};
});
