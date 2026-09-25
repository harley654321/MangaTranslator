// Orquestador: extrae -> descarga -> sube -> dispara Actions -> polling ->
// baja artefacto -> traduce con el modelo del usuario -> abre lector traducido.
(() => {
  if (window.__mtOrchestrator) return;
  window.__mtOrchestrator = true;
  let busy = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function send(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (res) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        if (!res) return reject(new Error('Sin respuesta del background'));
        if (!res.ok) return reject(new Error(res.error || 'Error desconocido'));
        resolve(res);
      });
    });
  }

  function base64ToBlob(base64, mime) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  function base64ToUtf8(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  }

  async function pollRun(chapterId) {
    for (let i = 0; i < 240; i++) {
      await sleep(i < 12 ? 5000 : 10000);
      const st = await send({ type: 'MT_RUN_STATUS', chapterId });
      if (!st.found) { MT_UI.phase('Actions arrancando...'); continue; }
      if (st.status === 'completed') return st;
      const doneSteps = (st.steps || []).filter(s => s.conclusion === 'success').length;
      const total = (st.steps || []).length;
      const current = ((st.steps || []).find(s => s.status === 'in_progress') || {}).name || 'en cola';
      MT_UI.phase(`Actions: ${current}`);
      MT_UI.progress(30 + Math.round((doneSteps / Math.max(1, total)) * 40));
      if (st.status === 'completed') return st;
    }
    throw new Error('Timeout esperando a GitHub Actions (40 min)');
  }

  function downloadArtifact(chapterId, runId) {
    return new Promise((resolve, reject) => {
      const port = chrome.runtime.connect({ name: 'mt-artifact' });
      const files = {};
      let total = 0, received = 0, settled = false;
      port.onMessage.addListener((m) => {
        if (m.type === 'meta') { total = m.total; }
        else if (m.type === 'file') {
          files[m.name] = m.base64;
          received++;
          if (total) MT_UI.progress(70 + Math.round((received / total) * 10));
        } else if (m.type === 'done') { settled = true; port.disconnect(); resolve(files); }
        else if (m.type === 'error') { settled = true; port.disconnect(); reject(new Error(m.error)); }
      });
      port.onDisconnect.addListener(() => {
        if (!settled) reject(new Error('Conexion con background perdida al bajar el artefacto'));
      });
      port.postMessage({ chapterId, runId });
    });
  }

  function buildBundle(data, files) {
    const pages = [];
    for (const page of data.pages) {
      const b64 = files[page.file];
      if (!b64) continue;
      pages.push({
        blob: base64ToBlob(b64, 'image/png'),
        width: page.width,
        height: page.height,
        regions: page.regions || [],
        translations: [],
      });
    }
    if (!pages.length) throw new Error('El artefacto no contiene paginas');
    return { schema: data.schema, pages };
  }

  async function translateBundle(bundle) {
    for (let p = 0; p < bundle.pages.length; p++) {
      const page = bundle.pages[p];
      const texts = page.regions.map(r => (r.text || '').trim()).filter(Boolean);
      if (texts.length) {
        const res = await send({ type: 'MT_TRANSLATE_PAGE', texts });
        let k = 0;
        for (const region of page.regions) {
          page.translations.push((region.text || '').trim() ? res.translations[k++] : '');
        }
      } else {
        page.translations = page.regions.map(() => '');
      }
      MT_UI.progress(85 + Math.round(((p + 1) / bundle.pages.length) * 15));
      MT_UI.phase(`Traduciendo pagina ${p + 1}/${bundle.pages.length}`);
    }
  }

  function openReader(bundle) {
    const pages = bundle.pages.map(p => Object.assign({}, p, {
      blobUrl: URL.createObjectURL(p.blob),
    }));
    MT_READER.build(pages);
    window.scrollTo(0, 0);
  }

  async function run() {
    if (busy) return;
    busy = true;
    const cacheKey = location.href;
    try {
      const cached = await MT_CACHE.get(cacheKey);
      if (cached && cached.pages && cached.pages.length) {
        await MT_READER.loadFonts();
        openReader(cached);
        return;
      }

      MT_UI.show();
      MT_UI.phase('Extrayendo paginas del capitulo...');
      const ext = await MT_EXTRACTOR.extract();
      const urls = ext.urls;
      if (!urls.length) throw new Error('No se detectaron imagenes del capitulo en esta pagina');
      MT_UI.log(`Paginas detectadas: ${urls.length} (API:${ext.hookCount} DOM:${ext.domCount})`);

      const chapterId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      const prep = await send({ type: 'MT_PREPARE_BRANCH', chapterId });
      const branch = prep.branch;

      MT_UI.phase('Descargando y subiendo paginas...');
      let uploaded = 0;
      for (let i = 0; i < urls.length; i += 3) {
        const res = await send({ type: 'MT_DOWNLOAD_PAGES', urls: urls.slice(i, i + 3), referer: location.href });
        const pages = res.pages;
        for (let j = 0; j < pages.length; j += 4) {
          await send({ type: 'MT_UPLOAD_CHUNK', chapterId, branch, pages: pages.slice(j, j + 4) });
        }
        uploaded += pages.length;
        MT_UI.progress(5 + Math.round((uploaded / urls.length) * 25));
      }

      await send({ type: 'MT_DISPATCH', chapterId, branch });
      MT_UI.progress(30);
      const runInfo = await pollRun(chapterId);
      if (runInfo.conclusion !== 'success') {
        MT_UI.link(runInfo.htmlUrl);
        throw new Error('El workflow fallo en Actions (enlace en el panel)');
      }

      MT_UI.phase('Descargando capitulo procesado...');
      const files = await downloadArtifact(chapterId, runInfo.runId);
      const bundle = buildBundle(JSON.parse(base64ToUtf8(files['data.json'])), files);

      await translateBundle(bundle);
      await MT_READER.loadFonts();
      await MT_CACHE.put(cacheKey, bundle);
      openReader(bundle);
      MT_UI.done('Capitulo traducido');
      MT_UI.progress(100);

      send({ type: 'MT_CLEANUP', chapterId, runId: runInfo.runId }).catch(() => {});
    } catch (e) {
      MT_UI.error(e.message || String(e));
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'MT_START') run();
  });
  MT_UI.onFabClick(() => run());
})();
