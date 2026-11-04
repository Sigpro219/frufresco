$src = "C:\Users\German Higuera\OneDrive\Desktop\Solicitudes frufresco\Hallazgos_OperaciB3n.docx"
$tmpZip = Join-Path $env:TEMP "hallazgos_inspect.zip"
$tmpOut = Join-Path $env:TEMP "hallazgos_inspect_extracted"

Copy-Item $src $tmpZip -Force
if (Test-Path $tmpOut) { Remove-Item $tmpOut -Recurse -Force }
Expand-Archive -Path $tmpZip -DestinationPath $tmpOut -Force

$xmlPath = Join-Path $tmpOut "word\document.xml"
$rawXml = Get-Content -Path $xmlPath -Raw -Encoding UTF8
$textOnly = $rawXml -replace '<[^>]+>', ' ' -replace '\s+', ' '
Write-Output $textOnly

# Also list media files if any
$mediaDir = Join-Path $tmpOut "word\media"
if (Test-Path $mediaDir) {
    Write-Output "--- MEDIA FILES ---"
    Get-ChildItem $mediaDir | Select-Object Name, Length
}
