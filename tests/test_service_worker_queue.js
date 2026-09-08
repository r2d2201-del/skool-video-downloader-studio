const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');


function eventSlot() {
  return {
    listeners: [],
    addListener(callback) {
      this.listeners.push(callback);
    },
  };
}


function createWorkerContext() {
  const persisted = new Map();
  const posted = [];
  const resolvedLessonIds = [];
  const portMessages = eventSlot();
  const portDisconnect = eventSlot();
  const port = {
    onMessage: portMessages,
    onDisconnect: portDisconnect,
    postMessage(message) {
      posted.push(JSON.parse(JSON.stringify(message)));
      if (message.action === 'DOWNLOAD') {
        setImmediate(() => portMessages.listeners[0]({ type: 'TASK_START', taskId: message.id }));
        setImmediate(() => portMessages.listeners[0]({ type: 'TASK_COMPLETED', taskId: message.id, gdriveId: `drive-${message.id}` }));
      } else if (message.action === 'SYNC_CLOUD') {
        setImmediate(() => portMessages.listeners[0]({ type: 'CLOUD_SYNC_COMPLETED', noChanges: false }));
      }
    },
  };

  const chrome = {
    runtime: {
      lastError: null,
      onInstalled: eventSlot(),
      onMessage: eventSlot(),
      connectNative() {
        return port;
      },
    },
    tabs: {
      onRemoved: eventSlot(),
      async sendMessage(_tabId, message) {
        resolvedLessonIds.push(message.targetMd);
        return { success: true, directVideoUrl: `https://stream.mux.com/${message.targetMd}.m3u8?token=secret` };
      },
    },
    webRequest: { onBeforeRequest: eventSlot() },
    contextMenus: { create() {} },
    storage: {
      local: {
        async get(key) {
          return { [key]: persisted.get(key) };
        },
        async set(values) {
          for (const [key, value] of Object.entries(values)) {
            persisted.set(key, JSON.parse(JSON.stringify(value)));
          }
        },
      },
      session: {
        async get() { return {}; },
        async set() {},
        async remove() {},
      },
    },
    action: {
      async setBadgeText() {},
      async setBadgeBackgroundColor() {},
    },
    downloads: { async download() { return 1; } },
    notifications: { create() {} },
  };

  const context = vm.createContext({ chrome, console, fetch, URL, setImmediate, setTimeout, clearTimeout });
  const workerPath = path.join(__dirname, '..', 'service-worker.js');
  vm.runInContext(fs.readFileSync(workerPath, 'utf8'), context, { filename: workerPath });
  return { context, persisted, posted, resolvedLessonIds };
}


async function waitUntil(predicate, timeoutMs = 1000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for worker queue');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}


test('native queue forwards quality, runs sequentially, and waits for manual cloud sync', async () => {
  const { context, persisted, posted, resolvedLessonIds } = createWorkerContext();
  const items = [1, 2].map(index => ({
    id: `lesson-${index}`,
    type: 'video',
    url: `https://www.skool.com/community/classroom/course?md=lesson-${index}`,
    title: `Lección ${index}`,
    quality: '720',
    duplicatePolicy: 'replace',
    existingGdriveId: `old-drive-${index}`,
    context: { lessonId: `lesson-${index}` },
  }));
  context.__testMessage = {
    items,
    tabId: 42,
    storageMode: 'gdrive',
    gdriveRoot: 'Skool Downloads',
    gdriveRootId: 'root-folder-id-12345',
    folder: 'Documentos/Skool_Downloads',
  };

  const started = await vm.runInContext('startNativeDownloadJob(__testMessage)', context);
  assert.equal(started.success, true);
  await waitUntil(() => vm.runInContext('publicDownloadJob().status', context) === 'completed');

  assert.deepEqual(resolvedLessonIds, ['lesson-1', 'lesson-2']);
  assert.deepEqual(posted.map(message => message.action), ['DOWNLOAD', 'DOWNLOAD']);
  assert.match(posted[0].url, /lesson-1\.m3u8\?token=secret/);
  assert.match(posted[1].url, /lesson-2\.m3u8\?token=secret/);
  assert.equal(posted[0].quality, '720');
  assert.equal(posted[0].duplicatePolicy, 'replace');
  assert.equal(posted[0].existingGdriveId, 'old-drive-1');
  assert.equal(posted[0].gdriveRootId, 'root-folder-id-12345');

  const savedJob = persisted.get('nativeDownloadJob');
  assert.equal(savedJob.completed, 2);
  assert.equal(savedJob.failed, 0);
  assert.equal(savedJob.cloudSync, 'deferred');
  assert.equal(Object.hasOwn(savedJob, 'items'), false);
  assert.doesNotMatch(JSON.stringify(savedJob), /token=secret/);

  const manualSync = await vm.runInContext('forceNativeCloudSync()', context);
  assert.equal(manualSync.success, true);
  await waitUntil(() => posted.some(message => message.action === 'SYNC_CLOUD'));
  await waitUntil(() => vm.runInContext('publicDownloadJob().status', context) === 'completed');
  assert.equal(posted.filter(message => message.action === 'SYNC_CLOUD').length, 1);
});
