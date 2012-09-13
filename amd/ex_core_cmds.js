/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./ex_control_cmds',
	'./ex_list_cmds',
	'./ex_dict_cmds',
	'./types'
], function(
	ex_control_cmds,
	ex_list_cmds,
	ex_dict_cmds,
	types
){
'use strict';

var TclResult = types.TclResult;

function install(interp) {
	if (interp.register_extension('ex_core_cmds')) {return;}

	/* Core commands still to implement:
	 subst time eval proc throw break variable error catch clock info array
	 coroutine global update append format package namespace binary scan apply
	 trace zlib after vwait continue uplevel rename regexp upvar tailcall
	 unset regsub interp incr string yield
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
		intobj.bytes = null;
		return intobj;
	});

	interp.registerCommand('return', function(args){
		interp.checkArgs(args, [0, 1], '?value?');
		if (args.length === 2) {
			return new TclResult(types.RETURN, interp.get_var(args[1]));
		}
		return new TclResult(types.RETURN, '');
	});

	ex_control_cmds.install(interp);
	ex_list_cmds.install(interp);
	ex_dict_cmds.install(interp);
}

return {'install': install};
});
