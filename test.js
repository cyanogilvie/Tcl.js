/*jslint plusplus: true, white: true, nomen: true */
/*global require */

require([
	'tcl/parser',
	'tcl/interp',
	'tcl/tclobject',
	'tcl/types',
	'dojo/dom-construct',
	'dojo/query'
], function(
	parser,
	TclInterp,
	tclobj,
	types,
	domConstruct,
	query
) {
	"use strict";

	var scriptobj,
		EmptyResult = new types.TclResult(types.OK, tclobj.NewString(''));

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
			obj = tclobj.AsObj(script),
			commands = obj.GetParsedScript(), node, outputnode;

		domConstruct.create('pre', {
			innerHTML: '<h4>Raw Parse</h4>'+commands.join('\n')
		}, 'output');
		domConstruct.create('pre', {
			innerHTML: '<h4>Exec Parse</h4>'+obj.GetExecParse(interp)
		}, 'output');
		node = domConstruct.create('pre', {}, 'output');
		show_script(commands[1], node);
		outputnode = domConstruct.create('pre', {
			className: 'script_output'
		}, 'output');
		interp.registerCommand('puts', function(args){
			var message;
			interp.checkArgs(args, [1, 2], "?-nonewline? string");
			if (args.length === 2) {
				message = args[1] + '\n';
			} else {
				message = args[2];
			}
			domConstruct.create('span', {innerHTML: message}, outputnode);
		});
		interp.registerCommand('getstring', function(args, interp){
			interp.checkArgs(args, 0, '');
			return 'result of getstring';
		});
		interp.registerCommand('get string', function(args, interp){
			interp.checkArgs(args, 0, '');
			return 'result of get string';
		});
		interp.registerCommand('say_o', function(args, interp){
			interp.checkArgs(args, 0, '');
			return 'o';
		});
		interp.registerAsyncCommand('bar', function(c, args, interp){
			interp.checkArgs(args, 0, '');
			setTimeout(function(){
				c('delayed result');
			}, 2000);
		});
		interp.registerCommand('nop', function(){
			return EmptyResult;
		});
		var before, after, nowfunc;
		if (window.performance === undefined) {
			window.performance = {
				now: function(){return Date.now();}
			};
		}
		if (window.performance.now === undefined && window.performance.webkitNow !== undefined) {
			window.performance.now = window.performance.webkitNow;
		}
		before = performance.now();
		interp.TclEval(obj, function(result){
			var usec;
			after = performance.now();
			usec = (after - before) * 1000;
			domConstruct.create('span', {className: 'timing', innerHTML: usec+' microseconds\n'}, outputnode);
			if (result.code === types.OK) {
				console.log('Got ok: ', result, ' string concat: "'+result+'", '+usec+' microseconds');
				domConstruct.create('span', {className: 'tclresult', innerHTML: result.result+'\n'}, outputnode);
			} else {
				console.log('Got error: ', result, ': "'+result.result+'"');
				domConstruct.create('span', {className: 'tclerror', innerHTML: result.result+'\n'}, outputnode);
			}
		});
		console.log('TclEval returned');
	}

	function expr(str) {
		var obj = tclobj.AsObj(str), interp = new TclInterp();
		interp.registerCommand('get_num', function(args){
			return 43;
		});
		interp.set_var('a', 6);
		interp.set_array('b', 'x', 40);
		interp.set_array('b', 'y', 4);
		interp.set_array('b', '43', 4);
		console.log('evaluating expression: {'+str+'}');
		console.log('parser.parse_expr:', obj.GetExprParse());
		console.log('stack:', obj.GetExprStack());
		interp.TclExpr(obj, function(res){
			console.log('result:', res);
		});
		console.log('TclExpr returned');
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
	scriptobj = tclobj.AsObj('#comment 1\nset o 0;set a(fo0\\ o) [get\\ string; list \\u306f\n# comment two\n]\nputs "(hello index foo of a: $a(f[say_o]${o} o)), again: (${a(fo0 o)})"\nputs [bar]; set x {final result};');
	scriptobj.GetParsedScript();
	console.log('scriptobj tostring: ('+scriptobj.toString()+')');
	query('#test6').on('click', function(){
		run(scriptobj);
	});
	query('#test7').on('click', function(){
		run('set d {a A b B c C}; dict get $d b');
	});
	query('#test8').on('click', function(){
		run('set d {a A b B c C}; dict keys $d');
	});
	query('#test9').on('click', function(){
		run('set d {a A b B c C}; dict set d b Updated; set d');
	});
	query('#test10').on('click', function(){
		run('set d {a A b B c C}; dict merge {x X a oldA y Y c oldC} $d');
	});
	query('#test11').on('click', function(){
		run('set d [dict create a A b B c C]; dict merge {x X a oldA y Y c oldC} $d');
	});
	query('#test12').on('click', function(){
		run('puts [dict exists {a {b B} c C} a b]; puts [dict exists {a {a B} c C} a x]');
	});
	query('#test13').on('click', function(){
		//run('set a+b c; puts "hello $a+b"');
		//expr('$a+-min(3, 4)+[get_num]-$b(y)');
		//expr('10 - 5');
		//expr('$a+-min(3, 4)+[get_num]-$b([get_num]) eq "42 [get_num]"');
		expr('$a+-min(3, 4)+[get_num]-$b([get_num]) eq {42}');
		//expr('6 + -3 + 43 - 4');
		//expr('2+-min(3, 4)+[get_num]');
	});

	query('#cs1').on('click', function(){
		run('if {[getstring] eq "result of getstring"} {puts "then body"} else {puts "else body"}');
	});
	query('#cs2').on('click', function(){
		run('set acc 0; for {set i 0} {$i < 100} {incr i} {puts "loop body: $i"; if {$i % 2 == 0} continue; if {$i > 9} break; incr acc $i}; puts $acc');
	});
	query('#cs3').on('click', function(){
		run('set acc 0; set i 10; puts "i before: $i"; while {[incr i -1]} {puts "loop i: $i"; incr acc $i}; puts $acc');
	});
	query('#prof1').on('click', function(){
		run('for {set i 0} {$i < 10000} {incr i} {nop}');
	});
	query('#str1').on('click', function(){
		run('string length "hello, world"');
	});
	query('#str2').on('click', function(){
		run('string map -nocase {Foo FOO bar bAR b *b*} "hello foo baR world baz"');
		run('string map {foo FOO bar bAR b *b*} "hello foo bar world baz"');
	});
	query('#str3').on('click', function(){
		run('string trim " 	hello,\nworld\n\t "');
		run('string trim "hello,\nworld\n\t "');
		run('string trim " 	hello,\nworld"');
		run('string trim "hello,\nworld"');
		run('string trim "/hello,\nworld|" /|');
	});
	query('#str4').on('click', function(){
		run('string trimleft " 	hello,\nworld\n\t "');
		run('string trimleft "hello,\nworld\n\t "');
		run('string trimleft " 	hello,\nworld"');
		run('string trimleft "hello,\nworld"');
		run('string trimleft "/hello,\nworld|" /|');
	});
	query('#str5').on('click', function(){
		run('string trimright " 	hello,\nworld\n\t "');
		run('string trimright "hello,\nworld\n\t "');
		run('string trimright " 	hello,\nworld"');
		run('string trimright "hello,\nworld"');
		run('string trimright "/hello,\nworld|" /|');
	});
	query('#str6').on('click', function(){
		run('string tolower "hello, World"');
		run('string tolower "hello, World" 4');
		run('string tolower "hello, World" 4 4+3');
		run('string tolower "hello, World" 4 end');
		run('string tolower "hello, World" 4 end-2');
	});
	query('#str7').on('click', function(){
		run('string toupper "hello, World"');
		run('string toupper "hello, World" 4');
		run('string toupper "hello, World" 4 4+3');
		run('string toupper "hello, World" 4 end');
		run('string toupper "hello, World" 4 end-2');
	});
	query('#str8').on('click', function(){
		run('string totitle "hello, WORLD"');
		run('string totitle "hello, WORLD" 4');
		run('string totitle "hello, WORLD" 4 4+3');
		run('string totitle "hello, WORLD" 4 end');
		run('string totitle "hello, WORLD" 4 end-2');
	});
	query('#str9').on('click', function(){
		run('string bytelength "hello, world"');
		run('string bytelength "は"');
	});
});
