/*jshint eqnull:true */

import * as parser			from './tcl/parser.js';
import * as parser_utils	from './tcl/parser_utils.js';
import * as dom				from './dom.js';
import time					from './time.js';

var marked_up_parent,
	tokname = parser_utils.tokname,
	dynStyleNode = dom.create('style', {type: 'text/css'}, dom.head());

function parse_script() {
	var parsed,
		script_str = dom.byId('input_script').value,
		deep = dom.byId('deep_parse').checked;

	try {
		parsed = time(
			deep ?
				function(){ return parser_utils.deep_parse(parser.parse_script(script_str), {
					oncommand: function(cmd_text, command) {
						//console.warn('Saw command "'+cmd_text+'", at ofs: '+parser_utils.word_start(parser_utils.real_words(command)[0]))
					}
				}); } :
				function(){ return parser.parse_script(script_str); },
			function(elapsed){
				dom.innerText('parse_feedback',
					'Time to parse script: '+Math.round(elapsed)+' µs');
			}
		);
	} catch(e) {
		if (e instanceof parser.ParseError) {
			var script_frag = script_str.substr(e.char), msg, line, ofs, linestart;
			line = script_str.substr(0, e.char).replace(/[^\n]+/g, '').length+1;
			linestart = Math.max(0, script_str.lastIndexOf('\n', e.char));
			ofs = e.char - linestart;
			if (script_frag.length > 40) {
				script_frag = script_frag.substr(0, 37)+'...';
			}
			msg = 'Error parsing script: '+e.message+'\n    at line '+line+', character '+ofs+': '+script_frag;
			alert(msg);
		} else {
			throw e;
		}
	} finally {
		display_script_tokens(parsed);
		return parsed;
	}
}

function display_token(token, parent) {
	var i, j, k, type = token[0], node, subnode, commands, command, word,
		cNode, wNode, tNode, attribs = {};

	switch (type) {
		case parser.SCRIPTARG:
		case parser.SCRIPT:
			node = dom.create('div', {}, parent, [
				'[',
				tokname(type),
				', '
			]);
			subnode = dom.create('div', {}, node);
			if (type === parser.SCRIPTARG) {
				token = token[2];
			}
			commands = token[1];
			for (i=0; i<commands.length; i++) {
				command = commands[i];
				if (parser_utils.real_words(command).length > 0) {
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
					tNode = dom.create('div', {style: {marginLeft: '2em'}}, wNode);
					for (k=0; k<word.length; k++) {
						display_token(word[k], tNode);
					}
					if (j === 0) {
						marked_up_parent.pop();
					}
				}
				if (parser_utils.real_words(command).length > 0) {
					marked_up_parent.pop();
				}
			}
			dom.appendText(node, [', ',
				markup_tok_element(token[2]), ', ',
				markup_tok_element(token[3]), ']'
			]);
			break;

		case parser.INDEX:
			node = dom.create('div', {}, parent, '['+tokname(type)+', ');
			push_marked_up_parent({className: 'tok_INDEX'});
			subnode = dom.create('div', {style: {marginLeft: '2em'}}, node);
			for (i=0; i<token[1].length; i++) {
				display_token(token[1][i], subnode);
			}
			marked_up_parent.pop();
			dom.appendText(node, [', ',
				markup_tok_element(token[2]), ', ',
				markup_tok_element(token[3]), ']'
			]);
			break;

		case parser.EXPRARG:
			node = dom.create('div', {}, parent, '['+tokname(type)+', <expr toks>, ');
			subnode = dom.create('div', {style: {marginLeft: '2em'}}, node);
			for (i=0; i<token[2].length; i++) {
				display_expr_token(token[2][i], subnode);
			}
			dom.appendText(node, [', ',
				markup_tok_element(token[3]), ']'
			]);
			break;

		case parser.SUBSTARG:
			node = dom.create('div', {}, parent, '['+tokname(type)+', <subst toks>, ');
			subnode = dom.create('div', {style: {marginLeft: '2em'}}, node);
			for (i=0; i<token[2].length; i++) {
				display_token(token[2][i], subnode);
			}
			dom.appendText(node, [', ',
				markup_tok_element(token[3]), ']'
			]);
			break;

		case parser.LISTARG:
			node = dom.create('div', {}, parent, '['+tokname(type)+', ');
			subnode = dom.create('div', {style: {marginLeft: '2em'}}, node);
			for (i=0; i<token[2].length; i++)
				for (j=0; j<token[2][i].length; j++)
					display_token(token[2][i][j], subnode);
			dom.appendText(node, [', ',
				markup_tok_element(token[3]), ']'
			]);
			break;

		case parser.COMMENT:
		case parser.SYNTAX:
		case parser.SPACE:
		case parser.END:
			attribs = {className: 'noise'};
			// Falls through
		case parser.TEXT:
		case parser.VAR:
		case parser.ARRAY:
		case parser.EXPAND:
		case parser.ESCAPE:
			node = dom.create('div', attribs, parent, [
				'['+tokname(type)+', ',
				markup_tok_element(token[1]), ', ',
				markup_tok_element(token[2]), ', ',
				markup_tok_element(token[3]), ']'
			]);
			dom.create('span', {className: 'tok tok_'+tokname(type)}, marked_up_parent[marked_up_parent.length-1], token[1]);
			break;

		default:
			console.warn('Unhandled token type: '+type+', "'+parser[type]+'"');
	}
	if (token.meta !== undefined) {
		dom.appendText(node, ['.meta = ', JSON.stringify(token.meta)]);
	}
}

function display_expr_token(token, parent) {
	var markup_node = marked_up_parent[marked_up_parent.length-1], opNode;

	switch (token[0]) {
		case parser.OPERAND: operand(); break;
		case parser.OPERATOR: operator(); break;
		case parser.SPACE:
		case parser.LPAREN:
		case parser.RPAREN:
		case parser.SYNTAX: syntax(); break;
		default:
			throw new Error('Unexpected expr token type: '+token[1]+' ('+tokname(token[1])+')');
	}

	function operand() {
		var tNode, i;

		opNode = dom.create('div', {}, parent, [
			'['+tokname(token[0])+', '+
			tokname(token[1])+', ',
		]);

		switch (token[1]) {
			case parser.SCRIPT:	script(); break;
			case parser.VAR:	variable(); break;
			case parser.FLOAT:
			case parser.INTEGER:
			case parser.BOOL:	literal(); break;
			case parser.QUOTED:
			case parser.BRACED:
				tNode = dom.create('div', {style: {marginLeft: '2em'}}, parent);
				for (i=0; i<token[2].length; i++) {
					display_token(token[2][i], tNode);
				}
				break;
			default:
				/*
				MATHFUNC	= 17,
				EXPR		= 19,
				ARG			= 20,
				*/
				//debugger;
				dom.appendText(opNode, '<crep placeholder>');
				dom.create('span', {}, markup_node, token[3]);
				break;
		}

		dom.appendText(opNode, [
			', ', markup_tok_element(token[3]), ']'
		]);

		function literal() {
			dom.appendText(opNode, markup_tok_element(token[2]));
			dom.create('span', {className: 'tok tok_'+tokname(token[1])}, markup_node, token[3]);
		}

		function script() {
			display_token(token[2], dom.create('div', {style: {marginLeft: '2em'}}, opNode));
		}

		function variable() {
			if (token[2].length === 1) {
				dom.appendText(opNode,
					markup_tok_element(token[2][0])
				);
			} else {
				dom.appendText(opNode, [
					markup_tok_element(token[2][0]),
					'('
				]);
				if (typeof token[2][1] === 'string') {
					dom.appendText(opNode, markup_tok_element(token[2][1]));
				} else {
					dom.appendText(opNode, '<index placeholder>');
				}
				dom.appendText(opNode, ')');
			}
			dom.create('span', {className: 'tok tok_' + token[2].length === 1 ? 'VAR' : 'ARRAY'}, markup_node, token[3]);
		}
	}

	function operator() {
		dom.create('div', {}, parent, [
			'['+tokname(token[0])+', ',
			'precedence:', markup_tok_element(token[1]), ', ',
			'args:', markup_tok_element(token[2]), ', ',
			markup_tok_element(token[3]), ']'
		]);
		dom.create('span', {className: 'tok tok_OPERATOR'}, markup_node, token[3]);
	}

	function syntax() {
		dom.create('div', {className: 'noise'}, parent, [
			'['+tokname(token[0])+', ',
			markup_tok_element(token[1]), ', ',
			markup_tok_element(token[2]), ', ',
			markup_tok_element(token[3]), ']'
		]);
		dom.create('span', {className: 'tok tok_SYNTAX'}, marked_up_parent[marked_up_parent.length-1], token[3]);
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
		return dom.create('span', {className: 'string'}, null, "'"+parser_utils.visualize_space(any)+"'");
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
	if (parsed) {
		marked_up_parent = [marked_up_node];
		display_token(parsed, node);
	}
}

function load_script(script) {
	dom.byId('input_script').value = script;
	parse_script();
}

function configure_noise() {
	dom.innerText(dynStyleNode, dom.byId('hide_noise').checked ? '.noise {display: none;}' : '');
}

function load_script_url(url) {
	fetch(url)
		.then(response => response.text())
		.then(script => load_script(script));
}

load_script_url('./examples/example1.tcl');

dom.onclick('example1', function(){load_script_url('./examples/example1.tcl');});
dom.onclick('example2', function(){load_script_url('./examples/example2.tcl');});
dom.onclick('example3', function(){load_script_url('./examples/example3.tcl');});
dom.onclick('parse_script_button', parse_script);
dom.byId('hide_noise').onchange = configure_noise;
dom.byId('deep_parse').onchange = parse_script;
configure_noise();
