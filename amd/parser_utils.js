/*jshint eqnull:true */
/*global define */

define(['tcl/parser'], function(parser){
'use strict';

var iface,
	EXPRARG = parser.EXPRARG,
	SCRIPTARG = parser.SCRIPTARG,
	SUBSTARG = parser.SUBSTARG,
	SWITCHARG = parser.SWITCHARG,
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
	'time':		[1, SCRIPTARG],
	'switch':	function(words){
		var i=1, specials=[], skipping_args=true;

		while (skipping_args && i<words.length) {
			switch (get_text(words[i])) {
				case '-exact':
				case '-glob':
				case '-regexp':
				case '-nocase':
					i++;
					break;

				case '-matchvar':
				case '-indexvar':
					i+=2;
					break;

				case '--':
					i++;
				default:
					skipping_args = false;
					break;
			}
		}

		i++;	// String argument
		if (words.length - i === 1) {
			specials.push(i, SWITCHARG);
		} else {
			while (i<words.length) {
				specials.push(i+1, SCRIPTARG);
				i+=2;
			}
		}
		return specials;
	}
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

function real_words(words) {
	var i, realwords = [];

	for (i=0; i<words.length; i++) {
		if (real_word(words[i])) {
			realwords.push(words[i]);
		}
	}
	return realwords;
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

function deep_parse_tokens(tokens, params) {
	var i, token;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (token[0] === parser.SCRIPT) {
			token[1] = deep_parse(token, params)[1];
		} else if (token[0] === parser.INDEX) {
			deep_parse_tokens(token[1], params);
		}
	}
}

function deep_parse_expr_tokens(tokens, params) {
	var i, token, tmp;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (token[0] === parser.OPERAND && token[1] === parser.SCRIPT) {
			tmp = deep_parse(token[2], params);
		}
	}
	return tokens;
}

function toklength(token) {
	var i, j, k, command, word, acc = 0;
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

function tokname(type) {
	var name = parser.tokenname[type];
	//while (name.length < 6) {name += ' ';}
	return name;
}

function word_braced(word) {
	var token, i;
	for (i=0; i<word.length; i++) {
		token = word[i];
		if (token[0] === parser.SPACE || token[0] === parser.COMMENT) {continue;}
		if (token[0] === parser.SYNTAX && token[1] === '{') {
			return true;
		}
		return false;
	}
	return false;
}

function is_unbraced(cmd_text, command) {
	var i;
	switch (cmd_text) {
		case 'while':
		case 'expr':
			return !word_braced(command[1]);

		case 'if':
			if (!word_braced(command[1])) {
				return true;
			}
			for (i=2; i<command.length; i++) {
				if (get_text(command[i]) === 'elseif') {
					i++;
					if (!word_braced(command[i])) {
						return true;
					}
				}
			}
			return false;

		case 'for':
			return !word_braced(command[2]);

		default:
			return false;
	}
}

function deep_parse(script_tok, params) {
	var commands=script_tok[1], command, i, j, k, parse_info, special, txt, ofs,
		cmd_text;

	if (params === undefined) {
		params = {};
	}
	if (params.oncommand === undefined) {
		params.oncommand = function(){};
	}

	for (i=0; i<commands.length; i++) {
		command = commands[i];

		// Scan for SCRIPT tokens to recurse into
		for (j=0; j<command.length; j++) {
			deep_parse_tokens(command[j], params);
		}

		cmd_text = get_text(command[0]);
		parse_info = cmd_parse_info[cmd_text];
		params.oncommand(cmd_text, command);
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
						deep_parse(parser.parse_script(txt, ofs), params),
						ofs
					]);
					break;

				case EXPRARG:
					ofs = word_start(command[k]);
					command[k] = replace_static(command[k], [
						EXPRARG,
						command[k].slice(),
						deep_parse_expr_tokens(parser.parse_expr(txt, ofs), params),
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
					deep_parse_tokens(command[k][2][2], params);
					break;

				case SWITCHARG:
					// TODO: something
					break;
			}
		}
	}
	return script_tok;
}

function process_flags(str, flags) {
	var parts = [], i, m;
	parts = str.split(',');
	for (i=0; i<parts.length; i++) {
		if (!(m = /^\s*(.*?)\s*(?::\s*(.*?)\s*)?$/.exec(parts[i]))) {
			console.warn('Cannot parse flag: "'+parts[i]+'"');
			continue;
		}
		flags[m[1]] = m[2] == null ? true : m[2];
	}
}

var bouncing = false;
function trampoline(f) {
	if (bouncing) {return f;}
	bouncing = true;
	while (typeof f === 'function') {
		f = f();
	}
	bouncing = false;
	return f;
}

function for_each_file(files, f, done) {
	var fs = require('fs'), i=0;
	function next_file() {
		var fn = files[i++];
		if (fn === undefined) {
			if (done !== undefined) {
				return done();
			} else {
				return;
			}
		}

		fs.readFile(fn, 'utf8', function(err, data){
			f(fn, err, data);
			return trampoline(next_file);
		});
	}

	return trampoline(next_file);
}

function visualize_space(str) {
	return str.replace(
		/\n/g, '\u23ce'
	).replace(
		/\t/g, '\u21e5'
	).replace(
		/ /g, '\u23b5'
	);
}

iface = {
	'deep_parse': deep_parse,
	'word_braced': word_braced,
	'is_unbraced': is_unbraced,
	'command_range': command_range,
	'trampoline': trampoline,
	'for_each_file': for_each_file,
	'process_flags': process_flags,
	'word_start': word_start,
	'get_text': get_text,
	'tokname': tokname,
	'visualize_space': visualize_space,
	'real_words': real_words
};

return iface;
});
