$ErrorActionPreference = "Stop"

$path = ".\src\App.jsx"
$cssPath = ".\src\App.css"
$content = Get-Content $path -Raw

if ($content -notmatch 'quick-calendar-assignment') {
    throw "Quick calendar assignment not found."
}

if ($content -match 'const \[bulkDuration,') {
    throw "Bulk duration state already exists. No changes made."
}

Copy-Item $path "$path.backup-polish" -Force
Copy-Item $cssPath "$cssPath.backup-polish" -Force

$oldState = '  const [dateSettings,setDateSettings] = useState({});'
$newState = $oldState + "`r`n" + '  const [bulkDuration,setBulkDuration] = useState("individual");'

if (-not $content.Contains($oldState)) {
    throw "Could not find dateSettings state."
}

$content = $content.Replace($oldState,$newState)

$pattern = '(?s)<select value="individual" onChange=\{e=>\{.*?</select>'

$replacement = @(
'<select value={bulkDuration} onChange={e=>{',
'  const value=e.target.value;',
'  setBulkDuration(value);',
'  if(value!=="individual"){',
'    setDateSettings(old=>{',
'      const next={...old};',
'      selectedDates.forEach(d=>{next[d]={...next[d],duration_type:value,start_time:"09:00",end_time:"18:00"};});',
'      return next;',
'    });',
'  }',
'}}>',
'  <option value="individual">Keep individual settings</option>',
'  <option value="full_day">Full day</option>',
'  <option value="first_half">First half</option>',
'  <option value="second_half">Second half</option>',
'</select>'
) -join "`r`n"

if ($content -notmatch $pattern) {
    throw "Could not find bulk duration selector."
}

$content = [regex]::Replace(
    $content,
    $pattern,
    [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement },
    1
)

$content = $content.Replace(
'    setDateSettings({});',
'    setDateSettings({});' + "`r`n" + '    setBulkDuration("individual");'
)

Set-Content -Path $path -Value $content -Encoding UTF8

$css = @(
'.quick-calendar-assignment .quick-calendar-cell{min-height:78px;padding:4px}',
'.quick-calendar-assignment .quick-day{min-height:42px;padding:5px 7px}',
'.quick-calendar-assignment .quick-day-hint{font-size:9px;margin-top:2px}',
'.quick-calendar-assignment .day-leaves{margin-top:4px}',
'.quick-calendar-assignment .calendar-grid{margin-top:8px}',
'.quick-calendar-assignment .calendar-head{margin:8px 0 14px}',
'.quick-calendar-assignment .quick-selected-list{max-height:310px;overflow-y:auto}',
'.quick-calendar-assignment .quick-date-setting{padding:7px 0}',
'.quick-calendar-assignment .quick-date-setting input,.quick-calendar-assignment .quick-date-setting select{min-height:34px}',
'.quick-calendar-assignment .quick-footer{position:sticky;bottom:0;background:#151f33;padding:12px 0 2px}'
) -join "`r`n"

Add-Content -Path $cssPath -Value ("`r`n" + $css) -Encoding UTF8

Write-Host "Calendar layout and bulk duration updated." -ForegroundColor Green
Write-Host "Backup files created." -ForegroundColor Cyan
