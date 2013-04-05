proc debug script {
	global __breakpoints __debug

	array set __breakpoints {}
	set __debug(stepping)	1
	set srcid				[expr {int(rand()*2**20)}]

	if {![info exists __debug(initialized)]} {
		if {[info commands encoding] == "encoding"} {
			proc てがみ {t m} {
				set raw	[encoding convertto utf-8 $m]
				return [list $t [string length $raw]]\n$raw
			}

			proc みる {} {
				set l [gets [こ]]
				encoding convertfrom utf-8 [read [こ] $l]
			}
		} else {
			proc てがみ {t m} {
				return [list $t [string length $m]]\n$m
			}

			proc みる {} {
				set l [gets [こ]]
				read [こ] $l
			}
		}

		proc はなす {type args} {
			puts -nonewline [こ] [てがみ $type $args]
		}

		proc こ {} {
			global こ
			if {![info exists こ]} {
				set こ [socket localhost 1234]
				fconfigure [set こ] -blocking 1 -buffering none -translation binary
				#はなす source %s %s
			}
			set こ
		}

		proc する {from to script} [format {
			global __debug __breakpoints

			if {[info exists __breakpoints($from)]} {
				set __debug(stepping)	1
				if {$__breakpoints($from) == "oneshot"} {
					if {[info exists __breakpoints($from)]} {
						unset __breakpoints($from)
					}
				}
			}

			if {$__debug(stepping)} {
				はなす enter {%1$s} $from $to
				while 1 {
					set msg [みる]
					if {[eof [こ]]} {
						close [こ]
						proc する {from to script} {uplevel 1 $script}
						catch {unset __debug(initialized)}
						uplevel 1 $script
						return
					}
					set op	[lindex $msg 0]
					switch -- $op {
						step break
						exec {
							set code [catch {uplevel 1 [lindex $msg 1]} res]
							はなす answer $code $res
						}
						instead	{
							set script [lindex $msg 1]
						}
						set_breakpoint {
							set __breakpoints([lindex $msg 1]) 1
						}
						clear_breakpoint {
							catch {unset __breakpoints([lindex $msg 1])}
						}
						continue {
							set __debug(stepping) 0
							break
						}
					}
				}
			}

			set code	[catch {uplevel 1 $script} res]
			if {$code == 1} {
				set __debug(stepping) 1
			}
			if {$__debug(stepping)} {
				はなす leave {%1$s} $from $to $code $res
				while 1 {
					set msg [みる]
					if {[eof [こ]]} {
						close [こ]
						proc する {from to script} {uplevel 1 $script}
						catch {unset __debug(initialized)}
						break
					}
					set op	[lindex $msg 0]
					switch -- $op {
						step break
						exec {
							set c [catch {uplevel 1 [lindex $msg 1]} r]
							はなす answer $c $r
						}
						set_breakpoint {
							set __breakpoints([lindex $msg 1]) 1
						}
						clear_breakpoint {
							catch {unset __breakpoints([lindex $msg 1])}
						}
						continue {
							set __debug(stepping) 0
							break
						}
					}
				}
			}
			return -code $code $res
		} [list $srcid]]
		set __debug(initialized)	1
	}

	puts "sending start_debug [list $srcid $script]"
	はなす start_debug $srcid $script
	while 1 {
		set msg	[みる]
		if {[eof [こ]]} {
			close [こ]
			proc する {from to script} {uplevel 1 $script}
			catch {unset __debug(initialized)}
			break
		}
		set op	[lindex $msg 0]
		switch -- $op {
			step break
			instead {
				set script	[lindex $msg 1]
			}
			exec {
				set code [catch {uplevel 1 [lindex $msg 1]} res]
				はなす answer $code $res
			}
			set_breakpoint {
				set __breakpoints([lindex $msg 1]) 1
			}
			clear_breakpoint {
				catch {unset __breakpoints([lindex $msg 1])}
			}
			continue {
				set __debug(stepping) 0
				break
			}
		}
	}
	set code	[catch {uplevel 1 $script} res]
	return -code $code $res
}

# vim: ft=tcl foldmethod=marker foldmarker=<<<,>>> ts=4 shiftwidth=4
