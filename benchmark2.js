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

	var arr = [], i;
	for (i=0; i<20; i++) {
		arr.push(i);
	}

	suite.add('loop', function(){
		var acc = 0, i;
		for (i=0; i<arr.length; i++) {
			acc += arr[i];
		}
	}, {onComplete: report});

	suite.add('empty', function(){
		'empty';
	}, {onComplete: report});

	suite.add('typeof function overhead', function(){
		!!(typeof report === "function");
	}, {onComplete: report});

	suite.add('tailcall function', function(){
		function loop(){
			var i = 0, acc = 0;

			function body(){
				var item = arr[i++];
				if (item === undefined) {
					return acc;
				}
				acc += item;
				return body;
			}

			return body;
		}
		var next = loop;
		while (typeof next === "function") {
			next = next();
		}
	}, {onComplete: report});

	suite.add('tailcall function, 1 less', function(){
		function loop(){
			var i = 0, acc = 0;

			return function body(){
				var item = arr[i++];
				acc += item;
				if (i === arr.length) {
					return acc;
				}
				return body;
			};
		}
		var next = loop;
		while (typeof next === "function") {
			next = next();
		}
	}, {onComplete: report});

	suite.add('tailcall function shift', function(){
		function loop(){
			var acc = 0, remaining = arr.slice();

			function body(){
				var item = remaining.shift();
				if (item === undefined) {
					return acc;
				}
				acc += item;
				return body;
			}

			return body;
		}
		var next = loop;
		while (typeof next === "function") {
			next = next();
		}
	}, {onComplete: report});

	suite.add('TailCall trampoline', function(){
		function loop(){
			var i=0, acc=0;

			function body(){
				var item = arr[i++];
				if (item === undefined) {
					return acc;
				}
				acc += item;
				return new TailCall(body);
			}

			return new TailCall(body);
		}

		var res = loop();
		while (res instanceof TailCall) {
			res = res.invoke();
		}
	}, {onComplete: report});

	suite.run();
});
