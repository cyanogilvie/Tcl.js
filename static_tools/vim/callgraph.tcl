
proc readfile fn {
	set h	[open $fn r]
	set code	[catch {
		read $h
	} res]
	close $h
	return -code $code $res
}

proc callgraph_fn {} {
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

proc go {} {
	global oldwin

	set cursor	[$vim::current(window) cursor]
	set line [$vim::current(buffer) get [dict get $cursor row]]
	if {[string index $line 0] eq "#"} return
	lassign $line cmd fqfn f_line f_char t_line t_char
	puts "go: $cmd"
	$oldwin command "n $fqfn"
	$oldwin cursor $f_line $f_char
	vim::command "[$oldwin expr winnr()]wincmd w"
}

proc win_closed {} {
	global browserwin
	if {[info exists browserwin]} {
		unset browserwin
	}
}

proc callers cx {
	global browserwin oldwin

	set oldwin	$vim::current(window)
	if {![info exists browserwin]} {
		puts "cx: $cx"
		vim::command "botright 8new"
		set browserwin	$vim::current(window)
		$browserwin command {nmap <buffer> <CR> :tcl go<CR>}
		#$browserwin command {setlocal ro}
		$browserwin delcmd win_closed
	} else {
		vim::command "wincmd b"
	}
	set b	[$browserwin buffer]
	$b delete 1 [$b last]
	global callgraph

	if {![info exists callgraph]} {
		set callgraph	[readfile [callgraph_fn]]
	}

	$b insert 1 "# cx: ($cx)"
	dict for {caller callrecs} [dict get $callgraph $cx] {
		foreach callrec $callrecs {
			lassign $callrec fn f_line f_char t_line t_char
			$b insert [$b last] [list $caller $fn $f_line $f_char $t_line $t_char]
		}
	}
	$b delete [$b last]	;# Trim the last (blank) line
}

