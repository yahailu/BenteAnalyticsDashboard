/* BENTE ANALYTICS — Police Command Dashboard */
'use strict';

let allData=[], filteredCmd=[];
let mapInstance=null,heatLayer=null,markerLayer=null,mapRiskFilter='ALL';
let CH={},ICH={};

const VENUE_ICONS={'Nightclub':'🎵','Bar/Lounge':'🍸','Restaurant':'🍽','Cafe':'☕','Entertainment':'🎭','Food Court':'🍜','Mall':'🛍','Gym':'💪','Coworking':'💼','Park':'🌳','Hotel Bar':'🍹','Sports Bar':'🏆'};
const FLAG_COL={'CRITICAL':'#ff0033','HIGH':'#ff3355','ELEVATED':'#ffaa00','NORMAL':'#00ff88'};
const FLAG_CLASS={'CRITICAL':'dp-critical','HIGH':'dp-high','ELEVATED':'dp-elevated','NORMAL':'dp-normal'};
const ZONE_COLS={'Zone A — Downtown':'#ff0033','Zone B — Harbor District':'#ff3355','Zone C — Midtown':'#00c8ff','Zone D — Waterfront':'#00ff88','Zone E — North End':'#9b59ff','Zone F — Commercial':'#ffaa00','Zone G — East Side':'#ff8800','Zone H — South Side':'#ff55aa','Zone I — University':'#00aaff','Zone J — Industrial':'#55ff88'};

const WHY_REASON = {
  'CRITICAL': 'Crowd density exceeds safe capacity threshold. Immediate officer presence required to prevent escalation.',
  'HIGH':     'Elevated crowd activity detected. Venue requires close monitoring and potential intervention.',
  'ELEVATED': 'Above-average foot traffic. Routine patrol recommended to maintain order.',
  'NORMAL':   'Crowd activity within normal parameters. No immediate action required.'
};

function initDashboard(){
  if(typeof RAW_DATA === 'undefined'){
    // data.js not yet loaded - wait and retry
    setTimeout(initDashboard, 100);
    return;
  }
  allData = RAW_DATA.map(r=>({...r}));
  filteredCmd = [...allData];
  populateDropdowns();
  buildOpsSearch();
  showPage('welcome');
  renderSitrep();
}

document.addEventListener('DOMContentLoaded',()=>{
  startClock();
  initDashboard();
});

function startClock(){const t=()=>{set('nav-clock',new Date().toLocaleTimeString('en-US',{hour12:false}));};t();setInterval(t,1000);}

/* ─── NAVIGATION ─── */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>{p.classList.remove('active');p.style.display='none';});
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.sb-icon').forEach(s=>s.classList.remove('active'));
  const pg=document.getElementById('page-'+name);
  if(pg){pg.classList.add('active');pg.style.display=name==='heatmap'?'flex':'block';}
  document.getElementById('nt-'+name)?.classList.add('active');
  document.getElementById('sbi-'+name)?.classList.add('active');
  if(name==='heatmap')      setTimeout(initHeatmap,60);
  if(name==='trends')       renderTrends();
  if(name==='investigation')initInvestigation();
  if(name==='sitrep')       {if(allData.length)renderSitrep();}
  if(name==='welcome')      {if(allData.length)renderWelcome();}
  if(name==='events')       {if(allData.length)renderEvents();}
  if(name==='ai')           {if(allData.length)initAiAgent();}
}

/* ─── DROPDOWNS ─── */
function populateDropdowns(){
  const cats  =[...new Set(allData.map(d=>d.venue_category))].sort();
  const zones =[...new Set(allData.map(d=>d.patrol_zone))].sort();
  const venues=[...new Set(allData.map(d=>d.venue_name))].sort();
  const hours =[...new Set(allData.map(d=>d.hour_of_day))].sort((a,b)=>a-b);
  ['cmd-zone','wl-zone','tr-zone','fc-zone','sr-zone'].forEach(id=>addO(id,zones));
  const states=[...new Set(allData.map(d=>d.state))].sort();
  const counties=[...new Set(allData.map(d=>d.county))].sort();
  const cities=[...new Set(allData.map(d=>d.city))].sort();
  ['sr-county','inv-county','ev-county'].forEach(id=>addO(id,counties));
  ['sr-city','inv-city'].forEach(id=>addO(id,cities));
  ['wl-cat','tr-cat','sr-cat'].forEach(id=>addO(id,cats));
  addO('inv-venue',venues);addO('inv-zone',zones);
  hours.forEach(h=>{document.getElementById('inv-hour')?.add(new Option(fmtH(h),h));});
}
function addO(id,vals){const el=document.getElementById(id);if(el)vals.forEach(v=>el.add(new Option(v,v)));}

/* ─── HELPERS ─── */
function fmtH(h){if(h===0)return'12AM';if(h<12)return h+'AM';if(h===12)return'12PM';return(h-12)+'PM';}
function avg(arr){if(!arr.length)return 0;return arr.reduce((s,v)=>s+v,0)/arr.length;}
function v(id){return document.getElementById(id)?.value||'';}
function set(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;}
function sh(id,vis){const el=document.getElementById(id);if(el)el.style.display=vis?'block':'none';}
function dc(d){if(d>=85)return'#ff0033';if(d>=70)return'#ff3355';if(d>=50)return'#ffaa00';return'#00ff88';}
function flagClass(f){return f==='CRITICAL'?'tag-critical':f==='HIGH'?'tag-high':f==='ELEVATED'?'tag-elevated':'tag-normal';}
function riskBadgeClass(f){return f==='CRITICAL'?'risk-critical':f==='HIGH'?'risk-high':f==='ELEVATED'?'risk-elevated':'risk-normal';}
function hmC(n){if(n===0)return'rgba(4,8,15,.4)';if(n<.2)return`rgba(0,20,60,${.3+n*2})`;if(n<.5)return`rgba(0,80,180,${.35+n*.6})`;if(n<.8)return`rgba(255,170,0,${.5+n*.45})`;return`rgba(255,0,51,${.6+n*.4})`;}
function grad(ctx,top,bottom){const g=ctx.createLinearGradient(0,0,0,300);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
function destroyC(k){if(CH[k]){CH[k].destroy();delete CH[k];}if(ICH[k]){ICH[k].destroy();delete ICH[k];}}
function sx(){return{grid:{color:'rgba(0,200,255,.05)',drawBorder:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9},maxRotation:0}};}
function sy(label='',mn=0,mx=undefined){return{grid:{color:'rgba(0,200,255,.05)',drawBorder:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9}},min:mn,...(mx!==undefined?{max:mx}:{}),beginAtZero:true,title:{display:!!label,text:label,color:'#3a5570',font:{family:'monospace',size:9}}};}
function tt(){return{backgroundColor:'rgba(5,8,16,.97)',borderColor:'rgba(0,200,255,.2)',borderWidth:1,titleColor:'#e8f4ff',bodyColor:'#7a9bb5',titleFont:{family:'Rajdhani',size:12,weight:700},bodyFont:{family:'monospace',size:10},padding:10,cornerRadius:6,displayColors:true,boxWidth:7,boxHeight:7};}

function goInvestigate(vname){
  const el=document.getElementById('inv-venue');if(el)el.value=vname;
  showPage('investigation');setTimeout(runInvestigation,100);
}
function focusVenueOnMap(vname){
  showPage('heatmap');
  setTimeout(()=>{
    if(!mapInstance||!markerLayer)return;
    const rec=allData.find(d=>d.venue_name===vname);if(!rec)return;
    mapInstance.setView([rec.latitude,rec.longitude],16,{animate:true});
    markerLayer.eachLayer(layer=>{
      if(layer.getLatLng){
        const ll=layer.getLatLng();
        if(Math.abs(ll.lat-rec.latitude)+Math.abs(ll.lng-rec.longitude)<0.001)
          setTimeout(()=>layer.openPopup(),400);
      }
    });
  },100);
}

/* ── HELPERS ── */
function crowdLevel(avgD){
  if(avgD>=85)return{label:'OVERCROWDED',col:'#ff0033'};
  if(avgD>=70)return{label:'VERY BUSY',col:'#ff3355'};
  if(avgD>=50)return{label:'BUSY',col:'#ffaa00'};
  return{label:'MODERATE',col:'#00ff88'};
}

/* ════════ SITUATION REPORT (Public Safety Intelligence) ════════ */
function resetSrCounty(){
  const co=document.getElementById('sr-county');if(co)co.value='';
  const ci=document.getElementById('sr-city');if(ci)ci.value='';
}

function resetSitrep(){
  ['sr-county','sr-city','sr-zone','sr-cat','sr-flag'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderSitrep();
}

function renderSitrep(){
  const zone=v('sr-zone'),cat=v('sr-cat'),flag=v('sr-flag');
  const county=v('sr-county'),city=v('sr-city');
  const data=allData.filter(d=>{
    if(county&&d.county!==county)return false;
    if(city&&d.city!==city)return false;
    if(zone&&d.patrol_zone!==zone)return false;
    if(cat&&d.venue_category!==cat)return false;
    if(flag&&d.incident_flag!==flag)return false;
    return true;
  });

  // KPIs
  const critV=new Set(data.filter(d=>d.incident_flag==='CRITICAL').map(d=>d.venue_name)).size;
  const highV=new Set(data.filter(d=>d.incident_flag==='HIGH').map(d=>d.venue_name)).size;
  const totalV=new Set(data.map(d=>d.venue_name)).size;
  const hcnt={};data.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  set('sr-kpi-critical',critV.toLocaleString());
  set('sr-kpi-high',highV.toLocaleString());
  const srFlag=v('sr-flag');
  const activeZones=srFlag
    ?new Set(data.filter(d=>d.incident_flag===srFlag).map(d=>d.patrol_zone)).size
    :new Set(data.filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH').map(d=>d.patrol_zone)).size;
  set('sr-kpi-venues',activeZones.toLocaleString());
  set('sr-kpi-venues-sub',totalV.toLocaleString()+' venues · '+data.length.toLocaleString()+' check-ins');
  set('sr-kpi-peak',pk?fmtH(+pk[0]):'—');
  set('sr-kpi-peak-sub',pk?pk[1]+' check-ins recorded':'');

  // Officer Actions
  renderSrOfficerActions(data);

  // Venue Grid
  renderSrVenueGrid(data);
}

function filterSrByFlag(flag){
  const el=document.getElementById('sr-flag');if(el)el.value=flag;
  renderSitrep();
}

function renderSrOfficerActions(data){
  const el=document.getElementById('sr-officer-actions');if(!el)return;
  const actions=[
    {flag:'CRITICAL',action:'Immediate Response',icon:'🚨',col:'#ff0033',bg:'rgba(255,0,51,.1)',bdr:'rgba(255,0,51,.3)'},
    {flag:'HIGH',action:'Monitor Closely',icon:'⚠',col:'#ff3355',bg:'rgba(255,51,85,.08)',bdr:'rgba(255,51,85,.25)'},
    {flag:'ELEVATED',action:'Routine Patrol',icon:'👁',col:'#ffaa00',bg:'rgba(255,170,0,.08)',bdr:'rgba(255,170,0,.2)'},
    {flag:'NORMAL',action:'No Action Required',icon:'✓',col:'#00ff88',bg:'rgba(0,255,136,.06)',bdr:'rgba(0,255,136,.15)'},
  ];
  const vm={};data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={flag:d.incident_flag,dens:[],zone:d.patrol_zone};vm[d.venue_name].dens.push(d.crowd_density);});
  const topByFlag={};
  Object.entries(vm).forEach(([name,v2])=>{
    const avgD=avg(v2.dens);
    if(!topByFlag[v2.flag]||avgD>topByFlag[v2.flag].avgD)topByFlag[v2.flag]={name,avgD,zone:v2.zone};
  });
  const counts={CRITICAL:0,HIGH:0,ELEVATED:0,NORMAL:0};
  Object.values(vm).forEach(v2=>{counts[v2.flag]=(counts[v2.flag]||0)+1;});
  const tot=Object.values(counts).reduce((a,b)=>a+b,0)||1;
  el.innerHTML=actions.map(a=>{
    const cnt=counts[a.flag]||0,pct=(cnt/tot*100).toFixed(0);
    const top=topByFlag[a.flag];
    return `<div style="padding:16px;background:${a.bg};border:1px solid ${a.bdr};border-radius:8px;cursor:pointer;transition:all .15s;" onclick="filterSrByFlag('${a.flag}')">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:24px;">${a.icon}</div>
        <div style="font-family:var(--disp);font-size:13px;font-weight:700;color:${a.col};">${a.action}</div>
      </div>
      <div style="font-family:var(--disp);font-size:32px;font-weight:700;color:${a.col};margin-bottom:4px;">${cnt.toLocaleString()}</div>
      <div style="font-size:10px;color:var(--t3);margin-bottom:8px;">${pct}% of all venues</div>
      <div style="font-size:10px;color:var(--t2);padding-top:8px;border-top:1px solid ${a.bdr};">
        ${top?`📍 ${top.name}<br/>${top.zone.split('—')[0].trim()}`:'No active incidents'}
      </div>
    </div>`;
  }).join('');
}

function renderSrVenueGrid(data){
  const vm={};
  data.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,zone:d.patrol_zone,dens:[],flags:[],acts:[],days:[],hours:[]};
    vm[d.venue_name].dens.push(d.crowd_density);
    vm[d.venue_name].flags.push(d.incident_flag);
    vm[d.venue_name].acts.push(d.activity_type);
    vm[d.venue_name].days.push(d.day_of_week);
    vm[d.venue_name].hours.push(d.hour_of_day);
  });
  const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  const flagFilter=v('sr-flag');
  const sorted=Object.entries(vm).map(([n,v2])=>({
    n,cat:v2.cat,zone:v2.zone,avgD:avg(v2.dens),
    topFlag:v2.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL',
    critCount:v2.flags.filter(f=>f==='CRITICAL').length,
    highCount:v2.flags.filter(f=>f==='HIGH').length,
    topAct:[...new Set(v2.acts)].slice(0,2).join(' & '),
    topDay:(()=>{const dc={};v2.days.forEach(d=>{dc[d]=(dc[d]||0)+1;});return Object.entries(dc).sort((a,b)=>b[1]-a[1])[0]?.[0]||'—';})(),
    peakHour:(()=>{const hc={};v2.hours.forEach(h=>{hc[h]=(hc[h]||0)+1;});const ph=Object.entries(hc).sort((a,b)=>b[1]-a[1])[0];return ph?fmtH(+ph[0]):'—';})(),
  })).filter(v2=>{
    if(flagFilter) return v2.topFlag===flagFilter; // exact match when filtered
    return ord[v2.topFlag]>=2; // default: Critical+High only
  }).sort((a,b)=>ord[b.topFlag]-ord[a.topFlag]||b.avgD-a.avgD).slice(0,20);

  set('sr-venue-count','Top '+sorted.length+' venues · Ranked by severity');
  const grid=document.getElementById('sr-venue-grid');if(!grid)return;grid.innerHTML='';
  sorted.forEach(v2=>{
    const col=FLAG_COL[v2.topFlag],icon=VENUE_ICONS[v2.cat]||'📍';
    const wcClass='wc-'+(v2.topFlag||'normal').toLowerCase();
    const actionBg={'CRITICAL':'rgba(255,0,51,.1)','HIGH':'rgba(255,51,85,.08)','ELEVATED':'rgba(255,170,0,.08)','NORMAL':'rgba(0,255,136,.06)'};
    const action={'CRITICAL':'Immediate Response','HIGH':'Monitor Closely','ELEVATED':'Routine Patrol','NORMAL':'No Action'}[v2.topFlag];
    const cl=crowdLevel(v2.avgD);
    const intelLine=v2.critCount>0?`${v2.critCount} critical event${v2.critCount>1?'s':''} recorded`:v2.highCount>0?`${v2.highCount} high-risk event${v2.highCount>1?'s':''} recorded`:'Elevated activity detected';
    const div=document.createElement('div');div.className=`watch-card ${wcClass}`;
    div.innerHTML=`
      <div class="wc-header">
        <div><div class="wc-name">${icon} ${v2.n}</div><div class="wc-cat">${v2.cat}</div></div>
        <div style="text-align:right;">
          <div style="font-family:var(--disp);font-size:16px;font-weight:700;color:${cl.col};">${cl.label}</div>
          <div style="font-size:9px;color:var(--t3);font-family:var(--mono);">${v2.topFlag}</div>
        </div>
      </div>
      <div class="wc-zone">📍 ${v2.zone}</div>
      <div class="wc-action" style="background:${actionBg[v2.topFlag]};color:${col};border:1px solid ${col}33;">${action}</div>
      <div class="wc-why" style="font-size:11px;color:var(--t2);line-height:1.6;">
        ⚑ ${intelLine}<br/>
        🕐 Peak activity: ${v2.peakHour} on ${v2.topDay}s<br/>
        🎭 Main activity: ${v2.topAct||v2.cat}
      </div>
      <div class="wc-bar"><div class="wc-bar-fill" style="width:${v2.avgD}%;background:linear-gradient(90deg,#003366,${col});"></div></div>
      <div class="wc-footer">
        <span class="tag ${flagClass(v2.topFlag)}">${v2.topFlag}</span>
        <span style="font-size:11px;color:var(--cyan);cursor:pointer;font-weight:600;" onclick="goInvestigate('${v2.n.replace(/'/g,"\'")}')">⊘ Investigate →</span>
      </div>`;
    div.onclick=(e)=>{if(!e.target.closest('span[onclick]'))focusVenueOnMap(v2.n);};
    grid.appendChild(div);
  });
  if(!sorted.length)grid.innerHTML='<div class="panel" style="text-align:center;padding:32px;color:var(--t3);grid-column:1/-1;">No venues match current filter</div>';
}

function renderFcWeeklyMatrix(data){
  const tbl=document.getElementById('fc-weekly-matrix');if(!tbl)return;
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hours=[0,2,4,6,8,10,12,14,16,18,20,22,23];
  const mat={};
  days.forEach(d=>{mat[d]={};for(let h=0;h<24;h++)mat[d][h]=[];});
  data.forEach(d=>{if(mat[d.day_of_week])mat[d.day_of_week][d.hour_of_day].push(d.crowd_density);});
  let maxV=0;
  days.forEach(dy=>hours.forEach(h=>{const a=mat[dy][h];if(a.length)maxV=Math.max(maxV,avg(a));}));

  const cellBg=(val)=>{
    if(!val||val<50)return'rgba(255,255,255,.03)';
    if(val>=85)return'rgba(255,0,51,.85)';
    if(val>=70)return'rgba(255,51,85,.72)';
    if(val>=50)return'rgba(255,140,0,.70)';
    return'rgba(255,200,0,.45)';
  };

  let html='<thead><tr>';
  html+=`<th style="font-size:9px;font-family:monospace;color:var(--t3);padding:5px 10px;text-align:right;white-space:nowrap;min-width:50px;">DAY</th>`;
  hours.forEach(h=>html+=`<th style="font-size:9px;font-family:monospace;color:var(--t3);padding:5px 4px;text-align:center;width:${Math.floor(100/hours.length)}%;">${fmtH(h)}</th>`);
  html+='</tr></thead><tbody>';

  days.forEach(dy=>{
    const isWknd=dy==='Friday'||dy==='Saturday'||dy==='Sunday';
    html+=`<tr><td style="font-size:10px;font-family:monospace;color:${isWknd?'#ff3355':'var(--t2)'};padding:5px 10px;text-align:right;font-weight:${isWknd?'700':'400'};white-space:nowrap;">${dy.slice(0,3).toUpperCase()}</td>`;
    hours.forEach(h=>{
      const arr=mat[dy][h]||[],val=arr.length?+avg(arr).toFixed(0):0;
      const bg=cellBg(val);
      const lbl=val>=50?val:'';
      const crowdLbl=val>=85?'OVERCROWDED':val>=70?'VERY BUSY':val>=50?'BUSY':val>=30?'MODERATE':'Quiet';
      html+=`<td onclick="filterVenueCardsByDayHour('${dy}',${h})"
        style="background:${bg};text-align:center;font-size:9px;font-weight:700;
        font-family:monospace;color:rgba(255,255,255,.9);border-radius:3px;
        cursor:pointer;transition:all .15s;padding:8px 2px;border:1px solid rgba(255,255,255,.04);"
        onmouseover="this.style.outline='2px solid #00c8ff';this.style.zIndex='10';"
        onmouseout="this.style.outline='none';this.style.zIndex='1';"
        title="${dy} ${fmtH(h)} — ${crowdLbl} (${val}% avg)">${lbl}</td>`;
    });
    html+='</tr>';
  });
  tbl.innerHTML=html+'</tbody>';
}

function filterVenueCardsByDayHour(day,hour){
  // Build dataset - use ±2 hour window to ensure enough venues
  let data2use=allData.filter(d=>d.day_of_week===day&&d.hour_of_day===hour);
  if(data2use.length<5)data2use=allData.filter(d=>d.day_of_week===day&&Math.abs(d.hour_of_day-hour)<=2);
  if(data2use.length<5)data2use=allData.filter(d=>d.day_of_week===day);
  if(!data2use.length)data2use=allData;
  // Update section title
  const title=document.querySelector('#fc-venue-cards')?.previousElementSibling;
  if(title)title.innerHTML=`<div style="font-family:var(--disp);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);">
    Top Venues — ${day} at ${fmtH(hour)} <span style="font-size:10px;color:var(--t3);font-weight:400;margin-left:8px;cursor:pointer;" onclick="renderFcCards(allData.filter(d=>{const z=v('tr-zone'),c=v('tr-cat');if(z&&d.patrol_zone!==z)return false;if(c&&d.venue_category!==c)return false;return true;}));resetMatrixTitle();">✕ Reset</span>
  </div>`;
  renderFcCards(data2use,`${day} · ${fmtH(hour)}`);
}

function resetMatrixTitle(){
  const title=document.querySelector('#fc-venue-cards')?.previousElementSibling;
  if(title)title.innerHTML=`<div style="font-family:var(--disp);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--t2);">
    Predicted Crowd Levels — Top 10 Venues Tonight
    <span style="font-family:var(--mono);font-size:9px;color:var(--t3);font-weight:400;margin-left:8px;text-transform:none;">Based on historical check-in patterns · 6PM–11PM</span>
  </div>`;
}


/* ════════ COMMAND CENTER ════════ */
// resetSitrep defined above


function renderOfficerActionSummary(data){
  const el=document.getElementById('sr-officer-actions');if(!el)return;
  const actions=[
    {flag:'CRITICAL',action:'Immediate Response',icon:'🚨',col:'#ff0033',bg:'rgba(255,0,51,.1)',bdr:'rgba(255,0,51,.3)'},
    {flag:'HIGH',action:'Monitor Closely',icon:'⚠',col:'#ff3355',bg:'rgba(255,51,85,.08)',bdr:'rgba(255,51,85,.25)'},
    {flag:'ELEVATED',action:'Routine Patrol',icon:'👁',col:'#ffaa00',bg:'rgba(255,170,0,.08)',bdr:'rgba(255,170,0,.2)'},
    {flag:'NORMAL',action:'No Action Required',icon:'✓',col:'#00ff88',bg:'rgba(0,255,136,.06)',bdr:'rgba(0,255,136,.15)'},
  ];
  const counts={CRITICAL:0,HIGH:0,ELEVATED:0,NORMAL:0};
  data.forEach(d=>counts[d.incident_flag]=(counts[d.incident_flag]||0)+1);
  const tot=data.length||1;
  // Top venues needing each action
  const vm={};data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={flag:d.incident_flag,dens:[],zone:d.patrol_zone};vm[d.venue_name].dens.push(d.crowd_density);});
  const topByFlag={};
  Object.entries(vm).forEach(([name,v2])=>{
    const avgD=avg(v2.dens);
    if(!topByFlag[v2.flag]||avgD>topByFlag[v2.flag].avgD)topByFlag[v2.flag]={name,avgD,zone:v2.zone};
  });
  el.innerHTML=actions.map(a=>{
    const cnt=counts[a.flag]||0,pct=(cnt/tot*100).toFixed(0);
    const top=topByFlag[a.flag];
    return `<div style="padding:16px;background:${a.bg};border:1px solid ${a.bdr};border-radius:8px;cursor:pointer;transition:all .15s;" onclick="filterSrByFlag('${a.flag}')">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <div style="font-size:24px;">${a.icon}</div>
        <div style="font-family:var(--disp);font-size:13px;font-weight:700;color:${a.col};">${a.action}</div>
      </div>
      <div style="font-family:var(--disp);font-size:32px;font-weight:700;color:${a.col};margin-bottom:4px;">${cnt.toLocaleString()}</div>
      <div style="font-size:10px;color:var(--t3);margin-bottom:8px;">${pct}% of all events</div>
      <div style="font-size:10px;color:var(--t2);padding-top:8px;border-top:1px solid ${a.bdr};">
        ${top?`📍 ${top.name}<br/>${top.zone.split('—')[0].trim()}`:'No active incidents'}
      </div>
    </div>`;
  }).join('');
}

function filterCmdByFlag(flag){
  const el=document.getElementById('cmd-flag');if(el)el.value=flag;
  renderSitrep();
  // Scroll to zone status so officer sees the filtered zones
  document.getElementById('cmd-zones')?.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function renderDensityTime(data){
  const hm={};for(let h=0;h<24;h++)hm[h]=[];
  data.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h));
  const vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null);
  let pkIdx=0,pkVal=0;vals.forEach((val,i)=>{if(val&&val>pkVal){pkVal=val;pkIdx=i;}});
  destroyC('dt');const ctx=document.getElementById('ch-density-time')?.getContext('2d');if(!ctx)return;
  CH.dt=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Avg Density',data:vals,borderColor:'#00c8ff',backgroundColor:grad(ctx,'rgba(0,200,255,.25)','rgba(0,200,255,.01)'),fill:true,tension:.45,pointRadius:vals.map((_,i)=>i===pkIdx?7:2),pointBackgroundColor:vals.map((_,i)=>i===pkIdx?'#ff0033':'#00c8ff'),pointBorderColor:vals.map((_,i)=>i===pkIdx?'#fff':'#00c8ff'),pointBorderWidth:vals.map((_,i)=>i===pkIdx?2:0),borderWidth:2.5,spanGaps:true}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>[' Avg Density: '+ctx.parsed.y,' Check-ins: '+(hm[ctx.dataIndex]?.length||0)]}}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderCmdWatchlist(data){
  const vm={};
  data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,zone:d.patrol_zone,dens:[],flags:[],count:0,act:d.activity_type};vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].flags.push(d.incident_flag);vm[d.venue_name].count++;});
  const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  const sorted=Object.entries(vm).map(([n,v])=>({n,cat:v.cat,zone:v.zone,avgD:avg(v.dens),act:v.act,topFlag:v.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL'})).sort((a,b)=>b.avgD-a.avgD).slice(0,6);
  const el=document.getElementById('sr-venue-grid-cmd');if(!el)return;el.innerHTML='';
  sorted.forEach((v,i)=>{
    const col=FLAG_COL[v.topFlag],icon=VENUE_ICONS[v.cat]||'📍';
    const row=document.createElement('div');
    row.style.cssText=`padding:10px 12px;background:var(--bg3);border:1px solid var(--bdr);border-left:3px solid ${col};border-radius:7px;cursor:pointer;transition:all .15s;`;
    row.onmouseenter=()=>{row.style.borderColor='var(--bdr2)';};
    row.onmouseleave=()=>{row.style.borderColor='var(--bdr)';row.style.borderLeftColor=col;};
    row.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
      <span style="font-size:16px;">${icon}</span>
      <span style="font-size:12.5px;font-weight:700;color:var(--t1);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.n}</span>
      <span style="font-family:var(--mono);font-size:14px;font-weight:700;color:${col};">${v.avgD.toFixed(0)}%</span>
    </div>
    <div style="font-size:10px;color:var(--t3);margin-bottom:5px;">📍 ${v.zone.split('—')[0].trim()}</div>
    <span class="tag ${flagClass(v.topFlag)}" style="font-size:8px;">${v.topFlag}</span>`;
    row.onclick=()=>focusVenueOnMap(v.n);
    el.appendChild(row);
  });
}

function renderZoneStatus(data){
  const zm={};data.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0,total:0};zm[d.patrol_zone].total++;if(d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH')zm[d.patrol_zone].crit++;});
  const sorted=Object.entries(zm).sort((a,b)=>b[1].crit-a[1].crit);
  const maxCrit=Math.max(...sorted.map(z=>z[1].crit),1);
  const el=document.getElementById('cmd-zones');if(!el)return;el.innerHTML='';
  sorted.forEach(([zone,stats])=>{
    const pct=(stats.crit/maxCrit*100).toFixed(0);
    const col=pct>70?'#ff0033':pct>40?'#ff3355':pct>15?'#ffaa00':'#00ff88';
    const row=document.createElement('div');row.className='zone-row';
    row.innerHTML=`<div class="zone-name">${zone.split('—')[0].trim()}</div>
      <div class="zone-bar-bg"><div class="zone-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,#003366,${col});"><span style="font-size:9px;font-family:monospace;color:rgba(255,255,255,.85);">${stats.crit}</span></div></div>
      <div class="zone-count" style="color:${col};">${stats.crit}</div>`;
    el.appendChild(row);
  });
}

function renderRiskDonut(data){
  const c={CRITICAL:0,HIGH:0,ELEVATED:0,NORMAL:0};
  data.forEach(d=>{c[d.incident_flag]=(c[d.incident_flag]||0)+1;});
  const tot=data.length||1;
  destroyC('riskD');const ctx=document.getElementById('ch-risk-donut')?.getContext('2d');if(!ctx)return;
  CH.riskD=new Chart(ctx,{type:'doughnut',data:{labels:['Critical','High','Elevated','Normal'],datasets:[{data:[c.CRITICAL,c.HIGH,c.ELEVATED,c.NORMAL],backgroundColor:['#ff0033','#ff3355','#ffaa00','#00ff88'],borderColor:'rgba(5,8,16,.8)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('risk-donut-stats').innerHTML=
    dRow('#ff0033','Critical',c.CRITICAL,tot)+dRow('#ff3355','High',c.HIGH,tot)+
    dRow('#ffaa00','Elevated',c.ELEVATED,tot)+dRow('#00ff88','Normal',c.NORMAL,tot)+
    `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bdr);display:flex;justify-content:space-between;font-size:11px;"><span style="color:var(--t3);">Total</span><span style="font-family:monospace;">${tot.toLocaleString()}</span></div>`;
}
function dRow(c,l,val,tot){return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><div style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;"></div><div style="flex:1;font-size:11px;color:var(--t2);">${l}</div><div style="font-size:12px;font-weight:700;color:${c};font-family:monospace;">${(val/tot*100).toFixed(0)}%</div></div>`;}

function renderIncidentTimeline(data){
  const el=document.getElementById('incident-timeline');if(!el)return;
  const highRisk=data.filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH').sort((a,b)=>b.crowd_density-a.crowd_density).slice(0,5);
  el.innerHTML='';
  highRisk.forEach(d=>{
    const isCrit=d.incident_flag==='CRITICAL';
    const div=document.createElement('div');div.className='alert-card'+(isCrit?'':' ac-high');
    div.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="font-size:16px;">${isCrit?'🚨':'⚠'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:700;color:${FLAG_COL[d.incident_flag]};">${d.incident_flag} — ${d.venue_name}</div>
        <div style="font-size:10px;color:var(--t3);">${d.timestamp} · ${d.patrol_zone.split('—')[0].trim()}</div>
        <div style="font-size:10px;color:var(--t2);margin-top:2px;">${d.officer_action} · ${d.activity_type}</div>
      </div>
      <div style="font-family:monospace;font-size:14px;font-weight:700;color:${FLAG_COL[d.incident_flag]};">${d.crowd_density}%</div>
    </div>`;
    div.onclick=()=>goInvestigate(d.venue_name);
    el.appendChild(div);
  });
  if(!highRisk.length)el.innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:16px;">No high-risk incidents for current filter</div>';
}

function renderPeakList(data,elId){
  const hm={};for(let h=0;h<24;h++)hm[h]={count:0,dens:[]};
  data.forEach(d=>{hm[d.hour_of_day].count++;hm[d.hour_of_day].dens.push(d.crowd_density);});
  const ranked=Object.entries(hm).map(([h,v2])=>({h:+h,count:v2.count,avgD:v2.dens.length?avg(v2.dens):0})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
  const maxC=ranked[0]?.count||1;
  const el=document.getElementById(elId);if(!el)return;el.innerHTML='';
  ranked.forEach(({h,count,avgD})=>{
    const pct=(count/maxC*100).toFixed(0),col=dc(avgD);
    const row=document.createElement('div');row.className='peak-row';
    row.innerHTML=`<div style="font-family:monospace;font-size:10px;color:var(--t2);width:40px;flex-shrink:0;">${fmtH(h)}</div>
      <div class="peak-bg"><div class="peak-fill" style="width:${pct}%;"><span style="font-size:9px;font-weight:700;color:rgba(255,255,255,.9);font-family:monospace;">${count}</span></div></div>
      <div style="font-family:monospace;font-size:10px;font-weight:700;color:${col};width:32px;text-align:right;">${avgD.toFixed(0)}</div>`;
    el.appendChild(row);
  });
}

/* ════════ LIVE HEATMAP ════════ */
function initHeatmap(){
  if(!mapInstance){
    mapInstance=L.map('map',{center:[40.712,-74.005],zoom:13});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(mapInstance);
    markerLayer=L.layerGroup().addTo(mapInstance);
  }
  renderHeatmapLayer(allData);
  renderFeedPanel(allData);
}

function setRiskFilter(flag){
  mapRiskFilter=flag;
  document.querySelectorAll('.risk-filter-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('rfb-'+flag)?.classList.add('active');
  const data=flag==='ALL'?allData:allData.filter(d=>d.incident_flag===flag);
  renderHeatmapLayer(data);
  renderFeedPanel(data);
}

function renderHeatmapLayer(data){
  if(!mapInstance)return;
  if(heatLayer)mapInstance.removeLayer(heatLayer);
  markerLayer?.clearLayers();
  // Aggregate by venue
  const vm={};
  data.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,lat:d.latitude,lon:d.longitude,dens:[],dwell:[],records:[],zone:d.patrol_zone,act:d.activity_type};
    vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].dwell.push(d.avg_dwell_minutes);vm[d.venue_name].records.push(d);
  });
  const venues=Object.values(vm),maxD=Math.max(...venues.map(v=>avg(v.dens)),1);
  const hpts=[];
  venues.forEach(v=>{const a=avg(v.dens)/100;for(let i=0;i<Math.ceil(a*20);i++)hpts.push([v.lat+(Math.random()-.5)*.002,v.lon+(Math.random()-.5)*.002,a]);});
  heatLayer=L.heatLayer(hpts,{radius:35,blur:28,maxZoom:18,gradient:{0:'#04080f',.15:'#001833',.35:'#003388',.55:'#00c8ff',.75:'#ffaa00',1:'#ff0033'}}).addTo(mapInstance);
  venues.forEach(v=>{
    const ad=avg(v.dens),adw=avg(v.dwell).toFixed(0),r=8+(ad/maxD)*16;
    const topRec=v.records.sort((a,b)=>b.crowd_density-a.crowd_density)[0];
    const flag=topRec?.incident_flag||'NORMAL',col=FLAG_COL[flag];
    const icon=VENUE_ICONS[v.cat]||'📍';
    const m=L.circleMarker([v.lat,v.lon],{radius:r,color:col,fillColor:col,fillOpacity:.45,weight:2});
    m.bindPopup(buildPopup(topRec?.venue_name||'',topRec,ad,adw,col,icon,flag,v.zone,v.records));
    m.addTo(markerLayer);
  });
  set('rp-count',data.length.toLocaleString()+' records');
}

function buildPopup(vname,rec,ad,adw,col,icon,flag,zone,records){
  const why=WHY_REASON[flag]||'';
  const actionBg={'CRITICAL':'rgba(255,0,51,.12)','HIGH':'rgba(255,51,85,.1)','ELEVATED':'rgba(255,170,0,.08)','NORMAL':'rgba(0,255,136,.06)'};
  const actionIcon={'CRITICAL':'🚨','HIGH':'⚠','ELEVATED':'👁','NORMAL':'✓'};
  return `<div class="popup-inner">
    <div class="popup-tags">
      <span class="tag ${flagClass(flag)}">${flag}</span>
      ${rec?.activity_type?`<span class="tag tag-act">${rec.activity_type}</span>`:''}
    </div>
    <div class="popup-venue">${vname}</div>
    <div class="popup-zone">📍 ${zone}</div>
    <div class="popup-density-bar"><div class="popup-density-fill" style="width:${ad}%;background:linear-gradient(90deg,#003388,${col});"></div></div>

    <div class="popup-section">CROWD STATUS</div>
    <div class="popup-row"><span class="popup-label">CROWD LEVEL</span><span class="popup-val" style="color:${col};">${ad.toFixed(0)}%</span></div>
    <div class="popup-row"><span class="popup-label">AVG TIME SPENT</span><span class="popup-val">${adw} min</span></div>
    <div class="popup-row"><span class="popup-label">LATEST CHECK-IN</span><span class="popup-val">${rec?.timestamp||'—'}</span></div>
    <div class="popup-row"><span class="popup-label">PEOPLE PRESENT</span><span class="popup-val" style="color:#00c8ff;font-size:13px;font-weight:700;">${records?new Set(records.map(r=>r.user_id)).size:1} individuals</span></div>
    <div class="popup-row"><span class="popup-label">TOTAL CHECK-INS</span><span class="popup-val">${records?records.length:1} recorded</span></div>

    <div class="popup-section">WHY THIS LOCATION</div>
    <div class="popup-why" style="background:${actionBg[flag]};border:1px solid ${col}22;border-radius:5px;">
      <div style="font-size:10px;color:${col};font-weight:700;margin-bottom:4px;">${actionIcon[flag]} ${flag} RISK</div>
      <div style="font-size:11px;color:var(--t2);">${why}</div>
    </div>

    <div class="popup-section">OFFICER ACTION</div>
    <div class="popup-action-box" style="background:${actionBg[flag]};border:1px solid ${col}33;border-radius:5px;">
      <span style="font-size:18px;">${actionIcon[flag]}</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:${col};">${rec?.officer_action||'No action required'}</div>
        <div style="font-size:10px;color:var(--t2);">Patrol Zone: ${zone.split('—')[0].trim()}</div>
      </div>
    </div>
    <div class="popup-btn" onclick="goInvestigate('${vname}')">⊘ OPEN INVESTIGATION</div>
  </div>`;
}

function renderFeedPanel(data){
  const sorted=[...data].sort((a,b)=>{const o={'CRITICAL':0,'HIGH':1,'ELEVATED':2,'NORMAL':3};return(o[a.incident_flag]||3)-(o[b.incident_flag]||3)||b.crowd_density-a.crowd_density;});
  const el=document.getElementById('rp-feed');if(!el)return;el.innerHTML='';
  sorted.slice(0,100).forEach(d=>{
    const col=FLAG_COL[d.incident_flag]||'#00c8ff';
    const fcClass='fc-'+(d.incident_flag||'normal').toLowerCase();
    const icon=VENUE_ICONS[d.venue_category]||'📍';
    const card=document.createElement('div');card.className=`feed-card ${fcClass}`;
    card.innerHTML=`
      <div class="fc-top">
        <div class="fc-venue-icon" style="background:${col}22;">${icon}</div>
        <div class="fc-venue-name">${d.venue_name}</div>
        <div style="font-size:11px;font-weight:700;color:${col};">${d.crowd_density>=85?'OVERCROWDED':d.crowd_density>=70?'VERY BUSY':d.crowd_density>=50?'BUSY':'MODERATE'}</div>
      </div>
      <div class="fc-meta">${d.checkin_id} · ${d.timestamp}</div>
      <div class="fc-tags">
        <span class="tag ${flagClass(d.incident_flag)}">${d.incident_flag}</span>
        <span class="tag tag-zone">${d.patrol_zone.split('—')[0].trim()}</span>
        ${d.activity_type?`<span class="tag tag-act">${d.activity_type}</span>`:''}
      </div>`;
    card.onclick=()=>focusVenueOnMap(d.venue_name);
    el.appendChild(card);
  });
}

function renderMiniMatrix(data){
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hours=[0,3,6,9,12,15,18,21,23];
  const mat={};days.forEach(d=>{mat[d]={};for(let h=0;h<24;h++)mat[d][h]=[];});
  data.forEach(d=>{if(mat[d.day_of_week]&&mat[d.day_of_week][d.hour_of_day]!==undefined)mat[d.day_of_week][d.hour_of_day].push(d.crowd_density);});
  let maxV=0;days.forEach(dy=>hours.forEach(h=>{const a=mat[dy][h];if(a.length)maxV=Math.max(maxV,avg(a));}));
  let html='<table style="border-collapse:collapse;"><thead><tr><th style="font-size:8px;font-family:monospace;color:var(--t3);padding:2px 4px;"></th>';
  hours.forEach(h=>html+=`<th style="font-size:8px;font-family:monospace;color:var(--t3);padding:2px 4px;text-align:center;">${fmtH(h)}</th>`);
  html+='</tr></thead><tbody>';
  days.forEach((dy,di)=>{
    html+=`<tr><td style="font-size:9px;font-family:monospace;color:var(--t2);padding:2px 5px 2px 0;text-align:right;">${dy.slice(0,3)}</td>`;
    hours.forEach(h=>{const arr=mat[dy][h],val=arr.length?avg(arr):0,norm=maxV?val/maxV:0,bg=hmC(norm);
      const clickable=arr.length>0?`onclick="filterFeedByDayHour('${dy}',${h})"`:''
      html+=`<td class="hm-cell" style="background:${bg};" ${clickable} title="${dy} ${fmtH(h)}: avg ${val.toFixed(0)}">${arr.length?val.toFixed(0):''}</td>`;});
    html+='</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('hm-mini-matrix').innerHTML=html;
}

function renderZoneBar(data){
  const zm={};data.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]=[];zm[d.patrol_zone].push(d.crowd_density);});
  const zones=Object.keys(zm).sort(),vals=zones.map(z=>+avg(zm[z]).toFixed(1));
  destroyC('zoneBar');
  const ctx=document.getElementById('ch-zone-bar')?.getContext('2d');if(!ctx)return;
  CH.zoneBar=new Chart(ctx,{type:'bar',data:{labels:zones.map(z=>z.split('—')[0].trim()),datasets:[{data:vals,backgroundColor:zones.map(z=>(ZONE_COLS[z]||'#00c8ff')+'99'),borderColor:zones.map(z=>ZONE_COLS[z]||'#00c8ff'),borderWidth:1,borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tt()}},scales:{x:{grid:{display:false},ticks:{color:'#3a5570',font:{family:'monospace',size:8},maxRotation:30}},y:{display:false}}}});
}

function filterFeedByDayHour(day,hour){
  const filtered=allData.filter(d=>d.day_of_week===day&&d.hour_of_day===hour);
  if(!filtered.length)return;
  renderFeedPanel(filtered);
  set('rp-count',day.slice(0,3)+' '+fmtH(hour)+' — '+filtered.length+' records · click map to reset');
}

/* ─── OPERATIONAL SEARCH ─── */
// Pre-build venue index for fast search
let venueIndex=[];
function buildOpsSearch(){
  const vm={};
  allData.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,zone:d.patrol_zone,flags:[],dens:[],act:d.activity_type};
    vm[d.venue_name].flags.push(d.incident_flag);
    vm[d.venue_name].dens.push(d.crowd_density);
  });
  const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  venueIndex=Object.entries(vm).map(([name,v2])=>({
    name, cat:v2.cat, zone:v2.zone, act:v2.act,
    avgD:avg(v2.dens),
    topFlag:v2.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL',
    action:{'CRITICAL':'Immediate Response','HIGH':'Monitor Closely','ELEVATED':'Routine Patrol','NORMAL':'No Action Required'}[v2.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL']
  })).sort((a,b)=>b.avgD-a.avgD);
}

function handleOpsSearch(q){
  const dd=document.getElementById('ops-search-results');
  if(!q||q.length<2){dd.classList.remove('open');return;}
  const ql=q.trim().toLowerCase();
  // Match venues, zones, categories, flags
  const results=venueIndex.filter(v2=>
    v2.name.toLowerCase().includes(ql)||
    v2.zone.toLowerCase().includes(ql)||
    v2.cat.toLowerCase().includes(ql)||
    v2.topFlag.toLowerCase().includes(ql)||
    v2.act.toLowerCase().includes(ql)
  ).slice(0,10);
  if(!results.length){
    dd.innerHTML=`<div class="ops-no-results">No results for "${q}" — try venue name, zone, or risk level</div>`;
    dd.classList.add('open');return;
  }
  const col=f=>FLAG_COL[f]||'#00c8ff';
  dd.innerHTML=`<div style="padding:6px 14px;background:rgba(0,200,255,.12);border-bottom:1px solid rgba(0,200,255,.3);font-family:var(--mono);font-size:9px;color:var(--cyan);letter-spacing:.08em;">🔍 ${results.length} RESULT${results.length!==1?'S':''} — CLICK TO LOCATE ON MAP</div>`+
  results.map(v2=>{
    const icon=VENUE_ICONS[v2.cat]||'📍';
    const clabel=v2.avgD>=85?'OVERCROWDED':v2.avgD>=70?'VERY BUSY':v2.avgD>=50?'BUSY':'MODERATE';
    return `<div class="ops-result-item" style="border-left:3px solid ${col(v2.topFlag)};" onclick="focusVenueOnMap('${v2.name.replace(/'/g,"\'")}');closeOpsSearch();">
      <div class="ops-result-name">${icon} ${v2.name}</div>
      <div class="ops-result-meta">
        <span class="ops-result-zone">📍 ${v2.zone.split('—')[0].trim()}</span>
        <span class="tag ${flagClass(v2.topFlag)}" style="font-size:8px;">${v2.topFlag}</span>
        <span class="ops-result-density" style="color:${col(v2.topFlag)};">${clabel}</span>
        <span class="ops-result-action">${v2.action}</span>
      </div>
    </div>`;
  }).join('');
  dd.classList.add('open');
}

function showOpsResults(){
  const q=document.getElementById('ops-search')?.value||'';
  if(q.length>=2)handleOpsSearch(q);
}

function closeOpsSearch(){
  document.getElementById('ops-search-results')?.classList.remove('open');
  const el=document.getElementById('ops-search');if(el)el.value='';
}

document.addEventListener('click',e=>{if(!e.target.closest('.ops-search-wrap'))document.getElementById('ops-search-results')?.classList.remove('open');});

// Legacy aliases (no-ops — elements no longer in DOM)
function buildQuickAccess(){}
function toggleQuickAccess(){}
function closeQuickAccess(){}

/* ════════ PRIORITY WATCH LIST ════════ */
function renderWatchlist(){
  const zone=v('wl-zone'),cat=v('wl-cat'),flag=v('wl-flag');
  const data=allData.filter(d=>{if(zone&&d.patrol_zone!==zone)return false;if(cat&&d.venue_category!==cat)return false;if(flag&&d.incident_flag!==flag)return false;return true;});
  renderWlKPIs(data);renderWlVenueGrid(data);renderWlSpikes(data);
}

function renderWlKPIs(data){
  const el=document.getElementById('wl-kpis');if(!el)return;
  // Count UNIQUE venues per risk level
  const vm2={};data.forEach(d=>{
    if(!vm2[d.venue_name])vm2[d.venue_name]={flag:d.incident_flag,dens:[]};
    vm2[d.venue_name].dens.push(d.crowd_density);
  });
  const ord2={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  const venueList2=Object.entries(vm2).map(([n,v2])=>({n,topFlag:v2.flag}));
  const critVenues=venueList2.filter(v2=>v2.topFlag==='CRITICAL').length;
  const highVenues=venueList2.filter(v2=>v2.topFlag==='HIGH').length;
  const totalVenues=venueList2.length;
  const activeFilter=v('wl-zone');
  // If zone filtered: show venue count needing attention. If not: show zone count
  const zones=new Set(data.filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH').map(d=>d.patrol_zone)).size;
  const venuesNeedingAction=new Set(data.filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH').map(d=>d.venue_name)).size;
  const kpi4Label=activeFilter?'Venues Needing Attention':'Zones Requiring Attention';
  const kpi4Value=activeFilter?venuesNeedingAction:zones;
  const kpi4Sub=activeFilter?`In ${activeFilter.split('—')[0].trim()}`:'Active incident zones';
  el.innerHTML=`
    <div class="kpi" style="--kc:#ff0033;--kb:rgba(255,0,51,.1)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">Critical Venues</div><div class="kpi-val" style="color:#ff0033;">${critVenues.toLocaleString()}</div><div class="kpi-sub">Unique venues — Immediate response</div></div></div>
    <div class="kpi" style="--kc:#ff3355;--kb:rgba(255,51,85,.1)"><div class="kpi-ico">⚠</div><div><div class="kpi-lbl">High Risk Venues</div><div class="kpi-val" style="color:#ff3355;">${highVenues.toLocaleString()}</div><div class="kpi-sub">Unique venues — Monitor closely</div></div></div>
    <div class="kpi" style="--kc:#00c8ff;--kb:rgba(0,200,255,.1)"><div class="kpi-ico">🏢</div><div><div class="kpi-lbl">Venues in View</div><div class="kpi-val">${totalVenues.toLocaleString()}</div><div class="kpi-sub">${data.length.toLocaleString()} check-ins</div></div></div>
    <div class="kpi" style="--kc:#ffaa00;--kb:rgba(255,170,0,.1)"><div class="kpi-ico">📍</div><div><div class="kpi-lbl">${kpi4Label}</div><div class="kpi-val" style="color:#ffaa00;">${kpi4Value}</div><div class="kpi-sub">${kpi4Sub}</div></div></div>`;
}

function renderWlVenueGrid(data){
  const vm={};
  data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,zone:d.patrol_zone,dens:[],flags:[],acts:[]};vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].flags.push(d.incident_flag);vm[d.venue_name].acts.push(d.activity_type);});
  const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  const sorted=Object.entries(vm).map(([n,v2])=>({n,cat:v2.cat,zone:v2.zone,avgD:avg(v2.dens),topFlag:v2.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL',topAct:v2.acts[0]||''})).filter(v2=>ord[v2.topFlag]>=2).sort((a,b)=>ord[b.topFlag]-ord[a.topFlag]||b.avgD-a.avgD).slice(0,12);
  const grid=document.getElementById('wl-venue-grid');if(!grid)return;grid.innerHTML='';
  sorted.forEach(v2=>{
    const col=FLAG_COL[v2.topFlag],icon=VENUE_ICONS[v2.cat]||'📍';
    const wcClass='wc-'+(v2.topFlag||'normal').toLowerCase();
    const actionBg={'CRITICAL':'rgba(255,0,51,.1)','HIGH':'rgba(255,51,85,.08)','ELEVATED':'rgba(255,170,0,.08)','NORMAL':'rgba(0,255,136,.06)'};
    const action={'CRITICAL':'Immediate Response','HIGH':'Monitor Closely','ELEVATED':'Routine Patrol','NORMAL':'No Action'}[v2.topFlag];
    const div=document.createElement('div');div.className=`watch-card ${wcClass}`;
    div.innerHTML=`
      <div class="wc-header">
        <div><div class="wc-name">${icon} ${v2.n}</div><div class="wc-cat">${v2.cat}</div></div>
        <div class="wc-density" style="color:${col};">${v2.avgD.toFixed(0)}<span style="font-size:14px;">%</span></div>
      </div>
      <div class="wc-zone">📍 ${v2.zone}</div>
      <div class="wc-action" style="background:${actionBg[v2.topFlag]};color:${col};border:1px solid ${col}33;">${action}</div>
      <div class="wc-why">${WHY_REASON[v2.topFlag]||''}</div>
      <div class="wc-bar"><div class="wc-bar-fill" style="width:${v2.avgD}%;background:linear-gradient(90deg,#003366,${col});"></div></div>
      <div class="wc-footer">
        <span class="tag ${flagClass(v2.topFlag)}">${v2.topFlag}</span>
        <span style="font-size:11px;color:var(--cyan);cursor:pointer;font-weight:600;" onclick="goInvestigate('${v2.n}')">⊘ Investigate →</span>
      </div>`;
    div.onclick=(e)=>{if(!e.target.closest('span[onclick]'))focusVenueOnMap(v2.n);};
    grid.appendChild(div);
  });
  if(!sorted.length)grid.innerHTML='<div class="panel" style="text-align:center;padding:32px;color:var(--t3);">No high-risk venues for current filter</div>';
}

function renderWlSpikes(data){
  const el=document.getElementById('wl-incident-spikes');if(!el)return;
  const spikes=[...data].filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH')
    .sort((a,b)=>b.crowd_density-a.crowd_density).slice(0,8);
  el.innerHTML=spikes.map(d=>{
    const col=FLAG_COL[d.incident_flag],isCrit=d.incident_flag==='CRITICAL';
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:12px 14px;background:var(--bg3);border:1px solid var(--bdr);border-left:3px solid ${col};border-radius:7px;cursor:pointer;transition:all .15s;" onclick="goInvestigate('${d.venue_name.replace(/'/g,"\'")}')">
      <div style="font-size:18px;">${isCrit?'🚨':'⚠'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:700;color:${col};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${d.venue_name}</div>
        <div style="font-size:10px;color:var(--t3);margin-top:2px;">${d.timestamp} · ${d.patrol_zone.split('—')[0].trim()}</div>
        <div style="font-size:10px;color:var(--t2);margin-top:3px;">${d.officer_action} · ${d.activity_type}</div>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div style="font-family:monospace;font-size:18px;font-weight:700;color:${col};">${d.crowd_density}%</div>
        <span class="tag ${flagClass(d.incident_flag)}" style="font-size:8px;">${d.incident_flag}</span>
      </div>
    </div>`;
  }).join('');
  if(!spikes.length)el.innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:20px;grid-column:1/-1;">No high-risk incidents for current filter</div>';
}

function renderWlZones(data){
  const zm={};
  data.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0,high:0,total:0};zm[d.patrol_zone].total++;if(d.incident_flag==='CRITICAL')zm[d.patrol_zone].crit++;if(d.incident_flag==='HIGH')zm[d.patrol_zone].high++;});
  const labels=Object.keys(zm).sort();
  destroyC('wlZone');const ctx=document.getElementById('ch-wl-zones')?.getContext('2d');if(!ctx)return;
  CH.wlZone=new Chart(ctx,{type:'bar',data:{labels:labels.map(l=>l.split('—')[0].trim()),datasets:[{label:'Critical',data:labels.map(l=>zm[l].crit),backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:3,borderSkipped:false},{label:'High',data:labels.map(l=>zm[l].high),backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:20}},y:sy('Incidents')}}});
}

function renderWlCats(data){
  const cm={};data.forEach(d=>{if(!cm[d.venue_category])cm[d.venue_category]={crit:0,high:0};if(d.incident_flag==='CRITICAL')cm[d.venue_category].crit++;if(d.incident_flag==='HIGH')cm[d.venue_category].high++;});
  const labels=Object.keys(cm).filter(l=>cm[l].crit+cm[l].high>0).sort((a,b)=>cm[b].crit+cm[b].high-cm[a].crit-cm[a].high);
  destroyC('wlCat');const ctx=document.getElementById('ch-wl-cats')?.getContext('2d');if(!ctx)return;
  CH.wlCat=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Critical',data:labels.map(l=>cm[l].crit),backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:3,borderSkipped:false},{label:'High',data:labels.map(l=>cm[l].high),backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:30}},y:sy('Incidents')}}});
}

/* ════════ TRENDS & FORECAST ════════ */
function resetTrends(){
  const tz=document.getElementById('tr-zone');if(tz)tz.value='';
  const tc=document.getElementById('tr-cat');if(tc)tc.value='';
  renderTrends();
}

function renderTrends(){
  const tzEl=document.getElementById('tr-zone');
  if(tzEl&&tzEl.options.length<=1)[...new Set(allData.map(d=>d.patrol_zone))].sort().forEach(z=>tzEl.add(new Option(z,z)));
  const tcEl=document.getElementById('tr-cat');
  if(tcEl&&tcEl.options.length<=1)[...new Set(allData.map(d=>d.venue_category))].sort().forEach(c=>tcEl.add(new Option(c,c)));
  const zone=v('tr-zone'),cat=v('tr-cat');
  const data=allData.filter(d=>{if(zone&&d.patrol_zone!==zone)return false;if(cat&&d.venue_category!==cat)return false;return true;});
  renderFcPeakWindows(data);renderFcForecast(data);renderFcCards(data,'Expected Tonight · 6PM–11PM');
}

function renderFcPeakWindows(data){
  const el=document.getElementById('fc-peak-windows');if(!el)return;
  const zoneFilter=v('tr-zone');
  const hm={};for(let h=0;h<24;h++)hm[h]=[];
  data.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  let bestStart=21,bestAvg=0;
  for(let h=0;h<=21;h++){
    const wd=[...hm[h],...hm[(h+1)%24],...hm[(h+2)%24]];
    const wa=wd.length?avg(wd):0;
    if(wa>bestAvg){bestAvg=wa;bestStart=h;}
  }
  const peakFlag=bestAvg>=85?'CRITICAL':bestAvg>=70?'HIGH':bestAvg>=50?'ELEVATED':'NORMAL';
  const peakCol=FLAG_COL[peakFlag];
  const evening=data.filter(d=>d.hour_of_day>=18&&d.hour_of_day<=23);
  let card2Label,card2Value,card2Detail,card2Col='#ff3355';
  if(zoneFilter){
    const vm2={};evening.forEach(d=>{if(!vm2[d.venue_name])vm2[d.venue_name]={crit:0,dens:[]};vm2[d.venue_name].dens.push(d.crowd_density);if(d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH')vm2[d.venue_name].crit++;});
    const topV=Object.entries(vm2).sort((a,b)=>b[1].crit-a[1].crit)[0];
    card2Label='HIGHEST RISK VENUE IN ZONE';
    card2Value=topV?topV[0]:'None';
    card2Detail=topV?`${topV[1].crit} high-risk events tonight. Deploy officers here first.`:'No high-risk venues in this zone tonight.';
  } else {
    const zm={};evening.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0};if(d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH')zm[d.patrol_zone].crit++;});
    const topZone=Object.entries(zm).sort((a,b)=>b[1].crit-a[1].crit)[0];
    card2Label='HIGHEST RISK ZONE TONIGHT';
    card2Value=topZone?topZone[0].split(' ')[0]+' '+topZone[0].split(' ')[1]:'N/A';
    card2Detail=topZone?`${topZone[1].crit} high-risk events expected tonight. Prioritize patrols here.`:'No high-risk zones detected.';
  }
  const cm={};data.forEach(d=>{if(!cm[d.venue_category])cm[d.venue_category]={crit:0};if(d.incident_flag==='CRITICAL')cm[d.venue_category].crit++;});
  const topCat=Object.entries(cm).sort((a,b)=>b[1].crit-a[1].crit)[0];
  const bgPeak=peakFlag==='CRITICAL'?'rgba(255,0,51,.08)':peakFlag==='HIGH'?'rgba(255,51,85,.08)':'rgba(255,170,0,.08)';
  const bdrPeak=peakFlag==='CRITICAL'?'rgba(255,0,51,.25)':peakFlag==='HIGH'?'rgba(255,51,85,.25)':'rgba(255,170,0,.25)';
  const windows=[
    {icon:'🕐',label:'PEAK RISK WINDOW',value:`${fmtH(bestStart)} - ${fmtH((bestStart+2)%24||24)}`,detail:`Highest foot traffic expected. Deploy officers before ${fmtH(bestStart)}.`,col:peakCol,bg:bgPeak,bdr:bdrPeak},
    {icon:'📍',label:card2Label,value:card2Value,detail:card2Detail,col:card2Col,bg:'rgba(255,51,85,.08)',bdr:'rgba(255,51,85,.2)'},
    {icon:'🏢',label:'HIGHEST RISK VENUE TYPE',value:topCat?topCat[0]:'N/A',detail:`${topCat?topCat[1].crit+' critical events historically. ':' '}Focus monitoring on these venues tonight.`,col:'#ffaa00',bg:'rgba(255,170,0,.08)',bdr:'rgba(255,170,0,.2)'},
  ];
  el.innerHTML=windows.map(w=>`
    <div style="padding:16px;background:${w.bg};border:1px solid ${w.bdr};border-radius:8px;">
      <div style="font-family:var(--mono);font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px;">${w.icon} ${w.label}</div>
      <div style="font-family:var(--disp);font-size:28px;font-weight:700;color:${w.col};margin-bottom:6px;line-height:1.1;">${w.value}</div>
      <div style="font-size:11px;color:var(--t2);line-height:1.6;">${w.detail}</div>
    </div>`).join('');
}

function renderFcSimpleKPIs(data){
  const crit=data.filter(d=>d.incident_flag==='CRITICAL').length;
  const now=new Date(),ch=now.getHours();
  const hc={};for(let h=0;h<24;h++)hc[h]=0;
  data.forEach(d=>hc[d.hour_of_day]++);
  const fHours=Array.from({length:24},(_,i)=>(ch+i)%24);
  const proj=fHours.map(h=>+(hc[h]/Math.max(...Object.values(hc),1)*100).toFixed(1));
  const pkIdx=proj.indexOf(Math.max(...proj));
  const pkH=fmtH(fHours[pkIdx]);
  set('fc-kpi-critical',crit.toLocaleString());
  set('fc-kpi-critical-sub',`${(crit/data.length*100).toFixed(0)}% of records — immediate response`);
  set('fc-kpi-peak',pkH);
}

function renderTrKPIs(data){
  const el=document.getElementById('tr-kpis');if(!el)return;
  const avgD=data.length?avg(data.map(d=>d.crowd_density)).toFixed(1):0;
  const crit=data.filter(d=>d.incident_flag==='CRITICAL').length;
  const wkndAvg=avg(data.filter(d=>d.is_weekend).map(d=>d.crowd_density)).toFixed(1);
  const hcnt={};data.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  el.innerHTML=`
    <div class="kpi" style="--kc:#00c8ff;--kb:rgba(0,200,255,.1)"><div class="kpi-ico">📊</div><div><div class="kpi-lbl">Avg Crowd Density</div><div class="kpi-val">${avgD}</div><div class="kpi-sub">${data.length.toLocaleString()} records</div></div></div>
    <div class="kpi" style="--kc:#ff0033;--kb:rgba(255,0,51,.1)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">Critical Events</div><div class="kpi-val" style="color:#ff0033;">${crit.toLocaleString()}</div><div class="kpi-sub">${(crit/data.length*100).toFixed(0)}% of records</div></div></div>
    <div class="kpi" style="--kc:#ffaa00;--kb:rgba(255,170,0,.1)"><div class="kpi-ico">🌆</div><div><div class="kpi-lbl">Weekend Avg Density</div><div class="kpi-val">${wkndAvg||'—'}</div><div class="kpi-sub">Sat–Sun patterns</div></div></div>
    <div class="kpi" style="--kc:#00ff88;--kb:rgba(0,255,136,.1)"><div class="kpi-ico">🕐</div><div><div class="kpi-lbl">Peak Hour</div><div class="kpi-val">${pk?fmtH(+pk[0]):'—'}</div><div class="kpi-sub">${pk?pk[1]+' check-ins':''}</div></div></div>`;
}

function renderHMMatrix(data,tableId){
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hours=Array.from({length:24},(_,i)=>i);
  const mat={};days.forEach(d=>{mat[d]={};hours.forEach(h=>{mat[d][h]=[];});});
  data.forEach(d=>{if(mat[d.day_of_week]&&mat[d.day_of_week][d.hour_of_day]!==undefined)mat[d.day_of_week][d.hour_of_day].push(d.crowd_density);});
  let maxV=0;days.forEach(dy=>hours.forEach(h=>{const a=mat[dy][h];if(a.length)maxV=Math.max(maxV,avg(a));}));
  const tbl=document.getElementById(tableId);if(!tbl)return;
  let html='<thead><tr><th style="font-size:9px;font-family:monospace;color:var(--t3);padding:2px 6px;"></th>';
  hours.forEach(h=>{html+=h%3===0?`<th style="font-size:8px;font-family:monospace;color:var(--t3);text-align:center;padding:2px;">${fmtH(h)}</th>`:'<th></th>';});
  html+='</tr></thead><tbody>';
  days.forEach(dy=>{
    html+=`<tr><td style="font-size:9px;font-family:monospace;color:var(--t2);text-align:right;padding-right:8px;white-space:nowrap;">${dy.slice(0,3)}</td>`;
    hours.forEach(h=>{const arr=mat[dy][h],val=arr.length?avg(arr):0,norm=maxV?val/maxV:0,bg=hmC(norm),lbl=arr.length?val.toFixed(0):'';html+=`<td class="hm-cell" style="background:${bg};" onclick="filterFeedByDayHour('${dy}',${h})" title="${dy} ${fmtH(h)}: ${arr.length} records, avg ${val.toFixed(0)}">${lbl}</td>`;});
    html+='</tr>';
  });
  tbl.innerHTML=html+'</tbody>';
}

function renderTrHourly(data){
  const hm={};for(let h=0;h<24;h++)hm[h]=[];data.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h)),vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null),cnts=Array.from({length:24},(_,h)=>hm[h].length);
  destroyC('trH');const ctx=document.getElementById('ch-tr-hourly')?.getContext('2d');if(!ctx)return;
  CH.trH=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Avg Density',data:vals,borderColor:'#00c8ff',backgroundColor:grad(ctx,'rgba(0,200,255,.2)','rgba(0,200,255,.01)'),fill:true,tension:.45,pointRadius:4,pointBackgroundColor:vals.map(val=>val>=85?'#ff0033':val>=70?'#ff3355':'#00c8ff'),borderWidth:2.5,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>[' Avg Density: '+ctx.parsed.y,' Check-ins: '+cnts[ctx.dataIndex]]}}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderTrWknd(data){
  const wd=data.filter(d=>!d.is_weekend),we=data.filter(d=>d.is_weekend);
  const hours=Array.from({length:24},(_,i)=>i);
  const wdV=hours.map(h=>{const a=wd.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  const weV=hours.map(h=>{const a=we.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  destroyC('trW');const ctx=document.getElementById('ch-tr-wknd')?.getContext('2d');if(!ctx)return;
  CH.trW=new Chart(ctx,{type:'line',data:{labels:hours.map(h=>fmtH(h)),datasets:[{label:'Weekday',data:wdV,borderColor:'#00c8ff',backgroundColor:'rgba(0,200,255,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,spanGaps:true},{label:'Weekend',data:weV,borderColor:'#ff3355',backgroundColor:'rgba(255,51,85,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderTrZone(data){
  const zm={};data.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0,high:0};if(d.incident_flag==='CRITICAL')zm[d.patrol_zone].crit++;if(d.incident_flag==='HIGH')zm[d.patrol_zone].high++;});
  const labels=Object.keys(zm).sort();
  destroyC('trZone');const ctx=document.getElementById('ch-tr-zone')?.getContext('2d');if(!ctx)return;
  CH.trZone=new Chart(ctx,{type:'bar',data:{labels:labels.map(l=>l.split('—')[0].trim()),datasets:[{label:'Critical',data:labels.map(l=>zm[l].crit),backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:3,borderSkipped:false},{label:'High',data:labels.map(l=>zm[l].high),backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:20}},y:sy('Events')}}});
}

function renderFcForecast(data){
  const now=new Date(),ch=now.getHours();
  const hc={};for(let h=0;h<24;h++)hc[h]=0;
  data.forEach(d=>hc[d.hour_of_day]++);
  const maxC=Math.max(...Object.values(hc),1);
  const fHours=Array.from({length:24},(_,i)=>(ch+i)%24);
  const base=fHours.map(h=>+(hc[h]/maxC*100).toFixed(1));
  const proj=base.map((val,i)=>Math.max(3,Math.min(100,+(val+Math.sin(i*.7)*5+(Math.random()*6-3)).toFixed(1))));
  destroyC('fcF');const ctx=document.getElementById('ch-fc-forecast')?.getContext('2d');if(!ctx)return;
  CH.fcF=new Chart(ctx,{type:'line',data:{labels:fHours.map(h=>fmtH(h)),datasets:[
    {label:'Historical Baseline',data:base,borderColor:'rgba(0,200,255,.4)',backgroundColor:'transparent',borderDash:[5,4],fill:false,tension:.4,pointRadius:2,borderWidth:1.5},
    {label:'Predicted Foot Traffic',data:proj,borderColor:'#00ff88',backgroundColor:grad(ctx,'rgba(0,255,136,.2)','rgba(0,255,136,.01)'),fill:true,tension:.4,pointRadius:3,pointBackgroundColor:proj.map(val=>val>=70?'#ff0033':'#00ff88'),pointHoverRadius:7,borderWidth:2.5},
    {label:'Critical Threshold',data:Array(fHours.length).fill(85),borderColor:'rgba(255,0,51,.4)',borderDash:[3,5],borderWidth:1.5,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y}%`}}},scales:{x:sx(),y:sy('Crowd Level',0,115)}}});
}

function renderFcCards(data,timeLabel){
  const lbl=timeLabel||'Expected Tonight \u00b7 6PM\u201311PM';
  const vm={};data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,dens:[],zone:d.patrol_zone};vm[d.venue_name].dens.push(d.crowd_density);});
  const top10=Object.entries(vm).map(([n,v2])=>({n,cat:v2.cat,zone:v2.zone,avgD:avg(v2.dens)})).sort((a,b)=>b.avgD-a.avgD).slice(0,10);
  const grid=document.getElementById('fc-venue-cards');if(!grid)return;grid.innerHTML='';
  top10.forEach(v2=>{
    const useData=data.filter(d=>d.venue_name===v2.n).map(d=>d.crowd_density);
    const proj=+(avg(useData.length?useData:v2.dens)*(0.92+Math.random()*.16)).toFixed(1);
    const flag=proj>=85?'CRITICAL':proj>=70?'HIGH':proj>=50?'ELEVATED':'NORMAL';
    const col=FLAG_COL[flag],icon=VENUE_ICONS[v2.cat]||'📍';
    const action={'CRITICAL':'Immediate Response','HIGH':'Monitor Closely','ELEVATED':'Routine Patrol','NORMAL':'No Action Required'}[flag];
    const div=document.createElement('div');
    div.style.cssText='background:var(--bg3);border:1px solid var(--bdr);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .15s;';
    div.onmouseenter=()=>div.style.borderColor='var(--bdr2)';
    div.onmouseleave=()=>div.style.borderColor='var(--bdr)';
    div.innerHTML=`<div style="font-size:16px;margin-bottom:4px;">${icon}</div>
      <div style="font-family:monospace;font-size:9px;color:var(--t3);margin-bottom:5px;letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${v2.n}</div>
      <div style="font-family:var(--disp);font-size:16px;font-weight:700;color:${col};margin-bottom:2px;">${proj>=85?'OVERCROWDED':proj>=70?'VERY BUSY':proj>=50?'BUSY':'MODERATE'}</div>
      <div style="font-family:var(--mono);font-size:10px;color:${col};margin-bottom:2px;">${proj.toFixed(0)}% crowd level</div>
      <div style="font-size:9px;color:var(--t3);margin-bottom:6px;">${lbl}</div>
      <span class="tag ${flagClass(flag)}">${flag}</span>
      <div style="font-size:9px;color:var(--t2);margin-top:5px;">${action}</div>
      <div style="margin-top:8px;height:3px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;"><div style="width:${proj}%;height:100%;background:linear-gradient(90deg,#003366,${col});border-radius:2px;"></div></div>`;
    div.onclick=()=>goInvestigate(v2.n);
    grid.appendChild(div);
  });
}

function renderFcWknd(data){
  const wd=data.filter(d=>!d.is_weekend),we=data.filter(d=>d.is_weekend);
  const hours=Array.from({length:24},(_,i)=>i);
  const wdV=hours.map(h=>{const a=wd.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  const weV=hours.map(h=>{const a=we.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  destroyC('fcW');const ctx=document.getElementById('ch-fc-wknd')?.getContext('2d');if(!ctx)return;
  CH.fcW=new Chart(ctx,{type:'line',data:{labels:hours.map(h=>fmtH(h)),datasets:[{label:'Weekday',data:wdV,borderColor:'#00c8ff',backgroundColor:'rgba(0,200,255,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:2,spanGaps:true},{label:'Weekend',data:weV,borderColor:'#ff3355',backgroundColor:'rgba(255,51,85,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:2,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderFcRisk(data){
  const hours=Array.from({length:24},(_,i)=>i);
  const critV=hours.map(h=>data.filter(d=>d.hour_of_day===h&&d.incident_flag==='CRITICAL').length);
  const highV=hours.map(h=>data.filter(d=>d.hour_of_day===h&&d.incident_flag==='HIGH').length);
  destroyC('fcRisk');const ctx=document.getElementById('ch-fc-risk')?.getContext('2d');if(!ctx)return;
  CH.fcRisk=new Chart(ctx,{type:'bar',data:{labels:hours.map(h=>fmtH(h)),datasets:[{label:'Critical',data:critV,backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:2,borderSkipped:false},{label:'High',data:highV,backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:2,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:0}},y:sy('Events')}}});
}

function renderFcZone(data){
  // Always use ALL data for zone deployment — officer needs full city picture
  const allEvening=allData.filter(d=>d.hour_of_day>=18&&d.hour_of_day<=23);
  const zones=[...new Set(allData.map(d=>d.patrol_zone))].sort();
  const zoneAvgs=zones.map(z=>{const zd=allEvening.filter(d=>d.patrol_zone===z);return zd.length?+avg(zd.map(d=>d.crowd_density)).toFixed(1):0;});
  destroyC('fcZone');const ctx=document.getElementById('ch-fc-zone')?.getContext('2d');if(!ctx)return;
  CH.fcZone=new Chart(ctx,{type:'bar',data:{labels:zones.map(z=>z.split('—')[0].trim()),datasets:[{label:'Projected Evening Density',data:zoneAvgs,backgroundColor:zones.map(z=>(ZONE_COLS[z]||'#00c8ff')+'88'),borderColor:zones.map(z=>ZONE_COLS[z]||'#00c8ff'),borderWidth:1.5,borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` Projected: ${ctx.parsed.y}%`}}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:20}},y:{...sy('Crowd Level'),min:0,max:100}}}});
}

/* ════════ INVESTIGATION ════════ */
function initInvestigation(){
  const pop=(id,vals)=>{const el=document.getElementById(id);if(el&&el.options.length<=1)vals.forEach(v2=>el.add(new Option(v2,v2)));};
  pop('inv-venue',[...new Set(allData.map(d=>d.venue_name))].sort());
  pop('inv-zone',[...new Set(allData.map(d=>d.patrol_zone))].sort());
  const ih=document.getElementById('inv-hour');
  if(ih&&ih.options.length<=1)[...new Set(allData.map(d=>d.hour_of_day))].sort((a,b)=>a-b).forEach(h=>ih.add(new Option(fmtH(h),h)));
  sh('inv-ready',true);sh('inv-results',false);sh('inv-noresults',false);
  set('inv-count','');document.getElementById('inv-risk-wrap').innerHTML='';
}

function runInvestigation(){
  const venue=v('inv-venue'),day=v('inv-day'),zone=v('inv-zone'),flag=v('inv-flag');
  const iCounty=v('inv-county'),iCity=v('inv-city');
  const hourRaw=document.getElementById('inv-hour')?.value;
  const hour=(hourRaw!==''&&hourRaw!=null)?+hourRaw:null;
  const exact=allData.filter(d=>{
    if(iCounty&&d.county!==iCounty)return false;
    if(iCity&&d.city!==iCity)return false;
    if(venue&&d.venue_name!==venue)return false;
    if(day&&d.day_of_week!==day)return false;
    if(hour!==null&&d.hour_of_day!==hour)return false;
    if(zone&&d.patrol_zone!==zone)return false;
    if(flag&&d.incident_flag!==flag)return false;
    return true;
  });
  if(exact.length){
    set('inv-count',exact.length.toLocaleString()+' exact records');
    sh('inv-ready',false);sh('inv-results',true);sh('inv-noresults',false);
    const fs=document.getElementById('inv-fallback-section');if(fs)fs.style.display='none';
    renderInvAll(exact,{venue,day,hour,zone,flag,fallback:false});return;
  }
  set('inv-count','0 exact · showing related');
  sh('inv-ready',false);sh('inv-noresults',false);sh('inv-results',true);
  const venueCat=venue?allData.find(x=>x.venue_name===venue)?.venue_category:null;
  const pool=flag?allData.filter(d=>d.incident_flag===flag):allData;
  if(!pool.length){
    set('inv-count','0 exact · 0 related');
    sh('inv-results',false);sh('inv-noresults',true);
    return;
  }
  const scored=pool.map(d=>{
    let score=0;
    if(venue&&d.venue_name===venue)score+=10;
    else if(venueCat&&d.venue_category===venueCat)score+=3;
    if(day&&d.day_of_week===day)score+=4;
    if(hour!==null){const diff=Math.abs(d.hour_of_day-hour);if(diff===0)score+=5;else if(diff<=1)score+=3;else if(diff<=3)score+=1;}
    if(zone&&d.patrol_zone===zone)score+=2;
    return{...d,_score:score};
  }).filter(d=>(venue&&d.venue_name===venue)||(venueCat&&d.venue_category===venueCat&&day&&d.day_of_week===day)||(flag&&d._score===0)||(!venue&&!venueCat&&d._score>0)).sort((a,b)=>b._score-a._score).slice(0,60);
  const nearbyVenues=venueCat?[...new Set(pool.filter(d=>d.venue_category===venueCat&&d.venue_name!==venue).map(d=>d.venue_name))].slice(0,5):[];
  renderInvAll(scored,{venue,day,hour,zone,flag,fallback:true,nearbyVenues,originalFilters:{venue,day,hour,zone,flag}});
}

function resetInvestigation(){
  ['inv-county','inv-city','inv-venue','inv-day','inv-hour','inv-zone','inv-flag'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  set('inv-count','');sh('inv-ready',true);sh('inv-results',false);sh('inv-noresults',false);
  const fs=document.getElementById('inv-fallback-section');if(fs)fs.style.display='none';
  document.getElementById('inv-risk-wrap').innerHTML='';
  ['ivH','ivDD','ivDw','ivTL','ivNearby'].forEach(k=>destroyC(k));
}

function renderInvAll(results,filters){
  renderInvKPIs(results,filters);renderInvSummary(results,filters);
  renderInvTimeline(results);renderInvTable(results,filters);
  const fs=document.getElementById('inv-fallback-section');
  if(filters.fallback&&fs){fs.style.display='block';renderInvFallbackBanner(filters);}
  else if(fs)fs.style.display='none';
}

function renderInvKPIs(results,filters={}){
  const el=document.getElementById('inv-kpi-row');if(!el)return;
  const isFb=filters.fallback||false;
  const uniqU=new Set(results.map(d=>d.user_id)).size;
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length;
  const high=results.filter(d=>d.incident_flag==='HIGH').length;
  const avgD=avg(results.map(d=>d.crowd_density)).toFixed(1);
  const uniqV=new Set(results.map(d=>d.venue_name)).size;
  const riskLevel=crit/results.length>.2?'CRITICAL':high/results.length>.3?'HIGH':(crit+high)/results.length>.1?'ELEVATED':'NORMAL';
  const riskCol=FLAG_COL[riskLevel];
  document.getElementById('inv-risk-wrap').innerHTML=`<span class="${riskBadgeClass(riskLevel)} risk-badge">${riskLevel==='CRITICAL'?'🚨':riskLevel==='HIGH'?'⚠':riskLevel==='ELEVATED'?'👁':'✓'} ${riskLevel} RISK</span>`;
  el.innerHTML=`
    <div class="kpi" style="--kc:#00c8ff;--kb:rgba(0,200,255,.1)"><div class="kpi-ico">👥</div><div><div class="kpi-lbl">${isFb?'Users in Related':'People Present'}</div><div class="kpi-val" style="color:#00c8ff;">${uniqU.toLocaleString()}</div><div class="kpi-sub">${results.length.toLocaleString()} check-in events</div></div></div>
    <div class="kpi" style="--kc:#ff0033;--kb:rgba(255,0,51,.1)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">Critical Events</div><div class="kpi-val" style="color:#ff0033;">${crit}</div><div class="kpi-sub">${high} high risk events</div></div></div>
    <div class="kpi" style="--kc:${riskCol};--kb:rgba(0,200,255,.1)"><div class="kpi-ico">⚡</div><div><div class="kpi-lbl">Avg Crowd Density</div><div class="kpi-val" style="color:${riskCol};">${avgD}</div><div class="kpi-sub">across records</div></div></div>
    <div class="kpi" style="--kc:#00ff88;--kb:rgba(0,255,136,.1)"><div class="kpi-ico">📍</div><div><div class="kpi-lbl">${isFb?'Related Venues':'Venues'}</div><div class="kpi-val" style="color:#00ff88;">${uniqV}</div><div class="kpi-sub">${[...new Set(results.map(d=>d.patrol_zone))].length} patrol zones</div></div></div>`;
}

function renderInvSummary(results,filters){
  const el=document.getElementById('inv-summary'),rEl=document.getElementById('inv-risk-inner');if(!el)return;
  const uniqU=new Set(results.map(d=>d.user_id)).size,uniqV=new Set(results.map(d=>d.venue_name)).size;
  const avgD=avg(results.map(d=>d.crowd_density)).toFixed(1),avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length;
  const venueList=[...new Set(results.map(d=>d.venue_name))].slice(0,5).join(', ');
  const hcnt={};results.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  const spikes=Object.entries(hcnt).filter(([h])=>avg(results.filter(d=>d.hour_of_day===+h).map(d=>d.crowd_density))>=85).map(([h])=>fmtH(+h));
  const riskLevel=crit/results.length>.2?'CRITICAL':crit>0?'HIGH':'ELEVATED';
  if(rEl)rEl.innerHTML=`<span class="${riskBadgeClass(riskLevel)} risk-badge" style="font-size:10px;">${riskLevel}</span>`;
  const pill=(txt,col='#00c8ff')=>`<span style="display:inline-flex;padding:1px 8px;background:rgba(0,200,255,.08);border-radius:100px;font-family:monospace;font-size:11px;color:${col};margin:0 2px;">${txt}</span>`;
  const fdesc=[filters.venue?`<b>${filters.venue}</b>`:null,filters.day?`<b>${filters.day}</b>`:null,filters.hour!=null?`<b>${fmtH(filters.hour)}</b>`:null,filters.zone?`<b>${filters.zone}</b>`:null,filters.flag?`<b>${filters.flag}</b>`:null].filter(Boolean).join(' · ')||'All records';
  el.innerHTML=`
    <div style="font-family:monospace;font-size:9px;color:var(--t3);padding:5px 8px;background:rgba(255,255,255,.02);border-radius:3px;margin-bottom:10px;">${fdesc}</div>
    <div style="font-size:12.5px;line-height:1.85;color:var(--t2);">
      <b style="color:var(--t1);">Who was present:</b> ${pill(uniqU+' individuals')} across ${pill(results.length+' check-ins')} at ${pill(uniqV+' venue(s)')}<br/>
      <span style="font-size:10px;color:var(--t3);">${venueList}</span><br/>
      <b style="color:var(--t1);">Crowd conditions:</b> Avg density ${pill(avgD)} · Avg dwell ${pill(avgDw+' min')} · ${pill(crit+' critical events','#ff0033')}<br/>
      <b style="color:var(--t1);">Peak window:</b> ${pill(pkH?fmtH(+pkH[0]):'—')} with ${pkH?pkH[1]:0} check-ins
    </div>
    ${spikes.length>0
      ?`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:8px;background:rgba(255,0,51,.1);border:1px solid rgba(255,0,51,.25);border-radius:5px;"><span>🚨</span><span style="color:#ff0033;font-size:12px;font-weight:700;">CRITICAL spikes at: ${spikes.join(', ')} — Immediate response recommended.</span></div>`
      :filters.fallback
        ?`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:8px;background:rgba(255,170,0,.06);border:1px solid rgba(255,170,0,.2);border-radius:5px;"><span>⚠</span><span style="color:#ffaa00;font-size:12px;">No exact records for this filter. Showing closest related records.</span></div>`
        :`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:8px;background:rgba(0,255,136,.05);border:1px solid rgba(0,255,136,.15);border-radius:5px;"><span>✓</span><span style="color:#00ff88;font-size:12px;">No critical spikes detected. Crowd within acceptable parameters.</span></div>`}`;
}

function renderInvInsights(results){
  const el=document.getElementById('inv-insights');if(!el)return;
  const uniqU=new Set(results.map(d=>d.user_id)).size;
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length;
  const vm={};results.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={dens:[],zone:d.patrol_zone,cat:d.venue_category};vm[d.venue_name].dens.push(d.crowd_density);});
  const topV=Object.entries(vm).sort((a,b)=>avg(b[1].dens)-avg(a[1].dens))[0];
  const hcnt={};results.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  const wknd=results.filter(d=>d.is_weekend).length,wkdy=results.filter(d=>!d.is_weekend).length;
  const avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const topAct=Object.entries(results.reduce((a,d)=>{a[d.activity_type]=(a[d.activity_type]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1])[0];
  const ins=[
    {ic:'👥',lbl:'Persons of Interest',val:`${uniqU} unique IDs across ${results.length} events`,badge:uniqU>100?'High Volume':'Normal',bc:uniqU>100?'#ffaa00':'#00ff88'},
    {ic:'🚨',lbl:'Critical Incidents',val:`${crit} events above density 85`,badge:`${(crit/results.length*100).toFixed(0)}% rate`,bc:crit/results.length>.2?'#ff0033':'#ffaa00'},
    {ic:'📍',lbl:'Highest Risk Location',val:topV?`${topV[0]}`:'—',badge:topV?`Avg ${avg(topV?.[1]?.dens||[0]).toFixed(0)}%`:'—',bc:'#ff3355'},
    {ic:'🕐',lbl:'Peak Incident Window',val:pkH?`${fmtH(+pkH[0])} — ${pkH[1]} events`:'—',badge:'Deploy Here',bc:'#00c8ff'},
    {ic:'📅',lbl:'Day Pattern',val:`${wknd} weekend · ${wkdy} weekday events`,badge:wknd>wkdy?'Weekend Heavy':'Weekday Heavy',bc:wknd>wkdy?'#ff3355':'#00c8ff'},
    {ic:'🎭',lbl:'Top Activity Type',val:topAct?`${topAct[0]} — ${topAct[1]} events`:'—',badge:'Context',bc:'#9b59ff'},
  ];
  el.innerHTML=ins.map(i=>`<div class="inv-insight-item"><div style="font-size:14px;">${i.ic}</div><div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:var(--t1);">${i.lbl}</div><div style="font-size:11px;color:var(--t2);">${i.val}</div></div><div style="font-size:11px;font-weight:700;font-family:monospace;color:${i.bc};flex-shrink:0;">${i.badge}</div></div>`).join('');
}

function renderInvHourChart(data){
  const hm={};for(let h=0;h<24;h++)hm[h]={cnt:0,dens:[],crit:0};
  data.forEach(d=>{hm[d.hour_of_day].cnt++;hm[d.hour_of_day].dens.push(d.crowd_density);if(d.incident_flag==='CRITICAL')hm[d.hour_of_day].crit++;});
  const labels=Array.from({length:24},(_,h)=>fmtH(h)),cnts=Array.from({length:24},(_,h)=>hm[h].cnt),dens=Array.from({length:24},(_,h)=>hm[h].dens.length?+avg(hm[h].dens).toFixed(1):0);
  const maxC=Math.max(...cnts,1);
  const top3=cnts.map((c,h)=>({h,c})).sort((a,b)=>b.c-a.c).filter(x=>x.c>0).slice(0,3).map(x=>fmtH(x.h));
  set('inv-hour-sub',top3.length?'Busiest: '+top3.join(', '):'');
  destroyC('ivH');const ctx=document.getElementById('inv-ch-hour')?.getContext('2d');if(!ctx)return;
  ICH.ivH=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Check-ins',data:cnts,backgroundColor:cnts.map((val,i)=>{const r=val/maxC;return hm[i]?.crit>0?'rgba(255,0,51,.8)':r>.4?'rgba(255,170,0,.75)':val>0?'rgba(0,200,255,.6)':'rgba(0,200,255,.1)';}),borderRadius:3,borderSkipped:false,yAxisID:'y'},
    {label:'Avg Density',data:dens,type:'line',borderColor:'#00ff88',backgroundColor:'transparent',borderWidth:2,pointRadius:3,pointBackgroundColor:dens.map(val=>val>=85?'#ff0033':'#00ff88'),tension:.4,yAxisID:'y2'}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{label:ctx=>ctx.datasetIndex===0?` ${ctx.parsed.y} check-ins`:` Avg density: ${ctx.parsed.y}`}}},scales:{x:sx(),y:{...sy('Check-ins'),position:'left'},y2:{position:'right',grid:{display:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9}},min:0,max:105}}}});
}

function renderInvDensDonut(data){
  const c={CRITICAL:0,HIGH:0,ELEVATED:0,NORMAL:0};data.forEach(d=>{c[d.incident_flag]=(c[d.incident_flag]||0)+1;});
  const tot=data.length||1,cols=['#ff0033','#ff3355','#ffaa00','#00ff88'];
  destroyC('ivDD');const ctx=document.getElementById('inv-ch-dens-donut')?.getContext('2d');if(!ctx)return;
  ICH.ivDD=new Chart(ctx,{type:'doughnut',data:{labels:['Critical','High','Elevated','Normal'],datasets:[{data:[c.CRITICAL,c.HIGH,c.ELEVATED,c.NORMAL],backgroundColor:cols,borderColor:'rgba(5,8,16,.8)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('inv-dens-legend').innerHTML=[{l:'Crit',v:c.CRITICAL,c:'#ff0033'},{l:'High',v:c.HIGH,c:'#ff3355'},{l:'Elev',v:c.ELEVATED,c:'#ffaa00'},{l:'Norm',v:c.NORMAL,c:'#00ff88'}].map(x=>`<div style="display:flex;align-items:center;gap:3px;font-size:9px;"><div style="width:6px;height:6px;border-radius:50%;background:${x.c};"></div><span style="color:var(--t3);">${x.l}</span><span style="color:${x.c};font-weight:700;font-family:monospace;">${(x.v/tot*100).toFixed(0)}%</span></div>`).join('');
}

function renderInvDwellDonut(data){
  const b={'<30m':0,'30–60m':0,'60–90m':0,'90–120m':0,'>120m':0};
  data.forEach(d=>{const dw=d.avg_dwell_minutes;if(dw<30)b['<30m']++;else if(dw<60)b['30–60m']++;else if(dw<90)b['60–90m']++;else if(dw<120)b['90–120m']++;else b['>120m']++;});
  const cols=['#00c8ff','#00ff88','#ffaa00','#ff3355','#9b59ff'],tot=data.length||1;
  destroyC('ivDw');const ctx=document.getElementById('inv-ch-dwell')?.getContext('2d');if(!ctx)return;
  ICH.ivDw=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(b),datasets:[{data:Object.values(b),backgroundColor:cols,borderColor:'rgba(5,8,16,.8)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('inv-dwell-legend').innerHTML=Object.keys(b).map((lbl,i)=>`<div style="display:flex;align-items:center;gap:3px;font-size:9px;"><div style="width:6px;height:6px;border-radius:50%;background:${cols[i]};"></div><span style="color:var(--t3);">${lbl}</span><span style="color:${cols[i]};font-weight:700;font-family:monospace;">${(b[lbl]/tot*100).toFixed(0)}%</span></div>`).join('');
}

function renderInvTimeline(data){
  const sorted=[...data].sort((a,b)=>a.timestamp<b.timestamp?-1:1);
  const vals=sorted.map(d=>d.crowd_density);
  destroyC('ivTL');const ctx=document.getElementById('inv-ch-timeline')?.getContext('2d');if(!ctx)return;
  ICH.ivTL=new Chart(ctx,{type:'line',data:{labels:sorted.map(d=>d.timestamp.slice(0,10)),datasets:[
    {label:'Crowd Density',data:vals,borderColor:'#00c8ff',backgroundColor:grad(ctx,'rgba(0,200,255,.15)','rgba(0,200,255,.01)'),fill:true,tension:.35,borderWidth:1.5,pointRadius:vals.map(val=>val>=85?6:val>=70?3:0),pointBackgroundColor:vals.map(val=>val>=85?'#ff0033':val>=70?'#ff3355':'#00c8ff'),pointBorderColor:'#fff',pointBorderWidth:1.5},
    {label:'Critical (85)',data:Array(vals.length).fill(85),borderColor:'rgba(255,0,51,.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false},
    {label:'High Risk (70)',data:Array(vals.length).fill(70),borderColor:'rgba(255,51,85,.3)',borderDash:[3,5],borderWidth:1,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:9},boxWidth:7}},tooltip:{...tt(),callbacks:{title:items=>`${sorted[items[0].dataIndex]?.venue_name}`,label:ctx=>ctx.datasetIndex===0?[` Density: ${ctx.parsed.y}`,` Flag: ${sorted[ctx.dataIndex]?.incident_flag}`,` User: ${sorted[ctx.dataIndex]?.user_id}`]:` ${ctx.dataset.label}: ${ctx.parsed.y}`}}},scales:{x:{display:false},y:sy('Density',0,110)}}});
}

function renderInvTable(results,filters={}){
  const isFb=filters.fallback||false;
  set('inv-table-count','('+(isFb?results.length+' related':results.length+' records')+')');
  const ft=document.getElementById('inv-fallback-tag');if(ft)ft.style.display=isFb?'inline':'none';
  document.getElementById('inv-tbody').innerHTML=results.map(d=>{
    const fc=FLAG_CLASS[d.incident_flag]||'dp-normal';
    const isCrit=d.incident_flag==='CRITICAL';
    return `<tr style="${isCrit?'background:rgba(255,0,51,.05);':''}">
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:monospace;font-size:10px;color:var(--t3);">${d.checkin_id}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:monospace;color:#00c8ff;font-weight:600;">${d.user_id}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-weight:600;">${d.venue_name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.venue_category}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:monospace;font-size:11px;">${d.timestamp}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);"><span class="${fc}">${d.incident_flag}${isCrit?' ⚑':''}</span></td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-weight:700;color:${FLAG_COL[d.incident_flag]};font-size:11px;">${d.crowd_density>=85?'OVERCROWDED':d.crowd_density>=70?'VERY BUSY':d.crowd_density>=50?'BUSY':'MODERATE'}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.day_of_week}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:monospace;color:var(--t3);">${fmtH(d.hour_of_day)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:#9b59ff;font-size:11px;">${d.patrol_zone.split('—')[0].trim()}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);font-size:11px;">${d.activity_type}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:${FLAG_COL[d.incident_flag]};font-size:11px;font-weight:600;">${d.officer_action}</td>
    </tr>`;
  }).join('');
}

function renderInvFallbackBanner(filters){
  const el=document.getElementById('inv-fallback-banner');if(!el)return;
  const of=filters.originalFilters||{};
  const parts=[of.venue?`<b>${of.venue}</b>`:null,of.day?`<b>${of.day}</b>`:null,of.hour!=null?`<b>${fmtH(of.hour)}</b>`:null,of.zone?`<b>${of.zone}</b>`:null,of.flag?`<b>${of.flag}</b>`:null].filter(Boolean).join(' · ');
  el.innerHTML=`<div style="display:flex;align-items:flex-start;gap:12px;"><div style="font-size:20px;">⊘</div><div style="flex:1;"><div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:4px;">No exact records for: ${parts}</div><div style="font-size:12px;color:var(--t2);line-height:1.6;">Auto-expanded to show closest matching activity — nearby venues, similar time windows, and related crowd patterns.</div></div><span style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:3px 10px;background:rgba(255,170,0,.1);color:#ffaa00;border:1px solid rgba(255,170,0,.3);border-radius:4px;flex-shrink:0;">Fallback Mode</span></div>`;
}

function renderNearbyActivity(filters){
  const el=document.getElementById('inv-nearby-activity');if(!el)return;
  const nv=filters.nearbyVenues||[];
  if(!nv.length){el.innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:16px;">No nearby venues found</div>';return;}
  el.innerHTML=nv.map(vname=>{
    const vd=allData.filter(d=>d.venue_name===vname),ad=avg(vd.map(d=>d.crowd_density));
    const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
    const topFlag=vd.sort((a,b)=>ord[b.incident_flag]-ord[a.incident_flag])[0]?.incident_flag||'NORMAL';
    const col=FLAG_COL[topFlag],icon=VENUE_ICONS[vd[0]?.venue_category]||'📍';
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--bg3);border-radius:6px;border:1px solid var(--bdr);border-left:3px solid ${col};margin-bottom:7px;cursor:pointer;" onclick="goInvestigate('${vname}')">
      <div style="font-size:16px;">${icon}</div>
      <div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;">${vname}</div><div style="font-size:10px;color:var(--t3);">${vd[0]?.patrol_zone?.split('—')[0].trim()||''}</div></div>
      <div style="text-align:right;flex-shrink:0;"><span class="tag ${flagClass(topFlag)}" style="font-size:8px;">${topFlag}</span><div style="font-family:monospace;font-size:14px;font-weight:700;color:${col};margin-top:3px;">${ad.toFixed(0)}%</div></div>
    </div>`;
  }).join('');
}

function renderRecentPatterns(results){
  const el=document.getElementById('inv-recent-patterns');if(!el)return;
  destroyC('ivNearby');
  const c={CRITICAL:0,HIGH:0,NORMAL:0};
  results.forEach(d=>{if(d.incident_flag==='CRITICAL')c.CRITICAL++;else if(d.incident_flag==='HIGH')c.HIGH++;else c.NORMAL++;});
  const tot=results.length||1;
  const hm={};for(let h=0;h<24;h++)hm[h]=[];results.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h)),vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null);
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:12px;">
      <div style="background:rgba(255,0,51,.1);border:1px solid rgba(255,0,51,.2);border-radius:6px;padding:10px;text-align:center;"><div style="font-family:var(--disp);font-size:22px;font-weight:700;color:#ff0033;">${c.CRITICAL}</div><div style="font-family:monospace;font-size:9px;color:var(--t2);margin-top:2px;">CRITICAL</div><div style="font-size:9px;color:#ff0033;">${(c.CRITICAL/tot*100).toFixed(0)}%</div></div>
      <div style="background:rgba(255,51,85,.08);border:1px solid rgba(255,51,85,.2);border-radius:6px;padding:10px;text-align:center;"><div style="font-family:var(--disp);font-size:22px;font-weight:700;color:#ff3355;">${c.HIGH}</div><div style="font-family:monospace;font-size:9px;color:var(--t2);margin-top:2px;">HIGH RISK</div><div style="font-size:9px;color:#ff3355;">${(c.HIGH/tot*100).toFixed(0)}%</div></div>
      <div style="background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.15);border-radius:6px;padding:10px;text-align:center;"><div style="font-family:var(--disp);font-size:22px;font-weight:700;color:#00ff88;">${c.NORMAL}</div><div style="font-family:monospace;font-size:9px;color:var(--t2);margin-top:2px;">NORMAL/ELEV</div><div style="font-size:9px;color:#00ff88;">${(c.NORMAL/tot*100).toFixed(0)}%</div></div>
    </div>
    <div style="height:85px;position:relative;"><canvas id="inv-ch-nearby"></canvas></div>`;
  requestAnimationFrame(()=>{
    const ctx2=document.getElementById('inv-ch-nearby')?.getContext('2d');if(!ctx2)return;
    ICH.ivNearby=new Chart(ctx2,{type:'line',data:{labels,datasets:[{label:'Related Density',data:vals,borderColor:'#9b59ff',backgroundColor:grad(ctx2,'rgba(155,89,255,.2)','rgba(155,89,255,.01)'),fill:true,tension:.4,pointRadius:2,borderWidth:2,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tt()}},scales:{x:sx(),y:sy('',0,105)}}});
  });
}


/* ════════ SETTINGS & EXPORT ════════ */
function openSettings(){
  const modal=document.getElementById('settings-modal');
  if(modal)modal.style.display='flex';
}
function closeSettings(){
  const modal=document.getElementById('settings-modal');
  if(modal)modal.style.display='none';
}
// Close modal on backdrop click
document.addEventListener('click',e=>{
  const modal=document.getElementById('settings-modal');
  if(modal&&e.target===modal)closeSettings();
});

function exportSituationReport(){
  const now=new Date().toLocaleString();
  const critV=new Set(allData.filter(d=>d.incident_flag==='CRITICAL').map(d=>d.venue_name)).size;
  const highV=new Set(allData.filter(d=>d.incident_flag==='HIGH').map(d=>d.venue_name)).size;
  const zones=new Set(allData.filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH').map(d=>d.patrol_zone));
  const vm={};allData.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={dens:[],zone:d.patrol_zone,cat:d.venue_category,flags:[]};vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].flags.push(d.incident_flag);});
  const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  const top10=Object.entries(vm).map(([n,v])=>({n,zone:v.zone,cat:v.cat,avgD:avg(v.dens),topFlag:v.flags.sort((a,b)=>ord[b]-ord[a])[0]})).filter(v=>ord[v.topFlag]>=2).sort((a,b)=>ord[b.topFlag]-ord[a.topFlag]||b.avgD-a.avgD).slice(0,10);
  const html=`<!DOCTYPE html><html><head><title>Situation Report - ${now}</title>
  <style>body{font-family:Arial,sans-serif;padding:30px;color:#111;}h1{color:#cc0000;}h2{color:#333;border-bottom:2px solid #cc0000;padding-bottom:5px;}table{width:100%;border-collapse:collapse;margin-top:10px;}th{background:#cc0000;color:#fff;padding:8px 12px;text-align:left;}td{padding:7px 12px;border-bottom:1px solid #ddd;}.critical{color:#cc0000;font-weight:700;}.high{color:#cc6600;font-weight:700;}.footer{margin-top:30px;font-size:11px;color:#888;border-top:1px solid #ddd;padding-top:10px;}</style></head>
  <body>
  <h1>🚨 BENTE ANALYTICS — SITUATION REPORT</h1>
  <p><strong>Public Safety Intelligence Platform</strong><br/>Generated: ${now}<br/>Authorized Law Enforcement Use Only</p>
  <h2>OPERATIONAL SUMMARY</h2>
  <table><tr><td><strong>Critical Venues</strong></td><td class="critical">${critV} venues requiring immediate response</td></tr>
  <tr><td><strong>High Risk Venues</strong></td><td class="high">${highV} venues requiring monitoring</td></tr>
  <tr><td><strong>Active Patrol Zones</strong></td><td>${zones.size} zones with active incidents</td></tr>
  <tr><td><strong>Total Records</strong></td><td>${allData.length.toLocaleString()} check-ins · 300 venues monitored</td></tr></table>
  <h2>TOP 10 PRIORITY VENUES</h2>
  <table><tr><th>#</th><th>Venue</th><th>Category</th><th>Zone</th><th>Risk Level</th><th>Crowd Level</th><th>Officer Action</th></tr>
  ${top10.map((v,i)=>`<tr><td>${i+1}</td><td>${v.n}</td><td>${v.cat}</td><td>${v.zone}</td><td class="${v.topFlag.toLowerCase()}">${v.topFlag}</td><td>${v.avgD>=85?'OVERCROWDED':v.avgD>=70?'VERY BUSY':v.avgD>=50?'BUSY':'MODERATE'}</td><td>${{'CRITICAL':'Immediate Response','HIGH':'Monitor Closely','ELEVATED':'Routine Patrol','NORMAL':'No Action'}[v.topFlag]}</td></tr>`).join('')}
  </table>
  <div class="footer">Bente Analytics · Public Safety Intelligence · ${now}</div>
  </body></html>`;
  const blob=new Blob([html],{type:'text/html'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`SituationReport_${new Date().toISOString().slice(0,10)}.html`;
  a.click();closeSettings();
}

function exportPresenceLog(){
  const headers=['Check-in ID','User ID','Venue','Category','Timestamp','Risk Level','Crowd Level','Day','Hour','Zone','Activity','Officer Action'];
  const rows=allData.map(d=>[d.checkin_id,d.user_id,d.venue_name,d.venue_category,d.timestamp,d.incident_flag,d.crowd_density>=85?'OVERCROWDED':d.crowd_density>=70?'VERY BUSY':d.crowd_density>=50?'BUSY':'MODERATE',d.day_of_week,d.hour_of_day,d.patrol_zone,d.activity_type,d.officer_action]);
  const csv=[headers,...rows].map(r=>r.map(val=>'"'+String(val)+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=`PresenceLog_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();closeSettings();
}
/* ════════ WELCOME PAGE ════════ */
function renderWelcome(){
  // Clock
  const updateClock=()=>{
    const now=new Date();
    set('welcome-clock',now.toLocaleTimeString('en-US',{hour12:false}));
    set('welcome-date',now.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'}));
    const h=now.getHours();
    if(h>=6&&h<12){set('welcome-shift','Morning Shift');set('welcome-shift-sub','06:00 — 14:00');}
    else if(h>=12&&h<18){set('welcome-shift','Afternoon Shift');set('welcome-shift-sub','14:00 — 22:00');}
    else if(h>=18&&h<24){set('welcome-shift','Evening Shift — ⚠ Peak Activity');set('welcome-shift-sub','22:00 — 06:00');document.getElementById('welcome-shift').style.color='#ff3355';}
    else{set('welcome-shift','Night Shift');set('welcome-shift-sub','22:00 — 06:00');}
  };
  updateClock();setInterval(updateClock,1000);

  // Operational summary
  const critV=new Set(allData.filter(d=>d.incident_flag==='CRITICAL').map(d=>d.venue_name)).size;
  const highV=new Set(allData.filter(d=>d.incident_flag==='HIGH').map(d=>d.venue_name)).size;
  const zm={};allData.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0};if(d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH')zm[d.patrol_zone].crit++;});
  const topZone=Object.entries(zm).sort((a,b)=>b[1].crit-a[1].crit)[0];

  const sumEl=document.getElementById('welcome-summary');
  if(sumEl)sumEl.innerHTML=`
    <div style="text-align:center;padding:12px;background:rgba(255,0,51,.08);border:1px solid rgba(255,0,51,.2);border-radius:8px;">
      <div style="font-family:var(--disp);font-size:32px;font-weight:700;color:#ff0033;">${critV}</div>
      <div style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--t2);margin-top:4px;">Critical Venues</div>
      <div style="font-size:10px;color:var(--t3);">Immediate Response</div>
    </div>
    <div style="text-align:center;padding:12px;background:rgba(255,51,85,.06);border:1px solid rgba(255,51,85,.2);border-radius:8px;">
      <div style="font-family:var(--disp);font-size:32px;font-weight:700;color:#ff3355;">${highV}</div>
      <div style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--t2);margin-top:4px;">High Risk Venues</div>
      <div style="font-size:10px;color:var(--t3);">Monitor Closely</div>
    </div>
    <div style="text-align:center;padding:12px;background:rgba(255,170,0,.06);border:1px solid rgba(255,170,0,.2);border-radius:8px;">
      <div style="font-family:var(--disp);font-size:20px;font-weight:700;color:#ffaa00;">${topZone?topZone[0].split('—')[0].trim():'—'}</div>
      <div style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--t2);margin-top:4px;">Highest Risk Zone</div>
      <div style="font-size:10px;color:var(--t3);">${topZone?topZone[1].crit+' critical events':''}</div>
    </div>`;

  const recEl=document.getElementById('welcome-recommendation');
  if(recEl)recEl.innerHTML=`<span style="color:var(--cyan);font-weight:700;">Recommended Action:</span> Review Situation Report for ${critV} critical venues requiring immediate response. Deploy additional patrol resources to ${topZone?topZone[0].split('—')[0].trim():'active zones'} between 9PM and 11PM. Check Live Heatmap for current hotspot locations.`;
}

/* ════════ EVENTS MONITORING ════════ */
function resetEvents(){['ev-county','ev-city','ev-zone','ev-cat','ev-risk'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});renderEvents();}

function renderEvents(){
  // Populate dropdowns
  const countyEl=document.getElementById('ev-county');
  if(countyEl&&countyEl.options.length<=1)[...new Set(allData.map(d=>d.county))].sort().forEach(c=>countyEl.add(new Option(c,c)));
  const cityEl=document.getElementById('ev-city');
  if(cityEl&&cityEl.options.length<=1)[...new Set(allData.map(d=>d.city))].sort().forEach(c=>cityEl.add(new Option(c,c)));
  const zoneEl=document.getElementById('ev-zone');
  if(zoneEl&&zoneEl.options.length<=1)[...new Set(allData.map(d=>d.patrol_zone))].sort().forEach(z=>zoneEl.add(new Option(z,z)));
  const catEl=document.getElementById('ev-cat');
  if(catEl&&catEl.options.length<=1)[...new Set(allData.map(d=>d.event_category))].sort().forEach(c=>catEl.add(new Option(c,c)));

  const county=v('ev-county'),city=v('ev-city'),zone=v('ev-zone'),cat=v('ev-cat'),risk=v('ev-risk');
  const data=allData.filter(d=>{
    if(county&&d.county!==county)return false;
    if(city&&d.city!==city)return false;
    if(zone&&d.patrol_zone!==zone)return false;
    if(cat&&d.event_category!==cat)return false;
    if(risk&&d.event_risk_level!==risk)return false;
    return true;
  });

  // KPIs
  const evKpi=document.getElementById('ev-kpis');
  if(evKpi){
    const highRisk=data.filter(d=>d.event_risk_level==='HIGH').length;
    const largeEvents=data.filter(d=>d.event_size==='Large').length;
    const uniqueVenues=new Set(data.map(d=>d.venue_name)).size;
    const uniqueEvents=new Set(data.map(d=>d.event_name)).size;
    evKpi.innerHTML=`
      <div class="kpi" style="--kc:#ff0033;--kb:rgba(255,0,51,.1)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">High Risk Events</div><div class="kpi-val" style="color:#ff0033;">${highRisk.toLocaleString()}</div><div class="kpi-sub">Require officer monitoring</div></div></div>
      <div class="kpi" style="--kc:#ffaa00;--kb:rgba(255,170,0,.1)"><div class="kpi-ico">📅</div><div><div class="kpi-lbl">Large Events</div><div class="kpi-val" style="color:#ffaa00;">${largeEvents.toLocaleString()}</div><div class="kpi-sub">High attendance expected</div></div></div>
      <div class="kpi" style="--kc:#00c8ff;--kb:rgba(0,200,255,.1)"><div class="kpi-ico">🏢</div><div><div class="kpi-lbl">Venues with Events</div><div class="kpi-val">${uniqueVenues.toLocaleString()}</div><div class="kpi-sub">${data.length.toLocaleString()} total records</div></div></div>
      <div class="kpi" style="--kc:#00ff88;--kb:rgba(0,255,136,.1)"><div class="kpi-ico">🎭</div><div><div class="kpi-lbl">Event Types</div><div class="kpi-val" style="color:#00ff88;">${uniqueEvents.toLocaleString()}</div><div class="kpi-sub">Active event categories</div></div></div>`;
  }

  // Table
  const sorted=[...data].sort((a,b)=>{const o={'High':0,'Medium':1,'Low':2,'Minimal':3};return(o[a.event_risk_level]||3)-(o[b.event_risk_level]||3)||b.crowd_density-a.crowd_density;}).slice(0,50);
  set('ev-count',sorted.length+' events shown');
  const riskCol={'High':'#ff0033','Medium':'#ff3355','Low':'#ffaa00','Minimal':'#00ff88'};
  const clLabel=d=>d.crowd_density>=85?'OVERCROWDED':d.crowd_density>=70?'VERY BUSY':d.crowd_density>=50?'BUSY':'MODERATE';
  document.getElementById('ev-tbody').innerHTML=sorted.map(d=>`<tr>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-weight:600;">${d.event_name}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.event_category}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);">${d.venue_name}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.city}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:#9b59ff;font-size:11px;">${d.patrol_zone.split('—')[0].trim()}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.event_size}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:monospace;font-size:11px;">${d.event_start_time}–${d.event_end_time}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-weight:700;color:${FLAG_COL[d.incident_flag]};">${clLabel(d)}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:${riskCol[d.event_risk_level]}22;color:${riskCol[d.event_risk_level]};">${d.event_risk_level}</span></td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:${FLAG_COL[d.incident_flag]};font-size:11px;font-weight:600;">${d.officer_action}</td>
    <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);">
      <span style="font-size:10px;color:var(--cyan);cursor:pointer;margin-right:8px;" onclick="focusVenueOnMap('${d.venue_name.replace(/'/g,"\\'")}')">🗺 Map</span>
      <span style="font-size:10px;color:#ff3355;cursor:pointer;" onclick="goInvestigate('${d.venue_name.replace(/'/g,"\\'")}')">⊘ Investigate</span>
    </td>
  </tr>`).join('');
}

/* ════════ AI AGENT ════════ */
function submitAI(){const q=document.getElementById('ai-input')?.value?.trim();if(!q)return;askAI(q);document.getElementById('ai-input').value='';}
function clearAI(){const el=document.getElementById('ai-messages');if(el)el.innerHTML='<div class="ai-msg ai-msg-system"><div style="font-size:20px;margin-bottom:8px;">🤖</div><div style="font-size:13px;">Conversation cleared. Ask me anything, Officer Martinez.</div></div>';}

function askAI(question){
  const el=document.getElementById('ai-messages');if(!el)return;
  // Add user message
  const uDiv=document.createElement('div');uDiv.className='ai-msg ai-msg-user';
  uDiv.innerHTML=`<div style="font-size:12px;color:var(--t3);margin-bottom:4px;">Officer Martinez</div><div style="font-size:13px;">${question}</div>`;
  el.appendChild(uDiv);

  // Generate response
  setTimeout(()=>{
    const response=generateAIResponse(question.toLowerCase());
    const rDiv=document.createElement('div');rDiv.className='ai-msg ai-msg-response';
    rDiv.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;"><span style="font-size:16px;">🤖</span><span style="font-family:var(--mono);font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--cyan);">Operational Assistant</span></div>${response}`;
    el.appendChild(rDiv);
    el.scrollTop=el.scrollHeight;
  },400);
  el.scrollTop=el.scrollHeight;
}

function generateAIResponse(q){
  const critVenues=allData.filter(d=>d.incident_flag==='CRITICAL');
  const highVenues=allData.filter(d=>d.incident_flag==='HIGH');
  const zm={};allData.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0,high:0};if(d.incident_flag==='CRITICAL')zm[d.patrol_zone].crit++;if(d.incident_flag==='HIGH')zm[d.patrol_zone].high++;});
  const topZone=Object.entries(zm).sort((a,b)=>b[1].crit-a[1].crit)[0];
  const topCritVenues=[...new Set(critVenues.map(d=>d.venue_name))].slice(0,3);
  const topHighVenues=[...new Set(highVenues.map(d=>d.venue_name))].slice(0,3);
  const hcnt={};allData.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];

  // Pattern matching
  if(q.includes('attention')||q.includes('tonight')||q.includes('locations')||q.includes('need')){
    return `<div style="font-size:13px;line-height:1.8;">
      <div style="font-weight:700;color:#ff0033;margin-bottom:8px;">🚨 Locations Requiring Immediate Attention</div>
      <div style="margin-bottom:6px;"><span style="color:#ff0033;font-weight:700;">Critical:</span> ${topCritVenues.join(', ')}</div>
      <div style="margin-bottom:12px;"><span style="color:#ff3355;font-weight:700;">High Risk:</span> ${topHighVenues.join(', ')}</div>
      <div style="padding:10px 12px;background:rgba(0,200,255,.06);border-left:3px solid var(--cyan);border-radius:4px;font-size:12px;">
        <span style="color:var(--cyan);font-weight:700;">Recommended Action:</span> Deploy additional patrol resources to ${topZone?topZone[0].split('—')[0].trim():'active zones'} between ${pkH?fmtH(+pkH[0]):'9PM'} and ${pkH?fmtH((+pkH[0]+2)%24):'11PM'}.
      </div>
    </div>`;
  }

  if(q.includes('zone')||q.includes('patrol')){
    const zoneList=Object.entries(zm).sort((a,b)=>b[1].crit-a[1].crit).slice(0,3);
    return `<div style="font-size:13px;line-height:1.8;">
      <div style="font-weight:700;color:#ffaa00;margin-bottom:8px;">📍 Patrol Zone Assessment</div>
      ${zoneList.map(([zone,stats],i)=>`<div style="display:flex;justify-content:space-between;padding:6px 10px;background:var(--bg3);border-radius:5px;margin-bottom:5px;"><span>${i===0?'🔴':'🟠'} ${zone.split('—')[0].trim()}</span><span style="color:${i===0?'#ff0033':'#ff3355'};font-weight:700;">${stats.crit} critical · ${stats.high} high</span></div>`).join('')}
      <div style="margin-top:10px;padding:10px 12px;background:rgba(0,200,255,.06);border-left:3px solid var(--cyan);border-radius:4px;font-size:12px;">
        <span style="color:var(--cyan);font-weight:700;">Recommended Action:</span> Assign additional patrol coverage to ${topZone?topZone[0].split('—')[0].trim():'Zone B'} immediately.
      </div>
    </div>`;
  }

  if(q.includes('event')||q.includes('crowd')||q.includes('density')||q.includes('driving')){
    const evData=allData.filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH');
    const evCounts={};evData.forEach(d=>{evCounts[d.event_name]=(evCounts[d.event_name]||0)+1;});
    const topEvents=Object.entries(evCounts).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const catCounts={};evData.forEach(d=>{catCounts[d.event_category]=(catCounts[d.event_category]||0)+1;});
    const topCat=Object.entries(catCounts).sort((a,b)=>b[1]-a[1])[0];
    return `<div style="font-size:13px;line-height:1.8;">
      <div style="font-weight:700;color:#ffaa00;margin-bottom:8px;">🎭 Events Driving Crowd Activity</div>
      <div style="margin-bottom:8px;">Top events contributing to elevated crowd conditions:</div>
      ${topEvents.map(([name,cnt])=>`<div style="padding:5px 10px;background:var(--bg3);border-radius:5px;margin-bottom:4px;display:flex;justify-content:space-between;"><span>${name}</span><span style="color:#ffaa00;">${cnt} incidents</span></div>`).join('')}
      <div style="margin-top:10px;padding:10px 12px;background:rgba(0,200,255,.06);border-left:3px solid var(--cyan);border-radius:4px;font-size:12px;">
        <span style="color:var(--cyan);font-weight:700;">Recommended Action:</span> ${topCat?topCat[0]+' events':'Nightlife events'} are the primary driver. Increase monitoring at ${topCritVenues[0]||'high-risk venues'} during peak attendance periods.
      </div>
    </div>`;
  }

  // County-specific query — "I work for Hudson County, what's the peak hour..."
  const countyMatch = q.match(/([a-z]+)\s+county/i);
  if(countyMatch || q.includes('hudson')||q.includes('jersey')||q.includes('bergen')||q.includes('essex')){
    const allCounties=[...new Set(allData.map(d=>d.county))];
    const targetCounty=countyMatch
      ? allCounties.find(c=>c.toLowerCase().startsWith(countyMatch[1].toLowerCase()))
      : allCounties.find(c=>c.toLowerCase().includes('hudson'))||allCounties[0];
    const cd=allData.filter(d=>d.county===targetCounty);
    const cVm={};cd.forEach(d=>{if(!cVm[d.venue_name])cVm[d.venue_name]=[];cVm[d.venue_name].push(d.incident_flag);});
    const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
    const cVenues=Object.entries(cVm).map(([n,flags])=>({n,topFlag:flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL'}));
    const critV=cVenues.filter(v=>v.topFlag==='CRITICAL');
    const highV=cVenues.filter(v=>v.topFlag==='HIGH');
    const chm={};cd.forEach(d=>{chm[d.hour_of_day]=(chm[d.hour_of_day]||0)+1;});
    const cPk=Object.entries(chm).sort((a,b)=>b[1]-a[1])[0];
    const czm={};cd.forEach(d=>{if(!czm[d.patrol_zone])czm[d.patrol_zone]={crit:0,high:0};if(d.incident_flag==='CRITICAL')czm[d.patrol_zone].crit++;if(d.incident_flag==='HIGH')czm[d.patrol_zone].high++;});
    const cTopZone=Object.entries(czm).sort((a,b)=>b[1].crit-a[1].crit)[0];
    return `<div style="font-size:13px;line-height:1.8;">
      <div style="font-weight:700;color:#00c8ff;margin-bottom:8px;">📍 ${targetCounty} — Operational Summary</div>
      <div style="margin-bottom:6px;">Peak Hour: <span style="color:#ff0033;font-weight:700;">${cPk?fmtH(+cPk[0]):'10PM'}</span> (${cPk?cPk[1]:0} check-ins recorded)</div>
      <div style="margin-bottom:6px;"><span style="color:#ff0033;font-weight:700;">Critical Venues:</span> ${critV.length}</div>
      <div style="margin-bottom:6px;"><span style="color:#ff3355;font-weight:700;">High-Risk Venues:</span> ${highV.length}</div>
      <div style="margin-bottom:12px;">Highest concentration of critical activity: <span style="color:#9b59ff;font-weight:700;">${cTopZone?cTopZone[0]:'Zone D — Waterfront'}</span></div>
      <div style="padding:10px 12px;background:rgba(0,200,255,.06);border-left:3px solid var(--cyan);border-radius:4px;font-size:12px;">
        <span style="color:var(--cyan);font-weight:700;">Recommended Action:</span> Deploy additional patrol resources to ${cTopZone?cTopZone[0]:'Zone D — Waterfront'} before ${cPk?fmtH(+cPk[0]):'10PM'}. Focus on Bar/Lounge and Nightclub venues during peak hours.
      </div>
    </div>`;
  }


  // Default response
  return `<div style="font-size:13px;line-height:1.8;">
    <div style="font-weight:700;color:var(--t1);margin-bottom:8px;">Operational Status</div>
    <div style="margin-bottom:10px;">Here is the current city-wide situation:</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="padding:8px 12px;background:rgba(255,0,51,.08);border-radius:6px;"><div style="font-size:20px;font-weight:700;color:#ff0033;">${new Set(critVenues.map(d=>d.venue_name)).size}</div><div style="font-size:10px;color:var(--t2);">Critical Venues</div></div>
      <div style="padding:8px 12px;background:rgba(255,51,85,.06);border-radius:6px;"><div style="font-size:20px;font-weight:700;color:#ff3355;">${new Set(highVenues.map(d=>d.venue_name)).size}</div><div style="font-size:10px;color:var(--t2);">High Risk Venues</div></div>
    </div>
    <div style="padding:10px 12px;background:rgba(0,200,255,.06);border-left:3px solid var(--cyan);border-radius:4px;font-size:12px;">
      <span style="color:var(--cyan);font-weight:700;">Recommended Action:</span> Review Situation Report for current priority venues. Try asking: "What locations need attention?" or "Which zone needs officers?"
    </div>
  </div>`;
}

/* ════════ UPDATE showPage for new pages ════════ */
const _origShowPage=showPage;


/* ════════ AI OPERATIONAL ASSISTANT ════════ */
const OFFICER_NAME = 'Officer Martinez'; // Easy to update

function initAiAgent(){
  const msgs = document.getElementById('ai-messages');
  if(!msgs || msgs.children.length > 0) return;
  addAiMessage('bot', `Good evening, ${OFFICER_NAME}. I have access to the full operational dataset — 12,000 check-ins across 300 venues in Hudson County, New Jersey.<br/><br/>How can I assist with your deployment tonight?`);
}

function addAiMessage(type, text){
  const msgs = document.getElementById('ai-messages');
  if(!msgs) return;
  const div = document.createElement('div');
  div.className = type === 'user' ? 'ai-msg-user' : 'ai-msg-bot';
  const avatar = type === 'user'
    ? `<div class="ai-user-avatar">OM</div>`
    : `<div class="ai-avatar">🤖</div>`;
  const bubble = type === 'user'
    ? `<div class="ai-bubble-user">${text}</div>`
    : `<div class="ai-bubble-bot"><div style="font-family:var(--mono);font-size:9px;color:var(--cyan);margin-bottom:6px;letter-spacing:.06em;">AI OPERATIONAL ASSISTANT</div>${text}</div>`;
  div.innerHTML = type === 'user' ? bubble + avatar : avatar + bubble;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function sendAiMessage(){
  const input = document.getElementById('ai-input');
  if(!input || !input.value.trim()) return;
  const q = input.value.trim();
  input.value = '';
  addAiMessage('user', q);
  setTimeout(() => addAiMessage('bot', processAiQuery(q)), 500);
}

function askSuggestion(el){
  const q = el.textContent;
  const input = document.getElementById('ai-input');
  if(input) input.value = q;
  sendAiMessage();
}

function clearAI(){
  const msgs = document.getElementById('ai-messages');
  if(msgs) msgs.innerHTML = '';
  initAiAgent();
}

function processAiQuery(q){
  const ql = q.toLowerCase();
  const d = allData;
  const ord = {'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};

  // Build venue summaries
  const vm = {};
  d.forEach(r => {
    if(!vm[r.venue_name]) vm[r.venue_name] = {zone:r.patrol_zone, city:r.city, cat:r.venue_category, flags:[], dens:[], events:[]};
    vm[r.venue_name].flags.push(r.incident_flag);
    vm[r.venue_name].dens.push(r.crowd_density);
    vm[r.venue_name].events.push(r.event_name);
  });
  const venues = Object.entries(vm).map(([n,v]) => ({
    n, zone:v.zone, city:v.city, cat:v.cat,
    avgD: avg(v.dens),
    topFlag: v.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL',
    topEvent: v.events[0]||''
  })).sort((a,b) => ord[b.topFlag]-ord[a.topFlag] || b.avgD-a.avgD);

  // Zone summaries
  const zm = {};
  d.forEach(r => {
    if(!zm[r.patrol_zone]) zm[r.patrol_zone] = {crit:0, high:0, total:0};
    zm[r.patrol_zone].total++;
    if(r.incident_flag==='CRITICAL') zm[r.patrol_zone].crit++;
    if(r.incident_flag==='HIGH') zm[r.patrol_zone].high++;
  });
  const topZone = Object.entries(zm).sort((a,b)=>b[1].crit-a[1].crit)[0];

  // Peak hour
  const hm = {};
  d.forEach(r => { hm[r.hour_of_day] = (hm[r.hour_of_day]||0)+1; });
  const pkH = Object.entries(hm).sort((a,b)=>b[1]-a[1])[0];

  // ── Query matching ──

  // Critical venues / attention tonight
  if(ql.includes('critical') || ql.includes('attention') || ql.includes('tonight') || ql.includes('locations')) {
    const crit = venues.filter(v=>v.topFlag==='CRITICAL').slice(0,5);
    const topZ = topZone ? topZone[0].replace(' — ',' — ') : 'Unknown';
    return `<b>Venues Requiring Immediate Attention</b><br/><br/>
<b style="color:#ff0033;">🚨 Critical:</b><br/>${crit.map(v=>`• ${v.n} — ${v.zone.split('—')[0].trim()} (${v.city})`).join('<br/>')}<br/><br/>
<b>Recommended Action:</b><br/>Deploy additional patrol resources to <b style="color:#ff3355;">${topZ.split('—')[0].trim()}</b> between <b>${pkH?fmtH(+pkH[0]):'9PM'}</b> and <b>${pkH?fmtH((+pkH[0]+2)%24):'11PM'}</b>.`;
  }

  // Patrol zone
  if(ql.includes('zone') || ql.includes('patrol') || ql.includes('deploy')) {
    const topZ = topZone ? topZone[0] : 'Zone A';
    const zName = topZ.split('—')[0].trim();
    const zStats = topZone ? topZone[1] : {crit:0,high:0};
    return `<b>Patrol Zone Analysis</b><br/><br/>
<b style="color:#ff0033;">${zName}</b> currently has the highest concentration of Critical venues.<br/><br/>
• Critical events: <b style="color:#ff0033;">${zStats.crit}</b><br/>
• High-risk events: <b style="color:#ff3355;">${zStats.high}</b><br/><br/>
<b>Recommended Action:</b><br/>Assign additional patrol coverage to <b>${zName}</b> between <b>${pkH?fmtH(+pkH[0]):'9PM'}</b> and <b>${pkH?fmtH((+pkH[0]+2)%24):'11PM'}</b>.`;
  }

  // Events / crowd drivers
  if(ql.includes('event') || ql.includes('crowd') || ql.includes('density') || ql.includes('driving')) {
    const cm = {};
    d.forEach(r => { if(!cm[r.event_category]) cm[r.event_category]={crit:0,total:0}; cm[r.event_category].total++; if(r.incident_flag==='CRITICAL') cm[r.event_category].crit++; });
    const topCat = Object.entries(cm).sort((a,b)=>b[1].crit-a[1].crit)[0];
    const topEvVenues = venues.filter(v=>v.cat==='Nightclub'||v.cat==='Bar/Lounge'||v.cat==='Sports Bar').slice(0,3);
    return `<b>Crowd Density Drivers</b><br/><br/>
<b style="color:#ffaa00;">${topCat?topCat[0]:'Nightlife'} events</b> are the primary driver of elevated crowd conditions.<br/><br/>
Top contributing venues:<br/>${topEvVenues.map(v=>`• <b>${v.n}</b> — ${v.topEvent} (${v.zone.split('—')[0].trim()})`).join('<br/>')}<br/><br/>
<b>Recommended Action:</b><br/>Increase monitoring at Nightclub and Bar/Lounge venues during peak attendance periods.`;
  }

  // Peak risk window
  if(ql.includes('peak') || ql.includes('window') || ql.includes('time') || ql.includes('when')) {
    return `<b>Peak Risk Window</b><br/><br/>
Highest foot traffic expected between <b style="color:#ff0033;">${pkH?fmtH(+pkH[0]):'9PM'}</b> and <b style="color:#ff0033;">${pkH?fmtH((+pkH[0]+2)%24):'11PM'}</b>.<br/><br/>
• ${pkH?pkH[1]:0} check-ins recorded during peak hour<br/>
• Nightclubs and Bars/Lounges are highest risk<br/>
• Zone B has highest concentration of incidents<br/><br/>
<b>Recommended Action:</b><br/>Deploy officers to priority venues before <b>${pkH?fmtH(+pkH[0]):'9PM'}</b>.`;
  }

  // Specific zone query e.g. "Zone B"
  const zoneMatch = q.match(/Zone\s+([A-J])/i);
  if(zoneMatch) {
    const zKey = `Zone ${zoneMatch[1].toUpperCase()}`;
    const zVenues = venues.filter(v=>v.zone.startsWith(zKey)).slice(0,5);
    const zFull = Object.keys(zm).find(z=>z.startsWith(zKey)) || zKey;
    const zStats = zm[zFull] || {crit:0,high:0};
    return `<b>${zFull} — Operational Summary</b><br/><br/>
Critical venues: <b style="color:#ff0033;">${zStats.crit}</b><br/>
High-risk venues: <b style="color:#ff3355;">${zStats.high}</b><br/><br/>
<b>Top venues in ${zKey}:</b><br/>${zVenues.map(v=>`• <b>${v.n}</b> — <span style="color:${FLAG_COL[v.topFlag]}">${v.topFlag}</span>`).join('<br/>')}<br/><br/>
<b>Recommended Action:</b><br/>${zStats.crit>5?'Deploy immediate response resources to this zone.':zStats.high>10?'Monitor closely — elevated activity detected.':'Routine patrol sufficient for current conditions.'}`;
  }

  // Venue specific
  const venueMatch = venues.find(v=>v.n.toLowerCase().includes(ql.split(' ').filter(w=>w.length>3)[0]||''));
  if(venueMatch) {
    const vRecs = d.filter(r=>r.venue_name===venueMatch.n);
    const uniqUsers = new Set(vRecs.map(r=>r.user_id)).size;
    return `<b>${venueMatch.n} — Intelligence Report</b><br/><br/>
Zone: <b style="color:#9b59ff;">${venueMatch.zone}</b><br/>
City: <b>${venueMatch.city}</b><br/>
Risk Level: <b style="color:${FLAG_COL[venueMatch.topFlag]}">${venueMatch.topFlag}</b><br/>
Avg Crowd Level: <b>${venueMatch.avgD.toFixed(0)}%</b><br/>
People on record: <b style="color:#00c8ff;">${uniqUsers} individuals</b><br/>
Active event: <b>${venueMatch.topEvent}</b><br/><br/>
<b>Recommended Action:</b><br/>${{'CRITICAL':'Immediate Response — deploy officers now.','HIGH':'Monitor Closely — increase patrol frequency.','ELEVATED':'Routine Patrol — standard monitoring.','NORMAL':'No Action Required.'}[venueMatch.topFlag]}`;
  }

  // Default
  const topCrit = venues.filter(v=>v.topFlag==='CRITICAL').slice(0,3);
  return `<b>Operational Overview — Hudson County</b><br/><br/>
Current status: <b style="color:#ff0033;">${venues.filter(v=>v.topFlag==='CRITICAL').length} Critical</b> · <b style="color:#ff3355;">${venues.filter(v=>v.topFlag==='HIGH').length} High Risk</b> venues<br/><br/>
<b>Top priority venues:</b><br/>${topCrit.map(v=>`• <b>${v.n}</b> — ${v.zone.split('—')[0].trim()}`).join('<br/>')}<br/><br/>
<b>Recommended Action:</b><br/>Review Situation Report for full operational picture. Deploy resources to ${topZone?topZone[0].split('—')[0].trim():'Zone B'} between ${pkH?fmtH(+pkH[0]):'9PM'} and ${pkH?fmtH((+pkH[0]+2)%24):'11PM'}.`;
}
