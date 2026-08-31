import json, os, urllib.request, re, http.cookiejar, subprocess
from scripts.server import (
    COOKIES_FILE, SSL_CTX, BASE_DIR, YTDLP_BIN, FFMPEG_BIN,
    upload_file_to_gdrive, resolve_gdrive_folder_hierarchy,
    clean_folder_name, clean_file_name
)

if not os.path.exists(COOKIES_FILE):
    print("No cookies found.")
    exit(1)

jar = http.cookiejar.MozillaCookieJar(COOKIES_FILE)
jar.load()
opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=SSL_CTX), urllib.request.HTTPCookieProcessor(jar))

# 1. Fetch 3D course page from Skool
url = "https://www.skool.com/ultimate-editors-5412/classroom/b0901302"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.skool.com/"})
with opener.open(req, timeout=15) as res:
    html = res.read().decode("utf-8")

m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html)
if not m:
    print("Failed to read Next.js data")
    exit(1)

data = json.loads(m.group(1))
page_props = data.get("props", {}).get("pageProps", {})

# 2. Build map of lesson ID -> metadata & exact video link
lessons_map = {}
def scan_lessons(o):
    if isinstance(o, dict):
        lid = o.get("id")
        meta = o.get("metadata", {})
        if lid and isinstance(meta, dict) and meta.get("title") and (o.get("parentId") or o.get("unitType") == "module"):
            vlink = meta.get("videoLink") or o.get("videoLink")
            lessons_map[lid] = {
                "id": lid,
                "title": meta.get("title"),
                "videoLink": vlink,
                "desc": meta.get("desc")
            }
        for v in o.values():
            scan_lessons(v)
    elif isinstance(o, list):
        for it in o:
            scan_lessons(it)

scan_lessons(page_props)
print(f"🎯 Total 3D Masterclass lessons found in Skool: {len(lessons_map)}")

# 3. Read studio-web/data/course-data.js
course_data_file = os.path.join(BASE_DIR, 'studio-web', 'data', 'course-data.js')
with open(course_data_file, 'r', encoding='utf-8') as f:
    content = f.read()

start_idx = content.find("window.COMMUNITIES_DATA")
json_start = content.find("[", start_idx)
decoder = json.JSONDecoder()
communities, _ = decoder.raw_decode(content[json_start:])

# Find the 3D course inside communities
target_course = None
for comm in communities:
    for crs in comm.get('courses', []):
        if "3d" in crs.get('id', '').lower() or "3d" in crs.get('courseTitle', '').lower():
            target_course = crs
            break
    if target_course:
        break

if not target_course:
    print("Course not found in course-data.js")
    exit(1)

print(f"🎬 Processing Course: {target_course.get('courseTitle')}")

dest_base = os.path.expanduser("~/Movies/Skool Downloads/Ultimate editors/3D Animated Editing Masteclass")
os.makedirs(dest_base, exist_ok=True)

processed_count = 0
for mod in target_course.get('modules', []):
    mod_title = mod.get('title')
    mod_folder = os.path.join(dest_base, clean_folder_name(mod_title))
    os.makedirs(mod_folder, exist_ok=True)
    
    # Get/create Google Drive folder for module
    folder_path_parts = ["Ultimate editors", "3D Animated Editing Masteclass", clean_folder_name(mod_title)]
    gdrive_mod_folder_id = resolve_gdrive_folder_hierarchy(folder_path_parts)

    for les in mod.get('lessons', []):
        les_id = les.get('id')
        les_title = les.get('title')
        skool_les = lessons_map.get(les_id)
        
        video_url = skool_les.get('videoLink') if skool_les else None
        if not video_url or not video_url.startswith("http"):
            print(f"  ⏭️ Skipping {les_title} (no videoLink)")
            continue

        safe_name = f"{clean_file_name(les_title)}.mp4"
        file_path = os.path.join(mod_folder, safe_name)
        
        print(f"\n📥 [{processed_count+1}/37] Downloading: '{les_title}' from {video_url}...")
        
        # Download using yt-dlp with mp4 output
        cmd = [
            YTDLP_BIN or "yt-dlp",
            "-o", file_path,
            "--no-playlist",
            "--force-overwrites",
            "--ffmpeg-location", FFMPEG_BIN or "ffmpeg",
            "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
            "--merge-output-format", "mp4",
            video_url
        ]
        
        try:
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if p.returncode == 0 and os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
                print(f"     ✅ Downloaded: {os.path.getsize(file_path)/(1024*1024):.2f} MB")
                
                # Upload to Drive
                print(f"     ☁️ Uploading to Google Drive...")
                gdrive_res = upload_file_to_gdrive(file_path, gdrive_mod_folder_id)
                if gdrive_res and gdrive_res.get('id'):
                    gid = gdrive_res['id']
                    glink = gdrive_res.get('webViewLink') or f"https://drive.google.com/file/d/{gid}/view?usp=drivesdk"
                    les['gdriveId'] = gid
                    les['gdriveLink'] = glink
                    les['inDrive'] = True
                    processed_count += 1
                    print(f"     🎯 Google Drive ID updated: {gid}")
            else:
                print(f"     ⚠️ Download error: {p.stderr[:200]}")
        except Exception as de:
            print(f"     ⚠️ Exception during download: {de}")

# Save updated course-data.js
new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
with open(course_data_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\n🎉 DONE: Successfully re-downloaded, uploaded to Drive, and updated {processed_count} unique videos for 3D Animated Editing Masterclass!")
