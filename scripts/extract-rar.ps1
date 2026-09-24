param(
  [Parameter(Mandatory = $true)]
  [string]$RarPath,
  [Parameter(Mandatory = $true)]
  [string]$TargetDir
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$resolvedRar = [System.IO.Path]::GetFullPath($RarPath)
$resolvedTarget = [System.IO.Path]::GetFullPath($TargetDir).TrimEnd('\')

if (-not (Test-Path -LiteralPath $resolvedRar)) {
  Write-Host "[AVISO] Arquivo não encontrado: $resolvedRar"
  exit 1
}

if (-not (Test-Path -LiteralPath $resolvedTarget)) {
  New-Item -ItemType Directory -Path $resolvedTarget -Force | Out-Null
}

$binCandidates = @(
  (Join-Path $PSScriptRoot '..\bin\7z.exe'),
  (Join-Path $PSScriptRoot '..\bin\7za.exe'),
  (Join-Path $PSScriptRoot '..\bin\unrar.exe'),
  (Join-Path $PSScriptRoot '..\bin\WinRAR.exe'),
  "$env:ProgramFiles\7-Zip\7z.exe",
  "${env:ProgramFiles(x86)}\7-Zip\7z.exe",
  "$env:LOCALAPPDATA\Programs\7-Zip\7z.exe",
  "$env:ProgramFiles\WinRAR\WinRAR.exe",
  "${env:ProgramFiles(x86)}\WinRAR\WinRAR.exe",
  "$env:ProgramFiles\WinRAR\UnRAR.exe",
  "${env:ProgramFiles(x86)}\WinRAR\UnRAR.exe"
)

foreach ($cmd in @('7z', '7za', 'unrar', 'winrar')) {
  try {
    $found = (Get-Command $cmd -ErrorAction SilentlyContinue).Source
    if ($found) { $binCandidates += $found }
  } catch {}
}

$extracted = $false

foreach ($bin in $binCandidates) {
  if ($bin -and (Test-Path -LiteralPath $bin)) {
    $binName = [System.IO.Path]::GetFileNameWithoutExtension($bin).ToLower()
    try {
      if ($binName -like '*7z*') {
        $p = Start-Process -FilePath $bin -ArgumentList @('x', '-y', "-o$resolvedTarget", $resolvedRar) -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -eq 0) {
          $extracted = $true
          break
        }
      } elseif ($binName -eq 'unrar') {
        $p = Start-Process -FilePath $bin -ArgumentList @('x', '-y', '-o+', $resolvedRar, "$resolvedTarget\") -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -eq 0) {
          $extracted = $true
          break
        }
      } elseif ($binName -eq 'winrar') {
        $p = Start-Process -FilePath $bin -ArgumentList @('x', '-ibck', '-y', '-o+', $resolvedRar, "$resolvedTarget\") -Wait -PassThru -NoNewWindow
        if ($p.ExitCode -eq 0) {
          $extracted = $true
          break
        }
      }
    } catch {}
  }
}

if (-not $extracted) {
  $tarCmd = Get-Command tar -ErrorAction SilentlyContinue
  if ($tarCmd) {
    try {
      $p = Start-Process -FilePath 'tar.exe' -ArgumentList @('-xf', $resolvedRar, '-C', $resolvedTarget) -Wait -PassThru -NoNewWindow
      if ($p.ExitCode -eq 0) {
        $extracted = $true
      }
    } catch {}
  }
}

if ($extracted) {
  exit 0
} else {
  exit 1
}
