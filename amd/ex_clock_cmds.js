/*global define */
define([
	'./utils',
	'./objtype_string',
	'./objtype_int',
	'./objtype_bool',
	'./types'
], function(
	utils,
	StringObj,
	IntObj,
	BoolObj,
	types
){
	'use strict';
	// Initially there is no 'locale' determination, only catering for simplistic clock functions
	// based on dd mm CCYY formats, and English 'names',  used in wf. Needs better handling of this
	// to determin the right format being passed through.

	var subcmds, TclError = types.TclError,
		meridian_regEx = /[AaPp].?[Mm].?/,
		months = ['January','February','March','April','May','June','July','August','September','October','November','December'],
		days = ['Sunday','Monday','Tuesday','Wednesday', 'Thursday', 'Friday', 'Saturday'],
		short_monthsregEx = /[Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec]/,
		short_months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sept','Oct','Nov','Dec'];

	function getTokens(str) {
		var i=0, tokens = [], t, is_isobase = false;
		function getNextToken(index) {
			var pos = index, sign = 0, token, count;
			while (true) {
				while (pos < str.length && /\s+/.test(str.charAt(pos))) {
					// check for space characters
					pos++;
				}
				if (pos >= str.length) {break;}
				if (isNumber(str.charAt(pos))) {
					// check for numerical characters
					token = 0;
					count = 0;
					while (pos < str.length && isNumber(str.charAt(pos))) {
						// prefix the character from the string, with the unary plus
					   	// operator so it is treated as a number
						token = 10 * token + +str.charAt(pos) - 0;
						pos++;
						count++;
					}
					i = pos;
					if (count >= 6) {
						is_isobase = true;
					}
					return token;
				} 
				if (isLetter(str.charAt(pos))) {
					var startIndex = pos;
					// Not using isNan as you can get false positive
					while (++pos < str.length) {
						// very simplistic check for 'letter'. Not fully accomodating and
						// needs to be improved.
						if (!isLetter(str.charAt(pos)) && !/\./.test(str.charAt(pos))) {
							break;
						}
					}
					i = pos;
					return str.substring(startIndex, pos);
				}
				i = pos+1;
				return str.charAt(pos);
			}
			i=pos+1;
			return null;
		}
		while ((t = getNextToken(i)) !== null) {
			tokens.push(t);
		}
		tokens.push(is_isobase);
		return tokens;
	};
	function isNumber(val) {
		return /^\d+$/.test(val);
	};
	function isLetter(val) {
		// very simplistic and does not cater for characters in other
		// languages - needs to be better.
		return /[A-Za-z]/.test(val);
	};
	function get_month_index(mth) {
		if (mth.length > 3){
			return months.indexOf(mth); 
		}
		return short_months.indexOf(mth); 
	};
	function pad_left(val, length) {
		var result = val.toString(), pad=length-result.length;

		while (pad > 0) {
			result = '0' + result;
			pad--;
		}
		return result;
	};
	function day_of_year(date) {
		var baseDate, yearStart;
		baseDate = new Date(date); //clone date
		baseDate.setHours(0, 0, 0);
		yearStart = new Date(baseDate.getFullYear(), 0, 1);
		return Math.ceil((baseDate - yearStart) / 864E5);
	};
	function week_of_year(date, day) {
		var baseDate, yearStart;
		baseDate = new Date(date); // copy the initial date
		baseDate.setHours(0, 0, 0);
		switch (day) {
			case 'thursday':
				// set to nearest Thursday, use Sunday = 7;
				baseDate.setDate(baseDate.getDate() +4 - (baseDate.getDay()||7)); 
				break;
			case 'monday':
				baseDate.setDate(baseDate.getDate() +1 - (baseDate.getDay()||7));
				break;
			case 'sunday':
				baseDate.setDate(baseDate.getDate() +7 - (baseDate.getDay()||7)); 
				break;
		}
		yearStart = new Date(baseDate.getFullYear(), 0, 1);
		return Math.ceil((baseDate - yearStart) / 864E5);
	};
	function get_full_year(y) {
		if (y.length === 4) {
			return y;
		}
		if (+y >= 69) {
			return '19' +y; 
		} else {
			return '20' +y;
		}
	}
	subcmds = {
		format: function(args, I) {
			I.checkArgs(args, [1, null], 'timeVal ?-option value...?');
			// remove first arg element of 'clock format'
			args.shift();
			var timeVal = args.shift(), arg, useGmt=false, baseClock, format,
				i, result = '', tokens = [], token = '',
				day, month, year, century, hour, minute, second;
			while (args.length > 0) {
				arg = args.shift().toString();
				switch (arg) {
					case '-locale':
					case '-timezone': break; // Not yet supported!!!
					case '-gmt': useGmt = /^(true|1|yes)$/i.test(args.shift()); break;
					case '-base': baseClock = new Date(args.shift()*1000); break;
					case '-format': format = args.shift().toString(); break;
				}
			}
			// the epoch will be in seconds - convert to milliseconds
			baseClock = new Date(+timeVal * 1000);
			if (format === undefined || format === '') {
				format = '%a %b %d %H:%M:%S %Z %Y';
			}
			var foo = new Date();
			var bar = new Date(+timeVal*1000);
			for (i=0; i < format.length; i++) {
				if (format.charAt(i) === '%' && i+1 < format.length) {
					switch (format.charAt(++i)) {
						case '%': // insert a %
							token  = '%'; 
							break;
						case 'a': // Abbreviated weekday name
							token = (days[baseClock.getDay()]).substring(0,3);
							break;
						case 'A': // Full weekday name
							token = days[baseClock.getDay()];
							break;
						case 'h':
						case 'b': // Abbreviated month name;
							token = (months[baseClock.getMonth()]).substring(0,3);
							break;
						case 'B': // Full month name
							token = months[baseClock.getMonth()];
							break;
						case 'c': // localized specific format
							// until this is implemented, return common locale string;
							token = baseClock.toLocaleString();
						case 'C': // Century (00 - 99)
							century = +baseClock.getFullYear()/100;
							//token = (century < 10 ? '0' : '') + century;
							token = pad_left(century, 2);
							break;
						case 'd': // Day of the month (1 -31), with leading zero
							day = baseClock.getDate();
							//oken = (day.length < 2 ? '0' : '') + day;
							token = pad_left(day, 2);
							break;
						case 'D': // only used with en_US as it means %m/%d/%Y
							token = baseClock.getMonth() + ' ' + baseclock.getDate() + ' ' +
								baseClock.getFullYear();
							break;
						case 'e': // Day of month with no leading zero;
							token = baseClock.getDate();
							break;
						case 'H': // Hour in 24 hour format (00-23), with leading zero
							hour = baseClock.getHours();
							//token = (hour.length < 2 ? '0' : '') + hour;
							token = pad-left(hour, 2);
							break;
						case 'I': // Hour in 12 hour format (01 -12), with leading zero
							hour = baseClock.getHours();
							if (hour > 12) {
								hour = hour - 12;
							}
							//token = (hour.length < 2 ? '0' : '') + hour;
							token = pad_left(hour, 2);
							break;
						case 'j': // Day of the year (001 - 366), with leading zeros
							token = pad_left(day_of_year(baseClock), 3);
						case 'k': // Hour in 24 hour format (00-23), no leading zeros
							token = baseClock.getHours();
							break;
						case 'l': // Hour in 12 hour format (01 -12), no leading zero
							hour = baseClock.getHours();
							if (hour > 12) {
								hour = hour - 12;
							}
							token = hour;
							break;
						case 'm': // Month number (01 -12), with leading zero
							month = baseClock.getMonth(); // returns from index 0
							token = pad_left(month+1, 2);
							break;
						case 'M': // Minutes (01 -59), with leading zero
							minute = baseClock.getMinutes();
							token = pad_left(minute, 2);
							break;
						case 'n': // insert a newline
							token  = '\\n'; 
							break;
						case 'N': // Month number (1 -12), no leading zero
							token = baseClock.getMonth();
							break;
						case 'p':
						case 'P': // AM/PM indicator preferrabley in lowercase (locale specific)
							hour = baseClock.getHours(); // in 24 hour format
							token = 'am';
							if (hour > 12) {
								token = 'pm';
							}
							break;
						case 'R': // locale specific time 
							// TODO: 'r' case in 12 hour format
							token = baseClock.toLocaleTimeString();
							break;
						case 's': //seconds since epoch
							token = baseClock.getTime();
							break;
						case 'S': //seconds (00-59) with leading zeros
							second = baseClock.getSeconds();
							token = pad_left(second, 2);
							break;
						case 't': // insert tab
							token = '\\t';
							break;
						case 'T': // %H:%M:%S
							token = baseClock.toLocaleTimeString();
							break;
						case 'u': // day of week, monday = 1 ... sunday = 7
							day = baseClock.getDay();
							if (day === 0) {
								day = 7;
							}
							token = day;
							break;
						case 'U': // Week of the year, where Sunday is the first day considered
							week = week_of_year(baseClock, 'sunday');
							token = pad_left(week, 2);
							break;
						case 'V': // iso week of the year (0 - 52). The week containing the first
								// Thursday of the year will be 01
							week = week_of_year(baseClock, 'thursday');
							token = pad_left(week, 2);
							break;
						case 'w': // day of week Sunday = 0
							token = baseClock.getDay();
							break;
						case 'U': // Week of the year, where Monday is the first day considered
							week = week_of_year(baseClock, 'monday');
							token = pad_left(week, 2);
							break;
						case 'y': // year without century (00-99)
							year = baseClock.getFullYear();
							token = pad_left(year.substring(2, 4), 2);
							break;
						case 'Y':
							token = baseClock.getFullYear();
							break;
						default:
							token = format.charAt(i);
							break;
					}
					tokens.push(token);
				} else {
					tokens.push(format.charAt(i));
				}
			}
		   return tokens.join('');	
		},
		scan: function(args, I) {
			/* clock scan inputString ?-option value...? */
			I.checkArgs(args, [1, null], 'inputString ?-option value...?');
			// remove first arg element of 'clock scan'
			args.shift();
			// simply using Date.parse(arg[0]) could be ambiguous and lead to some
			// problems.
			var dateString = args.shift().toString(), arg, useGmt = false, 
				baseClock = new Date(), date = new Date(), dateTokens = [], i =0,
				hasTime = 0, hasZone = 0, hasDate = 0, hasDay = 0, hasOrdMonth = 0, hasRel =0, 
				has_meridian = meridian_regEx.test(dateString) ? true : false,
				use_dst = /dst/i.test(dateString), is_isobase = false;
			// free-form scan is deprecated due to ambiguities, but still supported.
			// If '-format' is not provided, then the options of '-timezone' and
			// '-locale' should throw an error if present.
			// TODO: 	timezone offsets from provided timezone
			// 			check that 'base' is a numerical value
			while (args.length > 0) {
				arg = args.shift().toString();
				switch (arg) {
					case '-locale':
					case '-timezone': break; // Not yet supported!!!
					case '-gmt': useGmt = /^(true|1|yes)$/i.test(args.shift()); break;
					case '-base': baseClock = new Date(args.shift()*1000); break;
				}
			}
			dateTokens = getTokens(dateString);
			is_isobase = dateTokens.pop(); // last element is boolean
			function parseTime() {
				var pos = i, offset_length = 0, hour_offset = 0, min_offset = 0, offset=0;
				// check for format hh:mm:ss-n?nnn?
				if (
					pos+6 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/:/.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2]) &&
					/:/.test(dateTokens[pos+3]) &&
					isNumber(dateTokens[pos+4]) &&
					/-/.test(dateTokens[pos+5]) &&
					isNumber(dateTokens[pos+6])
				) {
					offset_length = dateTokens[pos+6].length;
					switch (offset_length) {
						case '4':
							hour_offset = +dateTokens[pos+6].substring(0,2);
							min_offset = +dateTokens[pos+6].substring(2,4);
							break;
						case '3':
							hour_offset = +dateTokens[pos+6].substring(0,1);
							min_offset = +dateTokens[pos+6].substring(1,3);
							break;
						case '2':
						case '1':
							min_offset = +dateTokens[pos+6]
							break;
					}
					
					offset = (hour_offset * 60) + min_offset + date.getTimezoneOffset(); //in minutes
					date = new Date(date.getTime() + (offset * 60 * 1000));
					i = pos+7;
					return true;
				}
				// check for format hh:mm:ss ?meridian?
				if (
					pos+4 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/:/.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2]) &&
					/:/.test(dateTokens[pos+3]) &&
					isNumber(dateTokens[pos+4])
				) {
					date.setHours(dateTokens[pos],dateTokens[pos+2],dateTokens[pos+4]);
					if (has_meridian) {
						if (/[Pp].?[Mm].?/i.test(dateString)) {
							date.setHours(dateTokens[pos]+12,dateTokens[pos+2],dateTokens[pos+4]);
						}
					}
					i = pos+5;
					return true;
				}
				// check for format hh:mm-n?nnn?
				if (
					pos+4 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/:/.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2]) &&
					/-/.test(dateTokens[pos+3]) &&
					isNumber(dateTokens[pos+4])
				) {
					offset_length = dateTokens[pos+4].length;
					switch (offset_length) {
						case '4':
							hour_offset = +dateTokens[pos+4].substring(0,2);
							min_offset = +dateTokens[pos+4].substring(2,4);
							break;
						case '3':
							hour_offset = +dateTokens[pos+4].substring(0,1);
							min_offset = +dateTokens[pos+4].substring(1,3);
							break;
						case '2':
						case '1':
							min_offset = +dateTokens[pos+4]
							break;
					}
					offset = (hour_offset * 60) + min_offset + date.getTimezoneOffset(); //in minutes
					date = new Date(date.getTime() + (offset * 60 * 1000));
					i = pos+5;
					return true;
				}
				// check for format hh:mm ?meridian?
				if (
					pos+2 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/:/.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2])
				) {
					date.setHours(dateTokens[pos],dateTokens[pos+2]);
					if (has_meridian) {
						if (/[Pp].?[Mm].?/i.test(dateString)) {
							date.setHours(dateTokens[pos]+12,dateTokens[pos+2]);
						}
					}
					i = pos+3;
					return true;
				}
				if (
					pos+1 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					meridian_regEx.test(dateTokens[pos+1])
				) {
					date.setHours(dateTokens[pos]);
					if (/[Pp].?[Mm].?/i.test(dateString)) {
						date.setHours(dateTokens[pos]+12);
					}
					i = pos+1;
					return true;
				}
				return false;
			}
			function parseZone() {
				var pos = i;
				// TODO: check zone info. Presently, the simple usage of 'clock'
				// required for own use, does not use zones, but it should be
				// included going forward
				return false;
			}
			function parseIso() {
				var pos = i;
				// TODO: check what format we get info in here and work through it
				if (is_isobase) {
				}
				return false;
			}
			function parseDate() {
				var pos = i, m, d, y;
				// Does not yet accomodate mm/dd/CCYY as we do not
				// know the 'locale'. Only working on what CF needs
				// in the very short term which is dd mm CCYY

				// check for format dd/mm/CCYY
				if (
					pos+6 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/\//.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2]) &&
					/\//.test(dateTokens[pos+3]) &&
					isNumber(dateTokens[pos+4])
				) {
					// date.setYear is deprecated.
					date.setFullYear(get_full_year(dateTokens[pos+4]));
					// needs proper handling of 'locale' to determine
					// the format of dd/mm vs mm/dd
					date.setMonth(+dateTokens[pos+2]-1); // months start with index 0
					date.setDate(dateTokens[pos]);
					i = pos+5;
					return true;
				}
				// check for format dd-MMM-CCYY
				if (
					pos+4 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/-/.test(dateTokens[pos+1]) &&
					short_monthsregEx.test(dateTokens[pos+2]) &&
					/-/.test(dateTokens[pos+3]) &&
					isNumber(dateTokens[pos+4])
				) {
					m = get_month_index(dateTokens[pos+2]); 
					date.setFullYear(get_full_year(dateTokens[pos+4]));
					date.setMonth(m);
					date.setDate(dateTokens[pos]);
					i = pos+5;
					return true;
				}
				// check for format dd-mm-CCYY
				if (
					pos+4 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/-/.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2]) &&
					/-/.test(dateTokens[pos+3]) &&
					isNumber(dateTokens[pos+4])
				) {
					date.setFullYear(get_full_year(dateTokens[pos+4]));
					date.setMonth(+dateTokens[pos+2]-1);
					date.setDate(dateTokens[pos]);
					i = pos+5;
					return true;
				}
				// check for format MMM dd, CCYY
				if (
					pos+3 < dateTokens.length &&
					short_monthsregEx.test(dateTokens[pos]) &&
					isNumber(dateTokens[pos+1]) &&
					/,/.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+3])
				) {
					date.setFullYear(get_full_year(dateTokens[pos+3]));
					date.setMonth(m);
					date.setDate(dateTokens[pos+1]);
					i = pos+4;
					return true;
				}
				// check for format dd/mm
				if (
					pos+2 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					/\//.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2])
				) {
					date.setMonth(+dateTokens[pos+2]-1);
					date.setDate(dateTokens[pos]);
					i = pos+3;
					return true;
				}
				// check for format dd MM CCYY
				if (
					pos+2 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					short_monthsregEx.test(dateTokens[pos+1]) &&
					isNumber(dateTokens[pos+2])
				) {
					m = get_month_index(dateTokens[pos+1]); 
					date.setFullYear(get_full_year(dateTokens[pos+2]));
					date.setMonth(m);
					date.setDate(dateTokens[pos]);
					i = pos+3;
					return true;
				}
				// check for format dd MMM
				if (
					pos+1 < dateTokens.length &&
					isNumber(dateTokens[pos]) &&
					short_monthsregEx.test(dateTokens[pos+1])
				) {
					m = get_month_index(dateTokens[pos+1]); 
					date.setMonth(m);
					date.setDate(dateTokens[pos]);
					i = pos+2;
					return true;
				}
				// check for format MMM dd
				if (
					pos+1 < dateTokens.length &&
					short_monthsregEx.test(dateTokens[pos]) &&
					isNumber(dateTokens[pos+1])
				) {
					m = get_month_index(dateTokens[pos]); 
					date.setMonth(m);
					date.setDate(dateTokens[pos+1]);
					i = pos+1;
					return true;
				}
				// check for format ddmmCCYY
				if (
					pos < dateTokens.length &&
					is_isobase
				) {
					// TODO: use GetInt()
					date.setFullYear(get_full_year(Math.floor(+dateTokens[pos]/10000)));
					// months start from 0 so subtract 1 from date given
					date.setMonth(Math.floor((+dateTokens[pos]%10000)) / 100 - 1);
					date.setDate(Math.floor(+dateTokens[pos]%100));
					i = pos+1;
					return true;
				}
				return false;
			}
			function parseDay() {
				// Not yet implemented
				return false;
			}
			function parseOrdMonth() {
				// not yet implemented
				return false;
			}
			function parseRelSpec() {
				// not yet implemented
				return false;
			}
			function parseNumber() {
				// not yet implemented
				return false;
			}

			while (i < dateTokens.length) {
				if (parseTime()) {
					hasTime++;
					break;
				} else if (parseZone()) {
					hasZone++;
					break;
				} else if (parseIso()) {
					hasDate++;
					break;
				} else if (parseDate()) {
					hasDate++;
					// could have a time at the end of the string
					parseTime();
					break;
				} else if (parseDay()) {
					hasDay++;
					break;
				} else if (parseOrdMonth()) {
					hasOrdMonth++;
					break;
				} else if (parseRelSpec()) {
					hasRel++;
					break;
				} else if (parseNumber()) {
					hasNumber++;
					break;
				} else {
					console.log("Eeeeek - ");
					break;
				}
			}
			if (hasTime > 1 || hasZone > 1 || hasDate > 1 || hasDay > 1 || hasOrdMonth > 1) {
				// TclError??
				throw new Error('unable to convert date-time string "'+dateString+'"');
			}
			//console.log("return time in epoch of: "+date.toDateString()+", "+date.toTimeString());
			return new IntObj(Math.round(date.getTime()/1000));
		},
		clicks: function(args, I) {
			/* clock clicks ?-option? */
			I.checkArgs(args, [1, 2], '?-option?');
			var arg = '-microseconds', d = new Date();
			// no 'options' is supposed to default to system-dependant setting
			// use microseconds for now, being a common default
			if (args.length > 0) {
				arg = args.shift().toString();
			}
			// preferred method is 'clock microseconds' or 'clock milliseconds'
			// but this is still viable.
			switch (arg) {
				case '-microseconds': return new IntObj(d.getTime());
				case '-milliseconds': return new IntObj(Math.round(d.getTime() * 1000));
			}
		},
		milliseconds: function(args, I) {
			/* clock milliseconds */
			// ignore any args - simply return the current time
			// as an integer in millieseconds
			var d = new Date();
			return new IntObj(d.getTime());
		},
		seconds: function(args, I) {
			/* clock seconds */
			// ignore any args - simply return the current time
			// as an integer in seconds
			var d = new Date();
			// pass through Math.round to remove decimal placings for now...
			return new IntObj(Math.round(d.getTime() / 1000));
		},
		microseconds: function(args, I) {
			/* clock seconds */
			// ignore any args - simply return the current time
			// as an integer in seconds
			var d = new Date();
			return new IntObj(Math.round(d.getTime() * 1000));
		}
	};
	function install(interp) {
		if (interp.register_extension('ex_clock_cmds')) {return;}
		interp.registerCommand('clock', function(args) {
			var subcmd, fakeargs=args.slice(1);
			if (args.length < 2) {
				interp.checkArgs(args, 1, 'subcmd args');
			}

			subcmd = args[1];
			fakeargs[0] = args[0]+' '+subcmd;
			if (subcmds[subcmd] === undefined) {
				throw new TclError('unknown or ambiguous subcommand "'+subcmd+'": must be '+utils.objkeys(subcmds).join(', '),
					['TCL', 'LOOKUP', 'SUBCOMMAND', subcmd]);
			}
			return subcmds[subcmd](fakeargs, interp);
		});
	}
	return{'install': install};
});
