#!/usr/bin/env node
/*jslint white: true, sloppy: true, plusplus: true */

var Benchmark = require('benchmark');
var suite = new Benchmark.Suite('tcl', {});

var requirejs = require('requirejs');
requirejs.config({
	baseUrl: '/Users/cyan/git/js',
	paths: {
		tcl:		'tcl/amd',
		sop:		'tcl/amd',
		cfcrypto:	'crypto/src/amd',
		webtoolkit:	'3rd_party/webtoolkit',
		ds:			'datasource/amd',
		cflib:		'cflib/amd'
	},
	nodeRequire: require
});

requirejs([
	'tcl/interp',
	'tcl/types',
	'tcl/objtype_string',
	'tcl/tclobject',
	'webtoolkit/sprintf'
], function(
	TclInterp,
	types,
	StringObj,
	tclobj,
	sprintf
){
	var interp = new TclInterp(), nothing = new StringObj(''), v1,
		TclOk = new interp.TclResult(types.OK, nothing);

	function report(result){
		var usec = 1000000.0/result.currentTarget.hz;
		console.log(sprintf('%27s: %15.5f / sec ± %f, usec/it: %.4f', result.currentTarget.name, result.currentTarget.hz, result.currentTarget.stats.deviation, usec));
	}

	function checkres(res) {
		if (res.code !== interp.types.OK) {
			console.error('Setup code returned error: '+res.result);
		}
	}

	interp.TclEval('proc nop1 {} {}', checkres);
	interp.TclEval('proc nop1_5 {{a {}}} {}', checkres);
	interp.TclEval('proc nop2 {a b} {}', checkres);
	interp.TclEval('proc nop3 {a {b B}} {}', checkres);
	interp.TclEval('proc nop4 args {}', checkres);

	interp.registerCommand('jsnop', function(){});

	var cmd0 = new StringObj('jsnop'),
		cmd0_5 = new StringObj('jsnop 1'),
		cmd1 = new StringObj('nop1'),
		cmd1_5 = new StringObj('nop1_5'),
		cmd1_6 = new StringObj('nop1_5 1'),
		cmd1_7 = new StringObj('set shared 1; nop1_5 $shared'),
		cmd2 = new StringObj('nop2 1 2'),
		cmd3 = new StringObj('nop3 1'),
		cmd4 = new StringObj('nop4 1 2 3'),
		myobj = new StringObj('foo'),
		set_a_b = new StringObj('set a b');

	myobj.IncrRefCount();

	/*
	suite.add('set a b global', function(){
		interp.TclEval(set_a_b, function(){});
	}, {onComplete: report});

	interp.push_callframe();
	suite.add('set a b callframe', function(){
		interp.TclEval(set_a_b, function(){});
	}, {onComplete: report});
	interp.pop_callframe();
	 */

	suite.add('callframe push&pop empty', function(){
		interp.push_callframe();
		interp.pop_callframe();
		interp.set_scalar('foo', myobj);
	}, {onComplete: report});

	/*
	suite.add('callframe push&pop with var', function(){
		interp.push_callframe();
		interp.TclEval(set_a_b, function(){});
		interp.pop_callframe();
	}, {onComplete: report});
	 */

	suite.add('cf push&pop shared obj', function(){
		interp.push_callframe();
		interp.set_scalar('foo', myobj);
		interp.pop_callframe();
	}, {onComplete: report});

	suite.add('cf push&pop unshared obj', function(){
		interp.push_callframe();
		interp.set_scalar('foo', new StringObj('bar'));
		interp.pop_callframe();
	}, {onComplete: report});


	/*
	suite.add('jsnop', function(){
		interp.TclEval(cmd0, function(){});
	}, {onComplete: report});

	suite.add('jsnop 1', function(){
		interp.TclEval(cmd0, function(){});
	}, {onComplete: report});
	 */

	suite.add('nop1', function(){
		interp.TclEval(cmd1, function(){});
	}, {onComplete: report});

	suite.add('nop1_5', function(){
		interp.TclEval(cmd1_5, function(){});
	}, {onComplete: report});

	suite.add('nop1_5 1', function(){
		interp.TclEval(cmd1_6, function(){});
	}, {onComplete: report});

	suite.add('nop1_5 $shared', function(){
		interp.TclEval(cmd1_7, function(){});
	}, {onComplete: report});

	suite.add('nop2', function(){
		interp.TclEval(cmd2, function(){});
	}, {onComplete: report});

	suite.add('nop3', function(){
		interp.TclEval(cmd3, function(){});
	}, {onComplete: report});

	suite.add('nop4', function(){
		interp.TclEval(cmd4, function(){});
	}, {onComplete: report});

	suite.run();
});
