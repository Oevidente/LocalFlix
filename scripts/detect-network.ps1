param(
  [Parameter(Mandatory = $false)]
  [string]$OutputFile
)

$ErrorActionPreference = 'SilentlyContinue'

$localIp = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike '127.*' -and
    $_.IPAddress -notlike '169.254.*' -and
    $_.InterfaceAlias -notlike '*Tailscale*'
  } |
  Select-Object -ExpandProperty IPAddress -First 1)

$tailscaleIp = (Get-NetIPAddress -AddressFamily IPv4 -Type Unicast -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -like '100.*' -or
    $_.InterfaceAlias -like '*Tailscale*'
  } |
  Select-Object -ExpandProperty IPAddress -First 1)

if ($OutputFile) {
  $content = @(
    "set LOCAL_IP=$localIp",
    "set TAILSCALE_IP=$tailscaleIp"
  )
  [System.IO.File]::WriteAllLines($OutputFile, $content)
} else {
  Write-Output "$localIp|$tailscaleIp"
}
