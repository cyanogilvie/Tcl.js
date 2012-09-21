/*global define */
/*jslint nomen: true, plusplus: true, white: true, browser: true, node: true, newcap: true, continue: true */

define([
	'./types',
	'./utils'
], function(
	types,
	utils
){
"use strict";

var problem_chars = /[ "{}$;\t\f\n\r\v\[\]]/,
	hex_chars = /[\dabcdefABCDEF]/,
	whitespace = /\s/,
	true_values = ['1', 'yes', 'true', 'on'],
	false_values = ['0', 'no', 'false', 'off'];

// Exceptions <<<
function ParseError(message) {
	this.name = 'ParseError';
	this.message = message;
}
ParseError.prototype = new Error();

function IncompleteError(message, missing) {
	this.name = 'IncompleteError';
	this.message = message;
	this.missing = missing;
}
IncompleteError.prototype = new ParseError();
// Exceptions >>>

function unicode_char(value) { //<<<
	return String.fromCharCode(value);
}

//>>>
function parse_tcl_list(str) { //<<<
	var ofs = -1,
		parts = [],
		elem = '',
		in_elem = false,
		braced = false,
		quoted = false,
		bracedepth = 0,
		braceescape = false,
		elemstart = false,
		escaped = false,
		escape_seq = '',
		escape_mode = '',
		needspace = false,
		braceofs = 0,
		quoteofs = 0,
		c,
		finished = false,
		cont = false,
		acc,
		pow,
		i,
		lsd;

	if (str === undefined || str === null) {
		return [];
	}

	for (i=0; i<str.length; i++) {
		ofs++;

		c = str.charAt(i);

		if (needspace) { // continues <<<
			if (whitespace.test(c)) {
				needspace = 0;
				continue;
			}
			throw new ParseError('Garbage after list element at offset '+ofs+': "'+c+'"');
		}
		//>>>
		if (!in_elem) { // fallthrough if c not a space <<<
			if (whitespace.test(c)) {
				continue;
			}
			in_elem = true;
			elemstart = true;
		}
		//>>>
		if (elemstart) { // continues <<<
			switch (c) {
				case '{':
					braced = true;
					bracedepth = true;
					braceofs = ofs;
					break;
				case '"':
					quoted = true;
					break;
				case '\\':
					escaped = true;
					break;
				default:
					elem += c;
			}
			elemstart = false;
			continue;
		}
		//>>>
		if (escaped) { // sometimes falls through <<<
			if (escape_mode === '') { //<<<
				switch (c) {
					case 'a':
						elem += '\u0007';
						escaped = false;
						break;
					case 'b':
						elem += '\u0008';
						escaped = false;
						break;
					case 'f':
						elem += '\u000c';
						escaped = false;
						break;
					case 'n':
						elem += '\u000a';
						escaped = false;
						break;
					case 'r':
						elem += '\u000d';
						escaped = false;
						break;
					case 't':
						elem += '\u0009';
						escaped = false;
						break;
					case 'v':
						elem += '\u000b';
						escaped = false;
						break;

					case '0':
					case '1':
					case '2':
					case '3':
					case '4':
					case '5':
					case '6':
					case '7':
						escape_mode = 'octal';
						escape_seq += c;
						break;
	
					case 'x':
						escape_mode = 'hex';
						break;

					case 'u':
						escape_mode = 'unicode';
						break;

					default:
						elem += c;
						escaped = false;
						break;
				}
				if (!escaped) {
					escape_mode = '';
				}
				continue;
				//>>>
			} else if (escape_mode === 'octal') { //<<<
				finished = false;
				cont = false;
				switch (c) {
					case '0':
					case '1':
					case '2':
					case '3':
					case '4':
					case '5':
					case '6':
					case '7':
						escape_seq += c;
						if (escape_seq.length === 3) {
							finished = true;
						} else {
							finished = false;
						}
						cont = true;
						break;

					default:
						finished = true;
						cont = false;
						break;
				}
				if (finished) {
					acc = 0;
					pow = 0;
					while (escape_seq.length > 0) {
						lsd = escape_seq.substr(-1,1);
						escape_seq = escape_seq.slice(0,-1);
						acc += lsd * Math.pow(8, pow);
						pow++;
					}
					elem += unicode_char(acc);
					escape_mode = '';
					escaped = false;
				}
				if (cont) {
					continue;
				}
				//>>>
			} else if (escape_mode === 'hex') { //<<<
				if (hex_chars.test(c)) {
					escape_seq += c;
					continue;
				} else {
					if (escape_seq.length === 0) {
						elem += 'x'+c;
						escaped = false;
						escape_mode = '';
						continue;
					}
					if (escape_seq.length > 2) {
						escape_seq = escape_seq.substr(-2, 2);
					}
				}
				elem += unicode_char('0x'+escape_seq);
				escape_mode = '';
				escaped = false;
				//>>>
			} else if (escape_mode === 'unicode') { //<<<
				finished = false;
				cont = false;

				if (hex_chars.test(c)) {
					escape_seq += c;
					if (escape_seq.length === 4) {
						finished = true;
					} else {
						finished = false;
					}
					cont = true;
				} else {
					finished = true;
					cont = false;
				}

				if (finished) {
					if (escape_seq.length === 0) {
						elem += 'u';
					} else {
						while (escape_seq.length < 4) {
							escape_seq = '0'+escape_seq;
						}
						/*jslint evil: true */
						elem += eval('"\\u'+escape_seq+'"');
						/*jslint evil: false */
						escape_seq = '';
					}
					escape_mode = '';
					escaped = false;
				}

				if (cont) {
					continue;
				}
				//>>>
			} else {
				throw new Error('Error in escape sequence parser state: invalid state "'+escape_mode+'"');
			}
		}
		//>>>
		if (braced) { // continues <<<
			if (braceescape) {
				elem += '\\'+c;
				braceescape = false;
				continue;
			}
			switch (c) {
				case '{':
					elem += c;
					bracedepth++;
					break;
				case '}':
					bracedepth--;
					if (bracedepth === 0) {
						braced = false;
						needspace = true;
						in_elem = false;
						parts.push(elem);
						elem = '';
					} else {
						elem += c;
					}
					break;
				case '\\':
					braceescape = true;
					break;
				default:
					elem += c;
			}
			continue;
		}
		//>>>
		if (quoted) { // continues <<<
			if (c === '"') {
				quoted = false;
				in_elem = false;
				parts.push(elem);
				elem = '';
				needspace = false;
			} else if (c === '\\') {
				escaped = true;
			} else {
				elem += c;
			}
			continue;
		}
		//>>>
		if (whitespace.test(c)) { // continues <<<
			parts.push(elem);
			elem = '';
			in_elem = false;
			continue;
		}
		//>>>
		if (c === '\\') { // continues <<<
			escaped = true;
			continue;
		}
		//>>>

		elem += c;
	}

	if (braced) { //<<<
		throw new IncompleteError('Open brace in string (from offset '+braceofs+')', 'brace');
	}
	//>>>
	if (quoted) { //<<<
		throw new IncompleteError('Open quote in string (from offset '+quoteofs+')', 'quote');
	}
	//>>>
	if (escaped) { //<<<
		switch (escape_mode) {
			case '':
				elem += '\\';
				parts.push(elem);
				in_elem = false;
				break;

			case 'octal':
				acc = 0;
				pow = 0;
				while (escape_seq.length > 0) {
					lsd = escape_seq.substr(-1,1);
					escape_seq = escape_seq.slice(0,-1);
					acc += lsd * Math.pow(8, pow);
					pow++;
				}
				elem += unicode_char(acc);
				escape_mode = '';
				escaped = false;
				break;

			case 'hex':
				if (escape_seq.length === 0) {
					elem += 'x';
				} else {
					if (escape_seq.length > 2) {
						escape_seq = escape_seq.substr(-2, 2);
					}
					elem += unicode_char('0x'+escape_seq);
				}
				escape_mode = '';
				escaped = false;
				break;

			case 'unicode':
				if (escape_seq.length === 0) {
					elem += 'u';
				} else {
					while (escape_seq.length < 4) {
						escape_seq = '0'+escape_seq;
					}
					/*jslint evil: true */
					elem += eval('"\\u'+escape_seq+'"');
					/*jslint evil: false */
				}
				escape_mode = '';
				escaped = false;
				break;

			default:
				throw new Error('Error in escape sequence parser state: invalid state "'+escape_mode+'"');
				//break;
		}
	}
	//>>>
	if (in_elem) { //<<<
		parts.push(elem);
		elem = '';
	}
	//>>>

	return parts;
}

//>>>
function serialize_tcl_list(arr) { //<<<
	// for now...
	var i, staged, elem;
	staged = [];
	for (i=0; i<arr.length; i++) {
		elem = String(arr[i]);
		if (
			elem.length > 0 &&
			problem_chars.test(elem) === false
		) {
			if (elem.indexOf('\\') === -1) {
				staged.push(elem);
			} else {
				// Replace all \ with \\
				staged.push(elem.replace(/\\/g, '\\\\'));	// WARNING: flags are a spidermonkey extension
			}
		} else {
			if (
				elem.indexOf('}') === -1 &&
				elem.indexOf('{') === -1 &&
				elem.charAt(elem.length-1) !== '\\') {
				staged.push('{'+elem+'}');
			} else {
				// Replace all <special> with \<special>
				elem = elem.replace(/\\| |"|\[|\]|\}|\{|\$|;/g, '\\$&');	// WARNING: flags are a spidermonkey extension
				elem = elem.replace(/\n/g, '\\n');	// WARNING: flags are a spidermonkey extension
				elem = elem.replace(/\r/g, '\\r');	// WARNING: flags are a spidermonkey extension
				elem = elem.replace(/\f/g, '\\f');	// WARNING: flags are a spidermonkey extension
				elem = elem.replace(/\t/g, '\\t');	// WARNING: flags are a spidermonkey extension
				//elem = elem.replace('/'+String.fromCharCode(0xb)+'/g', '\\v');	// WARNING: flags are a spidermonkey extension
				elem = elem.replace(/\v/g, '\\v');	// WARNING: flags are a spidermonkey extension
				staged.push(elem);
			}
		}
	}
	return staged.join(' ');
}

//>>>
function array2dict(arr) { //<<<
	var build, i;
	build = {};

	for (i=0; i<arr.length; i+=2) {
		build[arr[i]] = arr[i+1];
	}

	return build;
}

//>>>
function list2dict(list) { //<<<
	return array2dict(parse_tcl_list(list));
}

//>>>
function dict2list(dict) { //<<<
	var member, arr;
	arr = [];
	for (member in dict) {
		if (dict.hasOwnProperty(member)) {
			arr.push(member);
			arr.push(dict[member]);
		}
	}
	return serialize_tcl_list(arr);
}

//>>>

function quote_elem(elem) { //<<<
	elem = String(elem);
	if (
		elem.length > 0 &&
		problem_chars.test(elem) === false
	) {
		if (elem.indexOf('\\') === -1) {
			return elem;
		} else {
			// Replace all \ with \\
			return elem.replace(/\\/g, '\\\\');	// WARNING: flags are a spidermonkey extension
		}
	} else {
		if (
			elem.indexOf('}') === -1 &&
			elem.indexOf('{') === -1 &&
			elem.charAt(elem.length-1) !== '\\') {
			return '{'+elem+'}';
		} else {
			// Replace all <special> with \<special>
			elem = elem.replace(/\\| |"|\[|\]|\}|\{|\$|;/g, '\\$&');	// WARNING: flags are a spidermonkey extension
			elem = elem.replace(/\n/g, '\\n');	// WARNING: flags are a spidermonkey extension
			elem = elem.replace(/\r/g, '\\r');	// WARNING: flags are a spidermonkey extension
			elem = elem.replace(/\f/g, '\\f');	// WARNING: flags are a spidermonkey extension
			elem = elem.replace(/\t/g, '\\t');	// WARNING: flags are a spidermonkey extension
			//elem = elem.replace('/'+String.fromCharCode(0xb)+'/g', '\\v');	// WARNING: flags are a spidermonkey extension
			elem = elem.replace(/\v/g, '\\v');	// WARNING: flags are a spidermonkey extension
			return elem;
		}
	}
}

//>>>
function to_tcl(from) { //<<<
	var i, e, staged;

	switch (typeof from) {
		case 'function':
		case 'object':
			if (from instanceof Array) {
				staged = [];
				for (i=0; i<from.length; i++) {
					staged.push(quote_elem(to_tcl(from[i])));
				}
				return staged.join(' ');
			} else if (from instanceof String) {
				return from;
			} else if (from instanceof Date) {
				return Math.floor(from.getTime()/1000);
			} else if (from instanceof types.TclObject) {
				return from.GetString();
			} else {
				// hopefully a generic object or instance of Function
				staged = [];
				for (e in from) {
					if (from.hasOwnProperty(e)) {
						staged.push(quote_elem(e));
						staged.push(quote_elem(to_tcl(from[e])));
					}
				}
				return staged.join(' ');
			}
			break;
		case 'number':
			return String(from);
		case 'string':
			return from;
			break;

		default:
			console.error('Cannot convert type: ', typeof from);
			break;
	}
}

//>>>
function complete(str) { //<<<
	try {
		parse_tcl_list(str);
	} catch(err) {
		if (err instanceof IncompleteError) {
			return false;
		} else if (err instanceof ParseError) {
			return false;
		} else {
			throw err;
		}
	}
	return true;
}

//>>>
function bool(str) { //<<<
	var normstr = str.toLowerCase(), i, asnum = utils.to_number(normstr);
	if (!isNaN(asnum)) {
		return asnum !== 0;
	}

	if (normstr === 'o') {throw new Error('Invalid boolean value "'+str+'"');}
	for (i=0; i<true_values.length; i++) {
		if (true_values[i].substr(0, normstr.length) === normstr) {
			return true;
		}
	}
	for (i=0; i<false_values.length; i++) {
		if (false_values[i].substr(0, normstr.length) === normstr) {
			return false;
		}
	}
	throw new Error('invalid boolean value "'+str+'"');
}

//>>>

return {
	list2array:			parse_tcl_list,
	parse_tcl_list:		parse_tcl_list,
	array2list:			serialize_tcl_list,
	serialize_tcl_list:	serialize_tcl_list,
	array2dict:			array2dict,
	list2dict:			list2dict,
	dict2list:			dict2list,
	to_tcl:				to_tcl,
	complete:			complete,
	bool:				bool
};

});

// vim: ft=javascript foldmethod=marker foldmarker=<<<,>>> ts=4 shiftwidth=4
