const state = { course: 'all', data: [] };

const fmtDate = new Intl.DateTimeFormat('es-CL', { weekday:'short', day:'2-digit', month:'short' });
const fmtMonth = new Intl.DateTimeFormat('es-CL', { month: 'short' });

function parseDate(value){
  const d = new Date(`${value}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a,b){
  const ms = 24*60*60*1000;
  const x = new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const y = new Date(b.getFullYear(),b.getMonth(),b.getDate());
  return Math.round((y-x)/ms);
}

function urgency(days){
  if(days === 0) return ['today','Hoy'];
  if(days <= 2) return ['today',`En ${days} día${days===1?'':'s'}`];
  if(days <= 7) return ['soon',`En ${days} días`];
  return ['later',`En ${days} días`];
}

function normalizeCourse(v){
  return String(v || '').toUpperCase().replaceAll('°','').replace(/\s+/g,'');
}

function inferSubject(item){
  const source = `${item.asignatura || ''} ${item.descripcion || ''}`.toUpperCase();
  const subjects = ['LENGUAJE','LENG','MATEMÁTICA','MATEMATICA','MATH','ENGLISH','SCIENCE','SOCIAL STUDIES','SOCIAL','ARTE','TECNOLOGÍA','TECNOLOGIA'];
  const found = subjects.find(s => source.includes(s));
  if(!found) return item.asignatura || 'Actividad escolar';
  const map = {LENG:'Lenguaje',LENGUAJE:'Lenguaje',MATEMÁTICA:'Matemática',MATEMATICA:'Matemática',MATH:'Math',ENGLISH:'English',SCIENCE:'Science','SOCIAL STUDIES':'Social Studies',SOCIAL:'Social Studies',ARTE:'Arte',TECNOLOGÍA:'Tecnología',TECNOLOGIA:'Tecnología'};
  return map[found] || found;
}

function cleanDescription(item){
  let text = String(item.descripcion || '').trim();
  if(!text) return 'Sin descripción adicional.';
  text = text.replace(/^\s*\d+\s*°?\s*[A-D](?:\s*(?:Y|AND|,|-)\s*[A-D])*\s*:?\s*/i,'');
  return text;
}

function cardHTML(item, now){
  const diff = daysBetween(now,item._date);
  const [uClass,uLabel] = urgency(diff);
  const subject = inferSubject(item);
  const description = cleanDescription(item);
  return `
    <article class="eval-card">
      <div class="date-box">
        <div class="day">${String(item._date.getDate()).padStart(2,'0')}</div>
        <div class="month">${fmtMonth.format(item._date).replace('.','')}</div>
      </div>
      <div class="eval-main">
        <div class="eval-top">
          <h4>${subject}</h4>
          <span class="course-badge">${item.curso}</span>
        </div>
        <p>${description}</p>
        <div class="eval-meta">
          <span class="tag">${fmtDate.format(item._date).replace('.','')}</span>
          <span class="urgency ${uClass}">${uLabel}</span>
        </div>
      </div>
    </article>`;
}

function fillGroup(groupId,listId,items,now){
  const group = document.getElementById(groupId);
  const list = document.getElementById(listId);
  group.hidden = items.length === 0;
  list.innerHTML = items.map(item => cardHTML(item,now)).join('');
}

function render(){
  const now = new Date();
  const pending = state.data
    .map(x => ({...x, _date: parseDate(x.fecha)}))
    .filter(x => x._date && daysBetween(now,x._date) >= 0)
    .sort((a,b) => a._date - b._date);

  document.getElementById('metricToday').textContent = pending.filter(x => daysBetween(now,x._date) === 0).length;
  document.getElementById('metricWeek').textContent = pending.filter(x => daysBetween(now,x._date) <= 7).length;
  document.getElementById('metric3D').textContent = pending.filter(x => normalizeCourse(x.curso)==='3D').length;
  document.getElementById('metric6B').textContent = pending.filter(x => normalizeCourse(x.curso)==='6B').length;

  const next = pending[0];
  if(next){
    const d = daysBetween(now,next._date);
    document.getElementById('nextDay').textContent = String(next._date.getDate()).padStart(2,'0');
    document.getElementById('nextMonth').textContent = fmtMonth.format(next._date).replace('.','');
    document.getElementById('nextCourse').textContent = next.curso;
    document.getElementById('nextTitle').textContent = inferSubject(next);
    document.getElementById('nextDescription').textContent = cleanDescription(next);
    document.getElementById('nextCountdown').textContent = d===0 ? 'Hoy' : `Faltan ${d} día${d===1?'':'s'}`;
  } else {
    document.getElementById('nextDay').textContent = '—';
    document.getElementById('nextMonth').textContent = '—';
    document.getElementById('nextCourse').textContent = '—';
    document.getElementById('nextTitle').textContent = 'Sin evaluaciones pendientes';
    document.getElementById('nextDescription').textContent = 'Cuando existan compromisos próximos aparecerán aquí.';
    document.getElementById('nextCountdown').textContent = '—';
  }

  const filtered = pending.filter(x => state.course==='all' || normalizeCourse(x.curso)===state.course);
  document.getElementById('resultCount').textContent = `${filtered.length}`;

  const today = filtered.filter(x => daysBetween(now,x._date) === 0);
  const week = filtered.filter(x => {
    const d = daysBetween(now,x._date);
    return d >= 1 && d <= 7;
  });
  const later = filtered.filter(x => daysBetween(now,x._date) > 7);

  fillGroup('todayGroup','todayList',today,now);
  fillGroup('weekGroup','weekList',week,now);
  fillGroup('laterGroup','laterList',later,now);
  document.getElementById('emptyState').hidden = filtered.length > 0;
}

function openAlerts(){
  const dialog = document.getElementById('alertsDialog');
  if(typeof dialog.showModal === 'function') dialog.showModal();
}

async function init(){
  document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    state.course = btn.dataset.course;
    render();
  }));

  document.getElementById('openAlerts').addEventListener('click',openAlerts);
  document.getElementById('openAlertsInline').addEventListener('click',openAlerts);
  document.getElementById('saveAlerts').addEventListener('click',() => {
    alert('La interfaz está lista. Falta conectar el servicio seguro de suscripción y envío de correos.');
  });

  document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click',() => {
    document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.dataset.target;
    if(target === 'top') window.scrollTo({top:0,behavior:'smooth'});
    else document.getElementById(target)?.scrollIntoView({behavior:'smooth',block:'start'});
  }));

  try{
    const response = await fetch('data/evaluaciones.json', {cache:'no-store'});
    const payload = await response.json();
    state.data = Array.isArray(payload.evaluaciones) ? payload.evaluaciones : [];
    document.getElementById('lastUpdate').textContent = payload.actualizado_en || 'Sin sincronizar';
  }catch(err){
    console.error(err);
    document.getElementById('lastUpdate').textContent = 'No disponible';
  }
  render();
}

init();
