/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./list',
	'./types',
	'./tclobject',
	'cflib/promise',
	'cflib/tailcall',

	'./objtype_dict',
	'./objtype_list'
], function(
	tcllist,
	types,
	tclobj,
	Promise,
	TailCall
){
'use strict';

var objkeys, TclError = types.TclError, subcmds;

objkeys = Object.prototype.keys ? function(o){return o.keys();} : function(o){
	var e, res = [];
	for (e in o) {
		if (o.hasOwnProperty(e)) {
			res.push(e);
		}
	}
	return res;
};

function resolve_keypath(interp, dictobj, keys, create, dictvar) {
	var key, lastdict = dictobj, root;
	if (create === undefined) {create = false;}
	if (dictvar !== undefined && dictobj.IsShared()) {
		dictobj = dictobj.DuplicateObj();
		interp.set_scalar(dictvar, dictobj);
	}
	root = dictobj;
	while (keys.length > 0) {
		if (dictvar !== undefined && dictobj.IsShared()) {
			dictobj = dictobj.DuplicateObj();
			lastdict[key].DecrRefCount();
			lastdict[key] = dictobj;
			lastdict[key].IncrRefCount();
		}
		key = keys.shift();
		lastdict = dictobj.GetDict();
		if (lastdict[key] === undefined) {
			if (create === true) {
				lastdict[key] = tclobj.NewDict();
				lastdict[key].IncrRefCount();
			} else if (keys.length > 0) {
				throw new TclError('key "'+key+'" not known in dictionary',
					'TCL', 'LOOKUP', 'DICT', key);
			}
		}
		dictobj = lastdict[key];
	}
	return {
		root: root,
		key: key,
		lastdict: lastdict,
		value: dictobj
	};
}

function glob2regex(glob) {
	var re = String(glob).replace(/([.+\^$\\(){}|\-])/g, '\\$1');
	re = re.replace(/\*/g, '.*');
	re = re.replace(/\?/g, '.');
	return new RegExp(re);
}

subcmds = {
	append: function(args){
		this.checkArgs(args, [3, null], 'dictionaryVariable key ?string ...?');
		args.shift();
		var dictvar = args.shift(),
			dictobj = this.get_scalar(dictvar),
			dictval,
			key = args.shift(),
			strings = args, newval;

		if (dictval.IsShared()) {
			dictobj = tclobj.DuplicateObj(dictobj);
			this.set_scalar(dictvar, dictobj);
		}

		dictval = dictobj.GetDict();

		if (dictval[key] !== undefined) {
			newval = dictval[key].toString() + strings.join('');
			dictval[key].DecrRefCount();
		} else {
			newval = strings.join('');
		}
		dictval[key] = tclobj.NewObj(newval);
		dictval[key].IncrRefCount();
		return dictobj;
	},
	create: function(args){
		return new tclobj.NewDict(args.slice(1));
	},
	exists: function(args){
		this.checkArgs(args, [3, null], 'dictionaryValue key ?key ...? value');
		args.shift();
		var dictobj = args.shift(),
			keys = args,
			kinfo = resolve_keypath(this, dictobj, keys);
		return kinfo.lastdict[kinfo.key] !== undefined;
	},
	filter: function(args, interp){
		this.checkArgs(args, [2, null], 'dictionaryValue filterType arg ?arg ...?');
		args.shift();
		var dictobj = args.shift(),
			dictvals = dictobj.GetDict(),
			out = tclobj.NewDict(),
			outdictvals = out.GetDict(),
			filterType = args.shift();
		function filter_key(){
			var regexes = [], i, j, keys = objkeys(dictvals), key, re;
			for (i=0; i<args.length; i++) {
				regexes.push(glob2regex(args[i]));
			}
			for (i=0; i<keys.length; i++) {
				key = keys[i];
				for (j=0; j<regexes.length; j++) {
					re = regexes[j];
					if (re.test(key)) {
						outdictvals[key] = dictvals[key];
						outdictvals[key].IncrRefCount();
						break;
					}
				}
			}
			return out;
		}
		function filter_script(){
			var e, loopvars = args[0].GetList(), body = args[1],
				keyvar, valuevar, pairs = [], promise;
			interp.checkArgs(args, 2, 'dictionaryValue script {keyVar valueVar} script');
			if (loopvars.length !== 2) {
				throw new TclError('must have exactly two variable names');
			}
			keyvar = loopvars[0];
			valuevar = loopvars[1];
			for (e in dictvals) {
				if (dictvals.hasOwnProperty(e)) {
					pairs.push(e);
					pairs.push(dictvals[e]);
				}
			}

			promise = new Promise();
			function next_loop(k, v) {
				if (k === undefined) {
					return promise.resolve(out);
				}
				interp.set_scalar(keyvar, k);
				interp.set_scalar(valuevar, v);
				interp.TclEval(body).then(function(res){
					if (res.code === types.RETURN) {
						return promise.resolve(res);
					}
					if (tcllist.bool(res.result.toString())) {
						outdictvals[k] = dictvals[k];
						outdictvals[k].IncrRefCount();
					}
					return new TailCall(next_loop, [pairs.shift(), pairs.shift()]);
				}, function(res){
					if (res.code === types.BREAK) {
						return promise.resolve(out);
					}
					if (res.code === types.CONTINUE) {
						return new TailCall(next_loop, [pairs.shift(), pairs.shift()]);
					}
					return promise.reject(res);
				});
			}

			next_loop(pairs.shift(), pairs.shift());

			return promise;
		}
		function filter_value(){
			var regexes = [], i, j, keys = objkeys(dictvals), key, re;
			for (i=0; i<args.length; i++) {
				regexes.push(glob2regex(args[i]));
			}
			for (i=0; i<keys.length; i++) {
				key = keys[i];
				for (j=0; j<regexes.length; j++) {
					re = regexes[j];
					if (re.test(dictvals[key])) {
						outdictvals[key] = dictvals[key];
						outdictvals[key].IncrRefCount();
						break;
					}
				}
			}
			return out;
		}
		switch (filterType) {
			case 'key': return filter_key();
			case 'script': return filter_script();
			case 'value': return filter_value();
			default: throw new TclError('bad filterType "'+filterType+'": must be key, script, or value', 'TCL', 'LOOKUP', 'INDEX', 'filterType', filterType);
		}
	},
	'for': function(args, interp){
		this.checkArgs(args, 3, '{keyVar valueVar} dictionary script');
		args.shift();
		var loopvars = args.shift().GetList(),
			dictval = args.shift().GetDict(),
			body = args.shift(),
			keyvar, valuevar, e, pairs = [], promise;
		if (loopvars.length !== 2) {
			throw new TclError('must have exactly two variable names');
		}
		keyvar = loopvars[0];
		valuevar = loopvars[1];

		for (e in dictval) {
			if (dictval.hasOwnProperty(e)) {
				pairs.push(e);
				pairs.push(dictval[e]);
			}
		}

		promise = new Promise();

		function next_loop(k, v) {
			if (k === undefined) {
				return promise.resolve();
			}
			interp.set_scalar(keyvar, k);
			interp.set_scalar(valuevar, v);
			interp.TclEval(body).then(function(){
				return new TailCall(next_loop, [pairs.shift(), pairs.shift()]);
			}, function(res){
				if (res.code === types.BREAK) {
					return promise.resolve();
				}
				if (res.code === types.CONTINUE) {
					return new TailCall(next_loop, [pairs.shift(), pairs.shift()]);
				}
				return promise.reject(res);
			});
		}

		next_loop(pairs.shift(), pairs.shift());

		return promise;
	},
	get: function(args){
		this.checkArgs(args, [1, null], 'dictionaryValue ?key ...?');
		args.shift();
		var dictobj = args.shift(),
			keys = args,
			kinfo = resolve_keypath(this, dictobj, keys);
		if (kinfo.value === undefined) {
			throw new TclError('key "'+kinfo.key+'" not known in dictionary',
				'TCL', 'LOOKUP', 'DICT', kinfo.key);
		}
		return kinfo.value;
	},
	incr: function(args){
		this.checkArgs(args, [2, 3], 'dictionaryVariable key ?increment?');
		var dictvar = args[1],
			dictobj = this.get_scalar(dictvar),
			dictval,
			key = args[2],
			increment = Number(args[3]) || 1;
		if (dictobj.IsShared()) {
			dictobj = dictobj.DuplicateObj();
			this.set_scalar(dictobj);
		}
		dictval = dictobj.GetDict();
		dictval[key].GetInt();
		dictval[key].jsval += increment;
		return dictval[key];
	},
	info: function(){
		return 'Nothing interesting to report';
	},
	keys: function(args){
		this.checkArgs(args, [1, 2], 'dictionaryValue ?globPattern?');
		args.shift();
		var dictobj = args.shift(),
			glob = args.shift(),
			re, i, keys = objkeys(dictobj.GetDict()), out;

		if (glob !== undefined) {
			re = glob2regex(glob.toString());
			out = [];
			for (i=0; i<keys.length; i++) {
				if (re.test(keys[i])) {
					out.push(keys[i]);
				}
			}
		} else {
			out = keys;
		}
		return out;
	},
	lappend: function(args){
		this.checkArgs(args, [2, null], 'dictionaryVariable key ?value ...?');
		args.shift();
		var dictvar = args.shift(),
			dictobj = this.get_scalar(dictvar),
			dictval,
			key = args.shift(),
			values = args, newlist;
		if (dictobj.IsShared()) {
			dictobj = dictobj.DuplicateObj();
			this.set_scalar(dictvar, dictobj);
		}
		dictval = dictobj.GetDict();
		if (dictval[key] === undefined) {
			dictval[key] = tclobj.NewList();
		}
		newlist = dictval[key].GetList().concat(values);
		dictval[key] = newlist;
		return dictobj;
	},
	map: function(args, interp){
		this.checkArgs(args, 3, '{keyVar valueVar} dictionary script');
		args.shift();
		var loopvars = args.shift().GetList(),
			dictval = args.shift().GetDict(),
			body = args.shift(),
			keyvar, valuevar, e, pairs = [], promise, accum = [];
		if (loopvars.length !== 2) {
			throw new TclError('must have exactly two variable names');
		}
		keyvar = loopvars[0];
		valuevar = loopvars[1];

		for (e in dictval) {
			if (dictval.hasOwnProperty(e)) {
				pairs.push(e);
				pairs.push(dictval[e]);
			}
		}

		promise = new Promise();

		function next_loop(k, v) {
			if (k === undefined) {
				return promise.resolve(accum);
			}
			interp.set_scalar(keyvar, k);
			interp.set_scalar(valuevar, v);
			interp.TclEval(body).then(function(res){
				accum.push(res.result);
				return new TailCall(next_loop, [pairs.shift(), pairs.shift()]);
			}, function(res){
				if (res.code === types.BREAK) {
					return promise.resolve(accum);
				}
				if (res.code === types.CONTINUE) {
					return new TailCall(next_loop, [pairs.shift(), pairs.shift()]);
				}
				return promise.reject(res);
			});
		}

		next_loop(pairs.shift(), pairs.shift());

		return promise;
	},
	merge: function(args){
		var out = {}, e, dictval, arg;
		args.shift();
		while (args.length) {
			arg = args.shift();
			dictval = arg.GetDict();
			for (e in dictval) {
				if (dictval.hasOwnProperty(e)) {
					out[e] = dictval[e];
				}
			}
		}
		return tclobj.NewDict(out);
	},
	remove: function(args){
		this.checkArgs(args, [1, null], 'dictionaryValue ?key ...?');
		args.shift();
		var dictobj = args.shift(), keys = args, dictval, i;
		if (keys.length === 0) {return dictobj;}
		dictobj = dictobj.DuplicateObj();
		dictval = dictobj.GetDict();
		for (i=0; i<keys.length; i++) {
			if (dictval.hasOwnProperty(keys[i])) {
				dictval[keys[i]].DecrRefCount();
				delete dictval[keys[i]];
			}
		}
		return dictobj;
	},
	replace: function(args){
		this.checkArgs(args, [1, null], 'dictionaryValue ?key value ...?');
		args.shift();
		var dictobj = args.shift(), pairs = args, i, key, val, dictval;
		if (pairs.length === 0) {return dictobj;}
		if (pairs.length % 2 !== 0) {
			throw new TclError('wrong # args: should be "dict replace dictionary ?key value ...?"',
				'TCL', 'WRONGARGS');
		}
		dictobj = dictobj.DuplicateObj();
		dictval = dictobj.GetDict();
		for (i=0; i<pairs.length; i+=2) {
			key = pairs[i];
			val = pairs[i+1];
			dictval[key] = val;
		}
		return dictobj;
	},
	set: function(args){
		this.checkArgs(args, [3, null], 'dictionaryVariable key ?key ...? value');
		args.shift();
		var dictvar = args.shift(),
			dictobj = this.get_scalar(dictvar),
			keys = args.slice(0, args.length-1),
			value = args[args.length-1],
			kinfo;

		kinfo = resolve_keypath(this, dictobj, keys, true, dictvar);

		if (kinfo.lastdict[kinfo.key] !== undefined) {
			kinfo.lastdict[kinfo.key].DecrRefCount();
		}
		kinfo.lastdict[kinfo.key] = tclobj.AsObj(value);
		kinfo.lastdict[kinfo.key].IncrRefCount();
		return dictobj;
	},
	size: function(args){
		this.checkArgs(1, 'dictionaryValue');
		return objkeys(objkeys(args[1].GetDict()).length);
	},
	unset: function(args){
		this.checkArgs(args, [3, null], 'dictionaryVariable key ?key ...? value');
		args.shift();
		var dictvar = args.shift(),
			dictobj = this.get_scalar(dictvar),
			keys = args,
			kinfo;

		kinfo = resolve_keypath(this, dictobj, keys, false, dictvar);
		if (kinfo.lastdict[kinfo.key] !== undefined) {
			kinfo.lastdict[kinfo.key].DecrRefCount();
			delete kinfo.lastdict[kinfo.key];
		}
		return kinfo.root;
	},
	update: function(args, interp){
		this.checkArgs(args, [4, null], 'dictionaryVariable key varName ?key Varname ...? body');
		args.shift();
		var dictvar = args.shift(),
			dictobj = this.get_scalar(dictvar),
			pairs = args.slice(0, args.length-1),
			body = args[args.length-1],
			dictval, vars, i, promise;
		if (pairs.length % 2 !== 0) {
			throw new TclError('wrong # args: should be "dict update varName key varName ?key varName ...? script"',
				'TCL', 'WRONGARGS');
		}
		if (dictobj.IsShared()) {
			dictobj = dictobj.DuplicateObj();
			this.set_scalar(dictvar, dictobj);
		}
		dictval = dictobj.GetDict();
		for (i=0; i<pairs.length; i+=2) {
			this.set_scalar(pairs[i+1], dictval[pairs[i]]);
		}
		promise = new Promise();

		function apply_updates(){
			var i, dictobj, dictval, varname, key;
			try {
				dictobj = interp.get_scalar(dictvar);
			} catch(e){
				if (e instanceof types.TclError && /^TCL LOOKUP (DICT)|(VARNAME) /.test(e.errorcode.join(' '))) {
					return;
				}
				throw e;
			}
			if (dictobj.IsShared()) {
				dictobj = dictobj.DuplicateObj();
				interp.set_scalar(dictvar, dictobj);
			}
			dictval = dictobj.GetDict();
			for (i=0; i<pairs.length; i+=2) {
				key = vars[i];
				varname = vars[i+1];
				if (dictval[key] !== undefined) {
					dictval[key].DecrRefCount();
					delete dictval[key];
				}
				if (interp.scalar_exists(varname)) {
					dictval[key] = interp.get_scalar(varname);
					dictval[key].IncrRefCount();
				}
			}
		}

		this.TclEval(body).then(function(res){
			try {
				apply_updates();
			} catch(e2){
				return promise.reject(e2);
			}
			return promise.resolve(res);
		}, function(res){
			try {
				apply_updates();
			} catch(e2){
				return promise.reject(e2);
			}
			return promise.reject(res);
		});
		return promise;
	},
	values: function(args){
		this.checkArgs(args, [1, 2], 'dictionaryValue ?globPattern?');
		args.shift();
		var dictobj = args.shift(),
			dictval = dictobj.GetDict(),
			glob = args.shift(),
			re, e, i, keys = objkeys(dictval), out;

		if (glob !== undefined) {
			re = glob2regex(glob.toString());
			out = [];
			for (i=0; i<keys.length; i++) {
				if (re.test(keys[i])) {
					out.push(dictval[keys[i]]);
				}
			}
		} else {
			out = [];
			for (e in dictval) {
				if (dictval.hasOwnProperty(e)) {
					out.push(dictval[e]);
				}
			}
		}
		return out;
	},
	'with': function(args, interp){
		this.checkArgs(args, [2, null], 'dictionaryVariable ?key ...? body');
		args.shift();
		var dictvar = args.shift(),
			dictobj = this.get_scalar(dictvar),
			keys = args.slice(0, args.length-1),
			body = args[args.length-1],
			dictval, vars, i, promise, kinfo;
		kinfo = resolve_keypath(this, dictobj, keys, false, dictvar);
		dictobj = kinfo.value;
		dictval = dictobj.GetDict();
		vars = objkeys(dictval);
		for (i=0; i<vars.length; i++) {
			this.set_scalar(vars[i], dictval[vars[i]]);
		}
		promise = new Promise();

		function apply_updates(){
			var i, dictobj, dictval, varname;
			try {
				dictobj = interp.get_scalar(dictvar);
				kinfo = resolve_keypath(interp, dictobj, keys, false, dictvar);
			} catch(e){
				if (e instanceof types.TclError && /^TCL LOOKUP (DICT)|(VARNAME) /.test(e.errorcode.join(' '))) {
					return;
				}
				throw e;
			}
			dictobj = kinfo.value;
			dictval = dictobj.GetDict();
			for (i=0; i<vars.length; i++) {
				varname = vars[i];
				if (dictval[varname] !== undefined) {
					dictval[varname].DecrRefCount();
					delete dictval[varname];
				}
				if (interp.scalar_exists(varname)) {
					dictval[varname] = interp.get_scalar(varname);
					dictval[varname].IncrRefCount();
				}
			}
		}

		this.TclEval(body).then(function(res){
			try {
				apply_updates();
			} catch(e2){
				return promise.reject(e2);
			}
			return promise.resolve(res);
		}, function(res){
			try {
				apply_updates();
			} catch(e2){
				return promise.reject(e2);
			}
			return promise.reject(res);
		});
		return promise;
	}
};

function install(interp) {
	if (interp.register_extension('ex_dict_cmds')) {return;}

	interp.registerCommand('dict', function(args){
		var subcmd, cmd;
		if (args.length < 2) {
			interp.checkArgs(args, 1, 'subcmd args');
		}

		cmd = args.shift(); subcmd = args.shift();
		args.unshift(cmd+' '+subcmd);
		if (subcmds[subcmd] === undefined) {
			throw new TclError('unknown or ambiguous subcommand "'+subcmd+'": must be '+objkeys(subcmds).join(', '),
				'TCL', 'LOOKUP', 'SUBCOMMAND', subcmd);
		}
		return subcmds[subcmd].apply(interp, [args, interp]);
	});
}

return {'install': install};
});
