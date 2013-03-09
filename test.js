/*jslint plusplus: true, white: true, nomen: true */
/*global require, window */

require([
	'tcl/parser',
	'tcl/interp',
	'tcl/tclobject',
	'tcl/types',
	'demos/dom'
], function(
	parser,
	TclInterp,
	tclobj,
	types,
	dom
) {
	"use strict";

	var now, scriptobj;

	if (window.performance === undefined) {
		now = function(){
			return Date.now();
		};
	} else if (window.performance.now !== undefined) {
		now = function(){return window.performance.now();}
	} else if (window.performance.webkitNow !== undefined) {
		now = function(){return window.performance.webkitNow();};
	}

	function show_script(commands, node) {
		var command, first, word, i, j;
		function show_tokens(tokens, tnode, isscript) {
			var k, token, classname;

			for (k=0; k<tokens.length; k++) {
				token = tokens[k];
				if (token[0] === parser.SCRIPT) {
					show_script(token[1], tnode, true);
				} else if (token[0] === parser.INDEX) {
					show_tokens(token[1], dom.create('span', {
						className: 'tok_INDEX'
					}, tnode), false);
				} else {
					classname = 'tok tok_'+parser.tokenname[token[0]];
					if (isscript && token[0] === parser.TEXT && first) {
						classname += ' tok_commandname';
						first = false;
					}
					dom.create('span', {
						className: classname,
						title: parser.tokenname[token[0]] + (token[2] !== undefined ? ': "'+token[2]+'"' : '')
					}, tnode, token[1]);
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

	function run(script, setup) {
		var interp = new TclInterp(),
			obj = tclobj.AsObj(script),
			commands = obj.GetParsedScript(), node, outputnode;

		if (setup) {
			setup(interp);
		}

		/*
		dom.create('pre', {
			innerHTML: '<h4>Exec Parse</h4>'+obj.GetExecParse(interp)
		}, 'output');
		 */
		node = dom.create('pre', {}, 'output');
		show_script(commands[1], node);
		outputnode = dom.create('pre', {
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
			dom.create('span', {}, outputnode, message);
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
		var before, after;
		before = now();
		interp.TclEval(obj, function(result){
			var usec;
			after = now();
			usec = (after - before) * 1000;
			dom.create('span', {className: 'timing'}, outputnode, Math.round(usec)+' microseconds per iteration\n');
			if (result.code === types.OK) {
				console.log('Got ok: ', result, ' string concat: "'+result+'", '+Math.round(usec)+' microseconds');
				dom.create('span', {className: 'tclresult'}, outputnode, result.result+'\n');
			} else {
				console.log('Got error: ', result, ': "'+result.result+'"');
				dom.create('span', {className: 'tclerror'}, outputnode, result.result+'\n');
			}
		});
		console.log('TclEval returned');
	}

	function expr(str) {
		var obj = tclobj.AsObj(str), interp = new TclInterp();
		interp.registerCommand('get_num', function(){
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

	dom.onclick('test1', function(){
		run('set a [getstring; list 2]\nputs "($a)"');
	});
	dom.onclick('test2', function(){
		run('set a [getstring; list 2]\nputs {($a)}');
	});
	dom.onclick('test3', function(){
		run('set a [get\\ string; list \\u306f]\nputs ({$a})');
	});
	dom.onclick('test4', function(){
		run('#comment 1\nset a(foo) [get\\ string; list \\u306f]\nputs "(hello index foo of a: $a(foo))"');
	});
	dom.onclick('test5', function(){
		run('#comment 1\nset a(foo) [get\\ string; list \\u306f\n# comment two\n]\nputs "(hello index foo of a: $a(foo))"');
	});
	scriptobj = tclobj.AsObj('#comment 1\nset o 0;set a(fo0\\ o) [get\\ string; list \\u306f\n# comment two\n]\nputs "(hello index foo of a: $a(f[say_o]${o} o)), again: (${a(fo0 o)})"\nputs [bar]; set x {final result};');
	scriptobj.GetParsedScript();
	console.log('scriptobj tostring: ('+scriptobj.toString()+')');
	dom.onclick('test6', function(){
		run(scriptobj);
	});
	dom.onclick('test7', function(){
		run('set d {a A b B c C}; dict get $d b');
	});
	dom.onclick('test8', function(){
		run('set d {a A b B c C}; dict keys $d');
	});
	dom.onclick('test9', function(){
		run('set d {a A b B c C}; dict set d b Updated; set d');
	});
	dom.onclick('test10', function(){
		run('set d {a A b B c C}; dict merge {x X a oldA y Y c oldC} $d');
	});
	dom.onclick('test11', function(){
		run('set d [dict create a A b B c C]; dict merge {x X a oldA y Y c oldC} $d');
	});
	dom.onclick('test12', function(){
		run('puts [dict exists {a {b B} c C} a b]; puts [dict exists {a {a B} c C} a x]');
	});
	dom.onclick('test13', function(){
		//run('set a+b c; puts "hello $a+b"');
		//expr('$a+-min(3, 4)+[get_num]-$b(y)');
		//expr('10 - 5');
		//expr('$a+-min(3, 4)+[get_num]-$b([get_num]) eq "42 [get_num]"');
		expr('$a+-min(3, 4)+[get_num]-$b([get_num]) eq {42}');
		//expr('6 + -3 + 43 - 4');
		//expr('2+-min(3, 4)+[get_num]');
	});
	dom.onclick('expr2', function(){
		expr('"2012-12-30" <= "2013-01-17"');
	});
	dom.onclick('expr3', function(){
		expr('"2013-01-17" <= "2012-12-30"');
	});

	dom.onclick('cs1', function(){
		run('if {[getstring] eq "result of getstring"} {puts "then body"} else {puts "else body"}');
	});
	dom.onclick('cs2', function(){
		run('set acc 0; for {set i 0} {$i < 100} {incr i} {puts "loop body: $i"; if {$i % 2 == 0} continue; if {$i > 9} break; incr acc $i}; puts $acc');
	});
	dom.onclick('cs3', function(){
		run('set acc 0; set i 10; puts "i before: $i"; while {[incr i -1]} {puts "loop i: $i"; incr acc $i}; puts $acc');
	});
	dom.onclick('cf1', function(){
		run('set v global; puts "v in global, before: ($v)"; proc p {v {d foo}} {puts "v in proc: ($v), d: ($d)"; set v updated}; p 1; puts "v in global, after: ($v)"');
		run('set v global; puts "v in global, before: ($v)"; proc p {v {d foo}} {puts "v in proc: ($v), d: ($d)"; set v updated}; p; puts "v in global, after: ($v)"');
		run('set v global; puts "v in global, before: ($v)"; proc p {v {d foo}} {puts "v in proc: ($v), d: ($d)"; set v updated}; p 1 2 3; puts "v in global, after: ($v)"');
		run('set v global; puts "v in global, before: ($v)"; proc p {v {d foo}} {puts "v in proc: ($v), d: ($d)"; set v updated}; p 1 2; puts "v in global, after: ($v)"');
		run('set v global; puts "v in global, before: ($v)"; proc p {v {d foo} args} {puts "v in proc: ($v), d: ($d), args: ($args)"; set v updated}; p 1 2; puts "v in global, after: ($v)"');
		run('set v global; puts "v in global, before: ($v)"; proc p {v {d foo} args} {puts "v in proc: ($v), d: ($d), args: ($args)"; set v updated}; p 1 2 3 4; puts "v in global, after: ($v)"');
	});
	dom.onclick('cf2', function(){
		//run('proc foo {a b} {return "$a-$b"}; foo 1 2; foo 3 4');
		run('proc newcmd {a b} {return "$a-$b"}; set i 0; newcmd 1 $i; incr i; newcmd 1 $i');
		run('proc newcmd {a b} {return "$a-$b"}; for {set i 0} {$i < 2} {incr i} {newcmd 1 $i}');
	});
	dom.onclick('prof1', function(){
		run('for {set i 0} {$i < 10000} {incr i} nop', function(I){
			I.registerCommand('nop', function(){});
		});
	});
	dom.onclick('prof2', function(){
		//run('proc newcmd {a b} {return "$a-$b"}');
		//run('proc newcmd {a b} {set b}');
		//run('proc newcmd {a b} {}');
		//run('for {set i 0} {$i < 10000} {incr i} {set lastres [newcmd 1 $i]}; set lastres');
		run('proc newcmd {a b} {return "$a-$b"}; for {set i 0} {$i < 10000} {incr i} {newcmd 1 $i}');
		run('proc nop args {}; for {set i 0} {$i < 10000} {incr i} nop');
		run('proc nop {} {}; for {set i 0} {$i < 10000} {incr i} nop');
		run('proc nop i {}; for {set i 0} {$i < 10000} {incr i} {nop $i}');
		run('proc nop i {}; for {set i 0} {$i < 10000} {incr i} {nop 1}');
		run('proc nop {{i {}}} {}; for {set i 0} {$i < 10000} {incr i} nop');
		run('proc nop args {}; for {set i 0} {$i < 10000} {incr i} {nop $i}');
	});
	dom.onclick('prof3', function(){
		var BoolObj = require('tcl/objtype_bool');
		run('for {set i 0} {$i < 10000} {incr i} nop', function(I){
			var trueObj = new BoolObj(true),
				falseObj = new BoolObj(false),
				trueRes = new I.TclResult(I.types.OK, trueObj),
				falseRes = new I.TclResult(I.types.OK, falseObj);

			I.registerCommand('nop', function(){});

			I.registerAsyncCommand('for', function(c, args){
				I.checkArgs(args, 4, 'start test next body');
				var start = args[1], test = args[2], next = args[3], body = args[4];
				var vn = 'i', tv = 10000;
				function t(c){
					var v, r;
					v = I.get_scalar(vn),
					r = v.GetInt() < tv;
					//return c(new I.TclResult(I.types.OK, r));
					//return c(new I.TclResult(I.types.OK, r ? trueObj : falseObj));
					return c(r ? trueRes : falseRes);
				}
				return I.exec(start, function(res){
					if (res.code !== types.OK) {return c(res);}
					return function loop(){
						return t(function(res){
							if (res.code !== types.OK) {return c(res);}
							if (!(res.result.GetBool())) {return c();}
							return I.exec(body, function(res){
								switch (res.code) {
									case types.CONTINUE:
									case types.OK:
										return I.exec(next, function(res){
											if (res.code !== types.OK) {return c(res);}
											return loop;
										});
									case types.BREAK:
										return c();
									default:
										return c(res);
								}
							});
						});
					};
				});
			});
		});
	});
	dom.onclick('prof4', function(){
		var before, after, i, outputnode;

		outputnode = dom.create('pre', {
			className: 'script_output'
		}, 'output');

		function nop(f){return f;}

		before = now();
		var f, i = 10000;
		function loop(){
			if (i-- <= 0) return;
			return nop(loop);
		}
		f = loop;
		while (typeof f === "function") {f = f();}
		after = now();

		dom.create('span', {className: 'timing'}, outputnode, (after-before)+' microseconds\n');
	});
	dom.onclick('str1', function(){
		run('string length "hello, world"');
	});
	dom.onclick('str2', function(){
		run('string map -nocase {Foo FOO bar bAR b *b*} "hello foo baR world baz"');
		run('string map {foo FOO bar bAR b *b*} "hello foo bar world baz"');
	});
	dom.onclick('str3', function(){
		run('string trim " 	hello,\nworld\n\t "');
		run('string trim "hello,\nworld\n\t "');
		run('string trim " 	hello,\nworld"');
		run('string trim "hello,\nworld"');
		run('string trim "/hello,\nworld|" /|');
	});
	dom.onclick('str4', function(){
		run('string trimleft " 	hello,\nworld\n\t "');
		run('string trimleft "hello,\nworld\n\t "');
		run('string trimleft " 	hello,\nworld"');
		run('string trimleft "hello,\nworld"');
		run('string trimleft "/hello,\nworld|" /|');
	});
	dom.onclick('str5', function(){
		run('string trimright " 	hello,\nworld\n\t "');
		run('string trimright "hello,\nworld\n\t "');
		run('string trimright " 	hello,\nworld"');
		run('string trimright "hello,\nworld"');
		run('string trimright "/hello,\nworld|" /|');
	});
	dom.onclick('str6', function(){
		run('string tolower "hello, World"');
		run('string tolower "hello, World" 4');
		run('string tolower "hello, World" 4 4+3');
		run('string tolower "hello, World" 4 end');
		run('string tolower "hello, World" 4 end-2');
	});
	dom.onclick('str7', function(){
		run('string toupper "hello, World"');
		run('string toupper "hello, World" 4');
		run('string toupper "hello, World" 4 4+3');
		run('string toupper "hello, World" 4 end');
		run('string toupper "hello, World" 4 end-2');
	});
	dom.onclick('str8', function(){
		run('string totitle "hello, WORLD"');
		run('string totitle "hello, WORLD" 4');
		run('string totitle "hello, WORLD" 4 4+3');
		run('string totitle "hello, WORLD" 4 end');
		run('string totitle "hello, WORLD" 4 end-2');
	});
	dom.onclick('str9', function(){
		run('string bytelength "hello, world"');
		run('string bytelength "は"');
	});
	dom.onclick('str10', function(){
		run('string first bar "foo bar baz"');
		run('string first bat "foo bar baz"');
		run('string first bar "foo bar baz" 4');
		run('string first bar "foo bar baz" 6');
	});
	dom.onclick('str11', function(){
		run('string last bar "foo bar baz"');
		run('string last bat "foo bar baz"');
		run('string last bar "foo bar baz" 4');
		run('string last bar "foo bar baz" 2');
		run('string last bar "foo bar baz" end-2');
	});
	dom.onclick('str12', function(){
		run('string index "hello, world" 0');
		run('string index "hello, world" 4');
		run('string index "hello, world" end');
		run('string index "hello, world" end-1');
	});
	dom.onclick('str13', function(){
		run('string range "hello, world" -1 100');
		run('string range "hello, world" 4 end');
		run('string range "hello, world" 0 end-1');
		run('string range "hello, world" 0 0+5');
	});
	dom.onclick('str14', function(){
		run('string reverse "hello, world"');
	});
	dom.onclick('str15', function(){
		run('string repeat "xy" 4');
		run('string repeat "xy" -1');
	});
	dom.onclick('str16', function(){
		run('string replace "hello, world" 0 end');
		run('string replace "hello, world" 0 end NEW');
		run('string replace "hello, world" -1 100 NEW');
		run('string replace "hello, world" 1 100 NEW');
		run('string replace "hello, world" 1 5 NEW');
		run('string replace "hello, world" 1 end-2 NEW');
		run('string replace "hello, world" end-8 end-2 NEW');
	});
	dom.onclick('str17', function(){
		run('string match *lo,* "hello, world"');
		run('string match *lo!* "hello, world"');
		run('string match *lo, "hello, world"');
		run('string match lo,* "hello, world"');
		run('string match lo, "hello, world"');
		run('string match {*[lx]lo? *} "hello, world"');
		run('string match {*[ax]lo? *} "hello, world"');
		run('string match -nocase *lo,* "HELLO, WORLD"');
		run('string match -nocase *lo!* "HELLO, WORLD"');
		run('string match -nocase *lo, "HELLO, WORLD"');
		run('string match -nocase lo,* "HELLO, WORLD"');
		run('string match -nocase lo, "HELLO, WORLD"');
		run('string match -nocase {*[lx]lo? *} "HELLO, WORLD"');
		run('string match -nocase {*[ax]lo? *} "HELLO, WORLD"');
	});
	dom.onclick('str18', function(){
		run('string wordstart "foo bar baz" 3');
		run('string wordstart "foo bar baz" 2');
		run('string wordstart "foo bar baz" 4');
		run('string wordstart "foo bar baz" 0');
		run('string wordstart "foo bar baz" -2');
		run('string wordstart "foo bar baz" 20');
	});
	dom.onclick('str19', function(){
		run('string wordend "foo bar baz" -2');
		run('string wordend "foo bar baz" 3');
		run('string wordend "foo bar baz" 2');
		run('string wordend "foo bar baz" 4');
		run('string wordend "foo bar baz" 10');
		run('string wordend "foo bar baz" 20');
	});
	dom.onclick('str20', function(){
		run('string compare foo bar');
		run('string compare foo foo');
		run('string compare bar foo');
	});
	dom.onclick('str21', function(){
		run('string equal foo bar');
		run('string equal foo foo');
		run('string equal foo Foo');
		run('string equal -nocase foo Foo');
		run('string equal -length 2 foo fox');
		run('string equal -length 3 foo fox');
	});
	dom.onclick('str22', function(){
		run('string is alnum ""');
		run('string is alnum -strict ""');
		run('string is alnum "foobar"');
		run('string is alnum "foo,bar"');
		run('string is alnum "foo42bar"');
		run('string is alnum "foo bar"');
		run('string is alnum "fooBar"');
		run('set fv notset; string is alnum -failindex fv ""; set fv');
		run('set fv notset; string is alnum -failindex fv -strict ""; set fv');
		run('set fv notset; string is alnum -failindex fv "foobar"; set fv');
		run('set fv notset; string is alnum -failindex fv "foo,bar"; set fv');
		run('set fv notset; string is alnum -failindex fv "foo42bar"; set fv');
		run('set fv notset; string is alnum -failindex fv "foo bar"; set fv');
		run('set fv notset; string is alnum -failindex fv "fooBar"; set fv');
	});
	dom.onclick('cmdredef1', function(){
		run('proc foo {} {return initial}; puts "1: [foo]"; proc foo {} {return changed}; puts "2: [foo]"');
	});
});
