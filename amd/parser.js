/*jslint plusplus: true, white: true, continue: true */
/*global define */

define(['./types'], function(types){
"use strict";

var iface, e,
	TXT		= 0,
	SPACE	= 1,
	VAR		= 2,
	ARRAY	= 3,
	INDEX	= 4,
	EOL		= 5,
	END		= 6,
	SCRIPT	= 7,
	COMMENT	= 8,
	EXPAND	= 9,
	SYNTAX	= 10,
	OPERAND		= 11,
	OPERATOR	= 12,
	PARENTHESIS	= 13,
	FLOAT		= 14,
	INTEGER		= 15,
	MATHFUNC	= 16,
	BOOL		= 17,
	t = {
		TXT		: TXT,
		SPACE	: SPACE,
		VAR		: VAR,
		ARRAY	: ARRAY,
		INDEX	: INDEX,
		EOL		: EOL,
		END		: END,
		SCRIPT	: SCRIPT,
		COMMENT	: COMMENT,
		EXPAND	: EXPAND,
		SYNTAX	: SYNTAX,

		OPERAND		: OPERAND,
		OPERATOR	: OPERATOR,
		PARENTHESIS	: PARENTHESIS,
		FLOAT		: FLOAT,
		INTEGER		: INTEGER,
		MATHFUNC	: MATHFUNC,
		BOOL		: BOOL
	}, operators = [
		/^[~!]/,
		/^\*\*/,
		/^[*\/%]/,
		/^[\-+]/,
		/^(?:<<|>>)/,
		/^(?:<|>|<=|>=)/,
		/^(?:==|!=)/,
		/^(?:ne|eq)/,
		/^(?:in|ni)/,
		/^&(?!&)/,
		/^\^/,
		/^\|(?!\|)/,
		/^&&/,
		/^||/,
		/^[?:]/
	];

function ParseError(message) {
	this.name = 'ParseError';
	this.message = message;
}
ParseError.prototype = new Error();

function parse(text, mode) {
	var i = 0, word, token = '', tokens, lasttoken, command = [],
		commands = [], matches;

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
		var word, lasttoken, savetokens, command = [], commands = [];
		emit_waiting(TXT);
		emit([SYNTAX, text[i++]]);
		while (true) {
			savetokens = tokens.slice();
			word = get_word(command.length === 0, true);
			tokens = savetokens;
			command.push(word);
			lasttoken = word[word.length-1];
			if (lasttoken[0] === EOL) {
				commands.push(command);
				command = [];
			}
			if (lasttoken[0] === END) {
				commands.push(command);
				command = [];
				break;
			}
		}
		emit([SCRIPT, commands]);
	}

	function parse_variable() {
		var idx, save_i;

		if (text[i+1] === '$') {
			token += text[i++];
			return;
		}
		emit_waiting(TXT);
		emit([SYNTAX, text[i++]]);

		function parse_index() {
			var saved_tokens, indextokens;
			// escape, variable and command substs apply here
			emit([SYNTAX, text[i++]]);
			saved_tokens = tokens.slice(0);
			tokens = [];
			while (true) {
				switch (text[i]) {
					case ')':
						emit_waiting(TXT);
						indextokens = tokens.slice(0);
						tokens = saved_tokens;
						emit([INDEX, indextokens]);
						emit([SYNTAX, text[i++]]);
						return;

					case '\\': parse_escape(); break;
					case '$': parse_variable(); break;
					case '[': parse_commands(); break;

					default: token += text[i++]; break;
				}
			}
		}

		if (text[i] === '{') {
			emit([SYNTAX, text[i++]]);
			idx = text.indexOf('}', i);
			if (idx === -1) {
				throw new ParseError('missing close-brace for variable name');
			}
			token = text.substr(i, idx-i);
			i += idx-i;
			if (token[token.length-1] === ')' && (idx = token.lastIndexOf('(')) !== -1) {
				save_i = i;
				i -= token.length;
				token = token.substr(0, idx);
				i += token.length;
				emit([ARRAY, token]);
				parse_index();
				i = save_i;
			} else {
				emit([VAR, token]);
			}
			emit([SYNTAX, text[i++]]);
		} else {
			token = text.substr(i).match(/[a-zA-Z_0-9:]+/)[0];
			// : alone is a name terminator
			idx = token.replace(/::/, '__').indexOf(':');
			if (idx > 0) {
				token.substr(0, idx);
			}
			i += token.length;
			if (text[i] !== '(') {
				emit([VAR, token]);
			} else {
				emit([ARRAY, token]);
				parse_index();
			}
		}
	}

	function parse_braced() {
		var idx, depth = 1, from;
		emit([SYNTAX, text[i++]]);
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
		emit([TXT, text.substr(from, i-from)]);
		emit([SYNTAX, text[i++]]);
		return tokens;
	}

	function parse_combined(quoted, incmdsubst) {
		var matched;

		if (quoted) {
			emit([SYNTAX, text[i++]]);
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
						emit_waiting(TXT);
						emit([SYNTAX, text[i++]]);
						return tokens;

					default: matched = false;
				}
			} else {
				switch (text[i]) {
					case undefined:
						emit_waiting(TXT);
						emit([END, '']);
						return tokens;

					case '\n':
					case ';':
						emit_waiting(TXT);
						token = text[i++];
						emit([EOL, token]);
						return tokens;

					case ' ':
					case '\t':
						emit_waiting(TXT);
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
							emit_waiting(TXT);
							token = text[i++];
							emit([END, token]);
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

	function get_word(first, incmdsubst) {
		var re;

		tokens = [];
		token = '';
		re = first ? /[\t #]/ : /[\t ]/;

		// Consume any leading whitespace / comments if first word
		while (re.test(text[i])) {
			while (/[\t ]/.test(text[i])) {
				token += text[i++];
			}
			emit_waiting(SPACE);
			if (first && text[i] === '#') {
				while (text[i] !== undefined && text[i] !== '\n') {
					token += text[i++];
				}
				emit([COMMENT, token]);
			}
		}

		// handle {*}
		if (text[i] === '{' && text.substr(i, 3) === '{*}') {
			emit([EXPAND, '{*}']);
			i += 3;
		}

		switch (text[i]) {
			case undefined:	emit([END, '']); return tokens;
			case '{':		return parse_braced();
			case '"':		return parse_combined(true, incmdsubst);
			case ']':
				if (incmdsubst) {
					emit([END, text[i++]]);
					return tokens;
				}
				// Falls through to default
			default:		return parse_combined(false, incmdsubst);
		}
	}

	function parse_subexpr(funcargs) {
		var here, m, found, j;

		function emit_token(type, value, subtype, crep) {
			if (value === undefined) {
				value = '';
			}
			tokens.push([type, subtype, crep, value]);
			i += value.length;
		}

		while (true) {
			here = text.substr(i);
			// whitespace
			if (m = /^\s+/.exec(here)) {
				emit_token(SPACE, m[0]);
				continue;
			}

			// number
			if (m = /^(?:([\-+]?)(Inf(?:inity)?)|(NaN))\b/i.exec(here)) {
				if (/n/i.test(m[0][1])) {
					emit_token(OPERAND, m[0], FLOAT, NaN);
				} else {
					emit_token(OPERAND, m[0], FLOAT, Number(m[1]+'Infinity'));
				}
				continue;
			}
			if (m = (
				/^[\-+]?\d+(?:(\.)(?:\d+)?)?(e[\-+]?\d+)?/i.exec(here) ||
				/^[\-+]?(\.)\d+(e[\-+]?\d+)?/i.exec(here)
			)) {
				if (m[1] === undefined && m[2] === undefined) {
					emit_token(OPERAND, m[0], INTEGER, Number(m[0]));
				} else {
					emit_token(OPERAND, m[0], FLOAT, Number(m[0]));
				}
				continue;
			}
			if (m = (
				/^([\-+])?(0x)([\dA-F]+)/i.exec(here) ||
				/^([\-+])?(0b)([01]+)/i.exec(here) ||
				/^([\-+])?(0o)([0-7]+)/i.exec(here)
			)) {
				// TODO: Bignum support
				emit_token(OPERAND, m[0], INTEGER,
					parseInt((m[1] || '')+m[3],
						{'': 10, '0x': 16, '0b': 2, '0o': 8}[m[2]]
					)
				);
				continue;
			}

			// operators, in decreasing precedence
			for (j=0; j<operators.length; j++) {
				if (m = operators[j].exec(here)) {
					emit_token(OPERATOR, m[0], j);
					found = true;
					break;
				}
			}
			if (found) {continue;}

			switch (text[i]) {
				case '"': parse_combined(true, false);	continue;
				case '{': parse_braced();				continue;
				case '$': parse_variable();				continue;
				case '[': parse_commands();				continue;
				case '(':
					emit_token(PARENTHESIS, text[i]);
					parse_subexpr();
					continue;
				case ')':
					emit_token(funcargs ? SYNTAX : PARENTHESIS, text[i]);
					return tokens;
				case undefined:
					emit_token(END);
					return tokens;
			}
			if (funcargs) {
				if (text[i] === ',') {
					emit_token(SYNTAX, text[i]);
					return tokens;
				}
			}
			// mathfunc
			if (m = /^(\w+)(\s*)?\(/.exec(here)) {
				emit_token(OPERAND, m[1], MATHFUNC);
				if (m[2]) {emit_token(SPACE, m[2]);}
				emit_token(SYNTAX, '(');
				do {
					parse_subexpr(true);
				} while (tokens[tokens.length-1][1] === ',');
				continue;
			}
			// boolean
			if (m = /^(?:tr(?:ue?)?|yes?|on)\b/i.exec(here)) {
				emit_token(OPERAND, m[0], BOOL, true);
				continue;
			}
			if (m = /^(?:fa(?:l(?:se?)?)?|no|off?)\b/i.exec(here)) {
				emit_token(OPERAND, m[0], BOOL, false);
				continue;
			}
			// invalid bareword
			if (m = /^\w+\b/.exec(here)) {
				throw new types.TclError('invalid bareword "'+m[0]+'"',
					'TCL', 'PARSE', 'EXPR', 'BAREWORD');
			}
			throw new types.TclError('Cannot parse expression portion: "'+here+'"',
				'TCL', 'PARSE', 'EXPR', 'GIVEUP');
		}
	}

	switch (mode) {
		case 'script':
			while (true) {
				word = get_word(command.length === 0, false);
				command.push(word);
				lasttoken = word[word.length-1];
				if (lasttoken[0] === EOL) {
					commands.push(command);
					command = [];
				} else if (lasttoken[0] === END) {
					commands.push(command);
					command = [];
					break;
				}
			}
			return [SCRIPT, commands];
		case 'expr':
			parse_subexpr();
			return tokens;
		default:
			throw new Error('Invalid parse mode: "'+mode+'"');
	}
}

function parse_script(text) {
	// First unfold - happens even in brace quoted words
	text = text.replace(/\\\n\s*/g, ' ');
	return parse(text, 'script');
}

function parse_expr(text) {
	return parse(text, 'expr');
}

iface = {
	'parse_script': parse_script,
	'parse_expr': parse_expr,
	'ParseError': ParseError,
	'tokenname': {}
};
for (e in t) {
	if (t.hasOwnProperty(e)) {
		iface[e] = t[e];
		iface.tokenname[t[e]] = e;
	}
}
return iface;
});
