import json, re, unicodedata
from datetime import date, datetime
from pathlib import Path
import requests
from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
CFG = json.loads((ROOT / 'config/sources.json').read_text(encoding='utf-8'))
OUT = ROOT / 'data/evaluaciones.json'
TMP = ROOT / '.tmp'
TMP.mkdir(exist_ok=True)

MONTHS = {
    'ENERO': 1, 'FEBRERO': 2, 'MARZO': 3, 'ABRIL': 4, 'MAYO': 5,
    'JUNIO': 6, 'JULIO': 7, 'AGOSTO': 8, 'SEPTIEMBRE': 9,
    'OCTUBRE': 10, 'NOVIEMBRE': 11, 'DICIEMBRE': 12,
}
WEEKDAYS = ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO')


def clean(v):
    return '' if v is None else ' '.join(str(v).replace('\n', ' ').split())


def norm(v):
    t = clean(v).upper().replace('º', '°')
    return ''.join(c for c in unicodedata.normalize('NFD', t) if unicodedata.category(c) != 'Mn')


def applies(v, grade, section):
    t = norm(v)
    if not t:
        return False

    # Casos directos: 6°B / 6 B / 6ºB
    if re.search(rf'(?<!\d){grade}\s*°?\s*{section}(?![A-Z])', t):
        return True

    # Casos agrupados: 6°A y B / 6°A, B, C y D / 3°A-B-C-D
    m = re.search(rf'(?<!\d){grade}\s*°?\s*(?:BASICO\s*)?([^.;:\n]{{0,45}})', t)
    if m:
        letters = re.findall(r'(?<![A-Z])[A-D](?![A-Z])', m.group(1))
        if section in letters:
            return True

    # Casos repetidos: 3°A 3°B Y 3°D
    if re.search(rf'(?<!\d){grade}\s*°?\s*{section}(?![A-Z])', t):
        return True

    return False


def month_from_sheet(title):
    t = norm(title)
    for name, mo in MONTHS.items():
        if name in t:
            return mo
    return None


def merged_anchor_value(ws, row, col):
    """Devuelve el valor visible de una celda, resolviendo celdas combinadas."""
    for rng in ws.merged_cells.ranges:
        if rng.min_row <= row <= rng.max_row and rng.min_col <= col <= rng.max_col:
            return ws.cell(rng.min_row, rng.min_col).value
    return ws.cell(row, col).value


def event_column_span(ws, row, col):
    """Obtiene las columnas ocupadas por el bloque/celda del evento."""
    for rng in ws.merged_cells.ranges:
        if rng.min_row <= row <= rng.max_row and rng.min_col <= col <= rng.max_col:
            return range(rng.min_col, rng.max_col + 1)
    return range(col, col + 1)


def day_from_header(v):
    """Acepta encabezados del calendario como 'MARTES 6'."""
    t = norm(v)
    if not t or not any(day in t for day in WEEKDAYS):
        return None
    m = re.search(r'(?<!\d)([12]?\d|3[01])(?!\d)', t)
    if not m:
        return None
    d = int(m.group(1))
    return d if 1 <= d <= 31 else None


def bare_day(v):
    """Fallback para calendarios cuyo encabezado contiene sólo el número."""
    if isinstance(v, (int, float)) and int(v) == v and 1 <= int(v) <= 31:
        return int(v)
    t = clean(v)
    if re.fullmatch(r'\d{1,2}', t):
        d = int(t)
        return d if 1 <= d <= 31 else None
    return None


def date_for_event(ws, row, col):
    """
    La fecha se determina por el encabezado DEL MISMO BLOQUE/columna.
    Ejemplo: celda superior 'MARTES 6' -> actividad inmediatamente debajo = día 6.
    Nunca busca fechas en columnas vecinas no pertenecientes al bloque del evento.
    """
    mo = month_from_sheet(ws.title)
    if not mo:
        return None

    cols = list(event_column_span(ws, row, col))

    # 1) Encabezado con nombre del día, buscando hacia arriba sólo en las columnas del bloque.
    for r in range(row - 1, max(0, row - 6), -1):
        for c in cols:
            dn = day_from_header(merged_anchor_value(ws, r, c))
            if dn:
                try:
                    return date(2026, mo, dn)
                except ValueError:
                    pass

    # 2) Fallback estricto: número solo, igualmente en el mismo bloque.
    for r in range(row - 1, max(0, row - 4), -1):
        for c in cols:
            dn = bare_day(merged_anchor_value(ws, r, c))
            if dn:
                try:
                    return date(2026, mo, dn)
                except ValueError:
                    pass

    return None


def subject_and_description(v):
    """Usa únicamente el contenido del bloque del día; no concatena toda la fila."""
    text = clean(v)
    # Elimina prefijos de curso al comienzo para una lectura más limpia.
    body = re.sub(
        r'^\s*\d+\s*[°º]?\s*(?:[A-D](?:\s*[,\-/YAND]+\s*(?:\d+\s*[°º]?\s*)?[A-D])*)\s*[:.-]?\s*',
        '', text, flags=re.IGNORECASE
    ).strip()

    if not body:
        body = text

    # La asignatura suele aparecer antes de ':'
    m = re.match(r'^([A-Za-zÁÉÍÓÚÑáéíóúñ /&]+?)\s*:\s*(.+)$', body)
    if m:
        subject = clean(m.group(1)).title()
        description = clean(m.group(2))
    else:
        subject = 'Actividad / evaluación'
        description = body

    return subject, description


def extract(key, src):
    grade = re.match(r'(\d+)', key).group(1)
    section = key[-1]
    label = src['curso']
    url = f"https://docs.google.com/spreadsheets/d/{src['sheet_id']}/export?format=xlsx"
    path = TMP / f'{key}.xlsx'

    r = requests.get(url, timeout=60)
    r.raise_for_status()
    path.write_bytes(r.content)

    wb = load_workbook(path, data_only=True, read_only=False)
    rows, seen = [], set()

    for ws in wb.worksheets:
        if not ws.max_row or not ws.max_column:
            continue

        for row in range(1, ws.max_row + 1):
            for col in range(1, ws.max_column + 1):
                v = ws.cell(row, col).value
                if not applies(v, grade, section):
                    continue

                d = date_for_event(ws, row, col)
                if not d:
                    print(f'[sin fecha] {label} {ws.title} R{row}C{col}: {clean(v)[:140]}')
                    continue

                subject, description = subject_and_description(v)
                rec = {
                    'fecha': d.isoformat(),
                    'curso': label,
                    'asignatura': subject,
                    'descripcion': description,
                    'texto_original': clean(v),
                    'tipo': 'Calendario oficial',
                    'hoja': ws.title,
                }

                fp = (rec['fecha'], rec['curso'], norm(rec['texto_original']))
                if fp not in seen:
                    seen.add(fp)
                    rows.append(rec)

    print(label, 'registros:', len(rows))
    return rows


records = []
for key, src in CFG.items():
    records.extend(extract(key, src))

records.sort(key=lambda x: (x['fecha'], x['curso'], x['asignatura']))
payload = {
    'actualizado_en': datetime.now().astimezone().strftime('%d-%m-%Y %H:%M'),
    'fuente': 'Colegio Andrée English School',
    'cursos': ['3°D', '6°B'],
    'evaluaciones': records,
}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print('Total registros publicados:', len(records))
