// Punto de entrada MV3: enruta mensajes de content script y popup hacia los modulos.
importScripts(chrome.runtime.getURL('lib/jszip.min.js'));
importScripts('settings.js', 'github-api.js', 'openrouter.js');

const HANDLERS = {
  'MT_GET_SETTINGS': (msg) => getSettings().then(s => ({ ok: true, settings: s })),
  'MT_SAVE_SETTINGS': (msg) => saveSettings(msg.settings).then(() => ({ ok: true })),
  'MT_TEST_CONNECTION': (msg) => testConnection(msg.settings),
  'MT_DOWNLOAD_PAGES': (msg) => downloadPages(msg.urls, msg.referer),
  'MT_PREPARE_BRANCH': (msg) => prepareBranch(msg.chapterId),
  'MT_UPLOAD_CHUNK': (msg) => uploadPagesChunk(msg.chapterId, msg.branch, msg.pages),
  'MT_DISPATCH': (msg) => dispatchWorkflow(msg.chapterId, msg.branch),
  'MT_RUN_STATUS': (msg) => getRunStatus(msg.chapterId),
  'MT_TRANSLATE_PAGE': (msg) => translatePageTexts(msg.texts),
  'MT_CLEANUP': (msg) => cleanupChapter(msg.chapterId, msg.runId),
};

async function handleMessage(msg) {
  const handler = HANDLERS[msg && msg.type];
  if (!handler) throw new Error('Mensaje desconocido: ' + (msg && msg.type));
  return handler(msg);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: String((err && err.message) || err) }));
  return true;
});

// El artefacto (zip con las paginas limpias) se transmite por puerto, archivo por archivo,
// para no reventar el limite de mensajes y mantener viva al service worker.
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'mt-artifact') return;
  port.onMessage.addListener(first => streamArtifact(port, first));
});
