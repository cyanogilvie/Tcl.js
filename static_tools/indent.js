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

function open_brace_indent_token(word) {
	var i, token;
	for (i=0; i<word.length; i++) {
		token = word[i];
		if (token[0] === parser.SYNTAX && token[1] === '{') {
			if (word[i+1][0] !== parser.SPACE) {
				word.splice(i+1, 0, [parser.SPACE, '', null, word[i+1][3]]);
			}
			return word[i+1];
		}
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
				token = [parser.SPACE, '', null, token[i][3]];
				word.splice(i+1, 0, token);
				return token;
			}
		}
	}
}

function comment_indent_token(word, toknum) {
	var i, token;
	if (i > 0) {
		token = word[i-1];
		if (token[0] === parser.SPACE) {
			return token;
		}
	}
	word.splice(toknum, 0, [parser.SPACE, '', null, word[toknum][3]]);
	return word[toknum];
}

function make_indent(depth) {
	return new Array(depth+1).join('\t');
	//return new Array(depth+1).join('    ');
}

function link_word_tokens(tokens, prevtoken) {
	var i, token, firsttoken;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (firsttoken === undefined) {
			firsttoken = token;
		}
		if (token[0] === parser.SCRIPT) {
			prevtoken = link_command_tokens(token[1], prevtoken)[1];
		} else if (token[0] === parser.INDEX) {
			prevtoken = link_word_tokens(token[1], prevtoken)[1];
		}
	}
	return [firsttoken, prevtoken];
}

function link_expr_tokens(tokens, prevtoken) {
	var i, token, firsttoken;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (firsttoken === undefined) {
			firsttoken = token;
		}
		if (prevtoken) {
			prevtoken.next = token;
			token.prev = prevtoken;
		}
		prevtoken = token;
		if (token[0] === parser.OPERAND && token[1] === parser.SCRIPT) {
			prevtoken = link_command_tokens(token[2][1], prevtoken)[1];
		} else if (token[0] === parser.VAR && typeof token[2][1] !== 'string') {
			prevtoken = link_word_tokens(token[2][1], prevtoken)[1];
		} else if (token[0] === parser.QUOTED) {
			prevtoken = link_word_tokens(token[2], prevtoken)[1];
		}
	}
	return [firsttoken, prevtoken];
}

function link_command_tokens(commands, prevtoken) {
	var i, j, k, command, word, token, firsttoken;

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		for (j=0; j<command.length; j++) {
			word = command[j];
			for (k=0; k<word.length; k++) {
				token = word[k];
				token.command = command;
				token.word = word;
				if (firsttoken === undefined) {
					firsttoken = token;
				}
				if (prevtoken) {
					prevtoken.next = token;
					token.prev = prevtoken;
				}
				prevtoken = token;
				switch (token[0]) {
					case parser.SCRIPT:
						prevtoken = link_command_tokens(token[1], prevtoken)[1];
						break;
					case parser.SCRIPTARG:
						prevtoken = link_command_tokens(token[2][1], prevtoken)[1];
						break;
					case parser.EXPRARG:
						prevtoken = link_expr_tokens(token[2], prevtoken)[1];
						break;
					case parser.SUBSTARG:
						prevtoken = link_word_tokens(token[2], prevtoken)[1];
						break;
					case parser.INDEX:
						prevtoken = link_word_tokens(token[1], prevtoken)[1];
						break;
					case parser.SWITCHARG:
						// TODO
						break;
				}
			}
		}
	}
	return [firsttoken, prevtoken];
}

function prev_n_tokens(t, n) {
	var out = [];
	while (n-- && t) {
		switch (t[0]) {
			case parser.SCRIPTARG:
			case parser.EXPRARG:
			case parser.SWITCHARG:
			case parser.SUBSTARG:
				n++;
				break;
			default:
				out.push(t);
		}
		t = t.prev;
	}
	return out.reverse();
}

function next_n_tokens(t, n) {
	var out = [];
	while (n-- && t) {
		switch (t[0]) {
			case parser.SCRIPTARG:
			case parser.EXPRARG:
			case parser.SWITCHARG:
			case parser.SUBSTARG:
				n++;
				break;
			default:
				out.push(t);
		}
		t = t.next;
	}
	return out;
}

function print_tok(t) {
	var str = '';
	str += parser_utils.tokname(t[0]);
	switch (t[0]) {
		case parser.SCRIPTARG:
		case parser.EXPRARG:
		case parser.SUBSTARG:
		case parser.SWITCHARG:
			str += ' <...>';
			break;
		case parser.OPERAND:
			str += ' '+parser_utils.tokname(t[1])+'\t"'+t[2]+'"';
			break;
		default:
			if (typeof t[1] === 'string') {
				str += '\t"'+parser_utils.visualize_space(t[1])+'"';
			} else {
				str += '\tnot_a_string('+JSON.stringify(t)+')';
			}
	}
	return str;
}

function is_whitespace_token(t) {
	return (/^\s*$/.test(tokchars(t)));
}

function replace_whitespace_at(t, str) {
	var ot = t;
	while (t && is_whitespace_token(t.prev)) {
		t = t.prev;
	}
	while (t && is_whitespace_token(t)) {
		t[1] = '';
		t = t.next;
	}
	//console.warn('replacing with str: "'+parser_utils.visualize_space(str)+'"');
	ot[1] = str;
}

function whitespace_at(t) {
	var str = '';
	while (t && is_whitespace_token(t.prev)) {
		t = t.prev;
	}
	while (t && is_whitespace_token(t)) {
		str += tokchars(t);
		t = t.next;
	}
	return str;
}

var skip = {};
skip[parser.SPACE] = true;
skip[parser.SCRIPTARG] = true;
skip[parser.EXPRARG] = true;
skip[parser.SUBSTARG] = true;
skip[parser.SWITCHARG] = true;
function next_non_whitespace(t) {
	while (t && skip.hasOwnProperty(t[0])) {
		t = t.next;
	}
	return t;
}

function prev_non_whitespace(t) {
	while (t && skip.hasOwnProperty(t[0])) {
		t = t.prev;
	}
	return t;
}

function should_indent(t) {
	var following;
	return (
			t.ascend !== undefined ||
			/\n/.test(whitespace_at(t)) ||
			(t.prev && t.prev[0] === parser.COMMENT) ||
			(
				(following = next_non_whitespace(t)) &&
				following[0] === parser.COMMENT
			)
	);
}

function process_parse(commands, params) {
	var i, j, k, command, word, token, cmd_text;

	if (params === undefined) {
		params = {};
	}
	if (params.oncommand === undefined) { params.oncommand = function(){}; }
	if (params.descend === undefined) { params.descend = function(){}; }
	if (params.ascend === undefined) { params.ascend = function(){}; }

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		cmd_text = parser_utils.get_text(command[0]);
		params.oncommand(cmd_text, command);
		for (j=0; j<command.length; j++) {
			word = command[j];
			for (k=0; k<word.length; k++) {
				token = word[k];
				switch (token[0]) {
					case parser.SCRIPTARG:
						params.descend(command, k, parser.SCRIPTARG);
						process_parse(token[2], params);
						params.ascend(command, k, parser.SCRIPTARG);
						break;
					case parser.EXPRARG:
						params.descend(command, k, parser.EXPRARG);
						process_parse(token[2], params);
						params.ascend(command, k, parser.EXPRARG);
						break;
					case parser.SWITCHARG:
						params.descend(command, k, parser.SWITCHARG);
						// TODO
						params.ascend(command, k, parser.SWITCHARG);
						break;
				}
			}
		}
	}
}

function tfmt(tokens) {
	var i, a = [];
	for (i=0; i<tokens.length; i++) {
		a.push(JSON.stringify(tokens[i]));
	}
	return '\n\t'+a.join('\n\t');
}

function tokchars(t) {
	if (t === undefined) {
		return '';
	}
	switch (t[0]) {
		case parser.SCRIPTARG:
		case parser.EXPRARG:
		case parser.SUBSTARG:
		case parser.SWITCHARG:
			return '';
		case parser.OPERATOR:
		case parser.OPERAND:
			if (t[1] === parser.SCRIPT) {
				return '';
			}
			return t[3];
		case parser.SYNTAX:
		case parser.SPACE:
			return typeof t[3] === 'string' ? t[3] : t[1];
		default:
			return t[1];
	}
}

function block_leader_comment(t) {
	var left = prev_non_whitespace(t), right = next_non_whitespace(t);
	return (
		!(/\n/.test(whitespace_at(t))) &&
		left && right &&
		left[0] === parser.SYNTAX &&
		left[1] === '{' &&
		right[0] === parser.COMMENT
	);
}

parser_utils.for_each_file(process.argv.slice(2), function(fn, err, source){
	var m, depth=[], indented_stack=[], indenting=true, parsed, flags={
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
		parsed = parser_utils.deep_parse(parser.parse_script(source), {
			descend: function(command, wordnum, type) {
				switch (type) {
					case parser.SCRIPTARG:
					case parser.EXPRARG:
					case parser.SWITCHARG:
						break;
					default:
						return;
				}
				depth.push(command);
				var indenttok = open_brace_indent_token(command[wordnum]);
				if (indenttok) {
					indenttok.descend = depth.length;
					//console.warn('flagging descend: ', indenttok);
				}
			},
			ascend: function(command, wordnum, type) {
				switch (type) {
					case parser.SCRIPTARG:
					case parser.EXPRARG:
					case parser.SWITCHARG:
						break;
					default:
						return;
				}
				depth.pop(command);
				var indenttok = close_brace_indent_token(command[wordnum]);
				if (indenttok) {
					indenttok.ascend = depth.length;
					indenttok.indent = depth.length;
					//console.warn('flagging ascend: ', indenttok);
				}
			},
			oncommand: function(cmd_text, command) {
				var i, token;
				// Tag comments for indenting
				for (i=0; i<command[0].length; i++) {
					token = command[0][i];
					if (token[0] === parser.COMMENT) {
						comment_indent_token(command[0], i).indent = depth.length;
						i++;
					}
				}
				indent_token(command).indent = depth.length;
				//console.warn('cmd_text: '+cmd_text+', depth: '+depth.length+', command: ', command);
			}
		});
		var t, tmp = link_command_tokens(parsed[1]), c=0, ws, new_ws;
		for (t = tmp[0]; t.next; t = t.next) {
			c++;
			//console.warn('t '+c+': '+print_tok(t));
			if (t.descend !== undefined) {
				indenting = should_indent(t);
				//console.warn('descend: '+parser_utils.tokname(t[0])+' ('+parser_utils.visualize_space(whitespace_at(t))+')', tfmt(prev_n_tokens(t.prev,3))+'\n--------------------------'+tfmt(next_n_tokens(t,4)));
				indented_stack.push(indenting);
			}
			if (t.ascend !== undefined) {
				//console.warn('ascend: '+parser_utils.tokname(t[0])+' ('+parser_utils.visualize_space(whitespace_at(t))+')', tfmt(prev_n_tokens(t.prev,3))+'\n--------------------------'+tfmt(next_n_tokens(t,4)));
				indenting = indented_stack.pop();
			}
			if (t.indent !== undefined) {
				if (indenting) {
					ws = whitespace_at(t);
					new_ws = ws.replace(/[^\n]+/g, '').substr(0, 3);
					if (t.ascend !== undefined && new_ws === '') {
						// Close braces in an indenting context must be on a
						// new line
						new_ws = '\n';
					}
					if (block_leader_comment(t)) {
						// Things like fold markers on the same line as the {,
						// etc
						replace_whitespace_at(t, ' ');
					} else if (should_indent(t)) {
						replace_whitespace_at(t, new_ws+make_indent(t.indent));
					}
				}
			}
		}
		if (t !== tmp[1]) {
			console.warn('Did not traverse to end token');
		}
		console.log(parser_utils.reconstitute(parsed[1]));
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error('Parse error in "'+fn+'":\n'+e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Unhandled error in "'+fn+'": '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
});
});
