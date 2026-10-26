# Removes the Chrome/Edge block that Setup-Desks.ps1 added (run as administrator).
foreach ($root in @('HKLM:\SOFTWARE\Policies\Google\Chrome\URLBlocklist', 'HKLM:\SOFTWARE\Policies\Microsoft\Edge\URLBlocklist')) {
  if (-not (Test-Path $root)) { continue }
  (Get-ItemProperty $root).PSObject.Properties | Where-Object { $_.Name -match '^\d+$' -and $_.Value -in @('partner-app.talabat.com', 'eldahan.com.eg/wp-admin') } | ForEach-Object { Remove-ItemProperty -Path $root -Name $_.Name }
}
Write-Host 'Removed. Restart Chrome and Edge.'
