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

	interp.registerCommand('nop', function(){
		return nothing;
	});

	interp.registerCommand('nop_tclresult', function(){
		return TclOk;
	});

	interp.registerCommand('nop_literal', function(){
		return '';
	});

	interp.registerCommand('nop_async', function(c){
		return c(nothing);
	});

	interp.registerCommand('nop_checkargs', function(args){
		interp.checkArgs(args, 0, '');
		return nothing;
	});

	cmd1 = new StringObj('nop');
	cmd2 = new StringObj('nop_checkargs');
	cmd3 = new StringObj('nop_async');
	cmd4 = new StringObj('nop_tclresult');
	cmd5 = new StringObj('nop_literal');
	v1 = new StringObj('value');

	suite.add('nop command', function(){
		interp.TclEval(cmd1, function(){});
	}, {onComplete: report});
	suite.add('nop_tclresult command', function(){
		interp.TclEval(cmd4, function(){});
	}, {onComplete: report});
	suite.add('nop_async command', function(){
		interp.TclEval(cmd3, function(){});
	}, {onComplete: report});
	suite.add('nop_literal command', function(){
		interp.TclEval(cmd5, function(){});
	}, {onComplete: report});
	suite.add('nop_checkargs command', function(){
		interp.TclEval(cmd1, function(){});
	}, {onComplete: report});
	/*
	suite.add('direct set_scalar literal', function(){
		interp.set_scalar('a', 'b');
	}, {onComplete: report});
	suite.add('direct set_scalar obj', function(){
		interp.set_scalar('a', v1);
	}, {onComplete: report});
	suite.add('direct set_var (scalar) obj', function(){
		interp.set_var('a', v1);
	}, {onComplete: report});
	suite.add('direct set_var (array) obj', function(){
		interp.set_var('arr(b)', v1);
	}, {onComplete: report});
	suite.add('new StringObj', function(){
		return new StringObj('hello, world');
	}, {onComplete: report});
	suite.add('AsObj', function(){
		return tclobj.AsObj('hello, world');
	}, {onComplete: report});
	 */
	suite.add('Construct TclResult', function(){
		return new interp.TclResult(types.OK, nothing);
	}, {onComplete: report});
	suite.add('Construct TclResult, ""', function(){
		return new interp.TclResult(types.OK, '');
	}, {onComplete: report});
	suite.add('Construct TclResult, "foo"', function(){
		return new interp.TclResult(types.OK, 'foo');
	}, {onComplete: report});

	suite.run();
});
