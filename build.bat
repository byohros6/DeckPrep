@echo off
echo Running automated test suite...
call npm test
if %errorlevel% neq 0 (
    echo Tests failed! Halting build.
    exit /b %errorlevel%
)

echo Building portable Windows executable...
call npm run dist:portable
if %errorlevel% neq 0 (
    echo Build failed!
    exit /b %errorlevel%
)

echo Build complete! Portable executable created in dist/
