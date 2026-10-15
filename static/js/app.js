
let role='';
const RULES=[/.{8,}/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/];
function chk(){const v=pw.value;[...rq.children].forEach((l,i)=>l.className=RULES[i].test(v)?'ok':'');return RULES.every(r=>r.test(v))}
function fill(u){em.value=u+'@novair.com';pw.value='NOVAIR@2026';chk();er.textContent=''}
async function api(url,body,method){const o={method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'}};if(body)o.body=JSON.stringify(body);
 const r=await fetch(url,o),j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('Request failed ('+r.status+')'));return j}
async function refresh(){const st=await api('/api/state');D=st.districts;INC=st.incidents;AL=st.alerts;ASSIGN=st.assignments;DEM=st.dem;FEED=st.feed;LOG=st.invlog}
async function login(){try{const e=em.value.trim().toLowerCase();if(!chk())return er.textContent='Password does not meet the requirements.';
 const r=await api('/api/login',{email:e,password:pw.value});role=r.role;await startApp()}catch(x){er.textContent=x.message}}
async function startApp(){await refresh();login_.style.display='none';app.style.display='flex';nav_();go(ALLOW[role][0])}
async function logout(){try{await api('/api/logout',{})}catch(x){}location.reload()}
const login_=document.getElementById('login');
// ---- sample data (SIMULATED) : name,pop(lakh),density,beds,ambulances,police,fire,rescue,shelterCap,gx,gy
let D=[];
const RC={Low:'#6aa84f',Medium:'#e6c229',High:'#e8892b',Critical:'#d03a35'};
let INC=[],AL=[],ASSIGN=[],SENS={wl:1.2,rain:14,temp:33,crowd:100};
const NAV=[['map','Live Map','#5964A8'],['report','Report Incident','#D95C5C'],['pred','Risk Forecast','#8767B7'],['res','Resources','#5487B8'],['resp','Responders','#4E9990'],['shel','Shelters','#D6A34A'],['inv','Inventory','#D9824B'],['mine','My Reports','#D95C5C'],['alerts','Alerts','#D96B68'],['data','Sample Data','#69727C'],['users','Users','#69727C']];
let cur='map',sel=null;
const ALLOW={Admin:['map','report','pred','res','resp','shel','inv','alerts','data','users'],Staff:['map','resp','inv','shel','alerts'],Citizen:['report','mine']},LBL={Admin:'Administrator',Staff:'Field Staff',Citizen:'Citizen'};let lastRef=0;
function nav_(){nv.innerHTML=`<div class="sub" style="padding:0 18px 12px">Signed in as <b>${LBL[role]}</b></div>`+NAV.filter(n=>ALLOW[role].includes(n[0])).map(n=>`<a id="n_${n[0]}" style="--ac:${n[2]}" onclick="go('${n[0]}')">${n[1]}</a>`).join('')+`<a onclick="logout()" style="color:#707070;margin-top:18px">Logout</a>`}
function vUsers(){const U=[['admin@novair.com','Administrator','Runs the platform: map, predictions, resources, alerts, data and users'],['staff@novair.com','Field Staff','Updates ambulance dispatch status and inventory stock'],['citizen@novair.com','Citizen','Reports incidents and tracks their own reports']];
return `<h2>Users</h2><table><tr><th>Email</th><th>Role</th><th>Access</th></tr>${U.map(u=>`<tr><td>${u[0]}</td><td>${u[1]}</td><td>${u[2]}</td></tr>`).join('')}</table>`}
function vMine(){const mine=INC.filter(x=>x.by=='Citizen');
 return `<h2>My Reports</h2>`+(lastRef?`<div class="card" style="border-left:5px solid #4E9990;margin-bottom:20px"><b>Report #${lastRef} received.</b><div class="sub">The response team has been notified.</div></div>`:'')+(mine.length?'<div class="gauto">'+mine.map(x=>`<div class="card rcard" style="--ac:#D95C5C"><div class="mrow" style="margin:0"><b>#${x.id} ${x.type}</b><span class="chip" style="background:#4E9990">Received</span></div><div style="margin:12px 0 4px;font-size:16px">${x.loc}</div><div class="sub">${x.d} · ${x.date} ${x.time}</div></div>`).join('')+'</div>':'<div class="card sub">You have not reported anything yet.</div>')}
function go(v){cur=v;document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('on',a.id=='n_'+v));draw()}
// ---- models
const f2=n=>Math.round(+n),r2=n=>+(+n).toFixed(2);
async function runPrediction(){const g=id=>document.getElementById(id).value,d=D.find(x=>x.n==g('dd')),type=g('ty'),rel=REL[type]||[],ms=document.getElementById('msg');
 const pk=(id,k,def)=>!rel.includes(k)?def:g(id)=='auto'?SENS[k]:+g(id);
 const area=g('ar')=='__o'?g('lc').trim():g('ar'),aff=+g('af');
 if(!area||!(aff>0))return ms.textContent='Choose or type an area and enter the number of people affected.';
 try{const r=await api('/api/incidents',{district:d.n,area,type,severity:+g('sv'),affected:aff,reported_injured:+g('ij'),water_level:pk('wl','wl',.5),rainfall:pk('rn','rain',0),temperature:pk('tp','temp',32),date:g('dt'),time:g('tm'),description:g('ds')});
  await refresh();sel=d.n;invD=d.n;if(role=='Citizen'){lastRef=r.incident_id;go('mine');return}go('map')}catch(x){ms.textContent=x.message}}
async function setSt(k,v){try{await api('/api/assignments/'+ASSIGN[k].id,{status:v},'PUT');await refresh();draw()}catch(x){alert(x.message)}}
function alertBadge(){const a=document.getElementById('n_alerts');if(a)a.textContent='Alerts'+(AL.length?` (${AL.length})`:'')}
// ---- views
const bar=(v,m,c)=>`<div class="bar"><i style="width:${Math.min(100,v/m*100)}%;background:${c}"></i></div>`;
const kv=(a,b)=>`<div class="kv"><span>${a}</span><b>${b}</b></div>`;
function draw(){const m=document.getElementById('mn');m.innerHTML='<div class="page" style="--pg:'+(NAV.find(n=>n[0]==cur)||[0,0,'#5964A8'])[2]+'">'+({map:vMap,report:vRep,pred:vPred,res:vRes,resp:vResp,mine:vMine,users:vUsers,det:vDet,shel:vShel,inv:vInv,alerts:vAl,data:vData})[cur]()+'</div>';if(cur=='report'&&['Admin','Citizen'].includes(role)){repDist();repType()}if(cur=='map')tick();if(cur=='map')document.getElementById('mn').querySelector('#side').innerHTML=side();alertBadge()}
const FLOW='';
const INAMES={kits:'Medical Kits',food:'Food Packets',water:'Water (L)',blk:'Blankets',eq:'Emergency Equipment'};let invD='Jaipur',LOG=[],DEM=[],FEED=[];function feed(t,by){FEED.unshift({t:new Date().toLocaleTimeString(),by:by||LBL[role],text:t})}
const REL={Flood:['wl','rain'],Fire:['temp'],Earthquake:[],Heatwave:['temp'],Storm:['rain'],Landslide:['rain'],'Industrial Accident':['temp'],Other:['wl','rain','temp']};
const needOf=(i,pr)=>({kits:Math.ceil(pr.inj*2),food:Math.ceil(i.aff*3),water:Math.ceil(i.aff*4),blk:Math.ceil(i.aff*.4),eq:Math.ceil(i.aff/500)});
const SC={Available:'#4E9990','Near Capacity':'#D6A34A',Full:'#d03a35',Emergency:'#d03a35'};
function vShel(){const cs=D.map(d=>{const dis=d.inc&&d.pr?Math.round(d.inc.i.aff*.4):0,occ=Math.min(d.shel,Math.round(d.shel*d.occ*.5)+dis),av=d.shel-occ,r=occ/d.shel,st=d.risk=='Critical'?'Emergency':r>=1?'Full':r>.8?'Near Capacity':'Available',c=SC[st];
return `<div class="card rcard" style="--ac:${c}"><div class="mrow" style="margin:0"><b>${d.n}</b><span class="chip" style="background:${c}">${st}</span></div><div class="big">${occ}<span class="sub"> / ${d.shel}</span></div>${bar(occ,d.shel,c)}<div class="mrow"><span>Available ${av}</span><span>Medical · Food · Water</span></div></div>`}).join('');
return `<h2>Shelters</h2><div class="gauto">${cs}</div>`}
function vInv(){const d=D.find(x=>x.n==invD),n=d.need||null,done=!!d.alloc;
const cs=Object.keys(INAMES).map(k=>{const st=d.inv[k],rq=n?n[k]:0,al=done?d.alloc[k]:0,sh=n?Math.max(0,rq-(done?al:st)):0,low=st<d.base[k]*.2,c=sh?'#d03a35':low?'#D6A34A':'#D9824B',lb=sh?'Shortage':low?'Low stock':'OK';
return `<div class="card rcard" style="--ac:${c}"><div class="mrow" style="margin:0"><b>${INAMES[k]}</b><span class="chip" style="background:${c}">${lb}</span></div><div class="big">${f2(st)}</div>${bar(st,d.base[k],c)}<div class="mrow"><span>Required ${n?f2(rq):'–'}</span><span>Allocated ${f2(al)}</span></div></div>`}).join('');
const lg=LOG.slice(0,6).map(l=>`<div class="li"><div><b>${l.act} · ${l.item}</b><div class="sub">${l.d} · ${l.q} · ${l.t} · ${l.by}</div></div></div>`).join('')||'<div class="sub">No stock changes yet.</div>';
return `<h2>Inventory</h2><div class="card tb"><select onchange="invD=this.value;draw()">${D.map(x=>`<option ${x.n==invD?'selected':''}>${x.n}</option>`).join('')}</select><span class="sub">${n?(done?'Stock allocated to the latest incident':'Incident here needs stock'):'No incident in this district'}</span><button onclick="allocInv()" ${n&&!done?'':'disabled style="opacity:.4"'}>Allocate stock to incident</button></div>
<div class="gauto">${cs}</div><div class="g2c"><div class="card"><h3>Update stock</h3><div class="g3"><label>Item<select id="ik">${Object.entries(INAMES).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><label>Action<select id="ia"><option>Add</option><option>Issue</option></select></label><label>Quantity<input id="iq" type="number" min="1"></label></div><div class="err" id="ierr"></div><button onclick="stockUpd()">Save</button></div><div class="card"><h3>Stock log</h3>${lg}</div></div>`}
async function stockUpd(){const g=id=>document.getElementById(id).value,e=document.getElementById('ierr'),q=+g('iq');if(!(q>0))return e.textContent='Enter a quantity above 0.';
 try{await api('/api/inventory',{district:invD,item:g('ik'),action:g('ia'),qty:q});await refresh();draw()}catch(x){e.textContent=x.message}}
async function allocInv(){try{await api('/api/inventory/allocate',{district:invD});await refresh();draw()}catch(x){alert(x.message)}}
function vMap(){const cnt=k=>D.filter(d=>d.risk==k).length;
const stats=`<div class="stats"><div class="stat" style="--ac:#d03a35"><span class="sub">Critical / High districts</span><b>${cnt('Critical')} / ${cnt('High')}</b></div><div class="stat" style="--ac:#D95C5C"><span class="sub">Active incidents</span><b>${INC.length}</b></div><div class="stat" style="--ac:#D96B68"><span class="sub">Alerts</span><b>${AL.length}</b></div><div class="stat" style="--ac:#5487B8"><span class="sub">Predicted injured (latest)</span><b>${INC[0]?f2(INC[0].pr.inj):'–'}</b></div></div>`;
const tiles=D.map(d=>`<g class="tile" data-n="${d.n}" onclick="pick_('${d.n}')"><rect x="${d.x*120+6}" y="${d.y*92+6}" width="108" height="80" rx="6" fill="${RC[d.risk]}" stroke="${sel==d.n?'#242424':'#fff'}" stroke-width="${sel==d.n?4:2}"/><text class="nm" x="${d.x*120+60}" y="${d.y*92+44}">${d.n}</text><text class="rk" x="${d.x*120+60}" y="${d.y*92+64}">${d.risk}</text></g>`).join('');
const legend=Object.entries(RC).map(([k,c])=>`<span style="margin-right:14px"><span class="b" style="background:${c}">&nbsp;</span> ${k}</span>`).join('')+' · Sample Data';
const ra=AL.slice(0,4).map(a=>`<div class="li"><span class="dot" style="background:${a.lvl=='CRITICAL'?'#d03a35':a.lvl=='HIGH'?'#e8892b':'#d6a34a'}"></span><div><b>${a.t}</b><div class="sub">${a.d}</div></div></div>`).join('')||'<div class="sub">No alerts yet.</div>';
const fu=FEED.slice(0,5).map(f=>`<div class="li"><div><b>${f.text}</b><div class="sub">${f.by} · ${f.t}</div></div></div>`).join('')||'<div class="sub">No updates yet.</div>';const ri=INC.slice(0,4).map(i=>`<div class="li"><span class="dot" style="background:${RC[i.pr.risk]}"></span><div><b>${i.type} – ${i.loc}</b><div class="sub">${i.d} · ${i.pr.risk}</div></div></div>`).join('')||'<div class="sub">No incidents yet.</div>';
return `<h2>Live Map</h2>${stats}<div class="gm"><div class="card"><svg viewBox="0 0 600 466" width="100%">${tiles}</svg><div class="sub" style="margin-top:8px">${legend}</div></div><div class="card" id="side">${side()}</div></div>
<div class="g2c" style="margin-top:20px"><div class="card"><h3>Simulated Sensor Readings</h3><div id="sens"></div></div><div class="card"><h3>Latest alerts</h3>${ra}</div><div class="card"><h3>Recent incidents</h3>${ri}</div><div class="card"><h3>Field updates</h3>${fu}</div></div>`}
function pick_(n){sel=n;document.querySelectorAll('.tile').forEach(g=>{const on=g.dataset.n==n,r=g.firstChild;r.setAttribute('stroke',on?'#242424':'#fff');r.setAttribute('stroke-width',on?4:2)});document.getElementById('side').innerHTML=side()}
function side(){const d=D.find(x=>x.n==sel);if(!d)return '<div class="sub">Select a district on the map.</div>';const p=d.pr,i=d.inc;
 const sh=p?Object.entries(p.dm).filter(([k,v])=>v[0]>v[1]).map(([k])=>k).join(', '):'';
 const act=!p?'Routine monitoring.':p.risk=='Critical'||p.risk=='High'?'Dispatch responders and open shelters.':'Monitor and keep teams on standby.';
 return `<h3 style="font-size:18px">${d.n} <span class="b" style="background:${RC[d.risk]}">${d.risk}</span></h3>`+kv('Population',d.pop+' lakh')+kv('Incident',i?i.type+' – '+i.loc:'None')+kv('Risk probability',p?(Math.max(...p.p)*100).toFixed(2)+'%':'–')+kv('People affected',i?i.i.aff:0)+kv('Injured (reported / predicted)',(i?i.rep:0)+' / '+(p?f2(p.inj):'–'))+kv('Beds / Ambulances',d.beds+' / '+d.amb)+kv('Shortages',sh||'None')+`<p class="sub" style="margin:12px 0"><b>Action:</b> ${act}</p><button onclick="vd('${d.n}')">View District Details</button>`}
function vd(n){sel=n;go('det')}
function vDet(){const d=D.find(x=>x.n==sel);if(!d)return'';const p=d.pr,i=d.inc;
 const sh=p?Object.entries(p.dm).filter(([k,v])=>v[0]>v[1]).map(([k,v])=>`${k} (−${f2(v[0]-v[1])})`).join(', '):'None';
 return `<h2>${d.n} <span class="b" style="background:${RC[d.risk]}">${d.risk}</span></h2><div class="row"><div class="card"><h3>District</h3>${kv('Population',d.pop+' lakh')}${kv('Density',d.den+' /km²')}${kv('Hospital beds',d.beds)}${kv('Ambulances',d.amb)}${kv('Police',d.pol)}${kv('Fire',d.fire)}${kv('Rescue teams',d.resc)}${kv('Shelter capacity',d.shel)}${kv('Areas',d.areas.join(', ')||'–')}</div>
 <div class="card"><h3>Current incident</h3>${i?kv('Type',i.type)+kv('Area',i.loc)+kv('Severity',i.i.sev+'/4')+kv('Risk probability',(Math.max(...p.p)*100).toFixed(2)+'%')+kv('People affected',i.i.aff)+kv('Injured (reported / predicted)',i.rep+' / '+f2(p.inj))+kv('Shortages',sh):'<div class="sub">No active incident.</div>'}</div></div><div style="margin-top:14px"><button class="alt" onclick="go('map')">Back to map</button></div>`}
function tick(){const e=document.getElementById('sens');if(e)e.innerHTML='<div class="g2c" style="gap:12px">'+[['Water level',SENS.wl.toFixed(2)+' m'],['Rainfall',SENS.rain.toFixed(2)+' mm/h'],['Temperature',SENS.temp.toFixed(2)+' °C'],['Crowd index',Math.round(SENS.crowd)]].map(([a,b])=>`<div class="mini"><span class="sub">${a}</span><b>${b}</b></div>`).join('')+'</div>'}
async function pollSensors(){try{Object.assign(SENS,await api('/api/sensors'));tick()}catch(x){}}
setInterval(()=>{if(role)pollSensors()},3000);
setInterval(()=>{const a=document.activeElement;if(role&&role!='Citizen'&&cur!='report'&&!(a&&a.matches&&a.matches('input,select,textarea')))refresh().then(draw).catch(()=>{})},10000);
function vRep(){if(!['Admin','Citizen'].includes(role))return'<p>Not permitted.</p>';const t=new Date(),sn=SENS,o=(a)=>a.map(x=>`<option value="${x[0]}">${x[1]}</option>`).join('');
return `<h2>Report Incident</h2><div class="card" style="max-width:1000px;padding:26px"><div class="g3">
<label>District<select id="dd" onchange="repDist()">${D.map(d=>`<option ${d.n==sel?'selected':''}>${d.n}</option>`).join('')}</select></label>
<label>Area<select id="ar" onchange="repDist(1)"></select></label><label id="lcw">New area name<input id="lc" placeholder="Type the area"></label>
<label>Disaster type<select id="ty" onchange="repType()">${['Flood','Fire','Earthquake','Heatwave','Storm','Landslide','Industrial Accident','Other'].map(x=>`<option>${x}</option>`).join('')}</select></label>
<label>Severity<select id="sv"><option value="1">1 – Minor</option><option value="2">2 – Moderate</option><option value="3" selected>3 – Major</option><option value="4">4 – Extreme</option></select></label>
<label>People affected<input id="af" type="number" min="0"></label><label>Reported injured<input id="ij" type="number" min="0" value="0"></label>
<label>Date<input id="dt" type="date" value="${t.toISOString().slice(0,10)}"></label><label>Time<input id="tm" type="time" value="${t.toTimeString().slice(0,5)}"></label>
<label id="w1">Water level<select id="wl"><option value="auto">Auto – sensor (${sn.wl.toFixed(2)} m)</option>${o([[.5,'Normal'],[2,'Rising'],[4,'Above danger level'],[6,'Severe flooding']])}</select></label>
<label id="w2">Rainfall<select id="rn"><option value="auto">Auto – sensor (${sn.rain.toFixed(2)} mm/h)</option>${o([[5,'Light'],[15,'Moderate'],[35,'Heavy'],[70,'Extreme']])}</select></label>
<label id="w3">Temperature<select id="tp"><option value="auto">Auto – sensor (${sn.temp.toFixed(2)} °C)</option>${o([[32,'Normal'],[40,'Hot'],[46,'Extreme heat']])}</select></label></div>
<label>Description<textarea id="ds" rows="2"></textarea></label>
<div class="err" id="msg"></div><button onclick="runPrediction()">Submit &amp; run prediction</button></div>`}
function repDist(fa){const g=id=>document.getElementById(id),d=D.find(x=>x.n==g('dd').value),ar=g('ar');
 if(!fa)ar.innerHTML=d.areas.map(a=>`<option>${a}</option>`).join('')+'<option value="__o">Other – type a new area…</option>';
 g('lcw').style.display=ar.value=='__o'?'':'none'}
function repType(){const rel=REL[document.getElementById('ty').value]||[];['wl','rain','temp'].forEach((k,i)=>document.getElementById('w'+(i+1)).style.display=rel.includes(k)&&role!='Citizen'?'':'none')}
let predI=0;
function vPred(){if(!INC.length)return `<h2>Risk Forecast</h2><div class="card sub">No forecasts yet. Report an incident to see one.</div>`;
 const n=Math.min(predI,INC.length-1),i=INC[n],p=i.pr,conf=Math.max(...p.p);
 const top=`<div class="card tb"><select onchange="predI=+this.value;draw()">${INC.map((x,k)=>`<option value="${k}" ${k==n?'selected':''}>#${x.id} ${x.type} – ${x.loc} (${x.d})</option>`).join('')}</select><span class="sub">Reported ${i.date} ${i.time}</span></div>`;
 const stats=`<div class="stats" style="grid-template-columns:repeat(3,1fr)"><div class="stat" style="--ac:${RC[p.risk]}"><span class="sub">Risk level</span><b>${p.risk}</b></div><div class="stat" style="--ac:#8767B7"><span class="sub">Confidence</span><b>${(conf*100).toFixed(2)}%</b></div><div class="stat" style="--ac:#D95C5C"><span class="sub">Expected injured</span><b>${f2(p.inj)}</b></div></div>`;
 const risk=p.cl.map((c,k)=>k).reverse().map(k=>{const c=p.cl[k],v=p.p[k];return `<div class="li" style="gap:14px"><span style="width:70px"><b>${c}</b></span><div style="flex:1">${bar(v,1,RC[c])}</div><b style="width:78px;text-align:right">${(v*100).toFixed(2)}%</b></div>`}).join('');
 const dem=Object.entries(p.dm).map(([k,[r,a]])=>`<div style="margin-bottom:14px"><div class="mrow" style="margin:0 0 5px"><span>${k}</span><span style="color:${r>a?'#d03a35':'inherit'}">${f2(r)} needed · ${f2(a)} available</span></div>${bar(Math.min(a,r),r||1,r>a?'#d03a35':'#5487B8')}</div>`).join('');
 return `<h2>Risk Forecast</h2>${top}${stats}<div class="g2c"><div class="card"><h3>Chance of each risk level</h3>${risk}</div><div class="card"><h3>Needed vs available</h3>${dem}</div></div>`}
function vRes(){if(role!='Admin')return'<p>Not permitted for this role.</p>';const d=D.find(x=>x.n==(INC[0]?.d));if(!d)return `<h2>Resources</h2><div class="card sub">No incident yet. Report one to see predicted demand.</div>`;
const cs=Object.entries(d.pr.dm).map(([k,[r,a]])=>{const sh=Math.max(0,r-a),al=Math.min(r,a),c=sh?'#d03a35':'#5487B8';return `<div class="card rcard" style="--ac:${c}"><div class="mrow" style="margin:0"><b>${k}</b><span class="chip" style="background:${c}">${sh?'Short '+f2(sh):'Covered'}</span></div><div class="big">${f2(r)}<span class="sub"> required</span></div>${bar(al,r||1,c)}<div class="mrow"><span>Available ${f2(a)}</span><span>Allocated ${f2(al)} · Left ${f2(a-al)}</span></div></div>`}).join('');
return `<h2>Resources – ${d.n}</h2><div class="gauto">${cs}</div>`}
const TOT={'Ambulance Teams':x=>x.amb,'Doctors':x=>Math.round(x.beds/12),'Nurses':x=>Math.round(x.beds/6),'Rescue Teams':x=>x.resc,'Police':x=>x.pol,'Firefighters':x=>x.fire};
async function sendTo(type,v){try{await api('/api/dispatch',{type,units:Math.max(0,Math.round(+v)||0)});await refresh();draw()}catch(x){alert(x.message);draw()}}
function vResp(){if(!DEM.length)return `<h2>Responders</h2><div class="card sub">No active assignments yet. Units appear here as soon as an incident is reported.</div>`;
 const plan=DEM.map(r=>{const type=r[0],need=r[1],sent=ASSIGN.filter(a=>a.type==type&&a.st!='Completed').reduce((q,a)=>q+a.units,0),mx=D.reduce((q,x)=>q+Math.max(0,Math.floor(TOT[type](x)*.7)-(x.out[type]||0)),0)+sent,gap=need-sent,c=gap>0?'#d03a35':'#4E9990';
  return `<div class="card rcard" style="--ac:${c}"><div class="mrow" style="margin:0"><b>${type}</b><span class="chip" style="background:${c}">${gap>0?'Short '+f2(gap):'Covered'}</span></div><div class="mrow"><span>Needed</span><b>${f2(need)}</b></div><div class="mrow" style="align-items:center"><span>Sending</span><input type="number" min="0" max="${mx}" value="${sent}" style="width:90px;margin:0;text-align:right" onchange="sendTo('${type}',this.value)"></div><div style="margin-top:10px">${bar(Math.min(sent,need),need||1,c)}</div><div class="sub" style="margin-top:8px">Up to ${mx} available</div></div>`}).join('');
 const st=k=>`<select style="margin:0;width:auto" onchange="setSt(${k},this.value)">${['Dispatched','En route','On scene','Completed'].map(x=>`<option ${x==ASSIGN[k].st?'selected':''}>${x}</option>`).join('')}</select>`;
 const cs=ASSIGN.map((a,k)=>`<div class="card"><div class="mrow" style="margin:0"><b>${a.type} ×${a.units}</b>${st(k)}</div><div style="margin:14px 0 6px;font-size:16px">${a.from} → ${a.to}</div><div class="sub">${a.path}</div><div class="sub" style="margin-top:10px">${a.by?'Updated by '+a.by+' · '+a.at:'Dispatched by system'}</div><div class="mrow"><span>${(+a.km).toFixed(1)} km</span><span>${f2(a.min)} min</span></div></div>`).join('');
 return `<h2>Responders – ${INC[0].d}</h2><h3 style="margin:0 0 12px">Dispatch plan · set how many you are sending</h3><div class="gauto">${plan}</div><h3 style="margin:8px 0 12px">Routes and status</h3><div class="gauto">${cs}</div>`}
function vAl(){return `<h2>Alerts</h2>`+(AL.length?'<div class="g2c">'+AL.map(a=>{const c=a.lvl=='CRITICAL'?'#d03a35':a.lvl=='HIGH'?'#e8892b':'#d6a34a';return `<div class="card rcard" style="--ac:${c}"><div class="mrow" style="margin:0"><span class="chip" style="background:${c}">${a.lvl}</span><span class="sub">${a.d} · ${a.time}</span></div><h3 style="margin:14px 0 6px">${a.t}</h3><div>${a.m}</div></div>`}).join('')+'</div>':'<div class="card sub">No alerts yet.</div>')}
async function addArea(i){const e=document.getElementById('a_'+i),v=e.value.trim();if(v){try{await api('/api/districts/'+D[i].id+'/areas',{area:v});await refresh();draw()}catch(x){alert(x.message)}}}
async function editD(i,k,v){try{await api('/api/districts/'+D[i].id,{field:k,value:+v},'PUT');await refresh();draw()}catch(x){alert(x.message);draw()}}
function vData(){const rows=D.map((d,i)=>`<tr><td>${d.n}</td>${['pop','den','beds','amb','pol','fire','resc','shel'].map(k=>`<td>${role=='Admin'?`<input style="width:70px;margin:0;padding:3px" value="${d[k]}" onchange="editD(${i},'${k}',this.value)">`:d[k]}</td>`).join('')}<td style="min-width:220px">${d.areas.join(', ')||'–'}${role=='Admin'?`<div style="display:flex;gap:4px;margin-top:4px"><input id="a_${i}" placeholder="New area" style="margin:0;padding:3px"><button class="alt" onclick="addArea(${i})">Add</button></div>`:''}</td></tr>`).join('');
 return `<h2>Sample Data</h2><table><tr><th>District</th><th>Pop (lakh)</th><th>Density</th><th>Beds</th><th>Ambulances</th><th>Police</th><th>Fire</th><th>Rescue</th><th>Shelter cap.</th><th>Areas</th></tr>${rows}</table>`}

(async()=>{try{const m=await api('/api/me');role=m.role;await startApp()}catch(x){}})();
