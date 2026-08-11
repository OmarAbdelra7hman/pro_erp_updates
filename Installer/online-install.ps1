param(
    [ValidateSet('', 'Menu', 'Desktop', 'Server', 'Update', 'Dependencies', 'Service', 'Uninstall')]
    [string]$Action = '',
    [ValidateSet('', 'DesktopRuntime', 'HostingBundle', 'PostgreSQL', 'QZTray')]
    [string]$Component = '',
    [string]$SetupType = '',
    [string]$ServerUrl = '',
    [ValidateSet('', 'Install', 'Remove', 'Start', 'Stop', 'Restart', 'Status')]
    [string]$ServiceOperation = '',
    [ValidateSet('', 'Desktop', 'Server', 'Service')]
    [string]$UninstallTarget = '',
    [switch]$ConfirmRemove
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
try { [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false) } catch {}

$selfUrl = '__SELF_URL__'
$repository = 'https://raw.githubusercontent.com/OmarAbdelra7hman/pro_erp_updates/main/'
$desktopPackagePath = 'installer/ProERP.Desktop.zip'
$serverTarget = 'C:\ProERP'
$desktopTarget = Join-Path $env:ProgramFiles 'ProERP Desktop'
$serviceName = 'ProERP'
$firewallRule = 'ProERP HTTP 5005'
$stateFileName = '.proerp-install-state.json'
$protectedServerFiles = @('appsettings.json', 'appsettings.Production.json', 'firebase-adminsdk.json', 'license.key')

if ($SetupType -eq '1') { $Action = 'Desktop' }
if ($SetupType -eq '2') { $Action = 'Server' }
if ([string]::IsNullOrWhiteSpace($Action)) { $Action = 'Menu' }

function Write-Title([string]$text) {
    Clear-Host
    Write-Host '============================================' -ForegroundColor DarkCyan
    Write-Host ('  ' + $text) -ForegroundColor Cyan
    Write-Host '============================================' -ForegroundColor DarkCyan
}

function Format-Bytes([double]$bytes) {
    if ($bytes -ge 1GB) { return ('{0:N2} GB' -f ($bytes / 1GB)) }
    if ($bytes -ge 1MB) { return ('{0:N1} MB' -f ($bytes / 1MB)) }
    if ($bytes -ge 1KB) { return ('{0:N1} KB' -f ($bytes / 1KB)) }
    return ('{0:N0} B' -f $bytes)
}

function Format-Duration([double]$seconds) {
    if ([double]::IsNaN($seconds) -or [double]::IsInfinity($seconds) -or $seconds -lt 0) { return '--:--' }
    $span = [TimeSpan]::FromSeconds([Math]::Ceiling($seconds))
    if ($span.TotalHours -ge 1) { return $span.ToString('hh\:mm\:ss') }
    return $span.ToString('mm\:ss')
}

function Get-SafeArguments {
    $result = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $script:ElevatedScript + '"'))
    if ($Action) { $result += @('-Action', $Action) }
    if ($Component) { $result += @('-Component', $Component) }
    if ($ServerUrl) { $result += @('-ServerUrl', ('"' + $ServerUrl.Replace('"', '\"') + '"')) }
    if ($ServiceOperation) { $result += @('-ServiceOperation', $ServiceOperation) }
    if ($UninstallTarget) { $result += @('-UninstallTarget', $UninstallTarget) }
    if ($ConfirmRemove) { $result += '-ConfirmRemove' }
    return $result
}

function Ensure-Administrator {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if ($admin) { return }
    if ($selfUrl -eq '__SELF_URL__') { throw 'Run this script as Administrator when testing it locally.' }
    $script:ElevatedScript = Join-Path $env:TEMP 'proerp-online-install.ps1'
    Invoke-WebRequest $selfUrl -UseBasicParsing -OutFile $script:ElevatedScript
    Start-Process powershell.exe -Verb RunAs -ArgumentList (Get-SafeArguments) -Wait
    exit
}

function Invoke-DownloadFile([string]$url, [string]$destination, [string]$label) {
    $folder = Split-Path -Parent $destination
    if ($folder) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
    $temporary = $destination + '.download'
    Remove-Item $temporary -Force -ErrorAction SilentlyContinue
    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.AllowAutoRedirect = $true
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromHours(2)
    $response = $null; $input = $null; $output = $null
    try {
        $response = $client.GetAsync($url, [Net.Http.HttpCompletionOption]::ResponseHeadersRead).GetAwaiter().GetResult()
        $response.EnsureSuccessStatusCode()
        $total = -1L
        if ($response.Content.Headers.ContentLength.HasValue) { $total = $response.Content.Headers.ContentLength.Value }
        $input = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        $output = [IO.File]::Open($temporary, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
        $buffer = New-Object byte[] (1024 * 256)
        $received = 0L; $watch = [Diagnostics.Stopwatch]::StartNew(); $lastUpdate = -1
        while (($read = $input.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $output.Write($buffer, 0, $read); $received += $read
            if ($watch.ElapsedMilliseconds - $lastUpdate -ge 200) {
                $lastUpdate = $watch.ElapsedMilliseconds
                $speed = if ($watch.Elapsed.TotalSeconds -gt 0) { $received / $watch.Elapsed.TotalSeconds } else { 0 }
                $percent = if ($total -gt 0) { [Math]::Min(100, [int](($received * 100) / $total)) } else { 0 }
                $eta = if ($total -gt 0 -and $speed -gt 0) { Format-Duration (($total - $received) / $speed) } else { '--:--' }
                $status = if ($total -gt 0) { "$(Format-Bytes $received) / $(Format-Bytes $total) | $(Format-Bytes $speed)/s | ETA $eta" } else { "$(Format-Bytes $received) | $(Format-Bytes $speed)/s" }
                Write-Progress -Id 1 -Activity ('Downloading ' + $label) -Status $status -PercentComplete $percent
                if ($env:PROERP_GUI -eq '1') { Write-Output ("__PROERP_PROGRESS__|{0}|{1}|{2}" -f $percent, $label, $status) }
            }
        }
        $output.Dispose(); $output = $null
        Move-Item $temporary $destination -Force
        Write-Progress -Id 1 -Activity ('Downloading ' + $label) -Completed
        if ($env:PROERP_GUI -eq '1') { Write-Output ("__PROERP_PROGRESS__|100|{0}|Download complete" -f $label) }
        Write-Host ("Downloaded {0} ({1})" -f $label, (Format-Bytes $received)) -ForegroundColor Green
    } catch {
        Write-Progress -Id 1 -Activity ('Downloading ' + $label) -Completed
        Remove-Item $temporary -Force -ErrorAction SilentlyContinue
        throw
    } finally {
        if ($output) { $output.Dispose() }
        if ($input) { $input.Dispose() }
        if ($response) { $response.Dispose() }
        $client.Dispose(); $handler.Dispose()
    }
}

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
        $rsa = [Security.Cryptography.RSA]::Create(); $rsa.ImportParameters($parameters)
        try { return $rsa.VerifyData([Text.Encoding]::UTF8.GetBytes($builder.ToString()), [Convert]::FromBase64String([string]$value.signature), [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1) }
        finally { $rsa.Dispose() }
    } catch { return $false }
}

function Get-ReleaseManifest {
    Write-Host 'Checking the signed release manifest...'
    $value = Invoke-RestMethod ($repository + 'manifest.json?t=' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -UseBasicParsing
    if (-not $value.files -or $value.files.Count -eq 0) { throw 'The release manifest is empty.' }
    if (-not (Test-ManifestSignature $value)) { throw 'The release manifest signature is invalid or missing.' }
    return $value
}

function Test-Runtime([string]$pattern) {
    try { return @(& dotnet --list-runtimes 2>$null) -match $pattern | Select-Object -First 1 }
    catch { return $false }
}

function Get-PostgreSqlPath { return Get-ChildItem 'C:\Program Files\PostgreSQL\*\bin\psql.exe' -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 }
function Test-QZTray {
    return (Test-Path (Join-Path $env:ProgramFiles 'QZ Tray\qz-tray.exe')) -or (Test-Path (Join-Path ${env:ProgramFiles(x86)} 'QZ Tray\qz-tray.exe'))
}

function Show-DependencyStatus {
    Write-Host ''
    Write-Host ('[{0}] .NET 9 Desktop Runtime' -f $(if (Test-Runtime '^Microsoft\.WindowsDesktop\.App 9\.') { 'Installed' } else { 'Missing' }))
    Write-Host ('[{0}] .NET 9 Hosting Bundle' -f $(if (Test-Runtime '^Microsoft\.AspNetCore\.App 9\.') { 'Installed' } else { 'Missing' }))
    Write-Host ('[{0}] PostgreSQL' -f $(if (Get-PostgreSqlPath) { 'Installed' } else { 'Missing' }))
    Write-Host ('[{0}] QZ Tray (optional direct printing)' -f $(if (Test-QZTray) { 'Installed' } else { 'Missing' }))
    Write-Host ''
}

function Install-Exe([string]$url, [string]$fileName, [string]$arguments, [string]$label) {
    $path = Join-Path $env:TEMP $fileName
    Invoke-DownloadFile $url $path $label
    Write-Host ('Installing ' + $label + '...') -ForegroundColor Cyan
    $process = Start-Process $path -ArgumentList $arguments -Wait -PassThru
    Remove-Item $path -Force -ErrorAction SilentlyContinue
    if ($process.ExitCode -notin @(0, 1641, 3010)) { throw "$label failed with exit code $($process.ExitCode)." }
    Write-Host ($label + ' installed successfully.') -ForegroundColor Green
}

function Install-Dependency([string]$name) {
    switch ($name) {
        'DesktopRuntime' {
            if (Test-Runtime '^Microsoft\.WindowsDesktop\.App 9\.') { Write-Host '.NET 9 Desktop Runtime is already installed. Skipped.' -ForegroundColor Green; return }
            Install-Exe 'https://builds.dotnet.microsoft.com/dotnet/WindowsDesktop/9.0.15/windowsdesktop-runtime-9.0.15-win-x64.exe' 'proerp-desktop-runtime.exe' '/install /quiet /norestart' '.NET 9 Desktop Runtime'
        }
        'HostingBundle' {
            if (Test-Runtime '^Microsoft\.AspNetCore\.App 9\.') { Write-Host '.NET 9 Hosting Bundle is already installed. Skipped.' -ForegroundColor Green; return }
            Install-Exe 'https://builds.dotnet.microsoft.com/dotnet/aspnetcore/Runtime/9.0.15/dotnet-hosting-9.0.15-win.exe' 'proerp-dotnet-hosting.exe' '/install /quiet /norestart' '.NET 9 Hosting Bundle'
        }
        'PostgreSQL' {
            $found = Get-PostgreSqlPath
            if ($found) { Write-Host "PostgreSQL is already installed: $($found.FullName). Skipped." -ForegroundColor Green; return }
            Install-Exe 'https://get.enterprisedb.com/postgresql/postgresql-16.2-1-windows-x64.exe' 'proerp-postgresql.exe' '--mode unattended --unattendedmodeui none --superpassword postgres --serverport 5432 --disable-components stackbuilder' 'PostgreSQL 16'
            if (-not (Get-PostgreSqlPath)) { throw 'PostgreSQL setup finished but psql.exe was not found.' }
        }
        'QZTray' {
            if (Test-QZTray) { Write-Host 'QZ Tray is already installed. Skipped.' -ForegroundColor Green; return }
            Install-Exe 'https://github.com/qzind/tray/releases/download/v2.2.6/qz-tray-2.2.6-x86_64.exe' 'proerp-qz-tray.exe' '/S' 'QZ Tray 2.2.6'
        }
        default { throw "Unknown dependency: $name" }
    }
}

function Get-ReleaseDestination([object]$file, [string]$target) {
    $relative = ([string]$file.path).Replace('/', '\')
    if ([IO.Path]::IsPathRooted($relative) -or $relative -match '(^|\\)\.\.(\\|$)') { throw "Unsafe release path: $relative" }
    $base = [IO.Path]::GetFullPath($target).TrimEnd('\') + '\'
    $destination = [IO.Path]::GetFullPath((Join-Path $target $relative))
    if (-not $destination.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe release path: $relative" }
    return $destination
}

function Test-FileCurrent([object]$file, [string]$destination) {
    if (-not (Test-Path -LiteralPath $destination -PathType Leaf)) { return $false }
    if (-not $file.hash) { return $false }
    return (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash.Equals([string]$file.hash, [StringComparison]::OrdinalIgnoreCase)
}

function Get-ReleaseFile([object]$file, [string]$destination) {
    $urlPath = (($file.path -split '/') | ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
    Invoke-DownloadFile ($repository + $urlPath) $destination ([string]$file.path)
    if ($file.hash) {
        $actual = (Get-FileHash -LiteralPath $destination -Algorithm SHA256).Hash
        if (-not $actual.Equals([string]$file.hash, [StringComparison]::OrdinalIgnoreCase)) { Remove-Item $destination -Force -ErrorAction SilentlyContinue; throw "SHA256 check failed: $($file.path)" }
    }
}

function Save-InstallState([string]$target, [object]$manifest, [string]$packageHash) {
    @{ Version = [string]$manifest.version; PublishedAt = [string]$manifest.publishedAt; PackageHash = $packageHash; UpdatedAt = [DateTime]::UtcNow.ToString('O') } |
        ConvertTo-Json | Set-Content (Join-Path $target $stateFileName) -Encoding UTF8
}

function Install-DesktopClient([bool]$updateOnly) {
    Install-Dependency 'DesktopRuntime'
    $manifest = Get-ReleaseManifest
    $package = $manifest.files | Where-Object { $_.path -eq $desktopPackagePath } | Select-Object -First 1
    if (-not $package) { throw 'Desktop package is not present in the published release.' }
    $statePath = Join-Path $desktopTarget $stateFileName
    if ((Test-Path $statePath) -and (Test-Path (Join-Path $desktopTarget 'ProERP.Desktop.Wpf.exe'))) {
        try { $state = Get-Content $statePath -Raw | ConvertFrom-Json } catch { $state = $null }
        if ($state -and ([string]$state.PackageHash).Equals([string]$package.hash, [StringComparison]::OrdinalIgnoreCase)) { Write-Host "Desktop client is already up to date ($($manifest.version))." -ForegroundColor Green; return }
    } elseif ($updateOnly) { Write-Host 'Desktop client is not installed; it will be installed now.' -ForegroundColor Yellow }
    $zip = Join-Path $env:TEMP 'ProERP.Desktop.zip'; $stage = Join-Path $env:TEMP ('ProERP-Desktop-' + [Guid]::NewGuid().ToString('N'))
    Get-ReleaseFile $package $zip
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    try {
        Expand-Archive $zip $stage -Force
        $settings = Join-Path $desktopTarget 'desktopsettings.json'; $savedSettings = $null
        if (Test-Path $settings) { $savedSettings = Get-Content $settings -Raw }
        New-Item -ItemType Directory -Path $desktopTarget -Force | Out-Null
        Copy-Item (Join-Path $stage '*') $desktopTarget -Recurse -Force
        if ($savedSettings) { $savedSettings | Set-Content $settings -Encoding UTF8 }
        elseif (-not (Test-Path $settings)) {
            $selectedServerUrl = $ServerUrl
            if ([string]::IsNullOrWhiteSpace($selectedServerUrl)) { $selectedServerUrl = Read-Host 'Web server URL (default http://localhost:5005)' }
            if ([string]::IsNullOrWhiteSpace($selectedServerUrl)) { $selectedServerUrl = 'http://localhost:5005' }
            @{ ServerUrl = $selectedServerUrl.Trim().TrimEnd('/') } | ConvertTo-Json | Set-Content $settings -Encoding UTF8
        }
        $exe = Join-Path $desktopTarget 'ProERP.Desktop.Wpf.exe'
        if (-not (Test-Path $exe)) { throw 'Desktop executable was not found in the package.' }
        Save-InstallState $desktopTarget $manifest ([string]$package.hash)
        $shell = New-Object -ComObject WScript.Shell
        foreach ($link in @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'ProERP Desktop.lnk'), (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\ProERP Desktop.lnk'))) {
            $shortcut = $shell.CreateShortcut($link); $shortcut.TargetPath = $exe; $shortcut.WorkingDirectory = $desktopTarget; $shortcut.IconLocation = $exe; $shortcut.Save()
        }
        Write-Host "Desktop client $($manifest.version) is ready." -ForegroundColor Green
    } finally { Remove-Item $zip -Force -ErrorAction SilentlyContinue; Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
}

function Install-ProERPService {
    $exe = Join-Path $serverTarget 'ProERP.Web.exe'
    if (-not (Test-Path $exe)) { throw "Server executable not found: $exe" }
    $binaryPath = '"' + $exe + '"'
    if (Get-Service $serviceName -ErrorAction SilentlyContinue) { sc.exe config $serviceName binPath= $binaryPath start= delayed-auto | Out-Null }
    else {
        New-Service -Name $serviceName -BinaryPathName $binaryPath -DisplayName 'ProERP Server' -Description 'ProERP web application service' -StartupType Automatic | Out-Null
        sc.exe config $serviceName start= delayed-auto | Out-Null
    }
    sc.exe failure $serviceName reset= 86400 actions= restart/5000/restart/10000/restart/30000 | Out-Null
    if (-not (Get-NetFirewallRule -DisplayName $firewallRule -ErrorAction SilentlyContinue)) { New-NetFirewallRule -DisplayName $firewallRule -Direction Inbound -Protocol TCP -LocalPort 5005 -Action Allow | Out-Null }
    Start-Service $serviceName -ErrorAction SilentlyContinue
    Write-Host 'ProERP Windows service is installed and running.' -ForegroundColor Green
}

function Uninstall-ProERPService {
    $service = Get-Service $serviceName -ErrorAction SilentlyContinue
    if (-not $service) { Write-Host 'ProERP Windows service is not installed.' -ForegroundColor Yellow; return }
    Stop-Service $serviceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $serviceName | Out-Null
    for ($i = 0; $i -lt 20 -and (Get-Service $serviceName -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 250 }
    Write-Host 'ProERP Windows service was removed. Application files were preserved.' -ForegroundColor Green
}

function Install-WebServer([bool]$updateOnly) {
    Install-Dependency 'HostingBundle'; Install-Dependency 'PostgreSQL'
    $manifest = Get-ReleaseManifest
    $existingService = Get-Service $serviceName -ErrorAction SilentlyContinue
    if ($existingService) { Stop-Service $serviceName -Force -ErrorAction SilentlyContinue }
    New-Item -ItemType Directory -Path $serverTarget -Force | Out-Null
    $files = @($manifest.files | Where-Object { $_.path -ne $desktopPackagePath })
    $pending = New-Object Collections.Generic.List[object]
    $skipped = 0
    foreach ($file in $files) {
        $destination = Get-ReleaseDestination $file $serverTarget
        $leaf = [IO.Path]::GetFileName($destination)
        if (($protectedServerFiles -contains $leaf) -and (Test-Path $destination)) { $skipped++; continue }
        if (Test-FileCurrent $file $destination) { $skipped++; continue }
        $pending.Add([pscustomobject]@{ File = $file; Destination = $destination })
    }
    Write-Host "$skipped files are current/preserved; $($pending.Count) files need download." -ForegroundColor Cyan
    $index = 0
    foreach ($item in $pending) {
        $index++
        Write-Progress -Id 2 -Activity 'Updating ProERP Server' -Status "$index / $($pending.Count): $($item.File.path)" -PercentComplete (($index * 100) / [Math]::Max(1, $pending.Count))
        Get-ReleaseFile $item.File $item.Destination
    }
    Write-Progress -Id 2 -Activity 'Updating ProERP Server' -Completed
    $settings = Join-Path $serverTarget 'appsettings.json'
    if (-not (Test-Path $settings)) { '{"SetupConfig":{"IsSetupComplete":false}}' | Set-Content $settings -Encoding UTF8 }
    if (-not (Test-Path (Join-Path $serverTarget 'ProERP.Web.exe'))) { throw 'ProERP.Web.exe was not found after installation.' }
    Save-InstallState $serverTarget $manifest ''
    Install-ProERPService
    if ($pending.Count -eq 0) { Write-Host "Server is already up to date ($($manifest.version))." -ForegroundColor Green }
    else { Write-Host "Server updated to $($manifest.version)." -ForegroundColor Green }
}

function Show-DependenciesMenu {
    while ($true) {
        Write-Title 'ProERP Dependencies'
        Show-DependencyStatus
        Write-Host '[1] Install .NET 9 Desktop Runtime'
        Write-Host '[2] Install .NET 9 Hosting Bundle'
        Write-Host '[3] Install PostgreSQL'
        Write-Host '[4] Install QZ Tray (optional)'
        Write-Host '[5] Install all required dependencies'
        Write-Host '[0] Back'
        $choice = Read-Host 'Choose'
        switch ($choice) {
            '1' { Install-Dependency 'DesktopRuntime' }
            '2' { Install-Dependency 'HostingBundle' }
            '3' { Install-Dependency 'PostgreSQL' }
            '4' { Install-Dependency 'QZTray' }
            '5' { Install-Dependency 'DesktopRuntime'; Install-Dependency 'HostingBundle'; Install-Dependency 'PostgreSQL'; Install-Dependency 'QZTray' }
            '0' { return }
        }
        if ($choice -ne '0') { [void](Read-Host 'Press Enter to continue') }
    }
}

function Show-ServiceMenu {
    while ($true) {
        Write-Title 'ProERP Windows Service'
        $service = Get-Service $serviceName -ErrorAction SilentlyContinue
        Write-Host ('Status: ' + $(if ($service) { $service.Status } else { 'Not installed' }))
        Write-Host '[1] Install / repair service'
        Write-Host '[2] Uninstall service (keeps files)'
        Write-Host '[3] Start service'
        Write-Host '[4] Stop service'
        Write-Host '[5] Restart service'
        Write-Host '[0] Back'
        switch (Read-Host 'Choose') {
            '1' { Install-ProERPService }
            '2' { Uninstall-ProERPService }
            '3' { Start-Service $serviceName; Write-Host 'Service started.' -ForegroundColor Green }
            '4' { Stop-Service $serviceName -Force; Write-Host 'Service stopped.' -ForegroundColor Green }
            '5' { Restart-Service $serviceName -Force; Write-Host 'Service restarted.' -ForegroundColor Green }
            '0' { return }
        }
        [void](Read-Host 'Press Enter to continue')
    }
}

function Uninstall-DesktopClient {
    if (-not (Test-Path $desktopTarget)) { Write-Host 'Desktop client is not installed.' -ForegroundColor Yellow; return }
    if (-not $ConfirmRemove -and (Read-Host 'Type REMOVE to uninstall the Desktop client') -cne 'REMOVE') { Write-Host 'Cancelled.'; return }
    Get-Process 'ProERP.Desktop.Wpf' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Remove-Item $desktopTarget -Recurse -Force
    Remove-Item (Join-Path ([Environment]::GetFolderPath('Desktop')) 'ProERP Desktop.lnk') -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\ProERP Desktop.lnk') -Force -ErrorAction SilentlyContinue
    Write-Host 'Desktop client uninstalled. Shared dependencies were kept.' -ForegroundColor Green
}

function Uninstall-WebServer {
    if (-not (Test-Path $serverTarget)) { Write-Host 'Web server files are not installed.' -ForegroundColor Yellow; return }
    Write-Host 'This removes ProERP application files only. PostgreSQL and its databases are NOT removed.' -ForegroundColor Yellow
    Write-Host 'A backup of appsettings files will be saved on the Desktop.'
    if (-not $ConfirmRemove -and (Read-Host 'Type REMOVE to continue') -cne 'REMOVE') { Write-Host 'Cancelled.'; return }
    Uninstall-ProERPService
    $backup = Join-Path ([Environment]::GetFolderPath('Desktop')) ('ProERP-Settings-Backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Get-ChildItem $serverTarget -Filter 'appsettings*.json' -ErrorAction SilentlyContinue | Copy-Item -Destination $backup -Force
    Remove-Item $serverTarget -Recurse -Force
    Remove-NetFirewallRule -DisplayName $firewallRule -ErrorAction SilentlyContinue
    Write-Host "Web server uninstalled. Database preserved. Settings backup: $backup" -ForegroundColor Green
}

function Show-UninstallMenu {
    Write-Title 'Uninstall ProERP'
    Write-Host '[1] Uninstall Desktop client'
    Write-Host '[2] Uninstall Web server'
    Write-Host '[3] Uninstall Windows service only'
    Write-Host '[0] Back'
    switch (Read-Host 'Choose') {
        '1' { Uninstall-DesktopClient }
        '2' { Uninstall-WebServer }
        '3' { Uninstall-ProERPService }
    }
}

function Show-UpdateMenu {
    $desktopInstalled = Test-Path (Join-Path $desktopTarget 'ProERP.Desktop.Wpf.exe')
    $serverInstalled = Test-Path (Join-Path $serverTarget 'ProERP.Web.exe')
    if (-not $desktopInstalled -and -not $serverInstalled) { Write-Host 'No existing ProERP installation was found.' -ForegroundColor Yellow; return }
    if ($desktopInstalled) { Install-DesktopClient $true }
    if ($serverInstalled) { Install-WebServer $true }
}

function Show-MainMenu {
    while ($true) {
        Write-Title 'ProERP Setup and Maintenance'
        Write-Host '[1] Install Desktop client'
        Write-Host '[2] Install Web server'
        Write-Host '[3] Install individual dependencies'
        Write-Host '[4] Update installed ProERP components'
        Write-Host '[5] Manage Windows service'
        Write-Host '[6] Uninstall'
        Write-Host '[0] Exit'
        try {
            switch (Read-Host 'Choose') {
                '1' { Install-DesktopClient $false }
                '2' { Install-WebServer $false }
                '3' { Show-DependenciesMenu }
                '4' { Show-UpdateMenu }
                '5' { Show-ServiceMenu }
                '6' { Show-UninstallMenu }
                '0' { return }
            }
        } catch { Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red }
        [void](Read-Host 'Press Enter to continue')
    }
}

Ensure-Administrator
try {
    switch ($Action) {
        'Desktop' { Install-DesktopClient $false }
        'Server' { Install-WebServer $false }
        'Update' { Show-UpdateMenu }
        'Dependencies' { if ($Component) { Install-Dependency $Component } else { Show-DependenciesMenu } }
        'Service' {
            switch ($ServiceOperation) {
                'Install' { Install-ProERPService }
                'Remove' { Uninstall-ProERPService }
                'Start' { Start-Service $serviceName; Write-Host 'Service started.' -ForegroundColor Green }
                'Stop' { Stop-Service $serviceName -Force; Write-Host 'Service stopped.' -ForegroundColor Green }
                'Restart' { Restart-Service $serviceName -Force; Write-Host 'Service restarted.' -ForegroundColor Green }
                'Status' { $service = Get-Service $serviceName -ErrorAction SilentlyContinue; Write-Host $(if ($service) { "Service status: $($service.Status)" } else { 'Service is not installed.' }) }
                default { Show-ServiceMenu }
            }
        }
        'Uninstall' {
            switch ($UninstallTarget) {
                'Desktop' { Uninstall-DesktopClient }
                'Server' { Uninstall-WebServer }
                'Service' { Uninstall-ProERPService }
                default { Show-UninstallMenu }
            }
        }
        default { Show-MainMenu }
    }
} catch {
    Write-Host ("ERROR: " + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
