# Exports every .aseprite in this folder to a packed sprite sheet (PNG) plus a JSON frame list in ../img.
# Run from a terminal:   powershell -ExecutionPolicy Bypass -File export.ps1 [-Only grover]
# Aseprite is looked up in $env:ASEPRITE, then in the usual install folders.
param([string]$Only)
$ErrorActionPreference = 'Stop'
$art = $PSScriptRoot
$img = Join-Path (Split-Path $art -Parent) 'img'
$ase = $env:ASEPRITE
if (-not $ase) {
  foreach ($c in @("C:\Program Files\Aseprite\Aseprite.exe", "C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe")) {
    if (Test-Path $c) { $ase = $c; break }
  }
}
if (-not $ase) { throw "Aseprite not found. Set `$env:ASEPRITE to the path of Aseprite.exe." }
New-Item -ItemType Directory -Force $img | Out-Null
$files = Get-ChildItem $art -Filter *.aseprite | Where-Object { $_.BaseName -notlike '_*' -and (-not $Only -or $_.BaseName -eq $Only) }
if (-not $files) { "nothing to export"; exit 0 }
foreach ($f in $files) {
  $name = $f.BaseName
  $args = @('-b', $f.FullName, '--sheet', (Join-Path $img "$name.png"), '--data', (Join-Path $img "$name.json"),
            '--format', 'json-array', '--sheet-pack', '--list-tags', '--filename-format', '{title}#{tag}#{frame}')
  $p = Start-Process -FilePath $ase -ArgumentList $args -Wait -NoNewWindow -PassThru
  if ($p.ExitCode -ne 0) { throw "export failed: $name (exit $($p.ExitCode))" }
  # Aseprite exits 0 even when it could not open the file, so check the outputs too
  foreach ($o in @((Join-Path $img "$name.png"), (Join-Path $img "$name.json"))) {
    if (-not (Test-Path $o) -or (Get-Item $o).Length -eq 0) { throw "export failed: $name ($o missing or empty)" }
  }
  "exported $name -> img/$name.png + img/$name.json"
}
