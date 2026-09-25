// UI en la pagina: boton flotante + panel de progreso con barra real.
const MT_UI = (() => {
  const Z = 2147483646;
  let fab = null, panel = null, label = null, barFill = null, logBox = null, onClickCb = null;

  function style(el, css) { Object.assign(el.style, css); }

  function ensure() {
    if (fab) return;
    fab = document.createElement('div');
    fab.id = 'mt-fab';
    fab.textContent = 'ES';
    fab.title = 'Traducir capitulo completo';
    style(fab, {
      position: 'fixed', bottom: '18px', right: '18px', zIndex: Z,
      width: '48px', height: '48px', borderRadius: '50%',
      background: '#2563eb', color: '#fff', fontSize: '15px', fontWeight: '700',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 14px rgba(0,0,0,.4)', cursor: 'pointer',
      fontFamily: 'sans-serif', userSelect: 'none', opacity: '0.92',
    });
    fab.addEventListener('click', () => { if (onClickCb) onClickCb(); });
    document.documentElement.appendChild(fab);

    panel = document.createElement('div');
    panel.id = 'mt-panel';
    style(panel, {
      position: 'fixed', bottom: '76px', right: '12px', zIndex: Z,
      width: '290px', maxWidth: 'calc(100vw - 24px)', borderRadius: '12px',
      background: '#111827', color: '#e5e7eb', fontFamily: 'sans-serif',
      boxShadow: '0 8px 30px rgba(0,0,0,.5)', padding: '12px', display: 'none',
    });
    panel.innerHTML =
      '<div id="mt-label" style="font-size:13px;font-weight:600;margin-bottom:8px"></div>' +
      '<div style="background:#374151;border-radius:6px;height:8px;overflow:hidden">' +
      '<div id="mt-bar" style="background:#2563eb;height:100%;width:0%;transition:width .4s"></div></div>' +
      '<div id="mt-log" style="font-size:11px;color:#9ca3af;margin-top:8px;max-height:110px;overflow:auto;white-space:pre-wrap"></div>' +
      '<div id="mt-link" style="margin-top:6px;font-size:11px;display:none"></div>';
    document.documentElement.appendChild(panel);

    label = panel.querySelector('#mt-label');
    barFill = panel.querySelector('#mt-bar');
    logBox = panel.querySelector('#mt-log');
  }

  return {
    onFabClick(cb) { ensure(); onClickCb = cb; },
    show() { ensure(); panel.style.display = 'block'; label.textContent = 'Preparando...'; barFill.style.width = '0%'; logBox.textContent = ''; },
    phase(text) { ensure(); panel.style.display = 'block'; label.textContent = text; },
    progress(pct) { ensure(); barFill.style.width = Math.max(0, Math.min(100, pct)) + '%'; },
    log(line) {
      ensure();
      logBox.textContent += line + '\n';
      logBox.scrollTop = logBox.scrollHeight;
    },
    link(url) { ensure(); const l = panel.querySelector('#mt-link'); l.innerHTML = '<a href="' + url + '" target="_blank" style="color:#60a5fa">' + url + '</a>'; l.style.display = 'block'; },
    done(text) { ensure(); label.textContent = text; barFill.style.width = '100%'; barFill.style.background = '#16a34a'; },
    error(text) {
      ensure(); panel.style.display = 'block'; label.textContent = 'Error: ' + text;
      barFill.style.background = '#dc2626';
    },
  };
})();
