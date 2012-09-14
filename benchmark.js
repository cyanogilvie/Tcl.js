#!/usr/bin/env node

var Benchmark = require('benchmark');
var suite = new Benchmark.Suite('tcl', {
	onComplete: function(results) {
		var i;
		console.log('onComplete:');
		for (i=0; i<results.currentTarget.length; i++) {
			console.log(results.currentTarget[i].name+': '+results.currentTarget[i].hz+' / sec');
		}
	}
});

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

function report(result){
	console.log(result.currentTarget.name+': '+result.currentTarget.hz+' / sec ± '+result.currentTarget.stats.deviation);
}

requirejs([
	'tcl/interp',
	'tcl/tclobject',
	'tcl/list'
], function(
	Interp,
	tclobj,
	tcllist
){
	var interp = new Interp();
	interp.registerCommand('puts', function(args){
		interp.checkArgs(args, 1, 'string');
		console.log(args[1].toString());
	});

	/*
	suite.add('puts hello world', function(deferred){
		interp.TclEval('puts "hello, world"').then(function(res){
			deferred.resolve();
		}, function(err){
			deferred.resolve();
		});
	});
	 */

	suite.add('list parse', function(){
		tcllist.list2array('1 2 3');
	}, {onComplete: report});
	suite.add('set a b', function(deferred){
		interp.TclEval('set a b').then(function(res){
			deferred.resolve();
		}, function(err){
			deferred.resolve();
		});
	}, {defer: true, async: true, onComplete: report});

	var obj = tclobj.AsObj('set a b');
	obj.IncrRefCount();
	suite.add('preparsed set a b', function(deferred){
		interp.TclEval(obj).then(function(res){
			deferred.resolve();
		}, function(err){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});

	suite.add('expr 1 + 2', function(deferred){
		interp.TclExpr('1 + 2').then(function(res){
			deferred.resolve();
		}, function(err){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});

	var eobj = tclobj.AsObj('1 + 2');
	eobj.IncrRefCount();
	suite.add('parsed expr 1 + 2', function(deferred){
		interp.TclExpr(eobj).then(function(res){
			deferred.resolve();
		}, function(err){
			deferred.resolve();
		});
	}, {defer: true, onComplete: report});

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
