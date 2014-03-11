switch -- $foo {
	a {puts "This is a"}
	b -
	{something else} {
		set foo $bar
	}

	"c or other" -
	default {
		set foo [baz]
	}
}
