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

package require cflib
package require sop
package require m2
package require logging

cflib::config create cfg $argv {
	variable uri		tcp://
	variable debug		0
	variable loglevel	notice
	variable exectraces	exectraces
}
if {[cfg @debug]} {
	proc ?? script {uplevel 1 $script}
} else {
	proc ?? args {}
}
logging::logger ::log [cfg @loglevel]

set here	[file dirname [file normalize [info script]]]

m2::api2 create m2 -uri [cfg @uri]

proc current_state {} {
	global sources
	list sources [array get sources]
}

proc g_con {} {
	global g_con
	if {![info exists g_con]} {
		throw nack "No debug target connected"
	}
	set g_con
}

namespace eval m2req {
	namespace export *
	namespace ensemble create

	proc connect {} {
		global jmid
		upvar seq seq
		log debug "F got connect"
		if {![info exists jmid]} {
			set jmid	[m2 unique_id]
			m2 chans register_chan $jmid [list apply {
				{op data} {
					global jmid
					switch -- $op {
						cancelled {
							log notice "Frontend disconnected"
							unset jmid
						}

						req {
							lassign $data seq prev_seq msg
							handle_req $seq $msg
						}
					}
				}
			}]
		}
		m2 pr_jm $jmid $seq [current_state]
	}

	proc step {}				{send [g_con] step}
	proc command cmd			{send [g_con] exec $cmd}
	proc instead script			{send [g_con] instead $script}
	proc continue {}			{send [g_con] continue}
	proc set_breakpoint from	{send [g_con] set_breakpoint $from}
	proc clear_breakpoint from	{send [g_con] clear_breakpoint $from}
}

proc handle_req {seq data} {
	try {
		set rest	[lassign $data op]
		log debug "F got $op"
		m2req $op {*}$rest
	} on ok res {
		m2 ack $seq $res
	} trap nack errmsg {
		m2 nack $seq $errmsg
	} on error {errmsg options} {
		log error "Error handling request \"$op\":\n[dict get $options -errorinfo]"
		m2 nack $seq "Internal error"
	}
}

[m2 signal_ref connected] attach_output [list apply {
	newstate {
		log notice "M2 connected: $newstate"
		if {$newstate} {
			m2 handle_svc debugger handle_req
		} else {
			m2 handle_svc debugger ""
		}
	}
}]

array set sources	{}

proc announce_sources {} {
	global sources jmid
	if {[info exists jmid]} {
		m2 jm $jmid [list sources_update [array get sources]]
	}
}

proc announce_event {type data} {
	global jmid
	if {[info exists jmid]} {
		m2 jm $jmid [list $type $data]
	}
}

proc cleanup_state {} {
	global sources g_con
	array unset sources
	array set sources {}
	unset g_con
	announce_sources
	announce_event done ""
	log notice "Cleaned up state"
}

proc send {con op args} {
	log notice "Sending $op"
	set msg	[encoding convertto utf-8 [concat [list $op] $args]]
	puts -nonewline $con [string length $msg]\n$msg
}

proc save_exectrace exectrace {
	set now	[clock microseconds]
	set fn	[file normalize [file join [cfg @exectraces] $now.exectrace]]
	if {![file exists [file dirname $fn]]} {
		file mkdir [file dirname $fn]
	}
	cflib::writefile $fn $exectrace
}

proc readable con {
	global sources
	set header	[gets $con]
	if {[eof $con]} {
		close $con
		cleanup_state
		return
	}
	set type	[lindex $header 0]
	set len		[lindex $header 1]
	set dat		[encoding convertfrom utf-8 [read $con $len]]
	if {[eof $con]} {
		close $con
		cleanup_state
		return
	}
	log notice "Got $type"
	switch -- $type {
		start_debug {
			puts "Sending on [list start_debug [lindex $dat 0]]"
			announce_event start_debug [list [lindex $dat 0] [lindex $dat 1]]
		}
		source { # Source code
			set sources([lindex $dat 0])	[lindex $dat 1]
			announce_sources
		}
		enter { # About to run command
			set sid		[lindex $dat 0]
			set from	[lindex $dat 1]
			set to		[lindex $dat 2]
			announce_event enter [list $sid $from $to]
			#puts "-> running: ([string range $sources($sid) $from $to])"
			#send $con r {clock seconds}
			#after 1000 [list send $con n]
		}
		answer { # Answer to a "r" query from us
			set code	[lindex $dat 0]
			set res		[lindex $dat 1]
			#puts "   got a: code: ($code), res: ($res)"
			announce_event answer [list $code $res]
		}
		leave { # Result of the just run command
			try {
				set sid		[lindex $dat 0]
				set from	[lindex $dat 1]
				set to		[lindex $dat 2]
				set code	[lindex $dat 3]
				set res		[lindex $dat 4]
			} on error {errmsg options} {
				log error "Error unmarshalling dat: ($dat):\n$errmsg"
			}
			announce_event leave [list $sid $from $to $code $res]
			#puts "<- result: code: ($code), res: ($res)"
		}
		exectrace { # Log of the execution trace
			save_exectrace [lindex $dat 0]
		}
		default {
			log error "Bad message type: ($type)"
		}
	}
}

proc accept {con cl_ip cl_port} {
	global g_con
	if {[info exists g_con]} {
		log warning "Already have a connection from debug source, refusing another"
		close $con
		return
	}
	set g_con	$con
	fconfigure $con -blocking 1 -buffering none -translation binary -encoding binary
	fileevent $con readable [list readable $con]
}

set listen	[socket -server accept 1234]

vwait ::forever
