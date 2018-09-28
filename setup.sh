#!/bin/bash
function print {
	echo "$@"
	echo
}

print Installing gulp...
npm install -g gulp-cli
print Gulp installed.
print Linking everything...
npm link
cd client
npm link
print Everything has been linked.
print Setup complete.
