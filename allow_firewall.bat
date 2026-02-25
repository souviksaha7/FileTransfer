@echo off
REM Allow port 3000 through Windows Firewall
netsh advfirewall firewall add rule name="Allow Port 3000" dir=in action=allow protocol=tcp localport=3000
netsh advfirewall firewall add rule name="Allow Port 3000 WebSocket" dir=in action=allow protocol=tcp localport=3000
echo.
echo Firewall rules added! Port 3000 is now accessible from other devices.
pause
