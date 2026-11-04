$docx = 'C:\Users\German Higuera\OneDrive\Desktop\Solicitudes frufresco\Feedback_sabana_alistamiento.docx'
$zip = 'C:\Users\German Higuera\OneDrive\Documentos\Projects\frufresco\temp_feedback_sabana.zip'
$out = 'C:\Users\German Higuera\OneDrive\Documentos\Projects\frufresco\temp_feedback_sabana'
if (Test-Path $zip) { Remove-Item -Force $zip }
if (Test-Path $out) { Remove-Item -Recurse -Force $out }
Copy-Item $docx $zip
Expand-Archive -Path $zip -DestinationPath $out -Force
Get-ChildItem -Path $out -Recurse | Select-Object FullName
