#!/usr/bin/env node

var requirejs = require('requirejs');
requirejs.config({
	baseUrl: '/home/cyan/git/Tcl.js',
	paths: {
		tcl:		'amd'
	},
	nodeRequire: require
});

requirejs([
	'tcl/parser',
	'tcl/list'
], function(
	parser,
	tcllist
){
'use strict';

var EXPRARG = parser.EXPRARG,
	SCRIPTARG = parser.SCRIPTARG,
	SUBSTARG = parser.SUBSTARG,
	marked_up_parent,
	cmd_parse_info = {
	'if': function(words){
		var special = [
			1, EXPRARG
		], wordtext, p;

		for (p=2; p<words.length; p++) {
			wordtext = get_text(words[p]);
			switch (wordtext) {
				case 'then':
				case 'else':
					break;
				case 'elseif':
					special.push(++p, EXPRARG);
					break;
				default:
					if (wordtext != null) {
						special.push(p, SCRIPTARG);
					}
			}
		}

		return special;
	},

	'expr':		function(words){
		return words.length === 1 ? [1, EXPRARG] : [];
	},
	'foreach':	function(words){
		return [last_real_word_number(words), SCRIPTARG];
	},
	'lmap':		function(words){ return [last_real_word_number(words), SCRIPTARG]; },
	'for':		[1, SCRIPTARG, 2, EXPRARG, 3, SCRIPTARG, 4, SCRIPTARG],
	'while':	[1, EXPRARG, 2, SCRIPTARG],
	'proc':		[3, SCRIPTARG],
	'catch':	[1, SCRIPTARG],
	'subst':	function(words){ return [last_real_word_number(words), SUBSTARG]; },
	'time':		[1, SCRIPTARG]
};

function real_word(word) {
	var i, type;
	for (i=0; i<word.length; i++) {
		type = word[i][0];
		if (
			type === parser.SPACE ||
			type === parser.COMMENT ||
			type === parser.END
		) {
			continue;
		}
		return true;
	}
	return false;
}

function last_real_word_number(words) {
	var i, found;
	for (i=0; i<words.length; i++) {
		if (real_word(words[i])) {
			found = i;
		}
	}
	return found;
}

function get_text(word, raw) {
	var i, text=[];
	for (i=0; i<word.length; i++) {
		switch (word[i][0]) {
			case parser.TEXT:		text.push(word[i][1]); break;
			case parser.ESCAPE:		text.push(word[i][raw?1:2]); break;
			case parser.SPACE:		break;
			case parser.END:		break;
			case parser.SYNTAX:		break;
			case parser.COMMENT:	break;
			default:				return null;
		}
	}
	return text.length ? text.join('') : null;
}

function word_start(word) {
	var i;
	for (i=0; i<word.length; i++) {
		if (word[i][0] === parser.TEXT || word[i][0] === parser.ESCAPE) {
			return word[i][3];
		}
	}
}

function replace_static(tokens, token) {
	var i=0, replaced=false, out=[];

	for (i=0; i<tokens.length; i++) {
		if (tokens[i][0] === parser.TEXT || tokens[i][0] === parser.ESCAPE) {
			if (!replaced) {
				out.push(token);
				replaced = true;
			}
		} else {
			out.push(tokens[i]);
		}
	}
	if (!replaced) {
		throw new Error('Couldn\'t find static tokens to replace');
	}
	return out;
}

function deep_parse_tokens(tokens) {
	var i, token;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (token[0] == parser.SCRIPT) {
			token[1] = deep_parse(token)[1];
		} else if (token[0] === parser.INDEX) {
			deep_parse_tokens(token[1]);
		}
	}
}

function deep_parse_expr_tokens(tokens) {
	var i, token, tmp;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (token[0] === parser.OPERAND && token[1] === parser.SCRIPT) {
			tmp = deep_parse(token[2]);
		}
	}
	return tokens;
}

function toklength(token) {
	var i, j, k, command, word, token, acc = 0;
	switch (token[0]) {
		case parser.SCRIPT:
			for (i=0; i<token[1].length; i++) {
				command = token[1][i];
				for (j=0; j<command.length; j++) {
					word = command[j];
					for (k=0; k<word.length; k++) {
						token = word[k];
						acc += toklength(token);
					}
				}
			}
			return acc;

		default:
			return token[1].length;
	}
}

function command_range(command) {
	var from = word_start(command[0]), to, i, j, word, token, type;
	for (i=0; i<command.length; i++) {
		word = command[i];
		if (!real_word(word)) {continue;}
		for (j=0; j<word.length; j++) {
			token = word[j];
			type = token[0];
			if (
				type === parser.SPACE ||
				type === parser.COMMENT ||
				type === parser.END
			) {
				continue;
			}
			to = token[3] + toklength(token);
		}
	}
	return [from, to-1];
}

function show_command(range) {
	return source.substr(range[0], range[1]-range[0]+1);
}

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
var cmds_seen = {
};
function deep_parse(script_tok) {
	var commands=script_tok[1], command, i, j, k, parse_info, special, txt, ofs,
		cmd_text;

	for (i=0; i<commands.length; i++) {
		command = commands[i];

		// Scan for SCRIPT tokens to recurse into
		for (j=0; j<command.length; j++) {
			deep_parse_tokens(command[j]);
		}

		cmd_text = get_text(command[0]);
		if (cmd_text !== null && ignore_cmds[cmd_text] === undefined) {
			if (cmds_seen[cmd_text] === undefined) {
				cmds_seen[cmd_text] = [];
			}
			var ofs = word_start(command[0]);
			var found = [line_no(ofs), line_ofs(ofs), ofs];
			cmds_seen[cmd_text].push = found;
			console.log(cmd_text + ':' + found.join('.'));
		}
		parse_info = cmd_parse_info[cmd_text];
		if (parse_info === undefined) {continue;}
		special = typeof parse_info === 'function' ?
			parse_info(command) : parse_info;
		for (j=0; j<special.length; j+=2) {
			k = special[j];
			txt = get_text(command[k], true);
			if (txt == null) {
				// word text is dynamic - comes from a variable or
				// result of a command, so we can't statically parse it
				continue;
			}
			switch (special[j+1]) {
				case SCRIPTARG:
					ofs = word_start(command[k]);
					command[k] = replace_static(command[k], [
						SCRIPTARG,
						command[k].slice(),
						deep_parse(parser.parse_script(txt, ofs)),
						ofs
					]);
					break;

				case EXPRARG:
					ofs = word_start(command[k]);
					command[k] = replace_static(command[k], [
						EXPRARG,
						command[k].slice(),
						deep_parse_expr_tokens(parser.parse_expr(txt, ofs)),
						ofs
					]);
					break;

				case SUBSTARG:
					ofs = word_start(command[k]);
					command[k] = replace_static(command[k], [
						SUBSTARG,
						command[k].slice(),
						parser.parse_subst(txt, ofs),
						ofs
					]);
					deep_parse_tokens(command[k][2][2]);
					break;
			}
		}
	}
	return script_tok;
}

function visualize_whitespace(str) {
	return str.replace(
		/\n/g, '\u23ce'
	).replace(
		/\t/g, '\u21e5'
	);
}

function parse_script(script_str) {
	var parsed, deep = true, preamble, preamble_len;

	try {
		return deep_parse(parser.parse_script(script_str));
	} catch(e){
		if (e instanceof parser.ParseError) {
			console.error(e.message);
			process.exit(1);
		}
	}
}

function line_no(ofs) {
	var line = source.substr(0, ofs).replace(/[^\n]+/g, '').length;
	return line+1;
}

function line_ofs(ofs) {
	return ofs - source.lastIndexOf('\n', ofs);
}

var stdin = process.openStdin(),
	source = '';
stdin.on('data', function(chunk){
	source += chunk;
});
stdin.on('end', function(){
	parse_script(source);
});
});
