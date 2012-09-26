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

	var l = [], i, pointless = 0;
	for (i=0; i<30; i++) {
		l.push(i);
	}

	function tail_recursive(){
		var res;
		res = function sum() {
			var i = 0, acc = 0;
			return function loop(){
				var next = l[i++];
				if (next === undefined) {return acc;}
				acc += next;
				if (i % 3 === 0) {
					pointless++;
				}
				return loop;
			};
		};
		do {res = res();} while (typeof res === "function");
		return res;
	}

	function while_loop(){
		var res;
		res = function sum() {
			var i = 0, acc = 0, next;
			while (i<l.length) {
				next = l[i++];
				acc += next;
				if (i % 3 === 0) {
					pointless++;
				}
			}
			return acc;
		};
		do {res = res();} while (typeof res === "function");
		return res;
	}

	function interuptable(){
		var res;
		res = function sum() {
			var i = 0, acc = 0, next;
			return function loop(){
				while (i<l.length) {
					next = l[i++];
					acc += next;
					if (i % 3 === 0) {
						pointless++;
						return loop;
					}
				}
				return acc;
			}
		};
		do {res = res();} while (typeof res === "function");
		return res;
	}

	console.log('tail_recursive: '+tail_recursive()+', while_loop: '+while_loop()+', interuptable: '+interuptable());

	suite.add('pure tail recursive loop', function(){
		tail_recursive();
	}, {onComplete: report});
	suite.add('pure loop', function(){
		while_loop();
	}, {onComplete: report});
	suite.add('interuptable loop', function(){
		interuptable();
	}, {onComplete: report});

	suite.run();
});
