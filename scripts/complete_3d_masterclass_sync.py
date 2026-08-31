import json, os, urllib.request, re, http.cookiejar, subprocess, time
from scripts.server import (
    COOKIES_FILE, SSL_CTX, BASE_DIR, FFMPEG_BIN,
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

def resolve_loom_stream_url(loom_share_url):
    loom_id_match = re.search(r'/share/([a-f0-9]+)', loom_share_url)
    if not loom_id_match:
        return None
    lid = loom_id_match.group(1)
    try:
        p_req = urllib.request.Request(f"https://www.loom.com/share/{lid}", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(p_req, timeout=10) as p_res:
            p_html = p_res.read().decode("utf-8")
        hls_match = re.search(r'(https://luna\.loom\.com/[^"\'\s<>]+playlist\.m3u8[^"\'\s<>]*)', p_html)
        if hls_match:
            return hls_match.group(1).replace("&amp;", "&")
    except Exception as e:
        print(f"     ⚠️ Loom page scrape error ({lid}): {e}")
    return None

processed_count = 0
for mod in target_course.get('modules', []):
    mod_title = mod.get('title')
    mod_folder = os.path.join(dest_base, clean_folder_name(mod_title))
    os.makedirs(mod_folder, exist_ok=True)
    
    folder_path_parts = ["Ultimate editors", "3D Animated Editing Masteclass", clean_folder_name(mod_title)]
    gdrive_mod_folder_id = resolve_gdrive_folder_hierarchy(folder_path_parts)

    for les in mod.get('lessons', []):
        les_id = les.get('id')
        les_title = les.get('title')
        skool_les = lessons_map.get(les_id)
        
        video_url = skool_les.get('videoLink') if skool_les else None
        if not video_url or not video_url.startswith("http"):
            continue

        safe_name = f"{clean_file_name(les_title)}.mp4"
        file_path = os.path.join(mod_folder, safe_name)
        
        print(f"\n📥 [{processed_count+1}/37] Processing: '{les_title}'...")
        
        # Download logic
        success = False
        if "loom.com" in video_url:
            hls_url = resolve_loom_stream_url(video_url)
            if hls_url:
                print(f"     🎥 Direct Loom HLS stream found, downloading with FFmpeg...")
                cmd = [FFMPEG_BIN or "ffmpeg", "-y", "-i", hls_url, "-c", "copy", file_path]
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
                    success = True
            if not success:
                cmd = ["yt-dlp", "-o", file_path, "--force-overwrites", video_url]
                p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
                    success = True
        elif "youtube.com" in video_url or "youtu.be" in video_url:
            cmd = ["yt-dlp", "-o", file_path, "--force-overwrites", "--cookies", COOKIES_FILE, video_url]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
                success = True
        else:
            cmd = ["yt-dlp", "-o", file_path, "--force-overwrites", video_url]
            p = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
                success = True

        if success and os.path.exists(file_path):
            file_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"     ✅ Downloaded: {file_mb:.2f} MB")
            
            print(f"     ☁️ Uploading to Google Drive...")
            gid = upload_file_to_gdrive(file_path, gdrive_mod_folder_id)
            if gid and isinstance(gid, str):
                glink = f"https://drive.google.com/file/d/{gid}/view?usp=drivesdk"
                les['gdriveId'] = gid
                les['gdriveLink'] = glink
                les['inDrive'] = True
                processed_count += 1
                print(f"     🎯 Google Drive updated successfully: ID={gid}")
            elif isinstance(gid, dict) and gid.get('id'):
                actual_id = gid['id']
                les['gdriveId'] = actual_id
                les['gdriveLink'] = f"https://drive.google.com/file/d/{actual_id}/view?usp=drivesdk"
                les['inDrive'] = True
                processed_count += 1
                print(f"     🎯 Google Drive updated successfully: ID={actual_id}")
        else:
            print(f"     ⚠️ Failed to download {les_title}")

# Save updated course-data.js
new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
with open(course_data_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\n🎉 SUCCESS: All {processed_count} unique videos downloaded, uploaded, and mapped in course-data.js!")
