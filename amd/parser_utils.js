/*jshint eqnull:true */
/*global define */

define([
	'tcl/parser',
	'tcl/list'
], function(
	parser,
	tcllist
){
'use strict';

var iface,
	EXPRARG = parser.EXPRARG,
	SCRIPTARG = parser.SCRIPTARG,
	SUBSTARG = parser.SUBSTARG,
	LISTARG = parser.LISTARG,
	cmd_parse_info = {
	'if': function(words){
		var special = [
			1, EXPRARG
		], wordtext, p, last=last_real_word_number(words);

		for (p=2; p<=last; p++) {
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
		return last_real_word_number(words) === 1 ? [1, EXPRARG] : [];
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
	'namespace': function(words){
		var specials=[], i, last=last_real_word_number(words);
		switch (get_text(words[1])) {
			case 'eval':
				for (i=3; i<=last; i++) {
					specials.push(i, SCRIPTARG);
				}
				break;
		}
		return specials;
	},
	'try': function(words){
		var i=2, specials=[], last=last_real_word_number(words);
		specials.push(1, SCRIPTARG);
		while (i <= last) {
			switch (get_text(words[i])) {
				case 'on':
				case 'trap':
					specials.push(i+3, SCRIPTARG);
					i += 4;
					break;

				case 'finally':
					specials.push(i+1, SCRIPTARG);
					i += 2;
					break;

				default:
					// We're out of sync or dealing with an invalid syntax for
					// try - no way to recover, best we can do is send back
					// what we've found so far
					return specials;
			}
		}
		return specials;
	},
	'eval': function(words){
		var i, specials=[], last=last_real_word_number(words);
		for (i=1; i<=last; i++) {
			specials.push(i, SCRIPTARG);
		}
		return specials;
	},
	'uplevel': function(words){
		var i=1, specials=[], last=last_real_word_number(words);

		if (/^[0-9#]/.test(get_text(words[i])))
			i++;

		while (i <= last) {
			specials.push(i++, SCRIPTARG);
		}
		return specials;
	},
	'switch': function(words){
		var i=1, specials=[], skipping_args=true, last=last_real_word_number(words), listwords, j, subspecials;

		while (skipping_args && i<=last) {
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
		if (last === i) {
			subspecials = [];
			listwords = tcllist.list2array(get_text(words[i]));

			for (j=1; j<listwords.length; j+=2)
				if (listwords[j] !== '-')
					subspecials.push(j, SCRIPTARG);

			specials.push(i, subspecials);
		} else {
			while (i <= last) {
				specials.push(i+1, SCRIPTARG);
				i+=2;
			}
		}
		return specials;
	},
	"dict": function(words){
		var last=last_real_word_number(words);

		switch get_text(words[1]) {
			case 'filter':
				if (get_text(words[3]) === 'script') return [5, SCRIPTARG];
				break;

			case 'for':
			case 'map':
			case 'update':
			case 'with':
				return [last, SCRIPTARG];
		}
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
	var i, token;
	for (i=0; i<tokens.length; i++) {
		token = tokens[i];
		if (token[0] === parser.OPERAND && token[1] === parser.SCRIPT) {
			deep_parse(token[2], params);
		} else if (token[0] === parser.VAR && typeof token[2][1] !== 'string') {
			deep_parse_tokens(token[2][1], params);
		} else if (token[0] === parser.QUOTED) {
			deep_parse_tokens(token[2], params);
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

function list_elements(listtokens) {
	var i, tok, out=[], ofs, token;

	function emit_elem() {
		if (tok != null) {
			out.push([tok, ofs]);
			tok = null;
			ofs = null;
		}
	}

	for (i=0; i<listtokens.length; i++) {
		token = listtokens[i];
		switch (token[0]) {
			case parser.SPACE:
				emit_elem();
				break;

			case parser.TEXT:
			case parser.ESCAPE:
				if (ofs == null) {ofs = token[3];}
				if (tok == null) {tok = '';}
				tok += token[2] || token[1];
				break;

			case parser.SYNTAX:
				break;

			case parser.END:
				emit_elem();
				break;

			default:
				throw new Error('Unexpected list token: '+JSON.stringify(listtokens[i]));
		}
	}

	return out;
}

function list_words(listtokens) { // Convert to command-style list of words
	var i, token, word=[], words=[];

	for (i=0; i<listtokens.length; i++) {
		token = listtokens[i];

		// Leading space tokens are part of the first word
		if (word.length > 0 && token[0] == parser.SPACE) {
			words.push(word);
			word = [];
		}

		word.push(token);
	}

	if (word.length > 0)
		words.push(word);

	return words;
}

function deep_parse_list_arg(list_arg, special, ofs, params) {
	var words;

	words = list_words(parser.parse_list(list_arg, ofs));
	apply_specials(words, special, params);

	return words;
}

function get_cmd_parse_info(params, cmd_text) {
	if (cmd_parse_info[cmd_text] !== undefined)
		return cmd_parse_info[cmd_text];

	return params.get_cmd_parse_info == null ? null : params.get_cmd_parse_info(params, cmd_text);
}

function apply_specials(command, special, params) {
	var j, k, ofs, txt;

	if (special == null) return;

	for (j=0; j<special.length; j+=2) {
		k = special[j];
		if (command[k] == null) continue;

		//console.warn(cmd_text+' k: '+k+', command.length: '+command.length);
		txt = get_text(command[k], true);
		if (txt == null) {
			// word text is dynamic - comes from a variable or
			// result of a command, so we can't statically parse it
			continue;
		}

		if (Array.isArray(special[j+1])) {
			// Word j is a list, with specials given by the array special[j+1]
			ofs = word_start(command[k]);
			params.descend(command, k, LISTARG);
			command[k] = replace_static(command[k], [
				LISTARG,
				command[k].slice(),
				deep_parse_list_arg(get_text(command[k]), special[j+1], ofs, params),
				ofs
			]);
			params.ascend(command, k, LISTARG);

		} else {
			switch (special[j+1]) {
				case SCRIPTARG:
					ofs = word_start(command[k]);
					params.descend(command, k, SCRIPTARG);
					command[k] = replace_static(command[k], [
						SCRIPTARG,
						command[k].slice(),
						deep_parse(parser.parse_script(txt, ofs), params),
						ofs
					]);
					params.ascend(command, k, SCRIPTARG);
					break;

				case EXPRARG:
					ofs = word_start(command[k]);
					params.descend(command, k, EXPRARG);
					command[k] = replace_static(command[k], [
						EXPRARG,
						command[k].slice(),
						deep_parse_expr_tokens(parser.parse_expr(txt, ofs), params),
						ofs
					]);
					params.ascend(command, k, EXPRARG);
					break;

				case SUBSTARG:
					ofs = word_start(command[k]);
					params.descend(command, k, SUBSTARG);
					command[k] = replace_static(command[k], [
						SUBSTARG,
						command[k].slice(),
						parser.parse_subst(txt, ofs),
						ofs
					]);
					params.ascend(command, k, SUBSTARG);
					break;
			}
		}
	}
}

function deep_parse(script_tok, params) {
	var commands=script_tok[1], command, i, j, parse_info, special,
		cmd_text;

	if (params === undefined) {
		params = {};
	}
	if (params.oncommand === undefined) { params.oncommand = function(){}; }
	if (params.descend === undefined) { params.descend = function(){}; }
	if (params.ascend === undefined) { params.ascend = function(){}; }

	for (i=0; i<commands.length; i++) {
		command = commands[i];

		// Scan for SCRIPT tokens to recurse into
		for (j=0; j<command.length; j++) {
			deep_parse_tokens(command[j], params);
		}

		cmd_text = get_text(command[0]);
		if (cmd_text == null) continue;

		parse_info = get_cmd_parse_info(params, cmd_text);
		if (parse_info == null) {
			params.oncommand(cmd_text, command);
			continue;
		}
		special = typeof parse_info === 'function' ?
			parse_info(command) : parse_info;

		apply_specials(command, special, params);

		params.oncommand(cmd_text, command);
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

function reconstitute_expr(tokens) {
	var i, txt='';
	for (i=0; i<tokens.length; i++) {
		txt += tokens[i][3];
	}
	return txt;
}

function reconstitute_word(word) {
	var script='', k, token;
	for (k=0; k<word.length; k++) {
		token = word[k];
		switch (token[0]) {
			case parser.SCRIPT:
				script += reconstitute(token[1]);
				break;
			case parser.SCRIPTARG:
				script += reconstitute(token[2][1]);
				break;
			case parser.EXPRARG:
				script += reconstitute_expr(token[2]);
				break;
			case parser.INDEX:
				script += reconstitute_word(token[1]);
				break;
			case parser.SUBSTARG:
			case parser.LISTARG:
				script += reconstitute_word(token[2]);
				break;
			default:
				script += token[1];
		}
	}
	return script;
}

function reconstitute(commands) {
	var i, j, script='', command, word;

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		for (j=0; j<command.length; j++) {
			word = command[j];
			script += reconstitute_word(word);
		}
	}

	return script;
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
	'real_words': real_words,
	'last_real_word_number': last_real_word_number,
	'toklength': toklength,
	'reconstitute_expr': reconstitute_expr,
	'reconstitute_word': reconstitute_word,
	'reconstitute': reconstitute
};

return iface;
});
