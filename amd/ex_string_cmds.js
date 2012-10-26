/*jslint plusplus: true, white: true, nomen: true, regexp: true, bitwise: true */
/*global define, require */
define([
	'./utils',
	'./objtype_string',
	'./objtype_int',
	'./objtype_bool',
	'./list',
	'./types'
], function(
	utils,
	StringObj,
	IntObj,
	BoolObj,
	tcllist,
	types
){
'use strict';

var subcmds, TclError = types.TclError, class_tests;

function get_str_idx(str, obj) {
	return utils.resolve_idx(str.length, obj);
}

function changecase(method){
	return function(args, I){
		I.checkArgs(args, [1, 3], 'string ?first? ?last?');
		var str = args[1].toString(), parts,
			first = args[2] === undefined ? 0 : get_str_idx(str, args[2]),
			last = args[3] === undefined ? str.length-1 : get_str_idx(str, args[3]);
		if (first === 0 && last === str.length-1) {
			return new StringObj(str[method]());
		}
		parts = [];
		if (first > 0) {
			parts.push(str.substr(0, first));
		}
		parts.push(str.substr(first, last-first+1)[method]());
		if (last < str.length-1) {
			parts.push(str.substr(last+1));
		}
		return new StringObj(parts.join(''));
	};
}

function compare_strings(fn) {
	return function(args, I){
		I.checkArgs(args, [2, 5], '?-nocase? ?-length int? string1 string2');
		var ignorecase = false,
			str2 = args.pop().toString(),
			str1 = args.pop().toString(),
			maxchars;
		args.shift();
		while (args.length > 0) {
			switch (args[0].toString()) {
				case '-nocase': ignorecase = true; args.shift(); break;
				case '-length':
					args.shift();
					if (args.length === 0) {
						throw new TclError('wrong # args: should be "string compare ?-nocase? ?-length int? string1 string2', ['TCL', 'WRONGARGS']);
					}
					maxchars = args.shift().GetInt();
					break;
				default:
					throw new TclError('bad option "'+args[0].toString()+'": must be -nocase or -length', ['TCL', 'LOOKUP', 'INDEX', 'option', args[0].toString()]);
			}
		}

		if (maxchars !== undefined) {
			str1 = str1.substr(0, maxchars);
			str2 = str2.substr(0, maxchars);
		}
		if (ignorecase) {
			str1 = str1.toLowerCase();
			str2 = str2.toLowerCase();
		}
		return fn(str1, str2);
	};
}

function int_range_check(bits) {
	return function(s){
		var m, value;
		if (m = (
			/^[\+\-]?\d+e[\-+]?\d+?/i.exec(s) ||
			/^[\+\-]?0x[\dA-F]+/i.exec(s) ||
			/^[\+\-]?0b[01]+/i.exec(s) ||
			/^[\+\-]?0o[0-7]+/i.exec(s)
		)) {
			value = utils.to_int(s);
			if (Math.abs(value) >= Math.pow(2, bits)) {return null;}
			return m[0].length === s.length ? -1 : m[0].length;
		}
		return 0;
	};
}

// TODO: fix the tests below for unicode (javascript regexe ranges mostly don't
// match unicode, ie. \w is [0-9a-zA-Z_]
class_tests = {
	alnum: function(s){return (/[^a-z0-9]/i.exec(s)||{index:-1}).index;},
	alpha: function(s){return (/[^a-z]/i.exec(s)||{index:-1}).index;},
	ascii: function(s){return (/[^\x00-\x7f]/.exec(s)||{index:-1}).index;},
	'boolean': function(s){
		var m = /^(1|t(?:r(?:ue?)?)?|y(?:es?)?|on|0|f(?:a(?:l(?:se?)?)?)?|no?|off?)/i.exec(s);
		if (!m) {return 0;}
		if (m[0].length === s.length) {return -1;}
		return 0;
	},
	'false': function(s){
		var m = /^(0|f(?:a(?:l(?:se?)?)?)?|no?|off?)/i.exec(s);
		if (!m) {return 0;}
		if (m[0].length === s.length) {return -1;}
		return 0;
	},
	'true': function(s){
		var m = /^(1|t(?:r(?:ue?)?)?|y(?:es?)?|on)/i.exec(s);
		if (!m) {return 0;}
		if (m[0].length === s.length) {return -1;}
		return 0;
	},
	control: function(s){return (/[^\x00-\x1F]/.exec(s)||{index:-1}).index;},
	digit: function(s){return (/[^\d]/.exec(s)||{index:-1}).index;},
	'double': function(s){
		var m, value;
		if (m = /^(?:([\-+]?)(Inf(?:inity)?)|(NaN))\b/i.exec(s)) {
			if (/n/i.test(m[0][1])) {
				value = NaN;
			} else {
				value = Number(m[1]+'Infinity');
			}
			if (m[0].length !== s.length) {
				return m[0].length;
			}
			return -1;
		}
		if (m = (
			/^[\-+]?\d+(?:(\.)(?:\d+)?)?(e[\-+]?\d+)?/i.exec(s) ||
			/^[\-+]?(\.)\d+(e[\-+]?\d+)?/i.exec(s)
		)) {
			value = Number(m[0]);
		} else if (m = (
			/^[\+\-]?\d+e[\-+]?\d+?/i.exec(s) ||
			/^[\+\-]?0x[\dA-F]+/i.exec(s) ||
			/^[\+\-]?0b[01]+/i.exec(s) ||
			/^[\+\-]?0o[0-7]+/i.exec(s)
		)) {
			if (m[0].length !== s.length) {
				return m[0].length;
			}
			value = utils.to_int(s);
		} else {
			return 0;
		}
		if (value === -Infinity || value === Infinity) {
			// WARNING: this assumes javascript's range is the same as Tcl
			// tests indicate that it is, but as far as I know it isn't
			// written into the standard
			return null;
		}
		return -1;
	},
	graph: function(s){return (/[\x00-\x20\x7F-\x9F\xAD]/.exec(s)||{index:-1}).index;},
	integer: int_range_check(32),
	wideinteger: int_range_check(64),
	list: function(s){return tcllist.complete(s) ? -1 : 0;},
	lower: function(s){return (/[^a-z]/.exec(s)||{index:-1}).index;},
	upper: function(s){return (/[^A-Z]/.exec(s)||{index:-1}).index;},
	print: function(s){return (/[\x00-\x1F\x7F-\x9F\xAD]/.exec(s)||{index:-1}).index;},
	punct: function(s){return (/[^!"#%&'\(\)\*,\-.\/:;\?@\[\\\]_{}\xa1\xa7\xab\xb6\xb7\xbb\xbf]/.exec(s)||{index:-1}).index;},
	space: function(s){return (/[^\s]/.exec(s)||{index:-1}).index;},
	wordchar: function(s){return (/[^\w]/.exec(s)||{index:-1}).index;},
	xdigit: function(s){return (/[^0-9A-F]/i.exec(s)||{index:-1}).index;}
};

subcmds = {
	map: function(args, I){
		var ignorecase=false, mapping, str,
			cache, i, k, v, patterns;
		I.checkArgs(args, [2, 3], '?-nocase? mapping string');
		if (args.length === 4) {
			if (args[1].toString() !== '-nocase') {
				I.checkArgs(args, 2, '?-nocase? mapping string');
			}
			ignorecase = true;
			args.shift();
		}
		str = args[2].toString();
		if (args[1].cache.string_map === undefined) {
			cache = args[1].cache.string_map = {
				map: {},
				re: {}
			};
			mapping = args[1].GetList();
			patterns = [];
			i = 0;
			while (i<mapping.length) {
				if (ignorecase) {
					k = mapping[i++].toString().toLowerCase();
				} else {
					k = mapping[i++].toString();
				}
				v = mapping[i++].toString();
				patterns.push(utils.escape_regex(k));
				cache.map[k] = v;
			}
			cache.base_regex = patterns.join('|');
		} else {
			cache = args[1].cache.string_map;
		}
		if (cache.re === undefined || cache.re.ignoreCase !== ignorecase) {
			cache.re = new RegExp(cache.base_regex, 'g' + (ignorecase ? 'i':''));
		}
		if (ignorecase) {
			return new StringObj(str.replace(cache.re, function(match){
				return cache.map[match.toLowerCase()];
			}));
		}
		return new StringObj(str.replace(cache.re, function(match){
			return cache.map[match];
		}));
	},
	trim: function(args, I){
		var re, chars;
		I.checkArgs(args, [1, 2], 'string ?chars?');
		if (args[2] === undefined) {
			re = /^[ \t\n\r]*((?:.|\n)*?)[ \t\n\r]*$/;
		} else {
			if (args[2].cache.trim_re === undefined) {
				chars = '[' + utils.escape_regex(args[2].toString()) + ']*';
				re = args[2].cache.trim_re = new RegExp('^'+chars+'((?:.|\n)*?)'+chars+'$');
			} else {
				re = args[2].cache.trim_re;
			}
		}
		return re.exec(args[1].toString())[1];
	},
	trimleft: function(args, I){
		var re, chars;
		I.checkArgs(args, [1, 2], 'string ?chars?');
		if (args[2] === undefined) {
			re = /^[ \t\n\r]*((?:.|\n)*)$/;
		} else {
			if (args[2].cache.trim_re === undefined) {
				chars = '[' + utils.escape_regex(args[2].toString()) + ']*';
				re = args[2].cache.trim_re = new RegExp('^'+chars+'((?:.|\n)*)$');
			} else {
				re = args[2].cache.trim_re;
			}
		}
		return re.exec(args[1].toString())[1];
	},
	trimright: function(args, I){
		var re, chars;
		I.checkArgs(args, [1, 2], 'string ?chars?');
		if (args[2] === undefined) {
			re = /^((?:.|\n)*?)[ \t\n\r]*$/;
		} else {
			if (args[2].cache.trim_re === undefined) {
				chars = '[' + utils.escape_regex(args[2].toString()) + ']*';
				re = args[2].cache.trim_re = new RegExp('^((?:.|\n)*?)'+chars+'$');
			} else {
				re = args[2].cache.trim_re;
			}
		}
		return re.exec(args[1].toString())[1];
	},
	tolower: changecase('toLowerCase'),
	toupper: changecase('toUpperCase'),
	totitle: function(args, I){
		I.checkArgs(args, [1, 3], 'string ?first? ?last?');
		var str = args[1].toString(), parts,
			first = args[2] === undefined ? 0 : get_str_idx(str, args[2]),
			last = args[3] === undefined ? str.length-1 : get_str_idx(str, args[3]);
		parts = [];
		if (first > 0) {
			parts.push(str.substr(0, first));
		}
		parts.push(str[first].toUpperCase());
		parts.push(str.substr(first+1, last-first).toLowerCase());
		if (last < str.length-1) {
			parts.push(str.substr(last+1));
		}
		return new StringObj(parts.join(''));
	},
	length: function(args, I){
		I.checkArgs(args, 1, 'string');
		return new IntObj(args[1].toString().length);
	},
	bytelength: function(args, I){
		I.checkArgs(args, 1, 'string');
		return new IntObj(require('webtoolkit/utf8').encode(args[1].toString()).length);
	},
	first: function(args, I){
		I.checkArgs(args, [2, 3], 'needleString haystackString ?startIndex?');
		var needle = args[1].toString(), haystack = args[2].toString(),
			idx = args[3] === undefined ? 0 : get_str_idx(haystack, args[3]);
		return new IntObj(haystack.indexOf(needle, idx));
	},
	last: function(args, I){
		I.checkArgs(args, [2, 3], 'needleString haystackString ?startIndex?');
		var needle = args[1].toString(), haystack = args[2].toString(),
			idx = args[3] === undefined ? haystack.length : get_str_idx(haystack, args[3]);
		return new IntObj(haystack.lastIndexOf(needle, idx));
	},
	index: function(args, I){
		I.checkArgs(args, 2, 'string index');
		var str = args[1].toString(),
			index = get_str_idx(str, args[2]);
		return new StringObj(str.charAt(index) || '');
	},
	range: function(args, I){
		I.checkArgs(args, 3, 'string first last');
		var str = args[1].toString(),
			first = Math.max(0, get_str_idx(str, args[2])),
			last = get_str_idx(str, args[3]),
			res = str.substr(first, last-first+1);
		return new StringObj(res === undefined ? '' : res);
	},
	reverse: function(args, I){
		I.checkArgs(args, 1, 'string');
		return new StringObj(args[1].toString().split('').reverse().join(''));
	},
	repeat: function(args, I){
		I.checkArgs(args, 2, 'string count');
		var str = args[1].toString(), i=args[2].GetInt(), res='';
		if (i < 1) {return types.EmptyString;}
		while (i > 0) {
			if (i & 1) {
				res += str;
			}
			i >>= 1;
			str += str;
		}
		return new StringObj(res);
	},
	replace: function(args, I){
		I.checkArgs(args, [3, 4], 'string first last ?newstring?');
		var str = args[1].toString(),
			first = Math.max(0, get_str_idx(str, args[2])),
			last = Math.min(str.length, get_str_idx(str, args[3])),
			parts = [];
		if (first > last) {return types.EmptyString;}
		if (first > 0)				{ parts.push(str.substr(0, first)); }
		if (args[4] !== undefined)	{ parts.push(args[4].toString()); }
		if (last < str.length-1)	{ parts.push(str.substr(last+1)); }
		return new StringObj(parts.join(''));
	},
	match: function(args, I){
		I.checkArgs(args, [2, 3], '?-nocase? pattern string');
		var str, pattern, ignorecase = false;
		if (args.length === 4) {
			if (args[1].toString() !== '-nocase') {
				I.checkArgs(args, 2, '?-nocase? pattern string');
			}
			args.shift();
			ignorecase = true;
		}
		pattern = utils.glob2regex(args[1].toString(), ignorecase);
		str = args[2].toString();
		return new BoolObj(pattern.test(str));
	},
	wordstart: function(args, I){
		I.checkArgs(args, 2, 'string charIndex');
		var m, str = args[1].toString(),
			idx = get_str_idx(str, args[2]);
		if (idx < 0) {return new IntObj(0);}
		// TODO: make unicode aware (\w is [0-9a-zA-Z_]), maybe XRegExp?
		if (m = /\w+$/.exec(str.substr(0, idx+1))) {
			return new IntObj(m.index);
		}
		return new IntObj(idx);
	},
	wordend: function(args, I){
		I.checkArgs(args, 2, 'string charIndex');
		var m, str = args[1].toString(),
			idx = get_str_idx(str, args[2]);
		if (idx >= str.length) {return new IntObj(str.length);}
		// TODO: make unicode aware (\w is [0-9a-zA-Z_]), maybe XRegExp?
		if (m = /^\w+/.exec(str.substr(idx))) {
			return new IntObj(idx+m[0].length);
		}
		return new IntObj(idx+1);
	},
	compare: compare_strings(function(str1, str2) {
		var res = str1.localeCompare(str2);
		if (res < -1) {res = -1;}
		if (res > 1) {res = 1;}
		return new IntObj(res);
	}),
	equal: compare_strings(function(str1, str2) {
		return new BoolObj(str1 === str2);
	}),
	is: function(args, I) {
		I.checkArgs(args, [2, 5], 'class ?-strict? ?-failindex varname? string');
		args.shift();
		var charclass = args.shift().toString(),
			str = args.pop().toString(),
			strict = false, failindexvar, failindex, arg;
		while (args.length > 0) {
			arg = args.shift().toString();
			switch (arg) {
				case '-strict': strict = true; break;
				case '-failindex':
					if (args.length < 1) {
						throw new TclError('wrong # args: should be "string is class ?-strict? ?-failindex varname? string', ['TCL', 'WRONGARGS']);
					}
					failindexvar = args.shift();
					break;
			}
		}
		if (class_tests[charclass] === undefined) {
			throw new TclError('bad class "'+charclass+'": must be '+utils.objkeys(class_tests).join(', '), ['TCL', 'LOOKUP', 'INDEX', 'class', charclass]);
		}
		if (str.length === 0) {
			return new BoolObj(!strict);
		}

		failindex = class_tests[charclass](str);
		if (failindex === null || failindex >= 0) {
			if (failindex === null) {failindex = -1;}
			if (failindexvar !== undefined) {
				I.set_var(failindexvar, new IntObj(failindex));
			}
			return new BoolObj(false);
		}
		return new BoolObj(true);
	}
};

function install(interp) {
	if (interp.register_extension('ex_string_cmds')) {return;}

	interp.registerCommand('string', function(args){
		var subcmd, cmd;
		if (args.length < 2) {
			interp.checkArgs(args, 1, 'subcmd args');
		}

		cmd = args.shift(); subcmd = args[0];
		args[0] = cmd+' '+subcmd;
		if (subcmds[subcmd] === undefined) {
			throw new TclError('unknown or ambiguous subcommand "'+subcmd+'": must be '+utils.objkeys(subcmds).join(', '),
				['TCL', 'LOOKUP', 'SUBCOMMAND', subcmd]);
		}
		return subcmds[subcmd](args, interp);
	});
}

return {'install': install};
});
