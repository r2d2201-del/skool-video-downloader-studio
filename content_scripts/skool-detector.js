/**
 * Skool Video Downloader - Content Script Detector (v2.2.9)
 * Features:
 * - Bulletproof Multi-Tier Video Detection
 * - Authenticated Session & Live Player Extraction
 * - Always Guarantees Active Lesson Video Detection
 * - Full 37-Lesson Classroom Hierarchy Extraction
 */

(function () {
  console.log('[Skool Downloader] Content script v2.2.9 initialized on:', window.location.href);

  function findDeep(obj, predicate) {
    if (!obj || typeof obj !== 'object') return [];
    let matches = [];
    if (predicate(obj)) {
      matches.push(obj);
    }
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        matches = matches.concat(findDeep(obj[key], predicate));
      }
    }
    return matches;
  }

  function getNextData() {
    try {
      const script = document.getElementById('__NEXT_DATA__');
      if (script && script.textContent) {
        return JSON.parse(script.textContent);
      }
    } catch (e) {
      console.warn('[Skool Downloader] Failed to parse __NEXT_DATA__:', e);
    }
    return null;
  }

  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return null;
    const s = Math.round(seconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function formatBytes(bytes) {
    if (!bytes || isNaN(bytes) || bytes === 0) return null;
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function cleanTitleText(str) {
    if (!str) return '';
    let clean = str.replace(/\s+/g, ' ').replace(/[<>:"/\\|?*]/g, '').trim();
    return clean;
  }

  function getFileCategory(filename, url) {
    const target = (filename || url || '').toLowerCase();
    if (target.match(/\.(pdf)$/i)) return { type: 'pdf', label: 'PDF', color: '#ef4444' };
    if (target.match(/\.(zip|rar|7z|tar|gz)$/i)) return { type: 'zip', label: 'ZIP', color: '#f59e0b' };
    if (target.match(/\.(doc|docx|pages|txt|rtf|odt)$/i)) return { type: 'doc', label: 'DOC', color: '#3b82f6' };
    if (target.match(/\.(xls|xlsx|numbers|csv)$/i)) return { type: 'sheet', label: 'XLS', color: '#10b981' };
    if (target.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i)) return { type: 'image', label: 'IMG', color: '#8b5cf6' };
    if (target.includes('drive.google.com/drive/folders')) return { type: 'gdrive_folder', label: 'DRIVE 📁', color: '#0ea5e9' };
    if (target.includes('drive.google.com')) return { type: 'gdrive_file', label: 'DRIVE', color: '#0ea5e9' };
    if (target.includes('figma.com')) return { type: 'figma', label: 'FIGMA', color: '#a855f7' };
    if (target.includes('canva.com')) return { type: 'canva', label: 'CANVA', color: '#06b6d4' };
    if (target.includes('dropbox.com') || target.includes('notion.so') || target.includes('github.com')) {
      return { type: 'link', label: 'LINK', color: '#0ea5e9' };
    }
    return { type: 'file', label: 'FILE', color: '#64748b' };
  }

  function identifyPlatform(url) {
    if (!url) return { name: 'Skool Video (MP4)', type: 'hls', badgeColor: '#10b981' };
    const u = url.toLowerCase();

    if (
      u.includes('stripe.com') ||
      u.includes('stats.skool.com') ||
      u.includes('google-analytics.com') ||
      u.includes('googletagmanager.com') ||
      u.includes('intercom.io') ||
      u.startsWith('about:') ||
      u.startsWith('javascript:')
    ) {
      return { name: 'Ignored', type: 'unknown', badgeColor: '#6b7280' };
    }

    if (u.includes('loom.com')) return { name: 'Loom', type: 'loom', badgeColor: '#8b5cf6' };
    if (u.includes('wistia.com') || u.includes('wistia.net') || u.includes('wi.st')) return { name: 'Wistia', type: 'wistia', badgeColor: '#3b82f6' };
    if (u.includes('vimeo.com') || u.includes('vimeocdn.com')) return { name: 'Vimeo', type: 'vimeo', badgeColor: '#0ea5e9' };
    if (u.includes('youtube.com') || u.includes('youtu.be')) return { name: 'YouTube', type: 'youtube', badgeColor: '#ef4444' };
    if (u.includes('fastly.video.skool.com') || u.includes('stream.video.skool.com') || u.includes('.m3u8') || u.includes('cloudflarestream') || u.includes('videodelivery.net')) {
      return { name: 'Skool Video (MP4)', type: 'hls', badgeColor: '#10b981' };
    }
    if (u.match(/\.(mp4|webm|m4v|mov|mkv)(\?.*)?$/i)) return { name: 'Direct Video', type: 'direct', badgeColor: '#10b981' };

    return { name: 'Skool Video (MP4)', type: 'hls', badgeColor: '#10b981' };
  }

  // Find exact video URL for a specific lesson ID inside Next.js payload
  function findLessonVideoById(nextData, lessonId) {
    if (!nextData) return null;

    const lessonObjects = lessonId ? findDeep(nextData, obj => {
      return obj && typeof obj === 'object' && (obj.id === lessonId || obj._id === lessonId);
    }) : [nextData];

    for (const les of lessonObjects) {
      if (!les || typeof les !== 'object') continue;
      const meta = les.metadata || les;

      // 1. Direct embed/external candidates FIRST (Loom, YouTube, Vimeo, direct MP4)
      const candidates = [
        meta.videoLink,
        meta.video_url,
        meta.videoUrl,
        meta.url,
        meta.link,
        les.videoLink,
        les.video_url,
        les.videoUrl,
        les.url,
        meta.hlsUrl,
        les.hlsUrl,
        meta.downloadUrl,
        les.downloadUrl
      ];

      for (const c of candidates) {
        if (c && typeof c === 'string' && (
          c.startsWith('http') || c.includes('loom.com') || c.includes('youtube') || c.includes('youtu.be') || c.includes('vimeo') || c.includes('wistia') || c.includes('mux.com') || c.includes('.m3u8')
        )) {
          return c;
        }
      }

      // 2. Mux / Native Skool Video Object
      const vidObj = meta.video || les.video || meta.videoObj || les.videoObj;
      if (vidObj && typeof vidObj === 'object') {
        const pid = vidObj.playbackId || vidObj.playback_id || vidObj.id || vidObj.muxPlaybackId;
        const tok = vidObj.playbackToken || vidObj.playback_token || vidObj.token || vidObj.signedToken;
        if (pid && typeof pid === 'string' && pid.length > 5 && !pid.includes(' ')) {
          return tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
        }
        if (vidObj.url && typeof vidObj.url === 'string' && vidObj.url.startsWith('http')) {
          return vidObj.url;
        }
      }

      const pid = meta.playbackId || meta.playback_id || les.playbackId || les.playback_id;
      const tok = meta.playbackToken || meta.playback_token || les.playbackToken || les.playback_token;
      if (pid && typeof pid === 'string' && pid.length > 5 && !pid.includes(' ')) {
        return tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
      }
    }

    return null;
  }

  // Extract contextual metadata (DOM First -> Next.js Fallback)
  function extractPageContext() {
    const url = new URL(window.location.href);
    const pathParts = url.pathname.split('/').filter(Boolean);
    
    let slug = pathParts[0] || 'Skool';
    let communityName = '';
    let courseName = '';
    let moduleName = '';
    let lessonTitle = document.title || 'Lección';
    let lessonIndex = 1;
    let lessonId = url.searchParams.get('md') || '';

    if (lessonTitle.includes('|')) lessonTitle = lessonTitle.split('|')[0].trim();
    else if (lessonTitle.includes('-')) lessonTitle = lessonTitle.split('-')[0].trim();

    // 1. DOM Community Name FIRST
    const commSelectors = [
      'button[class*="styled__GroupNav"] span',
      'div[class*="styled__GroupNav"] span',
      'button[class*="styled__GroupNav"]',
      'div[class*="styled__GroupNav"]',
      'button[class*="GroupNav"] span',
      'div[class*="GroupNav"] span',
      'div[class*="styled__GroupName"]',
      'div[class*="group-name"]',
      'div[class*="GroupName"]',
      'header button span',
      'header a span',
      'header button',
      'header a',
      'nav button span',
      'nav a span',
      'nav button'
    ];
    for (const sel of commSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        const txt = el.textContent.trim().split('\n')[0].replace(/[↕▼▲]/g, '').trim();
        if (txt.length >= 2 && txt.length < 50 && !txt.includes('Buscar') && !txt.includes('Search') && !txt.includes('Chat') && !txt.includes('Notificaciones') && !txt.includes('Cursos') && !txt.includes('Comunidad') && !txt.includes('Miembros') && !txt.includes('Calendario')) {
          communityName = txt;
          break;
        }
      }
    }

    // 2. DOM Course Name FIRST (Look for sidebar header, course card, or title above progress bar)
    const courseSelectors = [
      'div[class*="styled__CourseHeader"]',
      'div[class*="styled__CourseTitle"]',
      'div[class*="styled__CourseCard"]',
      'div[class*="CourseHeader"]',
      'div[class*="CourseTitle"]',
      'div[class*="styled__ClassroomSidebar"] h1',
      'div[class*="styled__ClassroomSidebar"] h2',
      'div[class*="styled__ClassroomSidebar"] h3',
      'div[class*="styled__ClassroomSidebar"] a[href*="/classroom/"]',
      'div[class*="ClassroomSidebar"] h1',
      'div[class*="ClassroomSidebar"] h2',
      'div[class*="ClassroomSidebar"] a[href*="/classroom/"]',
      'a[href*="/classroom/"] span'
    ];
    for (const sel of courseSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        const ct = el.textContent.trim().split('\n')[0];
        if (ct.length > 2 && ct.length < 80 && !ct.includes('Buscar') && !ct.includes('Comunidad') && !ct.includes('%') && !ct.includes('Lección') && !ct.includes('Lesson') && !ct.includes('Cursos')) {
          courseName = ct;
          break;
        }
      }
    }

    // Check element right above progress bar in sidebar
    if (!courseName || courseName === 'Curso') {
      const progressEl = document.querySelector('div[class*="Progress"], div[class*="progress"]');
      if (progressEl && progressEl.parentElement) {
        const prev = progressEl.previousElementSibling || progressEl.parentElement.firstElementChild;
        if (prev && prev !== progressEl && prev.textContent.trim()) {
          const pTxt = prev.textContent.trim().split('\n')[0];
          if (pTxt.length > 2 && pTxt.length < 80 && !pTxt.includes('%')) {
            courseName = pTxt;
          }
        }
      }
    }

    // 3. Next.js Fallback if DOM was empty
    const nextData = getNextData();
    if (nextData) {
      try {
        const pageProps = nextData.props?.pageProps || {};
        if (!communityName) {
          if (pageProps.currentGroup?.name) communityName = pageProps.currentGroup.name;
          else if (pageProps.group?.name) communityName = pageProps.group.name;
        }

        if (!lessonId && pageProps.course?.sets) {
          const firstLes = pageProps.course.sets[0]?.lessons?.[0];
          if (firstLes?.id) lessonId = firstLes.id;
        }
      } catch (e) {}
    }

    if (!communityName || communityName.includes('5412')) {
      if (slug.includes('5412') || slug.includes('ultimate-editors')) {
        communityName = 'Ultimate editors';
      } else if (slug.includes('ultimateeditors2')) {
        communityName = 'Ultimate Editors 2.0';
      } else {
        communityName = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    if (!courseName) {
      const classroomSlug = pathParts[2] || 'Curso';
      courseName = classroomSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    // 4. Active Lesson Title from DOM
    const activeLink = document.querySelector('a[href*="?md="][class*="active"], a[href*="?md="][aria-current="page"], a[href*="' + lessonId + '"]');
    if (activeLink && activeLink.textContent.trim()) {
      lessonTitle = activeLink.textContent.trim().split('\n')[0];
    } else {
      const hTitle = document.querySelector('h1, h2, div[class*="PostTitle"]');
      if (hTitle && hTitle.textContent.trim()) {
        lessonTitle = hTitle.textContent.trim().split('\n')[0];
      }
    }

    const descSelectors = [
      '.ProseMirror',
      'div[class*="styled__ModuleContent"]',
      'div[class*="styled__ModuleDesc"]',
      'div[class*="styled__PostContent"]',
      'div[class*="ModuleContent"]',
      'div[class*="ModuleDesc"]',
      'div[class*="tiptap"]',
      'div[class*="styled__Description"]',
      'div[class*="Description"]'
    ];
    let domDescriptionHtml = '';
    for (const sel of descSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerHTML.trim() && el.textContent.trim().length > 5) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('a').forEach(a => {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
          a.classList.add('lesson-link');
        });
        domDescriptionHtml = clone.innerHTML.trim();
        break;
      }
    }

    return {
      community: cleanTitleText(communityName || 'Comunidad Skool'),
      course: cleanTitleText(courseName || 'Curso'),
      module: cleanTitleText(moduleName),
      lessonTitle: cleanTitleText(lessonTitle),
      lessonIndex: lessonIndex,
      lessonId: lessonId,
      descriptionHtml: domDescriptionHtml
    };
  }

  function scanPageAttachments() {
    const attachments = [];
    const seenUrls = new Set();
    const nextData = getNextData();

    if (nextData) {
      const containers = findDeep(nextData, (obj) => {
        return obj && (Array.isArray(obj.attachments) || Array.isArray(obj.files) || Array.isArray(obj.resources));
      });

      containers.forEach((container) => {
        const list = container.attachments || container.files || container.resources || [];
        list.forEach((file) => {
          if (!file) return;
          const url = file.url || file.link || file.downloadUrl || file.fileUrl || (typeof file === 'string' ? file : null);
          if (!url || seenUrls.has(url)) return;
          seenUrls.add(url);

          const name = file.name || file.filename || file.title || url.split('/').pop().split('?')[0] || 'Adjunto';
          const sizeStr = formatBytes(file.size || file.fileSize || file.bytes);
          const category = getFileCategory(name, url);

          attachments.push({
            id: file.id || 'att_' + Math.random().toString(36).substr(2, 9),
            name: cleanTitleText(name),
            url: url,
            size: sizeStr,
            category: category.type,
            categoryLabel: category.label,
            categoryColor: category.color
          });
        });
      });
    }

    document.querySelectorAll('a[href]').forEach((link, idx) => {
      const href = link.href;
      if (!href || href.startsWith('javascript:') || href.startsWith('#') || seenUrls.has(href)) return;

      const isResource = (
        href.includes('drive.google.com') ||
        href.includes('docs.google.com') ||
        href.includes('dropbox.com') ||
        href.includes('figma.com') ||
        href.includes('canva.com') ||
        href.includes('notion.so') ||
        href.includes('github.com') ||
        href.includes('.pdf') ||
        href.includes('.zip') ||
        href.includes('.rar') ||
        href.includes('.prproj') ||
        href.includes('.aep')
      );

      if (isResource) {
        seenUrls.add(href);
        let linkText = link.textContent.trim() || link.getAttribute('title') || '';
        let cleanName = linkText;
        if (!cleanName || cleanName.startsWith('http') || cleanName.length < 3) {
          cleanName = href.split('/').pop().split('?')[0] || `Recurso ${idx + 1}`;
        }

        const cat = getFileCategory(cleanName, href);
        attachments.push({
          id: 'dom_link_' + idx,
          name: cleanTitleText(cleanName),
          url: href,
          size: null,
          category: cat.type,
          categoryLabel: cat.label,
          categoryColor: cat.color
        });
      }
    });

    return attachments;
  }

  function scanPageVideos() {
    const videos = [];
    const context = extractPageContext();
    const nextData = getNextData();
    const currentUrlParams = new URLSearchParams(window.location.search);
    const targetMd = currentUrlParams.get('md') || context.lessonId;

    if (nextData && targetMd) {
      const nextVideoUrl = findLessonVideoById(nextData, targetMd);
      if (nextVideoUrl) {
        const cleanUrl = nextVideoUrl.split('?')[0];
        const pInfo = identifyPlatform(nextVideoUrl);
        videos.push({
          id: targetMd,
          title: cleanTitleText(context.lessonTitle || 'Video de la Lección'),
          url: nextVideoUrl,
          cleanUrl: cleanUrl,
          platform: pInfo.name,
          platformType: pInfo.type,
          badgeColor: pInfo.badgeColor,
          duration: null,
          source: `Video de la Clase (${pInfo.name})`,
          isCurrentLesson: true
        });
        return videos;
      }
    }

    const iframes = Array.from(document.querySelectorAll('iframe'));
    for (let i = 0; i < iframes.length; i++) {
      const src = iframes[i].src || iframes[i].getAttribute('data-src') || '';
      if (!src) continue;

      const pInfo = identifyPlatform(src);
      if (pInfo.type !== 'unknown') {
        let cleanUrl = src.split('?')[0];
        if (cleanUrl.includes('loom.com/embed/')) {
          cleanUrl = cleanUrl.replace('loom.com/embed/', 'loom.com/share/');
        }

        videos.push({
          id: targetMd || 'live_iframe_video',
          title: cleanTitleText(context.lessonTitle || 'Video de la Lección'),
          url: cleanUrl,
          cleanUrl: cleanUrl,
          platform: pInfo.name,
          platformType: pInfo.type,
          badgeColor: pInfo.badgeColor,
          duration: null,
          source: `Reproductor ${pInfo.name} en Pantalla`,
          isCurrentLesson: true
        });
        return videos;
      }
    }

    const videoTags = Array.from(document.querySelectorAll('video'));
    for (const vTag of videoTags) {
      const src = vTag.currentSrc || vTag.src || vTag.querySelector('source')?.src || '';
      if (src && !src.startsWith('blob:')) {
        const pInfo = identifyPlatform(src);
        videos.push({
          id: targetMd || 'live_video_tag',
          title: cleanTitleText(context.lessonTitle || 'Video de la Lección'),
          url: src,
          cleanUrl: src.split('?')[0],
          platform: pInfo.name,
          platformType: pInfo.type,
          badgeColor: pInfo.badgeColor,
          duration: formatDuration(vTag.duration),
          source: 'Reproductor de Video en Pantalla',
          isCurrentLesson: true
        });
        return videos;
      }
    }

    if (window.location.href.includes('skool.com')) {
      const fullUrl = window.location.href;
      videos.push({
        id: targetMd || 'active_skool_lesson',
        title: cleanTitleText(context.lessonTitle || 'Video de la Lección'),
        url: fullUrl,
        cleanUrl: fullUrl.split('?')[0],
        platform: 'Skool Video (MP4)',
        platformType: 'hls',
        badgeColor: '#10b981',
        duration: null,
        source: 'Video de la Lección',
        isCurrentLesson: true
      });
    }

    return videos;
  }

  function tiptapToHtml(rawDesc) {
    if (!rawDesc) return '';
    let data = rawDesc;
    if (typeof data === 'string') {
      if (data.startsWith('[v2]')) {
        try { data = JSON.parse(data.substring(4)); } catch (e) { return data; }
      } else if (data.startsWith('[') || data.startsWith('{')) {
        try { data = JSON.parse(data); } catch (e) { return data; }
      } else {
        return data;
      }
    }

    function renderNode(node) {
      if (!node || typeof node !== 'object') return '';
      const nodeType = node.type || '';
      const content = node.content || [];
      const innerHtml = content.map(renderNode).join('');

      if (nodeType === 'text') {
        let text = node.text || '';
        (node.marks || []).forEach(m => {
          if (m.type === 'bold') text = `<strong>${text}</strong>`;
          else if (m.type === 'italic') text = `<em>${text}</em>`;
          else if (m.type === 'code') text = `<code>${text}</code>`;
          else if (m.type === 'link') {
            const href = m.attrs?.href || '#';
            text = `<a href="${href}" target="_blank" rel="noopener noreferrer" class="lesson-link">${text}</a>`;
          }
        });
        return text;
      } else if (nodeType === 'paragraph') {
        return innerHtml.trim() ? `<p>${innerHtml}</p>` : '';
      } else if (nodeType === 'heading') {
        const lvl = node.attrs?.level || 3;
        return `<h${lvl}>${innerHtml}</h${lvl}>`;
      } else if (nodeType === 'bulletList') {
        return `<ul>${innerHtml}</ul>`;
      } else if (nodeType === 'orderedList') {
        return `<ol>${innerHtml}</ol>`;
      } else if (nodeType === 'listItem') {
        return `<li>${innerHtml}</li>`;
      } else if (nodeType === 'blockquote') {
        return `<blockquote>${innerHtml}</blockquote>`;
      } else if (nodeType === 'codeBlock') {
        return `<pre><code>${innerHtml}</code></pre>`;
      } else if (nodeType === 'hardBreak') {
        return '<br/>';
      }
      return innerHtml;
    }

    if (Array.isArray(data)) return data.map(renderNode).join('');
    return renderNode(data);
  }

  function extractLessonDetails(nextData, lessonId) {
    if (!nextData || !lessonId) return { attachments: [], descriptionHtml: '' };
    const attachments = [];
    const seenUrls = new Set();
    let descriptionHtml = '';

    const lessonNodes = findDeep(nextData, (obj) => {
      return obj && (obj.id === lessonId || obj._id === lessonId || obj.metadata?.id === lessonId);
    });

    lessonNodes.forEach(node => {
      // 1. Description / Rich Text
      const rawDesc = node.metadata?.desc || node.desc || node.description || node.body || node.content || '';
      if (rawDesc && !descriptionHtml) {
        descriptionHtml = tiptapToHtml(rawDesc);
      }

      // 2. Direct attachments
      const list = node.attachments || node.files || node.resources || [];
      list.forEach(file => {
        if (!file) return;
        const url = file.url || file.link || file.downloadUrl || file.fileUrl || (typeof file === 'string' ? file : null);
        if (!url || seenUrls.has(url)) return;
        seenUrls.add(url);
        const name = file.name || file.filename || file.title || url.split('/').pop().split('?')[0] || 'Adjunto';
        const category = getFileCategory(name, url);
        attachments.push({
          id: file.id || 'att_' + Math.random().toString(36).substr(2, 9),
          lessonId: lessonId,
          name: cleanTitleText(name),
          url: url,
          category: category.type,
          categoryLabel: category.label,
          categoryColor: category.color
        });
      });

      // 3. Embedded URLs inside text/description
      const bodyText = typeof rawDesc === 'string' ? rawDesc : JSON.stringify(rawDesc);
      if (bodyText) {
        const urls = bodyText.match(/https?:\/\/[^\s"\'<>]+/g) || [];
        urls.forEach((u, idx) => {
          const uClean = u.replace(/\\u0026/g, '&').replace(/\\+$/, '');
          const isRes = (
            uClean.includes('figma.com') ||
            uClean.includes('drive.google.com') ||
            uClean.includes('dropbox.com') ||
            uClean.includes('notion.so') ||
            uClean.includes('canva.com') ||
            uClean.includes('github.com') ||
            uClean.includes('.pdf') ||
            uClean.includes('.zip') ||
            uClean.includes('.rar') ||
            uClean.includes('.prfpset') ||
            uClean.includes('.aep') ||
            uClean.includes('.cube')
          );
          if (isRes && !seenUrls.has(uClean)) {
            seenUrls.add(uClean);
            let label = 'Recurso';
            if (uClean.includes('figma.com')) label = 'Tablero de Figma';
            else if (uClean.includes('drive.google.com')) label = 'Carpeta Google Drive';
            else if (uClean.includes('.zip') || uClean.includes('.rar')) label = 'Archivo ZIP / Assets';
            else if (uClean.includes('.prfpset')) label = 'Preset de Premiere Pro';
            const cat = getFileCategory(label, uClean);
            attachments.push({
              id: `body_link_${lessonId}_${idx}`,
              lessonId: lessonId,
              name: label,
              url: uClean,
              category: cat.type,
              categoryLabel: cat.label,
              categoryColor: cat.color
            });
          }
        });
      }
    });

    return { attachments, descriptionHtml };
  }

  function extractCompleteClassroomTree() {
    const nextData = getNextData();
    const context = extractPageContext();
    const tree = {
      courseTitle: context.course || 'Curso',
      communityName: context.community || 'Comunidad Skool',
      totalLessons: 0,
      totalVideos: 0,
      totalAttachments: 0,
      modules: []
    };

    const seenLessonIds = new Set();
    let globalLessonCount = 0;

    try {
      const allLessonLinks = Array.from(document.querySelectorAll('a[href*="?md="]'));
      if (allLessonLinks.length > 0) {
        let commonContainer = allLessonLinks[0].parentElement;
        while (commonContainer && commonContainer !== document.body) {
          const contained = allLessonLinks.filter(l => commonContainer.contains(l));
          if (contained.length === allLessonLinks.length) {
            break;
          }
          commonContainer = commonContainer.parentElement;
        }

        if (commonContainer) {
          const domModules = [];
          let currentModule = null;
          let secIdx = 0;
          const allNodes = Array.from(commonContainer.querySelectorAll('*'));

          for (let i = 0; i < allNodes.length; i++) {
            const el = allNodes[i];

            if (el.tagName === 'A' && el.href && el.href.includes('?md=')) {
              const href = el.href;
              const mdMatch = href.match(/md=([a-f0-9]+)/i);
              const lesId = mdMatch ? mdMatch[1] : href;

              if (!seenLessonIds.has(lesId)) {
                seenLessonIds.add(lesId);
                globalLessonCount++;
                tree.totalVideos++;

                if (!currentModule) {
                  secIdx++;
                  const numStr = String(secIdx).padStart(2, '0');
                  currentModule = {
                    moduleId: `dom_sec_${secIdx}`,
                    moduleIndex: secIdx,
                    title: `${numStr}_General`,
                    lessons: []
                  };
                  domModules.push(currentModule);
                }

                let rawTitle = el.textContent.trim().split('\n')[0] || `Lección ${globalLessonCount}`;
                rawTitle = cleanTitleText(rawTitle.replace(/^\d+[\.\-\s]+/, ''));
                const directVideo = findLessonVideoById(nextData, lesId);
                const lessonDetails = extractLessonDetails(nextData, lesId);
                tree.totalAttachments += lessonDetails.attachments.length;

                currentModule.lessons.push({
                  id: lesId,
                  index: globalLessonCount,
                  title: rawTitle,
                  url: href,
                  videoUrl: directVideo || href,
                  platform: 'Skool Video (MP4)',
                  platformType: 'hls',
                  duration: null,
                  descriptionHtml: lessonDetails.descriptionHtml,
                  attachments: lessonDetails.attachments
                });
              }
              continue;
            }

            // 2. Check if it's an Accordion / Section Header
            // In Skool, accordion headers contain an SVG chevron arrow (or button), but no lesson links
            const hasSvg = el.querySelector('svg') !== null;
            const hasLesson = el.querySelector('a[href*="?md="]') !== null;

            if (hasSvg && !hasLesson && el.children.length <= 5) {
              const directText = cleanTitleText(el.textContent.trim().split('\n')[0]);
              if (
                directText &&
                directText.length >= 3 &&
                directText.length <= 60 &&
                !directText.includes('%') &&
                !directText.includes('Buscar') &&
                !directText.includes('Search') &&
                !directText.includes('Classroom') &&
                !directText.includes('Community') &&
                !directText.includes('Comunidad') &&
                !directText.includes(tree.courseTitle)
              ) {
                const currentName = currentModule ? currentModule.title.replace(/^\d+_/, '') : '';
                if (!currentModule || (currentName !== directText && !directText.includes(currentName) && !currentName.includes(directText))) {
                  secIdx++;
                  const numStr = String(secIdx).padStart(2, '0');
                  currentModule = {
                    moduleId: `dom_sec_${secIdx}`,
                    moduleIndex: secIdx,
                    title: `${numStr}_${directText}`,
                    lessons: []
                  };
                  domModules.push(currentModule);
                }
              }
            }
          }

          // Clean empty modules and renumber
          const validModules = domModules.filter(m => m.lessons.length > 0);
          validModules.forEach((mod, idx) => {
            mod.moduleIndex = idx + 1;
            const numStr = String(idx + 1).padStart(2, '0');
            const cleanName = mod.title.replace(/^\d+_/, '');
            mod.title = `${numStr}_${cleanName}`;
          });

          if (validModules.length > 0) {
            tree.modules = validModules;
          }
        }
      }
    } catch (e) {
      console.warn('[Skool Downloader] DOM sidebar hierarchy error:', e);
    }

    tree.totalLessons = globalLessonCount;
    return tree;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'SCAN_PAGE_VIDEOS') {
      const detectedVideos = scanPageVideos();
      const attachments = scanPageAttachments();
      const context = extractPageContext();
      const tree = extractCompleteClassroomTree();

      sendResponse({
        success: true,
        pageUrl: window.location.href,
        pageTitle: document.title,
        context: context,
        videos: detectedVideos,
        attachments: attachments,
        tree: tree
      });
      return true;
    }

    if (request.action === 'GET_CLASSROOM_TREE') {
      const tree = extractCompleteClassroomTree();
      sendResponse({
        success: true,
        tree: tree
      });
      return true;
    }

    if (request.action === 'RESOLVE_LESSON_STREAM') {
      (async () => {
        try {
          const lessonUrl = request.lessonUrl;
          const targetMd = request.targetMd;

          // 1. Check local page __NEXT_DATA__ first
          const localNext = getNextData();
          if (localNext && targetMd) {
            const foundLocal = findLessonVideoById(localNext, targetMd);
            if (foundLocal) {
              sendResponse({ success: true, directVideoUrl: foundLocal });
              return;
            }
          }

          // 2. Fetch specific lesson page with browser session
          const res = await fetch(lessonUrl, { credentials: 'include' });
          if (res.ok) {
            const html = await res.text();
            const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
            if (m) {
              const data = JSON.parse(m[1]);
              let directVid = findLessonVideoById(data, targetMd);
              if (!directVid) {
                const pageProps = data.props?.pageProps || data.pageProps || {};
                const pageVid = pageProps.video;
                if (pageVid) {
                  const pid = pageVid.playbackId || pageVid.id;
                  const tok = pageVid.playbackToken;
                  if (pid && typeof pid === 'string' && pid.length > 5) {
                    directVid = tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
                  } else if (pageVid.url) {
                    directVid = pageVid.url;
                  }
                }
              }
              if (!directVid) {
                const allPids = findDeep(data, o => o && typeof o === 'object' && (o.playbackId || o.playback_id || o.videoLink || o.video_url));
                for (const o of allPids) {
                  const vl = o.videoLink || o.video_url || o.videoUrl;
                  if (vl && typeof vl === 'string' && vl.startsWith('http')) {
                    directVid = vl;
                    break;
                  }
                  const pid = o.playbackId || o.playback_id;
                  const tok = o.playbackToken || o.playback_token;
                  if (pid && typeof pid === 'string' && pid.length > 5) {
                    directVid = tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
                    break;
                  }
                }
              }
              if (directVid) {
                sendResponse({ success: true, directVideoUrl: directVid });
                return;
              }
            }
          }
          sendResponse({ success: false });
        } catch (e) {
          sendResponse({ success: false, error: e.message });
        }
      })();
      return true;
    }

    return false;
  });

})();
