#!/bin/sh

export CLASSPATH=~/bin/compiler.jar:~/bin/js.jar
java org.mozilla.javascript.tools.shell.Main /usr/local/bin/r.js -o app-closure.build.js
