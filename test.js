require([
	'tcl/parse_script',
	'dojo/dom-construct',
	'dojo/query'
], function(
	parse_script,
	domConstruct,
	query
) {
	function show_script(commands, node) {
		var i, j, k, command, first, word, token;
		for (i=0; i<commands.length; i++) {
			command = commands[i];
			first = true;
			for (j=0; j<command.length; j++) {
				word = command[j];
				for (k=0; k<word.length; k++) {
					token = word[k];
					if (token[0] === 'SCRIPT') {
						show_script(token[1], node);
					} else {
						if (token[0] === 'TOK' && first) {
							domConstruct.create('span', {
								className: 'tok tok_'+token[0]+' tok_commandname',
								innerHTML: token[1]
							}, node);
							first = false;
						} else {
							domConstruct.create('span', {
								className: 'tok tok_'+token[0],
								innerHTML: token[1]
							}, node);
						}
					}
				}
			}
		}
	}
	function run(script) {
		var commands = parse_script(script), node;
		domConstruct.create('pre', {
			innerHTML: commands
		}, 'output');
		node = domConstruct.create('pre', {}, 'output');
		console.log('commands[0]:', commands[1]);
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
		run('set a(foo) [get\\ string; list \\u306f]\nputs "($a(foo))"');
	});
});
