# Jalankan via: powershell -NoProfile -ExecutionPolicy Bypass -File make-icons.ps1
# Desain: rounded rectangle gradasi (biru->hijau) + simbol petir putih (autofill kilat).

Add-Type -AssemblyName System.Drawing

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

function New-RoundRectPath {
    param([single]$X, [single]$Y, [single]$W, [single]$H, [single]$R)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $R * 2.0
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $W - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $W - $d, $Y + $H - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $H - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Icon {
    param([int]$Size, [string]$Path)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # --- latar: rounded rect dengan margin tipis (pojok transparan) ---
    $margin = [single]($Size * 0.04)
    $w = [single]($Size - 2 * $margin)
    $rectF = New-Object System.Drawing.RectangleF $margin, $margin, $w, $w
    $radius = [single]($w * 0.24)
    $bgPath = New-RoundRectPath -X $margin -Y $margin -W $w -H $w -R $radius

    $c1 = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)   # biru
    $c2 = [System.Drawing.Color]::FromArgb(255, 22, 163, 74)   # hijau
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rectF, $c1, $c2, ([single]45)
    $g.FillPath($brush, $bgPath)

    # --- simbol petir putih (koordinat dalam ruang 24x24, dipusatkan) ---
    $bolt = @(
        @(13, 2), @(3, 14), @(11, 14), @(9, 22), @(21, 9), @(13, 9)
    )
    $pad = [single]($Size * 0.22)
    $scale = [single](($Size - 2 * $pad) / 24.0)
    $pts = New-Object 'System.Drawing.PointF[]' $bolt.Count
    for ($i = 0; $i -lt $bolt.Count; $i++) {
        $x = [single]($Size / 2.0 + ($bolt[$i][0] - 12) * $scale)
        $y = [single]($Size / 2.0 + ($bolt[$i][1] - 12) * $scale)
        $pts[$i] = New-Object System.Drawing.PointF $x, $y
    }
    $g.FillPolygon([System.Drawing.Brushes]::White, $pts)

    $g.Dispose()
    $brush.Dispose()
    $bgPath.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "OK: $Path"
}

New-Icon -Size 16  -Path (Join-Path $dir 'icon16.png')
New-Icon -Size 48  -Path (Join-Path $dir 'icon48.png')
New-Icon -Size 128 -Path (Join-Path $dir 'icon128.png')
