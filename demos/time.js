/*global window */

var now = (function(){
	// From https://gist.github.com/2993641
	var perf = window.performance || {};
	var fn = perf.now || perf.mozNow || perf.webkitNow || perf.msNow || perf.oNow;
	// fn.bind will be available in all the browsers that support the advanced window.performance... ;-)
	return fn ? fn.bind(perf) : function() { return new Date().getTime(); };
})();

export default function time(f, cb){
	var before, after, res;

	before = now();
	res = f();
	after = now();
	cb((after-before) * 1000);
	return res;
};
