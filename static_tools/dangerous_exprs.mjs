#!/usr/bin/env node

import * as parser			from '../es6/parser.js';
import * as parser_utils	from '../es6/parser_utils.js';
import * as tcllist			from '../es6/list.js';
import * as fs				from './fs.mjs';

var hits = [];

fs.for_each_file(process.argv.slice(2), function(fn, err, source){
	var m, flags = {
		ignore: false
	};

	console.warn('Examining "'+fn+'"');
	if (err) {
		console.error(err);
		return;
	}

	if ((m = /#static:(.*?)\n/.exec(source))) {
		parser_utils.process_flags(m[1], flags);
	}
	if (flags.ignore) {
		console.warn('Ignoring file "'+fn+'"');
		return;
	}
	try {
		return parser_utils.deep_parse(parser.parse_script(source), {
			oncommand: function(cmd_text, command){
				var range = parser_utils.command_range(command), ofs;
				if (parser_utils.is_unbraced(cmd_text, command)) {
					ofs = parser_utils.word_start(command[0]);
					hits.push([
						fn,
						parser.find_line_no(source, ofs),
						parser.find_line_ofs(source, ofs),
						range,
						source.substr(range[0], range[1]-range[0]+1)
					]);
				}
			}
		});
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error(e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Parse error: '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
}, function(){
	console.log(tcllist.to_tcl(hits));
});

// vim: ft=javascript
