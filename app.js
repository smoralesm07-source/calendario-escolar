const state = { course: 'all', data: [] };

const fmtDate = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
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
  if(days <= 0) return ['today', days === 0 ? 'Hoy' : 'Vencida'];
  if(days <= 2) return ['today', `En ${days} día${days===1?'':'s'}`];
  if(days <= 7) return ['soon', `En ${days} días`];
  return ['later', `En ${days} días`];
}

function normalizeCourse(v){
  return String(v || '').toUpperCase().replaceAll('°','').replace(/\s+/g,'');
}

function render(){
  const now = new Date();
  const pending = state.data
    .map(x => ({...x, _date: parseDate(x.fecha)}))
    .filter(x => x._date && daysBetween(now, x._date) >= 0)
    .sort((a,b) => a._date - b._date);

  document.getElementById('metricWeek').textContent = pending.filter(x => daysBetween(now,x._date) <= 7).length;
  document.getElementById('metric3D').textContent = pending.filter(x => normalizeCourse(x.curso)==='3D').length;
  document.getElementById('metric6B').textContent = pending.filter(x => normalizeCourse(x.curso)==='6B').length;
  document.getElementById('metricTotal').textContent = pending.length;

  const next = pending[0];
  if(next){
    const d = daysBetween(now,next._date);
    document.getElementById('nextCountdown').textContent = d===0 ? 'Hoy' : `${d} día${d===1?'':'s'}`;
    document.getElementById('nextLabel').textContent = `${next.curso} · ${next.asignatura}`;
  } else {
    document.getElementById('nextCountdown').textContent = '—';
    document.getElementById('nextLabel').textContent = 'Sin evaluaciones pendientes';
  }

  const filtered = pending.filter(x => state.course==='all' || normalizeCourse(x.curso)===state.course);
  document.getElementById('resultCount').textContent = `${filtered.length} registro${filtered.length===1?'':'s'}`;
  const list = document.getElementById('evaluationList');
  const empty = document.getElementById('emptyState');
  list.innerHTML = '';
  empty.hidden = filtered.length > 0;

  filtered.forEach(item => {
    const diff = daysBetween(now,item._date);
    const [uClass,uLabel] = urgency(diff);
    const card = document.createElement('article');
    card.className = 'eval-card';
    card.innerHTML = `
      <div class="date-box">
        <div class="day">${String(item._date.getDate()).padStart(2,'0')}</div>
        <div class="month">${fmtMonth.format(item._date).replace('.','')}</div>
      </div>
      <div class="eval-main">
        <h4>${item.asignatura || 'Evaluación'}</h4>
        <p>${item.descripcion || 'Sin descripción adicional.'}</p>
        <div class="eval-meta">
          <span class="tag">${fmtDate.format(item._date)}</span>
          ${item.tipo ? `<span class="tag">${item.tipo}</span>` : ''}
          <span class="urgency ${uClass}">${uLabel}</span>
        </div>
      </div>
      <div class="course-badge">${item.curso}</div>`;
    list.appendChild(card);
  });
}

async function init(){
  document.querySelectorAll('.filter').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach(x => x.classList.remove('active'));
    btn.classList.add('active');
    state.course = btn.dataset.course;
    render();
  }));

  try{
    const response = await fetch('data/evaluaciones.json', {cache:'no-store'});
    const payload = await response.json();
    state.data = Array.isArray(payload.evaluaciones) ? payload.evaluaciones : [];
    document.getElementById('lastUpdate').textContent = payload.actualizado_en || 'Pendiente de sincronización';
  }catch(err){
    console.error(err);
    document.getElementById('lastUpdate').textContent = 'No disponible';
  }
  render();
}

init();
