/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./coreinterp',
	'./ex_core_cmds'
], function(
	CoreInterp,
	ex_core_cmds
){
'use strict';

function Interp(){
	var args = Array.prototype.slice.call(arguments), i;
	ex_core_cmds.install(this);
	for (i=0; i<args.length; i++) {
		args[i].install(this);
	}
};
Interp.prototype = new CoreInterp();

return Interp;
});
