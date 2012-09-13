/*jslint plusplus: true, white: true, nomen: true, regexp: true */
/*global define */

define([
	'./tclobject',
	'./objtype_list',

	'./objtype_int'
], function(
	tclobj,
	ListObj
){
'use strict';

function install(interp) {
	var TclError = interp.TclError;
	if (interp.register_extension('ex_list_cmds')) {return;}

	/* list commands still to implement:
	 lsearch linsert lreplace lset lsort
	 */

	function escape_regex(str) {
		return String(str).replace(/([\[\].*?+\^$\\(){}|\-])/g, '\\$1');
	}

	function to_int(str) {
		var m;
		if (m = (
			/^([\+\-])?(0)(\d+)$/i.exec(str) ||
			/^([\+\-])?()(\d+)e([\-+]?\d+)?$/i.exec(str) ||
			/^([\+\-])?(0x)([\dA-F]+)$/i.exec(str) ||
			/^([\+\-])?(0b)([01]+)$/i.exec(str) ||
			/^([\+\-])?(0o)([0-7]+)$/i.exec(str)
		)) {
			// TODO: Bignum support
			if (m[4] === undefined) {
				return parseInt((m[1] || '')+m[3],
					{'': 10, '0x': 16, '0b': 2, '0': 8, '0o': 8}[m[2]]
				);
			}
			return parseInt((m[1] || '')+m[3],
				{'': 10, '0x': 16, '0b': 2, '0': 8, '0o': 8}[m[2]]
			) * Math.pow(10, m[4]);
		}
	}

	function resolve_index(obj, len) {
		var idx, a, op, b, matches;

		if (obj.handlers.type === 'int') {
			return obj.GetInt();
		}

		idx = obj.GetString();
		if (matches = /^(.*?)[+\-](.*)$/.exec(idx)) {
			a = matches[1] === 'end' ? len : to_int(matches[1]);
			op = matches[2];
			b = matches[3] === to_int(matches[3]);
			switch (op) {
				case '+': return a + b;
				case '-': return a - b;
				default: throw new TclError('bad index "'+idx+'": must be integer?[+-]integer? or end?[+-]integer?', 'TCL', 'VALUE', 'INDEX');
			}
		}

		return obj.GetInt();
	}

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
			a = resolve_index(args[2], list.length),
			b = resolve_index(args[3], list.length);
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
			new RegExp('['+escape_regex(args[2])+']');
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
		return new ListObj(Array.prototype.concat.apply([], lists));
	});

	interp.registerCommand('lappend', function(args){
		interp.checkArgs(args, [1, null], 'varname ?value ...?');
		if (args.length === 2) {return interp.get_scalar(args[1]);}
		var listobj = interp.get_scalar(args[1], true), list, i;
		list = listobj.GetList();
		listobj.bytes = null;
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
		interp.checkArgs(args, 1, 'list ?index ...?');

		obj = args[1];

		for (i=2; i<args.length; i++) {
			list = obj.GetList();
			idx = resolve_index(args[i], list.length);
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

