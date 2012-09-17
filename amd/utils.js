/*jslint white: true */
/*global define */
define(function(){
'use strict';
return {
	glob2regex: function(glob) {
		var re = String(glob).replace(/([.+\^$\\(){}|\-])/g, '\\$1');
		re = re.replace(/\*/g, '.*');
		re = re.replace(/\?/g, '.');
		return new RegExp(re);
	},

	objkeys: Object.prototype.keys ? function(o){return o.keys();} : function(o){
		var e, res = [];
		for (e in o) {
			if (o.hasOwnProperty(e)) {
				res.push(e);
			}
		}
		return res;
	}
};
});
