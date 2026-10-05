param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

Start-Sleep -Seconds 3

$searchRoots = @(
  [Environment]::GetFolderPath('Programs'),
  [Environment]::GetFolderPath('CommonPrograms'),
  [Environment]::GetFolderPath('DesktopDirectory')
)
$shell = New-Object -ComObject WScript.Shell
$appShortcut = Get-ChildItem -Path $searchRoots -Filter 'CineLocal*.lnk' -File -Recurse -ErrorAction SilentlyContinue |
  ForEach-Object {
    $shortcut = $shell.CreateShortcut($_.FullName)
    if ($shortcut.TargetPath -match '(?i)(chrome|msedge)_proxy\.exe$' -and $shortcut.Arguments -match '--app-id=') {
      $_.FullName
    }
  } |
  Select-Object -First 1

if ($appShortcut) {
  Start-Process -FilePath $appShortcut
} else {
  Start-Process -FilePath $Url
}