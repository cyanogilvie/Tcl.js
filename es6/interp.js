/*jslint plusplus: true, white: true, nomen: true */

import CoreInterp			from './coreinterp.js';
import * as ex_core_cmds	from './ex_core_cmds.js';

export default function Interp(){
	var args = Array.prototype.slice.call(arguments), i,
		I = new CoreInterp();

	ex_core_cmds.install(I);

	for (i=0; i<args.length; i++) {
		args[i].install(I);
	}
	return I;
};
