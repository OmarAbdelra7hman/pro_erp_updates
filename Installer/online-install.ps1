param([string]$SetupType)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$selfUrl = '__SELF_URL__'
$repository = 'https://raw.githubusercontent.com/OmarAbdelra7hman/pro_erp_updates/main/'
$desktopPackagePath = 'installer/ProERP.Desktop.zip'
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Clear-Host
Write-Host '========================================' -ForegroundColor DarkCyan
Write-Host '          ProERP Online Setup' -ForegroundColor Cyan
Write-Host '========================================' -ForegroundColor DarkCyan
if ($SetupType -and $SetupType -notin @('1', '2')) {
    Write-Host "Invalid SetupType: $SetupType" -ForegroundColor Red
    Write-Host 'Use 1 for Desktop client or 2 for Web server.'
    exit 1
}

if (-not $SetupType) {
    Write-Host '[1] Desktop client'
    Write-Host '[2] Web server'
    do { $SetupType = Read-Host 'Choose installation type (1 or 2)' } until ($SetupType -in @('1', '2'))
}

if (-not $isAdmin) {
    $elevatedScript = Join-Path $env:TEMP 'proerp-online-install.ps1'
    Invoke-WebRequest $selfUrl -UseBasicParsing -OutFile $elevatedScript
    Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $elevatedScript + '"'), '-SetupType', $SetupType) -Wait
    exit
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function ConvertFrom-Base64Url([string]$value) {
    $base64 = $value.Replace('-', '+').Replace('_', '/')
    while (($base64.Length % 4) -ne 0) { $base64 += '=' }
    return [Convert]::FromBase64String($base64)
}

function Test-ManifestSignature([object]$value) {
    try {
        if ([string]::IsNullOrWhiteSpace([string]$value.signature)) { return $false }
        $builder = [Text.StringBuilder]::new()
        [void]$builder.Append("ProERP-Update-Manifest-V1`n")
        [void]$builder.Append([string]$value.version).Append("`n")
        $published = ([DateTime]$value.publishedAt).ToUniversalTime().ToString('O', [Globalization.CultureInfo]::InvariantCulture)
        [void]$builder.Append($published).Append("`n")
        foreach ($file in $value.files) {
            $path = [string]$file.path
            if ($path.IndexOfAny([char[]]"`r`n`t") -ge 0) { return $false }
            [void]$builder.Append($path).Append("`t")
            [void]$builder.Append(([string]$file.hash).ToLowerInvariant()).Append("`t")
            [void]$builder.Append(([long]$file.size).ToString([Globalization.CultureInfo]::InvariantCulture)).Append("`n")
        }

        $parameters = [Security.Cryptography.RSAParameters]::new()
        $parameters.Modulus = ConvertFrom-Base64Url 'mjgNM7QuvQ05LPEsqW6_MUBuZjDq33gFFuRsEdHoIPhwar1BPu7yhuNFShnGjhem7y59AegKlV50rWzUDBLqkdSvvkrZ3SAr-Ii6zMC6YfBdYEvo4XYmIoJpgGn0Svp0jJB8P362Eriu0tOq4livrxyciI8cU3ZTJYsH67tRT5DjotfQtPdbTf8D-VfFZSevuXFfnFN-5Z7ykwTjf_QL1Iwj9SYUDGzjqScjZxuXsJDtVrAXclmHfK7GJ71z3G7ZRi1KcEosz9dUKrx5BJOZK7oAc9dxP9ZaMFLMyFNAa-550qLUFRol7UIK3YKX6p34L9OsaXDKg7t1wHlAQghZiiwPTag8c9XqI1Cg_6cTHLN-r9Yw3MNTZvblhztlSd0muwS9ljBTFMYUwB3OUqBS7e5GABAUxuVSk67JrJHjf2ToTOM6MxcNOvn_FRJR87E48mYcWN1oh8eq8VdYXzHosZ3fDe6UZI2yCdZs5EUAyfLHIMnrncM0Ns27Ps9B-qDv'
        $parameters.Exponent = ConvertFrom-Base64Url 'AQAB'
        $rsa = [Security.Cryptography.RSA]::Create()
        $rsa.ImportParameters($parameters)
        try {
            return $rsa.VerifyData(
                [Text.Encoding]::UTF8.GetBytes($builder.ToString()),
                [Convert]::FromBase64String([string]$value.signature),
                [Security.Cryptography.HashAlgorithmName]::SHA256,
                [Security.Cryptography.RSASignaturePadding]::Pkcs1)
        } finally {
            $rsa.Dispose()
        }
    } catch {
        return $false
    }
}

$manifest = Invoke-RestMethod ($repository + 'manifest.json?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing
if (-not $manifest.files -or $manifest.files.Count -eq 0) { throw 'The release manifest is empty.' }
if (-not (Test-ManifestSignature $manifest)) { throw 'The release manifest signature is invalid or missing.' }

function Test-Runtime([string]$pattern) {
    try { return ((& dotnet --list-runtimes 2>$null) -match $pattern).Count -gt 0 } catch { return $false }
}

function Install-Exe([string]$url, [string]$fileName, [string]$arguments) {
    $path = Join-Path $env:TEMP $fileName
    Invoke-WebRequest $url -UseBasicParsing -OutFile $path
    $process = Start-Process $path -ArgumentList $arguments -Wait -PassThru
    Remove-Item $path -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -notin @(0, 3010)) { throw "$fileName failed ($($process.ExitCode))." }
}

function Install-RequiredRuntime([bool]$desktop) {
    if ($desktop -and -not (Test-Runtime '^Microsoft\.WindowsDesktop\.App 9\.')) {
        Write-Host 'Installing .NET 9 Desktop Runtime...'
        Install-Exe 'https://builds.dotnet.microsoft.com/dotnet/WindowsDesktop/9.0.15/windowsdesktop-runtime-9.0.15-win-x64.exe' 'proerp-desktop-runtime.exe' '/install /quiet /norestart'
    } elseif (-not $desktop -and -not (Test-Runtime '^Microsoft\.AspNetCore\.App 9\.')) {
        Write-Host 'Installing .NET 9 Hosting Bundle...'
        Install-Exe 'https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/9.0.15/dotnet-hosting-9.0.15-win.exe' 'proerp-dotnet-hosting.exe' '/install /quiet /norestart'
    }
}

function Install-PostgreSql {
    $psql = Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($psql) { Write-Host "PostgreSQL is already installed: $($psql.FullName)" -ForegroundColor Green; return }
    Write-Host 'PostgreSQL was not found. Installing PostgreSQL 16 silently...'
    Install-Exe 'https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64.exe' 'proerp-postgresql.exe' '--mode unattended --unattendedmodeui none --superpassword postgres --serverport 5432 --disable-components stackbuilder'
    if (-not (Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Select-Object -First 1)) { throw 'PostgreSQL installation completed but psql.exe was not found.' }
}

function Get-ReleaseFile([object]$file, [string]$destination) {
    New-Item -ItemType Directory -Path (Split-Path $destination) -Force | Out-Null
    $urlPath = (($file.path -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    Invoke-WebRequest ($repository + $urlPath) -UseBasicParsing -OutFile $destination
    if ($file.hash) {
        $actual = (Get-FileHash $destination -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -ne ([string]$file.hash).ToLowerInvariant()) { throw "Hash check failed: $($file.path)" }
    }
}

function Install-DesktopClient {
    Install-RequiredRuntime $true
    $package = $manifest.files | Where-Object { $_.path -eq $desktopPackagePath } | Select-Object -First 1
    if (-not $package) { throw 'Desktop package is not published yet. Publish a new release using ProERP Publisher first.' }
    $target = Join-Path $env:ProgramFiles 'ProERP Desktop'
    $zip = Join-Path $env:TEMP 'ProERP.Desktop.zip'
    Write-Host 'Downloading the desktop client...'
    Get-ReleaseFile $package $zip
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Expand-Archive $zip $target -Force
    Remove-Item $zip -Force -ErrorAction SilentlyContinue
    $serverUrl = Read-Host 'Enter the web server URL (example: http://192.168.1.10:5005)'
    if ([string]::IsNullOrWhiteSpace($serverUrl)) { $serverUrl = 'http://localhost:5005' }
    @{ ServerUrl = $serverUrl.Trim().TrimEnd('/') } | ConvertTo-Json | Set-Content (Join-Path $target 'desktopsettings.json') -Encoding UTF8
    $exe = Join-Path $target 'ProERP.Desktop.Wpf.exe'
    if (-not (Test-Path $exe)) { throw 'Desktop executable was not found in the package.' }
    $shell = New-Object -ComObject WScript.Shell
    foreach ($link in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ProERP Desktop.lnk'), (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\ProERP Desktop.lnk'))) {
        $shortcut = $shell.CreateShortcut($link); $shortcut.TargetPath = $exe; $shortcut.WorkingDirectory = $target; $shortcut.IconLocation = $exe; $shortcut.Save()
    }
    Write-Host 'Desktop client installed successfully.' -ForegroundColor Green
    Start-Process $exe
}

function Install-WebServer {
    Install-RequiredRuntime $false
    Install-PostgreSql
    $target = 'C:\ProERP'; $serviceName = 'ProERP'
    if (Get-Service $serviceName -ErrorAction SilentlyContinue) { Stop-Service $serviceName -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    $serverFiles = @($manifest.files | Where-Object { $_.path -ne $desktopPackagePath })
    $index = 0
    foreach ($file in $serverFiles) {
        $relative = ([string]$file.path).Replace('/', '\')
        if ([IO.Path]::IsPathRooted($relative) -or $relative.Contains('..')) { throw "Unsafe path: $relative" }
        Get-ReleaseFile $file (Join-Path $target $relative)
        $index++; Write-Progress -Activity 'Installing ProERP Server' -Status "$index / $($serverFiles.Count)" -PercentComplete (($index * 100) / $serverFiles.Count)
    }
    $settings = Join-Path $target 'appsettings.json'
    if (-not (Test-Path $settings)) { '{"SetupConfig":{"IsSetupComplete":false}}' | Set-Content $settings -Encoding UTF8 }
    $exe = Join-Path $target 'ProERP.Web.exe'
    if (-not (Test-Path $exe)) { throw 'ProERP.Web.exe was not found in the release.' }
    $binaryPath = '"' + $exe + '"'
    if (-not (Get-Service $serviceName -ErrorAction SilentlyContinue)) { New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName 'ProERP Server' -Description 'ProERP web application service' -StartupType Automatic | Out-Null }
    else { sc.exe config $serviceName binPath= $binaryPath start= auto | Out-Null }
    sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
    if (-not (Get-NetFirewallRule -DisplayName 'ProERP HTTP 5005' -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName 'ProERP HTTP 5005' -Direction Inbound -Protocol TCP -LocalPort 5005 -Action Allow | Out-Null }
    Start-Service $serviceName
    Write-Progress -Activity 'Installing ProERP Server' -Completed
    Write-Host 'Web server installed successfully: http://localhost:5005' -ForegroundColor Green
    Start-Process 'http://localhost:5005'
}

if ($SetupType -eq '1') { Install-DesktopClient } else { Install-WebServer }
