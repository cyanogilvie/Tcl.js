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
	'cflib/tailcall',
	'webtoolkit/sprintf'
], function(
	TailCall,
	sprintf
){
	function report(result){
		var usec = 1000000.0/result.currentTarget.hz;
		console.log(sprintf('%25s: %15.5f / sec ± %f, usec/it: %.4f', result.currentTarget.name, result.currentTarget.hz, result.currentTarget.stats.deviation, usec));
	}

	var arr = [], arr2 = [], i;
	for (i=0; i<3; i++) {
		arr.push(i);
		arr2.push(i*10);
	}
	suite.add('arr.slice() overhead', function(){
		var newarr = arr.slice();
	}, {onComplete: report});

	suite.add('for loop push', function(){
		var i, newarr = arr.slice();
		for (i=0; i<arr2.length; i++) {
			newarr.push(arr2[i]);
		}
	}, {onComplete: report});

	suite.add('array concat', function(){
		newarr = arr.concat(arr2);
	}, {onComplete: report});

	suite.add('apply push', function(){
		var newarr = arr.slice();
		newarr.push.apply(newarr, arr2);
	}, {onComplete: report});

	suite.run();
});
