/* BENTE ANALYTICS — Public Safety & Operational Intelligence */
'use strict';

let allData=[], filteredMon=[];
let mapInstance=null, heatLayer=null, markerLayer=null, mapRiskFilter='ALL';
let CH={}, ICH={};

const VENUE_ICONS={'Nightclub':'🎵','Bar/Lounge':'🍸','Cafe':'☕','Restaurant':'🍽','Gym':'💪','Entertainment':'🎭','Food Court':'🍜','Mall':'🛍','Coworking':'💼','Park':'🌳'};
const ZONE_COLS={'Zone A — Downtown':'#ff3355','Zone B — Harbor District':'#ffaa00','Zone C — Midtown':'#00c8ff','Zone D — Waterfront':'#00ff88','Zone E — North End':'#9b59ff','Zone F — Commercial':'#ff8800'};
const FLAG_COL={'CRITICAL':'#ff0033','HIGH':'#ff3355','ELEVATED':'#ffaa00','NORMAL':'#00ff88'};
const FLAG_CLASS={'CRITICAL':'dp-critical','HIGH':'dp-high','ELEVATED':'dp-elevated','NORMAL':'dp-normal'};

document.addEventListener('DOMContentLoaded',()=>{
  allData=RAW_DATA.map(r=>({...r}));
  filteredMon=[...allData];
  populateDropdowns();
  startClock();
  set('hs-critical',allData.filter(d=>d.incident_flag==='CRITICAL').length.toLocaleString());
  set('hs-high',allData.filter(d=>d.incident_flag==='HIGH').length.toLocaleString());
  showPage('home');
  buildQuickAccess();
});

function startClock(){ const t=()=>{set('nav-clock',new Date().toLocaleTimeString('en-US',{hour12:false}));};t();setInterval(t,1000); }

/* ─── NAV ─── */
function showPage(name){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.sb-icon').forEach(s=>s.classList.remove('active'));
  document.getElementById('page-'+name)?.classList.add('active');
  document.getElementById('nt-'+name)?.classList.add('active');
  document.getElementById('sbi-'+name)?.classList.add('active');
  if(name==='heatmap')      setTimeout(initHeatmap,60);
  if(name==='overview')     setTimeout(renderOverview,40);
  if(name==='patterns')     renderPatterns();
  if(name==='forecast')     renderForecast();
  if(name==='investigation')initInvestigation();
}

/* ─── DROPDOWNS ─── */
function populateDropdowns(){
  const cats   =[...new Set(allData.map(d=>d.venue_category))].sort();
  const venues =[...new Set(allData.map(d=>d.venue_name))].sort();
  const zones  =[...new Set(allData.map(d=>d.patrol_zone))].sort();
  const hours  =[...new Set(allData.map(d=>d.hour_of_day))].sort((a,b)=>a-b);
  addO('f-cat',cats);addO('f-zone',zones);
  addO('tr-cat',cats);addO('tr-zone',zones);
  addO('fc-cat',cats);addO('fc-zone',zones);
  addO('inv-venue',venues);addO('inv-zone',zones);
  hours.forEach(h=>{document.getElementById('inv-hour')?.add(new Option(fmtH(h),h));});
}
function addO(id,vals){const el=document.getElementById(id);if(el)vals.forEach(v=>el.add(new Option(v,v)));}

/* ─── QUICK ACCESS ─── */
function buildQuickAccess(){
  const vm={};
  allData.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,zone:d.patrol_zone,flags:[],dens:[],count:0};
    vm[d.venue_name].flags.push(d.incident_flag);
    vm[d.venue_name].dens.push(d.crowd_density);
    vm[d.venue_name].count++;
  });
  const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
  const venues=Object.entries(vm).map(([name,v])=>({
    name, cat:v.cat, zone:v.zone, count:v.count,
    avgD: avg(v.dens),
    topFlag:v.flags.sort((a,b)=>ord[b]-ord[a])[0]||'NORMAL'
  })).sort((a,b)=>b.avgD-a.avgD); // sort by avg density — highest risk first

  const el=document.getElementById('qa-venue-list');
  if(!el)return;
  el.innerHTML='';
  venues.forEach(v=>{
    const icon=VENUE_ICONS[v.cat]||'📍';
    const col=FLAG_COL[v.topFlag]||'var(--t2)';
    const flagClass=v.topFlag==='CRITICAL'?'tag-critical':v.topFlag==='HIGH'?'tag-high':v.topFlag==='ELEVATED'?'tag-elevated':'tag-normal';
    const item=document.createElement('div');
    item.className='qa-venue-item';
    item.innerHTML=`
      <div class="qa-venue-icon">${icon}</div>
      <div class="qa-venue-info">
        <div class="qa-venue-name">${v.name}</div>
        <div class="qa-venue-meta">${v.zone.split('—')[0].trim()} · Avg density: ${v.avgD.toFixed(0)}</div>
      </div>
      <span class="qa-venue-flag ${flagClass}" style="color:${col};">${v.topFlag}</span>`;
    item.onclick=()=>{focusVenueOnMap(v.name);closeQuickAccess();};
    el.appendChild(item);
  });
}

function toggleQuickAccess(){
  const dd=document.getElementById('qa-dropdown');
  const btn=document.getElementById('qa-btn');
  const arrow=document.getElementById('qa-arrow');
  const isOpen=dd.classList.contains('open');
  if(isOpen){closeQuickAccess();}
  else{
    // Position using fixed coords to escape overflow:hidden parent
    const rect=btn.getBoundingClientRect();
    dd.style.top=(rect.bottom+6)+'px';
    dd.style.left=rect.left+'px';
    dd.classList.add('open');btn.classList.add('open');
    if(arrow)arrow.textContent='▲';
  }
}
function closeQuickAccess(){
  document.getElementById('qa-dropdown')?.classList.remove('open');
  document.getElementById('qa-btn')?.classList.remove('open');
  const arrow=document.getElementById('qa-arrow');if(arrow)arrow.textContent='▼';
}
document.addEventListener('click',e=>{if(!e.target.closest('.quick-access-wrap'))closeQuickAccess();});

function goInvestigate(vname){
  const el=document.getElementById('inv-venue');if(el)el.value=vname;
  showPage('investigation');setTimeout(runInvestigation,100);
}

function focusVenueOnMap(vname){
  // Switch to heatmap page first
  showPage('heatmap');
  setTimeout(()=>{
    if(!mapInstance||!markerLayer) return;
    // Find the venue record to get coordinates
    const rec = allData.find(d=>d.venue_name===vname);
    if(!rec) return;
    // Zoom map to venue
    mapInstance.setView([rec.latitude, rec.longitude], 16, {animate:true});
    // Find and open the matching marker popup
    markerLayer.eachLayer(layer=>{
      if(layer.getLatLng){
        const latlng = layer.getLatLng();
        const dist = Math.abs(latlng.lat - rec.latitude) + Math.abs(latlng.lng - rec.longitude);
        if(dist < 0.001) {
          setTimeout(()=>layer.openPopup(), 400);
        }
      }
    });
  }, 100);
}

/* ════════ HEATMAP ════════ */
function initHeatmap(){
  if(!mapInstance){
    mapInstance=L.map('map',{center:[40.712,-74.005],zoom:14});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19}).addTo(mapInstance);
    markerLayer=L.layerGroup().addTo(mapInstance);
  }
  renderHeatmapLayer(allData);
  renderFeedPanel(allData);
  renderMiniMatrix(allData);
  renderVenueBar(allData);
}

function filterMapByRisk(flag){
  mapRiskFilter=flag;
  const data=flag==='ALL'?allData:allData.filter(d=>d.incident_flag===flag);
  renderHeatmapLayer(data);
  renderFeedPanel(data);
}

function renderHeatmapLayer(data){
  if(!mapInstance)return;
  if(heatLayer)mapInstance.removeLayer(heatLayer);
  markerLayer?.clearLayers();
  const vm={};
  data.forEach(d=>{
    if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,lat:d.latitude,lon:d.longitude,dens:[],dwell:[],records:[],zone:d.patrol_zone};
    vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].dwell.push(d.avg_dwell_minutes);vm[d.venue_name].records.push(d);
  });
  const venues=Object.values(vm),maxD=Math.max(...venues.map(v=>avg(v.dens)));
  const hpts=[];
  venues.forEach(v=>{const a=avg(v.dens)/100;for(let i=0;i<Math.ceil(a*35);i++)hpts.push([v.lat+(Math.random()-.5)*.002,v.lon+(Math.random()-.5)*.002,a]);});
  heatLayer=L.heatLayer(hpts,{radius:45,blur:35,maxZoom:18,gradient:{0:'#04080f',.15:'#001833',.35:'#003388',.55:'#00c8ff',.75:'#ffaa00',1:'#ff0033'}}).addTo(mapInstance);
  venues.forEach(v=>{
    const ad=avg(v.dens),adw=avg(v.dwell).toFixed(0),r=12+(ad/maxD)*20;
    const topRec=v.records.sort((a,b)=>b.crowd_density-a.crowd_density)[0];
    const flag=topRec?.incident_flag||'NORMAL';
    const col=FLAG_COL[flag]||'#00c8ff';
    const icon=VENUE_ICONS[v.cat]||'📍';
    const m=L.circleMarker([v.lat,v.lon],{radius:r,color:col,fillColor:col,fillOpacity:.45,weight:2});
    m.bindPopup(buildPopup(v.records[0]?.venue_name||'',topRec,ad,adw,col,icon,flag,v.zone));
    m.addTo(markerLayer);
  });
}

function buildPopup(vname,rec,ad,adw,col,icon,flag,zone){
  const flagClass=flag==='CRITICAL'?'tag-critical':flag==='HIGH'?'tag-high':flag==='ELEVATED'?'tag-elevated':'tag-normal';
  const actionBg={'CRITICAL':'rgba(255,0,51,.12)','HIGH':'rgba(255,51,85,.1)','ELEVATED':'rgba(255,170,0,.08)','NORMAL':'rgba(0,255,136,.06)'};
  const actionCol={'CRITICAL':'#ff0033','HIGH':'var(--red)','ELEVATED':'var(--amber)','NORMAL':'var(--green)'};
  return `<div class="popup-inner">
    <div class="popup-tags">
      <span class="tag ${flagClass}">${flag}</span>
      ${rec?.activity_type?`<span class="tag tag-act">${rec.activity_type}</span>`:''}
    </div>
    <div class="popup-venue">${vname}</div>
    <div class="popup-zone">📍 ${zone}</div>
    <div class="popup-density-bar"><div class="popup-density-fill" style="width:${ad}%;background:linear-gradient(90deg,#003388,${col});"></div></div>
    <div class="popup-row"><span class="popup-label">CROWD DENSITY</span><span class="popup-val" style="color:${col};">${ad.toFixed(0)}%</span></div>
    <div class="popup-row"><span class="popup-label">DWELL TIME</span><span class="popup-val">${adw} min</span></div>
    <div class="popup-row"><span class="popup-label">CHECK-IN TIME</span><span class="popup-val">${rec?.timestamp||'—'}</span></div>
    <div class="popup-row"><span class="popup-label">WEATHER</span><span class="popup-val">${rec?.weather_condition||'—'}</span></div>
    <div class="popup-section">PERSON DETAILS</div>
    <div class="popup-row"><span class="popup-label">USER ID</span><span class="popup-val" style="color:#00c8ff;">${rec?.user_id||'—'}</span></div>
    <div class="popup-row"><span class="popup-label">CHECK-IN ID</span><span class="popup-val">${rec?.checkin_id||'—'}</span></div>
    <div class="popup-row"><span class="popup-label">LATITUDE</span><span class="popup-val">${rec?.latitude?.toFixed(5)||'—'}</span></div>
    <div class="popup-row"><span class="popup-label">LONGITUDE</span><span class="popup-val">${rec?.longitude?.toFixed(5)||'—'}</span></div>
    <div class="popup-section">OFFICER ASSESSMENT</div>
    <div class="popup-action-box" style="background:${actionBg[flag]||actionBg.NORMAL};border:1px solid ${actionCol[flag]||actionCol.NORMAL}33;border-radius:5px;">
      <span style="font-size:16px;">${flag==='CRITICAL'?'🚨':flag==='HIGH'?'⚠':flag==='ELEVATED'?'👁':'✓'}</span>
      <div><div style="font-size:11px;font-weight:700;color:${actionCol[flag]||actionCol.NORMAL};">${rec?.incident_flag||flag} RISK</div><div style="font-size:10px;color:var(--t2);">${rec?.officer_action||'No action required'}</div></div>
    </div>
    <div class="popup-btn" onclick="goInvestigate('${vname}')">⊘ OPEN INVESTIGATION</div>
  </div>`;
}

function renderFeedPanel(data){
  const sorted=[...data].sort((a,b)=>{
    const order={'CRITICAL':0,'HIGH':1,'ELEVATED':2,'NORMAL':3};
    return (order[a.incident_flag]||3)-(order[b.incident_flag]||3)||b.crowd_density-a.crowd_density;
  });
  const el=document.getElementById('rp-feed');if(!el)return;el.innerHTML='';
  sorted.forEach(d=>{
    const col=FLAG_COL[d.incident_flag]||'#00c8ff';
    const fcClass='fc-'+(d.incident_flag||'normal').toLowerCase();
    const icon=VENUE_ICONS[d.venue_category]||'📍';
    const flagClass=d.incident_flag==='CRITICAL'?'tag-critical':d.incident_flag==='HIGH'?'tag-high':d.incident_flag==='ELEVATED'?'tag-elevated':'tag-normal';
    const card=document.createElement('div');card.className=`feed-card ${fcClass}`;
    card.innerHTML=`
      <div class="fc-top">
        <div class="fc-venue-icon" style="background:${col}22;">${icon}</div>
        <div class="fc-venue-name">${d.venue_name}</div>
        <div class="fc-density" style="color:${col};">${d.crowd_density}%</div>
      </div>
      <div class="fc-meta">${d.checkin_id} · ${d.timestamp}</div>
      <div class="fc-tags">
        <span class="tag ${flagClass}">${d.incident_flag}</span>
        <span class="tag tag-zone">${d.patrol_zone.split('—')[0].trim()}</span>
        ${d.activity_type?`<span class="tag tag-act">${d.activity_type}</span>`:''}
      </div>`;
    card.onclick=()=>focusVenueOnMap(d.venue_name);
    el.appendChild(card);
  });
}

// filterFeed removed — Quick Access dropdown used instead

function filterFeedByDayHour(day, hour){
  // Filter feed by day and hour, highlight the active cell
  document.querySelectorAll('.hm-cell').forEach(c=>c.style.outline='');
  // Find clicked cell and highlight it
  const filtered = allData.filter(d=>d.day_of_week===day && d.hour_of_day===hour);
  if(!filtered.length) return;
  renderFeedPanel(filtered);
  // Show a reset button hint in the feed header
  set('rp-count', day.slice(0,3)+' '+fmtH(hour)+' — '+filtered.length+' records · click map to reset');
}

function renderMiniMatrix(data){
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hours=[0,3,6,9,12,15,18,21,23];
  const mat={};days.forEach(d=>{mat[d]={};for(let h=0;h<24;h++)mat[d][h]=[];});
  data.forEach(d=>{if(mat[d.day_of_week]&&mat[d.day_of_week][d.hour_of_day]!==undefined)mat[d.day_of_week][d.hour_of_day].push(d.crowd_density);});
  let maxV=0;days.forEach(dy=>hours.forEach(h=>{const a=mat[dy][h];if(a.length)maxV=Math.max(maxV,avg(a));}));
  let html='<table style="border-collapse:collapse;"><thead><tr><th style="font-size:8px;font-family:var(--mono);color:var(--t3);padding:2px 4px;"></th>';
  hours.forEach(h=>html+=`<th style="font-size:8px;font-family:var(--mono);color:var(--t3);padding:2px 4px;text-align:center;">${fmtH(h)}</th>`);
  html+='</tr></thead><tbody>';
  days.forEach((dy,di)=>{
    html+=`<tr><td style="font-size:9px;font-family:var(--mono);color:var(--t2);padding:2px 5px 2px 0;text-align:right;">${dy.slice(0,3)}</td>`;
    hours.forEach(h=>{const arr=mat[dy][h],val=arr.length?avg(arr):0,norm=maxV?val/maxV:0,bg=hmC(norm);
      const lbl=arr.length?val.toFixed(0):'';
      const clickable=arr.length>0?`onclick="filterFeedByDayHour('${dy}',${h})" style="background:${bg};cursor:pointer;"`:` style="background:${bg};"`;
      html+=`<td class="hm-cell" ${clickable} title="${dy} ${fmtH(h)}: ${arr.length} records, avg density ${val.toFixed(0)} — click to filter feed">${lbl}</td>`;
    });
    html+='</tr>';
  });
  html+='</tbody></table>';
  document.getElementById('hm-mini-matrix').innerHTML=html;
}

function renderVenueBar(data){
  const vm={};data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={dens:[],flag:d.incident_flag};vm[d.venue_name].dens.push(d.crowd_density);});
  const sorted=Object.entries(vm).map(([n,v])=>({n,avgD:avg(v.dens)})).sort((a,b)=>b.avgD-a.avgD);
  destroyC('venueBar');
  const ctx=document.getElementById('ch-venue-bar')?.getContext('2d');if(!ctx)return;
  CH.venueBar=new Chart(ctx,{type:'bar',data:{labels:sorted.map(v=>v.n.split(' ').slice(-1)[0]),datasets:[{data:sorted.map(v=>v.avgD.toFixed(1)),backgroundColor:sorted.map(v=>{const a=v.avgD;return a>=85?'rgba(255,0,51,.7)':a>=70?'rgba(255,51,85,.6)':a>=50?'rgba(255,170,0,.6)':'rgba(0,255,136,.5)';}),borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tt()}},scales:{x:{grid:{display:false},ticks:{color:'#3a5570',font:{family:'monospace',size:8},maxRotation:0}},y:{display:false}}}});
}

/* ════════ OVERVIEW ════════ */
function applyMonFilters(){
  const zone=v('f-zone'),cat=v('f-cat'),flag=v('f-flag'),hr=v('f-hrange');
  filteredMon=allData.filter(d=>{
    if(zone&&d.patrol_zone!==zone)return false;
    if(cat&&d.venue_category!==cat)return false;
    if(flag&&d.incident_flag!==flag)return false;
    if(hr==='morning'&&!(d.hour_of_day>=6&&d.hour_of_day<12))return false;
    if(hr==='afternoon'&&!(d.hour_of_day>=12&&d.hour_of_day<18))return false;
    if(hr==='evening'&&!(d.hour_of_day>=18&&d.hour_of_day<24))return false;
    if(hr==='late'&&!(d.hour_of_day>=0&&d.hour_of_day<6))return false;
    return true;
  });
  renderOverview();
}
function resetMonFilters(){['f-zone','f-cat','f-flag','f-hrange'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});filteredMon=[...allData];renderOverview();}

function renderOverview(){
  const d=filteredMon;
  const crit=d.filter(x=>x.incident_flag==='CRITICAL').length;
  const high=d.filter(x=>x.incident_flag==='HIGH').length;
  const avgD=d.length?avg(d.map(x=>x.crowd_density)).toFixed(1):0;
  const hcnt={};d.forEach(x=>{hcnt[x.hour_of_day]=(hcnt[x.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  set('kpi-critical',crit.toLocaleString());set('kpi-high',high.toLocaleString());
  set('kpi-density',avgD);set('kpi-peak',pk?fmtH(+pk[0]):'—');
  set('kpi-density-sub',d.length.toLocaleString()+' records');
  set('kpi-peak-sub',pk?pk[1]+' check-ins':'');
  renderDensityTime(d);renderVenueList(d);renderRiskDonut(d);renderPeakList(d,'peak-list');renderCatChart(d);renderAlerts(d);
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

function renderVenueList(data){
  const vm={};data.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={cat:d.venue_category,dens:[],flags:{},count:0};vm[d.venue_name].dens.push(d.crowd_density);vm[d.venue_name].flags[d.incident_flag]=(vm[d.venue_name].flags[d.incident_flag]||0)+1;vm[d.venue_name].count++;});
  const sorted=Object.entries(vm).map(([n,v])=>({n,cat:v.cat,avgD:avg(v.dens),count:v.count,topFlag:(()=>{const ord={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};return Object.entries(v.flags).sort((a,b)=>ord[b[0]]-ord[a[0]])[0]?.[0]||'NORMAL';})()})).sort((a,b)=>b.avgD-a.avgD);
  const el=document.getElementById('venue-list');if(!el)return;el.innerHTML='';
  sorted.forEach((v,i)=>{
    const col=FLAG_COL[v.topFlag]||'#00c8ff',icon=VENUE_ICONS[v.cat]||'📍';
    const row=document.createElement('div');row.className='venue-row';
    row.innerHTML=`<div style="font-family:var(--mono);font-size:10px;color:var(--t3);width:16px;">${i+1}</div>
      <div style="font-size:14px;width:20px;">${icon}</div>
      <div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${v.n}</div><div style="font-size:10px;color:var(--t3);">${v.cat} · ${v.count} check-ins</div></div>
      <span class="tag ${v.topFlag==='CRITICAL'?'tag-critical':v.topFlag==='HIGH'?'tag-high':v.topFlag==='ELEVATED'?'tag-elevated':'tag-normal'}" style="font-size:9px;">${v.topFlag}</span>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:${col};width:28px;text-align:right;">${v.avgD.toFixed(0)}</div>`;
    row.onclick=()=>goInvestigate(v.n);
    el.appendChild(row);
  });
}

function renderRiskDonut(data){
  const crit=data.filter(d=>d.incident_flag==='CRITICAL').length;
  const high=data.filter(d=>d.incident_flag==='HIGH').length;
  const elev=data.filter(d=>d.incident_flag==='ELEVATED').length;
  const norm=data.filter(d=>d.incident_flag==='NORMAL').length;
  const tot=data.length||1;
  destroyC('donut');const ctx=document.getElementById('ch-donut')?.getContext('2d');if(!ctx)return;
  CH.donut=new Chart(ctx,{type:'doughnut',data:{labels:['Critical','High','Elevated','Normal'],datasets:[{data:[crit,high,elev,norm],backgroundColor:['#ff0033','#ff3355','#ffaa00','#00ff88'],borderColor:'rgba(5,8,16,.8)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('donut-stats').innerHTML=
    dRow('#ff0033','Critical',crit,tot)+dRow('#ff3355','High',high,tot)+dRow('#ffaa00','Elevated',elev,tot)+dRow('#00ff88','Normal',norm,tot)+
    `<div style="margin-top:6px;padding-top:6px;border-top:1px solid var(--bdr);display:flex;justify-content:space-between;font-size:11px;"><span style="color:var(--t3);">Total</span><span style="font-family:var(--mono);">${tot.toLocaleString()}</span></div>`;
}
function dRow(c,l,val,tot){return`<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;"><div style="width:8px;height:8px;border-radius:50%;background:${c};flex-shrink:0;"></div><div style="flex:1;font-size:11px;color:var(--t2);">${l}</div><div style="font-size:12px;font-weight:700;color:${c};font-family:var(--mono);">${(val/tot*100).toFixed(0)}%</div></div>`;}

function renderPeakList(data,elId){
  const hm={};for(let h=0;h<24;h++)hm[h]={count:0,dens:[]};
  data.forEach(d=>{hm[d.hour_of_day].count++;hm[d.hour_of_day].dens.push(d.crowd_density);});
  const ranked=Object.entries(hm).map(([h,v])=>({h:+h,count:v.count,avgD:v.dens.length?avg(v.dens):0})).filter(x=>x.count>0).sort((a,b)=>b.count-a.count).slice(0,5);
  const maxC=ranked[0]?.count||1,el=document.getElementById(elId);if(!el)return;el.innerHTML='';
  ranked.forEach(({h,count,avgD})=>{
    const pct=(count/maxC*100).toFixed(0),col=FLAG_COL[avgD>=85?'CRITICAL':avgD>=70?'HIGH':avgD>=50?'ELEVATED':'NORMAL'];
    const row=document.createElement('div');row.className='peak-row';
    row.innerHTML=`<div style="font-family:var(--mono);font-size:10px;color:var(--t2);width:40px;flex-shrink:0;">${fmtH(h)}</div><div class="peak-bg"><div class="peak-fill" style="width:${pct}%;"><span style="font-size:9px;font-weight:700;color:rgba(255,255,255,.9);font-family:var(--mono);">${count}</span></div></div><div style="font-family:var(--mono);font-size:10px;font-weight:700;color:${col};width:32px;text-align:right;">${avgD.toFixed(0)}</div>`;
    el.appendChild(row);
  });
}

function renderCatChart(data){
  const cm={};data.forEach(d=>{if(!cm[d.venue_category])cm[d.venue_category]={crit:0,high:0,total:0};cm[d.venue_category].total++;if(d.incident_flag==='CRITICAL')cm[d.venue_category].crit++;if(d.incident_flag==='HIGH')cm[d.venue_category].high++;});
  const labels=Object.keys(cm).sort((a,b)=>cm[b].total-cm[a].total);
  destroyC('cat');const ctx=document.getElementById('ch-cat')?.getContext('2d');if(!ctx)return;
  CH.cat=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Critical',data:labels.map(l=>cm[l].crit),backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:2,borderSkipped:false},
    {label:'High',data:labels.map(l=>cm[l].high),backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:2,borderSkipped:false},
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:30}},y:sy('Incidents'),stacked:false}}});
}

function renderAlerts(data){
  const sorted=[...data].filter(d=>d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH').sort((a,b)=>b.crowd_density-a.crowd_density);
  const el=document.getElementById('alert-list');if(!el)return;el.innerHTML='';
  sorted.slice(0,4).forEach(a=>{
    const isCrit=a.incident_flag==='CRITICAL';
    const div=document.createElement('div');div.className='alert-card'+(isCrit?'':' ac-amber');
    div.innerHTML=`<div style="display:flex;align-items:flex-start;gap:10px;">
      <div style="font-size:16px;">${isCrit?'🚨':'⚠'}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:12.5px;font-weight:700;color:${isCrit?'var(--red)':'var(--amber)'};">${a.incident_flag} — ${a.venue_name}</div>
        <div style="font-size:10px;color:var(--t3);">${a.timestamp} · ${a.patrol_zone}</div>
        <div style="font-size:10px;color:var(--t2);margin-top:2px;">Action: ${a.officer_action}</div>
      </div>
      <div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${isCrit?'#ff0033':'var(--amber)'};">${a.crowd_density}%</div>
    </div>`;
    div.onclick=()=>goInvestigate(a.venue_name);
    el.appendChild(div);
  });
  if(!sorted.length)el.innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:16px;">No active alerts for current filter</div>';
}

/* ════════ PATTERNS ════════ */
function renderTrends(){
  const cat=v('tr-cat'),zone=v('tr-zone'),wknd=v('tr-wknd');
  const data=allData.filter(d=>{if(cat&&d.venue_category!==cat)return false;if(zone&&d.patrol_zone!==zone)return false;if(wknd!==''&&d.is_weekend!==+wknd)return false;return true;});
  renderTrKPIs(data);renderHMMatrix(data,'hm-matrix');renderTrHourly(data);renderTrWknd(data);renderPeakList(data,'tr-peak-list');renderTrWeather(data);renderZoneChart(data);renderActivityChart(data);
  // Forecast section
  renderFcCards(data);renderFcChart(data);renderFcWknd(data);renderFcRisk(data);renderFcZone(data);
}
function renderPatterns(){renderTrends();}

function renderTrKPIs(data){
  const el=document.getElementById('tr-kpis');if(!el)return;
  const avgD=data.length?avg(data.map(d=>d.crowd_density)).toFixed(1):0;
  const crit=data.filter(d=>d.incident_flag==='CRITICAL').length;
  const wkndAvg=avg(data.filter(d=>d.is_weekend).map(d=>d.crowd_density)).toFixed(1);
  const hcnt={};data.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  el.innerHTML=`
    <div class="kpi" style="--kc:var(--cyan);--kb:rgba(0,200,255,.08)"><div class="kpi-ico">📊</div><div><div class="kpi-lbl">Avg Density</div><div class="kpi-val">${avgD}</div><div class="kpi-sub">${data.length} records</div></div></div>
    <div class="kpi" style="--kc:var(--red);--kb:rgba(255,51,85,.08)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">Critical Events</div><div class="kpi-val">${crit}</div><div class="kpi-sub">${(crit/data.length*100).toFixed(0)}% of records</div></div></div>
    <div class="kpi" style="--kc:var(--amber);--kb:rgba(255,170,0,.08)"><div class="kpi-ico">🌆</div><div><div class="kpi-lbl">Weekend Avg Density</div><div class="kpi-val">${wkndAvg||'—'}</div><div class="kpi-sub">Sat–Sun patterns</div></div></div>
    <div class="kpi" style="--kc:var(--green);--kb:rgba(0,255,136,.08)"><div class="kpi-ico">🕐</div><div><div class="kpi-lbl">Peak Hour</div><div class="kpi-val">${pk?fmtH(+pk[0]):'—'}</div><div class="kpi-sub">${pk?pk[1]+' check-ins':''}</div></div></div>`;
}

function renderHMMatrix(data,tableId){
  const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const hours=Array.from({length:24},(_,i)=>i);
  const mat={};days.forEach(d=>{mat[d]={};hours.forEach(h=>{mat[d][h]=[];});});
  data.forEach(d=>{if(mat[d.day_of_week]&&mat[d.day_of_week][d.hour_of_day]!==undefined)mat[d.day_of_week][d.hour_of_day].push(d.crowd_density);});
  let maxV=0;days.forEach(dy=>hours.forEach(h=>{const a=mat[dy][h];if(a.length)maxV=Math.max(maxV,avg(a));}));
  const tbl=document.getElementById(tableId);if(!tbl)return;
  let html='<thead><tr><th style="font-size:9px;font-family:var(--mono);color:var(--t3);padding:2px 6px;"></th>';
  hours.forEach(h=>{html+=h%3===0?`<th style="font-size:8px;font-family:var(--mono);color:var(--t3);text-align:center;padding:2px 2px;">${fmtH(h)}</th>`:'<th></th>';});
  html+='</tr></thead><tbody>';
  days.forEach(dy=>{
    html+=`<tr><td style="font-size:9px;font-family:var(--mono);color:var(--t2);text-align:right;padding-right:8px;white-space:nowrap;">${dy.slice(0,3)}</td>`;
    hours.forEach(h=>{const arr=mat[dy][h],val=arr.length?avg(arr):0,norm=maxV?val/maxV:0,bg=hmC(norm),lbl=arr.length?val.toFixed(0):'';html+=`<td class="hm-cell" style="background:${bg};" title="${dy} ${fmtH(h)}: ${arr.length} records, avg ${val.toFixed(1)}">${lbl}</td>`;});
    html+='</tr>';
  });
  tbl.innerHTML=html+'</tbody>';
}

function renderTrHourly(data){
  const hm={};for(let h=0;h<24;h++)hm[h]=[];data.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h)),vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null),cnts=Array.from({length:24},(_,h)=>hm[h].length);
  destroyC('trH');const ctx=document.getElementById('ch-tr-hourly')?.getContext('2d');if(!ctx)return;
  CH.trH=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'Avg Density',data:vals,borderColor:'#00c8ff',backgroundColor:grad(ctx,'rgba(0,200,255,.2)','rgba(0,200,255,.01)'),fill:true,tension:.45,pointRadius:4,pointBackgroundColor:vals.map(v=>v>=85?'#ff0033':v>=70?'#ff3355':'#00c8ff'),borderWidth:2.5,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>[' Avg Density: '+ctx.parsed.y,' Check-ins: '+cnts[ctx.dataIndex]]}}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderTrWknd(data){
  const wd=data.filter(d=>!d.is_weekend),we=data.filter(d=>d.is_weekend);
  const hours=Array.from({length:24},(_,i)=>i);
  const wdV=hours.map(h=>{const a=wd.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  const weV=hours.map(h=>{const a=we.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  destroyC('trW');const ctx=document.getElementById('ch-tr-wknd')?.getContext('2d');if(!ctx)return;
  CH.trW=new Chart(ctx,{type:'line',data:{labels:hours.map(h=>fmtH(h)),datasets:[{label:'Weekday',data:wdV,borderColor:'#00c8ff',backgroundColor:'rgba(0,200,255,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,spanGaps:true},{label:'Weekend',data:weV,borderColor:'#ff3355',backgroundColor:'rgba(255,51,85,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderTrWeather(data){
  const wm={};data.forEach(d=>{if(!wm[d.weather_condition])wm[d.weather_condition]={dens:[],crit:0};wm[d.weather_condition].dens.push(d.crowd_density);if(d.incident_flag==='CRITICAL'||d.incident_flag==='HIGH')wm[d.weather_condition].crit++;});
  const labels=Object.keys(wm),avgV=labels.map(l=>+avg(wm[l].dens).toFixed(1)),critV=labels.map(l=>wm[l].crit);
  const cols=['#00c8ff','#ffaa00','#00ff88','#ff3355'];
  destroyC('trWe');const ctx=document.getElementById('ch-tr-weather')?.getContext('2d');if(!ctx)return;
  CH.trWe=new Chart(ctx,{type:'bar',data:{labels,datasets:[{label:'Avg Density',data:avgV,backgroundColor:cols.slice(0,labels.length).map(c=>c+'88'),borderColor:cols.slice(0,labels.length),borderWidth:1.5,borderRadius:4,borderSkipped:false,yAxisID:'y'},{label:'High Risk Events',data:critV,type:'line',borderColor:'rgba(255,51,85,.7)',backgroundColor:'transparent',borderDash:[4,3],pointRadius:5,pointBackgroundColor:'#ff3355',borderWidth:2,yAxisID:'y2'}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:sx(),y:sy('Avg Density',0,105),y2:{position:'right',grid:{display:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9}}}}}});
}

function renderZoneChart(data){
  const zm={};data.forEach(d=>{if(!zm[d.patrol_zone])zm[d.patrol_zone]={crit:0,high:0,total:0};zm[d.patrol_zone].total++;if(d.incident_flag==='CRITICAL')zm[d.patrol_zone].crit++;if(d.incident_flag==='HIGH')zm[d.patrol_zone].high++;});
  const labels=Object.keys(zm).sort();
  destroyC('trZone');const ctx=document.getElementById('ch-tr-zone')?.getContext('2d');if(!ctx)return;
  CH.trZone=new Chart(ctx,{type:'bar',data:{labels:labels.map(l=>l.split('—')[0].trim()),datasets:[{label:'Critical',data:labels.map(l=>zm[l].crit),backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:3,borderSkipped:false},{label:'High',data:labels.map(l=>zm[l].high),backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:20}},y:sy('Incidents')}}});
}

function renderActivityChart(data){
  const am={};data.forEach(d=>{if(!am[d.activity_type])am[d.activity_type]=0;am[d.activity_type]++;});
  const sorted=Object.entries(am).sort((a,b)=>b[1]-a[1]);
  const cols=['#00c8ff','#ff3355','#ffaa00','#00ff88','#9b59ff','#ff8800','#00aaff','#ff88aa','#aaffaa','#ffcc00'];
  destroyC('trAct');const ctx=document.getElementById('ch-tr-activity')?.getContext('2d');if(!ctx)return;
  CH.trAct=new Chart(ctx,{type:'bar',data:{labels:sorted.map(e=>e[0]),datasets:[{data:sorted.map(e=>e[1]),backgroundColor:cols.map(c=>c+'88'),borderColor:cols,borderWidth:1,borderRadius:3,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:30}},y:sy('Count')}}});
}

/* ════════ FORECAST ════════ */
function renderForecast(){
  const zone=v('fc-zone'),cat=v('fc-cat');
  const data=allData.filter(d=>{if(zone&&d.patrol_zone!==zone)return false;if(cat&&d.venue_category!==cat)return false;return true;});
  renderFcKPIs(data);renderFcChart(data);renderFcCards(data);renderFcWknd(data);renderFcRisk(data);renderFcZone(data);
}

function renderFcKPIs(data){
  const el=document.getElementById('fc-kpis');if(!el)return;
  const avgD=data.length?avg(data.map(d=>d.crowd_density)).toFixed(1):0;
  const tonightData=data.filter(d=>d.hour_of_day>=20&&d.hour_of_day<=23);
  const tonightAvg=tonightData.length?avg(tonightData.map(d=>d.crowd_density)).toFixed(1):'—';
  const critPct=(data.filter(d=>d.incident_flag==='CRITICAL').length/data.length*100).toFixed(0);
  const hcnt={};data.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pk=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  el.innerHTML=`
    <div class="kpi" style="--kc:var(--cyan);--kb:rgba(0,200,255,.08)"><div class="kpi-ico">📊</div><div><div class="kpi-lbl">Baseline Avg Density</div><div class="kpi-val">${avgD}</div><div class="kpi-sub">${data.length} historical records</div></div></div>
    <div class="kpi" style="--kc:var(--amber);--kb:rgba(255,170,0,.08)"><div class="kpi-ico">🌙</div><div><div class="kpi-lbl">Tonight's Forecast (20–23h)</div><div class="kpi-val">${tonightAvg}</div><div class="kpi-sub">Avg expected density</div></div></div>
    <div class="kpi" style="--kc:var(--red);--kb:rgba(255,51,85,.08)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">Critical Risk Rate</div><div class="kpi-val">${critPct}%</div><div class="kpi-sub">Of historical records</div></div></div>
    <div class="kpi" style="--kc:var(--green);--kb:rgba(0,255,136,.08)"><div class="kpi-ico">🕐</div><div><div class="kpi-lbl">Projected Peak Hour</div><div class="kpi-val">${pk?fmtH(+pk[0]):'—'}</div><div class="kpi-sub">Highest expected volume</div></div></div>`;
}

function renderFcChart(data){
  const now=new Date(),ch=now.getHours();
  const hc={},hd={};for(let h=0;h<24;h++){hc[h]=0;hd[h]=[];}
  data.forEach(d=>{hc[d.hour_of_day]++;hd[d.hour_of_day].push(d.crowd_density);});
  const maxC=Math.max(...Object.values(hc),1);
  const fHours=Array.from({length:24},(_,i)=>(ch+i)%24);
  const base=fHours.map(h=>+(hc[h]/maxC*100).toFixed(1));
  const proj=base.map((val,i)=>Math.max(3,Math.min(100,+(val+Math.sin(i*.7)*5+(Math.random()*6-3)).toFixed(1))));
  const critThreshold=fHours.map(h=>{ const arr=hd[h];if(!arr.length)return null;const a=avg(arr);return a>=85?100:null; });
  destroyC('fcF');const ctx=document.getElementById('ch-fc-forecast')?.getContext('2d');if(!ctx)return;
  CH.fcF=new Chart(ctx,{type:'line',data:{labels:fHours.map(h=>fmtH(h)),datasets:[
    {label:'Historical Baseline',data:base,borderColor:'rgba(0,200,255,.4)',backgroundColor:'transparent',borderDash:[5,4],fill:false,tension:.4,pointRadius:2,borderWidth:1.5},
    {label:'Projected Crowd Index',data:proj,borderColor:'#00ff88',backgroundColor:grad(ctx,'rgba(0,255,136,.2)','rgba(0,255,136,.01)'),fill:true,tension:.4,pointRadius:vals=>vals.raw>=80?6:3,pointBackgroundColor:proj.map(v=>v>=80?'#ff0033':'#00ff88'),pointHoverRadius:7,borderWidth:2.5},
    {label:'Critical Threshold',data:Array(fHours.length).fill(85),borderColor:'rgba(255,0,51,.35)',borderDash:[3,5],borderWidth:1,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.dataset.label}: ${ctx.parsed.y}${ctx.datasetIndex<2?'%':''}`}}},scales:{x:sx(),y:sy('Activity Index / Density',0,115)}}});
}

function renderFcCards(data){
  const venues=[...new Set(data.map(d=>d.venue_name))];
  const grid=document.getElementById('fc-venue-cards');if(!grid)return;grid.innerHTML='';
  venues.forEach(vn=>{
    const vd=data.filter(d=>d.venue_name===vn);
    const tonight=vd.filter(d=>d.hour_of_day>=20&&d.hour_of_day<=23);
    const tonightD=tonight.length?avg(tonight.map(d=>d.crowd_density)):avg(vd.map(d=>d.crowd_density));
    const proj=+(tonightD*(0.92+Math.random()*.16)).toFixed(1);
    const flag=proj>=85?'CRITICAL':proj>=70?'HIGH':proj>=50?'ELEVATED':'NORMAL';
    const col=FLAG_COL[flag],icon=VENUE_ICONS[vd[0]?.venue_category]||'📍';
    const action={'CRITICAL':'Immediate Response','HIGH':'Deploy Officers','ELEVATED':'Routine Patrol','NORMAL':'No Action'}[flag];
    const div=document.createElement('div');
    div.style.cssText='background:var(--bg3);border:1px solid var(--bdr);border-radius:8px;padding:12px;text-align:center;cursor:pointer;transition:all .15s;';
    div.onmouseenter=()=>div.style.borderColor='var(--bdr2)';
    div.onmouseleave=()=>div.style.borderColor='var(--bdr)';
    div.innerHTML=`<div style="font-size:16px;margin-bottom:4px;">${icon}</div>
      <div style="font-family:var(--mono);font-size:9px;color:var(--t3);margin-bottom:5px;letter-spacing:.05em;">${vn.split(' ').slice(-1)[0].toUpperCase()}</div>
      <div style="font-family:var(--disp);font-size:24px;font-weight:700;color:${col};margin-bottom:3px;">${proj}</div>
      <div style="font-size:9px;color:var(--t3);margin-bottom:6px;">Projected density (20–23h)</div>
      <span class="tag ${flag==='CRITICAL'?'tag-critical':flag==='HIGH'?'tag-high':flag==='ELEVATED'?'tag-elevated':'tag-normal'}" style="font-size:8px;">${flag}</span>
      <div style="font-size:9px;color:var(--t2);margin-top:5px;">${action}</div>
      <div style="margin-top:8px;height:3px;background:rgba(255,255,255,.06);border-radius:2px;overflow:hidden;"><div style="width:${proj}%;height:100%;background:linear-gradient(90deg,#003366,${col});border-radius:2px;"></div></div>`;
    div.onclick=()=>goInvestigate(vn);
    grid.appendChild(div);
  });
}

function renderFcWknd(data){
  const wd=data.filter(d=>!d.is_weekend),we=data.filter(d=>d.is_weekend);
  const hours=Array.from({length:24},(_,i)=>i);
  const wdV=hours.map(h=>{const a=wd.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  const weV=hours.map(h=>{const a=we.filter(d=>d.hour_of_day===h).map(d=>d.crowd_density);return a.length?+avg(a).toFixed(1):null;});
  destroyC('fcW');const ctx=document.getElementById('ch-fc-wknd')?.getContext('2d');if(!ctx)return;
  CH.fcW=new Chart(ctx,{type:'line',data:{labels:hours.map(h=>fmtH(h)),datasets:[{label:'Weekday Baseline',data:wdV,borderColor:'#00c8ff',backgroundColor:'rgba(0,200,255,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,spanGaps:true},{label:'Weekend Baseline',data:weV,borderColor:'#ff3355',backgroundColor:'rgba(255,51,85,.08)',fill:true,tension:.4,borderWidth:2,pointRadius:3,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:sx(),y:sy('Density',0,105)}}});
}

function renderFcRisk(data){
  const hours=Array.from({length:24},(_,i)=>i);
  const critV=hours.map(h=>data.filter(d=>d.hour_of_day===h&&d.incident_flag==='CRITICAL').length);
  const highV=hours.map(h=>data.filter(d=>d.hour_of_day===h&&d.incident_flag==='HIGH').length);
  destroyC('fcRisk');const ctx=document.getElementById('ch-fc-risk')?.getContext('2d');if(!ctx)return;
  CH.fcRisk=new Chart(ctx,{type:'bar',data:{labels:hours.map(h=>fmtH(h)),datasets:[{label:'Critical',data:critV,backgroundColor:'rgba(255,0,51,.7)',borderColor:'#ff0033',borderWidth:1,borderRadius:2,borderSkipped:false},{label:'High',data:highV,backgroundColor:'rgba(255,51,85,.5)',borderColor:'#ff3355',borderWidth:1,borderRadius:2,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt()}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:0}},y:sy('Events')}}});
}

function renderFcZone(data){
  const zones=[...new Set(data.map(d=>d.patrol_zone))].sort();
  const hours=[18,19,20,21,22,23];
  const zoneAvgs=zones.map(z=>{
    const zd=data.filter(d=>d.patrol_zone===z&&hours.includes(d.hour_of_day));
    return zd.length?+avg(zd.map(d=>d.crowd_density)).toFixed(1):0;
  });
  destroyC('fcZone');const ctx=document.getElementById('ch-fc-zone')?.getContext('2d');if(!ctx)return;
  CH.fcZone=new Chart(ctx,{type:'bar',data:{labels:zones.map(z=>z.split('—')[0].trim()),datasets:[{label:'Projected Evening Density',data:zoneAvgs,backgroundColor:zones.map(z=>(ZONE_COLS[z]||'#00c8ff')+'88'),borderColor:zones.map(z=>ZONE_COLS[z]||'#00c8ff'),borderWidth:1.5,borderRadius:4,borderSkipped:false}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` Projected density: ${ctx.parsed.y}`}}},scales:{x:{...sx(),ticks:{...sx().ticks,maxRotation:20}},y:{...sy('Avg Density'),min:0,max:100}}}});
}

/* ════════ INVESTIGATION ════════ */
function initInvestigation(){
  const pop=(id,vals)=>{const el=document.getElementById(id);if(el&&el.options.length<=1)vals.forEach(v=>el.add(new Option(v,v)));};
  pop('inv-venue',[...new Set(allData.map(d=>d.venue_name))].sort());
  const ih=document.getElementById('inv-hour');
  if(ih&&ih.options.length<=1)[...new Set(allData.map(d=>d.hour_of_day))].sort((a,b)=>a-b).forEach(h=>ih.add(new Option(fmtH(h),h)));
  sh('inv-ready',true);sh('inv-results',false);sh('inv-noresults',false);
  set('inv-count','');document.getElementById('inv-risk-wrap').innerHTML='';
}

function runInvestigation(){
  const venue=v('inv-venue'),day=v('inv-day'),zone=v('inv-zone'),flag=v('inv-flag');
  const hourRaw=document.getElementById('inv-hour')?.value;
  const hour=(hourRaw!==''&&hourRaw!=null)?+hourRaw:null;
  const exact=allData.filter(d=>{
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
  const scored=allData.map(d=>{
    let score=0;
    if(venue&&d.venue_name===venue)score+=10;
    else if(venueCat&&d.venue_category===venueCat)score+=3;
    if(day&&d.day_of_week===day)score+=4;
    if(hour!==null){const diff=Math.abs(d.hour_of_day-hour);if(diff===0)score+=5;else if(diff<=1)score+=3;else if(diff<=3)score+=1;}
    if(zone&&d.patrol_zone===zone)score+=2;
    if(flag&&d.incident_flag===flag)score+=3;
    return{...d,_score:score};
  }).filter(d=>(venue&&d.venue_name===venue)||(venueCat&&d.venue_category===venueCat&&day&&d.day_of_week===day)||(!venue&&!venueCat&&d._score>0)).sort((a,b)=>b._score-a._score).slice(0,60);
  const nearbyVenues=venueCat?[...new Set(allData.filter(d=>d.venue_category===venueCat&&d.venue_name!==venue).map(d=>d.venue_name))]:[];
  renderInvAll(scored,{venue,day,hour,zone,flag,fallback:true,nearbyVenues,originalFilters:{venue,day,hour,zone,flag}});
}

function resetInvestigation(){
  ['inv-venue','inv-day','inv-hour','inv-zone','inv-flag'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  set('inv-count','');sh('inv-ready',true);sh('inv-results',false);sh('inv-noresults',false);
  const fs=document.getElementById('inv-fallback-section');if(fs)fs.style.display='none';
  document.getElementById('inv-risk-wrap').innerHTML='';
  ['ivH','ivDD','ivDw','ivTL','ivNearby'].forEach(k=>destroyC(k));
}

function renderInvAll(results,filters){
  renderInvKPIs(results,filters);renderInvSummary(results,filters);renderInvInsights(results,filters);
  renderInvHourChart(results);renderInvDensDonut(results);renderInvDwellDonut(results);
  renderInvTimeline(results);renderInvTable(results,filters);
  const fs=document.getElementById('inv-fallback-section');
  if(filters.fallback&&fs){fs.style.display='block';renderInvFallbackBanner(filters);renderNearbyActivity(filters);renderRecentPatterns(results);}
  else if(fs)fs.style.display='none';
}

function renderInvKPIs(results,filters={}){
  const el=document.getElementById('inv-kpi-row');if(!el)return;
  const isFb=filters.fallback||false;
  const uniqU=new Set(results.map(d=>d.user_id)).size,uniqV=new Set(results.map(d=>d.venue_name)).size;
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length;
  const high=results.filter(d=>d.incident_flag==='HIGH').length;
  const avgD=avg(results.map(d=>d.crowd_density)).toFixed(1);
  const riskLevel=crit/results.length>.2?'CRITICAL':high/results.length>.3?'HIGH':(crit+high)/results.length>.1?'ELEVATED':'NORMAL';
  const riskCol=FLAG_COL[riskLevel];
  document.getElementById('inv-risk-wrap').innerHTML=`<span class="risk-badge risk-${riskLevel==='CRITICAL'||riskLevel==='HIGH'?'high':'low'}" style="color:${riskCol};border-color:${riskCol}44;background:${riskCol}18;">${riskLevel==='CRITICAL'||riskLevel==='HIGH'?'⚠':riskLevel==='ELEVATED'?'👁':'✓'} ${riskLevel} RISK</span>`;
  el.innerHTML=`
    <div class="kpi" style="--kc:var(--cyan);--kb:rgba(0,200,255,.08)"><div class="kpi-ico">👥</div><div><div class="kpi-lbl">${isFb?'Users in Related':'People Present'}</div><div class="kpi-val" style="color:var(--cyan);">${uniqU.toLocaleString()}</div><div class="kpi-sub">${results.length.toLocaleString()} check-in events</div></div></div>
    <div class="kpi" style="--kc:var(--red);--kb:rgba(255,51,85,.08)"><div class="kpi-ico">🚨</div><div><div class="kpi-lbl">Critical Events</div><div class="kpi-val" style="color:var(--red);">${crit}</div><div class="kpi-sub">${high} high risk events</div></div></div>
    <div class="kpi" style="--kc:${FLAG_COL[riskLevel]};--kb:rgba(0,200,255,.08)"><div class="kpi-ico">⚡</div><div><div class="kpi-lbl">Avg Crowd Density</div><div class="kpi-val" style="color:${FLAG_COL[riskLevel==='CRITICAL'||riskLevel==='HIGH'?riskLevel:'ELEVATED']};">${avgD}</div><div class="kpi-sub">across records</div></div></div>
    <div class="kpi" style="--kc:var(--green);--kb:rgba(0,255,136,.08)"><div class="kpi-ico">📍</div><div><div class="kpi-lbl">${isFb?'Related Venues':'Venues'}</div><div class="kpi-val" style="color:var(--green);">${uniqV}</div><div class="kpi-sub">${[...new Set(results.map(d=>d.patrol_zone))].length} patrol zones</div></div></div>`;
}

function renderInvSummary(results,filters){
  const el=document.getElementById('inv-summary'),riskEl=document.getElementById('inv-risk-inner');if(!el)return;
  const uniqU=new Set(results.map(d=>d.user_id)).size,uniqV=new Set(results.map(d=>d.venue_name)).size;
  const avgD=avg(results.map(d=>d.crowd_density)).toFixed(1),avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length;
  const venueList=[...new Set(results.map(d=>d.venue_name))].join(', ');
  const hcnt={};results.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  const wm={};results.forEach(d=>{wm[d.weather_condition]=(wm[d.weather_condition]||0)+1;});
  const topW=Object.entries(wm).sort((a,b)=>b[1]-a[1])[0];
  const spikes=results.filter(d=>d.incident_flag==='CRITICAL').map(d=>fmtH(d.hour_of_day));
  const uniqueSpikeTimes=[...new Set(spikes)].slice(0,4);
  const riskLevel=crit/results.length>.2?'CRITICAL':crit>0?'HIGH':'ELEVATED';
  if(riskEl)riskEl.innerHTML=`<span class="risk-badge" style="color:${FLAG_COL[riskLevel]};border-color:${FLAG_COL[riskLevel]}44;background:${FLAG_COL[riskLevel]}18;font-size:10px;">${riskLevel}</span>`;
  const pill=(txt,col='var(--cyan)')=>`<span style="display:inline-flex;padding:1px 8px;background:rgba(0,200,255,.08);border-radius:100px;font-family:var(--mono);font-size:11px;color:${col};margin:0 2px;">${txt}</span>`;
  const fdesc=[filters.venue?`Venue: <b>${filters.venue}</b>`:null,filters.day?`Day: <b>${filters.day}</b>`:null,filters.hour!=null?`Hour: <b>${fmtH(filters.hour)}</b>`:null,filters.zone?`Zone: <b>${filters.zone}</b>`:null,filters.flag?`Risk: <b>${filters.flag}</b>`:null].filter(Boolean).join(' · ')||'All records';
  el.innerHTML=`
    <div style="font-family:var(--mono);font-size:9px;color:var(--t3);padding:5px 8px;background:rgba(255,255,255,.02);border-radius:3px;margin-bottom:10px;">${fdesc}</div>
    <div style="font-size:12.5px;line-height:1.85;color:var(--t2);">
      <b style="color:var(--t1);">Who was present:</b> ${pill(uniqU+' individuals')} across ${pill(results.length+' check-ins')} at ${pill(uniqV+' venue(s)')}<br/>
      <span style="font-size:10px;color:var(--t3);">${venueList}</span><br/>
      <b style="color:var(--t1);">Crowd conditions:</b> Avg density ${pill(avgD)} · Avg dwell ${pill(avgDw+' min')} · ${pill(crit+' critical events','#ff0033')}<br/>
      <b style="color:var(--t1);">Peak activity:</b> ${pill(pkH?fmtH(+pkH[0]):'—')} with ${pkH?pkH[1]:0} check-ins · Weather: ${pill(topW?.[0]??'—')}
    </div>
    ${uniqueSpikeTimes.length>0
      ?`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:8px;background:rgba(255,0,51,.1);border:1px solid rgba(255,0,51,.25);border-radius:5px;"><span>🚨</span><span style="color:#ff0033;font-size:12px;font-weight:700;">CRITICAL density spikes at: ${uniqueSpikeTimes.join(', ')} — Immediate response recommended.</span></div>`
      :`<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:8px;background:rgba(0,255,136,.05);border:1px solid rgba(0,255,136,.15);border-radius:5px;"><span>✓</span><span style="color:var(--green);font-size:12px;">No critical spikes detected. Crowd density within acceptable parameters.</span></div>`}`;
}

function renderInvInsights(results,filters={}){
  const el=document.getElementById('inv-insights');if(!el)return;
  const uniqU=new Set(results.map(d=>d.user_id)).size;
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length;
  const vm={};results.forEach(d=>{if(!vm[d.venue_name])vm[d.venue_name]={dens:[],cat:d.venue_category,zone:d.patrol_zone};vm[d.venue_name].dens.push(d.crowd_density);});
  const topV=Object.entries(vm).sort((a,b)=>avg(b[1].dens)-avg(a[1].dens))[0];
  const hcnt={};results.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
  const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
  const wknd=results.filter(d=>d.is_weekend).length,wkdy=results.filter(d=>!d.is_weekend).length;
  const avgDw=avg(results.map(d=>d.avg_dwell_minutes)).toFixed(0);
  const zones=[...new Set(results.map(d=>d.patrol_zone))];
  const actTypes={};results.forEach(d=>{actTypes[d.activity_type]=(actTypes[d.activity_type]||0)+1;});
  const topAct=Object.entries(actTypes).sort((a,b)=>b[1]-a[1])[0];
  const ins=[
    {ic:'👥',lbl:'Persons of Interest',val:`${uniqU} unique IDs across ${results.length} events`,badge:uniqU>50?'High Volume':'Normal',bc:uniqU>50?'var(--amber)':'var(--green)'},
    {ic:'🚨',lbl:'Critical Incidents',val:`${crit} events above density 85`,badge:`${(crit/results.length*100).toFixed(0)}% rate`,bc:crit/results.length>.2?'#ff0033':'var(--amber)'},
    {ic:'📍',lbl:'Highest Risk Location',val:topV?`${topV[0]} (${topV[1].zone.split('—')[0].trim()})`:'—',badge:`Avg ${avg(topV?.[1]?.dens||[0]).toFixed(0)}`,bc:'var(--red)'},
    {ic:'🕐',lbl:'Peak Incident Window',val:pkH?`${fmtH(+pkH[0])} — ${pkH[1]} events`:'—',badge:'Deploy Here',bc:'var(--cyan)'},
    {ic:'📅',lbl:'Day Pattern',val:`${wknd} weekend · ${wkdy} weekday events`,badge:wknd>wkdy?'Weekend Heavy':'Weekday Heavy',bc:wknd>wkdy?'var(--red)':'var(--cyan)'},
    {ic:'🎭',lbl:'Top Activity Type',val:topAct?`${topAct[0]} — ${topAct[1]} events`:'—',badge:'Context',bc:'var(--purp)'},
  ];
  el.innerHTML=ins.map(i=>`<div class="inv-insight-item"><div style="font-size:14px;">${i.ic}</div><div style="flex:1;min-width:0;"><div style="font-size:11px;font-weight:600;color:var(--t1);">${i.lbl}</div><div style="font-size:11px;color:var(--t2);">${i.val}</div></div><div style="font-size:11px;font-weight:700;font-family:var(--mono);color:${i.bc};flex-shrink:0;">${i.badge}</div></div>`).join('');
}

function renderInvHourChart(data){
  const hm={};for(let h=0;h<24;h++)hm[h]={cnt:0,dens:[],crit:0};
  data.forEach(d=>{hm[d.hour_of_day].cnt++;hm[d.hour_of_day].dens.push(d.crowd_density);if(d.incident_flag==='CRITICAL')hm[d.hour_of_day].crit++;});
  const labels=Array.from({length:24},(_,h)=>fmtH(h)),cnts=Array.from({length:24},(_,h)=>hm[h].cnt),crits=Array.from({length:24},(_,h)=>hm[h].crit),dens=Array.from({length:24},(_,h)=>hm[h].dens.length?+avg(hm[h].dens).toFixed(1):0);
  const maxC=Math.max(...cnts,1);
  const top3=cnts.map((c,h)=>({h,c})).sort((a,b)=>b.c-a.c).filter(x=>x.c>0).slice(0,3).map(x=>fmtH(x.h));
  set('inv-hour-sub',top3.length?'Busiest: '+top3.join(', '):'');
  destroyC('ivH');const ctx=document.getElementById('inv-ch-hour')?.getContext('2d');if(!ctx)return;
  ICH.ivH=new Chart(ctx,{type:'bar',data:{labels,datasets:[
    {label:'Check-ins',data:cnts,backgroundColor:cnts.map((val,i)=>hm[i]?.crit>0?'rgba(255,0,51,.8)':val/maxC>.4?'rgba(255,170,0,.75)':val>0?'rgba(0,200,255,.6)':'rgba(0,200,255,.1)'),borderRadius:3,borderSkipped:false,yAxisID:'y'},
    {label:'Avg Density',data:dens,type:'line',borderColor:'#00ff88',backgroundColor:'transparent',borderWidth:2,pointRadius:3,pointBackgroundColor:dens.map(v=>v>=85?'#ff0033':v>=70?'#ff3355':'#00ff88'),tension:.4,yAxisID:'y2'}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:10},boxWidth:8}},tooltip:{...tt(),callbacks:{label:ctx=>ctx.datasetIndex===0?` ${ctx.parsed.y} check-ins`:` Avg density: ${ctx.parsed.y}`}}},scales:{x:sx(),y:{...sy('Check-ins'),position:'left'},y2:{position:'right',grid:{display:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9}},min:0,max:105}}}});
}

function renderInvDensDonut(data){
  const crit=data.filter(d=>d.incident_flag==='CRITICAL').length,high=data.filter(d=>d.incident_flag==='HIGH').length,elev=data.filter(d=>d.incident_flag==='ELEVATED').length,norm=data.filter(d=>d.incident_flag==='NORMAL').length,tot=data.length||1;
  const cols=['#ff0033','#ff3355','#ffaa00','#00ff88'];
  destroyC('ivDD');const ctx=document.getElementById('inv-ch-dens-donut')?.getContext('2d');if(!ctx)return;
  ICH.ivDD=new Chart(ctx,{type:'doughnut',data:{labels:['Critical','High','Elevated','Normal'],datasets:[{data:[crit,high,elev,norm],backgroundColor:cols,borderColor:'rgba(5,8,16,.8)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'68%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('inv-dens-legend').innerHTML=[{l:'Crit',v:crit,c:'#ff0033'},{l:'High',v:high,c:'#ff3355'},{l:'Elev',v:elev,c:'#ffaa00'},{l:'Norm',v:norm,c:'#00ff88'}].map(x=>`<div style="display:flex;align-items:center;gap:3px;font-size:9px;"><div style="width:6px;height:6px;border-radius:50%;background:${x.c};"></div><span style="color:var(--t3);">${x.l}</span><span style="color:${x.c};font-weight:700;font-family:var(--mono);">${(x.v/tot*100).toFixed(0)}%</span></div>`).join('');
}

function renderInvDwellDonut(data){
  const b={'<30m':0,'30–60m':0,'60–90m':0,'90–120m':0,'>120m':0};
  data.forEach(d=>{const dw=d.avg_dwell_minutes;if(dw<30)b['<30m']++;else if(dw<60)b['30–60m']++;else if(dw<90)b['60–90m']++;else if(dw<120)b['90–120m']++;else b['>120m']++;});
  const cols=['#00c8ff','#00ff88','#ffaa00','#ff3355','#9b59ff'],tot=data.length||1;
  destroyC('ivDw');const ctx=document.getElementById('inv-ch-dwell')?.getContext('2d');if(!ctx)return;
  ICH.ivDw=new Chart(ctx,{type:'doughnut',data:{labels:Object.keys(b),datasets:[{data:Object.values(b),backgroundColor:cols,borderColor:'rgba(5,8,16,.8)',borderWidth:3}]},options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false},tooltip:{...tt(),callbacks:{label:ctx=>` ${ctx.label}: ${ctx.parsed} (${(ctx.parsed/tot*100).toFixed(0)}%)`}}}}});
  document.getElementById('inv-dwell-legend').innerHTML=Object.keys(b).map((lbl,i)=>`<div style="display:flex;align-items:center;gap:3px;font-size:9px;"><div style="width:6px;height:6px;border-radius:50%;background:${cols[i]};"></div><span style="color:var(--t3);">${lbl}</span><span style="color:${cols[i]};font-weight:700;font-family:var(--mono);">${(b[lbl]/tot*100).toFixed(0)}%</span></div>`).join('');
}

function renderInvTimeline(data){
  const sorted=[...data].sort((a,b)=>a.timestamp<b.timestamp?-1:1);
  const vals=sorted.map(d=>d.crowd_density);
  destroyC('ivTL');const ctx=document.getElementById('inv-ch-timeline')?.getContext('2d');if(!ctx)return;
  ICH.ivTL=new Chart(ctx,{type:'line',data:{labels:sorted.map(d=>d.timestamp.slice(0,10)),datasets:[
    {label:'Crowd Density',data:vals,borderColor:'#00c8ff',backgroundColor:grad(ctx,'rgba(0,200,255,.15)','rgba(0,200,255,.01)'),fill:true,tension:.35,borderWidth:1.5,pointRadius:vals.map(val=>val>=85?6:val>=70?4:0),pointBackgroundColor:vals.map(val=>val>=85?'#ff0033':val>=70?'#ff3355':'#00c8ff'),pointBorderColor:'#fff',pointBorderWidth:1.5},
    {label:'Critical Threshold (85)',data:Array(vals.length).fill(85),borderColor:'rgba(255,0,51,.5)',borderDash:[4,4],borderWidth:1.5,pointRadius:0,fill:false},
    {label:'High Risk (70)',data:Array(vals.length).fill(70),borderColor:'rgba(255,51,85,.3)',borderDash:[3,5],borderWidth:1,pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:true,labels:{color:'#7a9bb5',font:{family:'monospace',size:9},boxWidth:7}},tooltip:{...tt(),callbacks:{title:items=>`${sorted[items[0].dataIndex]?.venue_name} — Record ${items[0].dataIndex+1}`,label:ctx=>ctx.datasetIndex===0?[` Density: ${ctx.parsed.y}`,` Flag: ${sorted[ctx.dataIndex]?.incident_flag}`,` User: ${sorted[ctx.dataIndex]?.user_id}`,` ${sorted[ctx.dataIndex]?.timestamp}`]:` ${ctx.dataset.label}: ${ctx.parsed.y}`}}},scales:{x:{display:false},y:sy('Density',0,110)}}});
}

function renderInvTable(results,filters={}){
  const isFb=filters.fallback||false;
  set('inv-table-count','('+(isFb?results.length.toLocaleString()+' related':results.length.toLocaleString()+' records')+')');
  const ft=document.getElementById('inv-fallback-tag');if(ft)ft.style.display=isFb?'inline':'none';
  document.getElementById('inv-tbody').innerHTML=results.map(d=>{
    const fc=FLAG_CLASS[d.incident_flag]||'dp-normal';
    const isCrit=d.incident_flag==='CRITICAL';
    return `<tr style="${isCrit?'background:rgba(255,0,51,.05);':''}">
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--mono);font-size:10px;color:var(--t3);">${d.checkin_id}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--mono);color:#00c8ff;font-weight:600;">${d.user_id}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-weight:600;">${d.venue_name}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.venue_category}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--mono);font-size:11px;">${d.timestamp}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);"><span class="${fc}">${d.incident_flag}${isCrit?' ⚑':''}</span></td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--mono);font-weight:700;color:${FLAG_COL[d.incident_flag]||'var(--t2)'};">${d.crowd_density}%</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--mono);">${d.avg_dwell_minutes}m</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.day_of_week}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);font-family:var(--mono);color:var(--t3);">${fmtH(d.hour_of_day)}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--purp);font-size:11px;">${d.patrol_zone.split('—')[0].trim()}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);font-size:11px;">${d.activity_type}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:${FLAG_COL[d.incident_flag]||'var(--t2)'};font-size:11px;font-weight:600;">${d.officer_action}</td>
      <td style="padding:7px 12px;border-bottom:1px solid rgba(255,255,255,.03);color:var(--t2);">${d.weather_condition}</td>
    </tr>`;
  }).join('');
}

function renderInvFallbackBanner(filters){
  const el=document.getElementById('inv-fallback-banner');if(!el)return;
  const of=filters.originalFilters||{};
  const parts=[of.venue?`<b>${of.venue}</b>`:null,of.day?`<b>${of.day}</b>`:null,of.hour!=null?`<b>${fmtH(of.hour)}</b>`:null,of.zone?`<b>${of.zone}</b>`:null,of.flag?`<b>${of.flag}</b>`:null].filter(Boolean).join(' · ');
  el.innerHTML=`<div style="display:flex;align-items:flex-start;gap:12px;"><div style="font-size:20px;">⊘</div><div style="flex:1;"><div style="font-size:13px;font-weight:700;color:var(--t1);margin-bottom:4px;">No exact records for: ${parts}</div><div style="font-size:12px;color:var(--t2);line-height:1.6;">Auto-expanded to show closest matching activity — nearby venues, similar time windows, and related crowd patterns to support your investigation.</div></div><span style="font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;padding:3px 10px;background:rgba(255,170,0,.1);color:var(--amber);border:1px solid rgba(255,170,0,.3);border-radius:4px;flex-shrink:0;white-space:nowrap;">Fallback Mode</span></div>`;
}

function renderNearbyActivity(filters){
  const el=document.getElementById('inv-nearby-activity');if(!el)return;
  const nv=filters.nearbyVenues||[];
  if(!nv.length){el.innerHTML='<div style="color:var(--t3);font-size:12px;text-align:center;padding:16px;">No nearby venues found</div>';return;}
  el.innerHTML=nv.slice(0,5).map(vname=>{
    const vd=allData.filter(d=>d.venue_name===vname);
    const ad=avg(vd.map(d=>d.crowd_density));
    const ord2={'CRITICAL':4,'HIGH':3,'ELEVATED':2,'NORMAL':1};
    const topFlag=vd.sort((a,b)=>ord2[b.incident_flag]-ord2[a.incident_flag])[0]?.incident_flag||'NORMAL';
    const col=FLAG_COL[topFlag],icon=VENUE_ICONS[vd[0]?.venue_category]||'📍';
    const hcnt={};vd.forEach(d=>{hcnt[d.hour_of_day]=(hcnt[d.hour_of_day]||0)+1;});
    const pkH=Object.entries(hcnt).sort((a,b)=>b[1]-a[1])[0];
    return `<div style="display:flex;align-items:center;gap:10px;padding:9px 10px;background:var(--bg3);border-radius:6px;border:1px solid var(--bdr);margin-bottom:7px;cursor:pointer;border-left:3px solid ${col};" onclick="goInvestigate('${vname}')">
      <div style="font-size:16px;">${icon}</div>
      <div style="flex:1;min-width:0;"><div style="font-size:12.5px;font-weight:600;">${vname}</div><div style="font-size:10px;color:var(--t3);">Peak: ${pkH?fmtH(+pkH[0]):'—'} · ${vd[0]?.patrol_zone?.split('—')[0].trim()||''}</div></div>
      <div style="text-align:right;flex-shrink:0;"><span class="tag ${topFlag==='CRITICAL'?'tag-critical':topFlag==='HIGH'?'tag-high':topFlag==='ELEVATED'?'tag-elevated':'tag-normal'}">${topFlag}</span><div style="font-family:var(--mono);font-size:14px;font-weight:700;color:${col};margin-top:3px;">${ad.toFixed(0)}%</div></div>
    </div>`;
  }).join('');
}

function renderRecentPatterns(results){
  const el=document.getElementById('inv-recent-patterns');if(!el)return;
  destroyC('ivNearby');
  const crit=results.filter(d=>d.incident_flag==='CRITICAL').length,high=results.filter(d=>d.incident_flag==='HIGH').length,norm=results.filter(d=>d.incident_flag==='NORMAL'||d.incident_flag==='ELEVATED').length,tot=results.length||1;
  const hm={};for(let h=0;h<24;h++)hm[h]=[];results.forEach(d=>hm[d.hour_of_day].push(d.crowd_density));
  const labels=Array.from({length:24},(_,h)=>fmtH(h)),vals=Array.from({length:24},(_,h)=>hm[h].length?+avg(hm[h]).toFixed(1):null);
  el.innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px;margin-bottom:12px;">
      <div style="background:rgba(255,0,51,.1);border:1px solid rgba(255,0,51,.2);border-radius:6px;padding:10px;text-align:center;"><div style="font-family:var(--disp);font-size:22px;font-weight:700;color:#ff0033;">${crit}</div><div style="font-family:var(--mono);font-size:9px;color:var(--t2);margin-top:2px;">CRITICAL</div><div style="font-size:9px;color:#ff0033;">${(crit/tot*100).toFixed(0)}%</div></div>
      <div style="background:rgba(255,51,85,.08);border:1px solid rgba(255,51,85,.2);border-radius:6px;padding:10px;text-align:center;"><div style="font-family:var(--disp);font-size:22px;font-weight:700;color:var(--red);">${high}</div><div style="font-family:var(--mono);font-size:9px;color:var(--t2);margin-top:2px;">HIGH RISK</div><div style="font-size:9px;color:var(--red);">${(high/tot*100).toFixed(0)}%</div></div>
      <div style="background:rgba(0,255,136,.06);border:1px solid rgba(0,255,136,.15);border-radius:6px;padding:10px;text-align:center;"><div style="font-family:var(--disp);font-size:22px;font-weight:700;color:var(--green);">${norm}</div><div style="font-family:var(--mono);font-size:9px;color:var(--t2);margin-top:2px;">NORMAL/ELEV</div><div style="font-size:9px;color:var(--green);">${(norm/tot*100).toFixed(0)}%</div></div>
    </div>
    <div style="height:85px;position:relative;"><canvas id="inv-ch-nearby"></canvas></div>`;
  requestAnimationFrame(()=>{
    const ctx2=document.getElementById('inv-ch-nearby')?.getContext('2d');if(!ctx2)return;
    ICH.ivNearby=new Chart(ctx2,{type:'line',data:{labels,datasets:[{label:'Related Density',data:vals,borderColor:'#9b59ff',backgroundColor:grad(ctx2,'rgba(155,89,255,.2)','rgba(155,89,255,.01)'),fill:true,tension:.4,pointRadius:2,borderWidth:2,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{...tt()}},scales:{x:sx(),y:sy('',0,105)}}});
  });
}

/* ════════ HELPERS ════════ */
function fmtH(h){if(h===0)return'12AM';if(h<12)return h+'AM';if(h===12)return'12PM';return(h-12)+'PM';}
function avg(arr){if(!arr.length)return 0;return arr.reduce((s,val)=>s+val,0)/arr.length;}
function v(id){return document.getElementById(id)?.value||'';}
function set(id,txt){const el=document.getElementById(id);if(el)el.textContent=txt;}
function sh(id,visible){const el=document.getElementById(id);if(el)el.style.display=visible?'block':'none';}
function hmC(n){if(n===0)return'rgba(4,8,15,.4)';if(n<.2)return`rgba(0,20,60,${.3+n*2})`;if(n<.5)return`rgba(0,80,180,${.35+n*.6})`;if(n<.8)return`rgba(255,170,0,${.5+n*.45})`;return`rgba(255,0,51,${.6+n*.4})`;}
function grad(ctx,top,bottom){const g=ctx.createLinearGradient(0,0,0,300);g.addColorStop(0,top);g.addColorStop(1,bottom);return g;}
function destroyC(k){if(CH[k]){CH[k].destroy();delete CH[k];}if(ICH[k]){ICH[k].destroy();delete ICH[k];}}
function sx(){return{grid:{color:'rgba(0,200,255,.05)',drawBorder:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9},maxRotation:0}};}
function sy(label='',mn=0,mx=undefined){return{grid:{color:'rgba(0,200,255,.05)',drawBorder:false},ticks:{color:'#3a5570',font:{family:'monospace',size:9}},min:mn,...(mx!==undefined?{max:mx}:{}),beginAtZero:true,title:{display:!!label,text:label,color:'#3a5570',font:{family:'monospace',size:9}}};}
function tt(){return{backgroundColor:'rgba(5,8,16,.97)',borderColor:'rgba(0,200,255,.2)',borderWidth:1,titleColor:'#e8f4ff',bodyColor:'#7a9bb5',titleFont:{family:'Rajdhani',size:12,weight:700},bodyFont:{family:'monospace',size:10},padding:10,cornerRadius:6,displayColors:true,boxWidth:7,boxHeight:7};}
