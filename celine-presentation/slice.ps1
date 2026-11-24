Add-Type -AssemblyName System.Drawing
$out = "C:\Users\User\AppData\Local\Temp\opencode\cel"
$src = [System.Drawing.Image]::FromFile("$out\stack.png")
Write-Output ("stack " + $src.Width + "x" + $src.Height)
$n = 21
for ($i = 0; $i -lt $n; $i++) {
    $rect = New-Object System.Drawing.Rectangle 0, ($i * 720), 1280, 720
    if (($i * 720 + 720) -gt $src.Height) { break }
    $crop = ([System.Drawing.Bitmap]$src).Clone($rect, $src.PixelFormat)
    $crop.Save("$out\f$($i+1).png", [System.Drawing.Imaging.ImageFormat]::Png)
    $crop.Dispose()
}
$src.Dispose()

$cols = 4; $cw = 430; $ch = 264
$rows = [math]::Ceiling($n / $cols)
$bmp = New-Object System.Drawing.Bitmap ($cols * $cw), ($rows * $ch)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(20, 20, 20))
$g.InterpolationMode = 'HighQualityBicubic'
$font = New-Object System.Drawing.Font("Consolas", 13, [System.Drawing.FontStyle]::Bold)
for ($i = 1; $i -le $n; $i++) {
    $f = "$out\f$i.png"
    if (-not (Test-Path $f)) { continue }
    $img = [System.Drawing.Image]::FromFile($f)
    $x = (($i - 1) % $cols) * $cw
    $y = [math]::Floor(($i - 1) / $cols) * $ch
    $g.DrawImage($img, $x + 6, $y + 6, $cw - 12, [int](($cw - 12) * 720 / 1280))
    $g.DrawString("$i", $font, [System.Drawing.Brushes]::Yellow, $x + 10, $y + 8)
    $img.Dispose()
}
$g.Dispose()
$bmp.Save("$out\sheet.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output ("sliced " + (Get-ChildItem "$out\f*.png" | Measure-Object).Count)
