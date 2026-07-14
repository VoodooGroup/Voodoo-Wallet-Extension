Add-Type -AssemblyName System.Drawing

function Resize-Png {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$Width
  )

  $img = [System.Drawing.Image]::FromFile($SourcePath)
  $height = [int][Math]::Round($img.Height * ($Width / $img.Width))
  $bmp = New-Object System.Drawing.Bitmap $Width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($img, 0, 0, $Width, $height)
  $graphics.Dispose()
  $img.Dispose()
  $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "$DestPath ${Width}x$height"
}

$desktop = 'C:\Users\ReMarkt\Desktop\pls-logo.png'
$public = 'C:\Users\ReMarkt\voodoo-pulse-extension\public\pulsechain-logo.png'
$images = 'C:\Users\ReMarkt\voodoo-pulse-extension\src\images\pulsechain-logo.png'

Copy-Item $desktop $public -Force

Resize-Png -SourcePath $desktop -DestPath $public -Width 128
Resize-Png -SourcePath $desktop -DestPath ($public -replace '\.png$', '-64.png') -Width 64
Resize-Png -SourcePath $desktop -DestPath ($public -replace '\.png$', '-40.png') -Width 40

Copy-Item $public $images -Force
Copy-Item ($public -replace '\.png$', '-64.png') ($images -replace '\.png$', '-64.png') -Force
Copy-Item ($public -replace '\.png$', '-40.png') ($images -replace '\.png$', '-40.png') -Force