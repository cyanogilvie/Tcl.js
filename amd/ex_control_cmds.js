/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./list',
	'cflib/promise'
], function(
	tcllist,
	Promise
){
'use strict';

function install(interp){
	if (interp.register_extension('ex_core_cmds')) {return;}

	/* Core control structures still to implement:
	 switch for while try foreach
	 */

	function run_body(body, promise) {
		interp.TclEval(body).then(function(res){
			return promise.resolve(res);
		}, function(res){
			return promise.resolve(res);
		});
		return promise;
	}

	interp.registerCommand('if', function(args, interp){
		interp.checkArgs(args, [3, null], 'expression script ?args ...?');
		var promise = new Promise(), i = 1;

		function next() {
			interp.TclExpr(args[i++]).then(function(res){
				if (tcllist.bool(res)) {
					if (args[i].toString() === 'then') {i++;}
					return run_body(args[i], promise);
				}
				i++; // skip then body
				switch (args[i++].toString()) {
					case undefined:	return promise.resolve('');
					case 'elseif':	return next();
					case 'else':	return run_body(args[i], promise);
					default:		return run_body(args[i-1], promise);
				}
			}, function(err){
				promise.reject(err);
			});
		}
		next();
		return promise;
	});

}

return {'install': install};
});
