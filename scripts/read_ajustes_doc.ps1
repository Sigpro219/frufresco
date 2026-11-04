$docPath = 'C:\Users\German Higuera\OneDrive\Desktop\Solicitudes frufresco\AJUSTES_ANTES_REVISION_INDICADORES__AREA_COMERCIAL.docx'
$dstFolder = 'C:\Users\German Higuera\.gemini\antigravity\brain\b4b05e76-9a5e-4dd8-bd55-f7f423a23770\scratch_ajustes_doc'
$artifactDir = 'C:\Users\German Higuera\.gemini\antigravity\brain\b4b05e76-9a5e-4dd8-bd55-f7f423a23770'

if (Test-Path $dstFolder) {
    Remove-Item -Recurse -Force $dstFolder
}
New-Item -ItemType Directory -Force -Path $dstFolder

$zipFile = Join-Path $dstFolder 'doc.zip'
Copy-Item $docPath $zipFile
Expand-Archive -Path $zipFile -DestinationPath $dstFolder -Force

$xmlPath = Join-Path $dstFolder 'word\document.xml'
[xml]$xml = Get-Content $xmlPath

Write-Output "--- PARAGRAPHS IN DOCX ---"
$idx = 1
foreach ($p in $xml.SelectNodes("//*[local-name()='p']")) {
    $text = $p.InnerText
    if (![string]::IsNullOrWhiteSpace($text)) {
        Write-Output "[$idx] $text"
        $idx++
    }
}

$mediaFolder = Join-Path $dstFolder 'word\media'
if (Test-Path $mediaFolder) {
    Write-Output "--- MEDIA FILES ---"
    Get-ChildItem $mediaFolder | ForEach-Object {
        $outName = "ajustes_comercial_$($_.Name)"
        Copy-Item $_.FullName (Join-Path $artifactDir $outName) -Force
        Write-Output "Copied $($_.Name) to $outName"
    }
}
