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
	'tcl/parser_utils',
	'static_tools/indent_code'
], function(
	parser,
	parser_utils,
	indent_code
){
'use strict';

var stdin = process.openStdin(), source = '';

stdin.on('data', function(chunk){
	source += chunk;
});

stdin.on('end', function(){
	try {
		console.log(
			parser_utils.reconstitute(
				indent_code.indent(
					parser.parse_script(source)
				)[1]
			)
		);
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error('Parse error in "'+fn+'":\n'+e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Unhandled error in "'+fn+'": '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
});
});
