#!/usr/bin/env python3
"""Importiert das bestehende Beautylounge-Wiki (Statamic) in TeamHub.

Quelle: Klon von beautyloungeag/wiki.beautylounge.ch (content/collections/wikis/*.md).
Ziel:   Supabase „Teamhub“, Tabelle wiki_articles + Bucket media/wiki/<stufe>/…

Erneut ausführbar: Artikel werden über source_id aktualisiert, Medien überschrieben.

  SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… python3 scripts/import_wiki.py <pfad-zum-wiki-klon> [--dry]
"""
import io, json, os, re, sys, glob, datetime, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

import yaml
from PIL import Image, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/Projects/wiki.beautylounge.ch')
DRY = '--dry' in sys.argv
NO_MEDIA = '--no-media' in sys.argv  # nur Texte neu schreiben
URL = os.environ.get('SUPABASE_URL', '')
KEY = os.environ.get('SUPABASE_SERVICE_ROLE_KEY', '')
ORDER = {'alle': 0, 'filialleitung': 1, 'buero': 2}


def level(zugriff):
    z = zugriff if isinstance(zugriff, list) else ([zugriff] if zugriff else [])
    if 'level1' in z: return 'alle'
    if 'level2' in z: return 'filialleitung'
    return 'buero'  # Level 3, Superuser oder ohne Stufe: im alten Wiki nicht allgemein sichtbar


def tag_titles():
    out = {}
    for f in glob.glob(f'{SRC}/content/taxonomies/tags/*.yaml'):
        out[os.path.basename(f)[:-5]] = (yaml.safe_load(open(f)) or {}).get('title') or os.path.basename(f)[:-5]
    return out


# ---------- Bard (ProseMirror) → einfache Blöcke ----------
def inline(nodes):
    s = ''
    for n in nodes or []:
        t = n.get('type')
        if t == 'text':
            txt = n.get('text', '')
            txt = txt.decode('utf-8', 'replace') if isinstance(txt, bytes) else str(txt)
            marks = {m.get('type'): m for m in n.get('marks') or []}
            if 'link' in marks and marks['link'].get('attrs', {}).get('href'):
                txt = f"[{txt}]({marks['link']['attrs']['href']})"
            lead, trail = txt[:len(txt) - len(txt.lstrip())], txt[len(txt.rstrip()):]
            if 'bold' in marks and txt.strip(): txt = f'{lead}**{txt.strip()}**{trail}'
            if 'italic' in marks and txt.strip(): txt = f'{lead}*{txt.strip()}*{trail}' if 'bold' not in marks else txt
            s += txt
        elif t == 'hardBreak':
            s += '\n'
        elif t == 'image':
            pass  # Bilder als eigener Block, siehe bard()
        else:
            s += inline(n.get('content'))
    return re.sub(r'\*\*(\s*)\*\*', r'\1', s).strip()


def bard(nodes, blocks, images):
    for n in nodes or []:
        t = n.get('type')
        if t == 'heading':
            txt = inline(n.get('content')).replace('**', '')
            if txt: blocks.append({'t': 'h', 'level': (n.get('attrs') or {}).get('level', 2), 'text': txt})
        elif t == 'paragraph':
            for c in n.get('content') or []:
                if c.get('type') == 'image': add_img(c.get('attrs', {}).get('src'), blocks, images)
            txt = inline(n.get('content'))
            if txt: blocks.append({'t': 'p', 'text': txt})
        elif t in ('bulletList', 'orderedList'):
            items = []
            for li in n.get('content') or []:
                parts = [inline(p.get('content')) for p in li.get('content') or [] if p.get('type') == 'paragraph']
                sub = [x for p in li.get('content') or [] if p.get('type') in ('bulletList', 'orderedList') for x in [inline(q.get('content')[0].get('content') if q.get('content') else []) for q in p.get('content') or []]]
                txt = ' '.join(x for x in parts if x)
                if sub: txt += ''.join(f'\n– {x}' for x in sub if x)
                if txt: items.append(txt)
            if items: blocks.append({'t': 'ul' if t == 'bulletList' else 'ol', 'items': items})
        elif t == 'blockquote':
            txt = ' '.join(inline(p.get('content')) for p in n.get('content') or [])
            if txt: blocks.append({'t': 'quote', 'text': txt})
        elif t == 'image':
            add_img(n.get('attrs', {}).get('src'), blocks, images)
        elif t == 'table':
            for row in n.get('content') or []:
                cells = [inline([x for c in cell.get('content') or [] for x in (c.get('content') or [])]) for cell in row.get('content') or []]
                if any(cells): blocks.append({'t': 'p', 'text': ' · '.join(c for c in cells if c)})
        elif n.get('content'):
            bard(n.get('content'), blocks, images)


def add_img(src, blocks, images):
    if not src: return
    name = src.split('::', 2)[2] if src.startswith('asset::') else src.lstrip('/').removeprefix('images/')
    images.add(name)
    blocks.append({'t': 'img', 'src': name})


def as_list(v):
    return [v] if isinstance(v, str) else [x for x in (v or []) if isinstance(x, str)]


def convert(fm):
    blocks, images, files = [], set(), set()
    for s in fm.get('page_builder') or []:
        if s.get('enabled') is False: continue
        t = s.get('type')
        if t == 'bild':
            for b in as_list(s.get('bild')): add_img(b, blocks, images)
        elif t == 'text':
            bard(s.get('article'), blocks, images)
            if s.get('mitbild') or s.get('bild'):
                for b in as_list(s.get('bild')): add_img(b, blocks, images)
        elif t == 'video':
            v = s.get('video')
            if isinstance(v, str) and v.strip(): blocks.append({'t': 'video', 'url': v.strip()})
        elif t == 'file':
            for f in s.get('file') or []:
                if f.get('datei'):
                    files.add(f['datei'])
                    nice = re.sub(r'-\d{9,}(?=\.)', '', f['datei']).replace('-', ' ').rsplit('.', 1)[0]
                    blocks.append({'t': 'file', 'src': f['datei'], 'name': f.get('titel') or nice})
    # Als „Bild“ eingebundene PDFs/Dokumente werden zu Dateien
    for b in blocks:
        if b['t'] == 'img' and not re.search(r'\.(jpe?g|png|gif|webp|heic|bmp|tiff?)$', b['src'], re.I):
            images.discard(b['src']); files.add(b['src'])
            b.update({'t': 'file', 'name': b['src'].rsplit('.', 1)[0].replace('-', ' ')})
    return blocks, images, files


def plain(blocks):
    out = []
    for b in blocks:
        if b['t'] in ('h', 'p', 'quote'): out.append(b['text'])
        elif b['t'] in ('ul', 'ol'): out.append('\n'.join(f'- {x}' for x in b['items']))
    return re.sub(r'\*\*|\*|\[([^\]]+)\]\([^)]+\)', lambda m: m.group(1) or '', '\n\n'.join(out))


# ---------- Supabase ----------
def req(method, path, body=None, headers=None):
    h = {'apikey': KEY, 'Authorization': f'Bearer {KEY}', **(headers or {})}
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    if not isinstance(body, bytes) and body is not None: h.setdefault('Content-Type', 'application/json')
    r = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(r, timeout=120) as res: return res.status, res.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def media_path(lv, name, kind):
    stem = re.sub(r'[^\w.-]+', '_', name.rsplit('.', 1)[0])[:120]
    full = re.sub(r'[^\w.-]+', '_', name)[:160]
    return f'wiki/{lv}/{stem}.webp' if kind == 'img' else f'wiki/{lv}/{full}'


def find(name):
    for base in ('public/images', 'public/files', 'public'):
        p = os.path.join(SRC, base, name)
        if os.path.isfile(p): return p
    hits = glob.glob(f'{SRC}/public/**/{glob.escape(os.path.basename(name))}', recursive=True)
    return hits[0] if hits else None


def upload(job):
    path, src, kind = job
    try:
        return _upload(path, src, kind)
    except Exception as e:
        return path, 0, f'fehler: {e}'


def _upload(path, src, kind):
    if kind == 'img':
        im = Image.open(src)
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB', 'RGBA'): im = im.convert('RGBA' if 'transparency' in im.info or im.mode in ('LA', 'P') else 'RGB')
        im.thumbnail((1600, 1600))
        buf = io.BytesIO(); im.save(buf, 'WEBP', quality=80, method=4); data, ctype = buf.getvalue(), 'image/webp'
    else:
        data, ctype = open(src, 'rb').read(), 'application/pdf' if src.lower().endswith('.pdf') else 'application/octet-stream'
    if DRY: return path, len(data), 200
    st, _ = req('POST', f'/storage/v1/object/media/{urllib.request.quote(path)}', data, {'Content-Type': ctype, 'x-upsert': 'true'})
    return path, len(data), st


def main():
    tags = tag_titles()
    articles, img_level, file_level = [], {}, {}
    for f in sorted(glob.glob(f'{SRC}/content/collections/wikis/*.md')):
        raw = open(f).read()
        m = re.match(r'^---\n(.*?)\n---\n?(.*)$', raw, re.S)
        fm = yaml.safe_load(m.group(1)) or {}
        lv = level(fm.get('zugriff'))
        blocks, images, files = convert(fm)
        for i in images: img_level[i] = min(img_level.get(i, 'buero'), lv, key=ORDER.get)
        for i in files: file_level[i] = min(file_level.get(i, 'buero'), lv, key=ORDER.get)
        tg = [tags.get(t, t) for t in fm.get('tags') or []]
        date = os.path.basename(f)[:10]
        upd = fm.get('updated_at')
        upd_iso = datetime.datetime.fromtimestamp(upd, datetime.timezone.utc).isoformat() if isinstance(upd, (int, float)) else f'{date}T12:00:00Z'
        body = plain(blocks)
        articles.append({
            'source_id': fm.get('id'), 'title': fm.get('title', '').strip(), 'intro': (fm.get('text') or '').strip(),
            'category': tg[0] if tg else 'Allgemein', 'tags': tg, 'access_level': lv, 'published': fm.get('published', True) is not False,
            'blocks': blocks, 'body': ((fm.get('text') or '').strip() + '\n\n' + body).strip(), 'minutes': max(1, round(len(body.split()) / 180)),
            'media_kind': 'none', 'updated_at': upd_iso, 'created_at': f'{date}T12:00:00Z', 'is_sample': False,
        })
    # Blöcke auf die Speicherpfade umschreiben (Datei liegt in der offensten Stufe, die sie braucht)
    missing = set()
    for a in articles:
        for b in a['blocks']:
            if b['t'] == 'img':
                b['src'] = media_path(img_level[b['src']], b['src'], 'img') if find(b['src']) else (missing.add(b['src']) or None)
            elif b['t'] == 'file':
                b['src'] = media_path(file_level[b['src']], b['src'], 'file') if find(b['src']) else (missing.add(b['src']) or None)
        a['blocks'] = [b for b in a['blocks'] if b.get('src', True)]
    jobs = [(media_path(l, n, 'img'), find(n), 'img') for n, l in img_level.items() if find(n)]
    jobs += [(media_path(l, n, 'file'), find(n), 'file') for n, l in file_level.items() if find(n)]
    print(f'{len(articles)} Artikel · {len(img_level)} Bilder · {len(file_level)} Dateien · fehlend {len(missing)}')
    by = {k: sum(1 for a in articles if a['access_level'] == k) for k in ORDER}
    print('Stufen:', by)
    with ThreadPoolExecutor(8) as ex:
        res = [] if NO_MEDIA else list(ex.map(upload, jobs))
    bad = [r for r in res if r[2] not in (200, 201)]
    print(f'Medien hochgeladen: {len(res) - len(bad)} · {round(sum(r[1] for r in res) / 1e6, 1)} MB · Fehler {len(bad)}', bad[:3])
    if DRY: return
    for i in range(0, len(articles), 25):
        st, body = req('POST', '/rest/v1/wiki_articles?on_conflict=source_id', articles[i:i + 25], {'Prefer': 'resolution=merge-duplicates,return=minimal'})
        if st >= 300: print('Artikel-Fehler', st, body[:300]); sys.exit(1)
    st, _ = req('DELETE', '/rest/v1/wiki_articles?is_sample=eq.true', None, {'Prefer': 'return=minimal'})
    print('Artikel gespeichert, Beispielartikel entfernt:', st)


if __name__ == '__main__':
    main()
