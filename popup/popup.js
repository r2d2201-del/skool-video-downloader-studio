/**
 * Skool Video Downloader - Popup Script (v2.2.1)
 * Features:
 * - Accurate Section Hierarchies ("Cutting & Preparing", "Storytelling with Your Footage", etc.)
 * - 100% Video Coverage across all 37 lessons
 * - Live real-time download feedback with item counter and stage indicators
 * - 3 Storage Destination Modes: Solo PC, Solo Google Drive, Ambos (PC + Drive)
 * - Deterministic, clean folder structure without duplicates
 */

document.addEventListener('DOMContentLoaded', async () => {
  // State
  let currentTab = null;
  let detectedVideos = [];
  let detectedAttachments = [];
  let classroomTree = { modules: [], totalLessons: 0, totalVideos: 0, totalAttachments: 0, communityName: '', courseTitle: '' };
  let selectedLessonIds = new Set();
  let isLocalBridgeOnline = false;
  let queuePollInterval = null;
  let activeBatchTotal = 0;

  let pageContext = {
    community: '',
    course: '',
    module: '',
    lessonTitle: 'Lección',
    lessonIndex: 1,
    lessonId: ''
  };

  async function getSkoolCookiesNetscape() {
    try {
      const cookies = await chrome.cookies.getAll({ domain: "skool.com" });
      if (!cookies || cookies.length === 0) return "";
      let lines = ["# Netscape HTTP Cookie File"];
      for (const c of cookies) {
        const domain = c.domain.startsWith('.') ? c.domain : '.' + c.domain;
        const flag = domain.startsWith('.') ? 'TRUE' : 'FALSE';
        const path = c.path || '/';
        const secure = c.secure ? 'TRUE' : 'FALSE';
        const expiration = c.expirationDate ? Math.round(c.expirationDate) : (Math.round(Date.now() / 1000) + 86400 * 30);
        const name = c.name;
        const value = c.value;
        lines.push(`${domain}\t${flag}\t${path}\t${secure}\t${expiration}\t${name}\t${value}`);
      }
      return lines.join('\n');
    } catch (e) {
      console.warn('[Skool Downloader] Cookies export note:', e);
      return "";
    }
  }

  // User Settings State
  let userSettings = {
    storageMode: 'both', // 'local' | 'gdrive' | 'both'
    rootFolder: 'Documentos/Skool_Downloads',
    gdriveFolder: 'Skool Downloads',
    folderPattern: '{community}/{course}/{module}/{index}_{title}',
    customCommunityName: '',
    customCourseName: '',
    groupLessonPack: true,
    saveAsDialog: false
  };

  function getEffectiveCourseName() {
    if (userSettings.customCourseName && userSettings.customCourseName.trim()) {
      return userSettings.customCourseName.trim();
    }
    return classroomTree.courseTitle || pageContext.course || 'Curso';
  }

  function getEffectiveCommunityName() {
    if (userSettings.customCommunityName && userSettings.customCommunityName.trim()) {
      return userSettings.customCommunityName.trim();
    }
    return classroomTree.communityName || pageContext.community || 'Comunidad Skool';
  }

  function updateDestinationPreview() {
    if (!destinationPathTextEl) return;
    const gRoot = userSettings.gdriveFolder || 'Skool Downloads';
    const comm = getEffectiveCommunityName();
    const crs = getEffectiveCourseName();
    destinationPathTextEl.textContent = `${gRoot} / ${comm} / ${crs}`;
  }

  // DOM Elements
  const tabButtons = document.querySelectorAll('.nav-tabs .tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');
  const btnRefresh = document.getElementById('btn-refresh');
  const toastEl = document.getElementById('toast');
  const bridgeStatusBadge = document.getElementById('bridge-status-badge');

  // Context & Pack Elements
  const pageTitleEl = document.getElementById('page-title');
  const pageUrlEl = document.getElementById('page-url');
  const contextCommunityEl = document.getElementById('context-community');
  const contextCourseEl = document.getElementById('context-course');
  const packDownloadCard = document.getElementById('pack-download-card');
  const packSummaryText = document.getElementById('pack-summary-text');
  const btnDownloadPack = document.getElementById('btn-download-pack');
  const videoListContainer = document.getElementById('video-list-container');

  // Progress Bar Elements
  const downloadProgressBox = document.getElementById('download-progress-box');
  const progressStatusText = document.getElementById('progress-status-text');
  const progressPercentageText = document.getElementById('progress-percentage-text');
  const progressBarFill = document.getElementById('progress-bar-fill');

  // Resources Elements
  const badgeResourcesCount = document.getElementById('badge-resources-count');
  const resourcesTotalCountEl = document.getElementById('resources-total-count');
  const resourcesListContainer = document.getElementById('resources-list-container');
  const btnDownloadAllResources = document.getElementById('btn-download-all-resources');

  // Classroom Hierarchy Elements
  const badgeLessonsCount = document.getElementById('badge-lessons-count');
  const bulkCourseTitleEl = document.getElementById('bulk-course-title');
  const bulkStatsSummaryEl = document.getElementById('bulk-stats-summary');
  const classroomTreeContainer = document.getElementById('classroom-tree-container');
  const destinationPathTextEl = document.getElementById('destination-path-text');
  const btnEditDestination = document.getElementById('btn-edit-destination');
  const checkSelectAll = document.getElementById('check-select-all');
  const selectedItemsCountEl = document.getElementById('selected-items-count');
  const btnBulkDownloadAll = document.getElementById('btn-bulk-download-all');
  const btnBulkDownloadVideos = document.getElementById('btn-bulk-download-videos');
  const btnBulkDownloadResources = document.getElementById('btn-bulk-download-resources');
  const btnDownloadSelected = document.getElementById('btn-download-selected');

  // Settings & Storage Elements
  const storageModeCards = document.querySelectorAll('.storage-mode-card');
  const inputCustomCommunityName = document.getElementById('input-custom-community-name');
  const inputCustomCourseName = document.getElementById('input-custom-course-name');
  const inputRootFolder = document.getElementById('input-root-folder');
  const inputGdriveFolder = document.getElementById('input-gdrive-folder');
  const selectFolderPattern = document.getElementById('select-folder-pattern');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const folderChipButtons = document.querySelectorAll('.folder-chip-btn');
  const gdriveStatusTextEl = document.getElementById('gdrive-status-text');

  // Studio Launcher Button
  const btnHeaderOpenStudio = document.getElementById('btn-open-studio');
  if (btnHeaderOpenStudio) {
    btnHeaderOpenStudio.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://cinematic-lms-studio.vercel.app' });
    });
  }

  // Universal Bridge Fetcher (Direct fetch with Background Service Worker Proxy fallback)
  async function callBridge(endpoint, method = 'GET', body = null) {
    // 1. Direct fetch from popup
    try {
      const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
      };
      if (body) {
        options.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
      const res = await fetch(`http://127.0.0.1:4545${endpoint}`, options);
      if (res.ok) {
        const data = await res.json();
        return { success: true, data };
      }
    } catch (e) {
      console.warn('[Popup] Direct bridge fetch failed, falling back to service worker proxy:', e);
    }

    // 2. Background service worker proxy
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'BRIDGE_REQUEST',
        endpoint,
        method,
        body
      });
      if (response && response.success) {
        return response;
      }
    } catch (e) {
      console.warn('[Popup] Service worker bridge proxy failed:', e);
    }

    return { success: false };
  }

  // Check Local Downloader Server Bridge
  async function checkBridgeStatus() {
    try {
      const res = await callBridge('/status', 'GET');
      if (res && res.success && res.data && res.data.status === 'online') {
        isLocalBridgeOnline = true;
        bridgeStatusBadge.textContent = '⚡ Motor Activo';
        bridgeStatusBadge.className = 'bridge-status online';

        if (res.data.gdriveUser && gdriveStatusTextEl) {
          gdriveStatusTextEl.textContent = `Google Drive Conectado (${res.data.gdriveUser})`;
        }
        return true;
      }
    } catch (e) {
      console.warn('[Bridge Check]', e);
    }
    isLocalBridgeOnline = false;
    bridgeStatusBadge.textContent = '🌐 Modo Navegador';
    bridgeStatusBadge.className = 'bridge-status offline';
    return false;
  }

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

  // Fast In-Browser Video Stream Resolver (Bypasses Cloudflare & AWS WAF using the browser's active session)
  async function resolveLessonDirectStream(lessonUrl) {
    if (!lessonUrl || !lessonUrl.includes('skool.com') || lessonUrl.includes('stream.mux.com') || lessonUrl.includes('.m3u8')) {
      return lessonUrl;
    }
    try {
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

          const videoObjects = findDeep(data, obj => {
            return obj && typeof obj === 'object' && (obj.playbackId || obj.videoLink || obj.videoUrl || obj.video_url || obj.hlsUrl || obj.video?.playbackId);
          });

          for (const obj of videoObjects) {
            const pid = obj.playbackId || obj.video?.playbackId;
            const tok = obj.playbackToken || obj.video?.playbackToken;
            if (pid && tok) {
              return `https://stream.mux.com/${pid}.m3u8?token=${tok}`;
            } else if (pid) {
              return `https://stream.mux.com/${pid}.m3u8`;
            }

            const vlink = obj.videoLink || obj.videoUrl || obj.video_url || obj.hlsUrl || obj.video?.url;
            if (vlink && typeof vlink === 'string' && vlink.startsWith('http')) {
              return vlink;
            }
          }
        }

        // HTML regex fallback
        const pidMatch = html.match(/"playbackId"\s*:\s*"([^"]+)"/);
        const tokMatch = html.match(/"playbackToken"\s*:\s*"([^"]+)"/);
        if (pidMatch && tokMatch) {
          return `https://stream.mux.com/${pidMatch[1]}.m3u8?token=${tokMatch[1]}`;
        } else if (pidMatch) {
          return `https://stream.mux.com/${pidMatch[1]}.m3u8`;
        }

        const embedMatch = html.match(/(https:\/\/(?:www\.)?(?:loom\.com\/(?:share|embed)|fastly\.video\.skool\.com|stream\.video\.skool\.com|wistia\.(?:com|net)|vimeo\.com|youtube\.com|youtu\.be)\/[^\s"']+)/i);
        if (embedMatch) {
          return embedMatch[1];
        }
      }
    } catch (err) {
      console.warn('[Skool Downloader] In-browser stream resolution error:', err);
    }
    return lessonUrl;
  }

  // Show Toast Message
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, 2800);
  }

  // Update Progress Bar with Stage & Message
  function updateProgress(status, percent, isVisible = true) {
    if (!isVisible) {
      downloadProgressBox.style.display = 'none';
      return;
    }
    downloadProgressBox.style.display = 'flex';
    progressStatusText.textContent = status;
    const cleanPercent = Math.min(100, Math.max(0, Math.round(percent)));
    progressPercentageText.textContent = `${cleanPercent}%`;
    progressBarFill.style.width = `${cleanPercent}%`;
  }

  // Update Storage Mode UI Selection
  function updateStorageModeUI(mode) {
    userSettings.storageMode = mode;
    storageModeCards.forEach(card => {
      const radio = card.querySelector('input');
      if (radio.value === mode) {
        card.classList.add('active');
        radio.checked = true;
      } else {
        card.classList.remove('active');
        radio.checked = false;
      }
    });
  }

  // Storage Mode Card Click Handlers
  storageModeCards.forEach(card => {
    card.addEventListener('click', async () => {
      const radio = card.querySelector('input');
      if (radio) {
        updateStorageModeUI(radio.value);
        await chrome.storage.local.set({ storageMode: radio.value });
        let destLabel = 'Ambos (PC + Google Drive)';
        if (radio.value === 'local') destLabel = 'Solo en la PC';
        else if (radio.value === 'gdrive') destLabel = 'Solo en Google Drive';
        showToast(`💾 Destino: ${destLabel}`);
      }
    });
  });

  // Load User Settings from Storage
  async function loadSettings() {
    try {
      const res = await chrome.storage.local.get(['storageMode', 'rootFolder', 'gdriveFolder', 'folderPattern', 'customCommunityName', 'customCourseName', 'groupLessonPack', 'saveAsDialog']);
      if (res.storageMode) userSettings.storageMode = res.storageMode;
      if (res.rootFolder) userSettings.rootFolder = res.rootFolder;
      if (res.gdriveFolder) userSettings.gdriveFolder = res.gdriveFolder;
      if (res.folderPattern) userSettings.folderPattern = res.folderPattern;
      if (res.customCommunityName) userSettings.customCommunityName = res.customCommunityName;
      if (res.customCourseName) userSettings.customCourseName = res.customCourseName;
      if (typeof res.groupLessonPack === 'boolean') userSettings.groupLessonPack = res.groupLessonPack;
      if (typeof res.saveAsDialog === 'boolean') userSettings.saveAsDialog = res.saveAsDialog;

      updateStorageModeUI(userSettings.storageMode);
      inputRootFolder.value = userSettings.rootFolder;
      inputGdriveFolder.value = userSettings.gdriveFolder;
      selectFolderPattern.value = userSettings.folderPattern;
      if (inputCustomCommunityName) {
        inputCustomCommunityName.value = userSettings.customCommunityName || '';
        inputCustomCommunityName.placeholder = 'Detectado automáticamente';
      }
      if (inputCustomCourseName) {
        inputCustomCourseName.value = userSettings.customCourseName || '';
        inputCustomCourseName.placeholder = 'Detectado automáticamente';
      }
      updateDestinationPreview();
    } catch (err) {
      console.warn('[Skool Downloader] Failed to load settings:', err);
    }
  }

  // Save Settings Handler
  btnSaveSettings.addEventListener('click', async () => {
    userSettings.rootFolder = inputRootFolder.value.trim() || 'Documentos/Skool_Downloads';
    userSettings.gdriveFolder = inputGdriveFolder.value.trim() || 'Skool Downloads';
    userSettings.folderPattern = selectFolderPattern.value;
    if (inputCustomCommunityName) userSettings.customCommunityName = inputCustomCommunityName.value.trim();
    if (inputCustomCourseName) userSettings.customCourseName = inputCustomCourseName.value.trim();

    await chrome.storage.local.set({
      storageMode: userSettings.storageMode,
      rootFolder: userSettings.rootFolder,
      gdriveFolder: userSettings.gdriveFolder,
      folderPattern: userSettings.folderPattern,
      customCommunityName: userSettings.customCommunityName,
      customCourseName: userSettings.customCourseName,
      groupLessonPack: userSettings.groupLessonPack,
      saveAsDialog: userSettings.saveAsDialog
    });
    updateDestinationPreview();
    let destLabel = 'Ambos (PC + Google Drive)';
    if (userSettings.storageMode === 'local') destLabel = 'Solo en la PC';
    else if (userSettings.storageMode === 'gdrive') destLabel = 'Solo en Google Drive';

    showToast(`✅ Destino guardado: ${destLabel}`);
  });

  // Edit Destination Button Handler
  if (btnEditDestination) {
    btnEditDestination.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      const settingsBtn = document.querySelector('[data-tab="tab-settings"]');
      const settingsContent = document.getElementById('tab-settings');
      if (settingsBtn && settingsContent) {
        settingsBtn.classList.add('active');
        settingsContent.classList.add('active');
        if (inputCustomCommunityName && !inputCustomCommunityName.value) {
          inputCustomCommunityName.focus();
        } else if (inputCustomCourseName) {
          inputCustomCourseName.focus();
        }
      }
    });
  }

  if (inputCustomCommunityName) {
    inputCustomCommunityName.addEventListener('input', (e) => {
      userSettings.customCommunityName = e.target.value;
      updateDestinationPreview();
    });
  }

  if (inputCustomCourseName) {
    inputCustomCourseName.addEventListener('input', (e) => {
      userSettings.customCourseName = e.target.value;
      updateDestinationPreview();
    });
  }

  if (inputGdriveFolder) {
    inputGdriveFolder.addEventListener('input', (e) => {
      userSettings.gdriveFolder = e.target.value.trim() || 'Skool Downloads';
      updateDestinationPreview();
    });
  }

  if (inputRootFolder) {
    inputRootFolder.addEventListener('input', (e) => {
      userSettings.rootFolder = e.target.value.trim() || 'Documentos/Skool_Downloads';
      updateDestinationPreview();
    });
  }

  // Folder Chip Presets
  folderChipButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const path = btn.getAttribute('data-path');
      inputRootFolder.value = path;
      userSettings.rootFolder = path;
      await chrome.storage.local.set({ rootFolder: path });
      showToast(`📁 Ruta configurada: ${path}`);
    });
  });

  // Calculate Target Folder Path
  function calculateFolderPath(isResource = false, customContext = null) {
    const ctx = customContext || pageContext;
    const root = (userSettings.rootFolder || 'Documentos/Skool_Downloads').trim();
    const pattern = userSettings.folderPattern || '{community}/{course}/{module}/{index}_{title}';

    const community = (ctx.community || 'Ultimate Editors 2.0').replace(/[<>:"/\\|?*]/g, '').trim();
    const course = (ctx.course || 'Curso').replace(/[<>:"/\\|?*]/g, '').trim();
    const mod = (ctx.module || 'General').replace(/[<>:"/\\|?*]/g, '').trim();
    const idxStr = String(ctx.lessonIndex || 1).padStart(2, '0');
    const safeTitle = (ctx.lessonTitle || 'Leccion').replace(/[<>:"/\\|?*]/g, '').trim();

    if (pattern === 'flat') {
      return root;
    }

    let relative = pattern
      .replace('{community}', community)
      .replace('{course}', course)
      .replace('{index}', idxStr)
      .replace('{title}', safeTitle)
      .replace('{module}', mod);

    if (pattern.includes('Recursos') && isResource) {
      relative = `${community}/${course}/Recursos`;
    } else if (pattern.includes('Videos') && !isResource) {
      relative = `${community}/${course}/Videos`;
    }

    return `${root}/${relative}`.replace(/\/+/g, '/').replace(/\/$/, '');
  }

  // Tab navigation
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

  // Live Queue Status Polling with Rich Feedback
  function startQueuePolling() {
    if (queuePollInterval) return;
    queuePollInterval = setInterval(async () => {
      try {
        const res = await callBridge('/queue-status', 'GET');
        if (res && res.success && res.data) {
          const data = res.data;
          const active = data.active || {};
          const failed = data.failed || {};

          let completedKeys = [];
          if (Array.isArray(data.completed)) {
            completedKeys = data.completed;
          } else if (data.completed && typeof data.completed === 'object') {
            completedKeys = Object.keys(data.completed);
          }
          const completedSet = new Set(completedKeys);
          const completedCount = completedSet.size;
          const activeKeys = Object.keys(active);

          // Update tree badges
          document.querySelectorAll('.tree-lesson-item').forEach(row => {
            const lesId = row.getAttribute('data-lesson-id');
            const badge = row.querySelector('.status-badge');
            if (badge && lesId) {
              if (completedSet.has(lesId)) {
                badge.className = 'status-badge completed';
                badge.textContent = '✅ En Drive 📁';
              } else if (active[lesId]) {
                const itemData = active[lesId];
                const pct = Math.round(itemData.percent || 20);
                if (itemData.status === 'uploading_gdrive') {
                  badge.className = 'status-badge uploading';
                  badge.textContent = '☁️ Subiendo...';
                } else {
                  badge.className = 'status-badge downloading';
                  badge.textContent = `🔄 ${pct}%`;
                }
              } else if (failed[lesId]) {
                badge.className = 'status-badge failed';
                badge.textContent = '❌ Error';
              }
            }
          });

          // Update Global Progress Card
          const total = activeBatchTotal || (activeKeys.length + completedCount) || 1;
          if (activeKeys.length > 0) {
            const currentItem = active[activeKeys[0]];
            const globalPct = Math.min(95, Math.max(10, Math.round((completedCount / total) * 100)));
            const msg = currentItem.message || `Descargando: ${currentItem.title}`;
            updateProgress(`${msg} (${completedCount}/${total})`, globalPct, true);
          } else if (completedCount > 0) {
            updateProgress(`🎉 ¡Descarga completa! (${completedCount}/${total} elementos verificados en Drive)`, 100, true);
            setTimeout(() => updateProgress('', 0, false), 8000);
            clearInterval(queuePollInterval);
            queuePollInterval = null;
          }
        }
      } catch (e) {
        console.warn('[Skool Downloader] Queue polling check:', e);
      }
    }, 1000);
  }

  // ==========================================
  // UNIFIED DOWNLOAD ENGINES
  // ==========================================

  // 1. Download Video
  async function downloadDirectVideo(video, customFolder = null, customId = null, customCtx = null) {
    try {
      const targetCtx = customCtx || pageContext;
      const targetFolder = customFolder || calculateFolderPath(false, targetCtx);
      const idxStr = String(targetCtx.lessonIndex || 1).padStart(2, '0');
      const cleanTitle = (video.title || targetCtx.lessonTitle || 'Skool_Video').replace(/[<>:"/\\|?*]/g, '').trim();
      const taskId = customId || video.id || `vid_${Date.now()}`;

      let finalVideoUrl = video.url;
      if (finalVideoUrl.includes('skool.com') && !finalVideoUrl.includes('stream.mux.com') && !finalVideoUrl.includes('.m3u8')) {
        updateProgress('Extrayendo stream directo...', 15, true);
        const resolved = await resolveLessonDirectStream(finalVideoUrl);
        if (resolved) {
          finalVideoUrl = resolved;
        }
      }

      await checkBridgeStatus();
      if (isLocalBridgeOnline) {
        const destMsg = userSettings.storageMode === 'gdrive' ? 'a Google Drive' : userSettings.storageMode === 'both' ? 'a PC y Drive' : 'a tu PC';
        updateProgress(`🚀 Iniciando descarga ${destMsg}...`, 20, true);

        const skoolCookies = await getSkoolCookiesNetscape();
        const res = await callBridge('/download', 'POST', {
          id: taskId,
          url: finalVideoUrl,
          title: `${idxStr}_${cleanTitle}`,
          folder: targetFolder,
          storageMode: userSettings.storageMode,
          gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
          cookies: skoolCookies,
          context: targetCtx
        });

        if (res && res.success) {
          startQueuePolling();
          showToast(`🚀 Descargando: ${cleanTitle}.mp4`);
          return;
        }
      }

      if (userSettings.storageMode === 'gdrive') {
        showToast('⚠️ El motor de Google Drive no respondió. No se descargará a la PC.');
        return;
      }

      // Fallback: In-Browser Download
      showToast('Descargando video en navegador...');
      await chrome.runtime.sendMessage({
        action: 'DOWNLOAD_FILE',
        url: finalVideoUrl,
        filename: `${idxStr}_${cleanTitle}.mp4`,
        folderPath: targetFolder,
        saveAs: userSettings.saveAsDialog
      });

    } catch (err) {
      console.error('[Skool Downloader] Video download error:', err);
      showToast(`❌ Error: ${err.message}`);
    }
  }

  // 2. Download Resource (PDF, ZIP, Drive, Sheet, Doc, Figma, Canva)
  async function downloadResource(resItem, customFolder = null, customCtx = null) {
    try {
      const targetCtx = customCtx || pageContext;
      const targetFolder = customFolder || calculateFolderPath(true, targetCtx);
      const cleanFileName = (resItem.name || 'recurso').replace(/[<>:"/\\|?*]/g, '_');
      const taskId = resItem.id || `res_${Date.now()}`;

      await checkBridgeStatus();
      if (isLocalBridgeOnline) {
        const res = await callBridge('/download-file', 'POST', {
          id: taskId,
          url: resItem.url,
          filename: cleanFileName,
          folder: targetFolder,
          storageMode: userSettings.storageMode,
          gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
          context: targetCtx
        });

        if (res && res.success) {
          startQueuePolling();
          showToast(`📥 Guardando recurso: ${cleanFileName}`);
          return;
        }
      }

      if (userSettings.storageMode === 'gdrive') {
        showToast('⚠️ El motor de Google Drive no respondió. No se descargará a la PC.');
        return;
      }

      // Chrome Browser Download fallback
      let directUrl = resItem.url;
      const gdriveMatch = resItem.url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([a-zA-Z0-9_-]+)/);
      if (gdriveMatch) {
        directUrl = `https://drive.usercontent.google.com/download?id=${gdriveMatch[1]}&export=download&authuser=0`;
      } else if (resItem.url.includes('dropbox.com')) {
        directUrl = resItem.url.replace('dl=0', 'dl=1');
      }

      await chrome.runtime.sendMessage({
        action: 'DOWNLOAD_FILE',
        url: directUrl,
        filename: cleanFileName,
        folderPath: targetFolder,
        saveAs: userSettings.saveAsDialog
      });

      showToast(`📥 Descargando ${cleanFileName}`);

    } catch (err) {
      console.error('[Skool Downloader] Resource download error:', err);
      showToast(`❌ Error al descargar recurso: ${err.message}`);
    }
  }

  // 3. Master Pack Downloader (Video + All Resources in the SAME folder)
  btnDownloadPack.addEventListener('click', async () => {
    if (detectedVideos.length === 0 && detectedAttachments.length === 0) {
      showToast('No hay elementos para descargar en esta clase.');
      return;
    }

    const targetFolder = calculateFolderPath(false);
    showToast(`🚀 Descargando pack completo de la clase...`);

    if (detectedVideos.length > 0) {
      await downloadDirectVideo(detectedVideos[0], targetFolder);
    }

    for (const att of detectedAttachments) {
      await downloadResource(att, targetFolder);
      await new Promise(r => setTimeout(r, 300));
    }

    showToast('🎉 ¡Pack completo enviado a descargar!');
  });

  // 4. Download All Resources Button
  btnDownloadAllResources.addEventListener('click', async () => {
    if (detectedAttachments.length === 0) {
      showToast('No hay recursos para descargar.');
      return;
    }
    const targetFolder = calculateFolderPath(true);
    showToast(`Descargando ${detectedAttachments.length} recursos...`);
    for (const att of detectedAttachments) {
      await downloadResource(att, targetFolder, pageContext);
      await new Promise(r => setTimeout(r, 300));
    }
  });

  // ==========================================
  // BULK CLASSROOM SELECTION & BATCH ACTIONS
  // ==========================================

  function updateSelectedCount() {
    selectedItemsCountEl.textContent = String(selectedLessonIds.size);
  }

  checkSelectAll.addEventListener('change', () => {
    const isChecked = checkSelectAll.checked;
    selectedLessonIds.clear();

    document.querySelectorAll('.tree-lesson-checkbox').forEach(cb => {
      cb.checked = isChecked;
      if (isChecked) {
        selectedLessonIds.add(cb.getAttribute('data-lesson-id'));
      }
    });

    document.querySelectorAll('.module-checkbox').forEach(cb => {
      cb.checked = isChecked;
    });

    updateSelectedCount();
  });

  async function triggerBatchDownload(filterType = 'all', onlySelected = false) {
    const itemsToDownload = [];
    const rootFolder = (userSettings.rootFolder || 'Documentos/Skool_Downloads').trim();
    const community = getEffectiveCommunityName().replace(/[<>:"/\\|?*]/g, '').trim();
    const course = getEffectiveCourseName().replace(/[<>:"/\\|?*]/g, '').trim();

    classroomTree.modules.forEach(mod => {
      const safeModTitle = (mod.title || 'Modulo').replace(/[<>:"/\\|?*]/g, '').trim();

      mod.lessons.forEach(les => {
        if (onlySelected && !selectedLessonIds.has(les.id)) return;

        const idxStr = String(les.index || 1).padStart(2, '0');
        const safeLesTitle = (les.title || 'Leccion').replace(/[<>:"/\\|?*]/g, '').trim();
        const lessonFolder = `${rootFolder}/${community}/${course}/${safeModTitle}`;

        const itemCtx = {
          community: community,
          course: course,
          module: safeModTitle,
          lessonTitle: safeLesTitle,
          lessonIndex: les.index,
          lessonId: les.id,
          descriptionHtml: les.descriptionHtml || '',
          resources: les.attachments || []
        };

        // Add video (all lessons have video URL)
        if (filterType === 'all' || filterType === 'videos') {
          const vUrl = les.videoUrl || les.url;
          if (vUrl) {
            itemsToDownload.push({
              id: les.id,
              type: 'video',
              url: vUrl,
              title: `${idxStr}_${safeLesTitle}`,
              folder: lessonFolder,
              context: itemCtx
            });
          }
        }

        // Add attachments
        if ((filterType === 'all' || filterType === 'resources') && les.attachments && les.attachments.length > 0) {
          les.attachments.forEach(att => {
            itemsToDownload.push({
              id: att.id,
              type: 'resource',
              url: att.url,
              title: att.name,
              folder: lessonFolder,
              context: itemCtx
            });
          });
        }
      });
    });

    if (itemsToDownload.length === 0) {
      showToast('No se seleccionaron elementos para descargar.');
      return;
    }

    activeBatchTotal = itemsToDownload.length;
    showToast(`🚀 Iniciando descarga de ${itemsToDownload.length} elementos...`);

    // In-browser parallel direct stream resolution
    const skoolVideoItems = itemsToDownload.filter(it => it.type === 'video' && it.url.includes('skool.com') && !it.url.includes('stream.mux.com') && !it.url.includes('.m3u8'));
    if (skoolVideoItems.length > 0) {
      updateProgress(`Extrayendo streams de video (0/${skoolVideoItems.length})...`, 5, true);
      let done = 0;
      await Promise.all(skoolVideoItems.map(async (item) => {
        const streamUrl = await resolveLessonDirectStream(item.url);
        if (streamUrl) {
          item.url = streamUrl;
        }
        done++;
        const pct = Math.round(5 + (done / skoolVideoItems.length) * 15);
        updateProgress(`Extrayendo streams (${done}/${skoolVideoItems.length})...`, pct, true);
      }));
    }

    updateProgress(`Descargando ${itemsToDownload.length} elementos...`, 20, true);

    await checkBridgeStatus();
    if (isLocalBridgeOnline) {
      const skoolCookies = await getSkoolCookiesNetscape();
      const res = await callBridge('/download-batch', 'POST', {
        items: itemsToDownload,
        folder: rootFolder,
        storageMode: userSettings.storageMode,
        gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
        cookies: skoolCookies
      });

      if (res && res.success) {
        startQueuePolling();
        const destMsg = userSettings.storageMode === 'gdrive' ? 'a Google Drive' : userSettings.storageMode === 'both' ? 'a PC y Drive' : 'a tu PC';
        showToast(`🚀 Descargando ${itemsToDownload.length} elementos ${destMsg}...`);
        return;
      }
    }

    // In-browser fallback ONLY if mode is NOT gdrive
    if (userSettings.storageMode === 'gdrive') {
      showToast('⚠️ El motor de Google Drive no está disponible. No se descargarán archivos a la PC.');
      updateProgress('Error: Motor desconectado', 0, false);
      return;
    }

    for (let i = 0; i < itemsToDownload.length; i++) {
      const item = itemsToDownload[i];
      if (item.type === 'video') {
        await downloadDirectVideo({ url: item.url, title: item.title, id: item.id }, item.folder, item.id, item.context);
      } else {
        await downloadResource(item, item.folder, item.context);
      }
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Bulk buttons
  btnBulkDownloadAll.addEventListener('click', () => triggerBatchDownload('all', false));
  btnBulkDownloadVideos.addEventListener('click', () => triggerBatchDownload('videos', false));
  btnBulkDownloadResources.addEventListener('click', () => triggerBatchDownload('resources', false));
  btnDownloadSelected.addEventListener('click', () => triggerBatchDownload('all', true));

  // ==========================================
  // RENDER FUNCTIONS
  // ==========================================

  // Render Single Video Card
  function renderVideos(videos) {
    videoListContainer.innerHTML = '';

    if (!videos || videos.length === 0) {
      videoListContainer.innerHTML = `
        <div class="empty-state">
          <p>No se encontró video en esta página.</p>
          <small>Si es un stream HLS, dale "Play" al video e intenta escanear de nuevo.</small>
        </div>
      `;
      return;
    }

    const vid = videos[0];
    const card = document.createElement('div');
    card.className = 'video-card';

    let badgeClass = 'green';
    if (vid.platformType === 'loom') badgeClass = 'purple';
    else if (vid.platformType === 'wistia') badgeClass = 'blue';
    else if (vid.platformType === 'vimeo') badgeClass = 'cyan';
    else if (vid.platformType === 'youtube') badgeClass = 'red';

    card.innerHTML = `
      <div class="video-card-header">
        <div class="video-card-title">${vid.title || pageContext.lessonTitle || 'Video de la Lección'}</div>
      </div>
      <div class="video-card-meta">
        <span class="badge-tag ${badgeClass}">${vid.platform}</span>
        ${vid.duration ? `<span class="meta-duration">⏱️ ${vid.duration}</span>` : ''}
        <span class="meta-duration" style="font-size:10px;">${vid.source || 'Video'}</span>
      </div>
      <div class="video-card-actions">
        <button id="btn-single-download-mp4" class="action-btn success full-width" style="font-size:13px; font-weight:700; padding: 10px;">
          📥 Descargar Video MP4
        </button>
      </div>
    `;

    videoListContainer.appendChild(card);

    document.getElementById('btn-single-download-mp4').addEventListener('click', () => {
      downloadDirectVideo(vid, null, null, pageContext);
    });
  }

  // Render Attachments List
  function renderAttachments(attachments) {
    if (attachments.length > 0) {
      badgeResourcesCount.style.display = 'inline-block';
      badgeResourcesCount.textContent = String(attachments.length);
      packDownloadCard.style.display = 'flex';
      packSummaryText.textContent = `Descarga el video MP4 y los ${attachments.length} recursos anexos en su carpeta organizada.`;
    } else {
      badgeResourcesCount.style.display = 'none';
      if (detectedVideos.length > 0) {
        packDownloadCard.style.display = 'flex';
        packSummaryText.textContent = `Descarga directa del video MP4 en su carpeta organizada.`;
      } else {
        packDownloadCard.style.display = 'none';
      }
    }
    renderResources(attachments);
  }

  let currentResourceMode = 'single';
  let singleResourcesList = [];
  let courseResourcesList = [];

  const btnToggleResSingle = document.getElementById('btn-toggle-res-single');
  const btnToggleResAll = document.getElementById('btn-toggle-res-all');
  const resSinglePillCount = document.getElementById('res-single-pill-count');
  const resAllPillCount = document.getElementById('res-all-pill-count');
  const resHeaderLabel = document.getElementById('resources-header-label');
  const resHeaderDesc = document.getElementById('resources-header-desc');

  if (btnToggleResSingle && btnToggleResAll) {
    btnToggleResSingle.addEventListener('click', () => {
      currentResourceMode = 'single';
      btnToggleResSingle.style.background = '#3b82f6';
      btnToggleResSingle.style.color = '#fff';
      btnToggleResAll.style.background = 'transparent';
      btnToggleResAll.style.color = '#94a3b8';

      if (resHeaderLabel) resHeaderLabel.textContent = 'Archivos y Enlaces de esta Lección';
      if (resHeaderDesc) resHeaderDesc.textContent = 'PDFs, plantillas, ZIPs, Google Drive, Docs y enlaces anexados a esta clase.';
      if (btnDownloadAllResources) btnDownloadAllResources.textContent = '📥 Descargar Recursos de esta Lección';
      renderResourcesList(singleResourcesList, 'single');
    });

    btnToggleResAll.addEventListener('click', () => {
      currentResourceMode = 'all';
      btnToggleResAll.style.background = '#3b82f6';
      btnToggleResAll.style.color = '#fff';
      btnToggleResSingle.style.background = 'transparent';
      btnToggleResSingle.style.color = '#94a3b8';

      if (resHeaderLabel) resHeaderLabel.textContent = 'Todos los Recursos de Todo el Curso';
      if (resHeaderDesc) resHeaderDesc.textContent = 'Tableros de Figma, carpetas de Google Drive, presets y archivos de todas las lecciones.';
      if (btnDownloadAllResources) btnDownloadAllResources.textContent = '📥 Descargar Todos los Recursos del Curso';
      renderResourcesList(courseResourcesList, 'all');
    });
  }

  // Handle Download All Resources (Single Lesson vs Entire Course)
  btnDownloadAllResources.addEventListener('click', async () => {
    const listToDownload = currentResourceMode === 'all' ? courseResourcesList : singleResourcesList;
    if (!listToDownload || listToDownload.length === 0) {
      showToast('No hay recursos disponibles para descargar.');
      return;
    }

    showToast(`🚀 Descargando ${listToDownload.length} recursos...`);
    const rootFolder = (userSettings.rootFolder || 'Documentos/Skool_Downloads').trim();
    const community = getEffectiveCommunityName().replace(/[<>:"/\\|?*]/g, '').trim();
    const course = getEffectiveCourseName().replace(/[<>:"/\\|?*]/g, '').trim();

    const items = listToDownload.map((att, idx) => {
      const lesTitle = (att.lessonTitle || pageContext.lessonTitle || 'Recurso').replace(/[<>:"/\\|?*]/g, '').trim();
      const modTitle = (att.moduleTitle || 'General').replace(/[<>:"/\\|?*]/g, '').trim();
      const itemFolder = `${rootFolder}/${community}/${course}/${modTitle}`;
      return {
        id: att.id || `res_${idx}`,
        type: 'resource',
        url: att.url,
        title: att.name || 'Recurso',
        folder: itemFolder,
        context: {
          community: community,
          course: course,
          module: modTitle,
          lessonTitle: lesTitle,
          lessonIndex: 1
        }
      };
    });

    await checkBridgeStatus();
    if (isLocalBridgeOnline) {
      const skoolCookies = await getSkoolCookiesNetscape();
      const res = await callBridge('/download-batch', 'POST', {
        items: items,
        folder: rootFolder,
        storageMode: userSettings.storageMode,
        gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
        cookies: skoolCookies
      });

      if (res && res.success) {
        activeBatchTotal = items.length;
        startQueuePolling();
        showToast(`🚀 Descargando ${items.length} recursos en segundo plano`);
        return;
      }
    }

    for (const item of items) {
      await downloadResource(item, item.folder, item.context);
      await new Promise(r => setTimeout(r, 300));
    }
  });

  const btnGenerateGuide = document.getElementById('btn-generate-guide');
  if (btnGenerateGuide) {
    btnGenerateGuide.addEventListener('click', async () => {
      const listToProcess = currentResourceMode === 'all' ? courseResourcesList : singleResourcesList;
      if (!listToProcess || listToProcess.length === 0) {
        showToast('No hay recursos para generar la guía.');
        return;
      }

      showToast('📖 Generando Guía Estética (HTML y Markdown)...');
      const rootFolder = (userSettings.rootFolder || 'Documentos/Skool Downloads').trim();
      const community = (pageContext.community || 'Ultimate Editors 2.0').replace(/[<>:"/\\|?*]/g, '').trim();
      const course = (pageContext.course || 'Cinematic short film editing style').replace(/[<>:"/\\|?*]/g, '').trim();
      const targetFolder = `${rootFolder}/${community}/${course}`;

      await checkBridgeStatus();
      if (isLocalBridgeOnline) {
        try {
          const res = await callBridge('/generate-resource-guide', 'POST', {
            resources: listToProcess,
            folder: targetFolder,
            community: community,
            course: course,
            storageMode: userSettings.storageMode,
            gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
            context: {
              community: community,
              course: course,
              module: 'General',
              lessonTitle: 'Guia de Recursos',
              lessonIndex: 1
            }
          });

          if (res && res.success) {
            showToast('✨ ¡Guía HTML y Markdown generada y subida a Google Drive!');
            return;
          }
        } catch (err) {
          showToast('❌ Error al generar guía: ' + err.message);
        }
      }
    });
  }

  async function fetchCourseResources(pageUrl) {
    if (!isLocalBridgeOnline) return;
    try {
      if (resAllPillCount) resAllPillCount.textContent = '...';
      const cleanUrl = (pageUrl || window.location.href).split('?')[0];
      const res = await callBridge(`/scan-course-resources?url=${encodeURIComponent(cleanUrl)}`, 'GET');
      if (res && res.success && res.data && Array.isArray(res.data.resources)) {
        courseResourcesList = res.data.resources;
        if (resAllPillCount) resAllPillCount.textContent = String(courseResourcesList.length);
        if (currentResourceMode === 'all') {
          renderResourcesList(courseResourcesList, 'all');
        }
      }
    } catch (e) {
      console.warn('Could not fetch course resources:', e);
    }
  }

  // Render Lesson or Course Resources List
  function renderResources(attachments) {
    singleResourcesList = attachments || [];
    if (resSinglePillCount) resSinglePillCount.textContent = String(singleResourcesList.length);
    if (currentResourceMode === 'single') {
      renderResourcesList(singleResourcesList, 'single');
    }
  }

  function renderResourcesList(items, mode) {
    resourcesListContainer.innerHTML = '';
    const totalCount = (items || []).length;
    resourcesTotalCountEl.textContent = String(totalCount);

    if (!items || items.length === 0) {
      resourcesListContainer.innerHTML = `
        <div class="empty-state">
          <p>${mode === 'all' ? 'Cargando o no se encontraron recursos en el curso.' : 'No se detectaron recursos en esta lección.'}</p>
        </div>
      `;
      return;
    }

    items.forEach((att, index) => {
      const row = document.createElement('div');
      row.className = 'resource-item';

      let tagClass = 'gray';
      if (att.category === 'pdf') tagClass = 'red';
      else if (att.category === 'zip') tagClass = 'purple';
      else if (att.category === 'sheet') tagClass = 'green';
      else if (att.category === 'doc') tagClass = 'blue';
      else if (att.category === 'gdrive' || att.category === 'gdrive_folder' || att.category === 'gdrive_file') tagClass = 'cyan';
      else if (att.category === 'figma') tagClass = 'purple';
      else if (att.category === 'canva') tagClass = 'cyan';

      const domain = att.url ? att.url.split('/')[2] : '';
      const lessonSub = att.lessonTitle ? `<span style="font-size:9px; color:#94a3b8;"> · Clase: ${att.lessonTitle}</span>` : '';

      row.innerHTML = `
        <div class="resource-left">
          <span class="badge-tag ${tagClass}">${att.categoryLabel || 'RECURSO'}</span>
          <div class="resource-info">
            <span class="resource-name" title="${att.name}">${att.name}</span>
            <span class="resource-meta" style="font-size:9px; color:#64748b;">${domain}${lessonSub}</span>
          </div>
        </div>
        <div class="resource-actions">
          <button class="action-btn secondary btn-download-res" data-index="${index}" style="padding: 5px 8px;">
            📥 Bajar
          </button>
        </div>
      `;

      resourcesListContainer.appendChild(row);
    });

    document.querySelectorAll('.btn-download-res').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        const targetItem = items[idx];
        const ctx = {
          community: getEffectiveCommunityName(),
          course: getEffectiveCourseName(),
          module: targetItem.moduleTitle || 'General',
          lessonTitle: targetItem.lessonTitle || pageContext.lessonTitle || 'Recurso',
          lessonIndex: 1
        };
        downloadResource(targetItem, null, ctx);
      });
    });
  }

  // Render Complete Classroom Tree Grouped by Section Dropdowns
  function renderClassroomTree(tree) {
    const container = document.getElementById('classroom-tree-container') || document.getElementById('classroom-tree-list');
    if (!container) return;
    container.innerHTML = '';
    selectedLessonIds.clear();

    const modules = tree.modules || [];
    if (badgeLessonsCount) {
      badgeLessonsCount.style.display = tree.totalLessons > 0 ? 'inline-block' : 'none';
      badgeLessonsCount.textContent = String(tree.totalLessons);
    }

    if (bulkCourseTitleEl) bulkCourseTitleEl.textContent = `${getEffectiveCommunityName()} · ${getEffectiveCourseName()}`;
    if (bulkStatsSummaryEl) bulkStatsSummaryEl.textContent = `${modules.length} módulos · ${tree.totalLessons} lecciones · ${tree.totalVideos} videos · ${tree.totalAttachments} recursos`;

    updateDestinationPreview();

    if (modules.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>No se encontraron módulos o lecciones en esta página.</p>
          <small>Navega a un curso o aula de Skool para listar todo el temario.</small>
        </div>
      `;
      return;
    }

    modules.forEach((mod, modIdx) => {
      const modCard = document.createElement('div');
      modCard.className = 'module-card';
      modCard.id = `mod-card-${modIdx}`;

      const lessonsCount = (mod.lessons || []).length;

      modCard.innerHTML = `
        <div class="module-header" data-mod-idx="${modIdx}">
          <div class="module-header-left">
            <input type="checkbox" class="module-checkbox" data-mod-idx="${modIdx}" checked>
            <span class="module-title-text" title="${mod.title}">📁 ${mod.title}</span>
            <span class="module-meta-pill">${lessonsCount} clases</span>
          </div>
          <span class="module-chevron">▼</span>
        </div>
        <div class="module-lessons-list" id="mod-lessons-${modIdx}">
          ${(mod.lessons || []).map((les) => {
            selectedLessonIds.add(les.id);
            const attCount = les.attachments ? les.attachments.length : 0;
            return `
              <div class="tree-lesson-item" data-lesson-id="${les.id}">
                <div class="tree-lesson-left">
                  <input type="checkbox" class="tree-lesson-checkbox" data-mod-idx="${modIdx}" data-lesson-id="${les.id}" checked>
                  <span class="tree-lesson-title" title="${les.title}">${les.index}. ${les.title}</span>
                </div>
                <div class="tree-lesson-actions">
                  ${les.duration ? `<span class="meta-duration" style="font-size:9px;">⏱️ ${les.duration}</span>` : ''}
                  ${attCount > 0 ? `<span class="badge-tag purple" style="font-size:9px;">📎 ${attCount}</span>` : ''}
                  <span class="status-badge queued" id="tree-status-${les.id}">Listo</span>
                  <button class="icon-btn-action btn-tree-download-single" data-lesson-id="${les.id}" title="Descargar esta lección">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      container.appendChild(modCard);
    });

    updateSelectedCount();

    // Toggle module accordion expand/collapse
    document.querySelectorAll('.module-header').forEach(header => {
      header.addEventListener('click', (e) => {
        if (e.target.tagName === 'INPUT') return;
        const card = header.closest('.module-card');
        card.classList.toggle('collapsed');
      });
    });

    // Module checkbox handler
    document.querySelectorAll('.module-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const modIdx = e.target.getAttribute('data-mod-idx');
        const isChecked = e.target.checked;
        document.querySelectorAll(`.tree-lesson-checkbox[data-mod-idx="${modIdx}"]`).forEach(lesCb => {
          lesCb.checked = isChecked;
          const lesId = lesCb.getAttribute('data-lesson-id');
          if (isChecked) selectedLessonIds.add(lesId);
          else selectedLessonIds.delete(lesId);
        });
        updateSelectedCount();
      });
    });

    // Single lesson checkbox handler
    document.querySelectorAll('.tree-lesson-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const lesId = e.target.getAttribute('data-lesson-id');
        if (e.target.checked) selectedLessonIds.add(lesId);
        else selectedLessonIds.delete(lesId);
        updateSelectedCount();
      });
    });

    // Single lesson download button from tree
    document.querySelectorAll('.btn-tree-download-single').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const lesId = e.target.getAttribute('data-lesson-id');
        const community = (classroomTree.communityName || pageContext.community || 'Ultimate Editors 2.0').replace(/[<>:"/\\|?*]/g, '').trim();
        const course = (classroomTree.courseTitle || pageContext.course || 'Cinematic short film editing style').replace(/[<>:"/\\|?*]/g, '').trim();
        const root = (userSettings.rootFolder || 'Documentos/Skool_Downloads').trim();

        for (const mod of classroomTree.modules) {
          const found = mod.lessons.find(l => l.id === lesId);
          if (found) {
            const safeMod = (mod.title || 'Modulo').replace(/[<>:"/\\|?*]/g, '').trim();
            const idxStr = String(found.index || 1).padStart(2, '0');
            const safeTitle = (found.title || 'Leccion').replace(/[<>:"/\\|?*]/g, '').trim();
            const destFolder = `${root}/${community}/${course}/${safeMod}/${idxStr}_${safeTitle}`;
            
            const customCtx = {
              community: community,
              course: course,
              module: safeMod,
              lessonTitle: safeTitle,
              lessonIndex: found.index,
              lessonId: found.id,
              descriptionHtml: found.descriptionHtml || '',
              resources: found.attachments || []
            };

            downloadDirectVideo({ url: found.videoUrl || found.url, title: `${idxStr}_${safeTitle}`, id: found.id }, destFolder, found.id, customCtx);
            break;
          }
        }
      });
    });

    // Audit Course in Google Drive Button
    const btnAuditCourse = document.getElementById('btn-audit-course');
    // Studio Web Launcher (Vercel Cloud & PWA)
    const btnOpenStudio = document.getElementById('btn-open-studio');
    if (btnOpenStudio) {
      btnOpenStudio.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://cinematic-lms-studio.vercel.app' });
      });
    }

    // Google Drive Course Folder Link
    const btnOpenGdrive = document.getElementById('btn-open-gdrive');
    if (btnOpenGdrive) {
      btnOpenGdrive.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://drive.google.com/drive/folders/1ixMK0y6mzYW9UC0HCzzNxBU-Wp6AahDO' });
      });
    }

    if (btnAuditCourse) {
      btnAuditCourse.addEventListener('click', async () => {
        showToast('🔍 Auditando videos en Google Drive...');
        try {
          const community = getEffectiveCommunityName();
          const course = getEffectiveCourseName();
          const gdriveRoot = userSettings.gdriveFolder || 'Skool Downloads';
          const queryStr = `?community=${encodeURIComponent(community)}&course=${encodeURIComponent(course)}&gdriveRoot=${encodeURIComponent(gdriveRoot)}`;
          const res = await callBridge(`/audit-course${queryStr}`, 'GET');
          if (res && res.success && res.data) {
            const data = res.data;
            if (data.success) {
              const files = data.files || {};
              let verifiedCount = 0;

              document.querySelectorAll('.tree-lesson-item').forEach(row => {
                const titleEl = row.querySelector('.lesson-title');
                const titleText = titleEl ? titleEl.textContent.trim() : '';
                const badge = row.querySelector('.status-badge');

                const isFound = Object.keys(files).some(k => {
                  const cleanK = k.replace(/^\d+_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  const cleanT = titleText.replace(/^\d+\.\s*/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
                  return cleanK.includes(cleanT) || cleanT.includes(cleanK);
                });

                if (badge) {
                  if (isFound) {
                    verifiedCount++;
                    badge.className = 'status-badge completed';
                    badge.textContent = '✅ En Drive 📁';
                  } else {
                    badge.className = 'status-badge';
                    badge.textContent = 'Listo';
                  }
                }
              });

              showToast(`🛡️ Auditoría: ${verifiedCount} videos verificados en Google Drive`);
            } else {
              showToast('⚠️ No se pudo conectar con Drive para la auditoría.');
            }
          }
        } catch (err) {
          showToast('❌ Error en auditoría: ' + err.message);
        }
      });
    }
  }

  // Scan Active Tab
  async function performScan() {
    videoListContainer.innerHTML = `
      <div class="empty-state">
        <div class="spinner"></div>
        <p>Escanendo lección y temario del aula...</p>
      </div>
    `;

    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tabs || tabs.length === 0) {
        videoListContainer.innerHTML = `<div class="empty-state"><p>No se detectó pestaña activa.</p></div>`;
        return;
      }

      currentTab = tabs[0];
      pageTitleEl.textContent = currentTab.title || 'Skool.com';
      pageUrlEl.textContent = currentTab.url || '';

      const isSkool = currentTab.url && currentTab.url.includes('skool.com');
      if (!isSkool) {
        pageTitleEl.textContent = 'Página no compatible';
        pageUrlEl.textContent = currentTab.url;
        videoListContainer.innerHTML = `
          <div class="empty-state">
            <p>Esta extensión está optimizada para <b>skool.com</b>.</p>
            <small>Abre un aula o lección de Skool para comenzar.</small>
          </div>
        `;
        return;
      }

      await checkBridgeStatus();

      // Query content script with timeout & direct fallback
      let response = null;
      try {
        response = await Promise.race([
          chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_PAGE_VIDEOS' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 800))
        ]);
      } catch (err) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content_scripts/skool-detector.js']
          });
          await new Promise(r => setTimeout(r, 200));
          response = await Promise.race([
            chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_PAGE_VIDEOS' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_AFTER_INJECT')), 1200))
          ]);
        } catch (e) {
          console.warn('[Skool Downloader] Messaging timeout/injection fallback:', e);
        }
      }

      if (response && response.success) {
        detectedVideos = response.videos || [];
        detectedAttachments = response.attachments || [];
        classroomTree = response.tree || { modules: [] };

        if (response.context) {
          pageContext = response.context;
          if (contextCommunityEl) contextCommunityEl.textContent = getEffectiveCommunityName();
          if (contextCourseEl) contextCourseEl.textContent = getEffectiveCourseName();
          if (pageTitleEl) pageTitleEl.textContent = pageContext.lessonTitle;
          if (inputCustomCommunityName && !userSettings.customCommunityName) {
            inputCustomCommunityName.placeholder = pageContext.community || 'Detectado automáticamente';
          }
          if (inputCustomCourseName && !userSettings.customCourseName) {
            inputCustomCourseName.placeholder = pageContext.course || 'Detectado automáticamente';
          }
          updateDestinationPreview();
        }

        // Guarantee active lesson download card is always available on classroom pages
        if (detectedVideos.length === 0 && currentTab.url && currentTab.url.includes('/classroom/')) {
          const currentMd = new URLSearchParams(new URL(currentTab.url).search).get('md') || pageContext.lessonId;
          detectedVideos.push({
            id: currentMd || 'active_lesson_video',
            title: pageContext.lessonTitle || 'Video de la Lección',
            url: currentTab.url,
            cleanUrl: currentTab.url.split('?')[0],
            platform: 'Skool Video (MP4)',
            platformType: 'hls',
            badgeColor: '#10b981',
            duration: null,
            source: 'Video de la Lección',
            isCurrentLesson: true
          });
        }

        renderVideos(detectedVideos);
        renderAttachments(detectedAttachments);
        renderClassroomTree(classroomTree);
        fetchCourseResources(currentTab.url);
      } else {
        videoListContainer.innerHTML = `
          <div class="empty-state">
            <p>La extensión se acaba de actualizar. <b>Recarga la página de Skool</b> para activar el detector.</p>
            <button id="btn-reload-page" class="action-btn primary" style="margin-top: 10px; width: 100%;">
              🔄 Recargar Pestaña de Skool
            </button>
          </div>
        `;
        const btnReload = document.getElementById('btn-reload-page');
        if (btnReload) {
          btnReload.addEventListener('click', () => {
            chrome.tabs.reload(currentTab.id);
            window.close();
          });
        }
      }

    } catch (globalErr) {
      console.error('[Skool Downloader] Global scan error:', globalErr);
      videoListContainer.innerHTML = `
        <div class="empty-state">
          <p>Ocurrió un error al escanear la página.</p>
          <small>${globalErr.message}</small>
        </div>
      `;
    }
  }

  // Refresh Button
  btnRefresh.addEventListener('click', () => {
    performScan();
  });

  // Initialization
  await loadSettings();
  await performScan();
});
