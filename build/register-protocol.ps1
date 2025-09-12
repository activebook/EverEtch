# PowerShell script to register EverEtch URL protocol on Windows
# Run this as Administrator

param(
    [string]$AppPath = "",
    [switch]$Unregister
)

# Get the app path if not provided
if ($AppPath -eq "") {
    $AppPath = Read-Host "Enter the full path to EverEtch.exe"
}

# Validate the app path
if (!(Test-Path $AppPath)) {
    Write-Host "Error: EverEtch.exe not found at $AppPath" -ForegroundColor Red
    exit 1
}

$ProtocolName = "everetch"
$RegPath = "HKCU:\Software\Classes\$ProtocolName"

if ($Unregister) {
    Write-Host "Unregistering $ProtocolName protocol..." -ForegroundColor Yellow

    if (Test-Path $RegPath) {
        Remove-Item -Path $RegPath -Recurse -Force
        Write-Host "Successfully unregistered $ProtocolName protocol" -ForegroundColor Green
    } else {
        Write-Host "Protocol $ProtocolName was not registered" -ForegroundColor Yellow
    }
} else {
    Write-Host "Registering $ProtocolName protocol..." -ForegroundColor Yellow

    # Create the protocol key
    New-Item -Path $RegPath -Force | Out-Null

    # Set the default value (description)
    Set-ItemProperty -Path $RegPath -Name "(Default)" -Value "URL:EverEtch Protocol" -Type String

    # Set URL Protocol flag
    Set-ItemProperty -Path $RegPath -Name "URL Protocol" -Value "" -Type String

    # Create the shell/open/command subkey
    $CommandPath = "$RegPath\shell\open\command"
    New-Item -Path $CommandPath -Force | Out-Null

    # Set the command to execute
    $Command = "`"$AppPath`" `"%1`""
    Set-ItemProperty -Path $CommandPath -Name "(Default)" -Value $Command -Type String

    Write-Host "Successfully registered $ProtocolName protocol" -ForegroundColor Green
    Write-Host "You can now use URLs like: everetch://word/hello" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Usage examples:" -ForegroundColor White
Write-Host "  everetch://                    - Open EverEtch" -ForegroundColor Gray
Write-Host "  everetch://word/hello         - Open and navigate to word 'hello'" -ForegroundColor Gray
Write-Host "  everetch://profile/myprofile  - Open and switch to profile 'myprofile'" -ForegroundColor Gray
