#!/usr/bin/env node

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
	'tcl/tclobject',
	'webtoolkit/sprintf',
	'tcl/list'
], function(
	Interp,
	tclobj,
	sprintf,
	tcllist
){
	function report(result){
		var usec = 1000000.0/result.currentTarget.hz;
		console.log(sprintf('%25s: %15.5f / sec ± %f, usec/it: %.4f', result.currentTarget.name, result.currentTarget.hz, result.currentTarget.stats.deviation, usec));
	}

	var interp = new Interp();
	interp.registerCommand('puts', function(args){
		interp.checkArgs(args, 1, 'string');
		console.log(args[1].toString());
	});

	/*
	suite.add('puts hello world', function(deferred){
		interp.TclEval('puts "hello, world"', function(res){
			deferred.resolve();
		});
	});
	 */

	suite.add('list parse', function(){
		tcllist.list2array('1 2 3');
	}, {onComplete: report});

	suite.add('deferred overhead', function(deferred){
		deferred.resolve();
	}, {defer: true, async: true, onComplete: report});

	suite.add('set a b', function(deferred){
		interp.TclEval('set a b', function(res){
			deferred.resolve();
		});
	}, {defer: true, async: true, onComplete: report});
	suite.add('sync set a b', function(){
		interp.TclEval('set a b', function(){});
	}, {onComplete: report});


	var obj = tclobj.AsObj('set a b');
	obj.IncrRefCount();
	suite.add('preparsed set a b', function(deferred){
		interp.TclEval(obj, function(res){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});
	suite.add('sync preparsed set a b', function(){
		interp.TclEval(obj, function(){});
	}, {onComplete: report});

	suite.add('expr 1 + 2', function(deferred){
		interp.TclExpr('1 + 2', function(res){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});
	suite.add('sync expr 1 + 2', function(){
		interp.TclExpr('1 + 2', function(){});
	}, {onComplete: report});

	var eobj = tclobj.AsObj('1 + 2');
	eobj.IncrRefCount();
	suite.add('parsed expr 1 + 2', function(deferred){
		interp.TclExpr(eobj, function(res){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});
	suite.add('sync parsed expr 1 + 2', function(){
		interp.TclExpr(eobj, function(){});
	}, {onComplete: report});

	var e2obj = tclobj.AsObj('$a+-min(3, 4)+[get_num]-$b([get_num]) eq "42 [get_num]"');
	eobj.IncrRefCount();
	interp.registerCommand('get_num', function(args){
		return 43;
	});
	interp.set_var('a', 6);
	interp.set_array('b', 'x', 40);
	interp.set_array('b', 'y', 4);
	interp.set_array('b', '43', 4);
	suite.add('parsed complex expression', function(deferred){
		interp.TclExpr(eobj, function(res){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});
	suite.add('sync parsed complex expr', function(){
		interp.TclExpr(eobj, function(){});
	}, {onComplete: report});

	var lobj = tclobj.AsObj('1 2 3');
	lobj.IncrRefCount();
	lobj.GetList();
	suite.add('llength obj', function(){
		var list = lobj.GetList();
		return list.length;
	}, {onComplete: report})

	suite.run({
		async: true
	});
});
