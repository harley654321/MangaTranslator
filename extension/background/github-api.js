// Toda la API de GitHub vive aqui. Sube paginas a una rama temporal, dispara Actions,
// hace polling y baja el artefacto. Sin servicios de terceros (nada de file.io).
const GH_API = 'https://api.github.com';

function repoPath(settings, suffix) {
  return `/repos/${settings.owner}/${settings.repo}${suffix || ''}`;
}

async function ghFetch(settings, path, options = {}) {
  const opts = Object.assign({}, options, {
    headers: Object.assign({
      'Authorization': 'Bearer ' + settings.pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    }, options.headers || {}),
  });
  const res = await fetch(GH_API + path, opts);
  if (!res.ok) {
    let detail = res.status + ' ' + res.statusText;
    try { const body = await res.json(); if (body.message) detail = body.message; } catch (e) {}
    throw new Error('GitHub: ' + detail);
  }
  return res;
}

async function ghJson(settings, path, options = {}) {
  const opts = Object.assign({}, options, {
    headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
  });
  const res = await ghFetch(settings, path, opts);
  if (res.status === 204) return null;
  return res.json();
}

async function testConnection(overrides) {
  const settings = Object.assign(await getSettings(), overrides || {});
  if (!settings.pat || !settings.owner || !settings.repo) {
    throw new Error('Completa PAT, owner y repo antes de probar.');
  }
  const repo = await ghJson(settings, repoPath(settings));
  const me = await ghJson(settings, '/user');
  return { ok: true, message: `OK: ${repo.full_name} como ${me.login}` };
}

function branchName(chapterId) { return 'incoming/' + chapterId; }

async function prepareBranch(chapterId) {
  const settings = await getSettings();
  const branch = branchName(chapterId);
  try {
    await ghJson(settings, repoPath(settings, `/git/ref/heads/${branch}`));
  } catch (e) {
    // La rama no existe: crearla desde main.
    let base = null;
    try { base = await ghJson(settings, repoPath(settings, '/git/ref/heads/main')); }
    catch (e2) { base = await ghJson(settings, repoPath(settings, '/git/ref/heads/master')); }
    await ghJson(settings, repoPath(settings, '/git/refs'), {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: base.object.sha }),
    });
  }
  return { ok: true, branch };
}

async function headCommit(settings, branch) {
  const ref = await ghJson(settings, repoPath(settings, `/git/ref/heads/${branch}`));
  const commit = await ghJson(settings, repoPath(settings, `/git/commits/${ref.object.sha}`));
  return { commitSha: commit.sha, treeSha: commit.tree.sha };
}

async function uploadPagesChunk(chapterId, branch, pages) {
  const settings = await getSettings();
  const tree = [];
  for (const page of pages) {
    const blob = await ghJson(settings, repoPath(settings, '/git/blobs'), {
      method: 'POST',
      body: JSON.stringify({ content: page.base64, encoding: 'base64' }),
    });
    tree.push({ path: 'pages/' + page.name, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const head = await headCommit(settings, branch);
  const newTree = await ghJson(settings, repoPath(settings, '/git/trees'), {
    method: 'POST',
    body: JSON.stringify({ base_tree: head.treeSha, tree: tree }),
  });
  const commit = await ghJson(settings, repoPath(settings, '/git/commits'), {
    method: 'POST',
    body: JSON.stringify({
      message: `paginas ${pages[0].name}..${pages[pages.length - 1].name}`,
      tree: newTree.sha,
      parents: [head.commitSha],
    }),
  });
  await ghJson(settings, repoPath(settings, `/git/refs/heads/${branch}`), {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: true }),
  });
  return { ok: true, commitSha: commit.sha, uploaded: pages.length };
}

async function dispatchWorkflow(chapterId, branch) {
  const settings = await getSettings();
  // Se dispara desde main para que el cache de modelos quede en la rama default
  // y sea visible para TODOS los capitulos (regla de scope de caches de GitHub).
  await ghJson(settings, repoPath(settings, '/actions/workflows/translate.yml/dispatches'), {
    method: 'POST',
    body: JSON.stringify({ ref: 'main', inputs: { chapter_id: chapterId, branch: branch } }),
  });
  return { ok: true };
}

async function getRunStatus(chapterId) {
  const settings = await getSettings();
  const data = await ghJson(settings,
    repoPath(settings, '/actions/workflows/translate.yml/runs?per_page=30'));
  const run = (data.workflow_runs || []).find(r => r.name === 'chapter-' + chapterId);
  if (!run) return { ok: true, found: false };
  const jobs = await ghJson(settings, repoPath(settings, `/actions/runs/${run.id}/jobs`));
  const steps = ((jobs.jobs || [])[0] || {}).steps || [];
  return {
    ok: true,
    found: true,
    runId: run.id,
    status: run.status,
    conclusion: run.conclusion,
    htmlUrl: run.html_url,
    steps: steps.map(s => ({ name: s.name, status: s.status, conclusion: s.conclusion })),
  };
}

function extFromResponse(url, contentType) {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  if (ct.includes('avif')) return 'avif';
  if (ct.includes('jpeg')) return 'jpg';
  const m = url.match(/\.(jpe?g|png|webp|avif)(\?|#|$)/i);
  return m ? m[1].toLowerCase().replace('jpeg', 'jpg') : 'jpg';
}

function blobToBase64(blob) {
  return blob.arrayBuffer().then(buf => {
    const bytes = new Uint8Array(buf);
    let binary = '';
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(binary);
  });
}

async function downloadPages(urls, referer) {
  const pages = [];
  for (let i = 0; i < urls.length; i++) {
    let res;
    try {
      res = await fetch(urls[i], { credentials: 'include', referrer: referer || undefined });
    } catch (e) {
      res = await fetch(urls[i], { credentials: 'include' });
    }
    if (!res.ok) throw new Error(`Descarga fallo (${res.status}) en ${urls[i]}`);
    const blob = await res.blob();
    pages.push({
      name: String(i + 1).padStart(3, '0') + '.' + extFromResponse(urls[i], blob.type),
      base64: await blobToBase64(blob),
    });
  }
  return { ok: true, pages };
}

async function findArtifact(settings, chapterId, runId) {
  const data = await ghJson(settings, repoPath(settings, `/actions/runs/${runId}/artifacts`));
  const art = (data.artifacts || []).find(a => a.name === 'chapter-' + chapterId);
  if (!art) throw new Error('Artefacto no encontrado (chapter-' + chapterId + ')');
  return art;
}

async function streamArtifact(port, msg) {
  try {
    const settings = await getSettings();
    const art = await findArtifact(settings, msg.chapterId, msg.runId);
    const res = await ghFetch(settings, repoPath(settings, `/actions/artifacts/${art.id}/zip`));
    const zip = await JSZip.loadAsync(await res.arrayBuffer());
    const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
    port.postMessage({ type: 'meta', total: names.length });
    for (const name of names) {
      const base64 = await zip.files[name].async('base64');
      port.postMessage({ type: 'file', name: name.replace(/^out\//, ''), base64: base64 });
    }
    port.postMessage({ type: 'done' });
  } catch (e) {
    port.postMessage({ type: 'error', error: String((e && e.message) || e) });
  }
}

async function cleanupChapter(chapterId, runId) {
  const settings = await getSettings();
  try {
    const art = await findArtifact(settings, chapterId, runId);
    await ghFetch(settings, repoPath(settings, `/actions/artifacts/${art.id}`), { method: 'DELETE' });
  } catch (e) { /* el artefacto ya expira solo (retention 1 dia) */ }
  return { ok: true };
}
