/**
 * Skool Video Downloader - Popup Script (v2.8.0)
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
  let nativeQueuePollInterval = null;
  let lastNativeTerminalJobId = null;
  let activeBatchTotal = 0;
  let libraryCourseExists = false;
  let libraryLessonMap = new Map();

  let pageContext = {
    community: '',
    course: '',
    module: '',
    lessonTitle: 'Lección',
    lessonIndex: 1,
    lessonId: ''
  };

  async function getActiveTabId() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs[0]?.id || null;
    } catch (e) {
      return null;
    }
  }

  // User Settings State
  let userSettings = {
    storageMode: 'both', // 'local' | 'gdrive' | 'both'
    rootFolder: 'Documentos/Skool_Downloads',
    gdriveFolder: 'Skool Downloads',
    gdriveRootId: '',
    gdriveRootPath: 'Skool Downloads',
    folderPattern: '{community}/{course}/{module}/{index}_{title}',
    customCommunityName: '',
    customCourseName: '',
    customCourseRouteId: '',
    groupLessonPack: true,
    saveAsDialog: false,
    videoQuality: 'best',
    duplicatePolicy: 'skip'
  };

  function getCurrentCourseRouteId() {
    try {
      const parts = new URL(currentTab?.url || '').pathname.split('/').filter(Boolean);
      const classroomIndex = parts.indexOf('classroom');
      return classroomIndex >= 0 ? (parts[classroomIndex + 1] || '') : '';
    } catch (error) {
      return '';
    }
  }

  function isUsableDetectedCourseName(value) {
    const name = String(value || '').trim();
    const routeId = getCurrentCourseRouteId();
    return Boolean(name && name !== 'Curso' && name !== routeId && !/^[a-f0-9]{8,}$/i.test(name));
  }

  function getEffectiveCourseName() {
    const detectedName = classroomTree.courseTitle || pageContext.course || '';
    const routeId = getCurrentCourseRouteId();
    const scopedOverride = userSettings.customCourseName && (
      !isUsableDetectedCourseName(detectedName) ||
      (routeId && userSettings.customCourseRouteId === routeId)
    );
    if (scopedOverride) {
      return userSettings.customCourseName.trim();
    }
    return detectedName || 'Curso';
  }

  function canonicalCommunityName(value) {
    const name = String(value || '').trim();
    const key = name.toLocaleLowerCase().replace(/[\s_-]+/g, '');
    if (key === 'ultimateeditors2' || key === 'ultimateeditors20') return 'Ultimate Editors 2.0';
    if (key === 'ultimateeditors' || key === 'ultimateeditors5412') return 'Ultimate editors';
    return name;
  }

  function getEffectiveCommunityName() {
    if (userSettings.customCommunityName && userSettings.customCommunityName.trim()) {
      return canonicalCommunityName(userSettings.customCommunityName);
    }
    return canonicalCommunityName(classroomTree.communityName || pageContext.community) || 'Comunidad Skool';
  }

  function updateDestinationPreview() {
    if (!destinationPathTextEl) return;
    const gRoot = userSettings.gdriveRootPath || userSettings.gdriveFolder || 'Skool Downloads';
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

  // Tab navigation (Registered immediately)
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabButtons.forEach(b => b.setAttribute('aria-selected', 'false'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetId = btn.getAttribute('data-tab');
      const targetContent = document.getElementById(targetId);
      if (targetContent) {
        targetContent.classList.add('active');
      }
    });
  });

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
  const btnSyncCloud = document.getElementById('btn-sync-cloud');
  const selectVideoQuality = document.getElementById('select-video-quality');
  const selectDuplicatePolicy = document.getElementById('select-duplicate-policy');
  const libraryStatusSummary = document.getElementById('library-status-summary');

  // Settings & Storage Elements
  const storageModeCards = document.querySelectorAll('.storage-mode-card');
  const inputCustomCommunityName = document.getElementById('input-custom-community-name');
  const inputCustomCourseName = document.getElementById('input-custom-course-name');
  const inputRootFolder = document.getElementById('input-root-folder');
  const inputGdriveFolder = document.getElementById('input-gdrive-folder');
  const btnBrowseGdrive = document.getElementById('btn-browse-gdrive');
  const gdriveFolderStatus = document.getElementById('gdrive-folder-status');
  const driveFolderModal = document.getElementById('drive-folder-modal');
  const driveFolderBreadcrumb = document.getElementById('drive-folder-breadcrumb');
  const driveFolderList = document.getElementById('drive-folder-list');
  const inputNewDriveFolder = document.getElementById('input-new-drive-folder');
  const btnCreateDriveFolder = document.getElementById('btn-create-drive-folder');
  const btnUseDriveFolder = document.getElementById('btn-use-drive-folder');
  const btnCancelDrivePicker = document.getElementById('btn-cancel-drive-picker');
  const btnCloseDrivePicker = document.getElementById('btn-close-drive-picker');
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

  if (btnSyncCloud) {
    btnSyncCloud.addEventListener('click', async () => {
      btnSyncCloud.disabled = true;
      updateProgress('☁️ Sincronizando cambios pendientes...', 99, true);
      try {
        await checkBridgeStatus();
        if (!isNativeMessagingActive && isLocalBridgeOnline) {
          const bridgeResponse = await callBridge('/sync-cloud', 'GET');
          if (!bridgeResponse?.success || !bridgeResponse.data?.success) {
            throw new Error(bridgeResponse?.data?.error || 'No se pudo sincronizar desde el servidor local.');
          }
          showToast('✅ Catálogo web sincronizado en un único despliegue.');
          updateProgress('Sincronización web completada', 100, true);
          return;
        }
        const response = await chrome.runtime.sendMessage({ action: 'SYNC_PENDING_CLOUD' });
        if (!response?.success) throw new Error(response?.error || 'No se pudo iniciar la sincronización.');
        showToast('☁️ Sincronización única iniciada.');
        startNativeQueuePolling(response.job?.id);
      } catch (error) {
        showToast(`❌ ${error.message}`);
      } finally {
        btnSyncCloud.disabled = false;
      }
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

  let driveFolderPickerState = { current: null, breadcrumb: [] };

  function displayDrivePath(breadcrumb) {
    const names = (breadcrumb || []).map(item => item.name).filter(Boolean);
    if (names[0] === 'Mi unidad') names.shift();
    return names.join(' / ') || 'Mi unidad';
  }

  function setDriveFolderStatus(message, state = '') {
    if (!gdriveFolderStatus) return;
    gdriveFolderStatus.textContent = message;
    gdriveFolderStatus.classList.toggle('verified', state === 'verified');
    gdriveFolderStatus.classList.toggle('error', state === 'error');
  }

  async function saveDriveRoot(folder, breadcrumb) {
    const path = displayDrivePath(breadcrumb);
    userSettings.gdriveRootId = folder.id;
    userSettings.gdriveRootPath = path;
    userSettings.gdriveFolder = folder.name || 'Skool Downloads';
    if (inputGdriveFolder) inputGdriveFolder.value = path;
    await chrome.storage.local.set({
      gdriveRootId: userSettings.gdriveRootId,
      gdriveRootPath: userSettings.gdriveRootPath,
      gdriveFolder: userSettings.gdriveFolder
    });
    setDriveFolderStatus('✓ Carpeta comprobada por ID. Las futuras comunidades se crearán dentro.', 'verified');
    updateDestinationPreview();
  }

  async function ensureDriveRootSelection() {
    if (userSettings.storageMode === 'local') return false;
    if (userSettings.gdriveRootId) {
      const verified = await callBridge(`/drive/folder/verify?id=${encodeURIComponent(userSettings.gdriveRootId)}`, 'GET');
      if (verified?.data?.success) {
        await saveDriveRoot(verified.data.folder, verified.data.breadcrumb);
        return true;
      }
      userSettings.gdriveRootId = '';
    }

    const root = await callBridge('/drive/folders?parentId=root', 'GET');
    const matches = (root?.data?.folders || []).filter(folder => folder.name === 'Skool Downloads');
    if (matches.length === 1) {
      await saveDriveRoot(matches[0], [
        { id: 'root', name: 'Mi unidad' },
        { id: matches[0].id, name: matches[0].name }
      ]);
      return true;
    }
    setDriveFolderStatus(
      matches.length > 1
        ? 'Hay varias carpetas con ese nombre. Pulsa “Elegir…” para seleccionar la correcta.'
        : 'No se pudo comprobar el destino. Pulsa “Elegir…” para seleccionarlo o crearlo.',
      'error'
    );
    return false;
  }

  function closeDriveFolderPicker() {
    if (driveFolderModal) driveFolderModal.hidden = true;
  }

  async function loadDriveFolder(folderId) {
    if (!driveFolderList || !driveFolderBreadcrumb) return;
    driveFolderList.innerHTML = '<div class="drive-folder-empty">Cargando carpetas…</div>';
    const response = await callBridge(`/drive/folders?parentId=${encodeURIComponent(folderId || 'root')}`, 'GET');
    if (!response?.data?.success) {
      driveFolderList.innerHTML = '<div class="drive-folder-empty">No se pudo leer Google Drive. Comprueba la conexión.</div>';
      return;
    }

    driveFolderPickerState = {
      current: response.data.current,
      breadcrumb: response.data.breadcrumb || []
    };
    driveFolderBreadcrumb.replaceChildren();
    driveFolderPickerState.breadcrumb.forEach((crumb, index) => {
      if (index > 0) driveFolderBreadcrumb.append(document.createTextNode('›'));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'drive-folder-crumb';
      button.textContent = crumb.name;
      button.addEventListener('click', () => loadDriveFolder(crumb.id));
      driveFolderBreadcrumb.append(button);
    });

    driveFolderList.replaceChildren();
    const folders = response.data.folders || [];
    if (!folders.length) {
      driveFolderList.innerHTML = '<div class="drive-folder-empty">Esta carpeta no contiene otras carpetas.</div>';
    } else {
      folders.forEach(folder => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'drive-folder-row';
        button.setAttribute('role', 'listitem');
        button.textContent = `📁 ${folder.name}`;
        button.addEventListener('click', () => loadDriveFolder(folder.id));
        driveFolderList.append(button);
      });
    }
  }

  if (btnBrowseGdrive) {
    btnBrowseGdrive.addEventListener('click', async () => {
      if (driveFolderModal) driveFolderModal.hidden = false;
      await loadDriveFolder(userSettings.gdriveRootId || 'root');
    });
  }
  [btnCancelDrivePicker, btnCloseDrivePicker].forEach(button => {
    if (button) button.addEventListener('click', closeDriveFolderPicker);
  });
  if (driveFolderModal) {
    driveFolderModal.addEventListener('click', event => {
      if (event.target === driveFolderModal) closeDriveFolderPicker();
    });
  }
  if (btnCreateDriveFolder) {
    btnCreateDriveFolder.addEventListener('click', async () => {
      const name = inputNewDriveFolder?.value.trim();
      if (!name || !driveFolderPickerState.current?.id) return;
      btnCreateDriveFolder.disabled = true;
      const response = await callBridge('/drive/folders/create', 'POST', {
        parentId: driveFolderPickerState.current.id,
        name
      });
      btnCreateDriveFolder.disabled = false;
      if (!response?.data?.success) {
        showToast('❌ No se pudo crear la carpeta.');
        return;
      }
      if (inputNewDriveFolder) inputNewDriveFolder.value = '';
      await loadDriveFolder(response.data.folder.id);
    });
  }
  if (btnUseDriveFolder) {
    btnUseDriveFolder.addEventListener('click', async () => {
      if (!driveFolderPickerState.current?.id) return;
      await saveDriveRoot(driveFolderPickerState.current, driveFolderPickerState.breadcrumb);
      closeDriveFolderPicker();
      showToast(`✅ Carpeta raíz: ${userSettings.gdriveRootPath}`);
    });
  }

  function sendNativeCatalogMessage(payload) {
    return new Promise(resolve => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      }, 2500);
      try {
        chrome.runtime.sendNativeMessage('com.cinematic.skool_downloader', payload, response => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve(chrome.runtime.lastError ? null : (response || null));
        });
      } catch (error) {
        clearTimeout(timeout);
        resolve(null);
      }
    });
  }

  function libraryKeyFromTitle(title) {
    return `title:${String(title || '').trim().toLocaleLowerCase()}`;
  }

  function getLibraryLesson(lessonOrContext) {
    if (!lessonOrContext) return null;
    const id = lessonOrContext.id || lessonOrContext.lessonId;
    const title = lessonOrContext.title || lessonOrContext.lessonTitle;
    return (id && libraryLessonMap.get(String(id))) || libraryLessonMap.get(libraryKeyFromTitle(title)) || null;
  }

  function qualityLabel(status) {
    const height = Number(status?.actualHeight || 0);
    if (height > 0) return `${height}p`;
    const requested = status?.requestedQuality;
    return requested && requested !== 'best' ? `${requested}p` : '';
  }

  function applyLibraryStatus(result) {
    libraryCourseExists = Boolean(result?.courseExists);
    libraryLessonMap = new Map();
    (result?.lessons || []).forEach(lesson => {
      if (lesson.id) libraryLessonMap.set(String(lesson.id), lesson);
      if (lesson.title) libraryLessonMap.set(libraryKeyFromTitle(lesson.title), lesson);
    });

    if (!libraryStatusSummary) return;
    const savedCount = (result?.lessons || []).filter(lesson => lesson.inDrive).length;
    const detectedCount = classroomTree.totalLessons || 0;
    libraryStatusSummary.classList.toggle('complete', libraryCourseExists && detectedCount > 0 && savedCount >= detectedCount);
    if (!libraryCourseExists) {
      libraryStatusSummary.textContent = 'Curso nuevo: no aparece todavía en el catálogo local de la web.';
    } else {
      const resources = Number(result?.totalResources || 0);
      libraryStatusSummary.textContent = `Ya guardado: ${savedCount}/${detectedCount || result.totalLessons || 0} videos · ${resources} recursos. La web se publica solo al pulsar “Sincronizar web”.`;
    }
  }

  async function refreshLibraryStatus(reconcile = false) {
    const community = getEffectiveCommunityName();
    const course = getEffectiveCourseName();
    const action = reconcile ? 'RECONCILE_COURSE' : 'GET_COURSE_STATUS';
    const payload = { action, community, course };
    if (reconcile) payload.tree = classroomTree;

    let result = await sendNativeCatalogMessage(payload);
    if (!result?.success) {
      const endpoint = reconcile
        ? '/catalog-reconcile'
        : `/catalog-status?community=${encodeURIComponent(community)}&course=${encodeURIComponent(course)}`;
      const bridgeResult = await callBridge(endpoint, reconcile ? 'POST' : 'GET', reconcile ? { community, course, tree: classroomTree } : null);
      result = bridgeResult?.data || null;
    }
    if (result?.success) applyLibraryStatus(result);
    else if (libraryStatusSummary) libraryStatusSummary.textContent = 'No se pudo consultar el catálogo local; la descarga seguirá disponible.';
    return result;
  }

  let isNativeMessagingActive = false;

  async function checkNativeHost() {
    return new Promise(resolve => {
      let done = false;
      const t = setTimeout(() => {
        if (!done) {
          done = true;
          resolve(null);
        }
      }, 600);

      try {
        if (!chrome.runtime.sendNativeMessage) {
          clearTimeout(t);
          resolve(null);
          return;
        }
        chrome.runtime.sendNativeMessage('com.cinematic.skool_downloader', { action: 'STATUS' }, response => {
          if (!done) {
            done = true;
            clearTimeout(t);
            if (chrome.runtime.lastError || !response || !response.success) {
              resolve(null);
            } else {
              resolve(response);
            }
          }
        });
      } catch (e) {
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(null);
        }
      }
    });
  }

  // Check Local Downloader Server Bridge (Native Messaging First -> HTTP Bridge Fallback)
  async function checkBridgeStatus() {
    // 1. Check Native Messaging Host (0 background processes)
    const nativeRes = await checkNativeHost();
    if (nativeRes && nativeRes.success) {
      isNativeMessagingActive = true;
      isLocalBridgeOnline = true;
      bridgeStatusBadge.textContent = '⚡ Motor Nativo';
      bridgeStatusBadge.className = 'bridge-status online';
      if (nativeRes.gdriveUser && gdriveStatusTextEl) {
        gdriveStatusTextEl.textContent = `Google Drive Conectado (${nativeRes.gdriveUser})`;
      }
      return true;
    }

    // 2. Fallback to HTTP Bridge
    try {
      const res = await Promise.race([
        callBridge('/status', 'GET'),
        new Promise(r => setTimeout(() => r(null), 600))
      ]);
      if (res && res.success && res.data && res.data.status === 'online') {
        isNativeMessagingActive = false;
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

    isNativeMessagingActive = false;
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
  // Fast In-Browser Video Stream Resolver (Bypasses Cloudflare & AWS WAF using the browser's active session)
  async function resolveLessonDirectStream(lessonUrl) {
    if (!lessonUrl) return lessonUrl;

    // If already a direct video stream/platform URL, return as-is
    if (
      lessonUrl.includes('stream.mux.com') ||
      lessonUrl.includes('.m3u8') ||
      lessonUrl.includes('loom.com') ||
      lessonUrl.includes('youtube.com') ||
      lessonUrl.includes('youtu.be') ||
      lessonUrl.includes('vimeo.com') ||
      lessonUrl.includes('wistia.com') ||
      lessonUrl.includes('wistia.net')
    ) {
      return lessonUrl;
    }

    if (!lessonUrl.includes('skool.com')) {
      return lessonUrl;
    }

    try {
      let targetMd = null;
      try {
        const u = new URL(lessonUrl, window.location.href);
        targetMd = u.searchParams.get('md');
      } catch (ue) {
        const mdMatch = lessonUrl.match(/[?&]md=([a-f0-9]+)/i);
        if (mdMatch) targetMd = mdMatch[1];
      }

      // 1. Try resolving stream via the active tab (using active login session)
      const activeTabId = await getActiveTabId();
      if (activeTabId) {
        let tabRes = null;
        try {
          tabRes = await new Promise(resolve => {
            chrome.tabs.sendMessage(activeTabId, { action: 'RESOLVE_LESSON_STREAM', lessonUrl, targetMd }, resp => {
              if (chrome.runtime.lastError || !resp) resolve(null);
              else resolve(resp);
            });
          });
        } catch (te) {}

        if (!tabRes) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: activeTabId },
              files: ['content_scripts/skool-detector.js']
            });
            await new Promise(r => setTimeout(r, 150));
            tabRes = await new Promise(resolve => {
              chrome.tabs.sendMessage(activeTabId, { action: 'RESOLVE_LESSON_STREAM', lessonUrl, targetMd }, resp => {
                if (chrome.runtime.lastError || !resp) resolve(null);
                else resolve(resp);
              });
            });
          } catch (ie) {}
        }

        if (tabRes && tabRes.success && tabRes.directVideoUrl) {
          console.log('[Resolver] Resolved stream for', targetMd, '=>', tabRes.directVideoUrl);
          return tabRes.directVideoUrl;
        }
      }

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

          // If specific ?md= is present, find ONLY that lesson
          if (targetMd) {
            const lessonObjects = findDeep(data, obj => {
              return obj && typeof obj === 'object' && (obj.id === targetMd || obj._id === targetMd);
            });

            for (const les of lessonObjects) {
              const meta = les.metadata || {};
              const candidates = [
                meta.videoLink,
                meta.video_url,
                meta.videoUrl,
                les.videoLink,
                les.video_url,
                les.videoUrl,
                meta.hlsUrl,
                les.hlsUrl
              ];
              for (const c of candidates) {
                if (c && typeof c === 'string' && c.startsWith('http')) {
                  return c;
                }
              }

              const vidObj = meta.video || les.video;
              const pid = vidObj?.playbackId || meta.playbackId || les.playbackId;
              const tok = vidObj?.playbackToken || meta.playbackToken || les.playbackToken;
              if (pid) {
                return tok ? `https://stream.mux.com/${pid}.m3u8?token=${tok}` : `https://stream.mux.com/${pid}.m3u8`;
              }
            }
          } else {
            // General page video
            const pageVid = data.props?.pageProps?.video;
            if (pageVid?.playbackId) {
              const tok = pageVid.playbackToken;
              return tok ? `https://stream.mux.com/${pageVid.playbackId}.m3u8?token=${tok}` : `https://stream.mux.com/${pageVid.playbackId}.m3u8`;
            }
            if (pageVid?.url && typeof pageVid.url === 'string' && pageVid.url.startsWith('http')) {
              return pageVid.url;
            }
          }
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
    const progressTrack = progressBarFill.parentElement;
    if (progressTrack) progressTrack.setAttribute('aria-valuenow', String(cleanPercent));
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
      const res = await chrome.storage.local.get(['storageMode', 'rootFolder', 'gdriveFolder', 'gdriveRootId', 'gdriveRootPath', 'folderPattern', 'customCommunityName', 'customCourseName', 'customCourseRouteId', 'groupLessonPack', 'saveAsDialog', 'videoQuality', 'duplicatePolicy']);
      if (res.storageMode) userSettings.storageMode = res.storageMode;
      if (res.rootFolder) userSettings.rootFolder = res.rootFolder;
      if (res.gdriveFolder) userSettings.gdriveFolder = res.gdriveFolder;
      if (res.gdriveRootId) userSettings.gdriveRootId = res.gdriveRootId;
      if (res.gdriveRootPath) userSettings.gdriveRootPath = res.gdriveRootPath;
      if (res.folderPattern) userSettings.folderPattern = res.folderPattern;
      if (res.customCommunityName) {
        userSettings.customCommunityName = canonicalCommunityName(res.customCommunityName);
        if (userSettings.customCommunityName !== res.customCommunityName) {
          await chrome.storage.local.set({ customCommunityName: userSettings.customCommunityName });
        }
      }
      if (res.customCourseName) userSettings.customCourseName = res.customCourseName;
      if (res.customCourseRouteId) userSettings.customCourseRouteId = res.customCourseRouteId;
      if (typeof res.groupLessonPack === 'boolean') userSettings.groupLessonPack = res.groupLessonPack;
      if (typeof res.saveAsDialog === 'boolean') userSettings.saveAsDialog = res.saveAsDialog;
      if (['best', '1080', '720', '480'].includes(res.videoQuality)) userSettings.videoQuality = res.videoQuality;
      if (['skip', 'replace'].includes(res.duplicatePolicy)) userSettings.duplicatePolicy = res.duplicatePolicy;

      updateStorageModeUI(userSettings.storageMode);
      inputRootFolder.value = userSettings.rootFolder;
      inputGdriveFolder.value = userSettings.gdriveRootPath || userSettings.gdriveFolder;
      selectFolderPattern.value = userSettings.folderPattern;
      if (selectVideoQuality) selectVideoQuality.value = userSettings.videoQuality;
      if (selectDuplicatePolicy) selectDuplicatePolicy.value = userSettings.duplicatePolicy;
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
    userSettings.folderPattern = selectFolderPattern.value;
    if (inputCustomCommunityName) userSettings.customCommunityName = canonicalCommunityName(inputCustomCommunityName.value);
    if (inputCustomCourseName) userSettings.customCourseName = inputCustomCourseName.value.trim();
    userSettings.customCourseRouteId = userSettings.customCourseName ? getCurrentCourseRouteId() : '';

    await chrome.storage.local.set({
      storageMode: userSettings.storageMode,
      rootFolder: userSettings.rootFolder,
      gdriveFolder: userSettings.gdriveFolder,
      gdriveRootId: userSettings.gdriveRootId,
      gdriveRootPath: userSettings.gdriveRootPath,
      folderPattern: userSettings.folderPattern,
      customCommunityName: userSettings.customCommunityName,
      customCourseName: userSettings.customCourseName,
      customCourseRouteId: userSettings.customCourseRouteId,
      groupLessonPack: userSettings.groupLessonPack,
      saveAsDialog: userSettings.saveAsDialog,
      videoQuality: userSettings.videoQuality,
      duplicatePolicy: userSettings.duplicatePolicy
    });
    updateDestinationPreview();
    let destLabel = 'Ambos (PC + Google Drive)';
    if (userSettings.storageMode === 'local') destLabel = 'Solo en la PC';
    else if (userSettings.storageMode === 'gdrive') destLabel = 'Solo en Google Drive';

    showToast(`✅ Destino guardado: ${destLabel}`);
  });

  if (selectVideoQuality) {
    selectVideoQuality.addEventListener('change', async (event) => {
      userSettings.videoQuality = event.target.value;
      await chrome.storage.local.set({ videoQuality: userSettings.videoQuality });
      showToast(`🎞️ Calidad: ${event.target.options[event.target.selectedIndex].textContent}`);
    });
  }

  if (selectDuplicatePolicy) {
    selectDuplicatePolicy.addEventListener('change', async (event) => {
      userSettings.duplicatePolicy = event.target.value;
      await chrome.storage.local.set({ duplicatePolicy: userSettings.duplicatePolicy });
      renderClassroomTree(classroomTree);
      showToast(userSettings.duplicatePolicy === 'replace'
        ? '♻️ Los videos existentes se reemplazarán conservando su enlace de Drive.'
        : '✅ Los videos ya guardados se omitirán.');
    });
  }

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
      userSettings.customCommunityName = canonicalCommunityName(e.target.value);
      updateDestinationPreview();
    });
    inputCustomCommunityName.addEventListener('change', async (e) => {
      userSettings.customCommunityName = canonicalCommunityName(e.target.value);
      e.target.value = userSettings.customCommunityName;
      await chrome.storage.local.set({ customCommunityName: userSettings.customCommunityName });
    });
  }

  if (inputCustomCourseName) {
    inputCustomCourseName.addEventListener('input', (e) => {
      userSettings.customCourseName = e.target.value.trim();
      userSettings.customCourseRouteId = userSettings.customCourseName ? getCurrentCourseRouteId() : '';
      updateDestinationPreview();
    });
    inputCustomCourseName.addEventListener('change', async (e) => {
      userSettings.customCourseName = e.target.value.trim();
      userSettings.customCourseRouteId = userSettings.customCourseName ? getCurrentCourseRouteId() : '';
      await chrome.storage.local.set({
        customCourseName: userSettings.customCourseName,
        customCourseRouteId: userSettings.customCourseRouteId
      });
    });
  }

  if (inputRootFolder) {
    inputRootFolder.addEventListener('input', (e) => {
      userSettings.rootFolder = e.target.value.trim() || 'Documentos/Skool_Downloads';
      updateDestinationPreview();
    });
    inputRootFolder.addEventListener('change', async (e) => {
      userSettings.rootFolder = e.target.value.trim() || 'Documentos/Skool_Downloads';
      await chrome.storage.local.set({ rootFolder: userSettings.rootFolder });
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

    const community = getEffectiveCommunityName().replace(/[<>:"/\\|?*]/g, '').trim();
    const course = getEffectiveCourseName().replace(/[<>:"/\\|?*]/g, '').trim();
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
              } else if (badge.classList.contains('uploading') || badge.classList.contains('downloading')) {
                badge.remove();
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
      const baseContext = customCtx || pageContext;
      const taskId = customId || video.id || `vid_${Date.now()}`;
      const existingLesson = getLibraryLesson({ id: baseContext.lessonId || taskId, title: baseContext.lessonTitle || video.title });
      if (existingLesson?.inDrive && userSettings.duplicatePolicy === 'skip') {
        showToast('✅ Este video ya está en la web y en Drive. Cambia “Si ya existe” a “Reemplazar” si deseas otra calidad.');
        return;
      }
      const targetCtx = {
        ...baseContext,
        videoQuality: userSettings.videoQuality,
        duplicatePolicy: userSettings.duplicatePolicy,
        existingGdriveId: existingLesson?.gdriveId || null
      };
      const targetFolder = customFolder || calculateFolderPath(false, targetCtx);
      const idxStr = String(targetCtx.lessonIndex || 1).padStart(2, '0');
      const cleanTitle = (video.title || targetCtx.lessonTitle || 'Skool_Video')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/^\d+[\s._-]+/, '')
        .trim();

      let finalVideoUrl = video.url;
      if (finalVideoUrl.includes('skool.com') && !finalVideoUrl.includes('stream.mux.com') && !finalVideoUrl.includes('.m3u8')) {
        updateProgress('Extrayendo stream directo...', 15, true);
        const resolved = await resolveLessonDirectStream(finalVideoUrl);
        if (resolved) {
          finalVideoUrl = resolved;
        }
      }

      await checkBridgeStatus();
      const nativeItem = {
        id: taskId,
        type: 'video',
        url: finalVideoUrl,
        title: `${idxStr}_${cleanTitle}`,
        folder: targetFolder,
        context: targetCtx,
        quality: userSettings.videoQuality,
        duplicatePolicy: userSettings.duplicatePolicy,
        existingGdriveId: existingLesson?.gdriveId || null
      };
      if (isNativeMessagingActive) {
        const accepted = await executeNativeBatch([nativeItem], targetFolder);
        if (accepted) return;
      }
      if (isLocalBridgeOnline) {
        const destMsg = userSettings.storageMode === 'gdrive' ? 'a Google Drive' : userSettings.storageMode === 'both' ? 'a PC y Drive' : 'a tu PC';
        updateProgress(`🚀 Iniciando descarga ${destMsg}...`, 20, true);

        const res = await callBridge('/download', 'POST', {
          id: taskId,
          url: finalVideoUrl,
          title: `${idxStr}_${cleanTitle}`,
          folder: targetFolder,
          storageMode: userSettings.storageMode,
          gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
          gdriveRootId: userSettings.gdriveRootId || null,
          context: targetCtx,
          quality: userSettings.videoQuality,
          duplicatePolicy: userSettings.duplicatePolicy,
          existingGdriveId: existingLesson?.gdriveId || null
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
      const nativeItem = {
        id: taskId,
        type: 'resource',
        url: resItem.url,
        title: cleanFileName,
        folder: targetFolder,
        context: targetCtx
      };
      if (isNativeMessagingActive) {
        const accepted = await executeNativeBatch([nativeItem], targetFolder);
        if (accepted) return;
      }
      if (isLocalBridgeOnline) {
        const res = await callBridge('/download-file', 'POST', {
          id: taskId,
          url: resItem.url,
          filename: cleanFileName,
          folder: targetFolder,
          storageMode: userSettings.storageMode,
          gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
          gdriveRootId: userSettings.gdriveRootId || null,
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
    const existingLesson = getLibraryLesson(pageContext);
    const packContext = {
      ...pageContext,
      resources: detectedAttachments,
      groupLessonPack: userSettings.groupLessonPack,
      videoQuality: userSettings.videoQuality,
      duplicatePolicy: userSettings.duplicatePolicy,
      existingGdriveId: existingLesson?.gdriveId || null
    };
    const packItems = [];
    if (detectedVideos.length > 0 && !(existingLesson?.inDrive && userSettings.duplicatePolicy === 'skip')) {
      const video = detectedVideos[0];
      packItems.push({
        id: video.id || pageContext.lessonId || `vid_${Date.now()}`,
        type: 'video',
        url: video.url,
        title: video.title || pageContext.lessonTitle || 'Video',
        folder: targetFolder,
        context: packContext,
        quality: userSettings.videoQuality,
        duplicatePolicy: userSettings.duplicatePolicy,
        existingGdriveId: existingLesson?.gdriveId || null
      });
    }
    detectedAttachments.forEach((attachment, index) => {
      packItems.push({
        id: attachment.id || `res_${Date.now()}_${index}`,
        type: 'resource',
        url: attachment.url,
        title: attachment.name || 'Recurso',
        folder: targetFolder,
        context: packContext
      });
    });

    await checkBridgeStatus();
    if (packItems.length > 0 && isNativeMessagingActive && await executeNativeBatch(packItems, targetFolder)) return;

    showToast('🚀 Descargando pack completo de la clase...');

    if (detectedVideos.length > 0 && !(existingLesson?.inDrive && userSettings.duplicatePolicy === 'skip')) {
      await downloadDirectVideo(detectedVideos[0], targetFolder, null, packContext);
    }

    for (const att of detectedAttachments) {
      await downloadResource(att, targetFolder);
      await new Promise(r => setTimeout(r, 300));
    }

    showToast('🎉 ¡Pack completo enviado a descargar!');
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

    document.querySelectorAll('.tree-lesson-checkbox:not(:disabled)').forEach(cb => {
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

  function updateLessonBadge(lessonId, status, progress = 0) {
    if (!lessonId) return;
    const row = document.querySelector(`.tree-lesson-item[data-lesson-id="${CSS.escape(String(lessonId))}"]`);
    const badge = row?.querySelector('.status-badge');
    if (!badge) return;

    if (status === 'completed') {
      badge.className = 'status-badge completed';
      badge.textContent = userSettings.storageMode === 'local' ? '✅ Guardado' : '✅ En Drive 📁';
    } else if (status === 'failed' || status === 'interrupted') {
      badge.className = 'status-badge failed';
      badge.textContent = status === 'interrupted' ? '⏸ Interrumpido' : '❌ Error';
    } else if (status === 'uploading') {
      badge.className = 'status-badge uploading';
      badge.textContent = `☁️ ${progress}%`;
    } else if (status === 'downloading' || status === 'resolving') {
      badge.className = 'status-badge downloading';
      badge.textContent = status === 'resolving' ? '🔎 Resolviendo' : `🔄 ${progress}%`;
    }
  }

  function renderNativeQueueStatus(job) {
    if (!job || job.status === 'idle') return;
    Object.values(job.tasks || {}).forEach(task => {
      updateLessonBadge(task.lessonId, task.status, Math.round(task.progress || 0));
    });

    const done = (job.completed || 0) + (job.failed || 0);
    const activeTask = Object.values(job.tasks || {}).find(task => ['resolving', 'downloading', 'uploading'].includes(task.status));
    const fractional = activeTask ? Math.min(0.99, (activeTask.progress || 0) / 100) : 0;
    const percent = job.total ? Math.round(((done + fractional) / job.total) * 100) : 0;

    if (job.status === 'syncing') {
      updateProgress('☁️ Sincronizando el catálogo web (un solo despliegue)...', 99, true);
    } else if (['completed', 'completed_with_errors', 'completed_with_sync_error'].includes(job.status)) {
      const message = job.status === 'completed_with_sync_error'
        ? `Descarga completa; falló la sincronización web: ${job.syncError || 'revisa Git/Vercel'}`
        : job.failed > 0
        ? `Finalizado: ${job.completed} correctos y ${job.failed} con error`
        : job.cloudSync === 'deferred'
        ? 'Descarga completa; cambios web agrupados y pendientes de sincronizar'
        : userSettings.storageMode === 'local' ? 'Descarga local completada' : 'Descarga y sincronización completadas';
      updateProgress(message, 100, true);
      if (lastNativeTerminalJobId !== job.id) {
        lastNativeTerminalJobId = job.id;
        showToast(job.failed > 0 || job.status === 'completed_with_sync_error' ? `⚠️ ${message}` : `✅ ${message}`);
        refreshLibraryStatus(false).then(() => renderClassroomTree(classroomTree));
      }
    } else if (job.status === 'interrupted') {
      updateProgress(`Cola interrumpida: ${job.error || 'motor desconectado'}`, percent, true);
    } else {
      const stage = job.status === 'uploading' ? 'Subiendo a Drive' : job.status === 'resolving' ? 'Resolviendo video' : 'Descargando';
      updateProgress(`${stage} (${done}/${job.total})`, percent, true);
    }
  }

  function startNativeQueuePolling(expectedJobId = null) {
    if (nativeQueuePollInterval) return;
    const poll = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ action: 'GET_NATIVE_BATCH_STATUS' });
        const job = response?.job;
        if (!job || (expectedJobId && job.id && job.id !== expectedJobId)) return;
        renderNativeQueueStatus(job);
        if (['completed', 'completed_with_errors', 'completed_with_sync_error', 'interrupted'].includes(job.status)) {
          clearInterval(nativeQueuePollInterval);
          nativeQueuePollInterval = null;
        }
      } catch (err) {
        console.warn('[Skool Downloader] Native queue polling failed:', err);
      }
    };
    poll();
    nativeQueuePollInterval = setInterval(poll, 1000);
  }

  async function executeNativeBatch(itemsToDownload, rootFolder) {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'START_NATIVE_BATCH',
        items: itemsToDownload,
        folder: rootFolder,
        storageMode: userSettings.storageMode,
        gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
        gdriveRootId: userSettings.gdriveRootId || null,
        tabId: currentTab?.id || await getActiveTabId()
      });
      if (!response?.success) {
        throw new Error(response?.error || 'El motor nativo rechazó la cola.');
      }

      activeBatchTotal = itemsToDownload.length;
      startNativeQueuePolling(response.job?.id);
      const destMsg = userSettings.storageMode === 'gdrive' ? 'a Google Drive' : userSettings.storageMode === 'both' ? 'a PC y Drive' : 'a tu PC';
      showToast(`🚀 Cola iniciada: ${itemsToDownload.length} elementos ${destMsg}. Puedes cerrar esta ventana.`);
      return true;
    } catch (err) {
      console.error('[Native Messaging Batch Error]', err);
      showToast(`❌ No se pudo iniciar la cola: ${err.message}`);
      return false;
    }
  }

  async function triggerBatchDownload(filterType = 'all', onlySelected = false) {
    const itemsToDownload = [];
    const rootFolder = (userSettings.rootFolder || 'Documentos/Skool_Downloads').trim();
    const community = getEffectiveCommunityName().replace(/[<>:"/\\|?*]/g, '').trim();
    const course = getEffectiveCourseName().replace(/[<>:"/\\|?*]/g, '').trim();

    classroomTree.modules.forEach((mod, moduleArrayIndex) => {
      const safeModTitle = (mod.title || 'Modulo').replace(/[<>:"/\\|?*]/g, '').trim();

      mod.lessons.forEach((les, lessonArrayIndex) => {
        if (onlySelected && !selectedLessonIds.has(les.id)) return;

        const sourceOrder = les.sourceOrder || les.index || 1;
        const idxStr = String(sourceOrder).padStart(2, '0');
        const safeLesTitle = (les.title || 'Leccion').replace(/[<>:"/\\|?*]/g, '').trim();
        const existingLesson = getLibraryLesson(les);
        const itemCtx = {
          community: community,
          course: course,
          module: safeModTitle,
          moduleIndex: mod.moduleIndex || moduleArrayIndex + 1,
          lessonTitle: safeLesTitle,
          lessonIndex: sourceOrder,
          lessonIndexInModule: les.sourceOrder || les.lessonIndexInModule || lessonArrayIndex + 1,
          globalLessonIndex: les.index,
          lessonId: les.id,
          descriptionHtml: les.descriptionHtml || '',
          resources: les.attachments || [],
          groupLessonPack: userSettings.groupLessonPack,
          videoQuality: userSettings.videoQuality,
          duplicatePolicy: userSettings.duplicatePolicy,
          existingGdriveId: existingLesson?.gdriveId || null
        };
        const videoFolder = calculateFolderPath(false, itemCtx);
        const resourceFolder = calculateFolderPath(true, itemCtx);

        // Add video (all lessons have video URL)
        if ((filterType === 'all' || filterType === 'videos') && !(existingLesson?.inDrive && userSettings.duplicatePolicy === 'skip')) {
          const vUrl = les.videoUrl || les.url;
          if (vUrl) {
            itemsToDownload.push({
              id: les.id,
              type: 'video',
              url: vUrl,
              title: `${idxStr}_${safeLesTitle}`,
              folder: videoFolder,
              context: itemCtx,
              quality: userSettings.videoQuality,
              duplicatePolicy: userSettings.duplicatePolicy,
              existingGdriveId: existingLesson?.gdriveId || null
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
              folder: resourceFolder,
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

    updateProgress(`Preparando cola de ${itemsToDownload.length} elementos...`, 2, true);

    await checkBridgeStatus();
    if (isNativeMessagingActive) {
      const ok = await executeNativeBatch(itemsToDownload, rootFolder);
      if (ok) return;
    } else if (isLocalBridgeOnline) {
      const videosToResolve = itemsToDownload.filter(item => item.type === 'video' && item.url.includes('skool.com'));
      for (let index = 0; index < videosToResolve.length; index++) {
        const item = videosToResolve[index];
        updateProgress(`Resolviendo video ${index + 1}/${videosToResolve.length} para el motor local...`, 5, true);
        const resolved = await resolveLessonDirectStream(item.url);
        if (resolved) item.url = resolved;
      }
      const res = await callBridge('/download-batch', 'POST', {
        items: itemsToDownload,
        folder: rootFolder,
        storageMode: userSettings.storageMode,
        gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
        gdriveRootId: userSettings.gdriveRootId || null
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
          moduleIndex: att.moduleIndex || 1,
          lessonIndex: att.globalLessonIndex || att.lessonIndex || 1,
          lessonIndexInModule: att.lessonIndex || 1,
          globalLessonIndex: att.globalLessonIndex || att.lessonIndex || 1,
          lessonId: att.lessonId || '',
          resources: [att],
          groupLessonPack: userSettings.groupLessonPack
        }
      };
    });

    await checkBridgeStatus();
    if (isNativeMessagingActive) {
      const accepted = await executeNativeBatch(items, rootFolder);
      if (accepted) return;
    }
    if (isLocalBridgeOnline) {
      const res = await callBridge('/download-batch', 'POST', {
        items: items,
        folder: rootFolder,
        storageMode: userSettings.storageMode,
        gdriveRoot: userSettings.gdriveFolder || 'Skool Downloads',
        gdriveRootId: userSettings.gdriveRootId || null
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
            gdriveRootId: userSettings.gdriveRootId || null,
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
    if (!currentTab?.id || !classroomTree.modules?.length) return;
    try {
      if (resAllPillCount) resAllPillCount.textContent = '...';
      const lessons = [];
      classroomTree.modules.forEach((module, moduleIndex) => {
        (module.lessons || []).forEach((lesson, lessonIndex) => {
          lessons.push({ module, lesson, moduleIndex, lessonIndex });
        });
      });

      let nextLessonIndex = 0;
      let scanned = 0;
      const discovered = [];
      const worker = async () => {
        while (nextLessonIndex < lessons.length) {
          const entry = lessons[nextLessonIndex++];
          try {
            const response = await chrome.tabs.sendMessage(currentTab.id, {
              action: 'FETCH_LESSON_DETAILS',
              lessonUrl: entry.lesson.url || pageUrl,
              targetMd: entry.lesson.id
            });
            if (response?.success) {
              const currentPageAttachments = entry.lesson.id === pageContext.lessonId ? detectedAttachments : [];
              const mergedByUrl = new Map();
              [...(entry.lesson.attachments || []), ...currentPageAttachments, ...(response.attachments || [])]
                .forEach(attachment => {
                  if (attachment?.url) mergedByUrl.set(attachment.url, attachment);
                });
              const attachments = Array.from(mergedByUrl.values()).map((attachment, resourceIndex) => ({
                ...attachment,
                lessonId: entry.lesson.id,
                lessonTitle: entry.lesson.title,
                lessonIndex: entry.lessonIndex + 1,
                globalLessonIndex: entry.lesson.index,
                moduleTitle: entry.module.title,
                moduleIndex: entry.module.moduleIndex || entry.moduleIndex + 1,
                resourceIndex: resourceIndex + 1
              }));
              entry.lesson.attachments = attachments;
              if (response.descriptionHtml) entry.lesson.descriptionHtml = response.descriptionHtml;
              else if (entry.lesson.id === pageContext.lessonId && pageContext.descriptionHtml) {
                entry.lesson.descriptionHtml = pageContext.descriptionHtml;
              }
              discovered.push(...attachments);
            }
          } catch (err) {
            console.warn(`[Skool Downloader] Resource scan failed for lesson ${entry.lesson.id}:`, err);
          } finally {
            scanned += 1;
            if (resAllPillCount) resAllPillCount.textContent = `${scanned}/${lessons.length}`;
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(3, lessons.length) }, () => worker()));
      courseResourcesList = discovered.sort((a, b) =>
        (a.moduleIndex - b.moduleIndex) ||
        (a.lessonIndex - b.lessonIndex) ||
        (a.resourceIndex - b.resourceIndex)
      );
      classroomTree.totalAttachments = courseResourcesList.length;
      if (resAllPillCount) resAllPillCount.textContent = String(courseResourcesList.length);

      const currentLessonResources = courseResourcesList.filter(resource => resource.lessonId === pageContext.lessonId);
      if (currentLessonResources.length > 0 || pageContext.lessonId) {
        detectedAttachments = currentLessonResources;
        renderAttachments(detectedAttachments);
      }
      if (currentResourceMode === 'all') {
        renderResourcesList(courseResourcesList, 'all');
      }
      await refreshLibraryStatus(true);
      renderClassroomTree(classroomTree);
    } catch (e) {
      console.warn('Could not fetch course resources:', e);
      if (resAllPillCount) resAllPillCount.textContent = '0';
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
      const containsCurrentLesson = (mod.lessons || []).some(lesson => lesson.id === pageContext.lessonId);
      modCard.className = `module-card${containsCurrentLesson || modIdx === 0 ? '' : ' collapsed'}`;
      modCard.id = `mod-card-${modIdx}`;

      const lessonsCount = (mod.lessons || []).length;
      const defaultSelectedIds = new Set();
      const lessonRows = (mod.lessons || []).map((les) => {
        const existingLesson = getLibraryLesson(les);
        const alreadyStored = Boolean(existingLesson?.inDrive);
        const selectable = userSettings.duplicatePolicy === 'replace' || !alreadyStored;
        if (selectable) {
          selectedLessonIds.add(les.id);
          defaultSelectedIds.add(les.id);
        }
        const attCount = les.attachments ? les.attachments.length : 0;
        const knownQuality = qualityLabel(existingLesson);
        const statusText = alreadyStored
          ? userSettings.duplicatePolicy === 'replace'
            ? `Reemplazar${knownQuality ? ` · ${knownQuality}` : ''}`
            : `En web${knownQuality ? ` · ${knownQuality}` : ''}`
          : 'Pendiente';
        const statusClass = alreadyStored && userSettings.duplicatePolicy === 'skip' ? 'completed' : 'queued';
        const sourceOrder = les.sourceOrder || les.index;
        return `
          <div class="tree-lesson-item" data-lesson-id="${les.id}">
            <div class="tree-lesson-left">
              <input type="checkbox" class="tree-lesson-checkbox" data-mod-idx="${modIdx}" data-lesson-id="${les.id}" ${selectable ? 'checked' : 'disabled'}>
              <span class="tree-lesson-title" title="${les.title}">${sourceOrder}. ${les.title}</span>
            </div>
            <div class="tree-lesson-actions">
              ${les.duration ? `<span class="meta-duration" style="font-size:9px;">⏱️ ${les.duration}</span>` : ''}
              ${attCount > 0 ? `<span class="badge-tag purple" style="font-size:9px;">📎 ${attCount}</span>` : ''}
              <span class="status-badge ${statusClass}" id="tree-status-${les.id}">${statusText}</span>
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
      }).join('');

      modCard.innerHTML = `
        <div class="module-header" data-mod-idx="${modIdx}" role="button" tabindex="0" aria-expanded="${containsCurrentLesson || modIdx === 0 ? 'true' : 'false'}" aria-controls="mod-lessons-${modIdx}">
          <div class="module-header-left">
            <input type="checkbox" class="module-checkbox" data-mod-idx="${modIdx}" ${defaultSelectedIds.size > 0 ? 'checked' : ''}>
            <span class="module-title-text" title="${mod.title}">📁 ${mod.title}</span>
            <span class="module-meta-pill">${lessonsCount} clases</span>
          </div>
          <span class="module-chevron">▼</span>
        </div>
        <div class="module-lessons-list" id="mod-lessons-${modIdx}">
          ${lessonRows}
        </div>
      `;

      container.appendChild(modCard);
    });

    updateSelectedCount();
    if (checkSelectAll) {
      const selectableCheckboxes = Array.from(document.querySelectorAll('.tree-lesson-checkbox:not(:disabled)'));
      checkSelectAll.checked = selectableCheckboxes.length > 0 && selectableCheckboxes.every(checkbox => checkbox.checked);
    }

    // Toggle module accordion expand/collapse
    document.querySelectorAll('.module-header').forEach(header => {
      const toggleModule = (e) => {
        if (e.target.tagName === 'INPUT') return;
        const card = header.closest('.module-card');
        card.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', String(!card.classList.contains('collapsed')));
      };
      header.addEventListener('click', toggleModule);
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleModule(e);
        }
      });
    });

    // Module checkbox handler
    document.querySelectorAll('.module-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const modIdx = e.target.getAttribute('data-mod-idx');
        const isChecked = e.target.checked;
        document.querySelectorAll(`.tree-lesson-checkbox[data-mod-idx="${modIdx}"]:not(:disabled)`).forEach(lesCb => {
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
        const lesId = e.currentTarget.getAttribute('data-lesson-id');
        const community = (classroomTree.communityName || pageContext.community || 'Ultimate Editors 2.0').replace(/[<>:"/\\|?*]/g, '').trim();
        const course = (classroomTree.courseTitle || pageContext.course || 'Cinematic short film editing style').replace(/[<>:"/\\|?*]/g, '').trim();
        const root = (userSettings.rootFolder || 'Documentos/Skool_Downloads').trim();

        for (let moduleArrayIndex = 0; moduleArrayIndex < classroomTree.modules.length; moduleArrayIndex++) {
          const mod = classroomTree.modules[moduleArrayIndex];
          const found = mod.lessons.find(l => l.id === lesId);
          if (found) {
            const safeMod = (mod.title || 'Modulo').replace(/[<>:"/\\|?*]/g, '').trim();
            const sourceOrder = found.sourceOrder || found.index || 1;
            const idxStr = String(sourceOrder).padStart(2, '0');
            const safeTitle = (found.title || 'Leccion').replace(/[<>:"/\\|?*]/g, '').trim();
            const destFolder = `${root}/${community}/${course}/${safeMod}/${idxStr}_${safeTitle}`;
            
            const customCtx = {
              community: community,
              course: course,
              module: safeMod,
              moduleIndex: mod.moduleIndex || moduleArrayIndex + 1,
              lessonTitle: safeTitle,
              lessonIndex: sourceOrder,
              lessonIndexInModule: found.sourceOrder || found.lessonIndexInModule || mod.lessons.indexOf(found) + 1,
              globalLessonIndex: found.index,
              lessonId: found.id,
              descriptionHtml: found.descriptionHtml || '',
              resources: found.attachments || [],
              groupLessonPack: userSettings.groupLessonPack
            };

            downloadDirectVideo({ url: found.videoUrl || found.url, title: `${idxStr}_${safeTitle}`, id: found.id }, destFolder, found.id, customCtx);
            break;
          }
        }
      });
    });

    // Audit Course in Google Drive Button
    const btnAuditCourse = document.getElementById('btn-audit-course');
    // Google Drive Course Folder Link
    const btnOpenGdrive = document.getElementById('btn-open-gdrive');
    if (btnOpenGdrive && !btnOpenGdrive.dataset.bound) {
      btnOpenGdrive.dataset.bound = 'true';
      btnOpenGdrive.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://drive.google.com/drive/my-drive' });
      });
    }

    if (btnAuditCourse && !btnAuditCourse.dataset.bound) {
      btnAuditCourse.dataset.bound = 'true';
      btnAuditCourse.addEventListener('click', async () => {
        showToast('🔍 Auditando videos en Google Drive...');
        try {
          const community = getEffectiveCommunityName();
          const course = getEffectiveCourseName();
          const gdriveRoot = userSettings.gdriveFolder || 'Skool Downloads';
          const gdriveRootId = userSettings.gdriveRootId || '';
          const queryStr = `?community=${encodeURIComponent(community)}&course=${encodeURIComponent(course)}&gdriveRoot=${encodeURIComponent(gdriveRoot)}&gdriveRootId=${encodeURIComponent(gdriveRootId)}`;
          let data = null;
          if (isNativeMessagingActive) {
            data = await new Promise(resolve => {
              chrome.runtime.sendNativeMessage('com.cinematic.skool_downloader', {
                action: 'AUDIT_COURSE',
                community,
                course,
                gdriveRoot,
                gdriveRootId
              }, resp => resolve(resp || null));
            });
          } else {
            const res = await callBridge(`/audit-course${queryStr}`, 'GET');
            if (res && res.success && res.data) data = res.data;
          }

          if (data && data.success) {
            const files = data.files || {};
            let verifiedCount = 0;

            document.querySelectorAll('.tree-lesson-item').forEach(row => {
              const titleEl = row.querySelector('.tree-lesson-title');
              const titleText = titleEl ? titleEl.textContent.trim() : '';
              const badge = row.querySelector('.status-badge');

              const isFound = Object.keys(files).some(k => {
                const cleanK = k.replace(/^\d+_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
                const cleanT = titleText.replace(/^\d+\.\s*/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
                return Boolean(cleanT) && Boolean(cleanK) && (cleanK.includes(cleanT) || cleanT.includes(cleanK));
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

      checkBridgeStatus(); // Run bridge check asynchronously without blocking page scan

      // Query content script with timeout & direct fallback
      let response = null;
      try {
        response = await Promise.race([
          chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_PAGE_VIDEOS' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 3000))
        ]);
      } catch (err) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content_scripts/skool-detector.js']
          });
          await new Promise(r => setTimeout(r, 150));
          response = await Promise.race([
            chrome.tabs.sendMessage(currentTab.id, { action: 'SCAN_PAGE_VIDEOS' }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_AFTER_INJECT')), 4000))
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

        renderVideos(detectedVideos);
        renderAttachments(detectedAttachments);
        await refreshLibraryStatus(false);
        renderClassroomTree(classroomTree);
        void fetchCourseResources(currentTab.url);
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
  await ensureDriveRootSelection();
  await performScan();
  startNativeQueuePolling();
});
