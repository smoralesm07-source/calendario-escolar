import json, re, unicodedata
from datetime import date, datetime
from pathlib import Path
import requests
from openpyxl import load_workbook

ROOT=Path(__file__).resolve().parents[1]
CFG=json.loads((ROOT/'config/sources.json').read_text(encoding='utf-8'))
OUT=ROOT/'data/evaluaciones.json'
TMP=ROOT/'.tmp'; TMP.mkdir(exist_ok=True)
MONTHS={'ENERO':1,'FEBRERO':2,'MARZO':3,'ABRIL':4,'MAYO':5,'JUNIO':6,'JULIO':7,'AGOSTO':8,'SEPTIEMBRE':9,'OCTUBRE':10,'NOVIEMBRE':11,'DICIEMBRE':12}

def clean(v): return '' if v is None else ' '.join(str(v).replace('\n',' ').split())
def norm(v):
    t=clean(v).upper().replace('º','°')
    return ''.join(c for c in unicodedata.normalize('NFD',t) if unicodedata.category(c)!='Mn')

def applies(v,grade,section):
    t=norm(v)
    if re.search(rf'(?<!\d){grade}\s*°?\s*{section}(?![A-Z])',t): return True
    m=re.search(rf'(?<!\d){grade}\s*°?\s*(?:BASICO\s*)?([^.;:\n]{{0,35}})',t)
    return bool(m and section in re.findall(r'(?<![A-Z])[A-D](?![A-Z])',m.group(1)))

def pdate(v,year=2026):
    if isinstance(v,datetime): return v.date()
    if isinstance(v,date): return v
    t=norm(v)
    m=re.search(r'\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b',t)
    if m:
        y=int(m.group(3)) if m.group(3) else year; y=y+2000 if y<100 else y
        try:return date(y,int(m.group(2)),int(m.group(1)))
        except:pass
    for name,mo in MONTHS.items():
        m=re.search(rf'\b(\d{{1,2}})\s+(?:DE\s+)?{name}(?:\s+(?:DE\s+)?(20\d{{2}}))?\b',t)
        if m:
            try:return date(int(m.group(2) or year),mo,int(m.group(1)))
            except:pass
    return None

def month_from_sheet(title):
    t=norm(title)
    for name,mo in MONTHS.items():
        if name in t:
            return mo
    return None

def day_number(v):
    if isinstance(v, datetime): return v.day
    if isinstance(v, date): return v.day
    if isinstance(v, (int,float)) and int(v)==v and 1 <= int(v) <= 31:
        return int(v)
    t=clean(v)
    if re.fullmatch(r'\d{1,2}',t):
        d=int(t)
        if 1 <= d <= 31:return d
    # admite encabezados como "LUNES 30" o "30 LUNES"
    m=re.search(r'(?<!\d)([12]?\d|3[01])(?!\d)',t)
    if m and len(t) <= 25:
        return int(m.group(1))
    return None

def near_date(ws,row,col):
    # 1) fecha completa en la misma fila
    for c in range(1,ws.max_column+1):
        d=pdate(ws.cell(row,c).value)
        if d:return d

    # 2) fecha completa cerca y hacia arriba
    for r in range(row-1,max(0,row-12),-1):
        for c in range(max(1,col-3),min(ws.max_column,col+3)+1):
            d=pdate(ws.cell(r,c).value)
            if d:return d

    # 3) el calendario del colegio usa hojas por mes y encabezados con solo el día.
    #    Tomamos el día más cercano por encima de la celda del evento y usamos el mes de la hoja.
    mo=month_from_sheet(ws.title)
    if mo:
        for r in range(row-1,max(0,row-4),-1):
            # primero la misma columna; luego columnas vecinas por posibles celdas combinadas
            for c in [col, col-1, col+1, col-2, col+2, col-3, col+3]:
                if c < 1 or c > ws.max_column: continue
                dn=day_number(ws.cell(r,c).value)
                if dn:
                    try:return date(2026,mo,dn)
                    except ValueError:pass
    return None

def extract(key,src):
    grade=re.match(r'(\d+)',key).group(1); section=key[-1]; label=src['curso']
    url=f"https://docs.google.com/spreadsheets/d/{src['sheet_id']}/export?format=xlsx"
    path=TMP/f'{key}.xlsx'
    r=requests.get(url,timeout=60); r.raise_for_status(); path.write_bytes(r.content)
    wb=load_workbook(path,data_only=True,read_only=False)
    rows=[]; seen=set()
    for ws in wb.worksheets:
        if not ws.max_row or not ws.max_column: continue
        for row in range(1,ws.max_row+1):
            vals=[ws.cell(row,c).value for c in range(1,ws.max_column+1)]
            for col,v in enumerate(vals,1):
                if not applies(v,grade,section): continue
                d=near_date(ws,row,col)
                if not d:
                    print(f'[sin fecha] {label} {ws.title} fila {row}: {clean(v)[:100]}'); continue
                parts=[clean(x) for x in vals if clean(x)]
                course=clean(v)
                desc=[p for p in parts if norm(p)!=norm(course) and not pdate(p)]
                subject=next((p for p in desc if len(p)<=50),'Evaluación')
                text=' · '.join(desc) or course
                rec={'fecha':d.isoformat(),'curso':label,'asignatura':subject,'descripcion':text,'tipo':'Calendario oficial','hoja':ws.title}
                fp=(rec['fecha'],rec['curso'],norm(rec['descripcion']))
                if fp not in seen: seen.add(fp); rows.append(rec)
    print(label, 'registros:', len(rows))
    return rows

records=[]
for key,src in CFG.items(): records.extend(extract(key,src))
records.sort(key=lambda x:(x['fecha'],x['curso'],x['asignatura']))
payload={'actualizado_en':datetime.now().astimezone().strftime('%d-%m-%Y %H:%M'),'fuente':'Colegio Andrée English School','cursos':['3°D','6°B'],'evaluaciones':records}
OUT.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
print('Total registros publicados:',len(records))
