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

def scan_course_by_slug(course_slug):
    url = f"https://www.skool.com/ultimateeditors2/classroom/{course_slug}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36", "Referer": "https://www.skool.com/"})
    try:
        with opener.open(req, timeout=15) as res:
            html = res.read().decode("utf-8")
        m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
        if not m:
            return []
        data = json.loads(m.group(1))
        course_obj = data.get("props", {}).get("pageProps", {}).get("course", {})
        
        all_res = []
        lessons_to_scan = []
        for mod_idx, mod in enumerate(course_obj.get("children", []), 1):
            mod_title = mod.get("course", {}).get("metadata", {}).get("title") or f"Modulo {mod_idx}"
            for les_idx, les in enumerate(mod.get("children", []), 1):
                les_info = les.get("course", {})
                lid = les_info.get("id")
                ltitle = les_info.get("metadata", {}).get("title") or f"Leccion {les_idx}"
                lessons_to_scan.append((lid, ltitle, mod_title))
                
        def scan_one(les_tuple):
            lid, ltitle, mod_title = les_tuple
            l_url = f"https://www.skool.com/ultimateeditors2/classroom/{course_slug}?md={lid}"
            try:
                l_req = urllib.request.Request(l_url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
                with opener.open(l_req, timeout=10) as l_res:
                    l_html = l_res.read().decode("utf-8")
                lm = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', l_html)
                if lm:
                    ldata = json.loads(lm.group(1))
                    pageProps = ldata.get("props", {}).get("pageProps", {})
                    props_str = json.dumps(pageProps)
                    urls = re.findall(r'https?://[^\s"\'<>]+', props_str)
                    seen_urls = set()
                    
                    # Direct attachments in node
                    for k, v in pageProps.items():
                        if isinstance(v, dict):
                            for att in v.get("attachments", []) or []:
                                a_url = att.get("url") or att.get("link")
                                if a_url and a_url not in seen_urls:
                                    seen_urls.add(a_url)
                                    a_name = att.get("name") or a_url.split("/")[-1].split("?")[0]
                                    all_res.append({
                                        "id": att.get("id") or f"att_{lid}_{len(all_res)}",
                                        "lessonId": lid,
                                        "moduleTitle": mod_title,
                                        "lessonTitle": ltitle,
                                        "name": a_name,
                                        "url": a_url,
                                        "category": "zip" if any(x in a_url.lower() for x in [".zip", ".rar"]) else "pdf" if ".pdf" in a_url.lower() else "link",
                                        "categoryLabel": "Recurso Descargable",
                                        "badgeColor": "#3b82f6"
                                    })
                                    
                    for u in urls:
                        u_clean = u.replace('\\u0026', '&').rstrip('\\')
                        if any(d in u_clean.lower() for d in ['figma.com', 'drive.google.com', 'dropbox.com', 'notion.so', 'canva.com', 'github.com', '.pdf', '.zip', '.rar', '.prfpset', '.aep', '.cube', 'whimsical.com', 'miro.com']):
                            if u_clean not in seen_urls:
                                seen_urls.add(u_clean)
                                label = "Recurso"
                                cat = "link"
                                color = "#3b82f6"
                                if "figma.com" in u_clean: label = "Tablero de Figma"; cat = "figma"; color = "#a855f7"
                                elif "drive.google.com" in u_clean: label = "Carpeta Google Drive"; cat = "gdrive"; color = "#3b82f6"
                                elif "dropbox.com" in u_clean: label = "Carpeta Dropbox"; cat = "dropbox"; color = "#0284c7"
                                elif any(ext in u_clean.lower() for ext in ['.zip', '.rar']): label = "Archivo ZIP / Assets"; cat = "zip"; color = "#f59e0b"
                                elif ".pdf" in u_clean.lower(): label = "Documento PDF"; cat = "pdf"; color = "#ef4444"
                                elif "notion.so" in u_clean: label = "Página de Notion"; cat = "link"; color = "#64748b"
                                
                                all_res.append({
                                    "id": f"res_{lid}_{len(all_res)}",
                                    "lessonId": lid,
                                    "moduleTitle": mod_title,
                                    "lessonTitle": ltitle,
                                    "name": f"{label} · {ltitle}",
                                    "url": u_clean,
                                    "category": cat,
                                    "categoryLabel": label,
                                    "badgeColor": color
                                })
            except Exception:
                pass

        with ThreadPoolExecutor(max_workers=8) as executor:
            executor.map(scan_one, lessons_to_scan)

        return all_res
    except Exception as e:
        print(f"Error {course_slug}:", e)
        return []

# Scan all courses
course_slug_map = {
    "d0fb6bb7": "Cinematic Short-Film Editing Style",
    "e7209e55": "The AI Editing Fundamentals",
    "04c2e06e": "Devin Jatho Editing Masterclass"
}

all_found_resources = {}
for slug, name in course_slug_map.items():
    print(f"🔍 Scanning Skool for resources in: {name} ({slug})...")
    res = scan_course_by_slug(slug)
    all_found_resources[name] = res
    print(f"   -> Found {len(res)} attached resources/links!")

# Merge resources into course-data.js
course_data_file = os.path.join(BASE_DIR, 'studio-web', 'data', 'course-data.js')
if os.path.exists(course_data_file):
    with open(course_data_file, 'r', encoding='utf-8') as f:
        content = f.read()
    start_idx = content.find("window.COMMUNITIES_DATA")
    json_start = content.find("[", start_idx)
    decoder = json.JSONDecoder()
    communities, _ = decoder.raw_decode(content[json_start:])
    
    total_injected = 0
    for comm in communities:
        for crs in comm.get('courses', []):
            crs_title = crs.get('courseTitle', '')
            matching_res = []
            for k, v in all_found_resources.items():
                if k.lower() in crs_title.lower() or crs_title.lower() in k.lower():
                    matching_res = v
                    break
            
            if matching_res:
                print(f"📦 Injecting {len(matching_res)} resources into {crs_title}...")
                for mod in crs.get('modules', []):
                    for les in mod.get('lessons', []):
                        les_title = les.get('rawTitle') or les.get('title', '')
                        matched = [
                            r for r in matching_res 
                            if r.get('lessonId') == les.get('id') or 
                            (les_title and les_title.lower() in r.get('lessonTitle', '').lower()) or
                            (r.get('lessonTitle', '').lower() in les_title.lower())
                        ]
                        if matched:
                            les['resources'] = matched
                            total_injected += len(matched)
                crs['totalResources'] = sum(len(l.get('resources', [])) for m in crs.get('modules', []) for l in m.get('lessons', []))
    
    new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
    with open(course_data_file, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"🎉 Successfully injected {total_injected} total resources across all courses in course-data.js!")

