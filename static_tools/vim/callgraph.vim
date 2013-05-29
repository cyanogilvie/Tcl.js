function s:Cx_proc() "{{{
	let l:winview = winsaveview()
	try
		let l:a_save = @a
		execute "normal! $?\\<proc\\>\rw\"ayw"
		return @a
	finally
		let @a = l:a_save
		call winrestview(l:winview)
	endtry
endfunction "}}}

execute "tcl source ".expand("<sfile>:p:h").'/callgraph.tcl'

function! Callers() "{{{
	if !exists("s:browserwin")
		" TODO: quote the cx somehow
		execute 'tcl callers "'.s:Cx_proc().'"'
	endif
endfunction "}}}

map <localleader>c :call Callers()<cr>
