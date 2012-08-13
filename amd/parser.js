/*jslint plusplus: true, white: true */
/*global define */

define(function(){
"use strict";

var iface, e,
	t = {
		TXT		: 0,
		SPACE	: 1,
		VAR		: 2,
		ARRAY	: 3,
		INDEX	: 4,
		EOL		: 5,
		END		: 6,
		SCRIPT	: 7,
		COMMENT	: 8,
		EXPAND	: 9,
		SYNTAX	: 10
	};

function ParseError(message) {
	this.name = 'ParseError';
	this.message = message;
}
ParseError.prototype = new Error();

function parse_script(text) {
	var i, word, lasttoken, command = [], commands = [], matches;

	function get_word(first, incmdsubst) {
		var token, tokens, re;

		function emit_waiting(type) {
			if (token) {
				tokens.push([type, token]);
				token = '';
			}
		}

		function emit(tok) {
			tokens.push(tok);
			token = '';
		}

		function parse_escape() {
			var escapechars;

			i++;
			switch (text[i]) {
				case undefined:
					token += '\\';
					break;

				case 'a': token += String.fromCharCode(0x7); i++; break;
				case 'b': token += String.fromCharCode(0x8); i++; break;
				case 'f': token += String.fromCharCode(0xc); i++; break;
				case 'n': token += String.fromCharCode(0xa); i++; break;
				case 'r': token += String.fromCharCode(0xd); i++; break;
				case 't': token += String.fromCharCode(0x9); i++; break;
				case 'v': token += String.fromCharCode(0xb); i++; break;

				case 'x':
					i++;
					matches = text.substr(i).match(/^[0-9A-Fa-f]+/);
					if (matches !== null) {
						escapechars = matches[0];
						token += String.fromCharCode(parseInt(escapechars, 16) % 0xff);
						i += escapechars.length;
					} else {
						token += 'x';
					}
					break;

				case 'u':
					i++;
					matches = text.substr(i).match(/^[0-9A-Fa-f]{1,4}/);
					if (matches !== null) {
						escapechars = matches[0];
						token += String.fromCharCode(parseInt(escapechars, 16));
						i += escapechars.length;
					} else {
						token += 'u';
					}
					break;

				default:
					matches = text.substr(i).match(/^[0-7]{1,3}/);
					if (matches !== null) {
						escapechars = matches[0];
						token += String.fromCharCode(parseInt(escapechars, 8));
						i += escapechars.length;
					} else {
						token += text[i++];
					}
					break;
			}
		}

		function parse_commands() {
			var word, lasttoken, command = [], commands = [];
			emit([t.SYNTAX, text[i++]]);
			while (true) {
				word = get_word(command.length === 0, true);
				command.push(word);
				lasttoken = word[word.length-1];
				if (lasttoken[0] === t.EOL) {
					commands.push(command);
					command = [];
				}
				if (lasttoken[0] === t.END) {
					commands.push(command);
					command = [];
					break;
				}
			}
			emit([t.SCRIPT, commands]);
		}

		function parse_variable() {
			var idx, save_i;

			if (text[i+1] === '$') {
				token += text[i++];
				return;
			}
			emit_waiting(t.TXT);
			emit([t.SYNTAX, text[i++]]);

			function parse_index() {
				// escape, variable and command substs apply here
				emit([t.SYNTAX, text[i++]]);
				while (true) {
					switch (text[i]) {
						case ')':
							emit([t.INDEX, token]);
							emit([t.SYNTAX, text[i++]]);
							return;

						case '\\': parse_escape(); break;
						case '$': parse_variable(); break;
						case '[': parse_commands(); break;

						default: token += text[i++]; break;
					}
				}
			}

			if (text[i] === '{') {
				emit([t.SYNTAX, text[i++]]);
				idx = text.indexOf('}', i);
				if (idx === -1) {
					throw new ParseError('missing close-brace for variable name');
				}
				token = text.substr(i, idx);
				i += idx;
				if (token[token.length-1] === ')' && (idx = token.lastIndexOf('(')) !== -1) {
					token = token.substr(0, idx);
					emit([t.ARRAY, token]);
					save_i = i;
					i = idx;
					parse_index();
					i = save_i;
				} else {
					emit([t.VAR, token]);
				}
				emit([t.SYNTAX, text[i++]]);
			} else {
				token = text.substr(i).match(/[a-zA-Z_0-9:]+/)[0];
				// : alone is a name terminator
				idx = token.replace(/::/, '__').indexOf(':');
				if (idx > 0) {
					token.substr(0, idx);
				}
				i += token.length;
				if (text[i] !== '(') {
					emit([t.VAR, token]);
				} else {
					emit([t.ARRAY, token]);
					parse_index();
				}
			}
		}

		function parse_braced() {
			var idx, depth = 1, from;
			emit([t.SYNTAX, text[i++]]);
			from = i;
			while (depth) {
				idx = text.substr(i).search(/[{}]/);
				if (idx === -1) {throw new ParseError('missing close-brace');}
				i += idx;
				if (text[i-1] !== '\\') {
					if (text[i] === '{') {
						depth++;
					} else {
						depth--;
					}
				}
				i++;
			}
			i--;
			emit([t.TXT, text.substr(from, i-from)]);
			emit([t.SYNTAX, text[i++]]);
			return tokens;
		}

		function parse_combined(quoted) {
			var matched;

			if (quoted) {
				emit([t.SYNTAX, text[i++]]);
			}

			while (true) {
				matched = true;

				if (quoted) {
					switch (text[i]) {
						case undefined:
							throw new ParseError('missing "');

						case '"':
							if (text[i+1] !== undefined && !/[\s;]/.test(text[i+1])) {
								throw new ParseError('extra characters after close-quote');
							}
							emit_waiting(t.TXT);
							emit([t.SYNTAX, text[i++]]);
							return tokens;

						default: matched = false;
					}
				} else {
					switch (text[i]) {
						case undefined:
							emit_waiting(t.TXT);
							emit([t.END, '']);
							return tokens;

						case '\n':
						case ';':
							emit_waiting(t.TXT);
							token = text[i++];
							emit([t.EOL, token]);
							return tokens;

						case ' ':
						case '\t':
							emit_waiting(t.TXT);
							return tokens;

						default: matched = false;
					}
				}

				if (!matched) {
					switch (text[i]) {
						case '\\':
							parse_escape();
							break;

						case '$':
							parse_variable();
							break;

						case '[':
							parse_commands();
							break;

						case ']':
							if (incmdsubst) {
								emit_waiting(t.TXT);
								token = text[i++];
								emit([t.END, token]);
								return tokens;
							}
							// Falls through
						default:
							token += text[i++];
							break;
					}
				}
			}
		}

		tokens = [];
		token = '';
		re = first ? /[\t #]/ : /[t ]/;

		// Consume any leading whitespace / comments if first word
		while (re.test(text[i])) {
			while (/[\t ]/.test(text[i])) {
				token += text[i++];
			}
			emit_waiting(t.SPACE);
			if (first && text[i] === '#') {
				while (text[i] !== undefined && text[i] !== '\n') {
					token += text[i++];
				}
				emit([t.COMMENT, token]);
			}
		}

		// handle {*}
		if (text[i] === '{' && text.substr(i, 3) === '{*}') {
			emit([t.EXPAND, '{*}']);
			i += 3;
		}

		switch (text[i]) {
			case undefined:	emit([t.END, '']); return tokens;
			case '{':		return parse_braced();
			case '"':		return parse_combined(true);
			case ']':
				if (incmdsubst) {
					emit([t.EOL, ']']);
					return tokens;
				}
				// Falls through to default
			default:		return parse_combined(false);
		}
	}

	i = 0;
	// First unfold - happens even in brace quoted words
	text = text.replace(/\\\n\s*/g, ' ');

	while (true) {
		word = get_word(command.length === 0, false);
		command.push(word);
		lasttoken = word[word.length-1];
		if (lasttoken[0] === t.EOL) {
			commands.push(command);
			command = [];
		} else if (lasttoken[0] === t.END) {
			commands.push(command);
			command = [];
			break;
		}
	}
	return [t.SCRIPT, commands];
}

iface = {
	'parse_script': parse_script,
	'ParseError': ParseError,
	'tokenname': {}
};
for (e in t) {
	if (t.hasOwnProperty(e)) {
		iface[e] = t[e];
		iface['tokenname'][t[e]] = e;
	}
}
return iface;
});
