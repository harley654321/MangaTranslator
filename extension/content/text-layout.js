// Render de un bloque de texto traducido sobre la pagina limpia,
// con auto-ajuste de tamano de fuente al tamano de la burbuja.
const MT_LAYOUT = (() => {
  function outlineShadow(bg) {
    const c = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    const offsets = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
    return offsets.map(o => `${o[0]}px ${o[1]}px 0 ${c}`).join(', ');
  }

  function regionDiv(page, region, translation, pageW, pageH) {
    const [x1, y1, x2, y2] = region.bbox;
    const el = document.createElement('div');
    el.className = 'mt-text';
    Object.assign(el.style, {
      position: 'absolute',
      left: (x1 / pageW * 100) + '%',
      top: (y1 / pageH * 100) + '%',
      maxWidth: ((x2 - x1) / pageW * 100 + 1) + '%',
      maxHeight: ((y2 - y1) / pageH * 100 + 2) + '%',
      color: `rgb(${region.fg[0]},${region.fg[1]},${region.fg[2]})`,
      textShadow: outlineShadow(region.bg),
      fontFamily: '"Comic Neue", "Comic Sans MS", sans-serif',
      fontWeight: '700',
      textAlign: 'center',
      whiteSpace: 'pre-wrap',
      overflow: 'hidden',
      padding: '1px 2px',
      lineHeight: '1.05',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      writingMode: region.vertical ? 'vertical-rl' : 'horizontal-tb',
    });
    el.textContent = translation || '';
    return el;
  }

  function fits(el, maxW, maxH) {
    return el.scrollHeight <= maxH + 3 && el.scrollWidth <= maxW + 3;
  }

  function autoFit(el) {
    const maxW = el.parentElement.clientWidth;
    const maxH = el.parentElement.clientHeight;
    const boxH = parseFloat(el.style.maxHeight); // respeta el % del contenedor
    const boxW = parseFloat(el.style.maxWidth);
    let size = Math.max(11, Math.min(30, Math.round(boxH / 2.4)));
    el.style.fontSize = size + 'px';
    while (size > 9 && !fits(el, boxW, boxH)) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
    void maxW; void maxH;
  }

  function renderRegions(wrapper, page) {
    const { width, height, regions, translations } = page;
    const layer = document.createElement('div');
    layer.className = 'mt-text-layer';
    Object.assign(layer.style, { position: 'absolute', inset: '0', zIndex: '2' });
    regions.forEach((region, i) => {
      const el = regionDiv(page, region, translations ? translations[i] : '', width, height);
      layer.appendChild(el);
    });
    wrapper.appendChild(layer);
    layer.querySelectorAll('.mt-text').forEach(el => autoFit(el));
  }

  return { renderRegions };
})();
