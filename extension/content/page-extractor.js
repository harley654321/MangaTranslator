// Extraccion de las URLs de todas las paginas del capitulo SIN scroll:
// 1) respuestas JSON capturadas por inject-fetch (API del lector)
// 2) datos embebidos (__NEXT_DATA__, window.mangaData, scripts inline)
// 3) imagenes del DOM (incluye data-src lazy)
const MT_EXTRACTOR = (() => {
  const IMG_RE = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
  const BAD_RE = /(logo|icon|avatar|sprite|banner|advert|favicon|button|social|share|ads?[-/]|emoji|flag)/i;
  const MAX_PAGES = 400;
  const captured = new Set();

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.source !== 'mt-hook' || !Array.isArray(e.data.urls)) return;
    for (const u of e.data.urls) captured.add(u);
  });

  function fromGlobals() {
    const urls = [];
    const candidates = [window.__NEXT_DATA__, window.mangaData, window._next_pages,
      window.__NUXT__, window.chapterData, window.readerData];
    for (const c of candidates) {
      if (!c) continue;
      try { collectStrings(JSON.stringify(c), urls); } catch (e) {}
    }
    return urls;
  }

  function fromScripts() {
    const urls = [];
    const scripts = document.querySelectorAll('script');
    for (const s of scripts) {
      const text = s.textContent || '';
      if (text.length < 50 || text.length > 3e6) continue;
      if (!/image|page|chapter|src|url/i.test(text)) continue;
      collectStrings(text, urls);
    }
    return urls;
  }

  function collectStrings(text, urls) {
    const re = /https?:\/\/[^\s"'()<>\\]+/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (IMG_RE.test(m[0])) urls.push(m[0]);
    }
  }

  function fromDom() {
    const urls = [];
    const imgs = document.querySelectorAll('img, source');
    for (const el of imgs) {
      const candidates = [el.currentSrc, el.src, el.getAttribute('data-src'),
        el.getAttribute('data-original'), el.getAttribute('data-lazy-src'),
        el.getAttribute('data-url'), el.getAttribute('data-echo')];
      const srcset = el.getAttribute('srcset') || el.getAttribute('data-srcset');
      for (const c of candidates) {
        if (c && typeof c === 'string' && IMG_RE.test(c)) { urls.push(c); break; }
      }
      if (srcset) {
        const best = srcset.split(',').map(s => s.trim().split(/\s+/))
          .sort((a, b) => (parseFloat((b[1] || '').replace('w', '')) || 0) - (parseFloat((a[1] || '').replace('w', '')) || 0));
        if (best[0] && IMG_RE.test(best[0][0])) urls.push(best[0][0]);
      }
    }
    return urls;
  }

  function normalize(urls) {
    const seen = new Set();
    const out = [];
    for (const raw of urls) {
      const url = String(raw).trim().split(' ')[0];
      if (!IMG_RE.test(url)) continue;
      if (BAD_RE.test(url)) continue;
      if (/^data:/.test(url)) continue;
      if (seen.has(url)) continue;
      seen.add(url);
      out.push(url);
      if (out.length >= MAX_PAGES) break;
    }
    return out;
  }

  function naturalSort(urls) {
    return urls.sort((a, b) => {
      let pa = a, pb = b;
      try { pa = new URL(a).pathname; pb = new URL(b).pathname; } catch (e) {}
      return pa.localeCompare(pb, undefined, { numeric: true, sensitivity: 'base' });
    });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function extract() {
    // Esperar a que lleguen respuestas tardias de la API del lector.
    await sleep(1500);
    const hookUrls = Array.from(captured);
    const merged = [].concat(hookUrls, fromGlobals(), fromScripts(), fromDom());
    const pages = naturalSort(normalize(merged));
    // Preferir las que llegaron por hook de API si hay mezcla rara de hosts
    const domOnly = naturalSort(normalize([].concat(fromGlobals(), fromScripts(), fromDom())));
    return { urls: pages.length ? pages : [], hookCount: hookUrls.length, domCount: domOnly.length };
  }

  return { extract };
})();
