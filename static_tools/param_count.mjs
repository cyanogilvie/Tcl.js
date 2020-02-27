#!/usr/bin/env node

import * as parser			from '../es6/parser.js';
import * as parser_utils	from '../es6/parser_utils.js';

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

// vim: ft=javascript
