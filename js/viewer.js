// A4TViewer – shows a PDF or picture on screen without downloading it.
// PDFs are drawn with PDF.js (Mozilla, Apache-2.0), loaded from this site only when first needed.
// Copy of the client portal viewer (portal/viewer.js in the website repo).
(function () {
  'use strict';
  var BASE = (document.currentScript && document.currentScript.getAttribute('data-pdfjs')) || './vendor/pdfjs-3.11.174/';
  var loading = null, MAX_PAGES = 40;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (loading) return loading;
    loading = new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = BASE + 'pdf.min.js';
      s.onload = function () { window.pdfjsLib.GlobalWorkerOptions.workerSrc = BASE + 'pdf.worker.min.js'; ok(window.pdfjsLib); };
      s.onerror = function () { loading = null; fail(new Error('viewer did not load')); };
      document.head.appendChild(s);
    });
    return loading;
  }
  function kind(blob, name) {
    var t = (blob && blob.type) || '', n = String(name || '').toLowerCase();
    if (t === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
    if (/^image\/(jpeg|png|webp|gif)$/.test(t) || /\.(jpe?g|png|webp|gif)$/.test(n)) return 'img';
    return 'other';
  }
  function note(box, text) { box.textContent = ''; var p = document.createElement('p'); p.className = 'viewer-note'; p.textContent = text; box.appendChild(p); }
  // Draws the document into box. L = labels { loading, cannot, page }.
  async function render(box, blob, name, L) {
    L = L || {};
    note(box, L.loading || 'Loading preview…');
    var k = kind(blob, name);
    if (k === 'img') {
      var img = document.createElement('img'); img.className = 'viewer-img'; img.alt = name || '';
      var u; try { u = URL.createObjectURL(blob); } catch (e) { note(box, L.cannot || 'This file cannot be shown here. Please download it.'); return false; }
      img.onload = function () { setTimeout(function () { URL.revokeObjectURL(u); }, 1000); };
      img.onerror = function () { note(box, L.cannot || 'This file cannot be shown here. Please download it.'); };
      img.src = u; box.textContent = ''; box.appendChild(img); return true;
    }
    if (k !== 'pdf') { note(box, L.cannot || 'This file cannot be shown here. Please download it.'); return false; }
    try {
      var lib = await loadPdfJs();
      var pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false, disableFontFace: false }).promise;
      box.textContent = '';
      var width = Math.min(900, Math.max(280, box.clientWidth - 16)), ratio = Math.min(window.devicePixelRatio || 1, 2);
      var n = Math.min(pdf.numPages, MAX_PAGES);
      for (var i = 1; i <= n; i++) {
        var page = await pdf.getPage(i), v1 = page.getViewport({ scale: 1 }), scale = width / v1.width, vp = page.getViewport({ scale: scale * ratio });
        var c = document.createElement('canvas'); c.className = 'viewer-page'; c.width = vp.width; c.height = vp.height;
        c.style.width = Math.floor(vp.width / ratio) + 'px'; c.setAttribute('role', 'img'); c.setAttribute('aria-label', (L.page || 'Page {n}').replace('{n}', i));
        box.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
      if (pdf.numPages > n) note(box.appendChild(document.createElement('div')), (L.more || 'Only the first {n} pages are shown. Download the file to see all of it.').replace('{n}', n));
      return true;
    } catch (e) { note(box, L.cannot || 'This file cannot be shown here. Please download it.'); return false; }
  }
  // Full-screen viewer. opts = { name, labels: { close, download, ... }, onDownload }
  var last = null;
  function open(blob, opts) {
    close();
    opts = opts || {}; var L = opts.labels || {};
    var wrap = document.createElement('div'); wrap.className = 'viewer-overlay'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', opts.name || 'Document');
    var bar = document.createElement('div'); bar.className = 'viewer-bar';
    var t = document.createElement('b'); t.textContent = opts.name || ''; bar.appendChild(t);
    var acts = document.createElement('span'); acts.className = 'viewer-acts';
    if (opts.onDownload) { var d = document.createElement('button'); d.type = 'button'; d.className = 'btn btn-out btn-sm'; d.textContent = L.download || 'Download'; d.onclick = opts.onDownload; acts.appendChild(d); }
    var x = document.createElement('button'); x.type = 'button'; x.className = 'btn btn-sm'; x.textContent = L.close || 'Close'; x.onclick = close; acts.appendChild(x);
    bar.appendChild(acts); wrap.appendChild(bar);
    var body = document.createElement('div'); body.className = 'viewer-body'; wrap.appendChild(body);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    last = { el: wrap, focus: document.activeElement };
    document.body.appendChild(wrap); document.body.classList.add('viewer-open'); x.focus();
    render(body, blob, opts.name, L);
  }
  function close() { if (!last) return; last.el.remove(); document.body.classList.remove('viewer-open'); try { last.focus && last.focus.focus(); } catch (_) {} last = null; }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && last) close(); });
  window.A4TViewer = { open: open, close: close, render: render, kind: kind };
})();
