const state = { course: 'all', data: [], alerts: { active:false, token:null, preferences:null } };
const ALERT_API = 'https://bzqxvidggykkdouotylg.supabase.co/functions/v1/school-alerts';
const ALERT_TOKEN_KEY = 'school_alert_manage_token';

const fmtDate = new Intl.DateTimeFormat('es-CL', { weekday:'short', day:'2-digit', month:'short' });
const fmtMonth = new Intl.DateTimeFormat('es-CL', { month: 'short' });

function parseDate(value){ const d = new Date(`${value}T12:00:00`); return Number.isNaN(d.getTime()) ? null : d; }
function daysBetween(a,b){ const ms=86400000; const x=new Date(a.getFullYear(),a.getMonth(),a.getDate()); const y=new Date(b.getFullYear(),b.getMonth(),b.getDate()); return Math.round((y-x)/ms); }
function urgency(days){ if(days===0)return['today','Hoy']; if(days<=2)return['today',`En ${days} día${days===1?'':'s'}`]; if(days<=7)return['soon',`En ${days} días`]; return['later',`En ${days} días`]; }
function normalizeCourse(v){ return String(v||'').toUpperCase().replaceAll('°','').replace(/\s+/g,''); }
function belongsToCourse(item, filter){
  if(filter==='all') return true;
  const c=normalizeCourse(item.curso);
  if(filter==='3D') return c==='3D'||c==='GENERAL3';
  if(filter==='6B') return c==='6B'||c==='GENERAL6';
  return c===filter;
}

function inferSubject(item){
  const source=`${item.asignatura||''} ${item.descripcion||''}`.toUpperCase();
  const subjects=['LENGUAJE','LENG','MATEMÁTICA','MATEMATICA','MATH','ENGLISH','SCIENCE','SOCIAL STUDIES','SOCIAL','ARTE','TECNOLOGÍA','TECNOLOGIA'];
  const found=subjects.find(s=>source.includes(s));
  if(!found) return item.es_general ? 'Actividad general' : (item.asignatura||'Actividad escolar');
  const map={LENG:'Lenguaje',LENGUAJE:'Lenguaje',MATEMÁTICA:'Matemática',MATEMATICA:'Matemática',MATH:'Math',ENGLISH:'English',SCIENCE:'Science','SOCIAL STUDIES':'Social Studies',SOCIAL:'Social Studies',ARTE:'Arte',TECNOLOGÍA:'Tecnología',TECNOLOGIA:'Tecnología'};
  return map[found]||found;
}
function cleanDescription(item){ let text=String(item.descripcion||'').trim(); if(!text)return'Sin descripción adicional.'; return text.replace(/^\s*\d+\s*°?\s*[A-D](?:\s*(?:Y|AND|,|-)\s*[A-D])*\s*:?\s*/i,''); }

function cardHTML(item,now){
  const diff=daysBetween(now,item._date), [uClass,uLabel]=urgency(diff);
  const badge=item.es_general?`General ${item.nivel||''}`:item.curso;
  return `<article class="eval-card"><div class="date-box"><div class="day">${String(item._date.getDate()).padStart(2,'0')}</div><div class="month">${fmtMonth.format(item._date).replace('.','')}</div></div><div class="eval-main"><div class="eval-top"><h4>${inferSubject(item)}</h4><span class="course-badge">${badge}</span></div><p>${cleanDescription(item)}</p><div class="eval-meta"><span class="tag">${fmtDate.format(item._date).replace('.','')}</span><span class="urgency ${uClass}">${uLabel}</span></div></div></article>`;
}
function fillGroup(groupId,listId,items,now){ const group=document.getElementById(groupId), list=document.getElementById(listId); group.hidden=items.length===0; list.innerHTML=items.map(item=>cardHTML(item,now)).join(''); }

function render(){
  const now=new Date();
  const pending=state.data.map(x=>({...x,_date:parseDate(x.fecha)})).filter(x=>x._date&&daysBetween(now,x._date)>=0).sort((a,b)=>a._date-b._date);
  document.getElementById('metricToday').textContent=pending.filter(x=>daysBetween(now,x._date)===0).length;
  document.getElementById('metricWeek').textContent=pending.filter(x=>daysBetween(now,x._date)<=7).length;
  document.getElementById('metric3D').textContent=pending.filter(x=>belongsToCourse(x,'3D')).length;
  document.getElementById('metric6B').textContent=pending.filter(x=>belongsToCourse(x,'6B')).length;
  const next=pending[0];
  if(next){ const d=daysBetween(now,next._date); document.getElementById('nextDay').textContent=String(next._date.getDate()).padStart(2,'0'); document.getElementById('nextMonth').textContent=fmtMonth.format(next._date).replace('.',''); document.getElementById('nextCourse').textContent=next.es_general?`General ${next.nivel||''}`:next.curso; document.getElementById('nextTitle').textContent=inferSubject(next); document.getElementById('nextDescription').textContent=cleanDescription(next); document.getElementById('nextCountdown').textContent=d===0?'Hoy':`Faltan ${d} día${d===1?'':'s'}`; }
  else { document.getElementById('nextDay').textContent='—'; document.getElementById('nextMonth').textContent='—'; document.getElementById('nextCourse').textContent='—'; document.getElementById('nextTitle').textContent='Sin evaluaciones pendientes'; document.getElementById('nextDescription').textContent='Cuando existan compromisos próximos aparecerán aquí.'; document.getElementById('nextCountdown').textContent='—'; }
  const filtered=pending.filter(x=>belongsToCourse(x,state.course));
  document.getElementById('resultCount').textContent=`${filtered.length}`;
  fillGroup('todayGroup','todayList',filtered.filter(x=>daysBetween(now,x._date)===0),now);
  fillGroup('weekGroup','weekList',filtered.filter(x=>{const d=daysBetween(now,x._date);return d>=1&&d<=7;}),now);
  fillGroup('laterGroup','laterList',filtered.filter(x=>daysBetween(now,x._date)>7),now);
  document.getElementById('emptyState').hidden=filtered.length>0;
}

async function alertApi(body){
  const r=await fetch(ALERT_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  let data={}; try{data=await r.json();}catch{}
  if(!r.ok){ const err=new Error(data.error||'request_failed'); err.code=data.error; throw err; }
  return data;
}
function showAlertMessage(text,type='info'){
  const el=document.getElementById('alertMessage'); el.textContent=text; el.className=`alert-message ${type}`; el.hidden=false;
}
function clearAlertMessage(){ document.getElementById('alertMessage').hidden=true; }
function selectedCourses(){ const out=[]; if(document.getElementById('course3D').checked)out.push('3D'); if(document.getElementById('course6B').checked)out.push('6B'); return out; }
function selectedReminderDays(){ return [...document.querySelectorAll('.reminder-day:checked')].map(x=>Number(x.value)); }
function fillAlertForm(prefs){
  if(!prefs)return;
  document.getElementById('alertEmail').value=prefs.email||'';
  document.getElementById('course3D').checked=(prefs.courses||[]).includes('3D');
  document.getElementById('course6B').checked=(prefs.courses||[]).includes('6B');
  document.querySelectorAll('.reminder-day').forEach(x=>x.checked=(prefs.reminder_days||[]).includes(Number(x.value)));
  document.getElementById('notifyChanges').checked=prefs.notify_changes!==false;
}
function renderAlertState(){
  const badge=document.getElementById('alertStatusBadge'), summary=document.getElementById('alertSummary'), save=document.getElementById('saveAlerts'), unsub=document.getElementById('unsubscribeAlerts'), email=document.getElementById('alertEmail');
  if(state.alerts.active&&state.alerts.preferences){
    badge.textContent='Activo'; badge.className='status-badge active';
    const p=state.alerts.preferences; const courses=(p.courses||[]).map(x=>x==='3D'?'3°D':'6°B').join(' · '); const days=(p.reminder_days||[]).sort((a,b)=>a-b).join(', ');
    summary.textContent=`${courses} · incluye actividades generales del nivel · recordatorios ${days?days+' día(s) antes':'sin recordatorio'}`;
    save.textContent='Guardar cambios'; unsub.hidden=false; email.disabled=true; fillAlertForm(p);
  } else {
    badge.textContent='No configurado'; badge.className='status-badge inactive'; summary.textContent='Recibe evaluaciones, actividades generales, cambios y recordatorios directamente en tu correo.';
    save.textContent='Enviar confirmación'; unsub.hidden=true; email.disabled=false;
  }
}
function openAlerts(){ clearAlertMessage(); renderAlertState(); const dialog=document.getElementById('alertsDialog'); if(typeof dialog.showModal==='function')dialog.showModal(); }

async function loadAlertStatus(){
  const token=localStorage.getItem(ALERT_TOKEN_KEY); if(!token)return;
  try{ const data=await alertApi({action:'status',token}); state.alerts={active:data.preferences?.status==='active',token,preferences:data.preferences}; renderAlertState(); }
  catch{ localStorage.removeItem(ALERT_TOKEN_KEY); state.alerts={active:false,token:null,preferences:null}; renderAlertState(); }
}

async function handleConfirmFromUrl(){
  const params=new URLSearchParams(location.search), token=params.get('confirm'); if(!token)return;
  openAlerts(); showAlertMessage('Confirmando tus avisos…');
  try{
    const data=await alertApi({action:'confirm',token});
    localStorage.setItem(ALERT_TOKEN_KEY,data.manage_token); state.alerts={active:true,token:data.manage_token,preferences:{...data.preferences,status:'active'}}; renderAlertState(); showAlertMessage('Avisos activados correctamente. Ya puedes gestionar todo desde esta app.','success');
    params.delete('confirm'); const q=params.toString(); history.replaceState({},'',`${location.pathname}${q?'?'+q:''}${location.hash||''}`);
  }catch(err){ showAlertMessage(err.code==='expired_token'?'El enlace de confirmación venció. Solicita uno nuevo.':'No pudimos confirmar este enlace.','error'); }
}

async function init(){
  document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.filter').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); state.course=btn.dataset.course; render(); }));
  document.getElementById('openAlerts').addEventListener('click',openAlerts); document.getElementById('openAlertsInline').addEventListener('click',openAlerts); document.getElementById('closeAlerts').addEventListener('click',()=>document.getElementById('alertsDialog').close());
  document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{ document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); const target=btn.dataset.target; if(target==='top')window.scrollTo({top:0,behavior:'smooth'}); else document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'}); }));

  document.getElementById('alertsForm').addEventListener('submit',async e=>{
    e.preventDefault(); clearAlertMessage(); const save=document.getElementById('saveAlerts'); save.disabled=true;
    try{
      const courses=selectedCourses(), reminder_days=selectedReminderDays(), notify_changes=document.getElementById('notifyChanges').checked;
      if(!courses.length){showAlertMessage('Selecciona al menos un curso.','error');return;}
      if(state.alerts.active&&state.alerts.token){
        const data=await alertApi({action:'update',token:state.alerts.token,courses,reminder_days,notify_changes}); state.alerts.preferences={...data.preferences,status:'active'}; renderAlertState(); showAlertMessage('Preferencias actualizadas.','success');
      } else {
        const email=document.getElementById('alertEmail').value.trim(); if(!email){showAlertMessage('Ingresa un correo válido.','error');return;}
        await alertApi({action:'subscribe',email,courses,reminder_days,notify_changes}); showAlertMessage('Te enviamos un correo de confirmación. Abre el enlace para activar los avisos.','success');
      }
    }catch(err){
      if(err.code==='email_service_not_configured')showAlertMessage('El servicio de correo aún está terminando de configurarse.','error');
      else showAlertMessage('No pudimos guardar la configuración. Intenta nuevamente.','error');
    }finally{save.disabled=false;}
  });

  document.getElementById('unsubscribeAlerts').addEventListener('click',async()=>{
    if(!state.alerts.token)return; if(!confirm('¿Desactivar los avisos por correo?'))return;
    try{ await alertApi({action:'unsubscribe',token:state.alerts.token}); localStorage.removeItem(ALERT_TOKEN_KEY); state.alerts={active:false,token:null,preferences:null}; renderAlertState(); showAlertMessage('Avisos desactivados.','success'); }
    catch{showAlertMessage('No pudimos desactivar los avisos.','error');}
  });

  try{ const response=await fetch('data/evaluaciones.json',{cache:'no-store'}); const payload=await response.json(); state.data=Array.isArray(payload.evaluaciones)?payload.evaluaciones:[]; document.getElementById('lastUpdate').textContent=payload.actualizado_en||'Sin sincronizar'; }
  catch(err){ console.error(err); document.getElementById('lastUpdate').textContent='No disponible'; }
  render(); renderAlertState(); await loadAlertStatus(); await handleConfirmFromUrl();
}

init();