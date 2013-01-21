/*global define */
define([
	'./utils',
	'./tclobject',
	'./objtype_bool',
	'./objtype_list',
	'./objtype_int',
	'./types'
], function(
	utils,
	tclobj,
	BoolObj,
	ListObj,
	IntObj,
	types
){
'use strict';

var subcmds, TclError = types.TclError,
	ARRAY = types.ARRAY;

subcmds = {
	exists: function(args, I){
		I.checkArgs(args, 1, 'arrayName');
		return new BoolObj(I.array_exists(args[1]));
	},
	get: function(args, I){
		I.checkArgs(args, [1, 2], 'arrayName ?pattern?');
		var vinfo = I.resolve_var(args[1]), res = [], a, e, pattern;

		if (vinfo === undefined || vinfo.type === ARRAY) {
			return I.EmptyResult;
		}

		a = vinfo.value;
		if (args[2] === undefined) {
			for (e in a) {
				if (a.hasOwnProperty(e)) {
					res.push(e, a[e]);
				}
			}
		} else {
			pattern = utils.glob2regex(args[2]);
			for (e in a) {
				if (a.hasOwnProperty(e) && pattern.test(e)) {
					res.push(e, a[e]);
				}
			}
		}

		return new ListObj(res);
	},
	names: function(args, I){
		I.checkArgs(args, [1, 3], 'arrayName ?mode? ?pattern?');
		var vinfo = I.resolve_var(args[1]), res = [], a, e, mode, pattern;

		if (vinfo === undefined || vinfo.type === ARRAY) {
			return I.EmptyResult;
		}

		if (args.length >= 2) {
			mode = args[2].toString();
		} else {
			mode = '-glob';
		}

		if (args.length >= 3) {
			switch (mode) {
				case 'glob':
					pattern = utils.glob2regex(args[3]);
					break;
				case 'exact':
					pattern = utils.escape_regex(args[3]);
					break;
				case 'regex':
					if (args[3].cache.regex === undefined) {
						args[3].cache.regex = new RegExp(args[3].toString());
					}
					pattern = args[3].cache.regex;
					break;
				default:
					throw new TclError('bad option "'+args[2]+'": must be -exact, -glob, or -regexp', ['TCL', 'LOOKUP', 'INDEX']);
			}
		}

		a = vinfo.value;
		if (pattern === undefined) {
			for (e in a) {
				if (a.hasOwnProperty(e)) {
					res.push(e);
				}
			}
		} else {
			for (e in a) {
				if (a.hasOwnProperty(e) && pattern.test(e)) {
					res.push(e);
				}
			}
		}

		return new ListObj(res);
	},
	set: function(args, I){
		I.checkArgs(args, 2, 'arrayName list');
		var vinfo = I.resolve_var(args[1]), l, k, v, i;

		if (vinfo === undefined) {
			vinfo = I.create_var(args[1], '');
		}

		if (vinfo.type !== ARRAY) {
			throw new TclError('can\'t array set "'+args[1]+'": variable isn\'t array', ['TCL', 'WRITE', 'ARRAY']);
		}

		l = args[2].GetList();
		for (i=0; i<l.length; i+=2) {
			k = l[i]; v = l[i+1];
			if (vinfo.value.hasOwnProperty(k)) {
				vinfo.value[k].DecrRefCount();
			}
			vinfo.value[k] = tclobj.AsObj(v);
			vinfo.value[k].IncrRefCount();
		}
		return I.EmptyResult;
	},
	size: function(args, I){
		I.checkArgs(args, 1, 'arrayName');
		var vinfo = I.resolve_var(args[1]), c = 0, e;

		if (vinfo === undefined || vinfo.type !== ARRAY) {
			return I.EmptyResult;
		}

		for (e in vinfo.value) {
			if (vinfo.value.hasOwnProperty(e)) {
				c++;
			}
		}

		return new IntObj(c);
	},
	unset: function(args, I){
		I.checkArgs(args, [1, 2], 'arrayName ?pattern?');
		var vinfo = I.resolve_var(args[1]), e, a, pattern;

		if (vinfo === undefined || vinfo.type !== ARRAY) {
			return I.EmptyResult;
		}
		a = vinfo.value;
		if (args[2] === undefined) {
			for (e in a) {
				if (a.hasOwnProperty(e)) {
					a[e].DecrRefCount();
					delete a[e];
				}
			}
		} else {
			pattern = utils.glob2regex(args[2]);
			for (e in a) {
				if (a.hasOwnProperty(e) && pattern.test(e)) {
					a[e].DecrRefCount();
					delete a[e];
				}
			}
		}

		return I.EmptyResult;
	}
};

function install(interp) {
	if (interp.register_extension('ex_array_cmds')) {return;}

	interp.registerCommand('array', function(args){
		var subcmd, fakeargs=args.slice(1);
		if (args.length < 2) {
			interp.checkArgs(args, 1, 'subcmd args');
		}

		subcmd = args[1];
		fakeargs[0] = args[0]+' '+subcmd;
		if (subcmds[subcmd] === undefined) {
			throw new TclError('unknown or ambiguous subcommand "'+subcmd+'": must be '+utils.objkeys(subcmds).join(', '),
				['TCL', 'LOOKUP', 'SUBCOMMAND', subcmd]);
		}
		return subcmds[subcmd](fakeargs, interp);
	});
}

return {'install': install};
});
