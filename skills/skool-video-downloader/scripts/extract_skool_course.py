#!/usr/bin/env python3
"""
Skool Classroom & Resources Extractor (v2.1.0)
Parses Skool classroom HTML or Next.js __NEXT_DATA__ JSON to extract lesson titles, md IDs, video links, and attached resources (PDFs, ZIPs, Docs).
"""

import argparse
import json
import os
import re
import sys

def find_deep(obj, predicate):
    """Recursively search for objects matching predicate."""
    matches = []
    if isinstance(obj, dict):
        if predicate(obj):
            matches.append(obj)
        for v in obj.values():
            matches.extend(find_deep(v, predicate))
    elif isinstance(obj, list):
        for item in obj:
            matches.extend(find_deep(item, predicate))
    return matches

def extract_from_html(html_content: str, base_url: str = None) -> tuple:
    lessons = []
    attachments = []
    seen_lessons = set()
    seen_att = set()

    # 1. Look for __NEXT_DATA__
    next_match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html_content, re.DOTALL)
    if next_match:
        try:
            data = json.loads(next_match.group(1))
            # Find lesson items
            lesson_objs = find_deep(data, lambda x: isinstance(x, dict) and x.get('id') and (x.get('metadata') or x.get('videoLink')))
            
            for item in lesson_objs:
                meta = item.get('metadata') or item
                md = item.get('id') or ''
                title = meta.get('title') or item.get('title') or f"Lesson_{md[:8]}"
                video_link = meta.get('videoLink') or meta.get('video_url') or item.get('videoLink')
                
                lesson_url = f"{base_url}?md={md}" if base_url and md else f"?md={md}"
                if lesson_url not in seen_lessons:
                    seen_lessons.add(lesson_url)
                    
                    # Extract attachments within this lesson
                    lesson_files = meta.get('attachments') or item.get('attachments') or meta.get('files') or []
                    att_list = []
                    for f in lesson_files:
                        if isinstance(f, dict):
                            f_url = f.get('url') or f.get('link') or f.get('downloadUrl')
                            f_name = f.get('name') or f.get('filename') or 'Resource'
                            if f_url:
                                att_list.append({"name": f_name, "url": f_url, "size": f.get('size')})
                        elif isinstance(f, str) and f.startswith('http'):
                            att_list.append({"name": f.split('/')[-1], "url": f, "size": None})

                    lessons.append({
                        "id": md,
                        "title": title.strip(),
                        "url": lesson_url,
                        "video_link": video_link,
                        "attachments": att_list,
                        "source": "Next.js Data"
                    })
        except Exception as e:
            print(f"⚠️ Warning: Could not parse __NEXT_DATA__: {e}")

    # 2. Regex fallback for md= parameters
    md_matches = re.findall(r'md=([a-f0-9]{16,64})', html_content)
    for md in md_matches:
        lesson_url = f"{base_url}?md={md}" if base_url else f"?md={md}"
        if lesson_url not in seen_lessons:
            seen_lessons.add(lesson_url)
            lessons.append({
                "id": md,
                "title": f"Lesson_{md[:8]}",
                "url": lesson_url,
                "video_link": None,
                "attachments": [],
                "source": "Regex md="
            })

    # 3. Regex scan for downloadable attachments
    att_matches = re.findall(r'href=[\'"]([^\'"]+?\.(?:pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv))[\'"]', html_content, re.IGNORECASE)
    for att_url in att_matches:
        if att_url not in seen_att:
            seen_att.add(att_url)
            name = att_url.split('/')[-1].split('?')[0]
            attachments.append({
                "name": name,
                "url": att_url
            })

    return lessons, attachments

def main():
    parser = argparse.ArgumentParser(description="Extract all lesson URLs, metadata, and attached resources from a Skool classroom HTML page.")
    parser.add_argument("--input-html", "-i", required=True, help="Path to saved Skool classroom HTML file")
    parser.add_argument("--base-url", "-b", default="https://www.skool.com/classroom", help="Base classroom URL")
    parser.add_argument("--output", "-o", default="skool_course_manifest.json", help="Output file path (.json, .csv, or .txt)")

    args = parser.parse_args()

    if not os.path.exists(args.input_html):
        print(f"❌ Error: File not found: {args.input_html}")
        sys.exit(1)

    with open(args.input_html, 'r', encoding='utf-8', errors='ignore') as f:
        html = f.read()

    lessons, attachments = extract_from_html(html, args.base_url)
    total_lesson_att = sum(len(l.get('attachments', [])) for l in lessons) + len(attachments)
    print(f"🔍 Found {len(lessons)} lessons and {total_lesson_att} attached resources in {args.input_html}")

    if args.output.endswith('.json'):
        manifest = {
            "total_lessons": len(lessons),
            "total_attachments": total_lesson_att,
            "lessons": lessons,
            "global_attachments": attachments
        }
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
    elif args.output.endswith('.csv'):
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write("Index,Title,ID,URL,Video_Link,Attachments_Count\n")
            for i, l in enumerate(lessons, 1):
                clean_title = l['title'].replace('"', '""')
                vlink = l.get('video_link') or ''
                att_count = len(l.get('attachments', []))
                f.write(f'{i},"{clean_title}","{l["id"]}","{l["url"]}","{vlink}",{att_count}\n')
    else:
        with open(args.output, 'w', encoding='utf-8') as f:
            for l in lessons:
                f.write(f"{l['url']}\n")

    print(f"✅ Saved manifest to: {args.output}")

if __name__ == "__main__":
    main()
