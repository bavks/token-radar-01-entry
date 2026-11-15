// SOONAIR dashboard. Renders window.RADAR (written by main.ts from the same board board.json
// carries) as three views — radar, live tokens, the model — and fetches nothing.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var maxTvl = 0;
  DATA.rows.forEach(function (r) { if (r.tvl_usd > maxTvl) maxTvl = r.tvl_usd; });
  // masthead stat cluster: aggregates of the board, computed once
  var openCount = 0;
  var airSorted = DATA.rows.map(function (r) { return r.air; }).sort(function (a, b) { return a - b; });
  DATA.rows.forEach(function (r) { if (r.win === 0) openCount++; });
  var medAir = airSorted.length ? airSorted[Math.floor(airSorted.length / 2)] : 0;
  // the Hot pill's cut: the airdrop estimate at the board's 90th percentile — the top decile
  var hotCut = airSorted.length ? airSorted[Math.floor(airSorted.length * 0.9)] : Infinity;
  // display currency: rates are baked into data.js, so conversion is display only — ranking
  // and every model figure stay in USD. Percentages and scores never pass through fmtMoney.
  var CCYS = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'IDR', 'KRW'];
  var NO_CENTS = { JPY: 1, IDR: 1, KRW: 1 };
  var FXD = DATA.fx || { as_of: '', source: '', rates: {} };
  function loadCcy() {
    try { var c = window.localStorage.getItem('soonair-ccy'); return CCYS.indexOf(c) >= 0 ? c : 'USD'; }
    catch (e) { return 'USD'; }
  }
  function saveCcy() { try { window.localStorage.setItem('soonair-ccy', state.ccy); } catch (e) { /* blocked store: lasts the visit */ } }
  var state = { view: 'board', q: '', category: 'all', chain: 'all', watch: false, quick: 'all', sort: 'rank', dir: 1, selected: null, ccy: loadCcy() };

  var fmtCache = {};
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    var c = state.ccy;
    var f = fmtCache[c];
    if (!f) {
      f = fmtCache[c] = {
        rate: FXD.rates[c] || 1,
        full: new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }),
        big: new Intl.NumberFormat('en-US', { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: NO_CENTS[c] ? 0 : 2 })
      };
    }
    var v = n * f.rate;
    return Math.abs(v) >= 10000 ? f.big.format(v) : f.full.format(v);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + ' yrs';
    if (days >= 30) return Math.round(days / 30.4) + ' mo';
    return Math.max(0, Math.round(days)) + ' d';
  }
  function fmtRatio(n) { return 'x' + Number(n).toFixed(2); }
  function mult(r) { return r.tvl_usd > 0 ? r.implied_value_usd / r.tvl_usd : null; }

  // the scoring layer's calls as words: full for panels, short for badges
  var WIN_L = ['Window likely open', 'Window uncertain', 'Snapshot risk: likely taken'];
  var WIN_S = ['Window open', 'Window uncertain', 'Snapshot risk'];
  var COST_L = ['Free', 'Low $', 'Capital'];
  var DIFF_L = ['Easy', 'Medium', 'Hard'];

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string' || typeof child === 'number') node.appendChild(document.createTextNode(String(child)));
      else node.appendChild(child);
    }
    return node;
  }

  // ---- state in the hash, so a view can be linked and restored exactly
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q') !== null) state.q = p.get('q');
    if (p.get('cat')) state.category = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('w')) state.watch = p.get('w') === '1';
    if (p.get('qf')) state.quick = p.get('qf');
    if (p.get('view')) state.view = p.get('view');
    if (p.get('p')) { state.selected = p.get('p'); state.view = 'board'; }
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.view !== 'board') p.set('view', state.view);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('cat', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.watch) p.set('w', '1');
    if (state.quick !== 'all') p.set('qf', state.quick);
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  // ---- filtering and sorting
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.quick === 'hot' && r.air < hotCut) return false;
      if (state.quick === 'open' && r.win) return false;
      if (state.quick === 'free' && r.cost) return false;
      if (state.quick === 'easy' && r.diff) return false;
      if (state.quick === 'watch' && !r.watchlist) return false;
      if (state.watch && !r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Uncategorized') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      return [r.name, r.slug, r.category || '', (r.chains || []).join(' ')].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }
  function sorted(list) {
    var key = state.sort, dir = state.dir;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'change') { av = a.change_7d == null ? -Infinity : a.change_7d; bv = b.change_7d == null ? -Infinity : b.change_7d; }
      else if (key === 'air') { av = a.air; bv = b.air; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }
  function clearFilters() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watch = false; state.quick = 'all';
    writeHash(); render();
  }

  // ---- the ticker: an airdrops.io-style ribbon of the board's freshest items — NEW for the
  // newest listings, HOT for the top airdrop estimate and the biggest 7d gainer, WINDOW OPEN
  // for the largest open-window protocols. The set prints twice; the track scrolls by half.
  function ticker() {
    var items = [];
    function add(p, c, r, s) { items.push({ p: p, c: c, slug: r.slug, t: r.name, s: s }); }
    (DATA.newest || []).slice(0, 4).forEach(function (n) { add('NEW', '#34d399', n); });
    var byAir = DATA.rows.slice().sort(function (a, b) { return b.air - a.air; });
    if (byAir[0]) add('HOT', '#fb923c', byAir[0], 'airdrop est. ' + byAir[0].air + '%');
    var gain = DATA.rows.filter(function (r) { return r.change_7d != null; }).sort(function (a, b) { return b.change_7d - a.change_7d; });
    if (gain[0]) add('HOT', '#fb923c', gain[0], fmtPct(gain[0].change_7d) + ' in 7d');
    DATA.rows.filter(function (r) { return !r.win; }).sort(function (a, b) { return b.tvl_usd - a.tvl_usd; }).slice(0, 3)
      .forEach(function (r) { add('WINDOW OPEN', '#fbbf24', r); });
    function item(it, dup) {
      return el('button', { class: 'tk', type: 'button', tabindex: dup ? '-1' : null, onclick: function () { openDetail(it.slug); } },
        el('span', { class: 'tpill', style: 'background:' + it.c, text: it.p }),
        el('span', { class: 'tname', text: it.t }),
        it.s ? el('span', { class: 'tsub', text: it.s }) : null);
    }
    function set(dup) {
      return el('div', { class: 'tset', 'aria-hidden': dup ? 'true' : null },
        items.map(function (it) { return item(it, dup); }));
    }
    return el('div', { class: 'ticker' }, el('div', { class: 'ttrack' }, set(false), set(true)));
  }

  // ---- quick-filter pills above the board, airdrops.io style: the active one filled. They
  // compose with the rail filters; All clears the quick filter. Hot is the top decile (hotCut).
  var QUICKS = [['all', 'All'], ['hot', 'Hot · top 10%'], ['open', 'Window open'], ['free', 'Free entry'], ['easy', 'Easy'], ['watch', 'Watchlist']];
  function pillRow() {
    return el('div', { class: 'pills', role: 'group', 'aria-label': 'Quick filters' }, QUICKS.map(function (q) {
      var on = state.quick === q[0];
      return el('button', { type: 'button', class: 'pill' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false',
        onclick: function () { state.quick = q[0]; writeHash(); render(); } }, q[1]);
    }));
  }

  // ---- chrome: the masthead band — wordmark, vital signs, currency, view tabs
  function hstat(k, v) {
    return el('div', { class: 'hstat' },
      el('div', { class: 'hk', text: k }),
      el('div', { class: 'hv', text: v }));
  }
  function topbar() {
    return el('div', { class: 'topbar' },
      el('div', { class: 'brand' },
        el('h1', null, 'SOON', el('em', null, 'AIR')),
        el('div', { class: 'tag', text: 'Soon-airdrop radar — pre-token protocols scored for the launch that may be coming: what it could be worth, how likely a drop looks, and what to do before a snapshot is taken.' })
      ),
      el('div', { class: 'hstats' },
        hstat('Protocols ranked', String(DATA.board_size)),
        hstat('TVL on the board', fmtMoney(DATA.pulse.total_tvl_usd)),
        hstat('Windows likely open', String(openCount)),
        hstat('Median airdrop est.', medAir + '%'))
    );
  }

  // the masthead's control row: the currency selector with its note, and the provenance chip
  function mastctl() {
    var sel = el('select', { 'aria-label': 'Display currency' });
    CCYS.forEach(function (c) {
      var o = el('option', { value: c, text: c });
      if (c === state.ccy) o.setAttribute('selected', 'selected');
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () { state.ccy = sel.value; saveCcy(); render(); });
    return el('div', { class: 'mastctl' },
      el('div', { class: 'ccy' },
        el('label', { text: 'Display currency' }),
        sel,
        el('span', { class: 'ccynote', text: 'Display only — rates as of ' + FXD.as_of + ' (' + FXD.source + '); ranking is computed in USD' })),
      el('div', { class: 'topmeta' },
        'Snapshot ', el('b', { text: DATA.as_of }), ' · ' + DATA.board_size + ' protocols ranked'));
  }

  function tabs() {
    function tab(view, label) {
      return el('button', { type: 'button', 'aria-pressed': state.view === view ? 'true' : 'false', text: label,
        onclick: function () { state.view = view; writeHash(); render(); } });
    }
    return el('nav', { class: 'tabs' }, tab('board', 'Radar'), tab('live', 'Live tokens'), tab('model', 'The model'));
  }

  function statTile(k, v, s) {
    return el('div', { class: 'stat' },
      el('div', { class: 'k', text: k }),
      el('div', { class: 'v', text: v }),
      s ? el('div', { class: 's', text: s }) : null);
  }

  // ---- the filter rail: search, two selects, the watchlist toggle, the count
  function rail(shown) {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); });
    var search = el('input', { type: 'search', placeholder: 'Name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    function select(value, options, onChange, label) {
      var s = el('select', { 'aria-label': label });
      options.forEach(function (o) {
        var opt = el('option', { value: o.v, text: o.t });
        if (o.v === value) opt.setAttribute('selected', 'selected');
        s.appendChild(opt);
      });
      s.addEventListener('change', function () { onChange(s.value); writeHash(); render(); });
      return s;
    }
    var catSel = select(state.category, [{ v: 'all', t: 'All categories' }].concat(cats.map(function (c) { return { v: c, t: c }; })),
      function (v) { state.category = v; }, 'Filter by category');
    var chainSel = select(state.chain, [{ v: 'all', t: 'All chains' }].concat(chains.map(function (c) { return { v: c, t: c + ' (' + chainCount[c] + ')' }; })),
      function (v) { state.chain = v; }, 'Filter by chain');
    var toggle = el('input', { type: 'checkbox', 'aria-label': 'Watchlist only' });
    if (state.watch) toggle.setAttribute('checked', 'checked');
    toggle.addEventListener('change', function () { state.watch = toggle.checked; writeHash(); render(); });
    var covered = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    return el('aside', { class: 'rail' },
      el('h3', { text: 'Filters' }),
      el('div', { class: 'field' }, el('label', { text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), catSel),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), chainSel),
      el('div', { class: 'toggle' },
        el('span', null,
          el('span', { class: 'tlabel', text: 'Watchlist only' }),
          el('span', { class: 'tsub', text: 'Above the ' + fmtMoney(DATA.floor_usd) + ' floor' })),
        el('span', { class: 'switch' }, toggle, el('span', { class: 'track' }))),
      el('div', { class: 'rail-count' },
        el('div', { class: 'n', text: String(shown) }),
        el('div', { class: 'd' }, 'protocols shown of ', el('b', { text: String(DATA.board_size) }), ' ranked · ',
          el('b', { text: String(covered) }), ' watchlist · ', el('b', { text: String(DATA.board_size - covered) }), ' early finds')),
      el('button', { class: 'btn block', type: 'button', text: 'Clear all filters', onclick: clearFilters }));
  }

  // ---- the market pulse: the ranked set's vital signs, all aggregates of the board
  function pulseStrip() {
    var p = DATA.pulse;
    if (!p) return null;
    var tot = p.gainers + p.losers;
    var upPct = tot > 0 ? (p.gainers / tot * 100) : 50;
    var medCls = p.median_change_7d > 0 ? 'up-t' : (p.median_change_7d < 0 ? 'down-t' : '');
    var fresh = DATA.newest && DATA.newest[0];
    return el('div', { class: 'pulse' },
      el('div', { class: 'pcell' },
        el('div', { class: 'k', text: 'TVL on the board' }),
        el('div', { class: 'v', text: fmtMoney(p.total_tvl_usd) }),
        el('div', { class: 's', text: 'across ' + DATA.board_size + ' pre-token protocols' })),
      el('div', { class: 'pcell' },
        el('div', { class: 'k', text: 'Median 7d change' }),
        el('div', { class: 'v ' + medCls, text: fmtPct(p.median_change_7d) }),
        el('div', { class: 's', text: p.reported + ' of ' + DATA.board_size + ' report a change' })),
      el('div', { class: 'pcell' },
        el('div', { class: 'k', text: 'Gainers vs losers, 7d' }),
        el('div', { class: 'prop', 'aria-hidden': 'true' },
          el('div', { class: 'pup', style: 'width:' + upPct.toFixed(1) + '%' }),
          el('div', { class: 'pdown' })),
        el('div', { class: 's' },
          el('span', { class: 'up-t', text: p.gainers + ' gaining' }), ' · ',
          el('span', { class: 'down-t', text: p.losers + ' falling' }))),
      fresh ? el('button', { class: 'pcell asbtn', type: 'button', onclick: function () { openDetail(fresh.slug); } },
        el('div', { class: 'k', text: 'Newest listing' }),
        el('div', { class: 'v name', text: fresh.name }),
        el('div', { class: 's', text: 'first tracked ' + fresh.listed_at + ' · ' + (fresh.category || 'Uncategorized') })) : null);
  }

  // ---- newest on the radar: the most recently tracked protocols, freshest first
  function newestPanel() {
    if (!DATA.newest || !DATA.newest.length) return null;
    return el('section', { class: 'panel newest-panel' },
      el('div', { class: 'np-head' },
        el('h3', { text: 'Newest on the radar' }),
        el('span', { class: 'mut', text: 'the freshest listings on record — a young protocol has had less time to be found' })),
      el('div', { class: 'newgrid' }, DATA.newest.map(function (n) {
        return el('button', { class: 'newcard', type: 'button', onclick: function () { openDetail(n.slug); } },
          el('div', { class: 'nc-top' },
            el('span', { class: 'pname', text: n.name }),
            n.watchlist ? el('span', { class: 'badge wl', text: 'Watchlist' }) : el('span', { class: 'badge', text: 'Early find' })),
          el('div', { class: 'nc-date', text: 'First tracked ' + n.listed_at }),
          el('div', { class: 'nc-figs' },
            el('span', null, el('span', { class: 'nc-k', text: 'TVL ' }), fmtMoney(n.tvl_usd)),
            el('span', null, el('span', { class: 'nc-k', text: 'Implied ' }), fmtMoney(n.implied_value_usd))),
          el('div', { class: 'psub', text: n.category || 'Uncategorized' }));
      })));
  }

  // ---- a 7d change as a signed bar; the half-track saturates at ±25, so one freak week
  // cannot flatten the rest
  function changeBar(change) {
    if (change === null || change === undefined) return null;
    var w = Math.min(50, Math.abs(change) / 25 * 50);
    var fill = change >= 0
      ? el('div', { class: 'cfill up', style: 'left:50%;width:' + w.toFixed(1) + '%' })
      : el('div', { class: 'cfill down', style: 'left:' + (50 - w).toFixed(1) + '%;width:' + w.toFixed(1) + '%' });
    return el('div', { class: 'cbar', 'aria-hidden': 'true' }, fill);
  }

  // ---- the board: a dense ranked table
  function sortHead(key, label, numeric) {
    var active = state.sort === key;
    return el('th', numeric ? { class: 'num', scope: 'col' } : { scope: 'col' },
      el('button', { type: 'button', onclick: function () {
          if (state.sort === key) state.dir = -state.dir;
          else { state.sort = key; state.dir = key === 'name' || key === 'rank' ? 1 : -1; }
          render();
        } }, label, active ? el('span', { class: 'arr', text: state.dir > 0 ? ' ↑' : ' ↓' }) : null));
  }

  function boardView() {
    var list = sorted(visibleRows());
    var covered = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    var main;
    if (list.length === 0) {
      main = el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('div', { text: 'No protocol matches that filter.' }),
        el('button', { class: 'btn', type: 'button', text: 'Clear filters', onclick: clearFilters })));
    } else {
      var tbody = el('tbody');
      list.forEach(function (r) {
        var chains = r.chains || [];
        var sub = (r.category || 'Uncategorized') + ' · ' + (chains.slice(0, 3).join(', ') || 'chain unrecorded') +
          (chains.length > 3 ? ' +' + (chains.length - 3) + ' more' : '');
        var dcls = r.change_7d === null || r.change_7d === undefined ? 'delta flat' : (r.change_7d > 0 ? 'delta up' : (r.change_7d < 0 ? 'delta down' : 'delta flat'));
        tbody.appendChild(el('tr', { tabindex: '0', 'aria-selected': state.selected === r.slug ? 'true' : 'false',
            onclick: function () { openDetail(r.slug); },
            onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
          el('td', { class: 'rank', text: String(r.rank) }),
          el('td', null,
            el('div', null,
              el('span', { class: 'pname', text: r.name }),
              r.watchlist ? el('span', { class: 'badge wl', text: 'Watchlist' }) : el('span', { class: 'badge', text: 'Early find' })),
            el('div', { class: 'psub', text: sub }),
            el('div', { class: 'tags' },
              el('span', { class: 'badge' + (r.win === 0 ? ' good' : (r.win === 2 ? ' risk' : '')), text: WIN_S[r.win] }),
              el('span', { class: 'badge' + (r.cost === 0 ? ' good' : ''), text: COST_L[r.cost] }),
              el('span', { class: 'badge' + (r.diff === 2 ? ' risk' : ''), text: DIFF_L[r.diff] }))),
          el('td', { class: 'num' },
            el('div', { text: fmtMoney(r.tvl_usd) }),
            el('div', { class: 'tbar', 'aria-hidden': 'true' },
              el('div', { class: 'tfill', style: 'width:' + (maxTvl > 0 ? (r.tvl_usd / maxTvl * 100) : 0).toFixed(1) + '%' }))),
          el('td', { class: dcls },
            el('div', { text: fmtPct(r.change_7d) }),
            changeBar(r.change_7d)),
          el('td', { class: 'num' },
            el('div', null, el('span', { class: 'big', text: r.air + '%' })),
            el('div', { class: 'tbar', 'aria-hidden': 'true' },
              el('div', { class: 'tfill', style: 'width:' + r.air + '%' }))),
          el('td', { class: 'num' }, el('span', { class: 'big', text: fmtMoney(r.implied_value_usd) }))
        ));
      });
      main = el('div', { class: 'panel' }, el('table', null,
          el('caption', { text: 'Pre-token protocols ranked by implied value — the model’s estimate of what a launch would be worth.' }),
          el('thead', null, el('tr', null,
            sortHead('rank', '#'), sortHead('name', 'Protocol'), sortHead('tvl', 'TVL', true),
            sortHead('change', '7d', true), sortHead('air', 'Airdrop est.', true),
            sortHead('implied', 'Implied value', true))),
          tbody));
    }
    var head = el('p', { class: 'count-line' },
      el('b', { text: list.length + ' protocols' }), ' shown · ' + covered + ' of ' + DATA.watchlist_size + ' watchlist · select a row for its workings and farm plan · Airdrop % and the window/cost/difficulty badges are model estimates — method on The model tab');
    var mainWrap = el('div', null, head, main);
    return el('div', null,
      pillRow(),
      pulseStrip(),
      el('div', { class: 'shell' }, rail(list.length), mainWrap),
      newestPanel());
  }

  // ---- detail: workings and record on the left, the farm plan on the right
  function splitStep(s) {
    var ci = s.indexOf('. Cost: ');
    if (ci < 0) return { act: s, meta: '' };
    var rest = s.slice(ci + 2);
    var ti = rest.indexOf('. Time: ');
    var cost = ti >= 0 ? rest.slice(0, ti) : rest;
    var time = ti >= 0 ? rest.slice(ti + 2) : '';
    return { act: s.slice(0, ci) + '.', meta: cost + (time ? ' · ' + time : '') };
  }

  // ---- the airdrop outlook: the scoring layer's four calls for one protocol
  function outlookCard(row) {
    var sc = DATA.score;
    var names = ['Category launch share', 'TVL band', 'Track record', '7d momentum', 'Chain breadth'];
    var maxs = [sc.prop_weight, sc.tvl_weight, sc.age_weight, sc.momentum_weight, sc.breadth_weight];
    var notes = [
      'the shrunk share of ' + (row.category || 'Uncategorized') + ' protocols that already record a token — shrinkage prior ' + sc.prop_prior,
      fmtMoney(row.tvl_usd) + ' on a log ramp from ' + fmtMoney(sc.tvl_floor_usd) + ' (no points) to ' + fmtMoney(sc.tvl_full_usd) + ' (full points)',
      fmtAge(row.age_days) + ' with no token on record' + (row.age_days === null || row.age_days === undefined ? ' — no date on record, counted as ' + sc.unknown_age_days + ' days' : ''),
      'a 7-day TVL change of ' + fmtPct(row.change_7d) + ', mapped from ' + sc.momentum_floor_pct + '% across ' + sc.momentum_span_pct + ' points',
      (row.chains || []).length + ' chain(s) served; full points at ' + sc.breadth_full_chains,
    ];
    function srow(i) {
      return el('div', { class: 'prow' },
        el('div', { class: 'phead' },
          el('span', { text: names[i] }),
          el('span', { class: 'pval', text: row.ap[i] + ' of ' + maxs[i] })),
        el('div', { class: 'ptrack slim', 'aria-hidden': 'true' },
          el('div', { class: 'pfill', style: 'width:' + (maxs[i] > 0 ? (row.ap[i] / maxs[i] * 100) : 0).toFixed(1) + '%' })),
        el('div', { class: 'pnote', text: notes[i] }));
    }
    var winText = row.win === 0
      ? 'First tracked ' + row.listed_at + ' — young enough that a user snapshot, if one is ever taken, is probably still ahead.'
      : row.win === 2
        ? 'First tracked ' + row.listed_at + ' — this established, any user snapshot was probably already taken; late farming here is a bet, not a position.'
        : row.listed_at
          ? 'First tracked ' + row.listed_at + ' — old enough to have snapshotted, young enough that it may not have; the estimate cannot call it.'
          : 'No first-tracked date on record, so the protocol cannot be aged and the window reads uncertain.';
    var costText = row.cost === 0
      ? 'Free to join: an account signup, no position locked, any balance stays spendable.'
      : row.cost === 2
        ? 'Capital: the farm plan’s core step (step 2) locks a position of ' + fmtMoney(150) + ' or more — the amount is stated there.'
        : 'Low $: the plan works a small balance; its core step commits under ' + fmtMoney(150) + '.';
    var facts = [
      ['Snapshot window', WIN_L[row.win]],
      ['First tracked', row.listed_at || 'unrecorded'],
      ['Entry cost', COST_L[row.cost]],
      ['Difficulty', DIFF_L[row.diff]],
    ];
    return el('section', { class: 'card' },
      el('h3', { text: 'Airdrop outlook — model estimates' }),
      el('div', { class: 'phead' },
        el('span', { text: 'Airdrop likelihood' }),
        el('span', { class: 'pval airbig', text: row.air + '%' })),
      el('div', { class: 'ptrack', 'aria-hidden': 'true' },
        el('div', { class: 'pfill', style: 'width:' + row.air + '%' })),
      el('div', { class: 'pnote', text: 'From the snapshot’s record alone — not a promise that a token, let alone a drop, exists. Its five parts:' }),
      [0, 1, 2, 3, 4].map(srow),
      el('div', { class: 'facts', style: 'margin-top:14px' }, facts.map(function (f) {
        return el('div', null, el('span', { text: f[0] }), el('b', { text: f[1] }));
      })),
      el('div', { class: 'note', text: winText }),
      el('div', { class: 'note', text: costText + ' Difficulty ' + DIFF_L[row.diff].toLowerCase() + ': a ' + row.farm_steps.length + '-step plan at ' + COST_L[row.cost].toLowerCase() + ' cost across ' + (row.chains || []).length + ' chain(s). Every rule behind these calls is printed on The model tab.' }));
  }

  // ---- where a protocol stands: size against the field, multiple against its kind
  function standCard(row) {
    function pbar(label, pct, note) {
      return el('div', { class: 'prow' },
        el('div', { class: 'phead' },
          el('span', { text: label }),
          el('span', { class: 'pval', text: 'larger than ' + pct + '%' })),
        el('div', { class: 'ptrack', 'aria-hidden': 'true' },
          el('div', { class: 'pfill', style: 'width:' + pct + '%' })),
        el('div', { class: 'pnote', text: note }));
    }
    var parts = [
      pbar('TVL vs the field', row.tvl_pct, fmtMoney(row.tvl_usd) + ' against ' + DATA.board_size + ' ranked protocols'),
      pbar('Implied value vs the field', row.value_pct, fmtMoney(row.implied_value_usd) + ' — the board’s ranking made visible'),
    ];
    var own = mult(row);
    var med = row.cat_median_mult;
    if (own !== null && med !== null && med > 0) {
      var cat = (DATA.categories || []).filter(function (c) { return c.category === (row.category || 'Uncategorized'); })[0];
      var top = Math.max(own, med) * 1.15;
      function mbar(label, v, cls) {
        return el('div', { class: 'mrow' },
          el('div', { class: 'phead' },
            el('span', { text: label }),
            el('span', { class: 'pval', text: fmtRatio(v) })),
          el('div', { class: 'ptrack slim', 'aria-hidden': 'true' },
            el('div', { class: 'pfill ' + (cls || ''), style: 'width:' + Math.min(100, v / top * 100).toFixed(1) + '%' })));
      }
      parts.push(el('div', { class: 'prow last' },
        el('div', { class: 'psub2', text: 'Implied multiple against its own kind' }),
        mbar('This protocol', own, ''),
        mbar((row.category || 'Uncategorized') + ' median' + (cat ? ' · ' + cat.count + ' ranked' : ''), med, 'dim')));
    }
    return el('section', { class: 'card' }, el('h3', { text: 'Where it stands' }), parts);
  }

  function openDetail(slug) {
    state.selected = slug;
    writeHash();
    render();
    window.scrollTo(0, 0);
  }

  function detailView(row) {
    var afterComp = row.tvl_usd * row.comp_ratio;
    var afterGrowth = afterComp * row.growth_multiplier;
    var afterMat = afterGrowth * row.maturity_multiplier;
    // factor bars share one scale, x0 to x2.5, tick at x1
    function fbar(m) {
      var pct = Math.max(0, Math.min(100, m / 2.5 * 100));
      return el('div', { class: 'ftrack' },
        el('div', { class: 'ffill', style: 'width:' + pct.toFixed(1) + '%' }),
        el('div', { class: 'ftick' }));
    }
    function frow(name, m, note, amt, cls, bar) {
      return el('div', { class: 'frow ' + (cls || '') },
        el('div', { class: 'fhead' },
          el('span', { class: 'fname' }, name, m !== null ? el('span', { class: 'mult', text: fmtRatio(m) }) : null),
          el('span', { class: 'famt', text: amt })),
        bar ? fbar(m) : null,
        el('div', { class: 'fnote', text: note }));
    }
    var facts = [
      ['Category', row.category || 'Uncategorized'],
      ['Chains', (row.chains || []).join(', ') || 'unrecorded'],
      ['TVL', fmtMoney(row.tvl_usd)],
      ['TVL change, 7d', fmtPct(row.change_7d)],
      ['First tracked', row.listed_at || 'unrecorded'],
      ['Age with no token', fmtAge(row.age_days)],
      ['On the watchlist', row.watchlist ? 'Yes — above the ' + fmtMoney(DATA.floor_usd) + ' floor' : 'No — an early find'],
      ['Token', 'none on record'],
      ['Implied multiple', mult(row) === null ? 'n/a' : fmtRatio(mult(row)) + ' of TVL'],
    ];
    return el('div', null,
      el('button', { class: 'btn ghost', type: 'button', text: '← Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } }),
      el('div', { class: 'detail-head' },
        el('div', { class: 'crumb', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { text: row.name }),
        el('div', { class: 'mut' },
          (row.category || 'Uncategorized') + ' · ' + ((row.chains || []).join(', ') || 'chain unrecorded') + '  ',
          row.watchlist ? el('span', { class: 'badge wl', text: 'Watchlist' }) : el('span', { class: 'badge', text: 'Early find' }))),
      el('div', { class: 'stats', style: 'margin-top:16px' },
        statTile('Rank', '#' + row.rank, 'of ' + DATA.board_size + ' priced'),
        statTile('TVL', fmtMoney(row.tvl_usd), 'the snapshot’s figure'),
        statTile('TVL change, 7d', fmtPct(row.change_7d), 'momentum into a launch'),
        statTile('Implied value', fmtMoney(row.implied_value_usd), mult(row) === null ? '' : fmtRatio(mult(row)) + ' of TVL')),
      el('div', { class: 'detail-grid' },
        el('div', { class: 'col' },
          outlookCard(row),
          standCard(row),
          el('section', { class: 'card' },
            el('h3', { text: 'How the model prices it' }),
            frow('TVL', null, 'the snapshot’s figure', fmtMoney(row.tvl_usd), 'base', false),
            frow('R · comparable multiple', row.comp_ratio, row.comp_count + ' launched ' + (row.category || '') + ' protocols set this price', fmtMoney(Math.round(afterComp)), '', true),
            frow('G · momentum', row.growth_multiplier, '7-day TVL change of ' + fmtPct(row.change_7d), fmtMoney(Math.round(afterGrowth)), '', true),
            frow('M · track record', row.maturity_multiplier, fmtAge(row.age_days) + ' with no token on record', fmtMoney(Math.round(afterMat)), '', true),
            frow('B · breadth', row.breadth_multiplier, (row.chains || []).length + ' chain(s) served', fmtMoney(Math.round(afterMat * row.breadth_multiplier)), '', true),
            frow('Implied value', null, 'the model’s estimate, not a price or a promise', fmtMoney(row.implied_value_usd), 'total', false),
            el('div', { class: 'note', text: 'Bars share one scale, ×0 to ×2.5; the tick marks ×1.' })),
          el('section', { class: 'card' },
            el('h3', { text: 'The record' }),
            el('div', { class: 'facts' }, facts.map(function (f) {
              return el('div', null, el('span', { text: f[0] }), el('b', { text: f[1] }));
            })))),
        el('div', { class: 'side' },
          el('section', { class: 'card' },
            el('h3', { text: 'Farm plan' }),
            el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
              var parts = splitStep(s);
              return el('li', null, el('div', null,
                el('span', { class: 'act', text: parts.act }),
                parts.meta ? el('span', { class: 'meta', text: parts.meta }) : null));
            })))))
    );
  }

  // ---- live tokens, set aside: a summary strip over the dense table
  function liveView() {
    var tvlSum = 0, mcapSum = 0;
    DATA.live.forEach(function (r) { tvlSum += r.tvl_usd || 0; mcapSum += r.mcap_usd || 0; });
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null,
          el('span', { class: 'pname', text: r.name }),
          el('div', { class: 'psub', text: (r.category || 'Uncategorized') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || '') })),
        el('td', { class: 'num', text: r.symbol || '—' }),
        el('td', { class: 'num', text: fmtMoney(r.tvl_usd) }),
        el('td', { class: r.change_7d > 0 ? 'delta up' : (r.change_7d < 0 ? 'delta down' : 'delta flat'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtMoney(r.mcap_usd) }),
        el('td', { class: 'num', text: r.tvl_usd > 0 && r.mcap_usd ? fmtRatio(r.mcap_usd / r.tvl_usd) : 'n/a' })));
    });
    return el('div', null,
      el('div', { class: 'stats' },
        statTile('Protocols trading', String(DATA.live_total), 'never ranked by the model'),
        statTile('Shown here', String(DATA.live.length), 'the largest by TVL'),
        statTile('Their combined TVL', fmtMoney(tvlSum), 'of the ones shown'),
        statTile('Combined market cap', fmtMoney(mcapSum), 'a fact, not an estimate')),
      el('div', { class: 'panel' }, el('table', { class: 'compact' },
        el('caption', { text: 'Already trading: the ' + DATA.live_total + ' protocols with a token are never ranked — market cap is a fact, not an estimate. The largest ' + DATA.live.length + ' are shown; their FDV/TVL ratios are the comparables the radar prices from.' }),
        el('thead', null, el('tr', null,
          el('th', { scope: 'col', text: 'Protocol' }), el('th', { class: 'num', scope: 'col', text: 'Symbol' }),
          el('th', { class: 'num', scope: 'col', text: 'TVL' }), el('th', { class: 'num', scope: 'col', text: '7d' }),
          el('th', { class: 'num', scope: 'col', text: 'Market cap' }), el('th', { class: 'num', scope: 'col', text: 'FDV/TVL' }))),
        tbody)));
  }

  // ---- the category landscape: where the ranked set's TVL sits, kind by kind
  function landscapeCard() {
    var cats = DATA.categories || [];
    if (!cats.length) return null;
    var top = cats.slice(0, 12);
    var rest = cats.slice(12);
    var max = cats[0].tvl_usd;
    function crow(name, count, tvl) {
      return el('div', { class: 'catrow' },
        el('div', { class: 'cathead' },
          el('span', { text: name }),
          el('span', { class: 'catfig', text: fmtMoney(tvl) + ' · ' + count + ' ranked' })),
        el('div', { class: 'cattrack', 'aria-hidden': 'true' },
          el('div', { class: 'catfill', style: 'width:' + (max > 0 ? (tvl / max * 100) : 0).toFixed(1) + '%' })));
    }
    var body = top.map(function (c) { return crow(c.category, c.count, c.tvl_usd); });
    if (rest.length) {
      var rt = 0, rc = 0;
      rest.forEach(function (c) { rt += c.tvl_usd; rc += c.count; });
      body.push(crow('All other categories', rc, rt));
    }
    return el('section', { class: 'card' },
      el('h3', { text: 'The category landscape' }),
      el('p', { class: 'mut', text: 'Aggregate TVL of the ' + DATA.board_size + ' ranked protocols by category. Weight sits where the bars are long: a launch there is priced against deep comparables, in a short bar against few.' }),
      body);
  }

  // ---- the model, stated: factors on the left, the comparable set on the right
  function modelView() {
    var m = DATA.model;
    var tbody = el('tbody');
    DATA.comp_stats.forEach(function (c) {
      tbody.appendChild(el('tr', null,
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.comps) }),
        el('td', { class: 'num', text: fmtRatio(c.ratio) })));
    });
    return el('div', null,
      el('div', { class: 'formula', text: 'implied value  =  TVL  ×  R(category)  ×  G(7d growth)  ×  M(track record)  ×  B(chains)' }),
      el('div', { class: 'model-grid' },
        el('div', { class: 'col' },
          el('section', { class: 'card' },
            el('h3', { text: 'Where each factor comes from' }),
            el('p', null, el('b', { text: 'R — the comparable multiple. ' }), 'Every launched protocol in the snapshot gives one FDV/TVL observation. Each is winsorized to [' + m.ratio_winsor_low + ', ' + m.ratio_winsor_high + '] so a freak ratio cannot set a price, the category takes its median, and the median is shrunk toward the global median (' + fmtRatio(DATA.global_comp_ratio) + ' over ' + DATA.global_comp_count + ' protocols) with a prior of ' + m.ratio_prior_strength + ' observations. Thin categories borrow the market’s price; deep ones speak for themselves.'),
            el('p', null, el('b', { text: 'G — momentum. ' }), '1 + clamp(change_7d, ' + m.growth_floor_pct + ', ' + m.growth_cap_pct + ') × ' + m.growth_weight + ', floored at ' + m.growth_min_factor + '. TVL gathering into a launch is worth more than the same TVL draining.'),
            el('p', null, el('b', { text: 'M — track record. ' }), m.maturity_base + ' + ' + m.maturity_range + ' × (1 − exp(−age / ' + m.maturity_tau_days + ' days)). Years run with no token on record mean a proven product a launch can price; an unrecorded listing date counts as ' + m.unknown_age_days + ' days.'),
            el('p', null, el('b', { text: 'B — breadth. ' }), '1 + ' + m.breadth_per_chain + ' per extra chain served, capped at ' + m.breadth_max_chains + '. Distribution a token launches into is worth a little, not a lot.')),
          el('section', { class: 'card' },
            el('h3', { text: 'How SOONAIR scores' }),
            el('p', null, el('b', { text: 'Airdrop likelihood, 0–100. ' }), 'Five parts, every one computed from the snapshot and printed in full on each protocol’s detail page. Category launch share, ' + DATA.score.prop_weight + ' points: the share of the category’s own protocols that already record a token, shrunk toward the snapshot-wide share — ' + DATA.launched_count + ' of ' + DATA.snapshot_count + ' protocols (' + Math.round(DATA.launch_share * 100) + '%) — with a prior of ' + DATA.score.prop_prior + ', the same shrinkage R uses. TVL band, ' + DATA.score.tvl_weight + ': a log ramp from ' + fmtMoney(DATA.score.tvl_floor_usd) + ' to ' + fmtMoney(DATA.score.tvl_full_usd) + '. Track record, ' + DATA.score.age_weight + ': 1 − exp(−age / ' + DATA.score.age_tau_days + ' days), an unrecorded listing date counting as ' + DATA.score.unknown_age_days + ' days. Momentum, ' + DATA.score.momentum_weight + ': the 7-day change mapped from ' + DATA.score.momentum_floor_pct + '% across ' + DATA.score.momentum_span_pct + ' points. Breadth, ' + DATA.score.breadth_weight + ': chains served, full at ' + DATA.score.breadth_full_chains + '.'),
            el('p', null, el('b', { text: 'Snapshot window. ' }), 'An estimate from age alone — protocols do not publish snapshot dates, so no date is ever shown as one. Under ' + DATA.score.window_open_days + ' days since first tracked: window likely open. Under ' + (DATA.score.window_risk_days / 365) + ' years: window uncertain, and a protocol with no date on record reads uncertain too. Older: snapshot risk — the user snapshot, if there ever is one, was likely already taken. The first-tracked date beside the call is a fact from the record.'),
            el('p', null, el('b', { text: 'Entry cost. ' }), 'Read off the row’s own farm plan, never its reputation. Free: the payments and card family, whose joining is an account signup and locks no position. Capital: the plan’s core step locks a position — its text commits to supply, deposit, stake, mint, margin, collateral or a liquidity pool — of ' + fmtMoney(150) + ' or more, the plan’s own capital figure for a protocol of its size. Low $: everything smaller, a balance worked rather than a position locked.'),
            el('p', null, el('b', { text: 'Difficulty. ' }), 'Points: 1 for a plan of 6 or more steps, the cost class itself (Free 0, Low $ 1, Capital 2), and 1 for a protocol spread over 5 or more chains. A total of 0–2 reads Easy, 3 Medium, 4 Hard.'),
            el('p', null, 'These four calls are estimates with their weights in the open, not measurements: disagree with a weight and every figure on the board can be re-derived by hand.')),
          el('section', { class: 'card' },
            el('h3', { text: 'Who is ranked, who is not' }),
            el('p', null, 'The watchlist is the floor: all ' + DATA.watchlist_size + ' of its protocols are ranked, always. Around it the radar applies the watchlist’s own product test at every size. A protocol is ranked when it records no token and is not a wrapped, staked or bridged product of one that trades, not an exchange and not a versioned pool of another protocol.'),
            el('p', null, 'Protocols whose token already trades are set aside, shown at market value in the Live view. No name is special-cased: one function scores every row, and every row’s workings are on its detail page.'),
            el('p', null, 'An implied value is this model’s claim about a launch that has not happened, made from the snapshot alone. It is not a prediction that a token will exist.')),
          landscapeCard()),
        el('div', { class: 'side' },
          el('section', { class: 'card' },
            el('h3', { text: 'The comparable set' }),
            el('p', { class: 'mut', text: 'FDV/TVL by category, after winsorizing and shrinkage. Global median ' + fmtRatio(DATA.global_comp_ratio) + ' over ' + DATA.global_comp_count + ' launched protocols.' }),
            el('table', { class: 'compact' },
              el('thead', null, el('tr', null,
                el('th', { scope: 'col', text: 'Category' }), el('th', { class: 'num', scope: 'col', text: 'Comps' }),
                el('th', { class: 'num', scope: 'col', text: 'Multiple' }))),
              tbody))))
    );
  }

  function foot() {
    return el('div', { class: 'foot', text: 'Data: ' + DATA.source + '. Implied values and the airdrop outlook are the ' + DATA.model_version + ' model’s estimates from that snapshot alone; a protocol shown here records no token in it — a statement about the record, not the world. Farm plans are starting points, not advice.' });
  }

  function render() {
    app.textContent = '';
    var wrap = el('div', { class: 'wrap' });
    // the masthead: ticker, wordmark band, currency row and view tabs
    var mast = el('header', { class: 'masthead' }, ticker(), topbar(), mastctl());
    var selected = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (selected) {
      wrap.appendChild(mast);
      wrap.appendChild(detailView(selected));
    } else {
      mast.appendChild(tabs());
      wrap.appendChild(mast);
      if (state.view === 'live') wrap.appendChild(liveView());
      else if (state.view === 'model') wrap.appendChild(modelView());
      else wrap.appendChild(boardView());
    }
    wrap.appendChild(foot());
    app.appendChild(wrap);
    app.setAttribute('aria-busy', 'false');
  }

  readHash();
  render();
})();
