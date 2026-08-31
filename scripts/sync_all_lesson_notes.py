import json
import os
import urllib.request
import re
import http.cookiejar
from scripts.server import COOKIES_FILE, SSL_CTX, BASE_DIR

if not os.path.exists(COOKIES_FILE):
    print("No cookies file found.")
    exit(1)

jar = http.cookiejar.MozillaCookieJar(COOKIES_FILE)
jar.load()
opener = urllib.request.build_opener(
    urllib.request.HTTPSHandler(context=SSL_CTX),
    urllib.request.HTTPCookieProcessor(jar)
)

def tiptap_to_html(raw_desc):
    if not raw_desc:
        return ""
    if isinstance(raw_desc, str):
        if raw_desc.startswith("[v2]"):
            try:
                raw_desc = json.loads(raw_desc[4:])
            except Exception:
                return raw_desc
        elif raw_desc.startswith("[") or raw_desc.startswith("{"):
            try:
                raw_desc = json.loads(raw_desc)
            except Exception:
                return raw_desc
        else:
            return raw_desc

    def render_node(node):
        if not isinstance(node, dict):
            return ""
        node_type = node.get("type", "")
        content = node.get("content", [])
        inner_html = "".join(render_node(child) for child in content)
        
        if node_type == "text":
            text = node.get("text", "")
            for m in node.get("marks", []):
                m_type = m.get("type")
                if m_type == "bold":
                    text = f"<strong>{text}</strong>"
                elif m_type == "italic":
                    text = f"<em>{text}</em>"
                elif m_type == "code":
                    text = f"<code>{text}</code>"
                elif m_type == "link":
                    href = m.get("attrs", {}).get("href", "#")
                    text = f'<a href="{href}" target="_blank" rel="noopener noreferrer" class="lesson-link">{text}</a>'
            return text
        elif node_type == "paragraph":
            return f"<p>{inner_html}</p>" if inner_html.strip() else ""
        elif node_type == "heading":
            lvl = node.get("attrs", {}).get("level", 3)
            return f"<h{lvl}>{inner_html}</h{lvl}>"
        elif node_type == "bulletList":
            return f"<ul>{inner_html}</ul>"
        elif node_type == "orderedList":
            return f"<ol>{inner_html}</ol>"
        elif node_type == "listItem":
            return f"<li>{inner_html}</li>"
        elif node_type == "blockquote":
            return f"<blockquote>{inner_html}</blockquote>"
        elif node_type == "codeBlock":
            return f"<pre><code>{inner_html}</code></pre>"
        elif node_type == "hardBreak":
            return "<br/>"
        return inner_html

    if isinstance(raw_desc, list):
        return "".join(render_node(n) for n in raw_desc)
    elif isinstance(raw_desc, dict):
        return render_node(raw_desc)
    return str(raw_desc)

def scan_course_deep(course_slug):
    url = f"https://www.skool.com/ultimateeditors2/classroom/{course_slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Referer": "https://www.skool.com/"})
    try:
        with opener.open(req, timeout=15) as res:
            html = res.read().decode("utf-8")
        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if not m:
            return {}
        data = json.loads(m.group(1))
        pageProps = data.get("props", {}).get("pageProps", {})
        
        all_lessons = {}
        
        def find_lessons(o):
            if isinstance(o, dict):
                lid = o.get("id")
                meta = o.get("metadata")
                if lid and isinstance(meta, dict):
                    title = meta.get("title")
                    desc = meta.get("desc")
                    if title:
                        all_lessons[lid] = {
                            "id": lid,
                            "title": title,
                            "descriptionHtml": tiptap_to_html(desc) if desc else ""
                        }
                for v in o.values():
                    find_lessons(v)
            elif isinstance(o, list):
                for it in o:
                    find_lessons(it)
                    
        find_lessons(pageProps)
        return all_lessons
    except Exception as e:
        print(f"Error scanning {course_slug}:", e)
        return {}

slug_map = {
    "d0fb6bb7": "Cinematic Short-Film Editing Style",
    "e7209e55": "The AI Editing Fundamentals",
    "04c2e06e": "Devin Jatho Editing Masterclass"
}

all_scanned_notes = {}
for slug, name in slug_map.items():
    print(f"📖 Deep scanning rich text lesson notes for: {name} ({slug})...")
    res = scan_course_deep(slug)
    all_scanned_notes[name] = res
    with_notes = sum(1 for l in res.values() if l.get('descriptionHtml'))
    print(f"   -> Found {len(res)} total lessons ({with_notes} with rich text notes & links)!")

# Update course-data.js
course_data_file = os.path.join(BASE_DIR, 'studio-web', 'data', 'course-data.js')
if os.path.exists(course_data_file):
    with open(course_data_file, 'r', encoding='utf-8') as f:
        content = f.read()
    start_idx = content.find("window.COMMUNITIES_DATA")
    json_start = content.find("[", start_idx)
    decoder = json.JSONDecoder()
    communities, _ = decoder.raw_decode(content[json_start:])
    
    total_notes_injected = 0
    total_extra_resources = 0
    
    for comm in communities:
        for crs in comm.get('courses', []):
            crs_title = crs.get('courseTitle', '')
            matching_notes = {}
            for k, v in all_scanned_notes.items():
                if k.lower() in crs_title.lower() or crs_title.lower() in k.lower():
                    matching_notes = v
                    break
            
            if matching_notes:
                print(f"✨ Injecting rich text notes into: {crs_title}...")
                for mod in crs.get('modules', []):
                    for les in mod.get('lessons', []):
                        les_id = les.get('id')
                        les_title = les.get('rawTitle') or les.get('title', '')
                        
                        note_info = matching_notes.get(les_id)
                        if not note_info:
                            # match by title substring
                            for n_id, n_data in matching_notes.items():
                                if les_title and n_data.get('title') and (
                                    les_title.lower() in n_data['title'].lower() or 
                                    n_data['title'].lower() in les_title.lower() or
                                    re.sub(r'^\d+[\.\-\s]+', '', les.get('title', '')).strip().lower() in n_data['title'].lower()
                                ):
                                    note_info = n_data
                                    break
                                    
                        if note_info and note_info.get('descriptionHtml'):
                            les['descriptionHtml'] = note_info['descriptionHtml']
                            total_notes_injected += 1
                            
                            # Also extract any <a> links in descriptionHtml as downloadable resource cards if not already present
                            existing_urls = {r.get('url') for r in les.get('resources', [])}
                            embedded_links = re.findall(r'href=[\'"]([^\'"]+)[\'"]', note_info['descriptionHtml'])
                            for link_url in embedded_links:
                                link_url_clean = link_url.replace('&amp;', '&')
                                if any(d in link_url_clean.lower() for d in ['figma.com', 'drive.google.com', 'dropbox.com', 'notion.so', 'canva.com', 'github.com', '.pdf', '.zip', '.rar', '.prfpset', '.aep', '.cube']):
                                    if link_url_clean not in existing_urls:
                                        existing_urls.add(link_url_clean)
                                        lbl = "Recurso / Enlace"
                                        cat = "link"
                                        col = "#3b82f6"
                                        if "drive.google.com" in link_url_clean: lbl = "Carpeta Google Drive"; cat = "gdrive"; col = "#3b82f6"
                                        elif "figma.com" in link_url_clean: lbl = "Tablero Figma"; cat = "figma"; col = "#a855f7"
                                        elif any(ext in link_url_clean.lower() for ext in ['.zip', '.rar']): lbl = "Archivo ZIP / Assets"; cat = "zip"; col = "#f59e0b"
                                        
                                        les.setdefault('resources', []).append({
                                            "id": f"link_{len(les['resources'])}",
                                            "lessonId": les_id,
                                            "moduleTitle": mod.get('title'),
                                            "lessonTitle": les_title,
                                            "name": f"{lbl} · {les_title}",
                                            "url": link_url_clean,
                                            "category": cat,
                                            "categoryLabel": lbl,
                                            "badgeColor": col
                                        })
                                        total_extra_resources += 1
                                        
                crs['totalResources'] = sum(len(l.get('resources', [])) for m in crs.get('modules', []) for l in m.get('lessons', []))

    new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
    with open(course_data_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
        
    print(f"🎉 Successfully injected {total_notes_injected} rich text lesson notes & {total_extra_resources} extra link resources into course-data.js!")

