/**
 * Skool Video Downloader - Service Worker (Manifest V3 - v2.1.0)
 * Handles network stream interception (Fastly/Cloudflare HLS), direct MP4 downloads,
 * video source resolution (Loom, Wistia, Vimeo, HLS), organized folder routing, and notifications.
 */

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Skool Downloader] Service Worker v2.1.0 installed');
  
  // Set default settings if not configured
  chrome.storage.local.get(['rootFolder', 'folderPattern', 'groupLessonPack'], (res) => {
    if (!res.rootFolder) {
      chrome.storage.local.set({
        rootFolder: 'Skool_Downloads',
        folderPattern: '{community}/{course}/{index}_{title}',
        groupLessonPack: true
      });
    }
  });

  // Setup context menus
  chrome.contextMenus.create({
    id: 'skool-download-quick',
    title: '🎬 Extraer video y recursos de Skool',
    contexts: ['page', 'link', 'video']
  });

  chrome.contextMenus.create({
    id: 'skool-copy-ytdlp',
    title: '📋 Copiar comando yt-dlp de esta lección',
    contexts: ['page', 'video']
  });
});

// Clean up tab stream cache when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const key = `tab_streams_${tabId}`;
    await chrome.storage.session.remove(key);
  } catch (err) {
    // Ignore storage errors on tab close
  }
});

// Helper to sanitize path segments
function sanitizePathSegment(name) {
  return (name || 'skool')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 80);
}

// Sniff network requests for tokenized .m3u8 streams (Fastly & Cloudflare CDN)
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    const { url, tabId } = details;
    if (tabId < 0 || !url) return;

    const isSkoolHls = (
      url.includes('.fastly.video.skool.com') ||
      url.includes('stream.video.skool.com') ||
      url.includes('fastly.video.skool.com') ||
      (url.includes('.m3u8') && (url.includes('skool.com') || url.includes('token=') || url.includes('signature=')))
    );

    if (isSkoolHls) {
      console.log(`[Skool Downloader] Intercepted HLS Stream on tab ${tabId}:`, url);
      saveInterceptedStream(tabId, url);
    }
  },
  {
    urls: [
      "*://*.fastly.video.skool.com/*",
      "*://stream.video.skool.com/*",
      "*://*.skool.com/*"
    ]
  }
);

// Save intercepted stream into storage
async function saveInterceptedStream(tabId, streamUrl) {
  try {
    const key = `tab_streams_${tabId}`;
    const data = await chrome.storage.session.get(key);
    const streams = data[key] || [];

    if (!streams.some(s => s.url === streamUrl)) {
      const isFastly = streamUrl.includes('fastly.video.skool.com');
      const isCloudflare = streamUrl.includes('stream.video.skool.com');
      
      const newStream = {
        id: 'hls_' + Date.now(),
        type: 'hls',
        platform: isFastly ? 'Skool Fastly HLS' : (isCloudflare ? 'Skool Cloudflare HLS' : 'Skool HLS Stream'),
        url: streamUrl,
        badgeColor: '#10b981',
        title: 'Skool Video Stream',
        detectedAt: new Date().toISOString()
      };

      streams.push(newStream);
      await chrome.storage.session.set({ [key]: streams });

      // Update badge
      await chrome.action.setBadgeText({ tabId, text: String(streams.length) });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#10b981' });
    }
  } catch (err) {
    console.error('[Skool Downloader] Error storing stream:', err);
  }
}

// Resolver: Resolve Loom direct MP4
async function resolveLoomDirectMp4(loomUrl) {
  const loomIdMatch = loomUrl.match(/(?:share|embed)\/([a-f0-9]{32})/i);
  if (!loomIdMatch) return null;
  const loomId = loomIdMatch[1];

  // Try 1: Transcoded URL POST API
  try {
    const res = await fetch(`https://www.loom.com/api/campaigns/sessions/${loomId}/transcoded-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      body: '{}'
    });
    if (res.ok) {
      const data = await res.json();
      if (data.url && data.url.includes('.mp4')) {
        return { directUrl: data.url, type: 'mp4' };
      }
    }
  } catch (e) {
    console.warn('[Skool Downloader] Loom POST API failed:', e);
  }

  // Try 2: Fetch Loom share page HTML and scrape video metadata
  try {
    const pageRes = await fetch(`https://www.loom.com/share/${loomId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      
      // Look for og:video, twitter:player:stream, or cdn.loom.com mp4
      const ogMatch = html.match(/<meta[^>]+property=['"]og:video(?::secure_url)?['"][^>]+content=['"](https:\/\/cdn\.loom\.com\/sessions\/[^'"]+\.mp4[^'"]*)['"]/i);
      if (ogMatch && ogMatch[1]) {
        return { directUrl: ogMatch[1], type: 'mp4' };
      }

      const twitterMatch = html.match(/<meta[^>]+name=['"]twitter:player:stream['"][^>]+content=['"](https:\/\/cdn\.loom\.com\/sessions\/[^'"]+\.mp4[^'"]*)['"]/i);
      if (twitterMatch && twitterMatch[1]) {
        return { directUrl: twitterMatch[1], type: 'mp4' };
      }

      // Check for JSON download_url or raw_stream_url
      const jsonUrlMatch = html.match(/"(?:download_url|cdn_url|raw_stream_url|url)":\s*"(https:\/\/cdn\.loom\.com\/sessions\/[^"]+\.mp4[^"]*)"/i);
      if (jsonUrlMatch && jsonUrlMatch[1]) {
        return { directUrl: jsonUrlMatch[1].replace(/\\u002F/g, '/'), type: 'mp4' };
      }

      // Check for HLS stream in Loom page
      const hlsMatch = html.match(/"(https:\/\/cdn\.loom\.com\/sessions\/[^"]+\.m3u8[^"]*)"/i);
      if (hlsMatch && hlsMatch[1]) {
        return { directUrl: hlsMatch[1].replace(/\\u002F/g, '/'), type: 'hls' };
      }
    }
  } catch (e) {
    console.warn('[Skool Downloader] Loom HTML scraping failed:', e);
  }

  return null;
}

// Resolver: Resolve Wistia direct MP4
async function resolveWistiaDirectMp4(wistiaUrl) {
  const match = wistiaUrl.match(/(?:iframe\/|medias\/|wvideo=)([a-z0-9]+)/i);
  if (!match) return null;
  const wistiaId = match[1];

  try {
    const res = await fetch(`https://fast.wistia.net/embed/medias/${wistiaId}.json`, {
      headers: {
        'Referer': 'https://www.skool.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const assets = data.media?.assets || [];
      const mp4Assets = assets.filter(a => a.type === 'mp4_video' || a.type === 'original' || (a.url && (a.url.endsWith('.bin') || a.url.endsWith('.mp4'))));
      mp4Assets.sort((a, b) => (b.width || 0) - (a.width || 0) || (b.size || 0) - (a.size || 0));

      if (mp4Assets.length > 0 && mp4Assets[0].url) {
        const cleanMp4Url = mp4Assets[0].url.replace(/\.bin$/, '.mp4');
        return { directUrl: cleanMp4Url, type: 'mp4' };
      }
    }
  } catch (e) {
    console.warn('[Skool Downloader] Wistia JSON resolver failed:', e);
  }

  return null;
}

// Resolver: Resolve Vimeo direct MP4
async function resolveVimeoDirectMp4(vimeoUrl) {
  const match = vimeoUrl.match(/(?:video\/|vimeo\.com\/)(\d+)/i);
  if (!match) return null;
  const vimeoId = match[1];

  try {
    const res = await fetch(`https://player.vimeo.com/video/${vimeoId}/config`, {
      headers: {
        'Referer': 'https://www.skool.com/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });

    if (res.ok) {
      const data = await res.json();
      const progressive = data.request?.files?.progressive || [];
      if (progressive.length > 0) {
        progressive.sort((a, b) => (b.width || 0) - (a.width || 0));
        return { directUrl: progressive[0].url, type: 'mp4' };
      }

      // Check HLS CDNs
      const hlsCdns = data.request?.files?.hls?.cdns || {};
      const firstCdn = Object.values(hlsCdns)[0];
      if (firstCdn && firstCdn.url) {
        return { directUrl: firstCdn.url, type: 'hls' };
      }
    }
  } catch (e) {
    console.warn('[Skool Downloader] Vimeo config resolver failed:', e);
  }

  return null;
}

// Durable popup-independent native download queue. A long-lived native port keeps
// the MV3 worker alive while a course is being processed, so closing the popup no
// longer terminates an active batch. Only progress metadata is persisted; signed
// media URLs remain in memory and are resolved immediately before each download.
const NATIVE_HOST_NAME = 'com.cinematic.skool_downloader';
const DOWNLOAD_JOB_STORAGE_KEY = 'nativeDownloadJob';
const LAST_CLOUD_SYNC_STORAGE_KEY = 'lastCatalogCloudSyncAt';
let nativeDownloadPort = null;
let nativeDownloadJob = null;

function isActiveJobStatus(status) {
  return ['queued', 'resolving', 'downloading', 'uploading', 'syncing'].includes(status);
}

function publicDownloadJob() {
  if (!nativeDownloadJob) {
    return { status: 'idle', total: 0, completed: 0, failed: 0, tasks: {} };
  }
  const { items, currentItem, settings, ...safeJob } = nativeDownloadJob;
  return safeJob;
}

async function persistDownloadJob() {
  try {
    await chrome.storage.local.set({ [DOWNLOAD_JOB_STORAGE_KEY]: publicDownloadJob() });
  } catch (err) {
    console.warn('[Skool Downloader] Could not persist queue status:', err);
  }
}

async function restoreInterruptedJobStatus() {
  try {
    const stored = await chrome.storage.local.get(DOWNLOAD_JOB_STORAGE_KEY);
    const previous = stored[DOWNLOAD_JOB_STORAGE_KEY];
    if (previous && isActiveJobStatus(previous.status)) {
      previous.status = 'interrupted';
      previous.error = 'Chrome se reinició mientras la cola estaba activa. Vuelve a iniciar solo los elementos pendientes.';
      previous.updatedAt = Date.now();
      await chrome.storage.local.set({ [DOWNLOAD_JOB_STORAGE_KEY]: previous });
    }
  } catch (err) {
    console.warn('[Skool Downloader] Could not restore queue status:', err);
  }
}

restoreInterruptedJobStatus();

function markTask(taskId, updates) {
  if (!nativeDownloadJob || !taskId) return;
  const previous = nativeDownloadJob.tasks[taskId] || {};
  nativeDownloadJob.tasks[taskId] = { ...previous, ...updates, updatedAt: Date.now() };
  nativeDownloadJob.updatedAt = Date.now();
}

async function resolveQueuedVideo(item) {
  const originalUrl = item.url || item.lessonUrl || '';
  const isLessonPage = originalUrl.includes('skool.com') &&
    !originalUrl.includes('stream.mux.com') &&
    !originalUrl.includes('.m3u8') &&
    !originalUrl.match(/\.(mp4|webm|mov|mkv)(\?|$)/i);

  if (!isLessonPage) return originalUrl;
  if (!nativeDownloadJob.sourceTabId) {
    throw new Error('No hay una pestaña de Skool disponible para resolver este video.');
  }

  const response = await chrome.tabs.sendMessage(nativeDownloadJob.sourceTabId, {
    action: 'RESOLVE_LESSON_STREAM',
    lessonUrl: originalUrl,
    targetMd: item.context?.lessonId || null
  });
  if (!response?.success || !response.directVideoUrl) {
    throw new Error('La lección no contiene un video resoluble o la sesión de Skool ya no está disponible.');
  }
  return response.directVideoUrl;
}

function ensureNativeDownloadPort() {
  if (nativeDownloadPort) return nativeDownloadPort;

  nativeDownloadPort = chrome.runtime.connectNative(NATIVE_HOST_NAME);
  nativeDownloadPort.onMessage.addListener(async (message) => {
    if (!nativeDownloadJob) return;

    const taskId = message.taskId || nativeDownloadJob.currentItem?.id;
    if (message.type === 'TASK_START') {
      nativeDownloadJob.status = 'downloading';
      markTask(taskId, { status: 'downloading', progress: 0 });
    } else if (message.type === 'DOWNLOAD_PROGRESS') {
      nativeDownloadJob.status = 'downloading';
      markTask(taskId, { status: 'downloading', progress: Math.round(message.progress || 0) });
    } else if (message.type === 'UPLOAD_PROGRESS') {
      nativeDownloadJob.status = 'uploading';
      markTask(taskId, { status: 'uploading', progress: Math.round(message.progress || 0) });
    } else if (message.type === 'TASK_COMPLETED') {
      markTask(taskId, { status: 'completed', progress: 100, gdriveId: message.gdriveId || null });
      nativeDownloadJob.completed += 1;
      nativeDownloadJob.currentItem = null;
      await persistDownloadJob();
      dispatchNextNativeItem();
      return;
    } else if (message.type === 'TASK_ERROR') {
      markTask(taskId, { status: 'failed', error: message.error || 'Error desconocido' });
      nativeDownloadJob.failed += 1;
      nativeDownloadJob.currentItem = null;
      await persistDownloadJob();
      dispatchNextNativeItem();
      return;
    } else if (message.type === 'CLOUD_SYNC_COMPLETED') {
      nativeDownloadJob.status = nativeDownloadJob.failed > 0 ? 'completed_with_errors' : 'completed';
      nativeDownloadJob.cloudSync = message.noChanges ? 'sin_cambios' : 'completed';
      nativeDownloadJob.finishedAt = Date.now();
      await chrome.storage.local.set({ [LAST_CLOUD_SYNC_STORAGE_KEY]: Date.now() });
    } else if (message.type === 'CLOUD_SYNC_ERROR') {
      nativeDownloadJob.status = 'completed_with_sync_error';
      nativeDownloadJob.cloudSync = 'failed';
      nativeDownloadJob.syncError = message.error || 'No se pudo sincronizar el catálogo web.';
      nativeDownloadJob.finishedAt = Date.now();
    }

    await persistDownloadJob();
  });

  nativeDownloadPort.onDisconnect.addListener(async () => {
    nativeDownloadPort = null;
    if (nativeDownloadJob && isActiveJobStatus(nativeDownloadJob.status)) {
      const taskId = nativeDownloadJob.currentItem?.id;
      if (taskId) {
        markTask(taskId, { status: 'interrupted', error: 'Se perdió la conexión con el motor nativo.' });
      }
      nativeDownloadJob.status = 'interrupted';
      nativeDownloadJob.error = chrome.runtime.lastError?.message || 'Se perdió la conexión con el motor nativo.';
      nativeDownloadJob.currentItem = null;
      await persistDownloadJob();
    }
  });

  return nativeDownloadPort;
}

async function finishNativeDownloadJob() {
  if (!nativeDownloadJob) return;
  nativeDownloadJob.status = nativeDownloadJob.failed > 0 ? 'completed_with_errors' : 'completed';
  nativeDownloadJob.cloudSync = nativeDownloadJob.settings.storageMode !== 'local' && nativeDownloadJob.completed > 0
    ? 'deferred'
    : 'not_needed';
  nativeDownloadJob.finishedAt = Date.now();
  await persistDownloadJob();
}

async function forceNativeCloudSync() {
  if (nativeDownloadJob && isActiveJobStatus(nativeDownloadJob.status)) {
    return { success: false, error: 'Espera a que termine la descarga activa.' };
  }
  if (!nativeDownloadJob) {
    const stored = await chrome.storage.local.get(DOWNLOAD_JOB_STORAGE_KEY);
    const previous = stored[DOWNLOAD_JOB_STORAGE_KEY];
    if (!previous) return { success: false, error: 'No hay un catálogo pendiente para sincronizar.' };
    nativeDownloadJob = {
      ...previous,
      items: [],
      currentItem: null,
      settings: { storageMode: 'gdrive', folder: '', gdriveRoot: 'Skool Downloads', gdriveRootId: null }
    };
  }
  nativeDownloadJob.status = 'syncing';
  nativeDownloadJob.cloudSync = 'running';
  await persistDownloadJob();
  ensureNativeDownloadPort().postMessage({ action: 'SYNC_CLOUD' });
  return { success: true, job: publicDownloadJob() };
}

async function dispatchNextNativeItem() {
  if (!nativeDownloadJob || nativeDownloadJob.currentItem || !isActiveJobStatus(nativeDownloadJob.status)) return;
  if (nativeDownloadJob.nextIndex >= nativeDownloadJob.items.length) {
    await finishNativeDownloadJob();
    return;
  }

  const item = nativeDownloadJob.items[nativeDownloadJob.nextIndex++];
  nativeDownloadJob.currentItem = item;
  nativeDownloadJob.status = item.type === 'video' ? 'resolving' : 'queued';
  markTask(item.id, { status: nativeDownloadJob.status, progress: 0 });
  await persistDownloadJob();

  try {
    const resolvedUrl = item.type === 'video' ? await resolveQueuedVideo(item) : item.url;
    if (!resolvedUrl) throw new Error('El elemento no contiene una URL válida.');
    ensureNativeDownloadPort().postMessage({
      action: 'DOWNLOAD',
      ...item,
      url: resolvedUrl,
      folder: item.folder || nativeDownloadJob.settings.folder,
      storageMode: nativeDownloadJob.settings.storageMode,
      gdriveRoot: nativeDownloadJob.settings.gdriveRoot,
      gdriveRootId: nativeDownloadJob.settings.gdriveRootId
    });
  } catch (err) {
    markTask(item.id, { status: 'failed', error: err.message });
    nativeDownloadJob.failed += 1;
    nativeDownloadJob.currentItem = null;
    await persistDownloadJob();
    dispatchNextNativeItem();
  }
}

async function startNativeDownloadJob(message) {
  if (nativeDownloadJob && isActiveJobStatus(nativeDownloadJob.status)) {
    return { success: false, error: 'Ya existe una descarga en curso.', job: publicDownloadJob() };
  }

  const items = (message.items || []).filter(item => item && item.id && item.url);
  if (items.length === 0) return { success: false, error: 'La cola está vacía.' };

  const tasks = {};
  for (const item of items) {
    tasks[item.id] = {
      id: item.id,
      lessonId: item.context?.lessonId || item.id,
      title: item.title || 'Archivo',
      type: item.type || 'video',
      status: 'queued',
      progress: 0
    };
  }

  nativeDownloadJob = {
    id: `job_${Date.now()}`,
    status: 'queued',
    total: items.length,
    completed: 0,
    failed: 0,
    nextIndex: 0,
    currentItem: null,
    items,
    tasks,
    sourceTabId: message.tabId || null,
    settings: {
      folder: message.folder || 'Documentos/Skool_Downloads',
      storageMode: message.storageMode || 'both',
      gdriveRoot: message.gdriveRoot || 'Skool Downloads',
      gdriveRootId: message.gdriveRootId || null
    },
    cloudSync: 'pending',
    startedAt: Date.now(),
    updatedAt: Date.now()
  };

  try {
    ensureNativeDownloadPort();
    await persistDownloadJob();
    dispatchNextNativeItem();
    return { success: true, job: publicDownloadJob() };
  } catch (err) {
    nativeDownloadJob.status = 'interrupted';
    nativeDownloadJob.error = err.message;
    await persistDownloadJob();
    return { success: false, error: err.message, job: publicDownloadJob() };
  }
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

  if (message.action === 'START_NATIVE_BATCH') {
    startNativeDownloadJob({ ...message, tabId }).then(sendResponse);
    return true;
  }

  if (message.action === 'GET_NATIVE_BATCH_STATUS') {
    (async () => {
      if (nativeDownloadJob) {
        sendResponse({ success: true, job: publicDownloadJob() });
        return;
      }
      const stored = await chrome.storage.local.get(DOWNLOAD_JOB_STORAGE_KEY);
      sendResponse({ success: true, job: stored[DOWNLOAD_JOB_STORAGE_KEY] || publicDownloadJob() });
    })();
    return true;
  }

  if (message.action === 'SYNC_PENDING_CLOUD') {
    forceNativeCloudSync().then(sendResponse);
    return true;
  }

  if (message.action === 'GET_TAB_STREAMS') {
    (async () => {
      try {
        const targetTabId = message.tabId || tabId;
        const key = `tab_streams_${targetTabId}`;
        const data = await chrome.storage.session.get(key);
        sendResponse({ success: true, streams: data[key] || [] });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'RESOLVE_DIRECT_VIDEO') {
    (async () => {
      try {
        const { url, platformType } = message;
        if (!url) throw new Error('No URL provided');

        // Check if already an MP4 binary
        if (url.includes('.mp4') && !url.includes('.html')) {
          sendResponse({ success: true, directUrl: url, type: 'mp4' });
          return;
        }

        // Loom
        if (platformType === 'loom' || url.includes('loom.com')) {
          const res = await resolveLoomDirectMp4(url);
          if (res) {
            sendResponse({ success: true, directUrl: res.directUrl, type: res.type });
            return;
          }
        }

        // Wistia
        if (platformType === 'wistia' || url.includes('wistia.com') || url.includes('wistia.net')) {
          const res = await resolveWistiaDirectMp4(url);
          if (res) {
            sendResponse({ success: true, directUrl: res.directUrl, type: res.type });
            return;
          }
        }

        // Vimeo
        if (platformType === 'vimeo' || url.includes('vimeo.com')) {
          const res = await resolveVimeoDirectMp4(url);
          if (res) {
            sendResponse({ success: true, directUrl: res.directUrl, type: res.type });
            return;
          }
        }

        // Native HLS
        if (url.includes('.m3u8')) {
          sendResponse({ success: true, directUrl: url, type: 'hls' });
          return;
        }

        sendResponse({ success: false, error: 'No se pudo resolver el enlace directo a MP4' });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'DOWNLOAD_FILE') {
    (async () => {
      try {
        const { url, filename, folderPath, saveAs } = message;
        
        // Prevent downloading HTML pages as video files
        if (!url.startsWith('blob:') && (url.includes('skool.com/classroom') || url.includes('youtube.com/watch') || url.includes('loom.com/share') || url.includes('vimeo.com/video'))) {
          throw new Error('La URL proporcionada es una página web HTML, no un archivo de video MP4.');
        }

        let fullPath = filename;
        if (folderPath) {
          const cleanFolder = folderPath
            .split('/')
            .map(part => sanitizePathSegment(part))
            .filter(Boolean)
            .join('/');
          
          fullPath = cleanFolder ? `${cleanFolder}/${filename}` : filename;
        }

        console.log('[Skool Downloader] Initiating download to:', fullPath);

        const downloadId = await chrome.downloads.download({
          url: url,
          filename: fullPath,
          saveAs: Boolean(saveAs)
        });

        sendResponse({ success: true, downloadId, path: fullPath });
      } catch (err) {
        console.error('[Skool Downloader] Download failed:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'FETCH_HLS_MANIFEST') {
    (async () => {
      try {
        const { url } = message;
        const response = await fetch(url, {
          headers: {
            'Referer': 'https://www.skool.com/',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const manifestText = await response.text();
        sendResponse({ success: true, manifest: manifestText });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'SHOW_NOTIFICATION') {
    (async () => {
      try {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon-128.png',
          title: message.title || 'Skool Video Downloader',
          message: message.message || ''
        });
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (message.action === 'BRIDGE_REQUEST') {
    (async () => {
      try {
        const { endpoint, method, body } = message;
        const options = {
          method: method || 'GET',
          headers: { 'Content-Type': 'application/json' }
        };
        if (body) {
          options.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        const res = await fetch(`http://127.0.0.1:4545${endpoint}`, options);
        if (res.ok) {
          const data = await res.json();
          sendResponse({ success: true, data });
        } else {
          sendResponse({ success: false, status: res.status });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  return false;
});
