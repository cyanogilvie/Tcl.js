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
	var interp = new TclInterp(), nothing = new StringObj(''), cmd1, cmd2, v1,
		TclOk = new interp.TclResult(types.OK, nothing);

	function report(result){
		var usec = 1000000.0/result.currentTarget.hz;
		console.log(sprintf('%27s: %15.5f / sec ± %f, usec/it: %.4f', result.currentTarget.name, result.currentTarget.hz, result.currentTarget.stats.deviation, usec));
	}

	cmd1 = new StringObj('string length "hello, world"');
	cmd2 = new StringObj('string map {foo FOO bar bAR b *b*} "hello foo bar world baz"');
	cmd3 = new StringObj('string trim " 	hello, world\n\t "');
	cmd4 = new StringObj('string trim "/hello, world||" /|');
	cmd5 = new StringObj('string match {*[ax]lo? *} "hello, world"');

	suite.add('string length', function(){
		interp.TclEval(cmd1, function(){});
	}, {onComplete: report});

	suite.add('string map', function(){
		interp.TclEval(cmd2, function(){});
	}, {onComplete: report});

	suite.add('string trim', function(){
		interp.TclEval(cmd3, function(){});
	}, {onComplete: report});

	suite.add('string trim specific chars', function(){
		interp.TclEval(cmd4, function(){});
	}, {onComplete: report});

	suite.add('string match', function(){
		interp.TclEval(cmd5, function(){});
	}, {onComplete: report});

	suite.run();
});
