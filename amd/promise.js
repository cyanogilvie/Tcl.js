/*jslint plusplus: true, white: true, nomen: true */
/*global define, setTimeout */

define([], function(){
'use strict';

var WAITING = 0,
	RESOLVED = 1,
	REJECTED = 2;

return function() {
	this.resolved_cbs = [];
	this.err_cbs = [];
	this.status = WAITING;
	this.result = null;
	this.err = null;

	this.then = function(callback, errback) {
		switch (this.status) {
			case WAITING:
				if (callback) {
					this.resolved_cbs.push(callback);
				}
				if (errback) {
					this.err_cbs.push(errback);
				}
				break;
			case RESOLVED:
				callback(this.result);
				break;
			case REJECTED:
				callback(this.err);
				break;
		}
	};

	function run_cbs(cbs, value) {
		var i;
		function defer_throw(e) {
			setTimeout(function(){
				throw e;
			}, 0);
		}
		for (i=0; i<cbs.length; i++) {
			try {cbs[i].call(null, value);} catch (e) {
				defer_throw(e);
			}
		}
	}

	this.resolve = function(value) {
		if (this.status !== WAITING) {throw new Error('Already fulfilled');}
		this.result = value;
		this.status = RESOLVED;
		run_cbs(this.resolved_cbs, value);
	};

	this.reject = function(err) {
		if (this.status !== WAITING) {throw new Error('Already fulfilled');}
		this.err = err;
		this.status = REJECTED;
		run_cbs(this.err_cbs, err);
	};
};
});
