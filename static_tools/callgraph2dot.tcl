#!/usr/bin/env cfkit8.6
# vim: ft=tcl foldmethod=marker foldmarker=<<<,>>> ts=4 shiftwidth=4

if {[file system [info script]] eq "native"} {
	package require platform

	foreach platform [platform::patterns [platform::identify]] {
		set tm_path		[file join $env(HOME) .tbuild repo tm $platform]
		set pkg_path	[file join $env(HOME) .tbuild repo pkg $platform]
		if {[file exists $tm_path]} {
			tcl::tm::path add $tm_path
		}
		if {[file exists $pkg_path]} {
			lappend auto_path $pkg_path
		}
	}
}

package require Tcl 8.6
package require cflib

proc readfile fn {
	set h	[open $fn r]
	try {read $h} finally {close $h}
}

cflib::config create cfg $argv {
	variable ignore_tree	{rl_page}
}

lassign [cfg rest] cmd callgraph_fn

proc callgraph_fn {} {
	global callgraph_fn

	if {$callgraph_fn ne ""} {
		return $callgraphc_fn
	}

	set dir	[pwd]
	while {$dir ne "/"} {
		set candidate	[file join $dir callgraph]
		if {[file readable $candidate]} {
			return $candidate
		}
		set dir	[file dirname $dir]
	}
	error "No callgraph lookup file found"
}

set callgraph	[readfile [callgraph_fn]]

if {![dict exists $callgraph $cmd]} {
	puts stderr "No callers found for \"$cmd\""
	exit 1
}


proc q s {string map {\\ \\\\ \" \\" \n \\n} $s}

proc compile_attribs attribs {
	set out	[join [lmap {k v} $attribs {
		format %s="%s" $k [q $v]
	}] {, }]

	if {$out eq ""} {
		return ""
	}
	return " \[$out\]"
}

set node_info_output	{}
set visited				{}
proc nodes_for cmd {
	global node_info_output callgraph visited

	if {$cmd in [cfg @ignore_tree]} {
		return ""
	}
	if {![dict exists $callgraph $cmd]} {
		puts stderr "No callers found for \"$cmd\""
		return ""
	}

	set out	""

	dict for {caller callrecs} [dict get $callgraph $cmd] {
		foreach callrec $callrecs {
			lassign $callrec fn f_line f_char t_line t_char
			if {$caller eq ""} {
				set caller_node	[q "_GLOBAL_\n[file tail $fn]"]
			} else {
				set caller_node	[q $caller]
			}
			set called_node	$cmd
			if {![dict exists $node_info_output $caller_node]} {
				append out [format "\t\"%s\"%s;" $caller_node [compile_attribs {
				}]] \n
				dict set node_info_output $caller_node	1
			}
			if {![dict exists $node_info_output $called_node]} {
				append out [format "\t\"%s\"%s;" $called_node [compile_attribs [list \
					label $called_node \
				]]] \n
				dict set node_info_output $called_node	1
			}
			set edge_attribs [list label [file tail $fn]:$f_line]
			append out [format "\t\"%s\" -> \"%s\"%s;" \
				$caller_node \
				$called_node \
				[compile_attribs $edge_attribs]] \n

			if {![dict exists $visited $caller] && $caller ne ""} {
				dict set visited $caller 1
				append out [nodes_for $caller]
			}
		}
	}
	set out
}

puts "digraph \"Callers of [q $cmd]\" {\n[nodes_for $cmd]}"
