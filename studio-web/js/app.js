/**
 * CINEMATIC LMS STUDIO - CORE MULTI-COURSE REACTIVE ENGINE (v2.5.7)
 * Multi-Community Catalog + Collapsible Accordion Modules + SVG Icons + Drive Stream
 */

(function () {
  'use strict';

  const STORAGE_KEY_PROGRESS = 'cinematic_lms_completed_lessons';
  const STORAGE_KEY_LAST_LESSON_PREFIX = 'cinematic_lms_last_lesson_';
  const STORAGE_KEY_ACTIVE_COURSE = 'cinematic_lms_active_course_id';

  // SVG ICONS CONSTANTS
  const ICONS = {
    CHEVRON: `<svg class="svg-icon module-chevron" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"></polyline></svg>`,
    CHECK: `<svg class="svg-icon" style="stroke:#000; width:11px; height:11px;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    FIGMA: `<svg class="svg-icon" style="width:12px; height:12px; stroke:#c084fc;" viewBox="0 0 24 24"><path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"></path><path d="M12 2h3.5a3.5 3.5 0 1 1 0 7H12V2z"></path><path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"></path><path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"></path><path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"></path></svg>`,
    DRIVE: `<svg class="svg-icon" style="width:12px; height:12px; stroke:#2dd4bf;" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`,
    ZIP: `<svg class="svg-icon" style="width:12px; height:12px; stroke:#fbbf24;" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>`,
    EXTERNAL: `<svg class="svg-icon lime" style="width:11px; height:11px;" viewBox="0 0 24 24"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>`,
    ACADEMY: `<svg class="svg-icon cyan" style="width:18px; height:18px;" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>`,
    ROCKET: `<svg class="svg-icon" style="stroke:#000;" viewBox="0 0 24 24"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path></svg>`,
    MODULE: `<svg class="svg-icon" style="width:12px; height:12px;" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`,
    PLAY: `<svg class="svg-icon" style="width:12px; height:12px;" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`,
    PAPERCLIP: `<svg class="svg-icon" style="width:12px; height:12px;" viewBox="0 0 24 24"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`
  };

  let communitiesList = window.COMMUNITIES_DATA || [];
  let currentCourse = window.COURSE_DATA || (communitiesList[0] && communitiesList[0].courses[0]);
  let completedLessonIds = new Set(JSON.parse(localStorage.getItem(STORAGE_KEY_PROGRESS) || '[]'));
  let currentActiveLesson = null;
  let allFlattenedLessons = [];
  let currentView = 'home'; // 'home' or 'player'

  // DOM Elements - Views & Navigation
  const homeView = document.getElementById('home-view');
  const playerView = document.getElementById('player-view');
  const btnNavHome = document.getElementById('btn-nav-home');
  const navBrandHome = document.getElementById('nav-brand-home');
  const headerCourseBreadcrumb = document.getElementById('header-course-breadcrumb');
  const headerCourseSelector = document.getElementById('header-course-selector');
  const communitiesCatalogContainer = document.getElementById('communities-catalog-container');
  const homeTotalStatsPill = document.getElementById('home-total-stats-pill');

  // DOM Elements - Sidebar & Player
  const treeContainer = document.getElementById('tree-scroll-container');
  const progressPercentEl = document.getElementById('progress-percent-val');
  const progressCountEl = document.getElementById('progress-count-val');
  const progressBarFill = document.getElementById('progress-bar-fill');
  const searchInput = document.getElementById('lesson-search-input');
  const btnCollapseAllModules = document.getElementById('btn-collapse-all-modules');
  
  // DOM Elements - Stage
  const stageModuleBadge = document.getElementById('stage-module-badge');
  const stageLessonTitle = document.getElementById('stage-lesson-title');
  const videoIframe = document.getElementById('video-player-iframe');
  const videoPlaceholder = document.getElementById('video-placeholder-frame');
  const placeholderTitle = document.getElementById('placeholder-title');
  const placeholderDesc = document.getElementById('placeholder-desc');
  const btnMarkComplete = document.getElementById('btn-mark-complete');
  const btnPrevLesson = document.getElementById('btn-prev-lesson');
  const btnNextLesson = document.getElementById('btn-next-lesson');
  const lessonNotesHud = document.getElementById('lesson-notes-hud');
  const lessonNotesBody = document.getElementById('lesson-notes-body');
  const resourcesGrid = document.getElementById('resources-cards-grid');
  const resourcesCountBadge = document.getElementById('resources-count-badge');
  const btnSyncDrive = document.getElementById('btn-sync-drive');

  // Populate Header Course Selector
  function populateCourseSelector(force = false) {
    if (!headerCourseSelector) return;
    
    if (force || headerCourseSelector.options.length === 0) {
      headerCourseSelector.innerHTML = '';
      
      let totalComms = communitiesList.length;
      let totalCourses = 0;
      let totalAllLessons = 0;

      communitiesList.forEach(comm => {
        const optGroup = document.createElement('optgroup');
        optGroup.label = comm.name;

        comm.courses.forEach(crs => {
          totalCourses++;
          totalAllLessons += crs.totalLessons || 0;

          const opt = document.createElement('option');
          opt.value = crs.id;
          opt.textContent = `[ ${comm.name} ] ${crs.courseTitle} (${crs.totalLessons} clases)`;
          if (currentCourse && currentCourse.id === crs.id) {
            opt.selected = true;
          }
          optGroup.appendChild(opt);
        });

        headerCourseSelector.appendChild(optGroup);
      });

      if (homeTotalStatsPill) {
        homeTotalStatsPill.textContent = `[ ${totalComms} COMUNIDADES · ${totalCourses} CURSOS · ${totalAllLessons} CLASES ]`;
      }
    } else if (currentCourse) {
      headerCourseSelector.value = currentCourse.id;
    }
  }

  // Strict View Switching
  function switchView(viewName) {
    currentView = viewName;
    if (viewName === 'home') {
      homeView.classList.add('active');
      playerView.classList.remove('active');
      btnNavHome.style.background = 'var(--accent-lime)';
      btnNavHome.style.color = '#000';
      if (headerCourseSelector) headerCourseSelector.style.display = 'none';
      if (headerCourseBreadcrumb) {
        headerCourseBreadcrumb.style.display = 'inline-block';
        headerCourseBreadcrumb.textContent = '[ CATÁLOGO DE ACADEMIAS ]';
      }
      renderCatalog();
    } else {
      homeView.classList.remove('active');
      playerView.classList.add('active');
      btnNavHome.style.background = 'transparent';
      btnNavHome.style.color = 'var(--text-main)';
      if (headerCourseSelector) {
        headerCourseSelector.style.display = 'inline-block';
        if (currentCourse) headerCourseSelector.value = currentCourse.id;
      }
      if (headerCourseBreadcrumb) headerCourseBreadcrumb.style.display = 'none';
    }
  }

  // Render Home Catalog (Communities & Courses) with Vector SVG Icons
  function renderCatalog() {
    communitiesCatalogContainer.innerHTML = '';

    communitiesList.forEach(comm => {
      const commSection = document.createElement('section');
      commSection.className = 'community-group-section';

      commSection.innerHTML = `
        <div class="community-header">
          <span class="hud-pill cyan">[ ${comm.badge || 'COMUNIDAD'} ]</span>
          <h2 class="community-name">${ICONS.ACADEMY} ${comm.name}</h2>
        </div>
        <div class="catalog-grid" id="grid-comm-${comm.id}"></div>
      `;

      const grid = commSection.querySelector(`#grid-comm-${comm.id}`);

      comm.courses.forEach(crs => {
        const total = crs.totalLessons || 1;
        const compCount = crs.modules.reduce((acc, m) => 
          acc + m.lessons.filter(l => completedLessonIds.has(l.id)).length, 0
        );
        const percent = Math.round((compCount / total) * 100);

        const card = document.createElement('div');
        card.className = 'course-card-editorial';
        card.innerHTML = `
          <div class="course-card-banner">
            <span class="card-subtag">[ ${crs.bannerTag || '1080P HD'} ]</span>
            <h3>${crs.courseTitle}</h3>
          </div>
          <div class="course-card-body">
            <p style="font-size: 13px; color: var(--text-muted); line-height: 1.5;">
              ${crs.subtitle || 'Formación completa con video lecciones organizadas y recursos de edición.'}
            </p>
            <div class="course-card-meta-row">
              <span>${ICONS.MODULE} ${crs.totalModules} Módulos</span>
              <span>${ICONS.PLAY} ${crs.totalLessons} Clases</span>
              <span>${ICONS.PAPERCLIP} ${crs.totalResources || 0} Recursos</span>
            </div>
            <div class="course-card-progress">
              <div class="course-card-progress-label">
                <span>PROGRESO</span>
                <span style="color: var(--accent-lime); font-weight:700;">${percent}%</span>
              </div>
              <div class="progress-bar-track">
                <div class="progress-bar-fill" style="width: ${percent}%;"></div>
              </div>
            </div>
            <button class="btn-technical full-width" style="justify-content: center; margin-top: 8px;">
              ${ICONS.ROCKET} ENTRAR AL CURSO
            </button>
          </div>
        `;

        card.addEventListener('click', () => {
          selectCourse(crs);
        });

        grid.appendChild(card);
      });

      communitiesCatalogContainer.appendChild(commSection);
    });
  }

  // Select Course to Play
  function selectCourse(courseObj) {
    if (!courseObj) return;
    currentCourse = courseObj;
    localStorage.setItem(STORAGE_KEY_ACTIVE_COURSE, courseObj.id);
    flattenLessons();
    updateProgressUI();
    populateCourseSelector();
    switchView('player');

    const courseSavedKey = STORAGE_KEY_LAST_LESSON_PREFIX + courseObj.id;
    const savedLessonId = localStorage.getItem(courseSavedKey);
    const lessonToLoad = allFlattenedLessons.find(l => l.id === savedLessonId) || allFlattenedLessons[0];
    
    currentActiveLesson = lessonToLoad || null;
    renderTree();
    if (lessonToLoad) {
      loadLesson(lessonToLoad, true);
    }
  }

  // Flatten all lessons
  function flattenLessons() {
    allFlattenedLessons = [];
    if (!currentCourse || !currentCourse.modules) return;
    currentCourse.modules.forEach(mod => {
      mod.lessons.forEach(les => {
        allFlattenedLessons.push(les);
      });
    });
  }

  // Update Global HUD Progress
  function updateProgressUI() {
    const total = allFlattenedLessons.length || 1;
    const completedCount = allFlattenedLessons.filter(l => completedLessonIds.has(l.id)).length;
    const percent = Math.round((completedCount / total) * 100);

    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (progressCountEl) progressCountEl.textContent = `[ ${completedCount} / ${total} CLASES ]`;
    if (progressBarFill) progressBarFill.style.width = `${percent}%`;
  }

  // Render Sidebar Tree with Collapsible Accordions & Smooth Scrolling
  function renderTree(filterQuery = '') {
    if (!treeContainer) return;
    treeContainer.innerHTML = '';
    const query = filterQuery.toLowerCase().trim();

    if (!currentCourse || !currentCourse.modules) return;

    currentCourse.modules.forEach((mod, modIdx) => {
      const filteredLessons = mod.lessons.filter(l => 
        !query || l.title.toLowerCase().includes(query) || (l.rawTitle && l.rawTitle.toLowerCase().includes(query))
      );

      if (query && filteredLessons.length === 0) return;

      const isCurrentModule = currentActiveLesson && mod.lessons.some(l => l.id === currentActiveLesson.id);
      const isCollapsed = !isCurrentModule && !query;

      const moduleCard = document.createElement('div');
      moduleCard.className = `module-card ${isCollapsed ? 'collapsed' : ''}`;
      moduleCard.id = `mod-card-${modIdx}`;

      const modHeader = document.createElement('div');
      modHeader.className = 'module-header';
      modHeader.innerHTML = `
        <div class="module-title-wrap">
          <span class="module-num">${String(mod.index).padStart(2, '0')}</span>
          <span class="module-name" title="${mod.title}">${mod.title}</span>
        </div>
        <div class="module-meta-right">
          <span class="module-count">[ ${filteredLessons.length} ]</span>
          ${ICONS.CHEVRON}
        </div>
      `;

      // Accordion Click Handler
      modHeader.addEventListener('click', () => {
        moduleCard.classList.toggle('collapsed');
      });

      const lessonsList = document.createElement('div');
      lessonsList.className = 'lessons-list';

      filteredLessons.forEach(les => {
        const isCompleted = completedLessonIds.has(les.id);
        const isActive = currentActiveLesson && currentActiveLesson.id === les.id;

        const row = document.createElement('div');
        row.className = `lesson-row ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
        row.setAttribute('data-id', les.id);

        row.innerHTML = `
          <div class="lesson-left">
            <button class="lesson-check-btn ${isCompleted ? 'completed' : ''}" title="Marcar como completada">
              ${isCompleted ? ICONS.CHECK : ''}
            </button>
            <span class="lesson-title-text" title="${les.title}">${les.title}</span>
          </div>
          <span class="lesson-status-tag ${les.inDrive ? 'drive' : 'pending'}">
            ${les.inDrive ? 'Drive ✓' : 'Pendiente'}
          </span>
        `;

        // Click Row to Load Lesson
        row.addEventListener('click', (e) => {
          if (e.target.closest('.lesson-check-btn')) return;
          loadLesson(les);
        });

        // Click Checkbox
        const checkBtn = row.querySelector('.lesson-check-btn');
        checkBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleLessonComplete(les.id);
        });

        lessonsList.appendChild(row);
      });

      moduleCard.appendChild(modHeader);
      moduleCard.appendChild(lessonsList);
      treeContainer.appendChild(moduleCard);
    });
  }

  // Load Active Lesson onto Video Stage
  function loadLesson(lesson, skipTreeRender = false) {
    if (!lesson) return;
    currentActiveLesson = lesson;
    if (currentCourse) {
      localStorage.setItem(STORAGE_KEY_LAST_LESSON_PREFIX + currentCourse.id, lesson.id);
    }

    // Auto-expand active module and highlight active row
    if (currentCourse && currentCourse.modules) {
      const parentModIdx = currentCourse.modules.findIndex(m => m.lessons.some(l => l.id === lesson.id));
      if (parentModIdx !== -1) {
        const card = document.getElementById(`mod-card-${parentModIdx}`);
        if (card) card.classList.remove('collapsed');
      }
    }

    // Update active class on rows in DOM without wiping the entire tree
    document.querySelectorAll('.lesson-row').forEach(row => {
      if (row.getAttribute('data-id') === lesson.id) {
        row.classList.add('active');
      } else {
        row.classList.remove('active');
      }
    });

    // Update Header Text
    if (stageModuleBadge) stageModuleBadge.textContent = `[ ${lesson.module || 'Lección'} ]`;
    if (stageLessonTitle) stageLessonTitle.textContent = lesson.title;

    // Update Mark Complete Button State
    const isCompleted = completedLessonIds.has(lesson.id);
    if (btnMarkComplete) {
      if (isCompleted) {
        btnMarkComplete.innerHTML = `${ICONS.CHECK} COMPLETADA`;
        btnMarkComplete.className = 'btn-technical secondary';
      } else {
        btnMarkComplete.innerHTML = `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke:#000;"><polyline points="20 6 9 17 4 12"></polyline></svg> MARCAR COMPLETADA`;
        btnMarkComplete.className = 'btn-technical';
      }
    }

    // Video Player Loading (Google Drive Stream vs Placeholder)
    if (lesson.gdriveId) {
      if (videoIframe) {
        videoIframe.src = `https://drive.google.com/file/d/${lesson.gdriveId}/preview`;
        videoIframe.style.display = 'block';
      }
      if (videoPlaceholder) videoPlaceholder.style.display = 'none';
    } else {
      if (videoIframe) {
        videoIframe.src = '';
        videoIframe.style.display = 'none';
      }
      if (videoPlaceholder) {
        videoPlaceholder.style.display = 'flex';
        if (placeholderTitle) placeholderTitle.textContent = `Video en Proceso de Sincronización`;
        if (placeholderDesc) placeholderDesc.textContent = `El video de "${lesson.title}" se encuentra en cola de descarga o aún no está disponible en tu Google Drive.`;
      }
    }

    // Render Lesson Notes & Content (Rich Text / Instructions / Embedded Links)
    renderLessonNotes(lesson);

    // Render Resources for this specific lesson
    renderLessonResources(lesson);

    // Scroll stage smoothly to top on lesson switch
    const stageEl = document.querySelector('.main-stage');
    if (stageEl) {
      stageEl.scrollTo({ top: 0, behavior: 'smooth' });
    }

    if (!skipTreeRender) {
      // Re-evaluate if tree needs refresh
      const hasActiveRow = document.querySelector(`.lesson-row[data-id="${lesson.id}"]`);
      if (!hasActiveRow) {
        renderTree(searchInput ? searchInput.value : '');
      }
    }
  }

  // Render Lesson Notes & Rich Text Content
  function renderLessonNotes(lesson) {
    if (!lessonNotesHud || !lessonNotesBody) return;
    const descHtml = lesson.descriptionHtml || lesson.description || '';
    if (descHtml && typeof descHtml === 'string' && descHtml.trim()) {
      lessonNotesBody.innerHTML = descHtml;
      lessonNotesHud.style.display = 'block';
    } else {
      lessonNotesBody.innerHTML = '';
      lessonNotesHud.style.display = 'none';
    }
  }

  // Render Lesson Resources HUD with SVG Icons
  function renderLessonResources(lesson) {
    if (!resourcesGrid) return;
    resourcesGrid.innerHTML = '';
    const resources = lesson.resources || [];
    if (resourcesCountBadge) resourcesCountBadge.textContent = `[ ${resources.length} RECURSOS ]`;

    if (resources.length === 0) {
      resourcesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 12px; color: var(--text-dim); font-family: var(--font-mono); font-size: 11px;">
          [ NO HAY RECURSOS ADJUNTOS EN ESTA CLASE ]
        </div>
      `;
      return;
    }

    resources.forEach(res => {
      const card = document.createElement('a');
      card.className = 'resource-card';
      card.href = res.url;
      card.target = '_blank';
      card.rel = 'noopener noreferrer';

      let tagClass = 'gdrive';
      let icon = ICONS.DRIVE;
      if (res.category === 'figma') {
        tagClass = 'figma';
        icon = ICONS.FIGMA;
      } else if (res.category === 'zip') {
        tagClass = 'zip';
        icon = ICONS.ZIP;
      }

      card.innerHTML = `
        <div class="resource-card-info">
          <span class="resource-card-tag ${tagClass}">${icon} ${res.categoryLabel || 'RECURSO'}</span>
          <span class="resource-card-title" title="${res.name}">${res.name}</span>
        </div>
        <span class="resource-card-btn">ABRIR ${ICONS.EXTERNAL}</span>
      `;

      resourcesGrid.appendChild(card);
    });
  }

  // Toggle Lesson Completion
  function toggleLessonComplete(lessonId) {
    if (completedLessonIds.has(lessonId)) {
      completedLessonIds.delete(lessonId);
      showToast('Lección desmarcada');
    } else {
      completedLessonIds.add(lessonId);
      showToast('¡Lección marcada como completada!');
    }

    localStorage.setItem(STORAGE_KEY_PROGRESS, JSON.stringify(Array.from(completedLessonIds)));
    updateProgressUI();
    
    // Update checkmark in DOM
    const row = document.querySelector(`.lesson-row[data-id="${lessonId}"]`);
    if (row) {
      const isCompleted = completedLessonIds.has(lessonId);
      row.className = `lesson-row ${currentActiveLesson && currentActiveLesson.id === lessonId ? 'active' : ''} ${isCompleted ? 'completed' : ''}`;
      const checkBtn = row.querySelector('.lesson-check-btn');
      if (checkBtn) {
        checkBtn.className = `lesson-check-btn ${isCompleted ? 'completed' : ''}`;
        checkBtn.innerHTML = isCompleted ? ICONS.CHECK : '';
      }
    }

    if (currentActiveLesson && currentActiveLesson.id === lessonId) {
      const isCompleted = completedLessonIds.has(lessonId);
      if (btnMarkComplete) {
        btnMarkComplete.innerHTML = isCompleted ? `${ICONS.CHECK} COMPLETADA` : `<svg class="svg-icon" viewBox="0 0 24 24" style="stroke:#000;"><polyline points="20 6 9 17 4 12"></polyline></svg> MARCAR COMPLETADA`;
        btnMarkComplete.className = isCompleted ? 'btn-technical secondary' : 'btn-technical';
      }
    }
  }

  // Prev / Next Navigation
  function navigateLesson(direction) {
    if (!currentActiveLesson || allFlattenedLessons.length === 0) return;
    const currentIndex = allFlattenedLessons.findIndex(l => l.id === currentActiveLesson.id);
    if (currentIndex === -1) return;

    const nextIndex = currentIndex + direction;
    if (nextIndex >= 0 && nextIndex < allFlattenedLessons.length) {
      loadLesson(allFlattenedLessons[nextIndex]);
    }
  }

  // Reload course data dynamically (Local bridge first with Vercel/cloud fallback)
  async function reloadCourseData() {
    let jsCode = null;
    // 1. Try local companion bridge first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      const localRes = await fetch(`http://127.0.0.1:4545/studio/data/course-data.js?t=${Date.now()}`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (localRes.ok) {
        jsCode = await localRes.text();
      }
    } catch (e) {
      // Local bridge not reachable
    }

    // 2. Cloud fallback
    if (!jsCode) {
      try {
        const cloudRes = await fetch(`data/course-data.js?t=${Date.now()}`);
        if (cloudRes.ok) {
          jsCode = await cloudRes.text();
        }
      } catch (e) {
        console.warn('[Data Reload] Cloud fetch failed:', e);
      }
    }

    if (jsCode) {
      try {
        const executeData = new Function(jsCode);
        executeData();
        communitiesList = window.COMMUNITIES_DATA || [];
        populateCourseSelector(true);
        flattenLessons();
        updateProgressUI();
        return true;
      } catch (e) {
        console.warn('[Data Reload] Exec error:', e);
      }
    }
    return false;
  }

  // Live Drive Audit & Dynamic Catalog Synchronization
  async function syncWithGoogleDrive() {
    showToast('🔄 Sincronizando catálogo con Google Drive...');
    try {
      // 1. Refetch latest course data
      await reloadCourseData();

      // 2. Audit against local bridge
      const res = await fetch('http://127.0.0.1:4545/audit-course');
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.files) {
          const filesMap = data.files;
          let newlySynced = 0;

          allFlattenedLessons.forEach(les => {
            const isFound = Object.keys(filesMap).some(k => {
              const cleanK = k.replace(/^\d+_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
              const cleanT = (les.rawTitle || les.title).toLowerCase().replace(/[^a-z0-9]/g, '');
              if (cleanK.includes(cleanT) || cleanT.includes(cleanK)) {
                les.gdriveId = filesMap[k].id;
                les.inDrive = true;
                newlySynced++;
                return true;
              }
              return false;
            });
          });

          if (currentView === 'home') {
            renderCatalog();
          } else {
            renderTree(searchInput ? searchInput.value : '');
            if (currentActiveLesson) loadLesson(currentActiveLesson, true);
          }
          showToast(`⚡ Sincronización completa: ${data.totalVerified} videos y ${communitiesList.length} academias activas`);
          return;
        }
      }
      
      if (currentView === 'home') {
        renderCatalog();
      } else {
        renderTree(searchInput ? searchInput.value : '');
      }
      showToast(`⚡ Catálogo actualizado: ${communitiesList.length} academias detectadas`);
    } catch (e) {
      showToast('Servidor local bridge no detectado');
    }
  }

  // Toast Notification
  function showToast(message) {
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // Network & Companion Bridge Status Monitor
  async function updateNetworkAndBridgeStatus() {
    const networkBadge = document.getElementById('network-hud-badge');
    const statusBadge = document.getElementById('status-hud-badge');
    const offlineBanner = document.getElementById('app-offline-banner');

    const isOnline = navigator.onLine;
    if (networkBadge) {
      if (isOnline) {
        networkBadge.className = 'hud-pill lime';
        networkBadge.style.color = '';
        networkBadge.style.borderColor = '';
        networkBadge.innerHTML = '🌐 ONLINE';
        if (offlineBanner) offlineBanner.style.display = 'none';
      } else {
        networkBadge.className = 'hud-pill';
        networkBadge.style.color = '#ea580c';
        networkBadge.style.borderColor = '#ea580c';
        networkBadge.innerHTML = '📵 OFFLINE';
        if (offlineBanner) offlineBanner.style.display = 'block';
      }
    }

    if (isOnline) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1200);
        const res = await fetch('http://127.0.0.1:4545/status', { method: 'GET', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          if (statusBadge) {
            statusBadge.className = 'hud-pill cyan';
            statusBadge.style.color = '';
            statusBadge.innerHTML = `<svg class="svg-icon cyan" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg> MOTOR LOCAL ACTIVO`;
          }
          return;
        }
      } catch (e) {
        // Fallback to Cloud mode
      }
    }

    if (statusBadge) {
      statusBadge.className = 'hud-pill';
      statusBadge.style.color = 'var(--accent-cyan)';
      statusBadge.innerHTML = `<svg class="svg-icon" style="stroke:var(--accent-cyan); width:12px; height:12px;" viewBox="0 0 24 24"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg> GOOGLE DRIVE CLOUD`;
    }
  }

  // Setup Event Listeners
  function setupListeners() {
    if (btnNavHome) btnNavHome.addEventListener('click', () => switchView('home'));
    if (navBrandHome) navBrandHome.addEventListener('click', () => switchView('home'));

    if (headerCourseSelector) {
      headerCourseSelector.addEventListener('change', (e) => {
        const targetId = e.target.value;
        for (const comm of communitiesList) {
          const found = comm.courses.find(c => c.id === targetId);
          if (found) {
            selectCourse(found);
            break;
          }
        }
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderTree(e.target.value);
      });
    }

    if (btnCollapseAllModules) {
      btnCollapseAllModules.addEventListener('click', () => {
        const allCards = document.querySelectorAll('.module-card');
        const anyExpanded = Array.from(allCards).some(c => !c.classList.contains('collapsed'));
        allCards.forEach(c => {
          if (anyExpanded) c.classList.add('collapsed');
          else c.classList.remove('collapsed');
        });
      });
    }

    if (btnMarkComplete) {
      btnMarkComplete.addEventListener('click', () => {
        if (currentActiveLesson) {
          toggleLessonComplete(currentActiveLesson.id);
        }
      });
    }

    if (btnPrevLesson) btnPrevLesson.addEventListener('click', () => navigateLesson(-1));
    if (btnNextLesson) btnNextLesson.addEventListener('click', () => navigateLesson(1));

    if (btnSyncDrive) {
      btnSyncDrive.addEventListener('click', syncWithGoogleDrive);
    }

    // Network status listeners
    window.addEventListener('online', () => {
      updateNetworkAndBridgeStatus();
      showToast('🌐 Conexión restablecida');
    });
    window.addEventListener('offline', () => {
      updateNetworkAndBridgeStatus();
      showToast('📵 Modo sin conexión activado');
    });
    setInterval(updateNetworkAndBridgeStatus, 15000);

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowRight' || e.key === 'l') navigateLesson(1);
      if (e.key === 'ArrowLeft' || e.key === 'h') navigateLesson(-1);
    });
  }

  // Initialize App
  async function init() {
    await reloadCourseData();
    communitiesList = window.COMMUNITIES_DATA || [];
    const savedCourseId = localStorage.getItem(STORAGE_KEY_ACTIVE_COURSE);
    if (savedCourseId && communitiesList.length > 0) {
      for (const comm of communitiesList) {
        const found = comm.courses.find(c => c.id === savedCourseId);
        if (found) {
          currentCourse = found;
          break;
        }
      }
    }
    if (!currentCourse && communitiesList[0] && communitiesList[0].courses[0]) {
      currentCourse = communitiesList[0].courses[0];
    }

    populateCourseSelector(true);

    flattenLessons();
    updateProgressUI();
    setupListeners();
    updateNetworkAndBridgeStatus();

    if (currentCourse) {
      const courseSavedKey = STORAGE_KEY_LAST_LESSON_PREFIX + currentCourse.id;
      const savedLessonId = localStorage.getItem(courseSavedKey);
      const initialLesson = allFlattenedLessons.find(l => l.id === savedLessonId) || allFlattenedLessons[0];
      
      currentActiveLesson = initialLesson || null;
      renderTree();
      if (initialLesson) {
        loadLesson(initialLesson, true);
      }
    } else {
      renderTree();
    }

    // Default to Home / Academies & Courses Catalog view
    switchView('home');
  }

  // Run on DOM Ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

