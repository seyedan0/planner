export type Category = 'focus' | 'work' | 'break' | 'personal';
export type Activity = { id: string; date: string; title: string; category: Category; start: number; end: number };
export type Session = { id: string; startedAt: string; endedAt: string; label: string };
export type ActiveSession = { id: string; startedAt: string; label: string };
export type PlannerData = { version: 1; activities: Activity[]; sessions: Session[]; active: ActiveSession | null };
export const EMPTY: PlannerData = { version: 1, activities: [], sessions: [], active: null };
export const COLORS: Record<Category, string> = {
  focus: '#7975ee', work: '#0fb9a4', break: '#efb35b', personal: '#d084cd'
};
export const LABELS: Record<Category, string> = {
  focus: 'Deep focus', work: 'Work / meetings', break: 'Break / rest', personal: 'Personal'
};
export function localDate(d: Date): string {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
export function dateFromKey(key: string): Date { return new Date(key + 'T12:00:00'); }
export function shiftDate(key: string, days: number): string {
  const d = dateFromKey(key); d.setDate(d.getDate() + days); return localDate(d);
}
export function minutesLabel(n: number): string {
  n = Math.max(0, Math.round(n));
  const h = Math.floor(n / 60), m = n % 60;
  return h ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
}
export function clockLabel(n: number): string {
  if (n === 1440) return '24:00';
  return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
}
export function readClock(v: string): number {
  const [h, m] = v.split(':').map(Number); return h * 60 + m;
}
export function clamp(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }
export function snap5(n: number): number { return Math.round(n / 5) * 5; }
export function unionMinutes(ranges: Array<[number, number]>): number {
  const sorted = ranges.filter(([a,b]) => b > a).sort((a,b) => a[0] - b[0]);
  let last = 0, total = 0;
  for (const [a,b] of sorted) { total += Math.max(0,b - Math.max(last,a)); last = Math.max(last,b); }
  return total;
}
export type DayInterval = { start: number; end: number; kind: 'focus' | 'credited' | 'dotted' };
export function daySessions(sessions: Session[], day: string, active: ActiveSession | null, now: Date): Array<[number,number]> {
  const start = new Date(day + 'T00:00:00').getTime();
  const finish = new Date(shiftDate(day,1) + 'T00:00:00').getTime();
  const all = sessions.map(s => [Date.parse(s.startedAt), Date.parse(s.endedAt)] as [number,number]);
  if (active) all.push([Date.parse(active.startedAt), now.getTime()]);
  return all.map(([a,b]) => [Math.max(a,start),Math.min(b,finish)] as [number,number])
    .filter(([a,b]) => b > a)
    .map(([a,b]) => [(a-start)/60000,(b-start)/60000] as [number,number])
    .sort((a,b) => a[0] - b[0]);
}
export function buildActualIntervals(raw: Array<[number,number]>): DayInterval[] {
  const ranges = raw.filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
  const result: DayInterval[] = [];
  for(let i=0;i<ranges.length;i++){
    const [a,b]=ranges[i];
    if (i>0) {
      const prev=ranges[i-1][1],gap=a-prev;
      if(gap>0 && gap<10) result.push({start:prev,end:a,kind:'credited'});
      else if(gap>=10 && gap<20) result.push({start:prev,end:a,kind:'dotted'});
    }
    result.push({start:a,end:b,kind:'focus'});
  }
  return result;
}
export function actualStats(raw: Array<[number,number]>) {
  const blocks = buildActualIntervals(raw);
  return {
    raw: unionMinutes(raw),
    credited: unionMinutes(blocks.filter(x=>x.kind==='focus'||x.kind==='credited').map(x=>[x.start,x.end] as [number,number])),
    dotted: blocks.filter(x=>x.kind==='dotted').reduce((n,x)=>n+x.end-x.start,0),
    blocks
  };
}
export function sampleActivities(date: string): Activity[] {
  const sample: Array<[string,Category,number,number]> = [
    ['Morning routine','personal',420,470],['Deep work · Main project','focus',480,600],
    ['Coffee break','break',600,615],['Build & design sprint','focus',615,735],
    ['Lunch','break',735,795],['Team / coordination','work',795,870],
    ['Creative focus','focus',885,1005],['Inbox and admin','work',1020,1080],
    ['Exercise','personal',1095,1170]
  ];
  return sample.map(([title,category,start,end],i)=>({id:'demo-'+date+'-'+i,date,title,category,start,end}));
}
export function downloadText(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text],{type:mime}));
  const anchor = document.createElement('a'); anchor.href=url;anchor.download=name;anchor.click();
  window.setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export function csvEscape(x: string | number): string {return '"'+String(x).replaceAll('"','""')+'"';}
export function validateImport(value: unknown): PlannerData {
  if (!value || typeof value!=='object') throw new Error('Invalid backup file.');
  const v=value as Partial<PlannerData>;
  if(v.version!==1 || !Array.isArray(v.activities) || !Array.isArray(v.sessions)) throw new Error('Unsupported backup format.');
  for(const a of v.activities) {
    if(typeof a.id!=='string'||typeof a.date!=='string'||typeof a.title!=='string'||!Object.keys(COLORS).includes(a.category)||
      !Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||a.end>1440||a.start>=a.end||a.start%5!==0||a.end%5!==0) throw new Error('Invalid activity in backup.');
  }
  for(const s of v.sessions) if(typeof s.id!=='string'||typeof s.label!=='string'||!Number.isFinite(Date.parse(s.startedAt))||!Number.isFinite(Date.parse(s.endedAt))||Date.parse(s.endedAt)<Date.parse(s.startedAt)) throw new Error('Invalid session in backup.');
  const active=v.active;
  if(active && (typeof active.id!=='string'||typeof active.label!=='string'||!Number.isFinite(Date.parse(active.startedAt)))) throw new Error('Invalid active timer.');
  return {version:1,activities:v.activities,sessions:v.sessions,active:active||null};
}
