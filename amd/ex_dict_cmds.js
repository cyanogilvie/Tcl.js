/*jslint plusplus: true, white: true, nomen: true */
/*global define */

define([
	'./list',
	'./types',
	'./utils',
	'./tclobject',
	'./objtype_dict',
	'./objtype_list'
], function(
	tcllist,
	types,
	utils,
	tclobj,
	DictObj,
	ListObj
){
'use strict';

var TclError = types.TclError, subcmds;

function make_unshared(dictval, key) {
	if (dictval[key].IsShared()) {
		var tmp = dictval[key].DuplicateObj();
		dictval[key].DecrRefCount();
		dictval[key] = tmp;
		dictval[key].IncrRefCount();
	}
}

function resolve_keypath(I, dictobj, keys, create, dictvar) {
	var key, lastdict, lastdictobj, root;
	if (create === undefined) {create = false;}
	if (dictvar !== undefined && dictobj.IsShared()) {
		dictobj = I.get_var(dictvar, true);
	}
	lastdict = root = dictobj;
	while (keys.length > 0) {
		if (dictvar !== undefined && dictobj.IsShared()) {
			dictobj = dictobj.DuplicateObj();
			lastdict[key].DecrRefCount();
			lastdict[key] = dictobj;
			lastdict[key].IncrRefCount();
		}
		key = keys.shift();
		lastdict = dictobj.GetDict();
		lastdictobj = dictobj;
		if (lastdict[key] === undefined) {
			if (create === true) {
				dictobj.bytes = null;
				lastdict[key] = new DictObj();
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
		lastdictobj: lastdictobj,
		value: dictobj
	};
}

subcmds = {
	append: function(c, args, I){
		I.checkArgs(args, [3, null], 'dictionaryVariable key ?string ...?');
		args.shift();
		var dictvar = args.shift(),
			dictobj = I.get_var(dictvar, true),
			dictval,
			key = args.shift(),
			strings = args, newval;

		dictval = dictobj.GetDict();
		dictobj.bytes = null;

		if (dictval[key] !== undefined) {
			newval = dictval[key].toString() + strings.join('');
			dictval[key].DecrRefCount();
		} else {
			newval = strings.join('');
		}
		dictval[key] = tclobj.NewObj(newval);
		dictval[key].IncrRefCount();
		return c(dictobj);
	},
	create: function(c, args){
		return c(new DictObj(args.slice(1)));
	},
	exists: function(c, args, I){
		I.checkArgs(args, [3, null], 'dictionaryValue key ?key ...? value');
		args.shift();
		var dictobj = args.shift(),
			keys = args,
			kinfo = resolve_keypath(I, dictobj, keys);
		return c(kinfo.lastdict[kinfo.key] !== undefined);
	},
	filter: function(c, args, I){
		I.checkArgs(args, [2, null], 'dictionaryValue filterType arg ?arg ...?');
		args.shift();
		var dictobj = args.shift(),
			dictvals = dictobj.GetDict(),
			out = new DictObj(),
			outdictvals = out.GetDict(),
			filterType = args.shift();
		function filter_key(){
			var regexes = [], i, j, keys = utils.objkeys(dictvals), key, re;
			for (i=0; i<args.length; i++) {
				regexes.push(utils.glob2regex(args[i]));
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
			return c(out);
		}
		function filter_script(){
			var e, loopvars = args[0].GetList(), body = args[1],
				keyvar, valuevar, pairs = [], i = 0;
			I.checkArgs(args, 2, 'dictionaryValue script {keyVar valueVar} script');
			if (loopvars.length !== 2) {
				throw new TclError('must have exactly two variable names');
			}
			keyvar = loopvars[0];
			valuevar = loopvars[1];
			for (e in dictvals) {
				if (dictvals.hasOwnProperty(e)) {
					pairs.push(e, dictvals[e]);
				}
			}

			return function next_loop() {
				if (i >= pairs.length) {return c(out);}
				var k = pairs[i++],
					v = pairs[i++];

				I.set_scalar(keyvar, k);
				I.set_scalar(valuevar, v);
				return I.exec(body, function(res){
					switch (res.code) {
						case types.OK:			
							if (tcllist.bool(res.result.toString())) {
								outdictvals[k] = dictvals[k];
								outdictvals[k].IncrRefCount();
							}
							return next_loop;
						case types.RETURN:		return c(res);
						case types.BREAK:		return c(out);
						case types.CONTINUE:	return next_loop;
						case types.ERROR:		return c(res);
						default:
							return c(new TclError('Unhandled return code ('+res.code+')'));
					}
				});
			};
		}
		function filter_value(){
			var regexes = [], i, j, keys = utils.objkeys(dictvals), key, re;
			for (i=0; i<args.length; i++) {
				regexes.push(utils.glob2regex(args[i]));
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
			return c(out);
		}
		switch (filterType) {
			case 'key':		return filter_key();
			case 'script':	return filter_script();
			case 'value':	return filter_value();
			default: throw new TclError('bad filterType "'+filterType+'": must be key, script, or value', 'TCL', 'LOOKUP', 'INDEX', 'filterType', filterType);
		}
	},
	'for': function(c, args, I){
		I.checkArgs(args, 3, '{keyVar valueVar} dictionary script');
		var loopvars = args[1].GetList(),
			dictval = args[2].GetDict(),
			body = args[3], keyvar, valuevar, e, pairs = [], i = 0;
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

		return function next_loop() {
			if (i === pairs.length) {return c();}
			var k = pairs[i++],
				v = pairs[i++];

			I.set_scalar(keyvar, k);
			I.set_scalar(valuevar, v);
			I.exec(body, function(res){
				switch (res.code) {
					case types.CONTINUE:
					case types.OK:			return next_loop;
					case types.BREAK:		return c();
					case types.ERROR:		return c(res);
				}
			});
		};
	},
	get: function(c, args, I){
		I.checkArgs(args, [1, null], 'dictionaryValue ?key ...?');
		args.shift();
		var dictobj = args.shift(),
			keys = args,
			kinfo = resolve_keypath(I, dictobj, keys);
		if (kinfo.value === undefined) {
			throw new TclError('key "'+kinfo.key+'" not known in dictionary',
				'TCL', 'LOOKUP', 'DICT', kinfo.key);
		}
		return c(kinfo.value);
	},
	incr: function(c, args, I){
		I.checkArgs(args, [2, 3], 'dictionaryVariable key ?increment?');
		var dictvar = args[1],
			dictobj = I.get_var(dictvar, true),
			dictval = dictobj.GetDict(),
			key = args[2],
			increment = Number(args[3]) || 1;
		dictobj.bytes = null;
		make_unshared(dictval, key);
		dictval[key].GetInt();
		dictval[key].jsval += increment;
		return c(dictval[key]);
	},
	info: function(c){
		return c('Nothing interesting to report');
	},
	keys: function(c, args, I){
		I.checkArgs(args, [1, 2], 'dictionaryValue ?globPattern?');
		args.shift();
		var dictobj = args.shift(),
			glob = args.shift(),
			re, i, keys = utils.objkeys(dictobj.GetDict()), out;

		if (glob !== undefined) {
			re = utils.glob2regex(glob.toString());
			out = [];
			for (i=0; i<keys.length; i++) {
				if (re.test(keys[i])) {
					out.push(keys[i]);
				}
			}
		} else {
			out = keys;
		}
		return c(out);
	},
	lappend: function(c, args, I){
		I.checkArgs(args, [2, null], 'dictionaryVariable key ?value ...?');
		args.shift();
		var dictvar = args.shift(),
			dictobj = I.get_var(dictvar, true),
			dictval = dictobj.GetDict(),
			key = args.shift(),
			values = args, newlist;
		dictobj.bytes = null;
		if (dictval[key] === undefined) {
			dictval[key] = new ListObj();
			dictval[key].IncrRefCount();
		}
		make_unshared(dictval, key);
		newlist = dictval[key].GetList().concat(values);
		dictval[key].bytes = null;
		dictval[key].jsval = newlist;
		return c(dictobj);
	},
	map: function(c, args, I){
		I.checkArgs(args, 3, '{keyVar valueVar} dictionary script');
		var loopvars = args[1].GetList(),
			dictval = args[2].GetDict(),
			body = args[3],
			keyvar, valuevar, e, pairs = [], accum = [], i = 0;

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

		return function next_loop() {
			if (i >= pairs.length) {return c(accum);}
			var k = pairs[i++],
				v = pairs[i++];
			I.set_scalar(keyvar, k);
			I.set_scalar(valuevar, v);
			I.exec(body, function(res){
				switch (res.code) {
					case types.OK:
						accum.push(res.result);
						return next_loop;
					case types.BREAK:		return c(accum);
					case types.CONTINUE:	return next_loop;
					case types.ERROR:		return c(res);
					default:
						return c(new TclError('Unexpected result code: ('+res.code+')'));
				}
			});
		};
	},
	merge: function(c, args){
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
		return c(new DictObj(out));
	},
	remove: function(c, args, I){
		I.checkArgs(args, [1, null], 'dictionaryValue ?key ...?');
		args.shift();
		var dictobj = args.shift(), keys = args, dictval, i;
		if (keys.length === 0) {return c(dictobj);}
		dictobj = dictobj.DuplicateObj();
		dictval = dictobj.GetDict();
		dictobj.bytes = null;
		for (i=0; i<keys.length; i++) {
			if (dictval.hasOwnProperty(keys[i])) {
				dictval[keys[i]].DecrRefCount();
				delete dictval[keys[i]];
			}
		}
		return c(dictobj);
	},
	replace: function(c, args, I){
		I.checkArgs(args, [1, null], 'dictionaryValue ?key value ...?');
		args.shift();
		var dictobj = args.shift(), pairs = args, i, key, val, dictval;
		if (pairs.length === 0) {return c(dictobj);}
		if (pairs.length % 2 !== 0) {
			throw new TclError('wrong # args: should be "dict replace dictionary ?key value ...?"',
				'TCL', 'WRONGARGS');
		}
		dictobj = dictobj.DuplicateObj();
		dictval = dictobj.GetDict();
		dictobj.bytes = null;
		for (i=0; i<pairs.length; i+=2) {
			key = pairs[i];
			val = pairs[i+1];
			if (dictval[key] !== undefined) {
				dictval[key].DecrRefCount();
			}
			dictval[key] = val;
			dictval[key].IncrRefCount();
		}
		return c(dictobj);
	},
	set: function(c, args, I){
		I.checkArgs(args, [3, null], 'dictionaryVariable key ?key ...? value');
		args.shift();
		var dictvar = args.shift(),
			dictobj = I.get_var(dictvar),
			keys = args.slice(0, args.length-1),
			value = args[args.length-1],
			kinfo;

		kinfo = resolve_keypath(I, dictobj, keys, true, dictvar);
		kinfo.root.bytes = null;

		if (kinfo.lastdict[kinfo.key] !== undefined) {
			kinfo.lastdict[kinfo.key].DecrRefCount();
		}
		kinfo.lastdict[kinfo.key] = tclobj.AsObj(value);
		kinfo.lastdict[kinfo.key].IncrRefCount();
		return c(kinfo.root);
	},
	size: function(c, args, I){
		I.checkArgs(1, 'dictionaryValue');
		return c(utils.objkeys(args[1].GetDict()).length);
	},
	unset: function(c, args, I){
		I.checkArgs(args, [3, null], 'dictionaryVariable key ?key ...? value');
		args.shift();
		var dictvar = args.shift(),
			dictobj = I.get_var(dictvar, true),
			keys = args, kinfo;

		kinfo = resolve_keypath(I, dictobj, keys, false, dictvar);
		if (kinfo.lastdict[kinfo.key] !== undefined) {
			kinfo.lastdictobj.bytes = null;
			kinfo.lastdict[kinfo.key].DecrRefCount();
			delete kinfo.lastdict[kinfo.key];
		}
		return c(kinfo.root);
	},
	update: function(c, args, I){
		I.checkArgs(args, [4, null], 'dictionaryVariable key varName ?key Varname ...? body');
		args.shift();
		var dictvar = args.shift(),
			dictobj = I.get_var(dictvar),
			pairs = args.slice(0, args.length-1),
			body = args[args.length-1],
			dictval, vars, i;
		if (pairs.length % 2 !== 0) {
			throw new TclError('wrong # args: should be "dict update varName key varName ?key varName ...? script"',
				'TCL', 'WRONGARGS');
		}
		dictval = dictobj.GetDict();
		for (i=0; i<pairs.length; i+=2) {
			I.set_scalar(pairs[i+1], dictval[pairs[i]]);
		}

		function apply_updates(){
			var i, dictobj, dictval, varname, key;
			try {
				dictobj = I.get_var(dictvar);
			} catch(e){
				if (e instanceof types.TclError && /^TCL LOOKUP (DICT)|(VARNAME) /.test(e.errorcode.join(' '))) {
					return;
				}
				throw e;
			}
			if (dictobj.IsShared()) {
				dictobj = dictobj.DuplicateObj();
				I.set_var(dictvar, dictobj);
			}
			dictval = dictobj.GetDict();
			dictobj.bytes = null;
			for (i=0; i<pairs.length; i+=2) {
				key = vars[i];
				varname = vars[i+1];
				if (dictval[key] !== undefined) {
					dictval[key].DecrRefCount();
					delete dictval[key];
				}
				if (I.scalar_exists(varname)) {
					dictval[key] = I.get_scalar(varname);
					dictval[key].IncrRefCount();
				}
			}
		}

		return I.exec(body, function(res){
			try {
				apply_updates();
			} catch(e2){
				res = e2 instanceof TclError ? e2 : new TclError(e2);
			}
			return c(res);
		});
	},
	values: function(c, args, I){
		I.checkArgs(args, [1, 2], 'dictionaryValue ?globPattern?');
		args.shift();
		var dictobj = args.shift(),
			dictval = dictobj.GetDict(),
			glob = args.shift(),
			re, e, i, keys = utils.objkeys(dictval), out;

		if (glob !== undefined) {
			re = utils.glob2regex(glob.toString());
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
		return c(new ListObj(out));
	},
	'with': function(c, args, I){
		I.checkArgs(args, [2, null], 'dictionaryVariable ?key ...? body');
		args.shift();
		var dictvar = args.shift(),
			dictobj = I.get_var(dictvar),
			keys = args.slice(0, args.length-1),
			body = args[args.length-1],
			dictval, vars, i, kinfo;
		kinfo = resolve_keypath(I, dictobj, keys, false, dictvar);
		dictobj = kinfo.value;
		dictval = dictobj.GetDict();
		vars = utils.objkeys(dictval);
		for (i=0; i<vars.length; i++) {
			I.set_scalar(vars[i], dictval[vars[i]]);
		}

		function apply_updates(){
			var i, dictobj, dictval, varname;
			try {
				dictobj = I.get_var(dictvar);
				kinfo = resolve_keypath(I, dictobj, keys, false, dictvar);
			} catch(e){
				if (e instanceof types.TclError && /^TCL LOOKUP (DICT)|(VARNAME) /.test(e.errorcode.join(' '))) {
					return;
				}
				throw e;
			}
			dictobj = kinfo.value;
			dictval = dictobj.GetDict();
			dictobj.bytes = null;
			for (i=0; i<vars.length; i++) {
				varname = vars[i];
				if (dictval[varname] !== undefined) {
					dictval[varname].DecrRefCount();
					delete dictval[varname];
				}
				if (I.scalar_exists(varname)) {
					dictval[varname] = I.get_scalar(varname);
					dictval[varname].IncrRefCount();
				}
			}
		}

		return I.exec(body, function(res){
			try {
				apply_updates();
			} catch(e2){
				res = e2 instanceof TclError ? e2 : new TclError(e2);
			}
			return c(res);
		});
	}
};

function install(interp) {
	if (interp.register_extension('ex_dict_cmds')) {return;}

	interp.registerAsyncCommand('dict', function(c, args){
		var subcmd, cmd;
		if (args.length < 2) {
			interp.checkArgs(args, 1, 'subcmd args');
		}

		cmd = args.shift(); subcmd = args.shift();
		args.unshift(cmd+' '+subcmd);
		if (subcmds[subcmd] === undefined) {
			throw new TclError('unknown or ambiguous subcommand "'+subcmd+'": must be '+utils.objkeys(subcmds).join(', '),
				'TCL', 'LOOKUP', 'SUBCOMMAND', subcmd);
		}
		return subcmds[subcmd](c, args, interp);
	});
}

return {'install': install};
});
