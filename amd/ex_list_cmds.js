/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./list',

	'./objtype_int'
], function(
	tcllist
){
'use strict';

function install(interp) {
	var TclError = interp.TclError;
	if (interp.register_extension('ex_list_cmds')) {return;}

	interp.registerCommand('list', function(args){
		return tcllist.array2list(args.slice(1));
	});

	interp.registerCommand('lindex', function(args){
		var i, obj, idx, matches, list;
		interp.checkArgs(args, 1, 'list ?index ...?');

		obj = args[1];

		for (i=2; i<args.length; i++) {
			list = obj.GetList();
			idx = args[i].GetString();
			matches = args[i].GetString().match(/^end(-[0-9]+)$/);
			if (matches !== null) {
				idx = list.length-1;
				if (matches[1] !== undefined) {
					idx += Number(matches[1]);
				}
			} else {
				idx = args[i].GetInt();
			}

			obj = list[idx];
		}
		return obj;
	});
}

return {'install': install};
});

