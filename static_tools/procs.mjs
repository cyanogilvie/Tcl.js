#!/usr/bin/env node

import * as fs				from './fs.mjs';
import * as parser			from '../es6/parser.js';
import * as parser_utils	from '../es6/parser_utils.js';
import * as tcllist			from '../es6/list.js';

fs.for_each_file(process.argv.slice(2), function(fn, err, source){
	var m, flags = {
		ignore: false
	};
	//console.warn('Examining "'+fn+'"');
	if (err) {
		console.err(err);
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
			oncommand: function(cmd_text, command) {
				if (cmd_text === 'proc') {
					var ofs = parser_utils.word_start(command[0]);
					console.log(tcllist.to_tcl([parser_utils.get_text(command[1]), fn, parser.find_line_no(source, ofs), parser.find_line_ofs(source, ofs), parser_utils.command_range(command)]));
				}
			}
		});
	} catch(e) {
		if (e instanceof parser.ParseError) {
			console.error('Parse error in "'+fn+'":\n'+e.pretty_print(source));
			process.exit(1);
		} else {
			console.error('Parse error in "'+fn+'": '+e.message+':\n'+e.stack);
			process.exit(1);
		}
	}
});

// vim: ft=javascript
