import * as fs		from 'fs';

var bouncing = false;

export function trampoline(f) {
	if (bouncing) {return f;}
	bouncing = true;
	while (typeof f === 'function') {
		f = f();
	}
	bouncing = false;
	return f;
}

export function for_each_file(files, f, done) {
	var i=0;
	function next_file() {
		var fn = files[i++];
		if (fn === undefined) {
			if (done !== undefined) {
				return done();
			} else {
				return;
			}
		}

		fs.readFile(fn, 'utf8', function(err, data){
			f(fn, err, data);
			return trampoline(next_file);
		});
	}

	return trampoline(next_file);
}

