#!/usr/bin/env cfkit8.6

apply {{} {
	set map {
		food	"this is food"
		foo		"not bar"
		bar		"not foo"
		baz		"quux"
	}
	set str	"These are a few metasyntactic variables: foo, the first; bar the second; and less often: baz.  food for thought?"
	if {[string map $map $str] ne "These are a few metasyntactic variables: not bar, the first; not foo the second; and less often: quux.  this is food for thought?"} {
		error "string map broken"
	}
	puts [time {string map $map $str} 1000000]
}}
