/*jslint white: true, regexp: true */
/*global define */
define([
	'./types',
	'./tclobject'
], function(
	types,
	tclobj
){
'use strict';
var TclError = types.TclError, utils = {
	glob2regex: function(glob, ignorecase) {
		var re = String(glob).replace(/([.+\^$\\(){}|\-])/g, '\\$1');
		re = re.replace(/\*/g, '.*');
		re = re.replace(/\?/g, '.');
		return new RegExp('^'+re+'$', ignorecase ? 'i' : '');
	},

	escape_regex: function(str) {
		return String(str).replace(/([\[\]\.\*\?\+\^$\\(){}|\-])/g, '\\$1');
	},

	objkeys: Object.prototype.keys ? function(o){return o.keys();} : function(o){
		var e, res = [];
		for (e in o) {
			if (o.hasOwnProperty(e)) {
				res.push(e);
			}
		}
		return res;
	},

	to_number: function(value) {
		if (typeof value === "number") {return value;}
		var str = String(value), m;
		if (m = /^(?:([\-+]?)(Inf(?:inity)?)|(NaN))\b/i.exec(str)) {
			if (/n/i.test(m[0][1])) {
				return NaN;
			}
			return Number(m[1]+'Infinity');
		}
		if (m = (
			/^[\-+]?\d+(?:(\.)(?:\d+)?)?(e[\-+]?\d+)?/i.exec(str) ||
			/^[\-+]?(\.)\d+(e[\-+]?\d+)?/i.exec(str)
		)) {
			return Number(m[0]);
		}
		if (m = (
			/^([\-+])?(0x)([\dA-F]+)/i.exec(str) ||
			/^([\-+])?(0b)([01]+)/i.exec(str) ||
			/^([\-+])?(0o)([0-7]+)/i.exec(str)
		)) {
			// TODO: Bignum support
			return parseInt((m[1] || '')+m[3],
				{'': 10, '0x': 16, '0b': 2, '0o': 8}[m[2]]
			);
		}
		return NaN;
	},

	to_int: function(value) {
		var m, str;
		if (typeof value === "number") {
			if (value % 1 !== 0) {
				throw new types.TclError('expected integer but got "'+str+'"',
					['TCL', 'VALUE', 'NUMBER']);
			}
			return value;
		}
		str = String(value);
		if (m = (
			/^([\+\-])?(0)(\d+)$/i.exec(str) ||
			/^([\+\-])?()(\d+)(?:e([\-+]?\d+))?$/i.exec(str) ||
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

		throw new types.TclError('expected integer but got "'+str+'"',
			['TCL', 'VALUE', 'NUMBER']);
	},

	resolve_idx: function(len, obj) {
		var idx, a, op, b, matches;
		obj = tclobj.AsObj(obj);

		function err(){
			throw new TclError('bad index "'+obj+'": must be integer?[+-]integer? or end?[+-]integer?', ['TCL', 'VALUE', 'INDEX']);
		}

		try {
			return obj.GetInt();
		} catch(ignore){}

		idx = obj.GetString();
		if (idx === 'end') {
			return len-1;
		}
		if (matches = /^(.*?)([+\-])(.*)$/.exec(idx)) {
			a = matches[1] === 'end' ? len-1 : utils.to_int(matches[1]);
			op = matches[2];
			b = utils.to_int(matches[3]);
			switch (op) {
				case '+': return a + b;
				case '-': return a - b;
				default: err();
			}
		}
		err();
	},

	not_implemented: function(){
		throw new types.TclError('Not implemented yet', ['TCL', 'NOT_IMPLEMENTED']);
	}
};
return utils;
});
