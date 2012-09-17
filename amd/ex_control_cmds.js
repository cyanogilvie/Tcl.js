/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./types',
	'./list',
	'./objtype_bool'
], function(
	types,
	tcllist,
	BoolObj
){
'use strict';

var TclError = types.TclError;

function install(interp){
	if (interp.register_extension('ex_control_cmds')) {return;}

	/* Core control structures still to implement:
	 switch for while try foreach
	 */

	interp.registerAsyncCommand('if', function(c, args, interp){
		interp.checkArgs(args, [3, null], 'expression script ?args ...?');
		var i = 1;

		return function next(){
			return interp._TclExpr(args[i++], function(res){
				if (res.result.GetBool()) {
					if (args[i].toString() === 'then') {i++;}
					return interp.exec(args[i], c);
				}
				i++; // skip then body
				switch (args[i++].toString()) {
					case undefined:	return c('');
					case 'elseif':	return next;
					case 'else':	return interp.exec(args[i], c);
					default:		return interp.exec(args[i-1], c);
				}
			}, function(err){
				if (!(err instanceof TclError)) {
					err = new TclError(err);
				}
				c(err);
			});
		};
	});
}

return {'install': install};
});
