$ErrorActionPreference = "Stop"

$path = ".\src\App.jsx"
$cssPath = ".\src\App.css"

$content = Get-Content $path -Raw

if ($content -notmatch 'page==="Leave Calendar"') {
    throw "Leave Calendar section not found. No changes made."
}

if ($content -match 'quick-calendar-assignment') {
    Write-Host "Quick calendar assignment is already installed." -ForegroundColor Yellow
    exit
}

Copy-Item $path "$path.backup-quick-calendar" -Force
Copy-Item $cssPath "$cssPath.backup-quick-calendar" -Force

$replacement = @"
        {page==="Leave Calendar"&&<section>
          <div className="section-toolbar">
            <div><h2>Team leave calendar</h2><p>Select multiple dates and record leave in one operation.</p></div>
          </div>

          <div className="panel quick-calendar-assignment">
            <h3>Quick leave assignment</h3>
            <div className="quick-controls">
              <Field label="Employee">
                <select value={leaveForm.employee_id} onChange={e=>setLeaveForm({...leaveForm,employee_id:e.target.value})}>
                  <option value="">Choose employee</option>
                  {active.map(e=><option key={e.id} value={e.id}>{e.full_name} ({e.employee_code})</option>)}
                </select>
              </Field>
              <Field label="Leave type">
                <select value={leaveForm.leave_type_id} onChange={e=>setLeaveForm({...leaveForm,leave_type_id:e.target.value})}>
                  <option value="">Choose leave type</option>
                  {types.filter(t=>t.is_active!==false).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={leaveForm.status} onChange={e=>setLeaveForm({...leaveForm,status:e.target.value})}>
                  <option value="taken">Taken</option>
                  <option value="planned">Planned</option>
                </select>
              </Field>
              <Field label="Apply duration to selected dates">
                <select value="individual" onChange={e=>{
                  if(e.target.value!=="individual"){
                    setDateSettings(old=>{
                      const next={...old};
                      selectedDates.forEach(d=>{next[d]={...next[d],duration_type:e.target.value,start_time:"09:00",end_time:"18:00"};});
                      return next;
                    });
                  }
                }}>
                  <option value="individual">Keep individual settings</option>
                  <option value="full_day">Full day</option>
                  <option value="first_half">First half</option>
                  <option value="second_half">Second half</option>
                </select>
              </Field>
            </div>

            <div className="calendar-head">
              <button className="icon-btn" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}>‹</button>
              <h3>{month.toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</h3>
              <button className="icon-btn" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}>›</button>
              <button className="text-btn" onClick={()=>setMonth(new Date())}>Today</button>
            </div>

            <div className="calendar-grid">
              {["MON","TUE","WED","THU","FRI","SAT","SUN"].map(d=><div className="weekday" key={d}>{d}</div>)}
              {calendar.map((day,i)=>{
                const date=day?String(month.getFullYear())+"-"+String(month.getMonth()+1).padStart(2,"0")+"-"+String(day).padStart(2,"0"):null;
                const chosen=date&&selectedDates.includes(date);
                return <div className="calendar-cell quick-calendar-cell" key={i}>
                  {day&&<>
                    <button type="button" className={"quick-day "+(chosen?"quick-selected":"")} onClick={()=>toggleDate(date)}>
                      <span className="day-number">{day}</span>
                      <span className="quick-day-hint">{chosen?"Selected · click to remove":"＋ Select date"}</span>
                    </button>
                    <div className="day-leaves">
                      {dateLeaves(day).slice(0,3).map(l=><div className={"calendar-event "+l.status} key={l.id}>{l.employee_name.split(" ")[0]} <small>{l.start_time?.slice(0,5)}–{l.end_time?.slice(0,5)}</small></div>)}
                    </div>
                  </>}
                </div>;
              })}
            </div>

            {selectedDates.length>0&&<div className="quick-selected-list">
              <div className="quick-selected-heading"><b>{selectedDates.length} date(s) selected</b><button type="button" className="text-btn" onClick={()=>{setSelectedDates([]);setDateSettings({});}}>Clear selection</button></div>
              {selectedDates.map(date=><div className="quick-date-setting" key={date}>
                <b>{new Date(date+"T00:00:00").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</b>
                <select value={dateSettings[date]?.duration_type||"full_day"} onChange={e=>changeSetting(date,"duration_type",e.target.value)}>
                  <option value="full_day">Full day</option>
                  <option value="first_half">First half</option>
                  <option value="second_half">Second half</option>
                  <option value="custom_hours">Custom hours</option>
                </select>
                {dateSettings[date]?.duration_type==="custom_hours"&&<>
                  <input type="time" value={dateSettings[date]?.start_time||"09:00"} onChange={e=>changeSetting(date,"start_time",e.target.value)}/>
                  <span>to</span>
                  <input type="time" value={dateSettings[date]?.end_time||"18:00"} onChange={e=>changeSetting(date,"end_time",e.target.value)}/>
                </>}
                <button type="button" className="delete-btn" onClick={()=>toggleDate(date)}>×</button>
              </div>)}
            </div>}

            <div className="quick-controls quick-extra-fields">
              <Field label="Reason (optional)">
                <input value={leaveForm.reason} onChange={e=>setLeaveForm({...leaveForm,reason:e.target.value})} placeholder="Reason for leave"/>
              </Field>
              <Field label="Admin remarks (optional)">
                <input value={leaveForm.admin_remarks} onChange={e=>setLeaveForm({...leaveForm,admin_remarks:e.target.value})} placeholder="Internal notes"/>
              </Field>
            </div>
            <div className="quick-footer">
              <span className="muted">Select dates, set durations, then save once.</span>
              <button type="button" className="primary-btn" disabled={!selectedDates.length||!leaveForm.employee_id||!leaveForm.leave_type_id} onClick={saveLeaves}>
                Save {selectedDates.length} leave date(s)
              </button>
            </div>
          </div>
          <div className="calendar-legend"><span><i className="legend-dot"/>Taken</span><span><i className="legend-dot planned"/>Planned</span></div>
        </section>}
"@

$pattern = '(?s)        \{page==="Leave Calendar"&&<section>.*?        </section>\}'
if ($content -notmatch $pattern) {
    throw "Could not safely identify the calendar section. Backup created; original file unchanged."
}

$content = [regex]::Replace($content,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $replacement},1)
Set-Content -Path $path -Value $content -Encoding UTF8

$css = @"

.quick-calendar-assignment{margin-bottom:22px}
.quick-calendar-assignment h3{margin:0 0 16px}
.quick-calendar-assignment .quick-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:18px}
.quick-calendar-cell{padding:5px;min-height:115px}
.quick-day{width:100%;min-height:55px;padding:7px;background:#111b2e;color:#dce4f5;border:1px solid #2a354c;border-radius:8px;text-align:left;cursor:pointer}
.quick-day:hover{border-color:#8192ff}
.quick-day.quick-selected{background:#293968;border:1px solid #8192ff}
.quick-day-hint{display:block;font-size:10px;color:#aab8d2;margin-top:5px}
.quick-selected-list{border-top:1px solid #2a354c;margin-top:18px;padding-top:16px}
.quick-selected-heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.quick-date-setting{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:9px 0;border-bottom:1px solid #2a354c}
.quick-date-setting b{min-width:110px}
.quick-date-setting select,.quick-date-setting input{max-width:145px}
.quick-extra-fields{margin-top:18px}
.quick-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:18px}
.quick-footer button:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:760px){.quick-calendar-assignment .quick-controls{grid-template-columns:1fr}.quick-footer{align-items:flex-start;flex-direction:column}.quick-date-setting b{width:100%}}
"@

Add-Content -Path $cssPath -Value $css -Encoding UTF8

Write-Host "Quick calendar assignment installed successfully." -ForegroundColor Green
Write-Host "Backups: App.jsx.backup-quick-calendar and App.css.backup-quick-calendar" -ForegroundColor Cyan
