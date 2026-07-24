# Build 30s product video from real UI frames — no AI credits
$ErrorActionPreference = 'Continue'
$ff = 'C:\Users\ReMarkt\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffmpeg.exe'
$fp = 'C:\Users\ReMarkt\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.2-full_build\bin\ffprobe.exe'
$chrome = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$out = $PSScriptRoot

$shots = @(
  @{ name = 'ui-unlock'; secs = 7 },
  @{ name = 'ui-home';   secs = 8 },
  @{ name = 'ui-send';   secs = 7 },
  @{ name = 'ui-stake';  secs = 8 }
)

function Invoke-FFmpeg {
  param([string[]]$Args)
  $log = Join-Path $out 'ffmpeg-last.log'
  $p = Start-Process -FilePath $ff -ArgumentList $Args -Wait -PassThru -NoNewWindow `
    -RedirectStandardError $log -RedirectStandardOutput (Join-Path $out 'ffmpeg-out.log')
  if ($p.ExitCode -ne 0) {
    Get-Content $log -Tail 30
    throw "ffmpeg failed exit=$($p.ExitCode)"
  }
}

Write-Host '=== Capturing real UI frames ==='
foreach ($s in $shots) {
  $html = (Resolve-Path (Join-Path $out "$($s.name).html")).Path
  $url = 'file:///' + ($html -replace '\\', '/')
  $png = Join-Path $out "$($s.name).png"
  if (-not (Test-Path $png) -or (Get-Item $png).Length -lt 1000) {
    $proc = Start-Process -FilePath $chrome -ArgumentList @(
      '--headless=new', '--disable-gpu', '--hide-scrollbars',
      '--window-size=1920,1080', "--screenshot=$png", $url
    ) -Wait -PassThru -NoNewWindow
    if (-not (Test-Path $png)) { throw "Screenshot failed: $($s.name)" }
    Write-Host "OK $($s.name).png ($((Get-Item $png).Length) bytes) exit=$($proc.ExitCode)"
  } else {
    Write-Host "Reuse $($s.name).png"
  }
}

Write-Host '=== Encoding clips with slow zoom (local ffmpeg) ==='
$clipFiles = @()
$i = 0
foreach ($s in $shots) {
  $i++
  $png = Join-Path $out "$($s.name).png"
  $clip = Join-Path $out ("clip{0:D2}.mp4" -f $i)
  $frames = [int]($s.secs * 24)
  # Gentle Ken Burns zoom — no AI
  $vf = "scale=1920:1080,zoompan=z='min(1.0+0.0009*on,1.08)':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1280x720:fps=24,format=yuv420p"
  Invoke-FFmpeg -Args @(
    '-y', '-loop', '1', '-i', $png, '-vf', $vf, '-t', "$($s.secs)",
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-an', $clip
  )
  if (-not (Test-Path $clip)) { throw "Clip failed: $clip" }
  $clipFiles += $clip
  Write-Host "OK clip $i ($($s.secs)s)"
}

$concatPath = Join-Path $out 'concat-real.txt'
$clipFiles | ForEach-Object {
  $p = ($_ -replace '\\', '/')
  "file '$p'"
} | Set-Content -Path $concatPath -Encoding ASCII

$final = Join-Path $out 'Voodoo-Wallet-30s-REAL-UI.mp4'
$desktop = 'C:\Users\ReMarkt\Desktop\Voodoo-Wallet-30s-REAL-UI.mp4'

Write-Host '=== Concatenating final 30s video ==='
Invoke-FFmpeg -Args @(
  '-y', '-f', 'concat', '-safe', '0', '-i', $concatPath,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-r', '24', '-movflags', '+faststart', $final
)

& $fp -v error -show_entries format=duration,size -show_entries stream=width,height -of default=noprint_wrappers=1 $final
Copy-Item $final $desktop -Force
Write-Host "DONE: $final"
Write-Host "DONE: $desktop"
