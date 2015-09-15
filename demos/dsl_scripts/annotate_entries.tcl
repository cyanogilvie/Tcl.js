# Variable "entries" is set to a list of dicts

return [lmap in $entries {
	incr i

	set out	[dict merge $in [list \
		score		[expr {[dict get $in score] + rand()*4.0}] \
		extra		"Added by Tcl DSL script, i: $i" \
	]]

	if {[dict get $in verified]} {
		dict set out score	[expr {[dict get $out score] + 5}]
	}

	set out
}]
