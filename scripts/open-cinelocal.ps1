param(
  [Parameter(Mandatory = $false)]
  [string]$Url = 'https://localhost:3050'
)

$targetUrl = if ($Url) { $Url } else { 'https://localhost:3050' }
$targetUri = [Uri]$targetUrl
$healthHost = if ($targetUri.Host -eq 'localhost') { '127.0.0.1' } else { $targetUri.Host }
$serverReady = $false

for ($attempt = 0; $attempt -lt 60 -and -not $serverReady; $attempt++) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $connectTask = $client.ConnectAsync($healthHost, $targetUri.Port)
    if ($connectTask.Wait(500)) {
      $serverReady = $client.Connected
    }
  } catch {
    $serverReady = $false
  } finally {
    $client.Close()
  }

  if (-not $serverReady) {
    Start-Sleep -Milliseconds 500
  }
}

$searchRoots = @(
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms'),
  [Environment]::GetFolderPath('DesktopDirectory')
)
$shell = New-Object -ComObject WScript.Shell
$appShortcutPath = Get-ChildItem -Path $searchRoots -Filter 'CineLocal*.lnk' -File -Recurse -ErrorAction SilentlyContinue |
  ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -match '(?i)(chrome|msedge)_proxy\.exe$' -and $shortcut.Arguments -match '--app-id=') {
      $_
    }
  } |
  Select-Object -First 1

if ($appShortcutPath) {
  $appShortcut = $shell.CreateShortcut($appShortcutPath.FullName)
  try {
    Start-Process -FilePath $appShortcut.TargetPath -ArgumentList $appShortcut.Arguments -ErrorAction Stop
    exit 0
  } catch {
    # Fall back to the browser if the installed app shortcut cannot be launched.
  }
}

Start-Process -FilePath $targetUrl