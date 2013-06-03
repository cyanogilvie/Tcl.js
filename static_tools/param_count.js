#!/usr/bin/env node

var requirejs = require('requirejs');
requirejs.config({
	baseUrl: __dirname+'/..',
	paths: {
		tcl:		'amd'
	},
	nodeRequire: require
});

requirejs([
	'tcl/parser',
	'tcl/parser_utils'
], function(
	parser,
	parser_utils
){
'use strict';

var stdin = process.openStdin(), source = '';

stdin.on('data', function(chunk){
	source += chunk;
});
stdin.on('end', function(){
	var parsed = parser.parse_script(source)[1];
	if (parsed.length !== 1) {
		console.error('Expected 1 command, got '+parsed.length);
		process.exit(1);
	}
	console.log(parsed[0].length-1);
});
});
