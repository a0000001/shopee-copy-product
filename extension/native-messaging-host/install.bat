@echo off
setlocal EnableExtensions DisableDelayedExpansion

set "HOST_NAME=com.shopee.catalog_server"
set "SCRIPT_DIR=%~dp0"
set "RUN_HOST_PATH=%SCRIPT_DIR%run_host.bat"
set "HOST_SCRIPT_PATH=%SCRIPT_DIR%catalog-server-host.py"
set "PROJECT_ROOT=%SCRIPT_DIR%..\.."
set "SERVER_SCRIPT_PATH=%PROJECT_ROOT%\scripts\local-catalog-server.py"
set "CATALOG_PATH=%PROJECT_ROOT%\docs\data\product-catalog-tw.json"
set "MANIFEST_PATH=%SCRIPT_DIR%%HOST_NAME%.installed.json"
set "REG_KEY=HKCU\Software\Google\Chrome\NativeMessagingHosts\%HOST_NAME%"

if not exist "%RUN_HOST_PATH%" (
  echo ERROR: run_host.bat was not found.
  exit /b 1
)

if not exist "%HOST_SCRIPT_PATH%" (
  echo ERROR: catalog-server-host.py was not found.
  exit /b 1
)

if not exist "%SERVER_SCRIPT_PATH%" (
  echo ERROR: scripts\local-catalog-server.py was not found.
  echo Please use the complete package, not the extension-only ZIP.
  exit /b 1
)

if not exist "%CATALOG_PATH%" (
  echo ERROR: docs\data\product-catalog-tw.json was not found.
  echo Please use the complete package, not the extension-only ZIP.
  exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python was not found in PATH.
  echo Install Python and make sure the python command is available.
  exit /b 1
)

echo.
echo Open chrome://extensions and copy the Extension ID.
echo The ID must contain 32 lowercase letters from a to p.
echo.
set /p "EXTENSION_ID=Enter the Chrome Extension ID: "
set "EXTENSION_ID=%EXTENSION_ID: =%"

if not defined EXTENSION_ID (
  echo ERROR: Extension ID cannot be empty.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$id = $env:EXTENSION_ID; if ($id -notmatch '^[a-p]{32}$') { exit 1 }"
if errorlevel 1 (
  echo ERROR: Invalid Extension ID.
  echo Copy the 32-character ID shown on chrome://extensions and try again.
  exit /b 1
)

set "JSON_RUN_HOST_PATH=%RUN_HOST_PATH:\=\%"
> "%MANIFEST_PATH%" echo {
>> "%MANIFEST_PATH%" echo   "name": "%HOST_NAME%",
>> "%MANIFEST_PATH%" echo   "description": "Shopee Catalog Server Manager",
>> "%MANIFEST_PATH%" echo   "path": "%JSON_RUN_HOST_PATH%",
>> "%MANIFEST_PATH%" echo   "type": "stdio",
>> "%MANIFEST_PATH%" echo   "allowed_origins": ["chrome-extension://%EXTENSION_ID%/"]
>> "%MANIFEST_PATH%" echo }

if errorlevel 1 (
  echo ERROR: Failed to create the Native Messaging manifest.
  exit /b 1
)

reg add "%REG_KEY%" /ve /t REG_SZ /d "%MANIFEST_PATH%" /f >nul
if errorlevel 1 (
  echo ERROR: Failed to register the Native Messaging Host.
  exit /b 1
)

reg query "%REG_KEY%" /ve >nul 2>&1
if errorlevel 1 (
  echo ERROR: Native Messaging Host registration could not be verified.
  exit /b 1
)

echo.
echo Installation completed successfully.
echo Restart Chrome before using the local catalog server.
echo Registered manifest: %MANIFEST_PATH%
exit /b 0
