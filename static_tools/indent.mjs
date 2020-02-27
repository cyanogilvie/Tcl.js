#!/usr/bin/env node

import * as parser			from '../es6/parser.js';
import * as parser_utils	from '../es6/parser_utils.js';
import indent				from './indent_code.mjs';

var stdin = process.openStdin(), source = '';

stdin.on('data', function(chunk){
	source += chunk;
});

stdin.on('end', function(){
	try {
		process.stdout.write(
			parser_utils.reconstitute(
				indent(
					parser.parse_script(source)
				)[1]
			)
		);
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error('Parse error:\n'+e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Unhandled error: '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
});

// vim: ft=javascript
