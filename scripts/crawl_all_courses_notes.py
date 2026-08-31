import json
import os
import urllib.request
import re
import http.cookiejar
from concurrent.futures import ThreadPoolExecutor
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

# Fetch all course slugs from ultimateeditors2 classroom
req = urllib.request.Request("https://www.skool.com/ultimateeditors2/classroom", headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Referer": "https://www.skool.com/"})
with opener.open(req, timeout=15) as res:
    html = res.read().decode("utf-8")

m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
if not m:
    print("Could not read classroom.")
    exit(1)

data = json.loads(m.group(1))
pageProps = data.get("props", {}).get("pageProps", {})
all_courses = pageProps.get("allCourses", [])
print(f"Loaded {len(all_courses)} courses from Skool community.")

all_course_lessons_data = {}

for c_obj in all_courses:
    c_slug = c_obj.get("name")
    c_title = c_obj.get("metadata", {}).get("title") or c_slug
    print(f"\n🚀 Scanning full hierarchy & notes for: '{c_title}' (slug: {c_slug})...")
    
    url_c = f"https://www.skool.com/ultimateeditors2/classroom/{c_slug}"
    try:
        req_c = urllib.request.Request(url_c, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
        with opener.open(req_c, timeout=15) as res_c:
            html_c = res_c.read().decode("utf-8")
        mc = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html_c)
        if not mc:
            continue
        c_data = json.loads(mc.group(1))
        c_props = c_data.get("props", {}).get("pageProps", {})
        
        # 1. Deep scan all lesson nodes in this course
        lessons_found = {}
        def deep_find_lessons(o):
            if isinstance(o, dict):
                lid = o.get("id")
                meta = o.get("metadata")
                if lid and isinstance(meta, dict):
                    t = meta.get("title")
                    desc = meta.get("desc") or meta.get("description")
                    if t:
                        lessons_found[lid] = {
                            "id": lid,
                            "title": t,
                            "desc": desc,
                            "descHtml": tiptap_to_html(desc) if desc else ""
                        }
                for v in o.values():
                    deep_find_lessons(v)
            elif isinstance(o, list):
                for it in o:
                    deep_find_lessons(it)
                    
        deep_find_lessons(c_props)
        print(f"   Found {len(lessons_found)} lesson nodes in course payload.")
        
        # 2. For lessons that don't have desc in main payload, crawl their specific page ?md=lid
        need_fetch = [lid for lid, ldata in lessons_found.items() if not ldata["descHtml"]]
        if need_fetch:
            print(f"   Fetching {len(need_fetch)} individual lesson pages for deep notes...")
            def fetch_single_lesson_notes(lid):
                les_url = f"https://www.skool.com/ultimateeditors2/classroom/{c_slug}?md={lid}"
                try:
                    l_req = urllib.request.Request(les_url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
                    with opener.open(l_req, timeout=10) as l_res:
                        l_html = l_res.read().decode("utf-8")
                    l_m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', l_html)
                    if l_m:
                        l_data = json.loads(l_m.group(1))
                        lp = l_data.get("props", {}).get("pageProps", {})
                        
                        # Find desc in this specific page payload
                        def find_page_desc(o):
                            if isinstance(o, dict):
                                if "desc" in o and o["desc"]:
                                    return o["desc"]
                                if "description" in o and o["description"] and isinstance(o["description"], (dict, list)):
                                    return o["description"]
                                for v in o.values():
                                    res = find_page_desc(v)
                                    if res:
                                        return res
                            elif isinstance(o, list):
                                for it in o:
                                    res = find_page_desc(it)
                                    if res:
                                        return res
                            return None
                        
                        found = find_page_desc(lp)
                        if found:
                            lessons_found[lid]["descHtml"] = tiptap_to_html(found)
                except Exception:
                    pass

            with ThreadPoolExecutor(max_workers=8) as executor:
                executor.map(fetch_single_lesson_notes, need_fetch)

        all_course_lessons_data[c_title] = lessons_found
        with_desc = sum(1 for l in lessons_found.values() if l["descHtml"])
        print(f"   ✅ Finished '{c_title}': {with_desc} / {len(lessons_found)} lessons have rich text notes!")
        
    except Exception as e:
        print(f"   ⚠️ Error scanning {c_title}:", e)

# 3. Merge into studio-web/data/course-data.js
course_data_file = os.path.join(BASE_DIR, 'studio-web', 'data', 'course-data.js')
with open(course_data_file, 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find("window.COMMUNITIES_DATA")
json_start = content.find("[", start_idx)
decoder = json.JSONDecoder()
communities, _ = decoder.raw_decode(content[json_start:])

total_injected = 0
total_resources_added = 0

for comm in communities:
    for crs in comm.get('courses', []):
        crs_title = crs.get('courseTitle', '')
        # Find matching scanned course
        matching_map = {}
        for k, v in all_course_lessons_data.items():
            if k.lower() in crs_title.lower() or crs_title.lower() in k.lower() or ("devin" in k.lower() and "devin" in crs_title.lower()) or ("ai" in k.lower() and "ai" in crs_title.lower()) or ("cinematic" in k.lower() and "cinematic" in crs_title.lower()) or ("bymaximise" in k.lower() and "bymaximise" in crs_title.lower()) or ("josh" in k.lower() and "josh" in crs_title.lower()):
                matching_map = v
                break
        
        print(f"\n📦 Merging into Studio course: '{crs_title}'...")
        for mod in crs.get('modules', []):
            for les in mod.get('lessons', []):
                les_id = les.get('id')
                les_raw_title = les.get('rawTitle') or les.get('title', '')
                clean_t = re.sub(r'^\d+[\.\-\s]+', '', les_raw_title).strip().lower()
                
                # Match by ID or by clean Title
                matched_info = matching_map.get(les_id)
                if not matched_info:
                    for s_id, s_data in matching_map.items():
                        s_clean = re.sub(r'^\d+[\.\-\s]+', '', s_data['title']).strip().lower()
                        if (clean_t and s_clean and (clean_t in s_clean or s_clean in clean_t)) or (les_id and les_id == s_id):
                            matched_info = s_data
                            break
                
                if matched_info and matched_info.get('descHtml'):
                    les['descriptionHtml'] = matched_info['descHtml']
                    total_injected += 1
                    
                    # Extract any links from descHtml into resources list
                    existing_urls = {r.get('url') for r in les.get('resources', [])}
                    links = re.findall(r'href=[\'"]([^\'"]+)[\'"]', matched_info['descHtml'])
                    for link_url in links:
                        link_url_clean = link_url.replace('&amp;', '&')
                        if any(d in link_url_clean.lower() for d in ['drive.google.com', 'dropbox.com', 'figma.com', 'notion.so', 'canva.com', 'github.com', '.pdf', '.zip', '.rar', '.prfpset', '.aep', '.cube']):
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
                                    "lessonTitle": les_raw_title,
                                    "name": f"{lbl} · {les_raw_title}",
                                    "url": link_url_clean,
                                    "category": cat,
                                    "categoryLabel": lbl,
                                    "badgeColor": col
                                })
                                total_resources_added += 1

        crs['totalResources'] = sum(len(l.get('resources', [])) for m in crs.get('modules', []) for l in m.get('lessons', []))

new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
with open(course_data_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\n🎉 DONE: Injected {total_injected} rich text descriptions and {total_resources_added} extra link resources across all courses in course-data.js!")
