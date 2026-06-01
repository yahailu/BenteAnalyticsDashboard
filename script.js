/* BENTE ANALYTICS — script.js */
'use strict';

let allData=[], filteredMon=[];
let mapInstance=null, heatLayer=null, markerLayer=null;
let CH={}, ICH={};

/* ─── BOOT ─── */
document.addEventListener('DOMContentLoaded',()=>{
  allData = RAW_DATA.map(r=>({...r}));
  filteredMon = [...allData];
  populateDropdowns();
  document.getElementById('nav-count').textContent = allData.length.toLocaleString()+' RECORDS';
  document.getElementById('sb-time').textContent   = new Date().toLocaleString('en-US',{month:'short',day:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  document.getElementById('hs-records').textContent= allData.length.toLocaleString();
  document.getElementById('hs-venues').textContent = new Set(allData.map(d=>d.venue_name)).size;
  document.getElementById('hs-cats').textContent   = new Set(allData.map(d=>d.venue_category)).size;
  showPage('home');
});

/* ─── NAVIGATION ─── */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(s=>s.classList.remove('active'));

  const pg = document.getElementById('page-'+name);
  if(pg) pg.classList.add('active');

  const nt = document.getElementById('nt-'+name);
  if(nt) nt.classList.add('active');

  const sbMap={home:'sb-home',monitoring:'sb-monitoring',forecasting:'sb-activity',investigation:'sb-investigation'};
  const sb = document.getElementById(sbMap[name]||'sb-home');
  if(sb) sb.classList.add('active');

  if(name==='monitoring')    setTimeout(initMonitoring, 60);
  if(name==='forecasting')   renderForecasting();
  if(name==='investigation') initInvestigation();
}

/* ─── DROPDOWNS ─── */
function populateDropdowns(){
  const cats    = [...new Set(allData.map(d=>d.venue_category))].sort();
  const weathers= [...new Set(allData.map(d=>d.weather_condition))].sort();
  const venues  = [...new Set(allData.map(d=>d.venue_name))].sort();
  const hours   = [...new Set(allData.map(d=>d.hour_of_day))].sort((a,b)=>a-b);

  addOpts('f-cat',cats); addOpts('f-weather',weathers);
  addOpts('fc-cat',cats);
  addOpts('inv-venue',venues); addOpts('inv-weather',weathers);
  hours.forEach(h=>{
    ['inv-hour'].forEach(id=>document.getElementById(id)?.add(new Option(fmtH(h),h)));
  });
}
function addOpts(id,vals){ const el=document.getElementById(id); if(el) vals.forEach(v=>el.add(new Option(v,v))); }

/* ══════════ MONITORING ══════════ */
function initMonitoring(){ initMap(); renderMonitoring(); }

function applyMonFilters(){
  const cat=v('f-cat'),weather=v('f-weather'),date=v('f-date'),hr=v('f-hrange');
  filteredMon = allData.filter(d=>{
    if(cat     && d.venue_category!==cat)         return false;
    if(weather && d.weather_condition!==weather)  return false;
    if(date==='weekend' && !d.is_weekend)         return false;
    if(date==='weekday' && d.is_weekend)          return false;
    if(hr==='morning'   && !(d.hour_of_day>=6  &&d.hour_of_day<12)) return false;
    if(hr==='afternoon' && !(d.hour_of_day>=12 &&d.hour_of_day<18)) return false;
    if(hr==='evening'   && !(d.hour_of_day>=18 &&d.hour_of_day<24)) return false;
    if(hr==='latenight' && !(d.hour_of_day>=0  &&d.hour_of_day<6))  return false;
    return true;
  });
  renderMonitoring();
}
function resetMonFilters(){
  ['f-cat','f-weather','f-date','f-hrange'].forEach(id=>{ const el=document.getElementById(id);if(el)el.value=''; });
  filteredMon=[...allData]; renderMonitoring();
}

function renderMonitoring(){
  const d=filteredMon;
  renderMonKPIs(d); updateMap(d); renderVenueList(d);
  renderDensityTime(d); renderPeakList(d,'peak-list');
  renderDonut(d); renderAlerts(d);
}

function renderMonKPIs(data){
  const users=new Set(data.map(d=>d.user_id)).size;
  const venues=new Set(data.map(d=>d.venue_name)).size;
  const avgD=data.length?avg(data.map(d=>d.crowd_density)).toFixed(1):0;
  const hcnt={};
  data.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  set('kpi-users',users.toLocaleString());
  set('kpi-venues',venues);
  set('kpi-density',avgD);
  set('kpi-peak',pk?fmtH(+pk[0]):'—');
  set('kpi-users-sub',data.length.toLocaleString()+' check-in events');
  set('kpi-density-sub','across '+data.length+' records');
  set('kpi-peak-sub',pk?pk[1]+' check-ins':'no data');
}

function renderDensityTime(data){
  const hm={};
  for(let h=0;h<24;h++) hm[h]=[];
  data.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h));
  const vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null);
  let pkIdx=0,pkVal=0;
  vals.forEach((v,i)=>{if(v&&v>pkVal){pkVal=v;pkIdx=i;}});
  destroyC('dt');
  const ctx=document.getElementById('ch-density-time').getContext('2d');
  CH.dt=new Chart(ctx,{
    type:'line',
    data:{labels,datasets:[{label:'Crowd Density',data:vals,
      borderColor:'#06b6d4',
      backgroundColor:grad(ctx,'rgba(6,182,212,.3)','rgba(6,182,212,.01)'),
      fill:true,tension:.45,
      pointRadius:vals.map((_,i)=>i===pkIdx?7:2),
      pointBackgroundColor:vals.map((_,i)=>i===pkIdx?'#ef4444':'#06b6d4'),
      pointBorderColor:vals.map((_,i)=>i===pkIdx?'#fff':'#06b6d4'),
      pointBorderWidth:vals.map((_,i)=>i===pkIdx?2:0),
      borderWidth:2.5,spanGaps:true}]},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{
        title:items=>'Hour: '+items[0].label,
        label:ctx=>[' Avg Density: '+ctx.parsed.y,' Check-ins: '+(hm[ctx.dataIndex]?.length||0)]
      }}},
      scales:{x:sx(),y:sy('Density',0,105)}}
  });
}

function renderVenueList(data){
  const vm={};
  data.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,dens:[],count:0};
    vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].count++;
  });
  const sorted=Object.entries(vm).map(([n,v])=>({n,cat:v.cat,avgD:avg(v.dens),count:v.count})).sort((a,b)=>b.avgD-a.avgD);
  const maxD=sorted[0]?.avgD||1;
  const el=document.getElementById('venue-list');
  el.innerHTML='';
  sorted.forEach((v,i)=>{
    const col=dc(v.avgD),pct=(v.avgD/maxD*100).toFixed(0);
    const row=document.createElement('div'); row.className='venue-row';
    row.innerHTML=`
      <div style="font-size:11px;font-family:monospace;color:var(--t3);width:16px;">${i+1}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.n}</div>
        <div style="font-size:10px;color:var(--t3);">${v.cat} · ${v.count} check-ins</div>
      </div>
      <div style="flex:1;height:4px;background:var(--bg);border-radius:2px;overflow:hidden;max-width:60px;">
        <div style="width:${pct}%;height:100%;background:${col};border-radius:2px;"></div>
      </div>
      <div style="font-size:12px;font-weight:700;font-family:monospace;color:${col};width:28px;text-align:right;">${v.avgD.toFixed(0)}</div>`;
    el.appendChild(row);
  });
}

function renderPeakList(data,elId){
  const hm={};
  for(let h=0;h<24;h++) hm[h]={count:0,dens:[]};
  data.forEach(d=>{hm[d.hour_of_day].count++;hm[d.hour_of_day].dens.push(d.crowd_density);});
  const ranked=Object.entries(hm).map(([h,v])=>({h:+h,count:v.count,avgD:v.dens.length?avg(v.dens):0}))
    .filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
  const maxC=ranked[0]?.count||1;
  const el=document.getElementById(elId); el.innerHTML='';
  ranked.forEach(({h,count,avgD})=>{
    const pct=(count/maxC*100).toFixed(0);
    const row=document.createElement('div'); row.className='peak-row';
    row.innerHTML=`
      <div style="font-family:monospace;font-size:11px;color:var(--t2);width:44px;flex-shrink:0;">${fmtH(h)}</div>
      <div class="peak-bg"><div class="peak-fill" style="width:${pct}%;">
        <span style="font-size:10px;font-weight:600;color:rgba(255,255,255,.9);font-family:monospace;">${count}</span>
      </div></div>
      <div style="font-family:monospace;font-size:11px;color:${dc(avgD)};font-weight:700;width:36px;text-align:right;">${avgD.toFixed(1)}</div>`;
    el.appendChild(row);
  });
}

function renderDonut(data){
  const hi=data.filter(d=>d.crowd_density>=70).length;
  const md=data.filter(d=>d.crowd_density>=40&&d.crowd_density<70).length;
  const lo=data.filter(d=>d.crowd_density<40).length;
  const tot=data.length||1;
  destroyC('donut');
  const ctx=document.getElementById('ch-donut').getContext('2d');
  CH.donut=new Chart(ctx,{type:'doughnut',
    data:{labels:['High (70-100)','Medium (40-69)','Low (0-39)'],datasets:[{data:[hi,md,lo],backgroundColor:['#ef4444','#f59e0b','#10b981'],borderColor:'rgba(10,15,30,.8)',borderWidth:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',
      plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}
  });
  document.getElementById('donut-stats').innerHTML=`
    ${dRow('#ef4444','High (70–100)',hi,tot)}${dRow('#f59e0b','Medium (40–69)',md,tot)}${dRow('#10b981','Low (0–39)',lo,tot)}
    <div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bdr);display:flex;justify-content:space-between;font-size:11px;">
      <span style="color:var(--t3);">Total</span><span style="color:var(--t2);font-family:monospace;">${tot.toLocaleString()}</span>
    </div>`;
}
function dRow(c,l,v,tot){return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
  <div style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;"></div>
  <div style="flex:1;font-size:12px;color:var(--t2);">${l}</div>
  <div style="font-size:13px;font-weight:700;color:${c};font-family:monospace;">${(v/tot*100).toFixed(0)}%</div>
</div>`;}

function renderAlerts(data){
  const vm={};
  data.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={dens:[],hourly:{}};
    vm[d.venue_name].dens.push(d.crowd_density);
    if(!vm[d.venue_name].hourly[d.hour_of_day])vm[d.venue_name].hourly[d.hour_of_day]=[];
    vm[d.venue_name].hourly[d.hour_of_day].push(d.crowd_density);
  });
  const alerts=[];
  Object.entries(vm).forEach(([name,v])=>{
    const pkH=Object.entries(v.hourly).sort((a,b)=>avg(b[1])-avg(a[1]))[0];
    const pkD=pkH?avg(pkH[1]):0;
    if(pkD>=80)alerts.push({icon:'⚠',title:'High Crowd Density',meta:name+' · '+fmtH(+pkH[0]),val:'Density: '+Math.round(pkD),col:'var(--red)'});
    else if(avg(v.dens)>=65)alerts.push({icon:'⬡',title:'Elevated Activity',meta:name,val:'+'+Math.round(avg(v.dens)-50)+'% above avg',col:'var(--amber)'});
  });
  const maxD=data.reduce((mx,d)=>d.crowd_density>mx.crowd_density?d:mx,data[0]||{crowd_density:0,venue_name:'—',day_of_week:'—'});
  if(maxD?.venue_name)alerts.push({icon:'ℹ',title:'Unusual Activity',meta:maxD.venue_name+' · '+maxD.day_of_week,val:'Monitor',col:'var(--bluel)'});
  const el=document.getElementById('alert-list'); el.innerHTML='';
  set('alert-count',Math.min(alerts.length,3));
  alerts.slice(0,3).forEach(a=>{
    const div=document.createElement('div'); div.className='alert-item';
    div.innerHTML=`<div style="font-size:16px;flex-shrink:0;">${a.icon}</div>
      <div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;">${a.title}</div><div style="font-size:11px;color:var(--t3);">${a.meta}</div></div>
      <div style="font-size:11px;font-weight:700;font-family:monospace;color:${a.col};">${a.val}</div>`;
    el.appendChild(div);
  });
}

/* ─── MAP ─── */
function initMap(){
  if(mapInstance) return;
  mapInstance=L.map('map',{center:[40.712,-74.005],zoom:13});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(mapInstance);
  markerLayer=L.layerGroup().addTo(mapInstance);
}
function updateMap(data){
  if(!mapInstance) return;
  if(heatLayer) mapInstance.removeLayer(heatLayer);
  markerLayer?.clearLayers();
  if(!data.length) return;
  const vm={};
  data.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,lat:d.latitude,lon:d.longitude,dens:[],dwell:[],count:0};
    vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].dwell.push(d.avg_dwell_minutes);vm[d.venue_name].count++;
  });
  const venues=Object.values(vm), maxD=Math.max(...venues.map(v=>avg(v.dens)));
  const hpts=[];
  venues.forEach(v=>{const a=avg(v.dens)/100;for(let i=0;i<Math.ceil(a*30);i++)hpts.push([v.lat+(Math.random()-.5)*.0022,v.lon+(Math.random()-.5)*.0022,a]);});
  heatLayer=L.heatLayer(hpts,{radius:40,blur:30,maxZoom:17,gradient:{0:'#060c1a',.25:'#1a3a6b',.5:'#3b82f6',.75:'#f59e0b',1:'#ef4444'}}).addTo(mapInstance);
  venues.forEach(v=>{
    const ad=avg(v.dens),adw=avg(v.dwell).toFixed(0),r=10+(ad/maxD)*18,col=dc(ad);
    const m=L.circleMarker([v.lat,v.lon],{radius:r,color:col,fillColor:col,fillOpacity:.5,weight:2});
    m.bindPopup(`<div style="min-width:200px;font-family:sans-serif;">
      <div style="font-size:15px;font-weight:700;color:#f1f5f9;margin-bottom:3px;">${v.name||v.cat}</div>
      <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;">${v.cat}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">
        <div><div style="font-size:8px;color:#4b5563;text-transform:uppercase;">Avg Density</div><div style="font-size:20px;font-weight:700;color:${col};">${ad.toFixed(0)}</div></div>
        <div><div style="font-size:8px;color:#4b5563;text-transform:uppercase;">Dwell</div><div style="font-size:20px;font-weight:700;color:#06b6d4;">${adw}m</div></div>
        <div><div style="font-size:8px;color:#4b5563;text-transform:uppercase;">Check-ins</div><div style="font-size:20px;font-weight:700;color:#3b82f6;">${v.count}</div></div>
      </div>
      <div style="margin-top:8px;height:5px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;">
        <div style="width:${ad}%;height:100%;background:linear-gradient(90deg,#3b82f6,${col});border-radius:3px;"></div>
      </div></div>`);
    m.addTo(markerLayer);
  });
}

/* ══════════ FORECASTING ══════════ */
function renderForecasting(){
  const cat=v('fc-cat'),wknd=v('fc-weekend');
  const data=allData.filter(d=>{
    if(cat&&d.venue_category!==cat)return false;
    if(wknd!==''&&d.is_weekend!==+wknd)return false;
    return true;
  });
  renderFcKPIs(data);renderHMMatrix(data);renderFcHourly(data);
  renderFcWknd(data);renderPeakList(data,'fc-peak-list');
  renderFcWeather(data);renderFcForecast(data);renderFcCards(data);
}

function renderFcKPIs(data){
  const el=document.getElementById('fc-kpis');
  const avgD=data.length?avg(data.map(d=>d.crowd_density)).toFixed(1):0;
  const wkdD=avg(data.filter(d=>!d.is_weekend).map(d=>d.crowd_density)).toFixed(1);
  const wkdD2=avg(data.filter(d=>d.is_weekend).map(d=>d.crowd_density)).toFixed(1);
  const hcnt={};data.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  el.innerHTML=`
    <div class="kpi" style="--kc:#3b82f6;--kb:rgba(59,130,246,.1)"><div class="kpi-ico">📊</div><div><div class="kpi-lbl">Avg Crowd Density</div><div class="kpi-val">${avgD}</div><div class="kpi-sub">${data.length} records in view</div></div></div>
    <div class="kpi" style="--kc:#10b981;--kb:rgba(16,185,129,.1)"><div class="kpi-ico">📅</div><div><div class="kpi-lbl">Weekday Avg Density</div><div class="kpi-val">${wkdD}</div><div class="kpi-sub">Mon–Fri patterns</div></div></div>
    <div class="kpi" style="--kc:#f59e0b;--kb:rgba(245,158,11,.1)"><div class="kpi-ico">🌆</div><div><div class="kpi-lbl">Weekend Avg Density</div><div class="kpi-val">${wkdD2}</div><div class="kpi-sub" style="color:${+wkdD2>+wkdD?'#10b981':'#ef4444'}">${+wkdD2>+wkdD?'↑':'↓'} vs weekday</div></div></div>
    <div class="kpi" style="--kc:#ef4444;--kb:rgba(239,68,68,.1)"><div class="kpi-ico">🕐</div><div><div class="kpi-lbl">Peak Activity Hour</div><div class="kpi-val">${pk?fmtH(+pk[0]):'—'}</div><div class="kpi-sub">highest check-in volume</div></div></div>`;
}

function renderHMMatrix(data){
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hours=Array.from({length:24},(_,i)=>i);
  const mat={};
  days.forEach(d=>{mat[d]={};hours.forEach(h=>mat[d][h]==[]);});
  // fix: proper init
  days.forEach(d=>{mat[d]={};hours.forEach(h=>{mat[d][h]=[];});});
  data.forEach(d=>{if(mat[d.day_of_week]&&mat[d.day_of_week][d.hour_of_day]!==undefined)mat[d.day_of_week][d.hour_of_day].push(d.crowd_density);});
  let maxV=0;
  days.forEach(dy=>hours.forEach(h=>{const a=mat[dy][h];if(a.length)maxV=Math.max(maxV,avg(a));}));
  const tbl=document.getElementById('hm-matrix');
  let html='<thead><tr><th class="rl"></th>';
  hours.forEach(h=>{html+=h%3===0?`<th style="padding:3px 4px;font-size:9px;font-family:monospace;color:var(--t3);text-align:center;">${fmtH(h)}</th>`:'<th></th>';});
  html+='</tr></thead><tbody>';
  days.forEach(dy=>{
    html+=`<tr><td class="rl">${dy.slice(0,3)}</td>`;
    hours.forEach(h=>{
      const arr=mat[dy][h],val=arr.length?avg(arr):0,norm=maxV?val/maxV:0,bg=hmC(norm),lbl=arr.length?val.toFixed(0):'';
      html+=`<td class="hm-cell" style="background:${bg};" title="${dy} ${fmtH(h)}: ${arr.length} check-ins, avg ${val.toFixed(1)}">${lbl}</td>`;
    });
    html+='</tr>';
  });
  html+='</tbody>';
  tbl.innerHTML=html;
}

function renderFcHourly(data){
  const hm={};for(let h=0;h<24;h++)hm[h]=[];
  data.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h));
  const vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null);
  const cnts=Array.from({length:24},(_,h)=>hm[h].length);
  destroyC('fcH');
  const ctx=document.getElementById('ch-fc-hourly').getContext('2d');
  CH.fcH=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Avg Density',data:vals,
    borderColor:'#06b6d4',backgroundColor:grad(ctx,'rgba(6,182,212,.25)','rgba(6,182,212,.01)'),
    fill:true,tension:.45,pointRadius:4,pointBackgroundColor:'#06b6d4',pointHoverRadius:7,borderWidth:2.5,spanGaps:true}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>[' Avg Density: '+ctx.parsed.y,' Check-ins: '+cnts[ctx.dataIndex]]}}},
      scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderFcWknd(data){
  const wd=data.filter(d=>!d.is_weekend),we=data.filter(d=>d.is_weekend);
  const hours=Array.from({length:24},(_,i)=>i);
  const wdV=hours.map(h=>{const a=wd.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  const weV=hours.map(h=>{const a=we.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  destroyC('fcW');
  const ctx=document.getElementById('ch-fc-wknd').getContext('2d');
  CH.fcW=new Chart(ctx,{type:'line',data:{labels:hours.map(h=>fmtH(h)),datasets:[
    {label:'Weekday',data:wdV,borderColor:'#3b82f6',backgroundColor:'rgba(59,130,246,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,pointBackgroundColor:'#3b82f6',spanGaps:true},
    {label:'Weekend',data:weV,borderColor:'#ef4444',backgroundColor:'rgba(239,68,68,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,pointBackgroundColor:'#ef4444',spanGaps:true}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#94a3b8',font:{family:'Inter',size:10},boxWidth:8}},tooltip:{...tt()}},
      scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderFcWeather(data){
  const wm={};
  data.forEach(d=>{if(!wm[d.weather_condition])wm[d.weather_condition]={dens:[],cnt:0};wm[d.weather_condition].dens.push(d.crowd_density);wm[d.weather_condition].cnt++;});
  const labels=Object.keys(wm);
  const avgV=labels.map(l=>+avg(wm[l].dens).toFixed(1));
  const cntV=labels.map(l=>wm[l].cnt);
  const cols=['#3b82f6','#f59e0b','#10b981','#ef4444'];
  destroyC('fcWe');
  const ctx=document.getElementById('ch-fc-weather').getContext('2d');
  CH.fcWe=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Avg Density',data:avgV,backgroundColor:cols.slice(0,labels.length).map(c=>c+'99'),borderColor:cols.slice(0,labels.length),borderWidth:1.5,borderRadius:5,borderSkipped:false,yAxisID:'y'},
    {label:'Check-ins',data:cntV,type:'line',borderColor:'rgba(255,255,255,.3)',backgroundColor:'transparent',borderDash:[4,3],pointRadius:4,pointBackgroundColor:'#fff',borderWidth:1.5,yAxisID:'y2'}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#94a3b8',font:{family:'Inter',size:10},boxWidth:8}},tooltip:{...tt()}},
      scales:{x:sx(),y:sy('Avg Density',0,105),y2:{position:'right',grid:{display:false},ticks:{color:'#4b5563',font:{family:'monospace',size:9}}}}}});
}

function renderFcForecast(data){
  const now=new Date(),ch=now.getHours();
  const hc={},hd={};for(let h=0;h<24;h++){hc[h]=0;hd[h]=[];}
  data.forEach(d=>{hc[d.hour_of_day]++;hd[d.hour_of_day].push(d.crowd_density);});
  const maxC=Math.max(...Object.values(hc),1);
  const fHours=Array.from({length:24},(_,i)=>(ch+i)%24);
  const base=fHours.map(h=>+(hc[h]/maxC*100).toFixed(1));
  const proj=base.map((val,i)=>Math.max(3,Math.min(100,+(val+Math.sin(i*.7)*5+(Math.random()*6-3)).toFixed(1))));
  destroyC('fcF');
  const ctx=document.getElementById('ch-fc-forecast').getContext('2d');
  CH.fcF=new Chart(ctx,{type:'line',data:{labels:fHours.map(h=>fmtH(h)),datasets:[
    {label:'Historical Baseline',data:base,borderColor:'rgba(59,130,246,.45)',backgroundColor:'transparent',borderDash:[5,4],fill:false,tension:.4,pointRadius:2,borderWidth:1.5},
    {label:'Projected Index',data:proj,borderColor:'#10b981',backgroundColor:grad(ctx,'rgba(16,185,129,.2)','rgba(16,185,129,.01)'),fill:true,tension:.4,pointRadius:3,pointBackgroundColor:'#10b981',pointHoverRadius:7,borderWidth:2.5}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#94a3b8',font:{family:'Inter',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y}%`}}},
      scales:{x:sx(),y:sy('Activity Index (%)',0,115)}}});
}

function renderFcCards(data){
  const venues=[...new Set(data.map(d=>d.venue_name))];
  const grid=document.getElementById('fc-venue-cards');grid.innerHTML='';
  venues.forEach(vn=>{
    const vd=data.filter(d=>d.venue_name===vn);
    const pk=vd.filter(d=>d.hour_of_day>=18&&d.hour_of_day<=23);
    const off=vd.filter(d=>d.hour_of_day>=6&&d.hour_of_day<=11);
    const pkD=pk.length?avg(pk.map(d=>d.crowd_density)):avg(vd.map(d=>d.crowd_density));
    const offD=off.length?avg(off.map(d=>d.crowd_density)):pkD;
    const proj=+(pkD*(0.92+Math.random()*.16)).toFixed(1);
    const delta=proj-offD;
    const tc=delta>3?'trend-up':delta<-3?'trend-down':'trend-flat';
    const tl=delta>3?`↑ +${delta.toFixed(1)}`:delta<-3?`↓ ${delta.toFixed(1)}`:`→ Stable`;
    const col=dc(proj);
    const div=document.createElement('div');div.className='fc-card';
    div.innerHTML=`<div style="font-size:9px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--t3);margin-bottom:6px;">${vn}</div>
      <div style="font-size:26px;font-weight:700;line-height:1;color:${col};margin-bottom:3px;">${proj}</div>
      <div style="font-size:10px;color:var(--t3);margin-bottom:6px;">Peak density (18–23h)</div>
      <span style="font-size:10px;font-weight:600;font-family:monospace;padding:2px 8px;border-radius:100px;${delta>3?'background:rgba(239,68,68,.12);color:#ef4444':delta<-3?'background:rgba(16,185,129,.1);color:#10b981':'background:rgba(59,130,246,.1);color:#60a5fa'}">${tl}</span>
      <div style="margin-top:8px;height:3px;background:var(--bg);border-radius:2px;overflow:hidden;"><div style="width:${proj}%;height:100%;background:linear-gradient(90deg,#3b82f6,${col});border-radius:2px;"></div></div>`;
    grid.appendChild(div);
  });
}

/* ══════════ INVESTIGATION ══════════ */
function initInvestigation(){
  // Populate dropdowns only once
  const pop=(id,vals)=>{const el=document.getElementById(id);if(el&&el.options.length<=1)vals.forEach(v=>el.add(new Option(v,v)));};
  pop('inv-venue',[...new Set(allData.map(d=>d.venue_name))].sort());
  pop('inv-weather',[...new Set(allData.map(d=>d.weather_condition))].sort());
  const ih=document.getElementById('inv-hour');
  if(ih&&ih.options.length<=1)[...new Set(allData.map(d=>d.hour_of_day))].sort((a,b)=>a-b).forEach(h=>ih.add(new Option(fmtH(h),h)));
  // Always show ready state, hide results
  show('inv-ready',true); show('inv-results',false);
  show('inv-noresults',false);
  set('inv-count','');
  document.getElementById('inv-risk-wrap').innerHTML='';
}

function runInvestigation(){
  const venue=v('inv-venue'),day=v('inv-day'),weather=v('inv-weather');
  const hourRaw=document.getElementById('inv-hour')?.value;
  const hour=(hourRaw!==''&&hourRaw!=null)?+hourRaw:null;

  // ── Exact match ──
  const exact=allData.filter(d=>{
    if(venue&&d.venue_name!==venue)return false;
    if(day&&d.day_of_week!==day)return false;
    if(hour!==null&&d.hour_of_day!==hour)return false;
    if(weather&&d.weather_condition!==weather)return false;
    return true;
  });

  if(exact.length){
    set('inv-count',exact.length.toLocaleString()+' exact records');
    show('inv-ready',false); show('inv-results',true); show('inv-noresults',false);
    document.getElementById('inv-fallback-section')&&(document.getElementById('inv-fallback-section').style.display='none');
    renderInvAll(exact,{venue,day,hour,weather,fallback:false});
    return;
  }

  // ── No exact match — build smart fallback ──
  set('inv-count','0 exact · showing related activity');
  show('inv-ready',false); show('inv-noresults',false);
  show('inv-results',true);

  // Score every record by how many filters it satisfies
  const scored=allData.map(d=>{
    let score=0;
    if(venue&&d.venue_name===venue)score+=3;
    if(day&&d.day_of_week===day)score+=2;
    if(hour!==null&&Math.abs(d.hour_of_day-hour)<=2)score+=2; // ±2h window
    if(weather&&d.weather_condition===weather)score+=1;
    // bonus for same category as selected venue
    if(venue){
      const cat=allData.find(x=>x.venue_name===venue)?.venue_category;
      if(cat&&d.venue_category===cat)score+=1;
    }
    return{...d,_score:score};
  }).filter(d=>d._score>0).sort((a,b)=>b._score-a._score);

  // Top fallback records (up to 80)
  const fallback=scored.slice(0,80);

  // Nearby venue activity: records from same category, different venues
  const cat=venue?allData.find(x=>x.venue_name===venue)?.venue_category:null;
  const nearbyVenues=cat
    ? [...new Set(allData.filter(d=>d.venue_category===cat&&d.venue_name!==venue).map(d=>d.venue_name))]
    : [...new Set(allData.map(d=>d.venue_name))].filter(n=>n!==venue).slice(0,5);

  renderInvAll(fallback,{venue,day,hour,weather,fallback:true,nearbyVenues,originalFilters:{venue,day,hour,weather}});
}

function resetInvestigation(){
  ['inv-venue','inv-day','inv-hour','inv-weather'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  set('inv-count','');
  show('inv-ready',true); show('inv-results',false); show('inv-noresults',false);
  const fs=document.getElementById('inv-fallback-section'); if(fs)fs.style.display='none';
  document.getElementById('inv-risk-wrap').innerHTML='';
  destroyC('ivH');destroyC('ivDD');destroyC('ivDw');destroyC('ivTL');destroyC('ivNearby');
}

function renderInvAll(results,filters){
  renderInvKPIs(results,filters);
  renderInvSummary(results,filters);
  renderInvInsights(results,filters);
  renderInvHourChart(results);
  renderInvDensDonut(results);
  renderInvDwellDonut(results);
  renderInvTimeline(results);
  renderInvTable(results,filters);
  // Fallback extras
  const fs=document.getElementById('inv-fallback-section');
  if(filters.fallback&&fs){
    fs.style.display='block';
    renderInvFallbackBanner(filters);
    renderNearbyActivity(filters);
    renderRecentPatterns(results,filters);
  } else if(fs){
    fs.style.display='none';
  }
}

function renderInvKPIs(results,filters={}){  const isFallback=filters.fallback||false;
  const el=document.getElementById('inv-kpi-row');
  const uniqU=new Set(results.map(d=>d.user_id)).size;
  const uniqV=new Set(results.map(d=>d.venue_name)).size;
  const avgD=avg(results.map(d=>d.crowd_density)).toFixed(1);
  const avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const hiD=results.filter(d=>d.crowd_density>=70).length;
  const risk=hiD/results.length>.4?'HIGH':hiD/results.length>.15?'MEDIUM':'LOW';
  const riskCol=risk==='HIGH'?'#ef4444':risk==='MEDIUM'?'#f59e0b':'#10b981';
  document.getElementById('inv-risk-wrap').innerHTML=`<span class="risk-badge risk-${risk.toLowerCase()}">${risk==='HIGH'?'⚠':risk==='MEDIUM'?'⬡':'✓'} ${risk} RISK</span>`;
  el.innerHTML=`
    <div class="kpi" style="--kc:#3b82f6;--kb:rgba(59,130,246,.1)"><div class="kpi-ico">👥</div><div><div class="kpi-lbl">${isFallback?'Users in Related Activity':'Unique Users Present'}</div><div class="kpi-val" style="color:#3b82f6;">${uniqU.toLocaleString()}</div><div class="kpi-sub">${results.length.toLocaleString()} ${isFallback?'related':'total'} check-ins</div></div></div>
    <div class="kpi" style="--kc:${dc(+avgD)};--kb:rgba(59,130,246,.1)"><div class="kpi-ico">⚡</div><div><div class="kpi-lbl">Avg Crowd Density</div><div class="kpi-val" style="color:${dc(+avgD)};">${avgD}</div><div class="kpi-sub">${hiD} high-density events</div></div></div>
    <div class="kpi" style="--kc:#06b6d4;--kb:rgba(6,182,212,.1)"><div class="kpi-ico">⏱</div><div><div class="kpi-lbl">Avg Dwell Time</div><div class="kpi-val" style="color:#06b6d4;">${avgDw}<span style="font-size:16px;">m</span></div><div class="kpi-sub">per check-in</div></div></div>
    <div class="kpi" style="--kc:${riskCol};--kb:rgba(16,185,129,.1)"><div class="kpi-ico">📍</div><div><div class="kpi-lbl">${isFallback?'Related Venues':'Venues Covered'}</div><div class="kpi-val" style="color:#10b981;">${uniqV}</div><div class="kpi-sub">${[...new Set(results.map(d=>d.venue_category))].length} categories</div></div></div>`;
}

function renderInvSummary(results,filters){
  const el=document.getElementById('inv-summary');
  const riskEl=document.getElementById('inv-risk-inner');
  const uniqU=new Set(results.map(d=>d.user_id)).size;
  const uniqV=new Set(results.map(d=>d.venue_name)).size;
  const avgD=avg(results.map(d=>d.crowd_density)).toFixed(1);
  const avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const hiD=results.filter(d=>d.crowd_density>=70).length;
  const venueList=[...new Set(results.map(d=>d.venue_name))].join(', ');
  const hcnt={};results.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  const wm={};results.forEach(d=>{wm[d.weather_condition]=(wm[d.weather_condition]||0)+1;});
  const topW=Object.entries(wm).sort((a,b)=>b[1]-a[1])[0];
  const hourAvgs={};
  Object.entries(hcnt).forEach(([h])=>{const arr=results.filter(d=>d.hour_of_day===+h).map(d=>d.crowd_density);hourAvgs[h]=avg(arr);});
  const spikes=Object.entries(hourAvgs).filter(([,val])=>val>=75).map(([h])=>fmtH(+h));
  const risk=hiD/results.length>.4?'HIGH':hiD/results.length>.15?'MEDIUM':'LOW';
  if(riskEl)riskEl.innerHTML=`<span class="risk-badge risk-${risk.toLowerCase()}" style="font-size:10px;">${risk==='HIGH'?'⚠':risk==='MEDIUM'?'⬡':'✓'} ${risk}</span>`;
  const fdesc=[
    filters.venue?`Venue: <strong>${filters.venue}</strong>`:null,
    filters.day?`Day: <strong>${filters.day}</strong>`:null,
    filters.hour!==null?`Hour: <strong>${fmtH(filters.hour)}</strong>`:null,
    filters.weather?`Weather: <strong>${filters.weather}</strong>`:null,
  ].filter(Boolean).join(' · ')||'All records (no filters applied)';
  el.innerHTML=`
    <div style="font-size:10px;color:var(--t3);font-family:monospace;padding:6px 10px;background:rgba(255,255,255,.03);border-radius:4px;margin-bottom:12px;">${fdesc}</div>
    <div style="font-size:12.5px;line-height:1.8;color:var(--t2);">
      <strong style="color:var(--t1);">Who was present:</strong>
      <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${uniqU} unique users</span> across
      <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${results.length} check-ins</span>
      at <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${uniqV} venue(s)</span><br/>
      <span style="font-size:11px;color:var(--t3);">${venueList}</span><br/><br/>
      <strong style="color:var(--t1);">Crowd conditions:</strong>
      Avg density <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${avgD}</span> ·
      Avg dwell <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${avgDw} min</span> ·
      <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(239,68,68,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#ef4444;margin:0 2px;">${hiD} high-density (≥70)</span><br/><br/>
      <strong style="color:var(--t1);">Peak window:</strong>
      <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${pkH?fmtH(+pkH[0]):'—'}</span>
      with ${pkH?pkH[1]:0} check-ins · Weather: <span style="display:inline-flex;align-items:center;padding:1px 9px;background:rgba(59,130,246,.1);border-radius:100px;font-family:monospace;font-size:11px;color:#60a5fa;margin:0 2px;">${topW?.[0]??'—'}</span>
    </div>
    ${spikes.length>0
      ?`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-top:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:6px;"><span>⚠</span><span style="color:#ef4444;font-size:12px;font-weight:600;">Crowd spikes at: ${spikes.join(', ')} — elevated monitoring recommended.</span></div>`
      :`<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;margin-top:10px;background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.18);border-radius:6px;"><span>✓</span><span style="color:#10b981;font-size:12px;">Crowd density within normal parameters for this period.</span></div>`}`;
}

function renderInvInsights(results,filters={}){
  const el=document.getElementById('inv-insights');
  const uniqU=new Set(results.map(d=>d.user_id)).size;
  const hiD=results.filter(d=>d.crowd_density>=70).length;
  const vm={};results.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={dens:[],cat:d.venue_category};vm[d.venue_name].dens.push(d.crowd_density);});
  const topV=Object.entries(vm).sort((a,b)=>avg(b[1].dens)-avg(a[1].dens))[0];
  const hcnt={};results.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  const wknd=results.filter(d=>d.is_weekend).length,wkdy=results.filter(d=>!d.is_weekend).length;
  const avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const glDw=avg(allData.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const dd=+(+avgDw-+glDw).toFixed(0);
  const ins=[
    {ic:'👥',lbl:'User Concentration',val:`${uniqU} users · ${(uniqU/results.length*100).toFixed(0)}% unique rate`,badge:uniqU>50?'High':'Normal',bc:uniqU>50?'#f59e0b':'#10b981'},
    {ic:'🔴',lbl:'High-Risk Events',val:`${hiD} of ${results.length} check-ins above density 70`,badge:`${(hiD/results.length*100).toFixed(0)}%`,bc:hiD/results.length>.3?'#ef4444':'#f59e0b'},
    {ic:'📍',lbl:'Hottest Venue',val:topV?`${topV[0]} — avg ${avg(topV[1].dens).toFixed(0)}`:'—',badge:topV?.[1]?.cat||'',bc:'#3b82f6'},
    {ic:'🕐',lbl:'Peak Window',val:pkH?`${fmtH(+pkH[0])} — ${pkH[1]} check-ins`:'—',badge:'Peak',bc:'#8b5cf6'},
    {ic:'📅',lbl:'Weekend vs Weekday',val:`${wknd} weekend · ${wkdy} weekday`,badge:wknd>wkdy?'Wknd Heavy':'Wkdy Heavy',bc:wknd>wkdy?'#ef4444':'#3b82f6'},
    {ic:'⏱',lbl:'Dwell vs Dataset Avg',val:`${avgDw}m avg (dataset: ${glDw}m)`,badge:(dd>0?'+':'')+dd+'m',bc:dd>10?'#f59e0b':dd<-10?'#10b981':'#94a3b8'},
  ];
  el.innerHTML=ins.map(i=>`<div class="inv-insight-item">
    <div style="font-size:14px;flex-shrink:0;">${i.ic}</div>
    <div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:var(--t1);">${i.lbl}</div><div style="font-size:11px;color:var(--t2);">${i.val}</div></div>
    <div style="font-size:11px;font-weight:700;font-family:monospace;color:${i.bc};flex-shrink:0;">${i.badge}</div>
  </div>`).join('');
}

function renderInvHourChart(data){
  const hm={};for(let h=0;h<24;h++)hm[h]={cnt:0,dens:[]};
  data.forEach(d=>{hm[d.hour_of_day].cnt++;hm[d.hour_of_day].dens.push(d.crowd_density);});
  const labels=Array.from({length:24},(_,h)=>fmtH(h));
  const cnts=Array.from({length:24},(_,h)=>hm[h].cnt);
  const dens=Array.from({length:24},(_,h)=>hm[h].dens.length?+avg(hm[h].dens).toFixed(1):0);
  const maxC=Math.max(...cnts,1);
  const top3=cnts.map((c,h)=>({h,c})).sort((a,b)=>b.c-a.c).filter(x=>x.c>0).slice(0,3).map(x=>fmtH(x.h));
  set('inv-hour-sub',top3.length?'Busiest: '+top3.join(', '):'');
  destroyC('ivH');
  const ctx=document.getElementById('inv-ch-hour').getContext('2d');
  ICH.ivH=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Check-ins',data:cnts,backgroundColor:cnts.map(val=>{const r=val/maxC;return r>.7?'rgba(239,68,68,.8)':r>.4?'rgba(245,158,11,.75)':val>0?'rgba(59,130,246,.65)':'rgba(59,130,246,.1)';}),borderRadius:3,borderSkipped:false,yAxisID:'y'},
    {label:'Avg Density',data:dens,type:'line',borderColor:'#06b6d4',backgroundColor:'transparent',borderWidth:2,pointRadius:3,pointBackgroundColor:'#06b6d4',tension:.4,yAxisID:'y2'}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#94a3b8',font:{family:'Inter',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{label:ctx=>ctx.datasetIndex===0?` ${ctx.parsed.y} check-ins`:` Avg density: ${ctx.parsed.y}`}}},
      scales:{x:sx(),y:{...sy('Check-ins'),position:'left'},y2:{position:'right',grid:{display:false},ticks:{color:'#4b5563',font:{family:'monospace',size:9}},min:0,max:105}}}});
}

function renderInvDensDonut(data){
  const hi=data.filter(d=>d.crowd_density>=70).length;
  const md=data.filter(d=>d.crowd_density>=40&&d.crowd_density<70).length;
  const lo=data.filter(d=>d.crowd_density<40).length;
  const tot=data.length||1,cols=['#ef4444','#f59e0b','#10b981'];
  destroyC('ivDD');
  const ctx=document.getElementById('inv-ch-dens-donut').getContext('2d');
  ICH.ivDD=new Chart(ctx,{type:'doughnut',data:{labels:['High (≥70)','Medium (40–69)','Low (<40)'],datasets:[{data:[hi,md,lo],backgroundColor:cols,borderColor:'rgba(10,15,30,.8)',borderWidth:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('inv-dens-legend').innerHTML=[{l:'High',v:hi,c:'#ef4444'},{l:'Med',v:md,c:'#f59e0b'},{l:'Low',v:lo,c:'#10b981'}]
    .map(x=>`<div style="display:flex;align-items:center;gap:4px;font-size:10px;"><div style="width:7px;height:7px;border-radius:50%;background:${x.c};"></div><span style="color:var(--t3);">${x.l}</span><span style="color:${x.c};font-weight:700;font-family:monospace;">${(x.v/tot*100).toFixed(0)}%</span></div>`).join('');
}

function renderInvDwellDonut(data){
  const b={'<30m':0,'30–60m':0,'60–90m':0,'90–120m':0,'>120m':0};
  data.forEach(d=>{const dw=d.avg_dwell_minutes;if(dw<30)b['<30m']++;else if(dw<60)b['30–60m']++;else if(dw<90)b['60–90m']++;else if(dw<120)b['90–120m']++;else b['>120m']++;});
  const cols=['#3b82f6','#06b6d4','#f59e0b','#ef4444','#8b5cf6'],tot=data.length||1;
  destroyC('ivDw');
  const ctx=document.getElementById('inv-ch-dwell').getContext('2d');
  ICH.ivDw=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(b),datasets:[{data:Object.values(b),backgroundColor:cols,borderColor:'rgba(10,15,30,.8)',borderWidth:3}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('inv-dwell-legend').innerHTML=Object.keys(b).map((lbl,i)=>`<div style="display:flex;align-items:center;gap:4px;font-size:10px;"><div style="width:7px;height:7px;border-radius:50%;background:${cols[i]};"></div><span style="color:var(--t3);">${lbl}</span><span style="color:${cols[i]};font-weight:700;font-family:monospace;">${(b[lbl]/tot*100).toFixed(0)}%</span></div>`).join('');
}

function renderInvTimeline(data){
  const sorted=[...data].sort((a,b)=>a.timestamp<b.timestamp?-1:1);
  const labels=sorted.map(d=>d.timestamp.slice(0,10));
  const vals=sorted.map(d=>d.crowd_density);
  destroyC('ivTL');
  const ctx=document.getElementById('inv-ch-timeline').getContext('2d');
  ICH.ivTL=new Chart(ctx,{type:'line',data:{labels,datasets:[
    {label:'Crowd Density',data:vals,borderColor:'#3b82f6',backgroundColor:grad(ctx,'rgba(59,130,246,.2)','rgba(59,130,246,.01)'),fill:true,tension:.35,borderWidth:1.5,
      pointRadius:vals.map(val=>val>=75?5:0),pointBackgroundColor:vals.map(val=>val>=75?'#ef4444':'#3b82f6'),pointBorderColor:'#fff',pointBorderWidth:1.5},
    {label:'Spike Threshold (75)',data:Array(vals.length).fill(75),borderColor:'rgba(239,68,68,.4)',borderDash:[5,4],borderWidth:1,pointRadius:0,fill:false}]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{display:true,labels:{color:'#94a3b8',font:{family:'Inter',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{
        title:items=>`${sorted[items[0].dataIndex]?.venue_name} — Record ${items[0].dataIndex+1}`,
        label:ctx=>ctx.datasetIndex===0?[` Density: ${ctx.parsed.y}`,` User: ${sorted[ctx.dataIndex]?.user_id}`,` Time: ${sorted[ctx.dataIndex]?.timestamp}`]:` Threshold: ${ctx.parsed.y}`}}},
      scales:{x:{display:false},y:sy('Density',0,105)}}});
}

function renderInvTable(results,filters={}){  const isFallback=filters.fallback||false;
  set('inv-table-count',isFallback?'('+results.length.toLocaleString()+' closest matches)':'('+results.length.toLocaleString()+' records)');
  const ft=document.getElementById('inv-fallback-tag'); if(ft) ft.style.display=isFallback?'inline':'none';
  document.getElementById('inv-tbody').innerHTML=results.map(d=>{
    const dp=d.crowd_density>=70?'dp-high':d.crowd_density>=40?'dp-med':'dp-low';
    const spike=d.crowd_density>=75;
    return `<tr style="${spike?'background:rgba(239,68,68,.04);':''}">
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:monospace;font-size:10px;color:var(--t3);">${d.checkin_id}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:monospace;color:#60a5fa;font-weight:600;">${d.user_id}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-weight:600;">${d.venue_name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:var(--t2);">${d.venue_category}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:monospace;font-size:11px;">${d.timestamp}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);"><span class="${dp}">${d.crowd_density}${spike?' ⚑':''}</span></td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:monospace;">${d.avg_dwell_minutes}m</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:var(--t2);">${d.day_of_week}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);font-family:monospace;color:var(--t3);">${fmtH(d.hour_of_day)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.04);color:var(--t2);">${d.weather_condition}</td>
    </tr>`;
  }).join('');
}


/* ══════════ INVESTIGATION FALLBACK ══════════ */

function renderInvFallbackBanner(filters){
  const el=document.getElementById('inv-fallback-banner');
  if(!el) return;
  const {venue,day,hour,weather}=filters.originalFilters||{};
  const parts=[];
  if(venue)parts.push(`<strong>${venue}</strong>`);
  if(day)parts.push(`<strong>${day}</strong>`);
  if(hour!==null&&hour!==undefined)parts.push(`<strong>${fmtH(hour)}</strong>`);
  if(weather)parts.push(`<strong>${weather}</strong>`);
  el.innerHTML=`
    <div style="display:flex;align-items:flex-start;gap:12px;">
      <div style="font-size:20px;flex-shrink:0;">⊘</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:700;color:#f1f5f9;margin-bottom:4px;">No exact matches found for: ${parts.join(' · ')}</div>
        <div style="font-size:12px;color:#94a3b8;line-height:1.6;">The system automatically expanded the search window to show the closest matching operational activity. Results below include nearby venues, similar time windows, and related crowd patterns to support your investigation.</div>
      </div>
      <div style="flex-shrink:0;display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
        <span style="font-size:10px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;padding:3px 10px;background:rgba(245,158,11,.12);color:#f59e0b;border:1px solid rgba(245,158,11,.3);border-radius:6px;">Fallback Mode</span>
        <span style="font-size:10px;color:#4b5563;font-family:monospace;">Auto-expanded search</span>
      </div>
    </div>`;
}

function renderNearbyActivity(filters){
  const el=document.getElementById('inv-nearby-activity');
  if(!el) return;
  const nearbyVenues=filters.nearbyVenues||[];
  if(!nearbyVenues.length){el.innerHTML='<div style="color:#4b5563;font-size:12px;text-align:center;padding:16px;">No nearby venues found</div>';return;}
  el.innerHTML=nearbyVenues.slice(0,5).map(vname=>{
    const vd=allData.filter(d=>d.venue_name===vname);
    const avgD=avg(vd.map(d=>d.crowd_density));
    const avgDw=avg(vd.map(d=>d.avg_dwell_minutes)).toFixed(0);
    const col=dc(avgD);
    const hcnt={};vd.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
    const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
    const cat=vd[0]?.venue_category||'';
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--card2);border-radius:6px;border:1px solid var(--bdr);margin-bottom:8px;">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:600;color:#f1f5f9;">${vname}</div>
        <div style="font-size:10px;color:#4b5563;">${cat} · Peak: ${pkH?fmtH(+pkH[0]):'—'} · ${vd.length} check-ins</div>
      </div>
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:18px;font-weight:700;font-family:monospace;color:${col};">${avgD.toFixed(0)}</div>
        <div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:.05em;">Avg Density</div>
      </div>
      <div style="text-align:center;flex-shrink:0;">
        <div style="font-size:16px;font-weight:700;font-family:monospace;color:#06b6d4;">${avgDw}m</div>
        <div style="font-size:9px;color:#4b5563;text-transform:uppercase;letter-spacing:.05em;">Avg Dwell</div>
      </div>
      <div style="width:40px;height:40px;flex-shrink:0;">
        <div style="height:100%;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden;display:flex;align-items:flex-end;">
          <div style="width:100%;height:${avgD}%;background:linear-gradient(0deg,#3b82f6,${col});border-radius:3px;transition:height .6s;"></div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderRecentPatterns(results,filters){
  const el=document.getElementById('inv-recent-patterns');
  if(!el) return;
  destroyC('ivNearby');
  // Show hourly pattern of the fallback data as a compact area chart
  const hm={};for(let h=0;h<24;h++)hm[h]=[];
  results.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h));
  const vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null);
  // Risk summary cards
  const hi=results.filter(d=>d.crowd_density>=70).length;
  const md=results.filter(d=>d.crowd_density>=40&&d.crowd_density<70).length;
  const lo=results.filter(d=>d.crowd_density<40).length;
  const tot=results.length||1;
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px;">
      <div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:8px;padding:12px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#ef4444;font-family:monospace;">${hi}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:3px;">High Density Events</div>
        <div style="font-size:10px;color:#ef4444;margin-top:2px;">${(hi/tot*100).toFixed(0)}% of results</div>
      </div>
      <div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:8px;padding:12px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#f59e0b;font-family:monospace;">${md}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:3px;">Medium Density Events</div>
        <div style="font-size:10px;color:#f59e0b;margin-top:2px;">${(md/tot*100).toFixed(0)}% of results</div>
      </div>
      <div style="background:rgba(16,185,129,.06);border:1px solid rgba(16,185,129,.18);border-radius:8px;padding:12px 14px;text-align:center;">
        <div style="font-size:22px;font-weight:700;color:#10b981;font-family:monospace;">${lo}</div>
        <div style="font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em;margin-top:3px;">Low Density Events</div>
        <div style="font-size:10px;color:#10b981;margin-top:2px;">${(lo/tot*100).toFixed(0)}% of results</div>
      </div>
    </div>
    <div style="height:110px;position:relative;"><canvas id="inv-ch-nearby"></canvas></div>`;

  requestAnimationFrame(()=>{
    const ctx2=document.getElementById('inv-ch-nearby')?.getContext('2d');
    if(!ctx2) return;
    ICH.ivNearby=new Chart(ctx2,{type:'line',data:{labels,datasets:[{label:'Related Activity (avg density)',data:vals,
      borderColor:'#8b5cf6',backgroundColor:grad(ctx2,'rgba(139,92,246,.25)','rgba(139,92,246,.01)'),
      fill:true,tension:.4,pointRadius:3,pointBackgroundColor:'#8b5cf6',borderWidth:2,spanGaps:true}]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` Related avg density: ${ctx.parsed.y}`}}},
        scales:{x:sx(),y:sy('Density',0,105)}}});
  });
}

/* ══════════ HELPERS ══════════ */
function fmtH(h){if(h===0)return'12AM';if(h<12)return h+'AM';if(h===12)return'12PM';return(h-12)+'PM';}
function avg(arr){if(!arr.length)return 0;return arr.reduce((s,v)=>s+v,0)/arr.length;}
function v(id){return document.getElementById(id)?.value||'';}
function set(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;}
function show(id,visible){const el=document.getElementById(id);if(el)el.style.display=visible?'block':'none';}
function dc(d){if(d>=70)return'#ef4444';if(d>=50)return'#f59e0b';if(d>=30)return'#3b82f6';return'#10b981';}
function hmC(n){
  if(n===0)return'rgba(10,15,30,.4)';
  if(n<.2)return`rgba(26,58,107,${.4+n*2})`;
  if(n<.5)return`rgba(59,130,246,${.4+n*.6})`;
  if(n<.8)return`rgba(245,158,11,${.5+n*.45})`;
  return`rgba(239,68,68,${.6+n*.4})`;
}
function grad(ctx,top,bottom){const g=ctx.createLinearGradient(0,0,0,300);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
function destroyC(k){if(CH[k]){CH[k].destroy();delete CH[k];}if(ICH[k]){ICH[k].destroy();delete ICH[k];}}
function sx(){return{grid:{color:'rgba(255,255,255,.04)',drawBorder:false},ticks:{color:'#4b5563',font:{family:'monospace',size:9},maxRotation:0}};}
function sy(label='',mn=0,mx=undefined){return{grid:{color:'rgba(255,255,255,.04)',drawBorder:false},ticks:{color:'#4b5563',font:{family:'monospace',size:9}},min:mn,...(mx!==undefined?{max:mx}:{}),beginAtZero:true,title:{display:!!label,text:label,color:'#4b5563',font:{family:'monospace',size:9}}};}
function tt(){return{backgroundColor:'rgba(10,15,30,.96)',borderColor:'rgba(59,130,246,.3)',borderWidth:1,titleColor:'#f1f5f9',bodyColor:'#94a3b8',titleFont:{family:'Inter',size:12,weight:700},bodyFont:{family:'monospace',size:10},padding:10,cornerRadius:6,displayColors:true,boxWidth:7,boxHeight:7};}
