@echo off

title Bluespess Installation

echo Installing gulp...

echo.
call npm install -g gulp-cli

echo.
echo Gulp installed.

echo.
echo Linking everything...

echo.
call npm link
cd client
call npm link

echo.
echo Everything has been linked.

echo.
echo Setup complete.

echo.
pause