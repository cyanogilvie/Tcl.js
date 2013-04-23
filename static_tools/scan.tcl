#!/usr/bin/env cfkit8.6
# vim: ft=tcl foldmethod=marker foldmarker=<<<,>>> ts=4 shiftwidth=4

namespace path ::tcl::mathop

# Record of which commands we've scanned already
set scanned	{}

proc readfile fn { #<<<
	set h	[open $fn r]
	try {read $h} finally {close $h}
}

#>>>
coroutine proc_info apply {
	{} {
		set procs	[readfile procs]
		set res		""
		while {1} {
			lassign [yeildto return -level 0 $res] cmd

			set res	[lrange [lsearch -all -inline -index 0 $procs $cmd] 1 end]
		}
	}
}

proc linerange2ofs {fn fromline toline} { #<<<
	set lines	[split [readfile $fn] \n]

	if {$fromline eq "" && $toline eq ""} {
		set fromline	1
		set toline		[llength $lines]
	}

	if {$toline eq ""} {
		set toline	$fromline
	}

	set ofs			0
	set lineno		0
	set from_ofs	""
	set to_ofs		""
	foreach line $lines {
		incr lineno
		if {$lineno	== $fromline} {
			set from_ofs	$ofs
		}
		if {$lineno == $toline} {
			set to_ofs		$ofs
		}
		incr ofs	[string length $line]
		incr ofs	1 ;# for the \n
	}
	list $from_ofs $to_ofs
}

#>>>
proc ofs2line {filedata ofs} { #<<<
	string length [regsub -all {[^\n]+} $filedata {} _; set _]
}

#>>>
proc scan_range {fn from to re} { #<<<
	global scanned
	set filedata	[readfile $fn]
	set script		[string range $filedata $from $to]
	foreach match [regexp -all -inline -indices $re $script] {
		lassign $match m_from m_to
		set g_ofs		[+ $from $m_from]
		set matchline	[ofs2line $filedata $g_ofs]
		set matchtext	[string range $script $m_from $m_to]
		puts "$fn:$matchline: $matchtext"
	}
	foreach line [split [exec ./allcommands.js << $script] \n] {
		if {![regexp {^(.*?):(.*?)\.(.*?)\.(.*?)$} $line - cmd line char ofs]} {
			puts stderr "Could not parse allcommands.js output line: ($line)"
			continue
		}
		if {![dict exists $scanned $cmd]} {
			set hits	[proc_info $cmd]
			if {[llength $hits] == 0} {
				puts stderr "No definition found for command \"$cmd\""
			}
			foreach hit $hits {
				lassign $hit proc_fn proc_line proc_ofs proc_chars
				lassign $proc_chars proc_from proc_to
				scan_range $proc_fn $from_from $proc_to
				dict set scanned $cmd	1
			}
		}
	}
}

#>>>
proc main {fn fromline toline re} { #<<<
	lassign [linerange2ofs $fn $fromline $toline] from_ofs to_ofs

	scan_range $fn $from_ofs $to_ofs $re
}

#>>>

try {
	main {*}$argv
} trap {TCL WRONGARGS} errmsg {
	puts stderr $errmsg
	exit 1
}
