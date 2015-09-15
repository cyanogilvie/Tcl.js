/*jshint eqnull:true */
/*global require */
require([
	'js/text!./dsl_scripts/annotate_entries.tcl',
	'tcl/interp',

	'js/domReady!'
], function(
	dsl_script,
	Interp
){
'use strict';

var i, raw_entries, I=Interp();

raw_entries = [
	{
		id: 10,
		verified: true,
		title: "First Title",
		score: 1.0
	},
	{
		id: 11,
		verified: false,
		title: "Second Title",
		score: 1.0
	},
	{
		id: 12,
		verified: true,
		title: "Third Title",
		score: 1.0
	},
];

function render_entries(cooked_entries) {
	var i, node, list, entry, txt;

	// Conceptually similar to Tcl_GetListFromObj()
	list = cooked_entries.GetList();

	for (i=0; i<list.length; i++) {
		txt = '';
		entry = list[i].GetDict();

		// Using implicit .toString() below.  Could call entry.id.GetInt() to force conversion to an integer, for instance
		txt += 'id: ' + entry.id;
		txt += ', title: ' + entry.title;
		txt += ', score: ' + entry.score;

		// Need to use .GetBool() otherwise JS value truthiness interferes.  Also needed to normalize Tcl truthiness values: "on", "y", etc
		if (entry.verified.GetBool()) {
			txt += ' ✓ verified';
		} else {
			txt += ' ? not verified';
		}

		if (entry.hasOwnProperty('extra')) {
			txt += ', extra: ' + entry.extra;
		}

		node = $('<li>');
		node.text(txt);
		node.appendTo('#results');
	}
}

I.set_var('entries', raw_entries);
I.TclEval(dsl_script, function(result){
	switch (result.code) {
		case I.types.OK:
		case I.types.RETURN:
			render_entries(result.result);
			break;
		case I.types.ERROR:
			console.error('Error in DSL script: '+result.result);
			break;
		default:
			// Will land here if the script ends in break, continue, return -code 12, etc
			console.error('Unexpected return code from DSL script: '+result.code);
	}
});

});

