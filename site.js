/* OOBE IT site: tile system, service glyphs, explorer, nav, contact helpers */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Brand tile palette (from the OOBE pattern) */
  var C = {
    orange: '#F19828', flame: '#F2652A', gold: '#F0B030',
    navy: '#0E2A47', blue: '#0072B5', mid: '#0A9AD6', sky: '#1EB4EF', light: '#8ED6F5',
    white: '#FFFFFF'
  };
  var warmSet = [C.gold, C.orange, C.flame];
  var coolSet = [C.light, C.sky, C.mid, C.blue, C.navy];

  /* ---------- seeded random ---------- */
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }

  /* ---------- tile drawing (canvas) ----------
     Each tile is drawn in a unit cell (0..1) after transform. Shapes carry meaning:
     sq = hardware / block, q = signal & coverage arc, ring = node, dot = endpoint,
     fan = load / gauge, arcs = layered copies, split = virtualised host. */
  function drawTile(ctx, t, s) {
    var h = s / 2;
    ctx.save();
    ctx.translate(h, h);
    ctx.rotate(t.rot);
    ctx.translate(-h, -h);
    switch (t.type) {
      case 'sq':
        ctx.fillStyle = t.c; ctx.fillRect(0, 0, s, s); break;
      case 'q':
        ctx.fillStyle = t.c; ctx.beginPath(); ctx.moveTo(0, s); ctx.arc(0, s, s, -Math.PI / 2, 0); ctx.closePath(); ctx.fill(); break;
      case 'qbg':
        ctx.fillStyle = t.bg; ctx.fillRect(0, 0, s, s);
        ctx.fillStyle = t.c; ctx.beginPath(); ctx.moveTo(0, s); ctx.arc(0, s, s, -Math.PI / 2, 0); ctx.closePath(); ctx.fill(); break;
      case 'arcs':
        var set = t.warm ? warmSet.slice().reverse() : coolSet.slice(0, 4).reverse();
        for (var i = 0; i < set.length; i++) {
          var r = s * (1 - i * (0.78 / set.length));
          ctx.fillStyle = set[i]; ctx.beginPath(); ctx.moveTo(0, s); ctx.arc(0, s, r, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = t.hole; ctx.beginPath(); ctx.moveTo(0, s); ctx.arc(0, s, s * 0.22, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
        break;
      case 'ring':
        if (t.bg) { ctx.fillStyle = t.bg; ctx.fillRect(0, 0, s, s); }
        ctx.fillStyle = t.c; ctx.beginPath(); ctx.arc(h, h, s * 0.34, 0, Math.PI * 2); ctx.arc(h, h, s * 0.14, 0, Math.PI * 2, true); ctx.fill('evenodd'); break;
      case 'dot':
        if (t.bg) { ctx.fillStyle = t.bg; ctx.fillRect(0, 0, s, s); }
        ctx.fillStyle = t.c; ctx.beginPath(); ctx.arc(h, h, s * 0.3, 0, Math.PI * 2); ctx.fill(); break;
      case 'fan':
        var n = t.n || 6, p = t.fill == null ? 1 : t.fill;
        for (var k = 0; k < n; k++) {
          if (k / n >= p) break;
          var a0 = -Math.PI / 2 + (Math.PI / 2) * (k / n), a1 = -Math.PI / 2 + (Math.PI / 2) * ((k + 1) / n);
          ctx.fillStyle = coolSet[k % coolSet.length];
          if (t.warmTip && k === 0) ctx.fillStyle = C.flame;
          ctx.beginPath(); ctx.moveTo(0, s); ctx.arc(0, s, s, a0, a1 + 0.005); ctx.closePath(); ctx.fill();
        }
        break;
      case 'split':
        ctx.fillStyle = t.c; ctx.fillRect(0, 0, h - 2, h - 2);
        ctx.fillStyle = t.c2; ctx.fillRect(h + 2, 0, h - 2, h - 2);
        ctx.fillStyle = t.c2; ctx.fillRect(0, h + 2, h - 2, h - 2);
        ctx.fillStyle = t.c; ctx.fillRect(h + 2, h + 2, h - 2, h - 2); break;
    }
    ctx.restore();
  }

  function makeTile(r, i) {
    var x = r();
    var rot = Math.floor(r() * 4) * Math.PI / 2;
    var t;
    if (x < 0.22) t = { type: 'empty' };
    else if (x < 0.36) t = { type: 'sq', c: [C.navy, C.light, C.sky, C.orange, C.white][Math.floor(r() * 5)] };
    else if (x < 0.55) t = { type: 'q', c: [C.orange, C.sky, C.light, C.blue, C.navy, C.flame][Math.floor(r() * 6)] };
    else if (x < 0.63) t = { type: 'qbg', c: C.light, bg: [C.navy, C.blue][Math.floor(r() * 2)] };
    else if (x < 0.71) t = { type: 'arcs', warm: r() > 0.5 };
    else if (x < 0.80) t = { type: 'ring', c: [C.sky, C.navy, C.white][Math.floor(r() * 3)], bg: r() > 0.6 ? C.navy : null };
    else if (x < 0.87) t = { type: 'dot', c: [C.flame, C.navy, C.mid][Math.floor(r() * 3)] };
    else if (x < 0.95) t = { type: 'fan', n: 6 + Math.floor(r() * 4), warmTip: r() > 0.5, live: true };
    else t = { type: 'split', c: C.blue, c2: C.sky };
    if (t.type === 'ring' && t.c === C.white && !t.bg) t.bg = C.navy;
    t.rot = rot; t.target = rot; t.i = i;
    return t;
  }

  /* ---------- Tile field: assembles from scattered to ordered ---------- */
  function TileField(canvas) {
    var ctx = canvas.getContext('2d');
    var tiles = [], cols = 6, rows = 6, cell = 80, dpr = 1, start = 0, hole = '#E6E7E8', ground = '#E6E7E8';
    var seed = parseInt(canvas.getAttribute('data-seed') || '7', 10);
    var mouse = null;

    function readTheme() {
      var cs = getComputedStyle(canvas);
      ground = cs.getPropertyValue('--tile-ground').trim() || '#E6E7E8';
      hole = ground;
    }

    function layout() {
      var rect = canvas.getBoundingClientRect();
      var w = Math.max(240, rect.width);
      cols = parseInt(canvas.getAttribute('data-cols') || '6', 10);
      if (w < 520) cols = Math.max(5, cols - 1);
      cell = w / cols;
      rows = Math.max(3, Math.round((rect.height || w) / cell));
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(rows * cell * dpr);
      canvas.style.height = (rows * cell) + 'px';
      var r = rng(seed);
      tiles = [];
      for (var i = 0; i < cols * rows; i++) {
        var t = makeTile(r, i);
        t.cx = i % cols; t.cy = Math.floor(i / cols);
        // scattered start: offset, tilted, smaller
        t.ox = (r() - 0.5) * cell * 1.4; t.oy = (r() - 0.5) * cell * 1.4;
        t.r0 = (r() - 0.5) * Math.PI * 1.2;
        var dx = t.cx - cols * 0.3, dy = t.cy - rows * 0.6;
        t.delay = Math.sqrt(dx * dx + dy * dy) * 70 + r() * 160;
        if (t.type === 'arcs') t.hole = hole;
        if (t.type === 'fan') { t.fill = 1; t.phase = r() * 6; }
        tiles.push(t);
      }
      start = performance.now();
    }

    function ease(x) { return 1 - Math.pow(1 - x, 4); }

    function frame(now) {
      var w = canvas.width / dpr, h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = ground; ctx.fillRect(0, 0, w, h);
      var elapsed = now - start;
      for (var i = 0; i < tiles.length; i++) {
        var t = tiles[i];
        if (t.type === 'empty') continue;
        var p = reduce ? 1 : Math.min(1, Math.max(0, (elapsed - t.delay) / 900));
        var e = ease(p);
        // settle rotation toward target
        t.rot += (t.target - t.rot) * (reduce ? 1 : 0.12);
        if (t.type === 'fan' && t.live && !reduce && p >= 1) {
          t.fill = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now / 1400 + t.phase));
        }
        var x = t.cx * cell + t.ox * (1 - e), y = t.cy * cell + t.oy * (1 - e);
        var sc = 0.55 + 0.45 * e;
        ctx.save();
        ctx.globalAlpha = 0.25 + 0.75 * e;
        ctx.translate(x + cell / 2, y + cell / 2);
        ctx.rotate(t.r0 * (1 - e));
        ctx.scale(sc, sc);
        ctx.translate(-cell / 2, -cell / 2);
        drawTile(ctx, t, cell + 0.5);
        ctx.restore();
      }
      if (!reduce) requestAnimationFrame(frame);
    }

    // idle life: a healthy system keeps ticking
    function tick() {
      if (reduce || document.hidden) return;
      var pool = tiles.filter(function (t) { return t.type === 'q' || t.type === 'qbg' || t.type === 'arcs' || t.type === 'split'; });
      if (!pool.length) return;
      var t = pool[Math.floor(Math.random() * pool.length)];
      t.target += Math.PI / 2;
    }

    canvas.addEventListener('pointermove', function (ev) {
      var r = canvas.getBoundingClientRect();
      var cx = Math.floor((ev.clientX - r.left) / cell), cy = Math.floor((ev.clientY - r.top) / cell);
      var key = cx + ',' + cy;
      if (mouse === key) return;
      mouse = key;
      var t = tiles[cy * cols + cx];
      if (t && t.type !== 'empty' && t.type !== 'dot' && t.type !== 'ring') t.target += Math.PI / 2;
    });
    canvas.addEventListener('pointerleave', function () { mouse = null; });

    readTheme(); layout();
    requestAnimationFrame(frame);
    if (!reduce) setInterval(tick, 1300);
    var rt, lastW = canvas.getBoundingClientRect().width;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var w = canvas.getBoundingClientRect().width;
        if (Math.abs(w - lastW) < 2) return;
        lastW = w; layout(); start -= 5000; if (reduce) requestAnimationFrame(frame);
      }, 150);
    });
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onTheme = function () { readTheme(); tiles.forEach(function (t) { if (t.type === 'arcs') t.hole = hole; }); if (reduce) requestAnimationFrame(frame); };
    if (mq.addEventListener) mq.addEventListener('change', onTheme);
    new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  document.querySelectorAll('canvas.tilefield').forEach(function (c) { TileField(c); });

  /* ---------- Service glyphs: 2x2 tiles, SVG ----------
     Built from the same shape vocabulary so icons and pattern are one system. */
  function cellSVG(x, y, s, spec) {
    var type = spec[0], c = spec[1], rot = spec[2] || 0;
    var cx = x + s / 2, cy = y + s / 2;
    var g = '<g transform="rotate(' + rot + ' ' + cx + ' ' + cy + ')">';
    if (type === 'sq') g += '<rect x="' + x + '" y="' + y + '" width="' + s + '" height="' + s + '" fill="' + c + '"/>';
    else if (type === 'q') g += '<path d="M' + x + ' ' + (y + s) + ' L' + x + ' ' + y + ' A' + s + ' ' + s + ' 0 0 1 ' + (x + s) + ' ' + (y + s) + ' Z" fill="' + c + '"/>';
    else if (type === 'ring') g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (s * 0.3) + '" fill="none" stroke="' + c + '" stroke-width="' + (s * 0.18) + '"/>';
    else if (type === 'dot') g += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (s * 0.28) + '" fill="' + c + '"/>';
    else if (type === 'arc') g += '<path d="M' + x + ' ' + (y + s) + ' L' + x + ' ' + y + ' A' + s + ' ' + s + ' 0 0 1 ' + (x + s) + ' ' + (y + s) + ' Z" fill="' + c + '"/><path d="M' + x + ' ' + (y + s) + ' L' + x + ' ' + (y + s * 0.45) + ' A' + (s * 0.55) + ' ' + (s * 0.55) + ' 0 0 1 ' + (x + s * 0.55) + ' ' + (y + s) + ' Z" fill="' + (spec[3] || C.gold) + '"/>';
    else if (type === 'fan') {
      var n = 4;
      for (var i = 0; i < n; i++) {
        var a0 = -90 + 90 * i / n, a1 = -90 + 90 * (i + 1) / n;
        var p0 = [x + s * Math.cos(a0 * Math.PI / 180), y + s + s * Math.sin(a0 * Math.PI / 180)];
        var p1 = [x + s * Math.cos(a1 * Math.PI / 180), y + s + s * Math.sin(a1 * Math.PI / 180)];
        g += '<path d="M' + x + ' ' + (y + s) + ' L' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A' + s + ' ' + s + ' 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z" fill="' + [C.light, C.sky, C.blue, C.navy][i] + '"/>';
      }
    }
    return g + '</g>';
  }
  var GLYPHS = {
    // IT consulting: blueprint block + a single orange decision arc
    it:       [['sq', C.navy], ['q', C.orange, 90], ['ring', C.sky], ['sq', C.blue]],
    // Cloud: coverage arcs meeting overhead
    cloud:    [['q', C.light, 0], ['q', C.sky, 90], ['sq', C.blue], ['sq', C.navy]],
    // Microsoft: four squares, one live
    microsoft:[['sq', C.blue], ['sq', C.sky], ['sq', C.navy], ['sq', C.orange]],
    // AI: a gauge fan beside a node
    ai:       [['fan', null, 0], ['dot', C.flame], ['sq', C.navy], ['q', C.light, 270]],
    // Virtualization: one host, many guests
    virtual:  [['sq', C.blue], ['sq', C.sky], ['sq', C.sky], ['sq', C.navy]],
    // Backup: layered copies
    backup:   [['arc', C.orange, 0, C.gold], ['arc', C.blue, 90, C.light], ['sq', C.navy], ['ring', C.blue]],
    // Training: target and arrow of attention
    training: [['ring', C.flame], ['q', C.sky, 180], ['sq', C.light], ['dot', C.navy]],
    // Unified comms: signal arcs from a handset
    uc:       [['dot', C.navy], ['arc', C.sky, 0, C.light], ['q', C.blue, 270], ['arc', C.orange, 90, C.gold]]
  };
  function glyphSVG(name) {
    var g = GLYPHS[name]; if (!g) return '';
    var s = 24, out = '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">';
    var pos = [[0, 0], [24, 0], [0, 24], [24, 24]];
    for (var i = 0; i < 4; i++) {
      var spec = g[i];
      if (name === 'virtual') { // split squares with gaps
        out += '<rect x="' + (pos[i][0] + 1.5) + '" y="' + (pos[i][1] + 1.5) + '" width="21" height="21" fill="' + spec[1] + '"/>';
        continue;
      }
      out += cellSVG(pos[i][0], pos[i][1], s, spec);
    }
    return out + '</svg>';
  }
  document.querySelectorAll('[data-glyph]').forEach(function (el) { el.innerHTML = glyphSVG(el.getAttribute('data-glyph')); });

  /* tile strip (footer + dividers): a quiet row from the same vocabulary */
  document.querySelectorAll('.tile-strip').forEach(function (el) {
    var r = rng(parseInt(el.getAttribute('data-seed') || '3', 10));
    var n = 24, s = 40, out = '<svg viewBox="0 0 ' + (n * s) + ' ' + s + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">';
    var types = ['sq', 'q', 'ring', 'q', 'sq', 'dot', 'arc', 'fan'];
    var cols = [C.orange, C.sky, C.navy, C.blue, C.light, C.flame, C.mid];
    for (var i = 0; i < n; i++) {
      var tp = types[Math.floor(r() * types.length)];
      var spec = [tp, cols[Math.floor(r() * cols.length)], Math.floor(r() * 4) * 90, C.gold];
      if (r() < 0.18) continue;
      out += cellSVG(i * s, 0, s, spec);
    }
    el.innerHTML = out + '</svg>';
  });

  /* gauges: fans used as real instruments */
  document.querySelectorAll('[data-gauge]').forEach(function (el) {
    var v = parseFloat(el.getAttribute('data-gauge')), n = 12, s = 100;
    var out = '<svg viewBox="0 0 100 100" aria-hidden="true">';
    for (var i = 0; i < n; i++) {
      var a0 = -90 + 90 * i / n, a1 = -90 + 90 * (i + 1) / n - 0.6;
      var p0 = [s * Math.cos(a0 * Math.PI / 180), s + s * Math.sin(a0 * Math.PI / 180)];
      var p1 = [s * Math.cos(a1 * Math.PI / 180), s + s * Math.sin(a1 * Math.PI / 180)];
      var on = (i + 1) / n <= v / 100 + 0.001;
      var col = on ? [C.light, C.sky, C.mid, C.blue, C.navy][Math.min(4, Math.floor(i / 2.4))] : 'var(--grid)';
      out += '<path d="M0 100 L' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + ' A100 100 0 0 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2) + ' Z" style="fill:' + col + '"/>';
    }
    out += '<path d="M0 100 L0 62 A38 38 0 0 1 38 100 Z" style="fill:var(--panel)"/>';
    el.innerHTML = out + '</svg>';
  });

  /* ---------- nav ---------- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
    var tog = nav.querySelector('.nav-toggle'), ul = nav.querySelector('ul');
    if (tog && ul) tog.addEventListener('click', function () {
      var open = ul.classList.toggle('open');
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      tog.textContent = open ? 'close' : 'menu';
    });
  }

  /* ---------- services explorer ---------- */
  var list = document.querySelector('.svc-list');
  if (list) {
    var btns = list.querySelectorAll('button');
    var select = function (b) {
      btns.forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); x.tabIndex = x === b ? 0 : -1; });
      document.querySelectorAll('.svc-panel .pane').forEach(function (p) { p.hidden = p.id !== b.getAttribute('aria-controls'); });
    };
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () { select(b); });
      b.addEventListener('mouseenter', function () { if (window.matchMedia('(hover: hover) and (min-width: 1021px)').matches) select(b); });
      b.addEventListener('keydown', function (e) {
        var j = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') j = (i + 1) % btns.length;
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') j = (i - 1 + btns.length) % btns.length;
        if (j !== null) { e.preventDefault(); btns[j].focus(); select(btns[j]); }
      });
    });
  }

  /* ---------- services TOC highlight ---------- */
  var toc = document.querySelectorAll('.svc-toc a');
  if (toc.length && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) toc.forEach(function (a) { a.classList.toggle('active', a.getAttribute('href') === '#' + en.target.id); });
      });
    }, { rootMargin: '-40% 0px -55% 0px' });
    document.querySelectorAll('.svc-entry').forEach(function (s) { io.observe(s); });
  }

  /* ---------- copy buttons ---------- */
  document.querySelectorAll('.copy-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.getAttribute('data-copy');
      var done = function () { var o = b.textContent; b.textContent = 'copied'; setTimeout(function () { b.textContent = o; }, 1400); };
      var fallback = function () {
        var el = b.parentElement.querySelector('.v');
        if (!el) return;
        var range = document.createRange(); range.selectNodeContents(el);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
        b.textContent = 'selected';
      };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    });
  });

  /* ---------- intake form (preview: not connected yet) ---------- */
  var form = document.querySelector('form.intake');
  if (form) form.addEventListener('submit', function (e) {
    e.preventDefault();
    var note = form.querySelector('.form-note');
    var to = form.getAttribute('data-mailto');
    if (to) {
      var v = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; };
      var picks = Array.prototype.map.call(form.querySelectorAll('input[name="interest"]:checked'), function (i) { return i.value; }).join(', ');
      var bodyText = 'Name: ' + v('name') + '\nCompany: ' + v('company') + '\nEmail: ' + v('email') + '\nPhone: ' + v('phone') + '\nInterested in: ' + (picks || 'Not specified') + '\n\n' + v('message');
      window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Consultation request from ' + (v('name') || 'oobe.ca')) + '&body=' + encodeURIComponent(bodyText);
    }
    if (note) { note.hidden = false; note.focus(); }
  });

  /* pause SMIL packets for reduced motion */
  if (reduce) document.querySelectorAll('svg').forEach(function (s) { if (s.pauseAnimations) s.pauseAnimations(); });
})();
