$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$assetDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
$pngPath = Join-Path $assetDir 'deckprep.png'
$icoPath = Join-Path $assetDir 'deckprep.ico'

$bitmap = [System.Drawing.Bitmap]::new(256, 256)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$back = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(28, 32, 37))
$ring = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(82, 169, 250), 15)
$ring.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$ring.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$center = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(230, 238, 247))
$cue = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(82, 169, 250))

$graphics.FillEllipse($back, 7, 7, 242, 242)
$graphics.DrawEllipse($ring, 31, 31, 194, 194)
$graphics.FillEllipse($center, 111, 111, 34, 34)
$graphics.FillRectangle($cue, 122, 31, 12, 28)
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
$back.Dispose()
$ring.Dispose()
$center.Dispose()
$cue.Dispose()

$png = [System.IO.File]::ReadAllBytes($pngPath)
$stream = [System.IO.File]::Create($icoPath)
$writer = [System.IO.BinaryWriter]::new($stream)
try {
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]1)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([byte]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]32)
  $writer.Write([uint32]$png.Length)
  $writer.Write([uint32]22)
  $writer.Write($png)
} finally { $writer.Dispose() }
