/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./ex_list_cmds',
	'./ex_dict_cmds',
	'./types'
], function(
	ex_list_cmds,
	ex_dict_cmds,
	types
){
'use strict';

var TclError = types.TclError,
	TclResult = types.TclResult;

function install(interp) {
	if (interp.register_extension('ex_core_cmds')) {return;}

	interp.registerCommand('set', function(args, interp){
		interp.checkArgs(args, [1, 2], 'varName ?newValue?');
		if (args.length === 2) {
			return interp.get_var(args[1]);
		}
		return interp.set_var(args[1], args[2]);
	});

	interp.registerCommand('return', function(args, interp){
		interp.checkArgs(args, [0, 1], '?value?');
		if (args.length === 2) {
			return new TclResult(types.RETURN, interp.get_var(args[1]));
		}
		return new TclResult(types.RETURN, '');
	});

	ex_list_cmds.install(interp);
	ex_dict_cmds.install(interp);
}

return {'install': install};
});
