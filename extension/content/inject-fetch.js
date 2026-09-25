// Corre en el mundo MAIN desde document_start: intercepta fetch/XHR del lector
// para capturar las URLs de TODAS las paginas sin hacer scroll, y fuerza el
// lazy-load (IntersectionObserver siempre "visible").
(function () {
  if (window.__mtHookInstalled) return;
  window.__mtHookInstalled = true;

  var IMG_RE = /\.(jpe?g|png|webp|avif)(\?|#|$)/i;
  var PATH_RE = /(manga|chapter|page|image|media|data|scan|webp|wp-content\/uploads)\//i;
  var captured = new Set();

  function post(urls) {
    var list = [];
    for (var i = 0; i < urls.length; i++) {
      if (!captured.has(urls[i])) { captured.add(urls[i]); list.push(urls[i]); }
    }
    if (list.length) {
      try { window.postMessage({ source: 'mt-hook', urls: list }, '*'); } catch (e) {}
    }
  }

  function looksLikeImage(str) {
    if (typeof str !== 'string' || str.length < 12 || str.length > 600) return false;
    if (str.indexOf('http') !== 0) return false;
    return IMG_RE.test(str) || (PATH_RE.test(str) && /\d/.test(str));
  }

  function scan(node, depth, out, seen) {
    if (!node || depth > 7 || out.length > 500) return;
    if (Array.isArray(node)) { for (var i = 0; i < node.length; i++) scan(node[i], depth + 1, out, seen); return; }
    if (typeof node === 'object') {
      for (var k in node) {
        if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
        scan(node[k], depth + 1, out, seen);
      }
      return;
    }
    if (typeof node === 'string' && looksLikeImage(node)) {
      var clean = node.split(' ')[0];
      if (!seen[clean]) { seen[clean] = 1; out.push(clean); }
    }
  }

  function processJson(text) {
    if (!text || text.length > 8e6) return;
    try {
      var json = JSON.parse(text);
      var out = [];
      scan(json, 0, out, {});
      if (out.length >= 1) post(out);
    } catch (e) {}
  }

  // --- fetch ---
  var originalFetch = window.fetch;
  if (originalFetch) {
    window.fetch = function () {
      var promise = originalFetch.apply(this, arguments);
      promise.then(function (res) {
        try {
          var ct = res.headers && res.headers.get && res.headers.get('content-type');
          if (ct && ct.indexOf('json') !== -1) {
            res.clone().text().then(processJson).catch(function () {});
          }
        } catch (e) {}
        return res;
      }).catch(function () {});
      return promise;
    };
  }

  // --- XMLHttpRequest ---
  var originalOpen = XMLHttpRequest.prototype.open;
  var originalSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__mtUrl = url;
    return originalOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    var xhr = this;
    xhr.addEventListener('load', function () {
      try {
        var ct = xhr.getResponseHeader && xhr.getResponseHeader('content-type');
        if (ct && ct.indexOf('json') !== -1) processJson(xhr.responseText);
      } catch (e) {}
    });
    return originalSend.apply(this, arguments);
  };

  // --- Lazy load: el lector cree que todo esta visible ---
  try {
    var OriginalIO = window.IntersectionObserver;
    if (OriginalIO) {
      window.IntersectionObserver = function (callback, options) {
        var wrapped = function (entries, observer) {
          var patched = entries.map(function (e) {
            return Object.assign({}, e, { isIntersecting: true, intersectionRatio: 1 });
          });
          callback(patched, observer);
        };
        return new OriginalIO(wrapped, options);
      };
      window.IntersectionObserver.prototype = OriginalIO.prototype;
    }
  } catch (e) {}
})();
