import json, os, urllib.request, re, http.cookiejar
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
        elif node_type == "horizontalRule":
            return "<hr style=\"border: 0; border-top: 1px solid rgba(255,255,255,0.1); margin: 16px 0;\"/>"
        elif node_type == "hardBreak":
            return "<br/>"
        return inner_html

    if isinstance(raw_desc, list):
        return "".join(render_node(n) for n in raw_desc)
    elif isinstance(raw_desc, dict):
        return render_node(raw_desc)
    return str(raw_desc)

groups = ["ultimateeditors2", "ultimate-editors-5412"]
lessons_by_id = {}
lessons_by_title = {}

for grp in groups:
    print(f"\n=======================================================")
    print(f"🌐 Scanning Group: '{grp}'...")
    req = urllib.request.Request(f"https://www.skool.com/{grp}/classroom", headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
    try:
        with opener.open(req, timeout=12) as res:
            html = res.read().decode("utf-8")
        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if not m:
            continue
        data = json.loads(m.group(1))
        all_courses = data.get("props", {}).get("pageProps", {}).get("allCourses", [])
        
        for c in all_courses:
            c_slug = c.get("name")
            c_title = c.get("metadata", {}).get("title") or c_slug
            print(f"  📚 Course: '{c_title}' (slug: {c_slug})...")
            
            c_url = f"https://www.skool.com/{grp}/classroom/{c_slug}"
            try:
                c_req = urllib.request.Request(c_url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
                with opener.open(c_req, timeout=10) as c_res:
                    c_html = c_res.read().decode("utf-8")
                c_m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', c_html)
                if not c_m:
                    continue
                c_data = json.loads(c_m.group(1))
                c_props = c_data.get("props", {}).get("pageProps", {})
                
                lesson_nodes = {}
                def extract_lessons(o):
                    if isinstance(o, dict):
                        lid = o.get("id")
                        meta = o.get("metadata")
                        if lid and isinstance(meta, dict) and (o.get("parentId") or o.get("unitType") == "module" or "videoId" in meta or "videoThumbnail" in meta):
                            t = meta.get("title")
                            desc = meta.get("desc")
                            if t and t != c_title:
                                lesson_nodes[lid] = {
                                    "id": lid,
                                    "courseTitle": c_title,
                                    "group": grp,
                                    "slug": c_slug,
                                    "title": t,
                                    "desc": desc,
                                    "descHtml": tiptap_to_html(desc) if desc else ""
                                }
                        for v in o.values():
                            extract_lessons(v)
                    elif isinstance(o, list):
                        for it in o:
                            extract_lessons(it)
                            
                extract_lessons(c_props)
                
                need_pages = [lid for lid, ld in lesson_nodes.items() if not ld["descHtml"]]
                if need_pages:
                    def fetch_les_desc(lid):
                        l_url = f"https://www.skool.com/{grp}/classroom/{c_slug}?md={lid}"
                        try:
                            l_req = urllib.request.Request(l_url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
                            with opener.open(l_req, timeout=10) as l_res:
                                l_html = l_res.read().decode("utf-8")
                            l_m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', l_html)
                            if l_m:
                                l_data = json.loads(l_m.group(1))
                                lp = l_data.get("props", {}).get("pageProps", {})
                                
                                def find_specific_desc(o):
                                    if isinstance(o, dict):
                                        if o.get("id") == lid and isinstance(o.get("metadata"), dict) and o["metadata"].get("desc"):
                                            return o["metadata"]["desc"]
                                        for v in o.values():
                                            res = find_specific_desc(v)
                                            if res: return res
                                    elif isinstance(o, list):
                                        for it in o:
                                            res = find_specific_desc(it)
                                            if res: return res
                                    return None
                                
                                found_desc = find_specific_desc(lp)
                                if found_desc:
                                    lesson_nodes[lid]["descHtml"] = tiptap_to_html(found_desc)
                        except Exception:
                            pass

                    with ThreadPoolExecutor(max_workers=8) as executor:
                        executor.map(fetch_les_desc, need_pages)
                
                for lid, linfo in lesson_nodes.items():
                    lessons_by_id[lid] = linfo
                    clean_t = re.sub(r'^\d+[\.\-\s]+', '', linfo['title']).strip().lower()
                    lessons_by_title[(c_title.lower(), clean_t)] = linfo
                
                print(f"     -> Loaded {len(lesson_nodes)} lessons ({sum(1 for l in lesson_nodes.values() if l['descHtml'])} with rich text)")
            except Exception as e:
                print(f"     ⚠️ Error loading course {c_title}: {e}")
    except Exception as ge:
        print(f"  ⚠️ Error loading group {grp}: {ge}")

print(f"\n🎯 Total master lessons mapped: {len(lessons_by_id)} by ID, {len(lessons_by_title)} by Title")

# Step 2: Update studio-web/data/course-data.js
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
        print(f"\n📦 Updating Studio course: '{crs_title}'...")
        for mod in crs.get('modules', []):
            for les in mod.get('lessons', []):
                les_id = les.get('id')
                les_title = les.get('rawTitle') or les.get('title', '')
                clean_t = re.sub(r'^\d+[\.\-\s]+', '', les_title).strip().lower()
                
                matched = lessons_by_id.get(les_id)
                if not matched:
                    for (c_key, t_key), minfo in lessons_by_title.items():
                        if c_key in crs_title.lower() or crs_title.lower() in c_key or ("editing fundamentals" in c_key and "editing fundamentals" in crs_title.lower()):
                            if clean_t and t_key and (clean_t in t_key or t_key in clean_t):
                                matched = minfo
                                break
                
                if matched and matched.get('descHtml'):
                    les['descriptionHtml'] = matched['descHtml']
                    total_injected += 1
                    
                    existing_urls = {r.get('url') for r in les.get('resources', [])}
                    links = re.findall(r'href=[\'"]([^\'"]+)[\'"]', matched['descHtml'])
                    for link_url in links:
                        link_url_clean = link_url.replace('&amp;', '&')
                        if any(d in link_url_clean.lower() for d in ['drive.google.com', 'dropbox.com', 'figma.com', 'notion.so', 'canva.com', 'github.com', '.pdf', '.zip', '.rar', '.prfpset', '.aep', '.cube']):
                            if link_url_clean not in existing_urls:
                                existing_urls.add(link_url_clean)
                                lbl = "Recurso / Enlace"
                                cat = "link"
                                col = "#3b82f6"
                                if "drive.google.com" in link_url_clean: lbl = "Descarga de Archivos / PDFs"; cat = "gdrive"; col = "#3b82f6"
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
                                total_resources_added += 1

        crs['totalResources'] = sum(len(l.get('resources', [])) for m in crs.get('modules', []) for l in m.get('lessons', []))

new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
with open(course_data_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\n🎉 SUCCESS: Injected {total_injected} rich text descriptions and {total_resources_added} extra link resources across all courses in course-data.js!")
