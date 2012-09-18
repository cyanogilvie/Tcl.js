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
	'tcl/utils',
	'webtoolkit/sprintf'
], function(
	utils,
	sprintf
){
	function report(result){
		var usec = 1000000.0/result.currentTarget.hz;
		console.log(sprintf('%25s: %15.5f / sec ± %f, usec/it: %.4f', result.currentTarget.name, result.currentTarget.hz, result.currentTarget.stats.deviation, usec));
	}

	var map = {
		food: 'this is food',
		foo: 'not bar',
		bar: 'not foo',
		baz: 'quux'
	}, re, str = 'These are a few metasyntactic variables: foo, the first; bar the second; and less often: baz.  food for thought?';

	re = new RegExp(utils.objkeys(map).join('|'), 'g');

	if (str.replace(re, function(match){return map[match];}) !== 'These are a few metasyntactic variables: not bar, the first; not foo the second; and less often: quux.  this is food for thought?') {
		throw new Error('regexp string map broken');
	}

	suite.add('regexp string map', function(){
		str.replace(re, function(match){return map[match];});
	}, {onComplete: report});

	suite.run();
});
