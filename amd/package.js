/*jslint white: true */
var profile = (function(){
	function copyOnly(filename, mid) {
		return [
			'package.js',
			'package.json'
			].indexOf(filename.split('/').pop()) >=0 ||
			/(png|jpg|jpeg|gif|svg)$/.test(filename);
	}
	function test(filename, mid) {
		return filename.split('/').pop() === 'test.js';
	}
	return {
		basePath: '.',
		releaseDir: 'dist',
		releaseName: '',
		action: 'release',
		packages: [
			{name: 'tcl', location: '.'}
		],
		layerOptimize: 'closure',
		optimize: 'closure',
		layers: {
			'tcl/parser': {
				include: ['tcl/parser']
			},
			'tcl/core': {
				include: ['tcl/coreinterp']
			},
			'tcl/interp': {
				include: ['tcl/interp']
			}
		},
		resourceTags: {
			test: function(filename, mid) {
				return test(filename, mid);
			},
			copyOnly: function(filename, mid) {
				return copyOnly(filename, mid);
			},
			amd: function(filename, mid) {
				return !test(filename) && !copyOnly(filename, mid) && /\.js$/.test(filename);
			}
		}
	};
}());
