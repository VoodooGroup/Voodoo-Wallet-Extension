Add-Type -AssemblyName System.Drawing

function Resize-Png {
  param(
    [string]$SourcePath,
    [string]$DestPath,
    [int]$Width,
    [int]$Height = 0
  )

  $img = [System.Drawing.Image]::FromFile($SourcePath)
  if ($Height -le 0) { $Height = $Width }
  $bmp = New-Object System.Drawing.Bitmap $Width, $Height
  $graphics = [System.Drawing.Graphics]::FromImage($bmp)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage($img, 0, 0, $Width, $Height)
  $graphics.Dispose()
  $img.Dispose()
  $bmp.Save($DestPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output "$DestPath ${Width}x$Height"
}

$source = 'C:\Users\ReMarkt\Desktop\Untitled design (84).png'
$public = 'C:\Users\ReMarkt\voodoo-pulse-extension\public'
$images = 'C:\Users\ReMarkt\voodoo-pulse-extension\src\images'

# Toolbar, favicon, and Chrome Web Store icons only — do not overwrite in-app header logo (voodoo-wallet.png).
Resize-Png -SourcePath $source -DestPath (Join-Path $public 'icon16.png') -Width 16
Resize-Png -SourcePath $source -DestPath (Join-Path $public 'icon48.png') -Width 48
Resize-Png -SourcePath $source -DestPath (Join-Path $public 'icon128.png') -Width 128

Copy-Item (Join-Path $public 'icon16.png') (Join-Path $images 'icon16.png') -Force
Copy-Item (Join-Path $public 'icon48.png') (Join-Path $images 'icon48.png') -Force
Copy-Item (Join-Path $public 'icon128.png') (Join-Path $images 'icon128.png') -Force