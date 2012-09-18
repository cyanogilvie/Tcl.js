#!/bin/zsh
HERE="$(pwd)"
mkdir -p "$HERE/dist"
rm -rf dist/*
cd util/buildscripts
node "$HERE/dojo/dojo.js" load=build --profile "$HERE/amd/package.js" --releaseDir "$HERE/dist"

cd "$HERE"
rm dist/tcl/**/*.uncompressed.js
rm dist/tcl/**/*.consoleStripped.js
