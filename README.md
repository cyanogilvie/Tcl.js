Tcl in Javascript
=================

This project is an attempt at a robust, high performance subset of the Tcl language, implemented in Javascript.

Why Another One?
----------------

There are several other implementations of Tcl in Javascript, ranging from the toy level (around 1000 lines of js) to the behemoth.  I needed something a bit different from all the existing implementations:
* Pedantically correct syntax parsing (list, script and expressions), to the extent possible in Javascript.
* Production grade - enterprise frameworks rely on the code working the same as it did on a Tcl/Tk frontend.
* Sufficiently fast - it needs to run some pretty hot code, like realtime filters and transforms on datasets with tens of thousands of rows.
* As small as possible - since the whole codebase is downloaded at least once (even assuming caching works properly), the size over the wire should be as small as possible.
* Modular - to further address the above goal, the interpreter should be modular, allowing only those features that are needed to be loaded.
* Built as AMD modules (ala require.js).
* Targetting version 8.6 (but without TclOO, for now)
This attempt does not completely reach the above goals yet, but it is sufficiently close for my needs, and with time I hope that the supported subset will grow.

What Does It Look Like?
-----------------------

HTML:
```html
<!DOCTYPE html>
<html>
	<head>
		<script data-main="main" src="require.js"></script>
	</head>
	<body>
	</body>
</html>
```

main.js:
```javascript
require(['tcl/interp'], function(Interp){
	var I = Interp();

	I.registerCmd('puts', function(args){
		I.checkArgs(args, 1, 'string');
		console.log(args[1]);
	});

	I.TclEval('puts "hello, world"', function(result){
		switch (result.code) {
			case I.types.OK:
			case I.types.RETURN:
				break;
			case I.types.ERROR:
				console.warn('Uncaught error in Tcl script: '+result.result);
				break;
			default:
				console.warn('Unexpected return code from Tcl script: '+result.code);
		}
	});
});
```
