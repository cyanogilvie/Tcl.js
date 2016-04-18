/*jshint eqnull:true */
/*global define */

/* Current parser bugs:
   None known
 */

define(['./types'], function(types){
"use strict";

var iface, e,
	TEXT	= 0,
	SPACE	= 1,
	VAR		= 2,
	ARRAY	= 3,
	INDEX	= 4,
	ESCAPE	= 5,
	END		= 6,
	SCRIPT	= 7,
	COMMENT	= 8,
	EXPAND	= 9,
	SYNTAX	= 10,
	OPERAND		= 11,
	OPERATOR	= 12,
	LPAREN		= 13,
	RPAREN		= 14,
	FLOAT		= 15,
	INTEGER		= 16,
	MATHFUNC	= 17,
	BOOL		= 18,
	EXPR		= 19,
	ARG			= 20,
	QUOTED		= 21,
	BRACED		= 22,
	SCRIPTARG	= 24,
	EXPRARG		= 25,
	SUBSTARG	= 26,
	SWITCHARG	= 27,
	t = {
		TEXT	: TEXT,
		SPACE	: SPACE,
		VAR		: VAR,
		ARRAY	: ARRAY,
		INDEX	: INDEX,
		ESCAPE	: ESCAPE,
		END		: END,
		SCRIPT	: SCRIPT,
		COMMENT	: COMMENT,
		EXPAND	: EXPAND,
		SYNTAX	: SYNTAX,

		OPERAND		: OPERAND,
		OPERATOR	: OPERATOR,
		LPAREN		: LPAREN,
		RPAREN		: RPAREN,
		FLOAT		: FLOAT,
		INTEGER		: INTEGER,
		MATHFUNC	: MATHFUNC,
		BOOL		: BOOL,
		EXPR		: EXPR,
		ARG			: ARG,
		QUOTED		: QUOTED,
		BRACED		: BRACED,

		SCRIPTARG	: SCRIPTARG,
		EXPRARG		: EXPRARG,
		SUBSTARG	: SUBSTARG,
		SWITCHARG	: SWITCHARG
	}, operators = [
		/^(?:~|!(?=[^=]))/,	1,
		/^\*\*/,			2,
		/^[*\/%]/,			2,
		/^[\-+]/,			2,
		/^(?:<<|>>)/,		2,
		/^(?:<=|>=)/,		2,
		/^(?:<|>)/,			2,	// Technically the same precedence as above, but the above needs to be matched against first
		/^(?:==|!=)/,		2,
		/^(?:ne|eq)/,		2,
		/^(?:in|ni)/,		2,
		/^&(?!&)/,			2,
		/^\^/,				2,
		/^\|(?!\|)/,		2,
		/^&&/,				2,
		/^\|\|/,			2,
		/^[?:]/,			3
	];

function find_line_no(source, ofs) {
	var line = source.substr(0, ofs).replace(/[^\n]+/g, '').length;
	return line+1;
}
function find_line_ofs(source, ofs) {
	return ofs - source.lastIndexOf('\n', ofs);
}
function visualize_whitespace(str) {
	return str.replace(
		/\n/g, '\u23ce'
	).replace(
		/\t/g, '\u21e5'
	);
}
function ParseError(message, charnum, source, ofs) {
	this.name = 'ParseError';
	this.message = message;
	this.line_no = find_line_no(source, charnum);
	this.line_ofs = find_line_ofs(source, charnum);
	this.pretty_print = function(fullsource){
		var preamble_len = Math.min(charnum, 20),
			line_no = find_line_no(fullsource, charnum+ofs),
			line_ofs = find_line_ofs(fullsource, charnum+ofs);
		return 'Parse error: '+message+' at line '+line_no+', character '+line_ofs+
			'\n\t'+visualize_whitespace(fullsource.substr(charnum+ofs-preamble_len, preamble_len+20))+
			'\n\t'+new Array(preamble_len+1).join('.')+'^';
	};
	this.char = charnum;
	this.ofs = ofs || 0;
}
ParseError.prototype = new Error();

function word_empty(tokens) {
	var i;
	for (i=0; i<tokens.length; i++) {
		switch (tokens[i][0]) {
			case TEXT:
			case ESCAPE:
			case VAR:
			case ARRAY:
			//case INDEX:	// Can't have INDEX without ARRAY
			case SCRIPT:
			case EXPAND:
				return false;
		}
	}
	return true;
}


function all_script_tokens(commands) {
	var i, j, k, command, word, tokens=[];

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		for (j=0; j<command.length; j++) {
			word = command[j];
			for (k=0; k<word.length; k++) {
				tokens.push(word[k]);
			}
		}
	}
	return tokens;
}

function parse(text, mode, ofs) {
	var i = 0, word, token = '', tokens = [], lasttoken, command = [],
		commands = [], matches, tokstart = (ofs != null ? ofs : 0);

	function toklength(tok) {
		var len, i, tokens;
		switch (tok[0]) {
			case INDEX:
				len = 0;
				for (i=0; i<tok[1].length; i++) {
					len += toklength(tok[1][i]);
				}
				return len;

			case SCRIPT:
				tokens = all_script_tokens(tok[1]);
				len = 0;
				for (i=0; i<tokens.length; i++) {
					len += toklength(tokens[i]);
				}
				return len;

			default:
				return tok[1].length;
		}
	}

	function emit(tok) {
		tok[3] = tokstart;
		tokstart += toklength(tok);
		tokens.push(tok);
		token = '';
	}

	function emit_waiting(type) {
		if (token) {emit([type, token]);}
	}

	function parse_escape() {
		var escapechars, first = i++;

		function literal(crep, len) {
			var last = first + (len === undefined ? 1 : len);
			emit_waiting(TEXT);
			emit([ESCAPE, text.substr(first, last-first+1), crep]);
			i = last+1;
		}

		function charcode(code, len) {
			literal(String.fromCharCode(code), len);
		}

		switch (text[i++]) {
			case undefined:
				token += '\\';
				break;

			case 'a': charcode(0x7); break;
			case 'b': charcode(0x8); break;
			case 'f': charcode(0xc); break;
			case 'n': charcode(0xa); break;
			case 'r': charcode(0xd); break;
			case 't': charcode(0x9); break;
			case 'v': charcode(0xb); break;

			case 'x':
				matches = text.substr(i).match(/^[0-9A-Fa-f]+/);
				if (matches !== null) {
					escapechars = matches[0];
					charcode(parseInt(escapechars, 16) % 0xff, escapechars.length+1);
				} else {
					literal('x');
				}
				break;

			case 'u':
				matches = text.substr(i).match(/^[0-9A-Fa-f]{1,4}/);
				if (matches !== null) {
					escapechars = matches[0];
					charcode(parseInt(escapechars, 16), escapechars.length+1);
				} else {
					literal('u');
				}
				break;

			case '\n':
				// Line folding
				matches = text.substr(i).match(/^[ \t]*/);
				literal(' ', matches !== null ? matches[0].length+1 : 1);
				break;

			default:
				i--;
				matches = text.substr(i).match(/^[0-7]{1,3}/);
				if (matches !== null) {
					escapechars = matches[0];
					charcode(parseInt(escapechars, 8), escapechars.length);
				} else {
					literal(text[i]);
				}
				break;
		}
	}

	function parse_commands() {
		var word, lasttoken, savetokens, savetokstart, command=[], commands=[];

		emit_waiting(TEXT);
		emit([SYNTAX, text[i++]]);
		savetokstart = tokstart;
		while (true) {
			savetokens = tokens.slice();
			word = get_word(command.length === 0, true);
			tokens = savetokens;
			command.push(word);
			lasttoken = word[word.length-1];
			if (lasttoken == null) {
				throw new ParseError('Cannot find end of command', i, text, ofs);
			}
			if (lasttoken[0] === END) {
				commands.push(command);
				command = [];
				if (lasttoken[1] === ']' || lasttoken[1] === '') {
					break;
				}
			}
		}
		tokstart = savetokstart;
		emit([SCRIPT, commands]);
	}

	function parse_variable() {
		var idx, save_i;

		if (!/^([a-zA-Z0-9_{(]|::)/.test(text.substr(i+1,2))) {
			token += text[i++];
			return;
		}

		emit_waiting(TEXT);
		emit([SYNTAX, text[i++]]);

		function parse_index() {
			var saved_tokens, saved_tokstart, indextokens;
			// escape, variable and command substs apply here
			emit([SYNTAX, text[i++]]);
			saved_tokens = tokens.slice(0);
			saved_tokstart = tokstart;
			tokens = [];
			while (true) {
				switch (text[i]) {
					case ')':
						emit_waiting(TEXT);
						indextokens = tokens.slice(0);
						tokens = saved_tokens;
						tokstart = saved_tokstart;
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
				throw new ParseError('missing close-brace for variable name', i, text, ofs);
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
			token = text.substr(i).match(/^[a-zA-Z_0-9:]*/)[0];
			// : alone is a name terminator
			idx = token.replace(/::/g, '__').indexOf(':');
			if (idx > 0) {
				token = token.substr(0, idx);
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
		var depth = 1, m, from, emitted = false;
		emit([SYNTAX, text[i++]]);
		from = i;

		function emit_fold(len) {
			emit([ESCAPE, text.substr(i, len), ' ']);
			i += len;
			from = i;
		}

		while (depth) {
			m = text.substr(i).match(/(\\*?)?(?:(\{|\})|(\\\n[ \t]*))/);
			if (m === null) {throw new ParseError('missing close-brace', i-1, text, ofs);}
			if (m[1] !== undefined && m[1].length % 2 === 1) {
				// The text we found was backquoted, move along
				i += m.index + m[0].length;
				continue;
			}
			i += m.index + (m[1] !== undefined ? m[1].length : 0);
			if (m[3] !== undefined) {
				// line fold
				if (i > from) {
					emit([TEXT, text.substr(from, i-from)]);
				}
				emit_fold(m[3].length);
				emitted = true;
			} else {
				if (m[2].charAt(0) === '{') {
					depth++;
				} else {
					depth--;
				}
				i++;
			}
		}
		i--;
		if (!emitted || i>from) {
			emit([TEXT, text.substr(from, i-from)]);
		}
		emit([SYNTAX, text[i++]]);
		return tokens;
	}

	function parse_combined(quoted, incmdsubst, ignore_trailing) {
		var matched, start = i;

		if (quoted) {
			emit([SYNTAX, text[i++]]);
		}

		while (true) {
			matched = true;

			if (quoted) {
				switch (text[i]) {
					case undefined:
						throw new ParseError('missing "', start, text, ofs);

					case '"':
						if (!ignore_trailing && text[i+1] !== undefined && text.substr(i+1, 2) !== '\\\n' && !(incmdsubst ? /[\s;\]]/ : /[\s;]/).test(text[i+1])) {
							var lineno = text.substr(0, i).replace(/[^\n]+/, '').length;
							console.log('i: '+i+', ('+text.substr(0, 100)+') line: '+lineno+': '+text.substr(i-5, 10));
							throw new ParseError('extra characters after close-quote', i+1, text, ofs);
						}
						if (i === start + 1) {
							// Need to manually emit rather than using
							// emit_waiting because we still need it if
							// token === ''
							emit([TEXT, token]);
						} else {
							emit_waiting(TEXT);
						}
						emit([SYNTAX, text[i++]]);
						return tokens;

					default: matched = false;
				}
			} else {
				switch (text[i]) {
					case undefined:
						emit_waiting(TEXT);
						emit([END, '']);
						return tokens;

					case '\n':
					case ';':
						emit_waiting(TEXT);
						token = text[i++];
						emit([END, token]);
						return tokens;

					case '\\':
						if (text[i+1] !== '\n') {
							matched = false;
							break;
						}
						// Line fold - falls through
					case ' ':
					case '\t':
						emit_waiting(TEXT);
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
						if (incmdsubst && !quoted) {
							emit_waiting(TEXT);
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
		var re, m;

		tokens = [];
		token = '';
		re = first ?
			/^(?:[\t \n]*\\\n[\t \n]*)|^[\t \n]+/ :
			/^(?:[\t ]*\\\n[\t ]*)|^[\t ]+/;

		// Consume any leading whitespace / comments if first word
		while (
			(first && text[i] === '#') ||
			(m = re.exec(text.substr(i)))
		) {
			if (m) {
				token += m[0];
				i += m[0].length;
			}
			emit_waiting(SPACE);
			if (first && text[i] === '#') {
				while (text[i] !== undefined) {
					if (text[i] === '\\' && i < text.length-1) {
						token += text[i++];
					}
					token += text[i++];
					if (text[i] === '\n') {
						token += text[i++];
						break;
					}
				}
				emit([COMMENT, token]);
			}
			m = null;
		}

		// handle {*}
		if (text[i] === '{' && text.substr(i, 3) === '{*}') {
			emit([EXPAND, '{*}']);
			i += 3;
		}

		switch (text[i]) {
			case undefined:	return tokens;
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
		var here, m, found, j, expecting_operator = false;

		function emit_token(type, value, subtype, crep) {
			if (value === undefined) {
				value = '';
			}
			if (value.length === 0 && type !== END) {
				throw new ParseError('Refusing to emit a token of length 0', i, text, ofs);
			}
			tokens.push([type, subtype, crep, value]);
			tokstart += value.length;
			i += value.length;
		}

		function parse_quoted() {
			parse_combined(true, false, true);
		}

		function sub_parse(subtoken, func, make_crep) {
			var s_tokens = tokens.slice(),
				s_tokstart = tokstart,
				s_i = i, e_i, crep, subtokens;
			tokens = [];
			func();
			subtokens = tokens.slice();
			e_i = i;
			tokens = s_tokens;
			tokstart = s_tokstart;
			i = s_i;
			crep = make_crep ? make_crep(subtokens) : subtokens;
			emit_token(OPERAND, text.substr(i, e_i-i), subtoken, crep);
		}

		function sub_parse_arg() {
			var s_tokens=tokens.slice(), s_i=i, e_i, subtokens;
			tokens = [];
			parse_subexpr(true);
			subtokens = tokens;
			tokens = s_tokens;
			e_i = i;
			i = s_i;
			emit_token(ARG, text.substr(i, e_i-i), EXPR, subtokens);
			return subtokens[subtokens.length-1][3];
		}

		function parse_mathfunc(funcname, space){
			var s_i = i, e_i, s_tokens = tokens.slice(), term, subtokens;
			tokens = [];
			emit_token(MATHFUNC, funcname);
			if (space) {emit_token(SPACE, space);}
			emit_token(SYNTAX, '(');
			do {
				term = sub_parse_arg();
			} while (term === ',');
			subtokens = tokens;
			tokens = s_tokens;
			e_i = i;
			i = s_i;
			emit_token(OPERAND, text.substr(i, e_i-i), MATHFUNC, subtokens);
		}

		while (text[i] !== undefined) {
			here = text.substr(i);
			// line folds
			if (m = /^\\\n\s+/.exec(here)) {
				emit_token(SPACE, m[0]);
				continue;
			}

			// whitespace
			if (m = /^\s+/.exec(here)) {
				emit_token(SPACE, m[0]);
				continue;
			}

			if (!expecting_operator) {
				// Unitary + and -
				if (m = /[\-+]/.exec(text[i])) {
					emit_token(OPERATOR, m[0], 0, 1);
					continue;
				}
			}

			// operators, in decreasing precedence
			found = false;
			for (j=0; j<operators.length; j+=2) {
				if (m = operators[j].exec(here)) {
					emit_token(OPERATOR, m[0], j, operators[j+1]);
					found = true;
					expecting_operator = false;
					break;
				}
			}
			if (found) {continue;}

			expecting_operator = true;

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

			switch (text[i]) {
				case '"': sub_parse(QUOTED, parse_quoted);		continue;
				case '{': sub_parse(BRACED, parse_braced);		continue;
				case '$':
					sub_parse(VAR, parse_variable, function(tokens){
						var j, array, index;
						for (j=0; j<tokens.length; j++) {
							switch (tokens[j][0]) {
								case VAR: return [tokens[j][1]];
								case ARRAY: array = tokens[j][1]; break;
								case INDEX:
									index = tokens[j][1];
									if (index.length === 1 && index[0][0] === TEXT) {
										// Optimize the common case where the
										// index is a simple string
										return [array, index[0][1]];
									} else {
										// Index needs runtime resolution
										return [array, tokens[j][1]];
									}
							}
						}
						throw new ParseError('No variable found', i, text, ofs);
					});
					continue;
				case '[':
					sub_parse(SCRIPT, parse_commands, function(tokens){
						var j;
						for (j=0; j<tokens.length; j++) {
							if (tokens[j][0] === SCRIPT) {
								return tokens[j];
							} else if (tokens[j][0] === SYNTAX) {
								// Dirty hack to inject the [ syntax token
								emit_token(SYNTAX, tokens[j][1]);
							}
						}
						throw new ParseError('No script found', i, text, ofs);
					});
					continue;
				case '(': emit_token(LPAREN, text[i]);			continue;
				case ')':
					if (funcargs) {
						emit_token(SYNTAX, text[i]);
						return;
					}
					emit_token(RPAREN, text[i]);
					continue;
			}
			if (funcargs) {
				if (text[i] === ',') {
					emit_token(SYNTAX, text[i]);
					return;
				}
			}
			// mathfunc
			if (m = /^(\w+)(\s*)?\(/.exec(here)) {
				parse_mathfunc(m[1], m[2]);
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
					['TCL', 'PARSE', 'EXPR', 'BAREWORD']);
			}
			console.log('Cannot parse expression portion: "'+here+'"');
			throw new types.TclError('Cannot parse expression portion: "'+here+'"',
				['TCL', 'PARSE', 'EXPR', 'GIVEUP']);
		}
	}

	function tokenize_list() {
		var m;

		while (true) {
			if ((m = /^\s+/.exec(text.substr(i)))) {
				emit([SPACE, m[0]]);
				i += m[0].length;
			}

			switch (text[i]) {
				case undefined:	return tokens;
				case '{':		parse_braced();					break;
				case '"':		parse_combined(true, false);	break;
				default:		parse_combined(false, false);	break;
			}
		}
	}

	switch (mode) {
		case 'script':
			while (i<text.length) {
				word = get_word(command.length === 0, false);
				if (i >= text.length && word.length && word[word.length-1][0] !== END) {
					word.push([END, '', null, i]);
				}
				if (command.length>1 && word_empty(word)) {
					// Prevent a fake word being added to the command only
					// containing non-word tokens
					Array.prototype.push.apply(command[command.length-1], word);
				} else {
					command.push(word);
				}
				lasttoken = word[word.length-1];
				if (lasttoken[0] === END) {
					commands.push(command);
					command = [];
				}
			}
			return [SCRIPT, commands, undefined, 0];
		case 'expr':
			parse_subexpr();
			return tokens;
		case 'list':
			tokenize_list();
			return tokens;
		case 'subst':
			while (i < text.length) {
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

					default:
						token += text[i++];
						break;
				}
			}
			emit_waiting(TEXT);
			return tokens;
		default:
			throw new Error('Invalid parse mode: "'+mode+'"');
	}
}

function parse_script(text, ofs) {
	// First unfold - happens even in brace quoted words
	// This has been pushed down to parse_escape, parse_braced and parse_subexpr
	//text = text.replace(/\\\n\s*/g, ' ');
	return parse(text, 'script', ofs);
}

function parse_expr(text, ofs) {
	return parse(text, 'expr', ofs);
}

function parse_list(text, ofs) {
	return parse(text, 'list', ofs);
}

function parse_subst(text, ofs) {
	return parse(text, 'subst', ofs);
}

function expr2stack(expr) {
	// Algorithm from Harry Hutchins http://faculty.cs.niu.edu/~hutchins/csci241/eval.htm
	var P = [], i, stack = [], item;

	for (i=0; i<expr.length; i++) {
		switch (expr[i][0]) {
			case OPERAND: P.push(expr[i]); break;
			case LPAREN: stack.push(expr[i]); break;
			case RPAREN: 
				if (stack.length === 0) {
					throw new Error('Unbalanced close parenthesis in expression');
				}
				while (stack.length) {
					item = stack.pop();
					if (item[0] === LPAREN) {
						break;
					}
					P.push(item);
				}
				break;
			case OPERATOR:
				if (stack.length === 0 || stack[stack.length-1][0] === LPAREN) {
					stack.push(expr[i]);
				} else {
					while (
						stack.length &&
						(item = stack[stack.length-1])[0] !== LPAREN &&
						expr[i][1] > item[1]
					) {
						P.push(stack.pop());
					}
					stack.push(expr[i]);
				}
				break;
			case SYNTAX:
			case SPACE:
				break;
			default:
				if (console !== undefined) {
					console.warn('Ignoring expr item:', expr[i]);
				}
		}
	}
	if (stack.length && stack[stack.length-1][0] === LPAREN) {
		throw new Error('Unbalanced open parenthesis in expression');
	}
	while (stack.length) {
		P.push(stack.pop());
	}
	return P;
}

iface = {
	'parse_script': parse_script,
	'parse_expr': parse_expr,
	'parse_list': parse_list,
	'parse_subst': parse_subst,
	'expr2stack': expr2stack,
	'ParseError': ParseError,
	'tokenname': {},
	'find_line_no': find_line_no,
	'find_line_ofs': find_line_ofs
};
for (e in t) {
	if (t.hasOwnProperty(e)) {
		iface[e] = t[e];
		iface.tokenname[t[e]] = e;
	}
}
return iface;
});
