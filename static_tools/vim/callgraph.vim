function s:Cx_proc() "{{{
	let l:winview = winsaveview()
	try
		let l:a_save = @a
		execute "normal! $".'?\v<proc>'."\<CR>w\"ayw"
		return substitute(@a, ' $', '', '')
	finally
		let @a = l:a_save
		call winrestview(l:winview)
	endtry
endfunction "}}}

"execute 'tcl source "'.escape(expand("<sfile>:p:h").'/callgraph.tcl', '"[]$\').'"'

function! Callers() "{{{
	let l:cx = s:Cx_proc()
	"execute 'tcl callers "'.escape(s:Cx_proc(), '"[]$\').'"'
	execute 'silent! make! "'.escape(l:cx, '"\').'" | copen'
	let &l:statusline = 'Callers of "'.l:cx.'"'
endfunction "}}}

nnoremap <localleader>c :call Callers()<cr>
if !exists("s:initialized")
	let s:initialized = 1
	"let &makeprg = expand("<sfile>:p:h").'/what_calls'
	let &errorformat = &errorformat . ",@c %f:%l.%c\t%m"
endif

function s:HijackMake() "{{{
	let &l:makeprg = expand("<sfile>:p:h").'/what_calls'
endfunction "}}}

augroup callgraph
	autocmd!
	autocmd FileType tcl call s:HijackMake()
augroup END

