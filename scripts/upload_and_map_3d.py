import json, os, urllib.request, re, subprocess
from scripts.server import (
    BASE_DIR, FFMPEG_BIN, upload_file_to_gdrive, resolve_gdrive_folder_hierarchy,
    clean_folder_name, clean_file_name
)

# 1. Rename any temp files
dest_base = os.path.expanduser("~/Movies/Skool Downloads/Ultimate editors/3D Animated Editing Masteclass")
laying_temp = os.path.join(dest_base, "09_BartVFX Style Walkthrough", "Laying_the_Foundation.fhls-raw-1500.mp4")
laying_target = os.path.join(dest_base, "09_BartVFX Style Walkthrough", "Laying_the_Foundation.mp4")
if os.path.exists(laying_temp):
    os.rename(laying_temp, laying_target)

# 2. Download missing lessons
missing_looms = [
    ("08_Charles Style Walkthrough", "Rough Cuts and Planning", "https://www.loom.com/share/7b53850c6101456d8c658106f5797a0c"),
    ("08_Charles Style Walkthrough", "Editing The Hook", "https://www.loom.com/share/aa1862b10dbf4d829d0ff765ba49d612"),
    ("09_BartVFX Style Walkthrough", "Finalizing the Visuals", "https://www.loom.com/share/bfd93c371ffd4dcbbf1adfac15bbb18e"),
    ("09_BartVFX Style Walkthrough", "Creating our Animations - Part 1", "https://www.loom.com/share/88bc1d5258594adab2caa6d8dfcc3701"),
    ("09_BartVFX Style Walkthrough", "Animating the Text", "https://www.loom.com/share/16fa2609784543afab6161e9a051930a"),
    ("09_BartVFX Style Walkthrough", "Creating Our Animations - Part 3", "https://www.loom.com/share/d383958dd2eb41b593f9444e6bb01c99")
]

def resolve_loom_stream_url(loom_share_url):
    lid = re.search(r'/share/([a-f0-9]+)', loom_share_url).group(1)
    try:
        p_req = urllib.request.Request(f"https://www.loom.com/share/{lid}", headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(p_req, timeout=10) as p_res:
            p_html = p_res.read().decode("utf-8")
        hls_match = re.search(r'(https://luna\.loom\.com/[^"\'\s<>]*\.m3u8[^"\'\s<>]*)', p_html)
        if hls_match:
            return hls_match.group(1).replace("&amp;", "&")
    except Exception as e:
        print(f"     ⚠️ Loom page scrape error ({lid}): {e}")
    return None

for mod_name, les_title, loom_url in missing_looms:
    mod_dir = os.path.join(dest_base, clean_folder_name(mod_name))
    os.makedirs(mod_dir, exist_ok=True)
    out_file = os.path.join(mod_dir, f"{clean_file_name(les_title)}.mp4")
    if not (os.path.exists(out_file) and os.path.getsize(out_file) > 1000000):
        print(f"\n📥 Downloading: {les_title}...")
        hls = resolve_loom_stream_url(loom_url)
        if hls:
            cmd = [FFMPEG_BIN or "ffmpeg", "-y", "-i", hls, "-c", "copy", out_file]
            p = subprocess.run(cmd, capture_output=True, text=True)
            if os.path.exists(out_file) and os.path.getsize(out_file) > 10000:
                print(f"     ✅ Downloaded: {os.path.getsize(out_file)/(1024*1024):.2f} MB")

# 3. Upload ALL MP4s to Drive and update course-data.js
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

total_mapped = 0
for mod in target_course.get('modules', []):
    mod_title = mod.get('title')
    mod_dir = os.path.join(dest_base, clean_folder_name(mod_title))
    folder_path_parts = ["Ultimate editors", "3D Animated Editing Masteclass", clean_folder_name(mod_title)]
    gdrive_mod_folder_id = resolve_gdrive_folder_hierarchy(folder_path_parts)

    for les in mod.get('lessons', []):
        les_title = les.get('title')
        safe_name = f"{clean_file_name(les_title)}.mp4"
        file_path = os.path.join(mod_dir, safe_name)

        if os.path.exists(file_path) and os.path.getsize(file_path) > 10000:
            file_mb = os.path.getsize(file_path) / (1024 * 1024)
            print(f"☁️ Uploading {safe_name} ({file_mb:.2f} MB)...")
            gid = upload_file_to_gdrive(file_path, gdrive_mod_folder_id)
            if gid:
                actual_id = gid if isinstance(gid, str) else gid.get('id')
                les['gdriveId'] = actual_id
                les['gdriveLink'] = f"https://drive.google.com/file/d/{actual_id}/view?usp=drivesdk"
                les['inDrive'] = True
                total_mapped += 1
                print(f"     🎯 Mapped: {les_title} -> {actual_id}")

new_content = f"window.COMMUNITIES_DATA = {json.dumps(communities, indent=2, ensure_ascii=False)};\n\nwindow.COURSE_DATA = window.COMMUNITIES_DATA[0].courses[0];\n"
with open(course_data_file, 'w', encoding='utf-8') as f:
    f.write(new_content)

print(f"\n🎉 COMPLETE: Total {total_mapped} unique videos mapped in course-data.js!")
