/*jslint plusplus: true, white: true, nomen: true, regexp: true */

import * as ex_callframes	from './ex_callframes.js';
import * as ex_control_cmds	from './ex_control_cmds.js';
import * as ex_list_cmds	from './ex_list_cmds.js';
import * as ex_dict_cmds	from './ex_dict_cmds.js';
import * as ex_string_cmds	from './ex_string_cmds.js';
import * as ex_array_cmds	from './ex_array_cmds.js';
import * as ex_clock_cmds	from './ex_clock_cmds.js';
import types				from './types.js';
import IntObj				from './objtype_int.js';

var TclResult = types.TclResult,
	TclError = types.TclError,
	codeOkObj = new IntObj(types.OK);

export function install(interp) {
	if (interp.register_extension('ex_core_cmds')) {return;}

	/* Core commands still to implement:
	 after binary clock coroutine format global info interp
	 namespace package regexp regsub rename scan subst tailcall time trace
	 update uplevel upvar variable vwait yield zlib
	 */

	interp.registerCommand('set', function(args){
		interp.checkArgs(args, [1, 2], 'varName ?newValue?');
		if (args.length === 2) {
			return interp.get_var(args[1]);
		}
		return interp.set_var(args[1], args[2]);
	});

	interp.registerCommand('unset', function(args){
		var eating_args = true, report_errors = true, i;
		while (eating_args && args.length > 0) {
			switch (args[0].toString()) {
				case '-nocomplain': report_errors = false; args.shift(); break;
				case '--': eating_args = false; args.shift(); break;
			}
		}
		for (i=0; i<args.length; i++) {
			interp.unset_var(args[i], report_errors);
		}
	});

	interp.registerAsyncCommand('catch', function(c, args){
		interp.checkArgs(args, [1, 3], 'script ?resultVarName? ?optionsVarName?');
		var resultvar = args[2], optionsvar = args[3];
		return interp.exec(args[1], function(res){
			if (resultvar !== undefined) {
				interp.set_var(resultvar, res.result);
			}
			if (optionsvar !== undefined) {
				interp.set_var(optionsvar, res.options);
			}
			return c(new IntObj(res.code));
		});
	});

	interp.registerAsyncCommand('expr', function(c, args){
		interp.checkArgs(args, [1, null], 'arg ?arg ...?');
		if (args.length === 2) {
			return interp._TclExpr(args[1], c);
		}
		var i, str_args = [];
		for (i=1; i<args.length; i++) {
			str_args.push(args.toString());
		}
		return interp._TclExpr(str_args.join(' '), c);
	});

	interp.registerCommand('incr', function(args){
		interp.checkArgs(args, [1, 2], 'varname ?increment?');
		var intobj,
			increment = args[2] === undefined ? 1 : args[2].GetInt();

		if (!interp.var_exists(args[1])) {
			interp.set_var(args[1], new IntObj(0));;
		}
		intobj = interp.get_var(args[1], true);

		intobj.jsval = intobj.GetInt() + increment;
		intobj.InvalidateCaches();
		return intobj;
	});

	interp.registerCommand('return', function(args){
		var i=1, k, v, options = [], code, mycode, value, level;

		if ((args.length - 1) % 2 === 1) {
			value = args.pop();
		} else {
			value = types.EmptyString;
		}
		while (i<args.length) {
			k = args[i++]; v = args[i++];
			options.push(k, v);
			if (k === '-code') {
				code = types.lookup_code(v);
			} else if (k === '-level') {
				level = v;
			}
		}
		if (level === undefined) {
			level = types.IntOne;
			options.push('-level', level);
		}
		if (code === undefined) {
			code = codeOkObj;
			options.push('-code', code);
		}
		if (level.GetInt() === 0) {
			mycode = code.GetInt();
		} else {
			mycode = types.RETURN;
		}
		return new TclResult(mycode, value, options, level, code);
	});

	interp.registerAsyncCommand('eval', function(c, args){
		var parts = [], i;
		for (i=1; i<args.length; i++) {
			parts.push(/^[ \t\n\r]*(.*?)[ \t\n\r]*$/.exec(args[i].toString())[1]);
		}
		return interp.exec(parts.join(' '), c);
	});

	interp.registerCommand('append', function(args){
		interp.checkArgs(args, [1, null], 'varName ?value ...?');
		var parts = [], obj, i, varname = args[1].toString(),
			vinfo = interp.resolve_var(varname);

		if (vinfo === undefined) {
			vinfo = interp.create_var(varname);
		}
		if (vinfo.type !== types.SCALAR) {
			throw new TclError('can\'t set "'+varname+'": variable is array', ['TCL', 'WRITE', 'VARNAME']);
		}
		if (vinfo.value.IsShared()) {
			obj = vinfo.value.DuplicateObj();
			vinfo.value.DecrRefCount();
			vinfo.value = obj;
			obj.IncrRefCount();
		}
		for (i=2; i<args.length; i++) {
			parts.push(args[i].toString());
		}
		vinfo.value.ConvertToType('string');
		vinfo.value.jsval += parts.join('');
		vinfo.value.InvalidateCaches();
		return vinfo.value;
	});

	ex_callframes.install(interp);
	ex_control_cmds.install(interp);
	ex_list_cmds.install(interp);
	ex_dict_cmds.install(interp);
	ex_string_cmds.install(interp);
	ex_array_cmds.install(interp);
	ex_clock_cmds.install(interp);
}

