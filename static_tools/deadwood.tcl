#!/usr/bin/env tclsh8.6
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

package require parse_args
interp alias {} parse_args {} ::parse_args::parse_args

parse_args $args {
	-callgraph	{-default callgraph}
	-allprocs	{-default allprocs}
	-ignore		{}
}

proc readfile fn {
	set h	[open $fn r]
	try {read $h} finally {close $h}
}

set callgraph	[readfile $callgraph]

if {[info exists ignore]} {
	set ignored	[readfile $ignore]
} else {
	set ignored	{}
}

foreach line [split [string trim [readfile $allprocs]] \n] {
	lassign $line proc file line_no ns
	if {[string match ::* $proc] || [string match "themed *" $proc]} {
		set fqproc	$proc
	} else {
		set fqproc	${ns}::$proc
	}
	if {![dict exists $callgraph $proc] && $proc ni $ignored} {
		puts [list $fqproc $file $line_no]
	}
}

