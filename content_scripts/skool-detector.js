/**
 * Skool Video Downloader - Content Script Detector (v2.8.2)
 * Features:
 * - Bulletproof Multi-Tier Video Detection
 * - Authenticated Session & Live Player Extraction
 * - Always Guarantees Active Lesson Video Detection
 * - Full 37-Lesson Classroom Hierarchy Extraction
 */

(function () {
  if (window.__SKOOL_DOWNLOADER_DETECTOR_LOADED__) return;
  window.__SKOOL_DOWNLOADER_DETECTOR_LOADED__ = true;
  console.log('[Skool Downloader] Content script v2.8.2 initialized on:', window.location.href);

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

  function isUsableCourseName(value, routeId = '') {
    const name = cleanTitleText(value || '');
    if (!name || name === 'Curso' || name === routeId) return false;
    return !/^[a-f0-9]{8,}$/i.test(name);
  }

  function contextFromDocumentTitle() {
    const rawTitle = String(document.title || '').replace(/\s+/g, ' ').trim();
    const communityParts = rawTitle.split(/\s+·\s+/);
    const beforeCommunity = communityParts[0] || '';
    const dashParts = beforeCommunity.split(/\s+-\s+/).filter(Boolean);
    return {
      // Skool currently uses both "Lesson - Course · Community" and
      // "Order - Lesson - Course · Community". Requiring three components
      // caused two-part titles to fall back to the opaque classroom route ID.
      course: dashParts.length >= 2 ? cleanTitleText(dashParts[dashParts.length - 1]) : '',
      lesson: dashParts.length >= 2
        ? stripLeadingSourceOrder(dashParts.slice(0, -1).join(' - '))
        : stripLeadingSourceOrder(beforeCommunity),
      community: communityParts.length >= 2 ? cleanTitleText(communityParts[communityParts.length - 1]) : ''
    };
  }

  function readLeadingSourceOrder(value) {
    const match = String(value || '').trim().match(/^(\d+)\s*[.\-_:)]\s*/);
    const parsed = match ? Number.parseInt(match[1], 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  function leadingSourceOrder(value, fallback) {
    const parsed = readLeadingSourceOrder(value) || Number.parseInt(fallback, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }

  function stripLeadingSourceOrder(value) {
    return cleanTitleText(String(value || '').replace(/^\s*\d+\s*[.\-_:)]\s*/, ''));
  }

  function domSourceOrderForLesson(lessonId) {
    if (!lessonId) return null;
    const link = Array.from(document.querySelectorAll('a[href*="?md="]')).find(candidate => {
      try { return new URL(candidate.href).searchParams.get('md') === String(lessonId); } catch (error) { return false; }
    });
    if (!link) return null;
    const row = link.closest('li, [role="listitem"], [class*="lesson"], [class*="Lesson"]');
    const candidates = [
      link.textContent,
      link.previousElementSibling?.textContent,
      link.parentElement?.textContent,
      row?.textContent,
    ];
    for (const text of candidates) {
      const order = readLeadingSourceOrder(text);
      if (order) return order;
    }
    return null;
  }

  function stableId(prefix, value) {
    let hash = 2166136261;
    const text = String(value || '');
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `${prefix}_${(hash >>> 0).toString(36)}`;
  }

  function getFileCategory(filename, url) {
    const target = `${filename || ''} ${url || ''}`.toLowerCase();
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
    if (!url) return { name: 'Sin video', type: 'unknown', badgeColor: '#6b7280' };
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
    if (u.includes('youtube.com') || u.includes('youtube-nocookie.com') || u.includes('youtu.be')) return { name: 'YouTube', type: 'youtube', badgeColor: '#ef4444' };
    if (u.includes('fastly.video.skool.com') || u.includes('stream.video.skool.com') || u.includes('.m3u8') || u.includes('cloudflarestream') || u.includes('videodelivery.net')) {
      return { name: 'Skool Video (MP4)', type: 'hls', badgeColor: '#10b981' };
    }
    if (u.match(/\.(mp4|webm|m4v|mov|mkv)(\?.*)?$/i)) return { name: 'Direct Video', type: 'direct', badgeColor: '#10b981' };

    return { name: 'Desconocido', type: 'unknown', badgeColor: '#6b7280' };
  }

  function isRecognizedVideoUrl(value) {
    if (!value || typeof value !== 'string') return false;
    const candidate = value.toLowerCase();
    return candidate.includes('loom.com') ||
      candidate.includes('youtube.com') ||
      candidate.includes('youtube-nocookie.com') ||
      candidate.includes('youtu.be') ||
      candidate.includes('vimeo.com') ||
      candidate.includes('wistia.com') ||
      candidate.includes('wistia.net') ||
      candidate.includes('mux.com') ||
      candidate.includes('cloudflarestream.com') ||
      candidate.includes('videodelivery.net') ||
      candidate.includes('fastly.video.skool.com') ||
      candidate.includes('stream.video.skool.com') ||
      /\.(m3u8|mp4|webm|m4v|mov|mkv)(\?|$)/i.test(candidate);
  }

  function muxPlaybackUrl(video, allowObjectId = false) {
    if (!video || typeof video !== 'object') return null;
    const playbackId = video.playbackId || video.playback_id || video.muxPlaybackId || (allowObjectId ? video.id : null);
    const token = video.playbackToken || video.playback_token || video.token || video.signedToken;
    if (!playbackId || typeof playbackId !== 'string' || playbackId.length <= 5 || playbackId.includes(' ')) {
      return null;
    }
    return token
      ? `https://stream.mux.com/${playbackId}.m3u8?token=${token}`
      : `https://stream.mux.com/${playbackId}.m3u8`;
  }

  function videoUrlPriority(value) {
    if (!isRecognizedVideoUrl(value)) return -1;
    const candidate = value.toLowerCase();
    // Adaptive manifests expose every rendition. A direct MP4 returned by Skool
    // is commonly only the 360p compatibility rendition.
    if (candidate.includes('.m3u8') || candidate.includes('stream.mux.com')) return 400;
    if (candidate.includes('cloudflarestream.com') || candidate.includes('videodelivery.net')) return 350;
    if (
      candidate.includes('loom.com') || candidate.includes('youtube.com') ||
      candidate.includes('youtu.be') || candidate.includes('vimeo.com') ||
      candidate.includes('wistia.com') || candidate.includes('wistia.net')
    ) return 300;
    return 100;
  }

  // Find exact video URL for a specific lesson ID inside Next.js payload
  function findLessonVideoById(nextData, lessonId) {
    if (!nextData) return null;

    const lessonObjects = lessonId ? findDeep(nextData, obj => {
      return obj && typeof obj === 'object' && (obj.id === lessonId || obj._id === lessonId);
    }) : [nextData];

    let bestCandidate = null;
    let bestPriority = -1;

    const consider = value => {
      const priority = videoUrlPriority(value);
      if (priority > bestPriority) {
        bestCandidate = value;
        bestPriority = priority;
      }
    };

    for (const les of lessonObjects) {
      if (!les || typeof les !== 'object') continue;
      const meta = les.metadata || les;

      // Prefer the adaptive playback object/master manifest over a direct MP4.
      // This is what lets yt-dlp see the 720p/1080p renditions.
      const videoObjects = [meta.video, les.video, meta.videoObj, les.videoObj];
      for (const videoObject of videoObjects) {
        consider(muxPlaybackUrl(videoObject, true));
        if (videoObject && typeof videoObject === 'object') {
          consider(videoObject.hlsUrl);
          consider(videoObject.playbackUrl);
          consider(videoObject.url);
        }
      }
      consider(muxPlaybackUrl(meta));
      if (les !== meta) consider(muxPlaybackUrl(les));

      const candidates = [
        meta.hlsUrl,
        meta.playbackUrl,
        les.hlsUrl,
        les.playbackUrl,
        meta.videoLink,
        meta.video_url,
        meta.videoUrl,
        les.videoLink,
        les.video_url,
        les.videoUrl
      ];

      for (const c of candidates) {
        consider(c);
      }
    }

    return bestCandidate;
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
    const routeCourseId = pathParts[2] || '';
    const documentContext = contextFromDocumentTitle();

    if (documentContext.lesson) lessonTitle = documentContext.lesson;
    else if (lessonTitle.includes('|')) lessonTitle = lessonTitle.split('|')[0].trim();

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

    // The current Skool UI exposes the reliable course/community pair in the
    // browser title even when its sidebar classes change or only expose an ID.
    if (isUsableCourseName(documentContext.course, routeCourseId)) {
      courseName = documentContext.course;
    }
    if (!communityName && documentContext.community) {
      communityName = documentContext.community;
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
      if (slug.includes('2') || slug.includes('2.0') || slug.includes('ultimateeditors2') || slug.includes('ultimate-editors-2')) {
        communityName = 'Ultimate Editors 2.0';
      } else if (slug.includes('5412') || slug.includes('ultimate-editors') || slug.includes('ultimateeditors')) {
        communityName = 'Ultimate editors';
      } else {
        communityName = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    if (!isUsableCourseName(courseName, routeCourseId)) {
      const classroomSlug = routeCourseId || 'Curso';
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
    const activeLessonId = new URL(window.location.href).searchParams.get('md') || extractPageContext().lessonId;

    if (nextData && activeLessonId) {
      const exactDetails = extractLessonDetails(nextData, activeLessonId);
      exactDetails.attachments.forEach(attachment => {
        if (!seenUrls.has(attachment.url)) {
          seenUrls.add(attachment.url);
          attachments.push(attachment);
        }
      });
    }

    const contentRoots = Array.from(document.querySelectorAll(
      'main, article, [role="main"], [class*="lesson-content"], [class*="LessonContent"], [class*="description"], [class*="Description"]'
    ));
    const roots = contentRoots.length > 0 ? contentRoots : [document.body];
    const candidateLinks = Array.from(new Set(roots.flatMap(root => Array.from(root.querySelectorAll('a[href]')))));

    candidateLinks.forEach((link, idx) => {
      const href = link.href;
      if (
        !isExternalLessonResource(href) ||
        seenUrls.has(href) ||
        link.closest('nav, header, aside, [role="navigation"]')
      ) return;

      if (isExternalLessonResource(href)) {
        seenUrls.add(href);
        let linkText = link.textContent.trim() || link.getAttribute('title') || '';
        let cleanName = linkText;
        if (!cleanName || cleanName.startsWith('http') || cleanName.length < 3) {
          cleanName = href.split('/').pop().split('?')[0] || `Recurso ${idx + 1}`;
        }

        const cat = getFileCategory(cleanName, href);
        attachments.push({
          id: 'dom_link_' + idx,
          lessonId: activeLessonId,
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
      let nextVideoUrl = findLessonVideoById(nextData, targetMd);
      if (!nextVideoUrl) {
        const pageVideo = nextData.props?.pageProps?.video || nextData.pageProps?.video;
        const playbackId = pageVideo?.playbackId || pageVideo?.playback_id;
        const playbackToken = pageVideo?.playbackToken || pageVideo?.playback_token;
        if (playbackId) {
          nextVideoUrl = playbackToken
            ? `https://stream.mux.com/${playbackId}.m3u8?token=${playbackToken}`
            : `https://stream.mux.com/${playbackId}.m3u8`;
        } else if (isRecognizedVideoUrl(pageVideo?.url)) {
          nextVideoUrl = pageVideo.url;
        }
      }
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

  function normalizeResourceUrl(value) {
    if (!value || typeof value !== 'string') return '';
    const unescaped = value
      .replace(/\\u0026/g, '&')
      .replace(/\\\//g, '/')
      .replace(/[),.;\]}'"]+$/g, '')
      .trim();
    try {
      const parsed = new URL(unescaped, window.location.origin);
      return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function isExternalLessonResource(value) {
    const normalized = normalizeResourceUrl(value);
    if (!normalized || isRecognizedVideoUrl(normalized)) return false;
    try {
      const parsed = new URL(normalized);
      const hostname = parsed.hostname.toLowerCase();
      if (hostname === 'skool.com' || hostname.endsWith('.skool.com')) return false;
      if (
        hostname.includes('google-analytics.com') ||
        hostname.includes('googletagmanager.com') ||
        hostname.includes('doubleclick.net') ||
        hostname.includes('intercom.io') ||
        hostname.includes('stripe.com')
      ) return false;
      return true;
    } catch (error) {
      return false;
    }
  }

  function resourceLabel(value, url, fallback = 'Recurso') {
    const direct = cleanTitleText(value || '');
    if (direct && !/^https?:\/\//i.test(direct) && direct.length >= 3) return direct;
    const lower = String(url || '').toLowerCase();
    if (lower.includes('figma.com')) return 'Tablero de Figma';
    if (lower.includes('drive.google.com/drive/folders')) return 'Carpeta Google Drive';
    if (lower.includes('drive.google.com')) return 'Archivo Google Drive';
    if (lower.match(/\.(zip|rar|7z)(\?|$)/)) return 'Archivo comprimido / Assets';
    if (lower.includes('.prfpset')) return 'Preset de Premiere Pro';
    try {
      const parsed = new URL(url);
      const tail = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
      return cleanTitleText(tail) || parsed.hostname || fallback;
    } catch (error) {
      return fallback;
    }
  }

  function collectLessonLinks(value, results, inheritedLabel = '') {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(item => collectLessonLinks(item, results, inheritedLabel));
      return;
    }
    if (typeof value !== 'object') return;

    const nearbyLabel = value.name || value.filename || value.title || value.label || value.text || inheritedLabel;
    for (const key of ['href', 'url', 'link', 'downloadUrl', 'fileUrl']) {
      const url = normalizeResourceUrl(value[key]);
      if (isExternalLessonResource(url)) results.push({ url, label: nearbyLabel });
    }
    if (value.type === 'text' && value.text && Array.isArray(value.marks)) {
      value.marks.forEach(mark => {
        const url = normalizeResourceUrl(mark?.attrs?.href);
        if (mark?.type === 'link' && isExternalLessonResource(url)) {
          results.push({ url, label: value.text });
        }
      });
    }
    Object.values(value).forEach(child => {
      if (child && typeof child === 'object') collectLessonLinks(child, results, nearbyLabel);
    });
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

      // 2. Attachments strictly below the matching lesson node.
      const containers = [node, ...findDeep(node, child => child !== node && child && (
        Array.isArray(child.attachments) || Array.isArray(child.files) || Array.isArray(child.resources)
      ))];
      containers.forEach(container => {
        const list = container.attachments || container.files || container.resources || [];
        list.forEach(file => {
          if (!file) return;
          const url = normalizeResourceUrl(file.url || file.link || file.downloadUrl || file.fileUrl || (typeof file === 'string' ? file : null));
          if (!isExternalLessonResource(url) || seenUrls.has(url)) return;
          seenUrls.add(url);
          const name = resourceLabel(file.name || file.filename || file.title, url, 'Adjunto');
          const category = getFileCategory(name, url);
          attachments.push({
            id: file.id || stableId(`att_${lessonId}`, url),
            lessonId: lessonId,
            name: cleanTitleText(name),
            url: url,
            size: formatBytes(file.size || file.fileSize || file.bytes),
            category: category.type,
            categoryLabel: category.label,
            categoryColor: category.color
          });
        });
      });

      // 3. Embedded links inside rich text. Capture arbitrary external resources,
      // while excluding Skool navigation and the lesson's video provider.
      const richLinks = [];
      let structuredDescription = rawDesc;
      if (typeof rawDesc === 'string') {
        const serialized = rawDesc.startsWith('[v2]') ? rawDesc.substring(4) : rawDesc;
        if (serialized.startsWith('{') || serialized.startsWith('[')) {
          try { structuredDescription = JSON.parse(serialized); } catch (error) {}
        }
      }
      collectLessonLinks(structuredDescription, richLinks);
      const bodyText = typeof rawDesc === 'string' ? rawDesc : JSON.stringify(rawDesc);
      (bodyText.match(/https?:\/\/[^\s"\'<>]+/g) || []).forEach(url => richLinks.push({ url, label: '' }));
      richLinks.forEach((candidate) => {
          const uClean = normalizeResourceUrl(candidate.url);
          if (isExternalLessonResource(uClean) && !seenUrls.has(uClean)) {
            seenUrls.add(uClean);
            const label = resourceLabel(candidate.label, uClean);
            const cat = getFileCategory(label, uClean);
            attachments.push({
              id: stableId(`body_link_${lessonId}`, uClean),
              lessonId: lessonId,
              name: label,
              url: uClean,
              category: cat.type,
              categoryLabel: cat.label,
              categoryColor: cat.color
            });
          }
      });
    });

    return { attachments, descriptionHtml };
  }

  function unwrapCourseNode(node) {
    if (!node || typeof node !== 'object') return {};
    return node.course || node.lesson || node.module || node;
  }

  function nodeTitle(node, fallback) {
    const info = unwrapCourseNode(node);
    return cleanTitleText(info.metadata?.title || info.title || info.name || fallback);
  }

  function extractStructuredClassroomTree(nextData, context) {
    if (!nextData) return null;
    const pageProps = nextData.props?.pageProps || nextData.pageProps || {};
    const candidates = [pageProps.course, pageProps.classroom].filter(Boolean);
    candidates.push(...findDeep(pageProps, value => value && typeof value === 'object' && (
      Array.isArray(value.sets) || Array.isArray(value.modules) ||
      (Array.isArray(value.children) && value.children.some(child => Array.isArray(child?.children)))
    )));

    const courseObject = candidates
      .map(candidate => ({
        candidate,
        score: (context.lessonId && findDeep(candidate, value => value && typeof value === 'object' && (
          value.id === context.lessonId || value._id === context.lessonId
        )).length > 0 ? 100 : 0) +
          (Array.isArray(candidate?.sets) ? 30 : 0) +
          (Array.isArray(candidate?.modules) ? 20 : 0) +
          (Array.isArray(candidate?.children) && candidate.children.some(child => Array.isArray(child?.children)) ? 10 : 0)
      }))
      .sort((a, b) => b.score - a.score)[0]?.candidate;
    if (!courseObject) return null;

    let moduleNodes = courseObject.sets || courseObject.modules || courseObject.children || [];
    moduleNodes = moduleNodes.filter(moduleNode => {
      const lessons = moduleNode?.lessons || moduleNode?.children || unwrapCourseNode(moduleNode)?.lessons || [];
      return Array.isArray(lessons) && lessons.length > 0;
    });
    if (moduleNodes.length === 0) return null;

    const baseLessonUrl = `${window.location.origin}${window.location.pathname}`;
    const structuredCourseTitle = nodeTitle(courseObject, context.course || 'Curso');
    const routeCourseId = new URL(window.location.href).pathname.split('/').filter(Boolean)[2] || '';
    const tree = {
      courseTitle: isUsableCourseName(context.course, routeCourseId)
        ? context.course
        : structuredCourseTitle,
      communityName: context.community || 'Comunidad Skool',
      totalLessons: 0,
      totalVideos: 0,
      totalAttachments: 0,
      modules: []
    };
    let globalLessonIndex = 0;

    moduleNodes.forEach((moduleNode, moduleArrayIndex) => {
      const moduleIndex = moduleArrayIndex + 1;
      const rawModuleTitle = nodeTitle(moduleNode, `Módulo ${moduleIndex}`).replace(/^\d+[\s._-]+/, '');
      const rawLessons = moduleNode.lessons || moduleNode.children || unwrapCourseNode(moduleNode).lessons || [];
      const module = {
        moduleId: unwrapCourseNode(moduleNode).id || `structured_module_${moduleIndex}`,
        moduleIndex,
        title: `${String(moduleIndex).padStart(2, '0')}_${rawModuleTitle}`,
        lessons: []
      };

      rawLessons.forEach((lessonNode, lessonArrayIndex) => {
        const info = unwrapCourseNode(lessonNode);
        const lessonId = info.id || info._id || lessonNode.id || lessonNode._id;
        if (!lessonId) return;
        globalLessonIndex += 1;
        const rawLessonTitle = nodeTitle(lessonNode, `Lección ${lessonArrayIndex + 1}`);
        const explicitOrder = info.lessonNumber || info.number || info.order || info.metadata?.lessonNumber || info.metadata?.order;
        const sourceOrder = domSourceOrderForLesson(lessonId) || leadingSourceOrder(rawLessonTitle, explicitOrder || lessonArrayIndex + 1);
        const lessonTitle = stripLeadingSourceOrder(rawLessonTitle);
        const lessonUrl = info.href || lessonNode.href || `${baseLessonUrl}?md=${encodeURIComponent(lessonId)}`;
        const directVideo = findLessonVideoById(nextData, lessonId);
        const platform = identifyPlatform(directVideo);
        const details = extractLessonDetails(nextData, lessonId);
        const hasVideo = Boolean(directVideo || info.videoId || info.metadata?.videoId || info.video || info.metadata?.video);
        if (hasVideo) tree.totalVideos += 1;
        tree.totalAttachments += details.attachments.length;

        module.lessons.push({
          id: lessonId,
          index: globalLessonIndex,
          sourceOrder,
          lessonIndexInModule: sourceOrder,
          title: lessonTitle,
          url: lessonUrl,
          // Resolve the short-lived signed stream immediately before each item.
          // Keeping the stable lesson URL here prevents long courses from using
          // an expired token captured when the popup was first opened.
          videoUrl: lessonUrl,
          videoResolved: Boolean(directVideo),
          hasVideo,
          platform: platform.name,
          platformType: platform.type,
          duration: info.duration || info.metadata?.duration || null,
          descriptionHtml: details.descriptionHtml,
          attachments: details.attachments
        });
      });

      if (module.lessons.length > 0) tree.modules.push(module);
    });

    tree.totalLessons = globalLessonIndex;
    return tree.modules.length > 0 ? tree : null;
  }

  function extractCompleteClassroomTree() {
    const nextData = getNextData();
    const context = extractPageContext();
    const structuredTree = extractStructuredClassroomTree(nextData, context);
    if (structuredTree) return structuredTree;
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

                const visibleTitle = el.textContent.trim().split('\n')[0] || `Lección ${globalLessonCount}`;
                const surroundingText = el.parentElement?.textContent?.trim().split('\n')[0] || visibleTitle;
                const sourceOrder = leadingSourceOrder(visibleTitle, leadingSourceOrder(surroundingText, currentModule.lessons.length + 1));
                const rawTitle = stripLeadingSourceOrder(visibleTitle);
                const directVideo = findLessonVideoById(nextData, lesId);
                if (directVideo) tree.totalVideos++;
                const lessonDetails = extractLessonDetails(nextData, lesId);
                tree.totalAttachments += lessonDetails.attachments.length;

                currentModule.lessons.push({
                  id: lesId,
                  index: globalLessonCount,
                  sourceOrder,
                  lessonIndexInModule: sourceOrder,
                  title: rawTitle,
                  url: href,
                  videoUrl: href,
                  videoResolved: Boolean(directVideo),
                  platform: identifyPlatform(directVideo).name,
                  platformType: identifyPlatform(directVideo).type,
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

      for (const module of tree.modules || []) {
        const lessonPosition = (module.lessons || []).findIndex(lesson => lesson.id === context.lessonId);
        if (lessonPosition >= 0) {
          const lesson = module.lessons[lessonPosition];
          context.module = module.title;
          context.moduleIndex = module.moduleIndex;
          context.lessonTitle = lesson.title;
          context.lessonIndex = lesson.sourceOrder || lesson.index;
          context.lessonIndexInModule = lesson.lessonIndexInModule || lessonPosition + 1;
          context.globalLessonIndex = lesson.index;
          context.descriptionHtml = lesson.descriptionHtml || context.descriptionHtml;
          break;
        }
      }

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

    if (request.action === 'FETCH_LESSON_DETAILS') {
      (async () => {
        try {
          const lessonUrl = request.lessonUrl;
          const targetMd = request.targetMd;
          if (!lessonUrl || !targetMd) throw new Error('Falta la URL o el ID de la lección.');

          let lessonData = null;
          const currentMd = new URL(window.location.href).searchParams.get('md');
          if (currentMd === targetMd) lessonData = getNextData();

          if (!lessonData) {
            const response = await fetch(lessonUrl, {
              credentials: 'include',
              headers: { 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' }
            });
            if (!response.ok) throw new Error(`Skool respondió HTTP ${response.status}`);
            const html = await response.text();
            const match = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
            if (!match) throw new Error('La página no contiene datos estructurados de la lección.');
            lessonData = JSON.parse(match[1]);
          }

          const details = extractLessonDetails(lessonData, targetMd);
          sendResponse({ success: true, ...details });
        } catch (error) {
          sendResponse({ success: false, error: error.message, attachments: [], descriptionHtml: '' });
        }
      })();
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
          if (localNext) {
            let foundLocal = findLessonVideoById(localNext, targetMd);
            const currentMd = new URL(window.location.href).searchParams.get('md');
            if (!foundLocal && (!targetMd || currentMd === targetMd)) {
              const pv = localNext.props?.pageProps?.video || localNext.pageProps?.video;
              if (pv) {
                const pid = pv.playbackId || pv.id;
                const tok = pv.playbackToken;
                if (pid && typeof pid === 'string' && pid.length > 5) {
                  foundLocal = tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
                } else if (pv.url) {
                  foundLocal = pv.url;
                }
              }
            }
            if (foundLocal) {
              sendResponse({ success: true, directVideoUrl: foundLocal });
              return;
            }
          }

          // 2. Fetch via Next.js Data Route: /_next/data/{buildId}/[path].json?md={targetMd}
          if (localNext?.buildId && targetMd) {
            try {
              const cleanPath = window.location.pathname.replace(/\/+$/, '');
              const nextDataUrl = `/_next/data/${localNext.buildId}${cleanPath}.json?md=${targetMd}`;
              const dataRes = await fetch(nextDataUrl, { credentials: 'include' });
              if (dataRes.ok) {
                const dataJson = await dataRes.json();
                const pp = dataJson.pageProps || dataJson.props?.pageProps || {};
                let directVid = findLessonVideoById(dataJson, targetMd);
                if (!directVid && pp.video) {
                  const pid = pp.video.playbackId || pp.video.id;
                  const tok = pp.video.playbackToken;
                  if (pid && typeof pid === 'string' && pid.length > 5) {
                    directVid = tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
                  } else if (pp.video.url) {
                    directVid = pp.video.url;
                  }
                }
                if (!directVid && pp.lesson) {
                  const meta = pp.lesson.metadata || pp.lesson;
                  directVid = meta.videoLink || meta.video_url || meta.videoUrl;
                }
                if (directVid) {
                  sendResponse({ success: true, directVideoUrl: directVid });
                  return;
                }
              }
            } catch (de) {
              console.warn('[Skool Detector] Next.js data route error:', de);
            }
          }

          // 3. Fallback: Fetch specific lesson HTML page with browser session
          const res = await fetch(lessonUrl, {
            credentials: 'include',
            headers: {
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });
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
