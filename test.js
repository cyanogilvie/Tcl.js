require([
	'tcl/parser',
	'dojo/dom-construct',
	'dojo/query'
], function(
	parser,
	domConstruct,
	query
) {
	function show_script(commands, node) {
		var i, j, k, command, first, word, token, classname;
		for (i=0; i<commands.length; i++) {
			command = commands[i];
			first = true;
			for (j=0; j<command.length; j++) {
				word = command[j];
				for (k=0; k<word.length; k++) {
					token = word[k];
					if (token[0] === parser.SCRIPT) {
						show_script(token[1], node);
					} else {
						classname = 'tok tok_'+parser.tokenname[token[0]];
						if (token[0] === parser.TXT && first) {
							classname += ' tok_commandname';
							first = false;
						}
						domConstruct.create('span', {
							className: classname,
							innerHTML: token[1]
						}, node);
					}
				}
			}
		}
	}
	function run(script) {
		var commands = parser.parse_script(script), node;
		domConstruct.create('pre', {
			innerHTML: commands
		}, 'output');
		node = domConstruct.create('pre', {}, 'output');
		show_script(commands[1], node);
	}
	query('#test1').on('click', function(e){
		run('set a [getstring; list 2]\nputs "($a)"');
	});
	query('#test2').on('click', function(e){
		run('set a [getstring; list 2]\nputs {($a)}');
	});
	query('#test3').on('click', function(e){
		run('set a [get\\ string; list \\u306f]\nputs {({$a})}');
	});
	query('#test4').on('click', function(e){
		run('#set a(foo) [get\\ string; list \\u306f]\nputs "(hello index foo of a: $a(foo))"');
	});
});
