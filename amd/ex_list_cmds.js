/*jslint plusplus: true, white: true, nomen: true, regexp: true */
/*global define */

define([
	'./tclobject',
	'./objtype_list',
	'./utils',

	'./objtype_int'
], function(
	tclobj,
	ListObj,
	utils
){
'use strict';

function resolve_index(list, obj) {
	return utils.resolve_idx(list.length, obj);
}

function install(interp) {
	var TclError = interp.TclError;
	if (interp.register_extension('ex_list_cmds')) {return;}

	/* list commands still to implement:
	 lsearch linsert lreplace lset lsort
	 */

	interp.registerCommand('lassign', function(args){
		interp.checkArgs(args, [1, null], 'list ?varname ...?');
		var list = args[1].GetList(), i, idx;
		for (i=2, idx=0; i<args.length; i++, idx++) {
			interp.set_scalar(args[i], list[idx] || '');
		}
		return new ListObj(list.slice(idx));
	});

	interp.registerCommand('lrange', function(args){
		interp.checkArgs(args, 3, 'list first last');
		var list = args[1].GetList(),
			a = resolve_index(list, args[2]),
			b = resolve_index(list, args[3]);
		return new ListObj(list.slice(a, b-a+1));
	});

	interp.registerCommand('llength', function(args){
		interp.checkArgs(args, 1, 'list');
		var list = args[1].GetList();
		return tclobj.NewInt(list.length);
	});

	interp.registerCommand('split', function(args){
		interp.checkArgs(args, 1, 'string ?splitChars?');
		var re = args[2] === undefined ?
			/\s/ :
			new RegExp('['+utils.escape_regex(args[2])+']');
		return new ListObj(args[1].toString().split(re));
	});

	interp.registerCommand('join', function(args){
		interp.checkArgs(args, 1, 'list ?joinString?');
		var list = args[1].GetList(),
			joinString = args[2] === undefined ? ' ':args[2].toString();
		return new ListObj(list.join(joinString));
	});

	interp.registerCommand('concat', function(args){
		var i, lists = [];
		for (i=1; i<args.length; i++) {
			lists.push(args[i].GetList());
		}
		// TODO: this is not quite right - concat trims whitespace from its
		// args before joining them with ' '
		return new ListObj(Array.prototype.concat.apply([], lists));
	});

	interp.registerCommand('lappend', function(args){
		interp.checkArgs(args, [1, null], 'varname ?value ...?');
		if (args.length === 2) {return interp.get_scalar(args[1]);}
		var listobj = interp.get_scalar(args[1], true), list, i;
		list = listobj.GetList();
		listobj.InvalidateCaches();
		for (i=2; i<args.length; i++) {
			list.push(args[i]);
		}
		return listobj;
	});

	interp.registerCommand('lreverse', function(args){
		interp.checkArgs(args, 1, 'list');
		return new ListObj(args[1].GetList().reverse());
	});

	interp.registerCommand('list', function(args){
		return new ListObj(args.slice(1));
	});

	interp.registerCommand('lindex', function(args){
		var i, obj, idx, list;
		interp.checkArgs(args, [1, null], 'list ?index ...?');

		obj = args[1];

		for (i=2; i<args.length; i++) {
			list = obj.GetList();
			idx = resolve_index(list, args[i]);
			obj = list[idx];
		}
		return obj;
	});

	interp.registerCommand('lrepeat', function(args){
		interp.checkArgs(args, [1, null], 'count ?element ...?');
		var count = args[1].GetInt(), elements = args.slice(2),
			out = [], i, total = count * elements.length;
		for (i=0; i<total; i++) {
			out.push(elements[i % elements.length]);
		}
		return new ListObj(out);
	});
}

return {'install': install};
});

