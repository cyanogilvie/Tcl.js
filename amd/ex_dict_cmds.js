/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./list',

	'./objtype_dict'
], function(
	tcllist
){
'use strict';

function install(interp) {
	var TclError = interp.TclError;
	if (interp.register_extension('ex_dict_cmds')) {return;}

	/*
	interp.registerCommand('dict', function(args){
		return tcllist.array2list(args.slice(1));
	});
	*/
}

return {'install': install};
});
