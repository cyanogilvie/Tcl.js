/*jslint plusplus: true, white: true, nomen: true */
/*global require */

require([
	'tcl/parser',
	'tcl/interp',
	'tcl/promise',
	'dojo/dom-construct',
	'dojo/query'
], function(
	parser,
	TclInterp,
	Promise,
	domConstruct,
	query
) {
	"use strict";
	function show_script(commands, node) {
		var command, first, word, i, j;
		function show_tokens(tokens, tnode, isscript) {
			var k, token, classname;

			for (k=0; k<tokens.length; k++) {
				token = tokens[k];
				if (token[0] === parser.SCRIPT) {
					show_script(token[1], tnode, true);
				} else if (token[0] === parser.INDEX) {
					show_tokens(token[1], domConstruct.create('span', {
						className: 'tok_INDEX'
					}, tnode), false);
				} else {
					classname = 'tok tok_'+parser.tokenname[token[0]];
					if (isscript && token[0] === parser.TXT && first) {
						classname += ' tok_commandname';
						first = false;
					}
					domConstruct.create('span', {
						className: classname,
						innerHTML: token[1]
					}, tnode);
				}
			}
		}

		for (i=0; i<commands.length; i++) {
			command = commands[i];
			first = true;
			for (j=0; j<command.length; j++) {
				word = command[j];
				show_tokens(word, node, true);
			}
		}
	}
	function run(script) {
		var interp = new TclInterp(),
			commands = parser.parse_script(script), node, outputnode;

		domConstruct.create('pre', {
			innerHTML: commands.join('\n')
		}, 'output');
		node = domConstruct.create('pre', {}, 'output');
		show_script(commands[1], node);
		outputnode = domConstruct.create('pre', {
			className: 'script_output'
		}, 'output');
		interp.registerCommand('puts', function(args){
			var message;
			if (args.length < 2 || args.length > 3) {
				throw new interp.TclError('wrong # args: should be "puts ?-nonewline? string"',
					'TCL', 'WRONGARGS');
			}
			if (args.length === 2) {
				message = args[1] + '\n';
			} else {
				message = args[2];
			}
			domConstruct.create('span', {innerHTML: message}, outputnode);
		});
		interp.registerCommand('getstring', function(args, interp){
			if (args.length !== 1) {
				throw new interp.TclError('wrong # args: should be "'+args[0]+'"',
					'TCL', 'WRONGARGS');
			}
			return 'result of getstring';
		});
		interp.registerCommand('get string', function(args, interp){
			if (args.length !== 1) {
				throw new interp.TclError('wrong # args: should be "'+args[0]+'"',
					'TCL', 'WRONGARGS');
			}
			return 'result of get string';
		});
		interp.registerCommand('say_o', function(args, interp){
			if (args.length !== 1) {
				throw new interp.TclError('wrong # args: should be "'+args[0]+'"',
					'TCL', 'WRONGARGS');
			}
			return 'o';
		});
		interp.registerCommand('bar', function(args, interp){
			var promise = new Promise();
			if (args.length !== 1) {
				throw new interp.TclError('wrong # args: should be "'+args[0]+'"',
					'TCL', 'WRONGARGS');
			}
			setTimeout(function(){
				promise.reject('delayed result');
			}, 2000);
			return promise;
		});
		interp.TclEval(script).then(function(result){
			console.log('Got ok: ', result);
		}, function(err){
			console.log('Got error: ', err);
		});
	}
	query('#test1').on('click', function(){
		run('set a [getstring; list 2]\nputs "($a)"');
	});
	query('#test2').on('click', function(){
		run('set a [getstring; list 2]\nputs {($a)}');
	});
	query('#test3').on('click', function(){
		run('set a [get\\ string; list \\u306f]\nputs ({$a})');
	});
	query('#test4').on('click', function(){
		run('#comment 1\nset a(foo) [get\\ string; list \\u306f]\nputs "(hello index foo of a: $a(foo))"');
	});
	query('#test5').on('click', function(){
		run('#comment 1\nset a(foo) [get\\ string; list \\u306f\n# comment two\n]\nputs "(hello index foo of a: $a(foo))"');
	});
	query('#test6').on('click', function(){
		run('#comment 1\nset o 0;set a(fo0\\ o) [get\\ string; list \\u306f\n# comment two\n]\nputs "(hello index foo of a: $a(f[say_o]${o} o)), again: (${a(fo0 o)})"\nputs [bar]');
	});
});
