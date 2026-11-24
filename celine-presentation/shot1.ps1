$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$out = "C:\Users\User\AppData\Local\Temp\opencode\cel"
$url = "file:///C:/Users/User/ia/celine-presentation/index.html?s=5&still=1"
& $chrome --headless --disable-gpu --no-first-run --user-data-dir="$out\t1" --hide-scrollbars --window-size=1280,720 --virtual-time-budget=6000 --screenshot="$out\t1.png" $url 2>&1 | Select-String "written"
Get-ChildItem "$out\t1.png" -ErrorAction SilentlyContinue | Select-Object Name, Length
