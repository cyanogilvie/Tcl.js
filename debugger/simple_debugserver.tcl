#!/usr/bin/env tclsh

global sources
array set sources	{}

proc send {con op args} {
	set msg	[concat [list $op] $args]
	puts -nonewline $con [string length $msg]\n$msg
}

proc readable con {
	global sources
	set header	[gets $con]
	if {[eof $con]} {
		close $con
		return
	}
	set type	[lindex $header 0]
	set len		[lindex $header 1]
	set dat		[read $con $len]
	if {[eof $con]} {
		close $con
		return
	}
	switch -- $type {
		s { # Source code
			set sources([lindex $dat 0])	[lindex $dat 1]
		}
		c { # About to run command
			set sid		[lindex $dat 0]
			set from	[lindex $dat 1]
			set to		[lindex $dat 2]
			puts "-> running: ([string range $sources($sid) $from $to])"
			send $con r {clock seconds}
			after 1000 [list send $con n]
		}
		a { # Answer to a "r" query from us
			set code	[lindex $dat 0]
			set res		[lindex $dat 1]
			puts "   got a: code: ($code), res: ($res)"
		}
		r { # Result of the just run command
			set sid		[lindex $dat 0]
			set from	[lindex $dat 1]
			set to		[lindex $dat 2]
			set code	[lindex $dat 3]
			set res		[lindex $dat 4]
			puts "<- result: code: ($code), res: ($res)"
		}
		default {
			puts stderr "Bad message type: ($type)"
		}
	}
}

proc accept {con cl_ip cl_port} {
	fconfigure $con -blocking 0 -buffering none -translation binary -encoding binary
	fileevent $con readable [list readable $con]
}

set listen	[socket -server accept 1234]

vwait ::forever
