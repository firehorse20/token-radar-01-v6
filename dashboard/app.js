// Token Radar dashboard (radar-7). Renders window.RADAR from data.js:
// meta, rows, categories, live_aside. No network: everything is local.
(function () {
  var D = window.RADAR;
  if (!D) { document.body.innerHTML = '<p style="padding:40px">No radar data loaded.</p>'; return; }
  var rows = D.rows, meta = D.meta;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function money(n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  }
  function pct(n) { return (n === null || n === undefined) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function confClass(c) { return c >= 85 ? 'hi' : c >= 70 ? 'mid' : 'lo'; }

  var SCOPES = [
    ['all', 'All'], ['watchlist', 'Watchlist'], ['top40', 'Top 40'],
    ['early', 'Early radar'], ['products', 'Products'], ['deployments', 'Deployments'],
  ];
  var state = { scope: 'all', q: '', cat: '', chain: '', sort: 'rank', dir: 1 };
  var maxImplied = rows.length ? rows[0].implied_value_usd : 1;

  // ---- header stats -------------------------------------------------------
  document.getElementById('meta').innerHTML =
    'Snapshot <b>' + esc(meta.as_of) + '</b> · model <b>' + esc(meta.model) + '</b><br>' +
    'Floor <b>$' + (meta.floor_usd / 1e6) + 'M TVL</b> · ' + D.pre_token_count + ' pre-token protocols';
  var st = document.getElementById('stats');
  st.innerHTML = [
    ['Protocols ranked', meta.rows, ''],
    ['Watchlist covered', meta.watchlist_rows + ' / 40', ''],
    ['Global multiple', meta.global_multiple.toFixed(2) + '×', 'median mcap / TVL'],
    ['Total implied value', money(meta.total_implied_usd), 'across the board'],
    ['Rank 1', esc(meta.rank1_name), esc(meta.rank1_slug)],
  ].map(function (c) {
    return '<div class="stat"><div class="k">' + c[0] + '</div><div class="v">' + c[1] + '</div>' +
      (c[2] ? '<div class="k">' + esc(c[2]) + '</div>' : '') + '</div>';
  }).join('');

  // ---- filters ------------------------------------------------------------
  var pills = document.getElementById('pills');
  pills.innerHTML = SCOPES.map(function (s) {
    return '<button class="pill' + (state.scope === s[0] ? ' on' : '') + '" data-scope="' + s[0] + '">' + s[1] + '</button>';
  }).join('');
  pills.addEventListener('click', function (e) {
    var b = e.target.closest('[data-scope]');
    if (!b) return;
    state.scope = b.getAttribute('data-scope');
    syncHash(); render();
  });
  var catSel = document.getElementById('cat');
  var cats = [];
  rows.forEach(function (r) { if (cats.indexOf(r.category) < 0) cats.push(r.category); });
  cats.sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  var chainSel = document.getElementById('chain');
  var chains = [];
  rows.forEach(function (r) { r.chains.forEach(function (ch) { if (chains.indexOf(ch) < 0) chains.push(ch); }); });
  chains.sort().forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });
  catSel.addEventListener('change', function () { state.cat = catSel.value; syncHash(); render(); });
  chainSel.addEventListener('change', function () { state.chain = chainSel.value; syncHash(); render(); });
  document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value.trim().toLowerCase(); render(); });

  // ---- table --------------------------------------------------------------
  var COLS = [
    ['rank', 'Rank', ''], ['name', 'Protocol', ''], ['category', 'Category', ''],
    ['chains', 'Chains', ''], ['tvl_usd', 'TVL', 'num'], ['change_7d', '7d', 'num'],
    ['implied_value_usd', 'Implied value', 'num'], ['confidence', 'Confidence', 'num'],
  ];
  var head = document.getElementById('head');
  head.innerHTML = COLS.map(function (c) {
    var arrow = state.sort === c[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
    return '<th data-k="' + c[0] + '" class="' + c[2] + '">' + c[1] + arrow + '</th>';
  }).join('');
  head.addEventListener('click', function (e) {
    var th = e.target.closest('[data-k]');
    if (!th) return;
    var k = th.getAttribute('data-k');
    if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = 1; }
    render();
  });

  function inScope(r) {
    if (state.scope === 'watchlist') return r.watchlist;
    if (state.scope === 'top40') return r.rank <= 40;
    if (state.scope === 'early') return r.tier === 'standard' && !r.watchlist;
    if (state.scope === 'products') return r.tier === 'product';
    if (state.scope === 'deployments') return r.tier === 'deployment';
    return true;
  }
  function filtered() {
    return rows.filter(function (r) {
      if (!inScope(r)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
      if (state.q && (r.name.toLowerCase().indexOf(state.q) < 0 && r.slug.indexOf(state.q) < 0)) return false;
      return true;
    });
  }
  function sorted(list) {
    var k = state.sort, d = state.dir;
    return list.slice().sort(function (a, b) {
      var x = a[k], y = b[k];
      if (x === null) return 1; if (y === null) return -1;
      if (typeof x === 'string') return d * (x < y ? -1 : x > y ? 1 : 0);
      return d * (x - y);
    });
  }
  function badge(r) {
    if (r.watchlist) return '<span class="badge wl">Watchlist</span>';
    if (r.tier === 'product') return '<span class="badge prod">Product</span>';
    if (r.tier === 'deployment') return '<span class="badge dep">Deployment</span>';
    return '';
  }
  function shortChains(r) {
    var shown = r.chains.slice(0, 2).join(', ');
    return r.chains.length > 2 ? shown + ' +' + (r.chains.length - 2) : shown;
  }
  function render() {
    head.innerHTML = COLS.map(function (c) {
      var arrow = state.sort === c[0] ? (state.dir === 1 ? ' ▲' : ' ▼') : '';
      return '<th data-k="' + c[0] + '" class="' + c[2] + '">' + c[1] + arrow + '</th>';
    }).join('');
    pills.querySelectorAll('.pill').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-scope') === state.scope);
    });
    var list = sorted(filtered());
    document.getElementById('count').textContent = list.length + ' of ' + rows.length + ' protocols shown';
    document.getElementById('rows').innerHTML = list.map(function (r) {
      var chg = r.change_7d === null ? '—' : '<span class="' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"><td class="rank">#' + r.rank + '</td>' +
        '<td class="name"><b>' + esc(r.name) + '</b><span>' + esc(r.slug) + '</span>' + badge(r) + '</td>' +
        '<td>' + esc(r.category) + '</td><td>' + esc(shortChains(r)) + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td><td class="num">' + chg + '</td>' +
        '<td class="num"><div class="bar"><i style="width:' + Math.max(2, Math.round(100 * r.implied_value_usd / maxImplied)) + '%"></i></div>' + money(r.implied_value_usd) + '</td>' +
        '<td class="num conf ' + confClass(r.confidence) + '">' + r.confidence + '</td></tr>';
    }).join('');
  }
  document.getElementById('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('[data-slug]');
    if (tr) openDrawer(tr.getAttribute('data-slug'));
  });

  // ---- multiples + live-aside tables --------------------------------------
  document.querySelector('#multiples tbody').innerHTML = D.categories.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.multiple.toFixed(2) + '×</td>' +
      '<td class="num">' + c.live_count + '</td><td>' + c.confidence + '</td>' +
      '<td class="num">' + pct(c.live_median_change_7d) + '</td></tr>';
  }).join('');
  document.querySelector('#live tbody').innerHTML = D.live_aside.map(function (p) {
    return '<tr><td><b>' + esc(p.name) + '</b> <span style="color:var(--muted)">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- detail drawer ------------------------------------------------------
  var drawer = document.getElementById('drawer');
  var drawerIn = document.getElementById('drawer-in');
  function openDrawer(slug) {
    var r = null;
    rows.forEach(function (x) { if (x.slug === slug) r = x; });
    if (!r) return;
    var fmin = 0.4, fmax = 1.8;
    var factors = r.factors.map(function (f) {
      var w = Math.round(100 * (Math.min(Math.max(f.value, fmin), fmax) - fmin) / (fmax - fmin));
      return '<div class="factor"><div class="fl"><span>' + esc(f.label) + '</span><b>×' + f.value.toFixed(2) + '</b></div>' +
        '<div class="fbar"><i style="width:' + w + '%"></i></div><div class="fn">' + esc(f.note) + '</div></div>';
    }).join('');
    var flags = r.risk_flags.length
      ? '<div class="flags">' + r.risk_flags.map(function (f) { return '<span class="flag">' + esc(f) + '</span>'; }).join('') + '</div>'
      : '<div class="flags"><span class="flag">No risk flags</span></div>';
    var steps = '<ol class="steps">' + r.farm_steps.map(function (s, i) {
      return '<li><b>Step ' + (i + 1) + '.</b> ' + esc(s) + '</li>';
    }).join('') + '</ol>';
    drawerIn.innerHTML =
      '<button class="close" id="drawer-close">Close ✕</button>' +
      '<h2>' + esc(r.name) + '</h2><div class="slug">' + esc(r.slug) + ' · rank #' + r.rank + badge(r) + '</div>' +
      '<div class="kv">' +
      '<div><div class="k">Implied value</div><div class="v">' + money(r.implied_value_usd) + '</div></div>' +
      '<div><div class="k">TVL</div><div class="v">' + money(r.tvl_usd) + '</div></div>' +
      '<div><div class="k">Category multiple</div><div class="v">' + r.multiple.toFixed(2) + '× <small style="color:var(--muted)">(' + r.multiple_confidence + ', ' + r.multiple_live_count + ' live)</small></div></div>' +
      '<div><div class="k">Confidence</div><div class="v">' + r.confidence + ' / 100</div></div>' +
      '<div><div class="k">7d change</div><div class="v">' + pct(r.change_7d) + '</div></div>' +
      '<div><div class="k">Age</div><div class="v">' + (r.age_years === null ? 'unreported' : r.age_years + ' years') + '</div></div>' +
      '<div><div class="k">Chains</div><div class="v">' + esc(r.chains.join(', ')) + '</div></div>' +
      '<div><div class="k">Live-cap anchor</div><div class="v">' + money(r.anchor_cap_usd) + (r.anchor_bound ? ' — binding' : '') + '</div></div>' +
      '</div>' + flags +
      '<h3>Value breakdown — seventeen factors</h3>' + factors +
      '<h3>How to farm it</h3>' + steps;
    drawer.hidden = false;
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    try { history.replaceState(null, '', '#p=' + r.slug); } catch (e) { /* file urls */ }
  }
  function closeDrawer() {
    drawer.hidden = true;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* file urls */ }
  }

  // ---- hash routing -------------------------------------------------------
  function syncHash() {
    var h = [];
    if (state.scope !== 'all') h.push('scope=' + state.scope);
    if (state.cat) h.push('category=' + encodeURIComponent(state.cat));
    try { history.replaceState(null, '', h.length ? '#' + h.join('&') : location.pathname + location.search); } catch (e) { /* file urls */ }
  }
  function applyHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h) return;
    var parts = h.split('&');
    parts.forEach(function (part) {
      var kv = part.split('=');
      var k = kv[0], v = decodeURIComponent(kv[1] || '');
      if (k === 'p') { openDrawer(v); return; }
      if (k === 'scope' && SCOPES.some(function (s) { return s[0] === v; })) state.scope = v;
      if (k === 'category') { state.cat = v; catSel.value = v; }
    });
  }

  render();
  applyHash();
  render();
})();
