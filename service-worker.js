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

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : message.tabId;

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
