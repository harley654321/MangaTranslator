// Lector de reemplazo: tapa por completo el lector original (queda "muerto"),
// se auto-repara si el sitio intenta revivirlo y se cierra restaurando todo.
const MT_READER = (() => {
  let root = null, guard = null, prevOverflow = '';

  async function loadFonts() {
    const faces = [
      ['Comic Neue', chrome.runtime.getURL('fonts/ComicNeue-Regular.ttf')],
      ['Comic Neue Bold', chrome.runtime.getURL('fonts/ComicNeue-Bold.ttf')],
    ];
    await Promise.all(faces.map(async ([family, url]) => {
      try {
        const face = new FontFace(family, `url(${url})`);
        await face.load();
        document.fonts.add(face);
      } catch (e) {}
    }));
  }

  function buildToolbar() {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'sticky', top: '0', zIndex: '5', display: 'flex', gap: '10px',
      background: 'rgba(17,24,39,.95)', padding: '10px 14px',
      fontFamily: 'sans-serif', color: '#e5e7eb', alignItems: 'center',
    });
    const title = document.createElement('strong');
    title.textContent = 'Capitulo traducido';
    title.style.flex = '1';
    const textBtn = document.createElement('button');
    textBtn.textContent = 'Texto: ON';
    textBtn.style.cssText = 'background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 12px;font-size:13px';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Cerrar';
    closeBtn.style.cssText = 'background:#dc2626;color:#fff;border:0;border-radius:8px;padding:8px 12px;font-size:13px';
    bar.appendChild(title); bar.appendChild(textBtn); bar.appendChild(closeBtn);

    textBtn.addEventListener('click', () => {
      const layers = root.querySelectorAll('.mt-text-layer');
      const hidden = layers[0] && layers[0].style.display === 'none';
      layers.forEach(l => { l.style.display = hidden ? '' : 'none'; });
      textBtn.textContent = hidden ? 'Texto: ON' : 'Texto: OFF';
    });
    closeBtn.addEventListener('click', () => close());
    return bar;
  }

  function build(pages) {
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'mt-reader';
    Object.assign(root.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647',
      background: '#0b0f19', overflowY: 'auto', WebkitOverflowScrolling: 'touch',
      fontFamily: 'sans-serif',
    });
    root.appendChild(buildToolbar());

    for (const page of pages) {
      const wrapper = document.createElement('div');
      wrapper.className = 'mt-page';
      Object.assign(wrapper.style, { position: 'relative', display: 'block' });
      const img = document.createElement('img');
      img.src = page.blobUrl;
      Object.assign(img.style, { width: '100%', display: 'block', minHeight: '40px' });
      wrapper.appendChild(img);
      root.appendChild(wrapper);
      MT_LAYOUT.renderRegions(wrapper, page);
    }

    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.appendChild(root);

    // El lector viejo muere: si el sitio lo reinserta o borra nuestro nodo, lo volvemos a montar.
    guard = new MutationObserver(() => {
      if (!document.body.contains(root)) document.body.appendChild(root);
    });
    guard.observe(document.body, { childList: true, subtree: false });

    root.addEventListener('scroll', () => stopPageScrollBubbling(), { passive: true });
  }

  function stopPageScrollBubbling() { /* el overlay es su propio contenedor; el body queda bloqueado */ }

  function close() {
    if (guard) { guard.disconnect(); guard = null; }
    if (root) { root.remove(); root = null; }
    document.documentElement.style.overflow = prevOverflow;
  }

  return { build, close, loadFonts };
})();
