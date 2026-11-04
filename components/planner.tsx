"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Activity, Category, PlannerData, EMPTY, COLORS, LABELS, localDate, dateFromKey, shiftDate, minutesLabel, clockLabel, readClock, clamp, snap5, unionMinutes, daySessions, actualStats, sampleActivities, downloadText, csvEscape, validateImport } from '@/lib/planner';
import { Activity as ActivityIcon, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Clock3, Download, Moon, Pause, Play, Plus, RotateCcw, Settings2, Sun, Trash2, Upload, X } from 'lucide-react';

const KEY = 'dayflow-planner-v1';
type View = 'planned' | 'actual';
type Panel = 'day' | 'week';
type Editor = { id: string | null; title: string; category: Category; start: string; end: string };
const NEW: Editor = { id: null, title: '', category: 'focus', start: '09:00', end: '10:00' };
function id() { return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()+'-'+Math.random(); }
function timeMinutes(iso: string) { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }); }
function percent(n: number, d: number) {return d ? Math.round(n / d * 100) : 0;}
function csv(rows: Array<Array<string|number>>) {return rows.map(r=>r.map(csvEscape).join(',')).join('\r\n');}

export default function Planner() {
  // The server renders a loading shell; useSyncExternalStore signals hydration
  // without synchronously setting React state inside an effect.
  const ready = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [store,setStore] = useState<PlannerData>(() => {
    if (typeof window === 'undefined') return EMPTY;
    try {
      const saved = window.localStorage.getItem(KEY);
      return saved ? validateImport(JSON.parse(saved)) : {...EMPTY,activities:sampleActivities(localDate(new Date()))};
    } catch {
      return {...EMPTY,activities:sampleActivities(localDate(new Date()))};
    }
  });
  const [date,setDate] = useState(() => typeof window === 'undefined' ? '' : localDate(new Date()));
  const [now,setNow] = useState<Date | null>(() => typeof window === 'undefined' ? null : new Date());
  const [view,setView] = useState<View>('planned');
  const [panel,setPanel] = useState<Panel>('day');
  const [editor,setEditor] = useState<Editor|null>(null);
  const [error,setError] = useState('');
  const [theme,setTheme] = useState<'light'|'dark'>(() => {
    if (typeof window === 'undefined') return 'dark';
    return window.localStorage.getItem(KEY+'-theme') === 'light' ? 'light' : 'dark';
  });
  const [timerLabel,setTimerLabel] = useState('Deep work');
  const fileRef = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{id:string;mode:'move'|'resize';y:number;start:number;end:number;moved:boolean}|null>(null);
  const blockClickRef = useRef(false);
  useEffect(()=>{
    const timer=window.setInterval(()=>setNow(new Date()),1000);
    const onStorage=(e:StorageEvent)=>{
      if(e.key===KEY&&e.newValue){try {setStore(validateImport(JSON.parse(e.newValue)));}catch{}}
    };
    window.addEventListener('storage',onStorage);
    return ()=>{clearInterval(timer);window.removeEventListener('storage',onStorage);};
  },[]);
  useEffect(()=>{if(ready)localStorage.setItem(KEY,JSON.stringify(store));},[store,ready]);
  useEffect(()=>{if(ready)localStorage.setItem(KEY+'-theme',theme);},[theme,ready]);
  useEffect(()=>{if(ready&&scroller.current)scroller.current.scrollTop=400;},[ready]);

  const items=useMemo(()=>store.activities.filter(a=>a.date===date).sort((a,b)=>a.start-b.start),[store.activities,date]);
  const ranges=useMemo(()=>now ? daySessions(store.sessions,date,store.active,now) : [],[store.sessions,store.active,date,now]);
  const actual=useMemo(()=>actualStats(ranges),[ranges]);
  const focusPlanned=unionMinutes(items.filter(a=>a.category==='focus').map(a=>[a.start,a.end] as [number,number]));
  const scheduled=items.reduce((s,a)=>s+a.end-a.start,0);
  const occupied=unionMinutes(items.map(a=>[a.start,a.end] as [number,number]));
  const activeSeconds=store.active&&now ? Math.max(0,Math.floor((now.getTime()-Date.parse(store.active.startedAt))/1000)) : 0;
  const weekDates=useMemo(()=>{const d=dateFromKey(date || localDate(new Date()));const weekday=(d.getDay()+6)%7;return Array.from({length:7},(_,i)=>shiftDate(localDate(d),i-weekday));},[date]);
  const week=useMemo(()=>weekDates.map(day=>{
    const tasks=store.activities.filter(a=>a.date===day);
    const planned=unionMinutes(tasks.filter(a=>a.category==='focus').map(a=>[a.start,a.end] as [number,number]));
    const activity=now ? actualStats(daySessions(store.sessions,day,store.active,now)):actualStats([]);
    return {date:day,planned,actual:activity.raw,credited:activity.credited,total:tasks.reduce((s,a)=>s+a.end-a.start,0)};
  }),[weekDates,store.activities,store.sessions,store.active,now]);
  const weekTotals=week.reduce((s,d)=>({planned:s.planned+d.planned,actual:s.actual+d.actual,credited:s.credited+d.credited}),{planned:0,actual:0,credited:0});
  const hourly=Array.from({length:24},(_,h)=>{
    const parts=view==='actual'?actual.blocks.filter(x=>x.kind!=='dotted').map(x=>[x.start,x.end] as [number,number]):items.filter(x=>x.category==='focus').map(x=>[x.start,x.end] as [number,number]);
    return unionMinutes(parts.map(([a,b])=>[Math.max(a,h*60),Math.min(b,(h+1)*60)] as [number,number]));
  });
  const activeTitle=store.active?.label||'';

  function openNew(start=540){
    const s=clamp(snap5(start),0,1435);
    setEditor({...NEW,start:clockLabel(s),end:clockLabel(Math.min(1435,s+60))});setError('');
  }
  function openEdit(a:Activity){setEditor({id:a.id,title:a.title,category:a.category,start:clockLabel(a.start),end:a.end===1440?'00:00':clockLabel(a.end)});setError('');}
  function saveActivity(e:React.FormEvent){
    e.preventDefault();if(!editor)return;
    let start=readClock(editor.start),end=readClock(editor.end);
    if(end===0&&start>0)end=1440;
    if(!editor.title.trim()){setError('Enter a title.');return;}
    if(start%5!==0||end%5!==0){setError('Please use 5-minute intervals.');return;}
    if(end<=start||end>1440){setError('End time must be later than start time, on the same day.');return;}
    const next:Activity={id:editor.id||id(),date,title:editor.title.trim(),category:editor.category,start,end};
    setStore(s=>({...s,activities:editor.id?s.activities.map(a=>a.id===editor.id?next:a):[...s.activities,next]}));setEditor(null);
  }
  function removeActivity(){if(!editor?.id)return;setStore(s=>({...s,activities:s.activities.filter(a=>a.id!==editor.id)}));setEditor(null);}
  function startTimer(){if(store.active)return;setStore(s=>({...s,active:{id:id(),startedAt:new Date().toISOString(),label:timerLabel.trim()||'Focus session'}}));}
  function stopTimer(){setStore(s=>s.active?({...s,sessions:[...s.sessions,{...s.active,endedAt:new Date().toISOString()}],active:null}):s);}
  function exportJson(){downloadText('dayflow-backup-'+date+'.json',JSON.stringify(store,null,2),'application/json');}
  function exportCsv(){
    const rows:Array<Array<string|number>>=[['Date','Kind','Activity','Category','Start','End','Minutes']];
    items.forEach(a=>rows.push([date,'Planned',a.title,LABELS[a.category],clockLabel(a.start),clockLabel(a.end),a.end-a.start]));
    store.sessions.forEach(s=>{if(localDate(new Date(s.startedAt))===date || localDate(new Date(s.endedAt))===date)rows.push([date,'Actual',s.label,'Focus',timeMinutes(s.startedAt),timeMinutes(s.endedAt),Math.round((Date.parse(s.endedAt)-Date.parse(s.startedAt))/60000)]);});
    downloadText('dayflow-'+date+'.csv',csv(rows),'text/csv;charset=utf-8');
  }
  async function importJson(e:React.ChangeEvent<HTMLInputElement>){
    const f=e.target.files?.[0];if(!f)return;
    try {
      const value=validateImport(JSON.parse(await f.text()));
      if(window.confirm('Replace your current planner data with this backup?'))setStore(value);
    } catch(err){window.alert(err instanceof Error?err.message:'Could not read backup.');}
    e.target.value='';
  }
  function clearDay(){if(window.confirm('Delete all planned activities on this day?'))setStore(s=>({...s,activities:s.activities.filter(a=>a.date!==date)}));}
  function demoDay(){if(items.length&& !window.confirm('Replace this day\'s activities with an example schedule?'))return;setStore(s=>({...s,activities:[...s.activities.filter(a=>a.date!==date),...sampleActivities(date).map(a=>({...a,id:id()}))]}));}
  function onBlockDown(e:React.PointerEvent<HTMLDivElement>,a:Activity,mode:'move'|'resize'){
    if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current={id:a.id,mode,y:e.clientY,start:a.start,end:a.end,moved:false};blockClickRef.current=false;
  }
  function onBlockMove(e:React.PointerEvent<HTMLDivElement>){
    const d=dragRef.current;if(!d)return;
    const delta=snap5(e.clientY-d.y);
    if(Math.abs(e.clientY-d.y)>4)d.moved=true;
    if(!d.moved)return;
    setStore(s=>({...s,activities:s.activities.map(a=>{
      if(a.id!==d.id)return a;
      if(d.mode==='move'){const duration=d.end-d.start;const start=clamp(d.start+delta,0,1440-duration);return {...a,start,end:start+duration};}
      return {...a,end:clamp(d.end+delta,d.start+5,1440)};
    })}));
  }
  function onBlockUp(a:Activity){
    if(!dragRef.current)return;
    const moved=dragRef.current.moved;dragRef.current=null;
    if(!moved)openEdit(a);else blockClickRef.current=true;
  }
  if(!ready||!date||!now)return <div className="loading">Loading Dayflow…</div>;
  const focusMinutes=view==='planned'?focusPlanned:actual.credited;
  const ratio=view==='planned'?percent(focusPlanned,scheduled):percent(actual.credited,1440);
  return <main className={'app theme-'+theme}>
    <div className="shell">
      <header className="topbar">
        <div className="brand"><div className="brand-icon"><ActivityIcon size={23}/></div><div><strong>dayflow<span>.</span></strong><small>YOUR DAILY OPERATING SYSTEM</small></div></div>
        <div className="top-actions">
          <button className="icon-button" title="Toggle color scheme" aria-label="Toggle color scheme" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')}>{theme==='dark'?<Sun size={18}/>:<Moon size={18}/>}</button>
          <button className="button subtle" onClick={exportJson}><Download size={15}/> Backup</button>
          <button className="button subtle" onClick={()=>fileRef.current?.click()}><Upload size={15}/> Import</button>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={importJson} hidden />
        </div>
      </header>
      <div className="intro">
        <div><div className="eyebrow">PERSONAL WORKSPACE / PRODUCTIVITY</div><h1>Make your day count<span>.</span></h1><p>Plan with intention. Focus in real time. Learn from every week.</p></div>
        <button className="button primary add-top" onClick={()=>openNew()}><Plus size={17}/> New activity</button>
      </div>
      <div className="datebar">
        <div className="date-switch"><button className="icon-button" title="Previous day" onClick={()=>setDate(shiftDate(date,-1))}><ChevronLeft size={18}/></button><div><CalendarDays size={16}/><b>{dateFromKey(date).toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'})}</b></div><button className="icon-button" title="Next day" onClick={()=>setDate(shiftDate(date,1))}><ChevronRight size={18}/></button><button className="button small" onClick={()=>setDate(localDate(new Date()))}>Today</button></div>
        <div className="tabs" role="tablist"><button role="tab" aria-selected={view==='planned'} className={view==='planned'?'selected':''} onClick={()=>setView('planned')}>Planned</button><button role="tab" aria-selected={view==='actual'} className={view==='actual'?'selected':''} onClick={()=>setView('actual')}>Actual</button></div>
      </div>
      <div className="metrics">
        <Metric title={view==='planned'?'Planned deep focus':'Credited focus'} value={minutesLabel(focusMinutes)} detail={view==='planned'?'Scheduled focus blocks':'Includes qualifying short breaks'} accent="purple"/>
        <Metric title={view==='planned'?'Scheduled time':'Raw timer time'} value={minutesLabel(view==='planned'?scheduled:actual.raw)} detail={view==='planned'?'Across all activities':'Verified running sessions'} accent="teal"/>
        <Metric title={view==='planned'?'Focus ratio':'Daily focus coverage'} value={ratio+'%'} detail={view==='planned'?'Focus / scheduled time':'Credited focus / 24h'} accent="orange"/>
        <Metric title={view==='planned'?'Unscheduled time':'Dotted interruptions'} value={minutesLabel(view==='planned'?1440-occupied:actual.dotted)} detail={view==='planned'?'Remaining within 24 hours':'Gaps from 10 to under 20 min'} accent="pink"/>
      </div>
      <div className="content-grid">
        <section className="surface calendar-panel">
          <div className="panel-heading"><div><h2><Clock3 size={18}/> 24-hour timeline</h2><p>{view==='planned'?'Click an empty slot to add · Drag a block to move · Drag its bottom to resize':'True time intervals from focus sessions, including live progress'}</p></div><div className="panel-actions">{view==='planned'&&<><button className="button tiny" onClick={demoDay}><RotateCcw size={13}/> Example</button><button className="button tiny" onClick={clearDay}><Trash2 size={13}/> Clear</button></>}<button className="button tiny" onClick={exportCsv}><Download size={13}/> CSV</button></div></div>
          <div className="legend">{(Object.keys(COLORS) as Category[]).map(c=><span key={c}><i style={{background:COLORS[c]}}/>{LABELS[c]}</span>)}{view==='actual'&&<><span><i className="dot-pattern"/>10–19m gap</span><span><i style={{background:'#90d5ad'}}/>&lt;10m credited</span></>}</div>
          <div className="timeline-scroll" ref={scroller}>
            <div className="timeline" onClick={e=>{if(view!=='planned'||blockClickRef.current){blockClickRef.current=false;return;}if((e.target as HTMLElement).closest('.task'))return;const r=e.currentTarget.getBoundingClientRect();openNew(e.clientY-r.top);}}>
              <div className="timeline-lines"/>{Array.from({length:24},(_,h)=><div key={h} className="time-label" style={{top:h*60}}>{String(h).padStart(2,'0')}:00</div>)}
              <div className="task-layer">{view==='planned'?items.map(a=><div key={a.id} role="button" tabIndex={0} aria-label={'Edit '+a.title} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openEdit(a);}}} className={'task category-'+a.category} style={{top:a.start,height:a.end-a.start,background:COLORS[a.category]+'28',borderLeftColor:COLORS[a.category]}} onPointerDown={e=>onBlockDown(e,a,'move')} onPointerMove={onBlockMove} onPointerUp={()=>onBlockUp(a)} onPointerCancel={()=>{dragRef.current=null;}}>
                  <strong>{a.title}</strong>{a.end-a.start>=22&&<small>{clockLabel(a.start)} – {clockLabel(a.end)}</small>}<div className="task-grip" title="Drag to resize" onPointerDown={e=>{e.stopPropagation();onBlockDown(e,a,'resize');}}/>
                </div>):actual.blocks.map((b,i)=><div key={i} className={'actual-block '+b.kind} style={{top:b.start,height:Math.max(1,b.end-b.start)}} title={b.kind+' · '+minutesLabel(b.end-b.start)}>{b.end-b.start>=24&&<span>{b.kind==='focus'?'Tracked focus':b.kind==='credited'?'Short break credited':'Dotted break'} · {minutesLabel(b.end-b.start)}</span>}</div>)}</div>
              {date===localDate(now)&&<div className="now-line" style={{top:now.getHours()*60+now.getMinutes()}}><b>NOW</b></div>}
            </div>
          </div>
          <div className="timeline-foot"><Settings2 size={14}/>{view==='planned'?'All times snap to 5-minute intervals. Blocks can start at 12:45 or any other 5-minute mark.':'Short breaks <10m are credited; 10–19m breaks are dotted and consolidated; 20m+ gaps remain separated.'}</div>
        </section>
        <aside className="sidebar">
          <section className="surface timer-panel"><div className="panel-heading"><h2><Play size={17}/> Focus timer</h2><span className={'status '+(store.active?'active':'')}>{store.active?'● Recording':'○ Ready'}</span></div><div className="timer-body"><div className="timer-digits">{String(Math.floor(activeSeconds/3600)).padStart(2,'0')}:{String(Math.floor(activeSeconds%3600/60)).padStart(2,'0')}:{String(activeSeconds%60).padStart(2,'0')}</div><p>{store.active?activeTitle:'Log actual focused work'}</p>{!store.active&&<input className="timer-input" aria-label="Focus session title" placeholder="Session name" value={timerLabel} onChange={e=>setTimerLabel(e.target.value)}/>}<button className={'button timer-button '+(store.active?'stop':'primary')} onClick={store.active?stopTimer:startTimer}>{store.active?<><Pause size={16}/> Stop & save session</>:<><Play size={16}/> Start focus session</>}</button></div></section>
          <section className="surface"><div className="panel-heading"><h2><BarChart3 size={18}/> Time distribution</h2><span className="muted">24 hours</span></div><Donut stats={view==='planned'?(Object.keys(COLORS) as Category[]).map(c=>({label:LABELS[c],color:COLORS[c],minutes:unionMinutes(items.filter(x=>x.category===c).map(x=>[x.start,x.end] as [number,number]))})): [{label:'Tracked focus',color:COLORS.focus,minutes:actual.raw},{label:'Credited short breaks',color:'#90d5ad',minutes:Math.max(0,actual.credited-actual.raw)},{label:'Dotted breaks',color:COLORS.break,minutes:actual.dotted}]} /></section>
          <section className="surface"><div className="panel-heading"><h2><BarChart3 size={18}/> Focus intensity</h2><span className="muted">By hour</span></div><div className="chart-body"><div className="hour-bars">{hourly.map((n,i)=><div className="hour-slot" key={i} title={String(i).padStart(2,'0')+':00 · '+minutesLabel(n)}><div style={{height:Math.min(100,n/60*100)+'%'}}/></div>)}</div><div className="chart-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div></section>
          <section className="surface insights"><div className="panel-heading"><h2>Daily insights</h2><span className="muted">Live</span></div><div className="insight-list"><div><b>{items.length}</b><span> planned activities</span></div><div><b>{minutesLabel(Math.max(0,scheduled-occupied))}</b><span> overlapping scheduled time</span></div><div><b>{minutesLabel(actual.raw)}</b><span> tracked focus today</span></div><div><b>{minutesLabel(actual.credited)}</b><span> credited focus today</span></div></div></section>
        </aside>
      </div>
      <section className="surface reports"><div className="panel-heading"><div><h2><BarChart3 size={19}/> Productivity analytics</h2><p>Compare your intentions with your actual focus time.</p></div><div className="tabs"><button className={panel==='day'?'selected':''} onClick={()=>setPanel('day')}>Day comparison</button><button className={panel==='week'?'selected':''} onClick={()=>setPanel('week')}>Weekly report</button></div></div>
      {panel==='day'?<div className="comparison"><div className="comparison-grid"><CompareBar label="Planned focus" value={focusPlanned} max={Math.max(60,focusPlanned,actual.raw)} color={COLORS.focus}/><CompareBar label="Actual focus" value={actual.raw} max={Math.max(60,focusPlanned,actual.raw)} color={COLORS.work}/><CompareBar label="Credited focus" value={actual.credited} max={Math.max(60,focusPlanned,actual.credited)} color="#90d5ad"/></div><div className="comparison-note"><b>{percent(actual.raw,focusPlanned)}%</b><span> of planned focus time recorded by the timer{focusPlanned===0?' (no plan yet)':''}. Actual and planned time are independent measurements.</span></div></div>:<div className="weekly"><div className="weekly-summary"><div><small>WEEKLY PLAN</small><strong>{minutesLabel(weekTotals.planned)}</strong></div><div><small>TRACKED FOCUS</small><strong>{minutesLabel(weekTotals.actual)}</strong></div><div><small>CREDITED FOCUS</small><strong>{minutesLabel(weekTotals.credited)}</strong></div><div><small>PLAN COMPLETION</small><strong>{percent(weekTotals.actual,weekTotals.planned)}%</strong></div></div><div className="week-grid">{week.map(d=><div className={'week-day '+(d.date===date?'current':'')} key={d.date} onClick={()=>{setDate(d.date);setPanel('day');}} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==='Enter'){setDate(d.date);setPanel('day');}}}><span>{dateFromKey(d.date).toLocaleDateString('en-US',{weekday:'short'})}</span><strong>{dateFromKey(d.date).getDate()}</strong><div className="week-bars"><i style={{height:Math.min(100,d.planned/480*100)+'%',background:COLORS.focus}}/><i style={{height:Math.min(100,d.actual/480*100)+'%',background:COLORS.work}}/></div><small>{minutesLabel(d.actual)} actual</small></div>)}</div><div className="week-legend"><span><i style={{background:COLORS.focus}}/> Planned</span><span><i style={{background:COLORS.work}}/> Actual</span></div></div>}</section>
      <footer><span>DAYFLOW · Private, browser-local data · Export JSON backups to keep your history</span><span>5-minute precision · 24-hour clock</span></footer>
    </div>
    {editor&&<div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(null)}}><form className="modal" onSubmit={saveActivity}><div className="modal-heading"><h2>{editor.id?'Edit activity':'New activity'}</h2><button type="button" className="icon-button" onClick={()=>setEditor(null)}><X size={19}/></button></div><label>Activity name<input required maxLength={100} placeholder="What will you work on?" value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label><label>Category<select value={editor.category} onChange={e=>setEditor({...editor,category:e.target.value as Category})}>{(Object.keys(LABELS) as Category[]).map(k=><option key={k} value={k}>{LABELS[k]}</option>)}</select></label><div className="form-row"><label>Start time<input type="time" step={300} required value={editor.start} onChange={e=>setEditor({...editor,start:e.target.value})}/></label><label>End time<input type="time" step={300} required value={editor.end} onChange={e=>setEditor({...editor,end:e.target.value})}/></label></div><p className="form-hint">5-minute steps · Midnight end: 00:00</p>{error&&<div className="form-error">{error}</div>}<div className="modal-actions">{editor.id&&<button type="button" className="button delete" onClick={removeActivity}><Trash2 size={15}/> Delete</button>}<button type="button" className="button" onClick={()=>setEditor(null)}>Cancel</button><button type="submit" className="button primary">Save activity</button></div></form></div>}
  </main>;
}
function Metric({title,value,detail,accent}:{title:string;value:string;detail:string;accent:string}){return <div className="metric"><div className="metric-top"><span>{title}</span><i className={'metric-dot '+accent}/></div><strong>{value}</strong><small>{detail}</small></div>;}
function Donut({stats}:{stats:Array<{label:string;color:string;minutes:number}>}){
  let offset=0;const stops:string[]=[];
  stats.forEach(s=>{const pct=Math.min(100,Math.max(0,s.minutes/1440*100));stops.push(s.color+' '+offset+'% '+(offset+pct)+'%');offset+=pct;});
  stops.push('var(--track) '+Math.min(100,offset)+'% 100%');
  return <div className="donut-body"><div className="donut" style={{background:'conic-gradient('+stops.join(',')+')'}}><div><strong>{Math.round(offset)}%</strong><small>Time allocated</small></div></div><div className="distribution">{stats.map(s=><div key={s.label}><span><i style={{background:s.color}}/>{s.label}</span><b>{minutesLabel(s.minutes)}</b></div>)}</div></div>;
}
function CompareBar({label,value,max,color}:{label:string;value:number;max:number;color:string}){return <div className="compare-line"><div><span>{label}</span><strong>{minutesLabel(value)}</strong></div><div className="bar-track"><div style={{width:(value/max*100)+'%',background:color}}/></div></div>;}
