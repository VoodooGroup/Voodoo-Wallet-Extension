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

$extensionIcon = 'C:\Users\ReMarkt\Desktop\voodoo-token-web-extension-icon.png'
$appLogo = 'C:\Users\ReMarkt\Desktop\Voodoo-Token-Logo.png'
$public = 'C:\Users\ReMarkt\voodoo-pulse-extension\public'
$images = 'C:\Users\ReMarkt\voodoo-pulse-extension\src\images'

# Chrome toolbar / Web Store icons
Resize-Png -SourcePath $extensionIcon -DestPath (Join-Path $public 'icon16.png') -Width 16
Resize-Png -SourcePath $extensionIcon -DestPath (Join-Path $public 'icon48.png') -Width 48
Resize-Png -SourcePath $extensionIcon -DestPath (Join-Path $public 'icon128.png') -Width 128
Resize-Png -SourcePath $extensionIcon -DestPath (Join-Path $public 'voodoo-extension-icon.png') -Width 128

# In-app branding (header + recovery phrase) — full resolution, do not resize
Copy-Item $appLogo (Join-Path $public 'voodoo-wallet.png') -Force

Copy-Item (Join-Path $public 'icon16.png') (Join-Path $images 'icon16.png') -Force
Copy-Item (Join-Path $public 'icon48.png') (Join-Path $images 'icon48.png') -Force
Copy-Item (Join-Path $public 'icon128.png') (Join-Path $images 'icon128.png') -Force
Copy-Item (Join-Path $public 'voodoo-extension-icon.png') (Join-Path $images 'voodoo-extension-icon.png') -Force
Copy-Item (Join-Path $public 'voodoo-wallet.png') (Join-Path $images 'voodoo-wallet.png') -Force