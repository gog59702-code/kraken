$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$out    = "C:\Users\User\AppData\Local\Temp\opencode\cel"
New-Item -ItemType Directory -Force -Path $out | Out-Null
$base   = "file:///C:/Users/User/ia/celine-presentation/index.html"

for ($n = 1; $n -le 21; $n++) {
    $png = Join-Path $out ("f$n.png")
    if (Test-Path $png) { Remove-Item $png -Force }
    $args = @(
        '--headless','--disable-gpu','--no-first-run','--no-default-browser-check',
        '--disable-extensions','--disable-sync','--no-pings',
        "--user-data-dir=$out\prof$n",
        '--hide-scrollbars','--window-size=1280,720','--virtual-time-budget=7000',
        "--screenshot=$png",
        "$base?s=$n&still=1"
    )
    $p = Start-Process -FilePath $chrome -ArgumentList $args -Wait -PassThru -WindowStyle Hidden
    if (-not (Test-Path $png)) { Write-Output "MISSING slide $n" }
}
Write-Output ("shots " + (Get-ChildItem "$out\f*.png" | Measure-Object).Count)

Add-Type -AssemblyName System.Drawing
$cols = 4; $cw = 430; $ch = 262
$rows = [math]::Ceiling(21 / $cols)
$bmp  = New-Object System.Drawing.Bitmap ($cols * $cw), ($rows * $ch)
$g    = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(18, 18, 18))
$g.InterpolationMode = 'HighQualityBicubic'
$font = New-Object System.Drawing.Font("Consolas", 12)
for ($i = 1; $i -le 21; $i++) {
    $f = "$out\f$i.png"
    if (-not (Test-Path $f)) { continue }
    $img = [System.Drawing.Image]::FromFile($f)
    $x = (($i - 1) % $cols) * $cw
    $y = [math]::Floor(($i - 1) / $cols) * $ch
    $g.DrawImage($img, $x + 5, $y + 5, $cw - 10, [int](($cw - 10) * 720 / 1280))
    $g.DrawString("$i", $font, [System.Drawing.Brushes]::White, $x + 10, $y + 8)
    $img.Dispose()
}
$g.Dispose()
$bmp.Save("$out\sheet.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "sheet ok"
