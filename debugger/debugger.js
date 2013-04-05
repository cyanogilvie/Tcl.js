/*jshint eqnull:true */
/*global require */
require([
	'tcl/parser',
	'tcl/list',
	'./dom',
	'm2/m2',
	'cflib/log',
	'dojo/on',
	'dojo/dom-class',

	'dojo/query',
	'dojo/domReady!'
], function(
	parser,
	tcllist,
	dom,
	m2,
	log,
	on,
	domClass
){
'use strict';

var EXPRARG = parser.EXPRARG,
	SCRIPTARG = parser.SCRIPTARG,
	marked_up_parent,
	m2 = new m2({host: 'localhost'}),
	debugger_jmid,
	scripts = {},
	current_script = null,
	stepping = true,
	breakpoints = {},
	depth_trigger = null,
	dynStyleNode = dom.create('style', {type: 'text/css'}, dom.head()),
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
		return [words.length-1, SCRIPTARG];
	},
	'lmap':		function(words){ return [words.length-1, SCRIPTARG]; },
	'for':		[1, SCRIPTARG, 2, EXPRARG, 3, SCRIPTARG, 4, SCRIPTARG],
	'while':	[1, EXPRARG, 2, SCRIPTARG],
	'proc':		[3, SCRIPTARG]
};

m2.signals.connected.attach_output(function(newstate){
	console.log('m2 connected: '+newstate);
});

function initialize_state(data) {
	var state = tcllist.list2dict(data);
	console.log('Initialize state: ', state);
	scripts = tcllist.list2dict(state.scripts);
}

function instead(substitute_script) {
	send('instead', substitute_script, 'Error sending instead request');
}

function start_debug(scrid, source) {
	scripts[scrid] = source;
	instead(instrument_script(source));
	step_into();
}

function scrollIntoViewMiddle(node) {
	var view = dom.byId('marked_up_display'),
		documentOffsetTop = node.offsetTop;

	view.scrollTo(0, documentOffsetTop - (view.innerHeight / 2));
}

function show_location(scrid, start, end) {
	if (current_script !== scrid) {
		load_script(scrid);
	}
	if (!stepping) return;

	console.log('show_location: '+scrid+','+start+','+end);
	dynStyleNode.innerHTML = '#cmd_'+start+'-'+end+' {outline: 1px dashed red; background: #400;}';
	dom.byId('cmd_'+start+'-'+end).scrollIntoView();
	//dom.byId('marked_up_display').scrollByLines(2);
	//scrollIntoViewMiddle(dom.byId('cmd_'+start+'-'+end));
}

function enter(scrid, start, end) {
	var key = scrid+','+start+','+end;
	if (breakpoints[key] != null) {
		stepping = true;
		depth_trigger = null;
		if (breakpoints[key] === 'oneshot') {
			delete breakpoints[key];
		}
	}
	show_location(scrid, start, end);
	if (!stepping) {
		step();
		return;
	}
	console.log('enter depth_trigger: ', depth_trigger);
	if (depth_trigger != null && depth_trigger > 0) {
		step();
		dynStyleNode.innerHTML = '';
		depth_trigger++;
		return;
	}
	//console.log('enter: '+scripts[scrid].substr(start, end-start+1));
}

function leave(scrid, start, end, code, res) {
	//console.log('leave: '+scripts[scrid].substr(start, end-start+1));
	show_location(scrid, start, end);
	console.log('leave depth_trigger: ', depth_trigger);
	if (code === '1') {
		stepping = true;
		depth_trigger = null;
		dynStyleNode.innerHTML = '#cmd_'+start+'-'+end+' {outline: 1px dashed red; background: red;}';
		alert('Script threw error: "'+res+'"');
	} else {
		step();
		dynStyleNode.innerHTML = '';
	}
	if (depth_trigger != null) {
		depth_trigger--;
	}
}

function step() {
	send('step', 'Error sending step request');
}

function pause() {
	stepping = true;
}

function run() {
	send('continue', 'Error sending continue request');
	//stepping = false;
	depth_trigger = null;
}

function step_over() {
	depth_trigger = 1;
	step();
}

function step_into() {
	depth_trigger = null;
	step();
}

function step_out() {
	depth_trigger = 2;
	step();
}

function send() {
	var args = Array.prototype.slice.call(arguments),
		errprefix = args.pop(), list = tcllist.array2list(args);
	log.notice('Sending "'+list+'"');
	m2.rsj_req(debugger_jmid[0], list, function(msg){
		if (msg.type == 'nack') {
			alert(errprefix+': '+msg.data);
		}
	});
}

function toggle_breakpoint(scrid, from, to) {
	var key = scrid+','+from+','+to, nodeid = 'cmd_'+from+'-'+to;
	console.log('toggle_breakpoint, nodeid: "'+nodeid+'"');
	if (breakpoints[key] == null) {
		console.log('Sending "set_breakpoint '+from+'"');
		send('set_breakpoint', from, 'Error setting breakpoint');
		breakpoints[key] = true;
		console.log('Adding breakpoint class to ', nodeid);
		domClass.add(nodeid, 'breakpoint');
	} else {
		send('clear_breakpoint', from, 'Error removing breakpoint');
		delete breakpoints[key];
		console.log('Removing breakpoint class from ', nodeid);
		domClass.remove(nodeid, 'breakpoint');
	}
}

function console_command(cmd) {
	dom.create('div', {className: 'question'}, dom.byId('console_result'), '> '+cmd).scrollIntoView(false);
	send('command', cmd, 'Error sending console command');
}

function command_answer(code, res) {
	dom.create('div', {className: code === '1' ? 'answer error' : 'answer'}, dom.byId('console_result'), res).scrollIntoView(false);
}

function update_state(data) {
	var i, updates = tcllist.list2array(data), k, v, details;
	console.log('Update state: ', updates);
	for (i=0; i<updates.length; i+=2) {
		k = updates[i];
		v = updates[i+1];
		details = tcllist.list2array(v);
		switch (k) {
			case 'start_debug':
				start_debug(details[0], details[1]);
				break;
			case 'sources_update':
				scripts = tcllist.list2dict(details[0]);
				break;
			case 'enter':
				enter(details[0], details[1], details[2]);
				break;
			case 'leave':
				leave(details[0], details[1], details[2], details[3], details[4]);
				break;
			case 'answer':
				command_answer(details[0], details[1]);
				break;
			case 'done':
				depth_trigger = null;
				breakpoints = {};
				stepping = true;
				dom.empty('marked_up_display');
				break;
			default:
				log.error('Unhandled state update "'+k+'"');
		}
	}
}

function debugger_cb(msg) {
	switch (msg.type) {
		case 'ack': break;
		case 'nack':
			log.error('debugger connect request failed: '+msg.data);
			alert('debugger connect request failed: '+msg.data);
			break;
		case 'pr_jm':
			debugger_jmid = [msg.seq, msg.prev_seq];
			log.notice('Connected to debugger');
			initialize_state(msg.data);
			break;
		case 'jm':
			log.notice('Got jm from debugger: "'+msg.data+'"');
			update_state(msg.data);
			break;
		case 'jm_can':
			debugger_jmid = null;
			log.notice('Disconnected from debugger');
			break;
		default:
			log.warning('Unexpected response type to debugger connect request: "'+msg.type+'"');
	}
}

function debugger_reconnect() {
	m2.req('debugger', 'connect', debugger_cb);
}

m2.svc_signal('debugger').attach_output(function(newstate){
	console.log('debugger svc available: '+newstate);
	if (newstate) {
		debugger_reconnect();
	}
});

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
					ofs = word_start(command[k]);
					command[k] = replace_static(command[k], [
						EXPRARG,
						command[k].slice(),
						parser.parse_expr(txt, ofs),
						ofs
					]);
					break;
			}
		}
	}
	return script_tok;
}

function parse_script(script_str, scrid) {
	var parsed, deep = true

	try {
		parsed =
			deep ?
				deep_parse(parser.parse_script(script_str)) :
				parser.parse_script(script_str);
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
		display_script_tokens(parsed, scrid);
		return parsed;
	}
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
				break
			default:
				script += token[1];
		}
	}
	return script;
}

function reconstitute(commands) {
	var i, j, k, script='', command, word, token;

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		for (j=0; j<command.length; j++) {
			word = command[j];
			script += reconstitute_word(word);
		}
	}

	return script;
}

function instrument(commands) {
	var i,j,k,l,m, script='', command, newcommand, word, token, outcommands=[], endtok, cmdofs, cmdendofs;

	for (i=0; i<commands.length; i++) {
		command = commands[i];
		cmdofs = null;
		for (j=0; j<command.length; j++) {
			word = command[j];
			for (k=0; k<word.length; k++) {
				token = word[k];
				if (token[0] !== parser.SPACE && token[0] !== parser.COMMENT && cmdofs == null) {
					cmdofs = token[3];
				}
				switch (token[0]) {
					case parser.SCRIPT:
						token[1] = instrument(token[1]);
						break;
					case parser.SCRIPTARG:
						token[2][1] = instrument(token[2][1]);
						break;
					case parser.EXPRARG:
						for (l=0; l<token[2].length; l++) {
							if (token[2][l][0] !== parser.OPERAND) continue;
							switch (token[2][l][1]) {
								case parser.SCRIPT:
									token[2][l][2][1] = instrument(token[2][l][2][1]);
									token[2][l][3] = reconstitute(token[2][l][2][1]);
									break;
								case parser.QUOTED:
									for (m=0; m<token[2][l][2].length; m++) {
										if (token[2][l][2][m][0] === parser.SCRIPT) {
											token[2][l][2][m][1] = instrument(token[2][l][2][m][1]);
										}
									}
									break;
							}
						}
						break;
					case parser.END:
						endtok = word.pop();
						/*
						endtok = token.slice();
						word[k] = [parser.SYNTAX, ''];
						*/
				}
				if (token[0] !== parser.END) {
					cmdendofs = token[3] + token[1].length-1;
				}
			}
		}
		if (real_words(command).length === 0) {
			outcommands.push(command);
		} else {
			newcommand = [
				[[parser.TXT, 'する']],
				[[parser.SPACE, ' '], [parser.TXT, cmdofs]],
				[[parser.SPACE, ' '], [parser.TXT, cmdendofs]],
				[[parser.SPACE, ' '], [parser.TXT, tcllist.array2list([reconstitute([command])])], endtok],
			];
			outcommands.push(newcommand);
		}
	}

	return outcommands;
}

function instrument_script(source) {
	return reconstitute(instrument(parse_script(source)[1]));
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

function push_marked_up_parent(attribs) {
	var old = marked_up_parent[marked_up_parent.length-1],
		node = dom.create('span', attribs, old);
	marked_up_parent.push(node);
	return node;
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

function display_token(token, scrid) {
	var i, j, k, type = token[0], node, subnode, commands, command, word,
		cNode, wNode, tNode, attribs = {}, from, to, commandspan, newnode, tmp;

	switch (type) {
		case parser.SCRIPTARG:
		case parser.SCRIPT:
			if (type === SCRIPTARG) {
				token = token[2];
			}
			commands = token[1];
			for (i=0; i<commands.length; i++) {
				command = commands[i];
				from = null;
				if (real_words(command).length > 0) {
					commandspan = push_marked_up_parent({className: 'command'});
				}
				for (j=0; j<command.length; j++) {
					if (j === 0) {
						push_marked_up_parent({className: 'tok_commandname'});
					}
					word = command[j];
					for (k=0; k<word.length; k++) {
						if (from == null) {
							if (word[k][0] === parser.SPACE || word[k][0] === parser.COMMENT) {
								// nasty hack to move leading SPACE and COMMENT
								// tokens out of the command span
								commandspan.parentNode.insertBefore(
										display_token(word[k], scrid),
										commandspan);
								continue;
							} else {
								from = word[k][3];
							}
						}
						if (word[k][0] !== parser.END) {
							to = word[k][3] + word[k][1].length-1;
							display_token(word[k], scrid);
						} else {
							// nasty hack to move the END token out of the
							// command span
							tmp = marked_up_parent.pop();
							display_token(word[k], scrid);
							marked_up_parent.push(tmp);
						}
					}
					if (j === 0) {
						marked_up_parent.pop();
					}
				}
				if (real_words(command).length > 0) {
					marked_up_parent.pop();
					commandspan.setAttribute('id', 'cmd_'+from+'-'+to);
					commandspan.setAttribute('data-scrid', scrid);
					commandspan.setAttribute('data-from', from);
					commandspan.setAttribute('data-to', to);
					if (breakpoints[scrid+','+from+','+to] != null) {
						domClass.add(commandspan, 'breakpoint');
					}
				}
			}
			newnode = commandspan;
			break;

		case parser.INDEX:
			push_marked_up_parent({className: 'tok_INDEX'});
			for (i=0; i<token[1].length; i++) {
				newnode = display_token(token[1][i], scrid);
			}
			marked_up_parent.pop();
			break;

		case parser.EXPRARG:
			for (i=0; i<token[2].length; i++) {
				newnode = display_expr_token(token[2][i]);
			}
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
			newnode = dom.create('span', {className: 'tok tok_'+tokname(type)}, marked_up_parent[marked_up_parent.length-1], token[1]);
			break;

		default:
			console.warn('Unhandled token type: '+type+', "'+parser[type]+'"');
	}
	return newnode;
}

function display_expr_token(token) {
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

		switch (token[1]) {
			case parser.SCRIPT:	script(); break;
			case parser.VAR:	variable(); break;
			case parser.FLOAT:
			case parser.INTEGER:
			case parser.BOOL:	literal(); break;
			case parser.QUOTED:
			case parser.BRACED:
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
				dom.create('span', {}, markup_node, token[3]);
				break;
		}

		function literal() {
			dom.create('span', {className: 'tok tok_'+tokname(token[1])}, markup_node, token[3]);
		}

		function script() {
			display_token(token[2], dom.create('div', {style: {marginLeft: '2em'}}, opNode));
		}

		function variable() {
			dom.create('span', {className: 'tok tok_' + token[2].length === 1 ? 'VAR' : 'ARRAY'}, markup_node, token[3]);
		}
	}

	function operator() {
		dom.create('span', {className: 'tok tok_OPERATOR'}, markup_node, token[3]);
	}

	function syntax() {
		dom.create('span', {className: 'tok tok_SYNTAX'}, marked_up_parent[marked_up_parent.length-1], token[3]);
	}
}

function display_script_tokens(parsed, scrid) {
	console.log('display_script_tokens:', parsed);
	var marked_up_node = dom.byId('marked_up_display');
	dom.empty(marked_up_node);
	if (parsed) {
		marked_up_parent = [marked_up_node];
		display_token(parsed, scrid);
	}
}

function load_script(scrid) {
	parse_script(scripts[scrid], scrid);
	current_script = scrid;
}

dom.onclick('continue', run);
dom.onclick('pause', pause);
dom.onclick('step_over', step_over);
dom.onclick('step_into', step_into);
dom.onclick('step_out', step_out);
dom.onclick('clear_console', function(){
	dom.empty('console_result');
});
dom.onkeydown('console_input', function(ev){
	if (ev.which === 13) {
		console_command(dom.byId('console_input').value);
		dom.byId('console_input').value = '';
	}
});

on(dom.byId('marked_up_display'), '.command:click', function(){
	toggle_breakpoint(
		this.getAttribute('data-scrid'),
		this.getAttribute('data-from'),
		this.getAttribute('data-to')
	);
});
});
