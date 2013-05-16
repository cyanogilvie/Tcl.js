#!/usr/bin/env node

var requirejs = require('requirejs');
requirejs.config({
	baseUrl: __dirname+'/..',
	paths: {
		tcl:		'amd'
	},
	nodeRequire: require
});

requirejs([
	'tcl/parser',
	'tcl/parser_utils'
], function(
	parser,
	parser_utils
){
'use strict';

function shift_ofs(command, ofsdelta) {
	var i, j, word, token;
	for (i=0; i<command.length; i++) {
		word = command[i];
		for (j=0; j<word.length; j++) {
			token = word[j];
			token[3] += ofsdelta;
		}
	}
}

function indent_token(command) {
	var i, token, toknum;
	for (i=0; i<command[0].length; i++) {
		token = command[0][i];
		if (token[0] === parser.SPACE || token[0] === parser.COMMENT) {
			continue;
		}
		toknum = i;
	}
	if (toknum === 0 || command[0][toknum-1][0] !== parser.SPACE) {
		// Insert a SPACE token to take the indent
		command[0].splice(toknum, 0, [parser.SPACE, '', null, command[0][toknum][3]]);
		return command[0][toknum];
	} else {
		return command[0][toknum-1];
	}
}

function close_brace_indent_token(word) {
	var i, token;
	for (i=word.length-1; i>=0; i--) {
		token = word[i];
		if (token[0] === parser.SYNTAX && token[1] === '}') {
			token = word[--i];
			if (token[0] === parser.SPACE) {
				return token;
			} else {
				token = [parser.SPACE, '', null, token[i+1][3]];
				word.splice(i+1, 0, token);
				return token;
			}
		}
	}
}

function make_indent(indenttok, depth) {
	return indenttok[1].replace(/(\n)?[ \t]*$/, '$1') +
		Array(depth+1).join('\t');
}

function endtoken(command) {
	var word = command[command.length-1], i=word.length, token;

	while (--i >= 0) {
		token = word[i];
		if (token[0] === parser.END) {
			return token;
		}
	}
	return null;
}

function command_starts_line(command) {
	return true;
}

function indent_block(tokens) {
	return /^[ \t]*(\n|#)/.test(parser_utils.get_text(tokens));
}

parser_utils.for_each_file(process.argv.slice(2), function(fn, err, source){
	var m, depth=[], ofsdelta=0, reflowed, indented_stack=[], indenting=true,
		newline=false, flags={
			ignore: false
		};
	//console.warn('Examining "'+fn+'"');
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
		reflowed = parser_utils.deep_parse(parser.parse_script(source), {
			descend: function(command, wordnum, type) {
				depth.push(command);
				indented_stack.push(indenting = indent_block(command[wordnum]));
			},
			ascend: function(command, wordnum, type) {
				var indenttok = close_brace_indent_token(command[wordnum]),
					old_indent;
				indenting = indented_stack.pop();
				depth.pop(command);
				if (indenting && indenttok) {
					old_indent = parser_utils.toklength(indenttok);
					indenttok[1] = make_indent(indenttok, depth.length);
					ofsdelta += parser_utils.toklength(indenttok) - old_indent;
				}
			},
			oncommand: function(cmd_text, command) {
				var ofs = parser_utils.word_start(command[0]),
					indenttok = indent_token(command),
					old_indent = parser_utils.toklength(indenttok);
				// TODO: indent comments
				if (newline && indenting) {
					indenttok[1] =
						make_indent(indenttok, depth.length);
					ofsdelta += parser_utils.toklength(indenttok) - old_indent;
					shift_ofs(command, ofsdelta);
					//console.log(new Array(depth.length+1).join('\t') + cmd_text);
				}
				newline = endtoken(command)[1] === '\n';
			}
		});
		console.log(parser_utils.reconstitute(reflowed[1]));
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error('Parse error in "'+fn+'":\n'+e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Parse error in "'+fn+'": '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
});
});
