#!/usr/bin/env node

import * as parser			from '../es6/parser.js';
import * as parser_utils	from '../es6/parser_utils.js';

// Populate with built-in commands, to suppress output for those
var cmds_seen = {
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
}, stdin = process.openStdin(), source = '';

stdin.on('data', function(chunk){
	source += chunk;
});
stdin.on('end', function(){
	return parser_utils.deep_parse(parser.parse_script(source), {
		oncommand: function(cmd_text, command){
			if (cmd_text !== null && cmds_seen[cmd_text] === undefined) {
				cmds_seen[cmd_text] = parser.find_line_no(source, parser_utils.word_start(command[0]));
				console.log(cmd_text + ':' + cmds_seen[cmd_text]);
			}
		}
	});
});

// vim: ft=javascript
