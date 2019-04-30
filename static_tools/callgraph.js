#!/usr/bin/env node

var requirejs = require('requirejs'),
	path = require('path');

// array.includes polyfiller from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/includes <<<<
if (!Array.prototype.includes) {
	Array.prototype.includes = function(searchElement /*, fromIndex*/ ) {
		'use strict';
		var O = Object(this);
		var len = parseInt(O.length) || 0;
		if (len === 0) {
			return false;
		}
		var n = parseInt(arguments[1]) || 0;
		var k;
		if (n >= 0) {
			k = n;
		} else {
			k = len + n;
			if (k < 0) {k = 0;}
		}
		var currentElement;
		while (k < len) {
			currentElement = O[k];
			if (searchElement === currentElement ||
					(searchElement !== searchElement && currentElement !== currentElement)) { // NaN !== NaN
						return true;
					}
			k++;
		}
		return false;
	};
}
//>>>>

requirejs.config({
	baseUrl: __dirname+'/..',
	paths: {
		tcl:		'amd'
	},
	nodeRequire: require
});

requirejs([
	'tcl/parser',
	'tcl/parser_utils',
	'tcl/list'
], function(
	parser,
	parser_utils,
	tcllist
){
'use strict';

var calledby = {},
	cx = '', cx_stack = [];

// Populate with built-in commands, to suppress output for those
var ignore_cmds = {
	'tell': 0, 'socket': 0, 'subst': 0, 'open': 0, 'eof': 0, 'pwd': 0,
	'glob': 0, 'list': 0, 'pid': 0, 'exec': 0, 'auto_load_index': 0,
	'time': 0, 'unknown': 0, 'eval': 0, 'lassign': 0, 'lrange': 0,
	'fblocked': 0, 'lsearch': 0, 'auto_import': 0, 'gets': 0, 'case': 0,
	'lappend': 0, 'proc': 0, 'break': 0, 'variable': 0, 'llength': 0,
	'auto_execok': 0, 'return': 0, 'linsert': 0, 'error': 0, 'catch': 0,
	'clock': 0, 'info': 0, 'split': 0, 'array': 0, 'if': 0, 'fconfigure': 0,
	'concat': 0, 'join': 0, 'lreplace': 0, 'source': 0, 'fcopy': 0, 'global': 0,
	'switch': 0, 'auto_qualify': 0, 'update': 0, 'close': 0, 'cd': 0, 'for': 0,
	'auto_load': 0, 'file': 0, 'append': 0, 'lreverse': 0, 'format': 0,
	'unload': 0, 'read': 0, 'package': 0, 'set': 0, 'binary': 0, 'namespace': 0,
	'scan': 0, 'apply': 0, 'trace': 0, 'seek': 0, 'while': 0, 'chan': 0,
	'flush': 0, 'after': 0, 'vwait': 0, 'dict': 0, 'continue': 0, 'uplevel': 0,
	'foreach': 0, 'lset': 0, 'rename': 0, 'fileevent': 0, 'regexp': 0,
	'lrepeat': 0, 'upvar': 0, 'encoding': 0, 'expr': 0, 'unset': 0, 'load': 0,
	'regsub': 0, 'history': 0, 'interp': 0, 'exit': 0, 'puts': 0, 'incr': 0,
	'lindex': 0, 'lsort': 0, 'tclLog': 0, 'string': 0
};

parser_utils.for_each_file(process.argv.slice(2), function(fn, err, source){
	var m, flags = {
		ignore: false
	};
	console.warn('Examining "'+fn+'"');
	if (err) {
		console.err(err);
		return;
	}
	if ((m = /#static:(.*?)\n/.exec(source))) {
		parser_utils.process_flags(m[1], flags);
	}
	if (flags.ignore) {
		console.warn('Ignoring file "'+fn+'"');
		return;
	}
	try {
		parser_utils.deep_parse(parser.parse_script(source), {
			descend: function(command, wordnum, type) {
				if (type === parser.SCRIPTARG && parser_utils.get_text(command[0]) === 'proc') {
					cx_stack.push(cx);
					cx = parser_utils.get_text(command[1]);
				}
			},

			ascend: function(command, wordnum, type) {
				if (type === parser.SCRIPTARG && parser_utils.get_text(command[0]) === 'proc') {
					cx = cx_stack.pop();
				}
			},

			oncommand: function(cmd_text, command) {
				if (
					ignore_cmds.hasOwnProperty(cmd_text)
				) {
					return;
				}
				var range = parser_utils.command_range(command),
					f_line = parser.find_line_no(source, range[0]),
					f_charnum = parser.find_line_ofs(source, range[0]),
					t_line = parser.find_line_no(source, range[1]),
					t_charnum = parser.find_line_ofs(source, range[1]);

				if (cmd_text == null) {
					// Whitespace only command
					return;
				}

				if (calledby[cmd_text] === undefined) {
					calledby[cmd_text] = {}
				};
				if (calledby[cmd_text][cx] === undefined) {
					calledby[cmd_text][cx] = []
				};
				calledby[cmd_text][cx].push([path.resolve(fn), f_line, f_charnum, t_line, t_charnum]);
			}
		});
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error('Parse error in "'+fn+'":\n'+e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Parse error in "'+fn+'": '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
}, function(){
	console.log(tcllist.to_tcl(calledby));
});
});
