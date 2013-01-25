/*jshint eqnull:true */
/*global require */
require([
	'tcl/parser',
	'js/text!./examples/example1.tcl',
	'js/text!./examples/example2.tcl',
	'dom',
	'time',

	'js/domReady!'
], function(
	parser,
	example1,
	example2,
	dom,
	time
){
'use strict';

var EXPRARG = parser.EXPRARG,
	SCRIPTARG = parser.SCRIPTARG,
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
				case 'elseif':
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
		return [words.length-1, SCRIPTARG];
	},
	'lmap':		function(words){ return [words.length-1, SCRIPTARG]; },
	'for':		[1, SCRIPTARG, 2, EXPRARG, 3, SCRIPTARG, 4, SCRIPTARG],
	'while':	[1, EXPRARG, 2, SCRIPTARG],
	'proc':		[3, SCRIPTARG]
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

function last_word(words) {
	return words.length-1;
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

function deep_parse(script_tok) {
	var commands=script_tok[1], command, i, j, k, parse_info, special, txt, ofs;

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		parse_info = cmd_parse_info[get_text(command[0])];
		if (parse_info === undefined) {continue;}
		special = typeof parse_info === 'function' ?
			parse_info(command) : parse_info;
		for (j=0; j<special.length; j+=2) {
			k = special[j];
			txt = get_text(command[k], true);
			if (txt == null) {
				// word text is dynamic - comes from a variable or
				// result of a command, so we can't statically parse it
				break;
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
					// TODO
					break;
			}
		}
	}
	return script_tok;
}

function parse_script() {
	var parsed,
		script_str = dom.byId('input_script').value,
		deep = dom.byId('deep_parse').checked;

	parsed = time(
		deep ?
			function(){ return deep_parse(parser.parse_script(script_str)); } :
			function(){ return parser.parse_script(script_str); },
		function(elapsed){
			dom.innerText('parse_feedback',
				'Time to parse script: '+Math.round(elapsed)+' µs');
		}
	);
	//dom.innerText('marked_up_display', script_str);
	display_script_tokens(parsed);
	return parsed;
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

function tokname(type) {
	var name = parser.tokenname[type];
	//while (name.length < 6) {name += ' ';}
	return name;
}

function display_token(token, parent) {
	var i, j, k, type = token[0], node, subnode, commands, command, word, cNode, wNode;

	switch (type) {
		case parser.SCRIPTARG:
		case parser.SCRIPT:
			node = dom.create('div', {}, parent, [
				'[',
				tokname(type),
				', '
			]);
			subnode = dom.create('div', {}, node);
			if (type === SCRIPTARG) {
				token = token[2];
			}
			commands = token[1];
			for (i=0; i<commands.length; i++) {
				command = commands[i];
				if (real_words(command).length > 0) {
					push_marked_up_parent({className: 'command'});
				}
				cNode = dom.create('div', {style: {marginLeft: '2em'}}, subnode,
					dom.create('span', {className: 'commandMarker'}, null,
						'Command ------------------------------------')
				);
				for (j=0; j<command.length; j++) {
					if (j === 0) {
						push_marked_up_parent({className: 'tok_commandname'});
					}
					word = command[j];
					wNode = dom.create('div', {style: {marginLeft: '2em'}}, cNode,
						dom.create('span', {className: 'commandMarker'}, null,
							'Word --------------------------------')
					);
					for (k=0; k<word.length; k++) {
						display_token(word[k], dom.create('div', {style: {marginLeft: '2em'}}, wNode));
					}
					if (j === 0) {
						marked_up_parent.pop();
					}
				}
				if (real_words(command).length > 0) {
					marked_up_parent.pop();
				}
			}
			dom.appendText(node, [
				markup_tok_element(token[2]),
				', ',
				markup_tok_element(token[3]),
				']'
			]);
			break;

		case parser.INDEX:
			node = dom.create('div', {}, parent, [
				'[',
				tokname(type),
				', '
			]);
			push_marked_up_parent({className: 'tok_INDEX'});
			subnode = dom.create('div', {style: {marginLeft: '2em'}}, node);
			for (i=0; i<token[1].length; i++) {
				display_token(token[1][i], subnode);
			}
			marked_up_parent.pop();
			dom.appendText(node, [
				markup_tok_element(token[2]),
				', ',
				markup_tok_element(token[3]),
				']'
			]);
			break;

		case parser.TEXT:
		case parser.SPACE:
		case parser.VAR:
		case parser.ARRAY:
		case parser.END:
		case parser.COMMENT:
		case parser.EXPAND:
		case parser.SYNTAX:
		case parser.ESCAPE:
			dom.create('div', {}, parent, [
				'[',
				tokname(type),
				', ',
				markup_tok_element(token[1]),
				', ',
				markup_tok_element(token[2]),
				', ',
				markup_tok_element(token[3]),
				']'
			]);
			dom.create('span', {className: 'tok tok_'+tokname(type)}, marked_up_parent[marked_up_parent.length-1], token[1]);
			break;

		default:
			console.warn('Unhandled token type: '+type+', "'+parser[type]+'"');
	}
}

function push_marked_up_parent(attribs) {
	var old = marked_up_parent[marked_up_parent.length-1];
	marked_up_parent.push(dom.create('span', attribs, old));
}

function markup_tok_element(any) {
	if (any == null) {
		return dom.create('span', {className: 'null'}, null, 'null');
	}
	if (typeof any === 'string') {
		return dom.create('span', {className: 'string'}, null, "'"+visualize_space(any)+"'");
	}
	if (typeof any === 'number') {
		return dom.create('span', {className: 'number'}, null, String(any));
	}
	throw new Error('Don\'t know how to pretty-print element');
}

function display_script_tokens(parsed) {
	var node = dom.byId('tokens_display'),
		marked_up_node = dom.byId('marked_up_display');
	dom.empty(node);
	dom.empty(marked_up_node);
	marked_up_parent = [marked_up_node];
	display_token(parsed, node);
}

function load_script(script) {
	dom.byId('input_script').value = script;
	parse_script();
}

//load_script(example1);

dom.onclick('example1', function(){load_script(example1);});
dom.onclick('example2', function(){load_script(example2);});
dom.onclick('parse_script_button', parse_script);
});
