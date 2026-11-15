// Sonar dashboard. Reads window.RADAR (written beside this folder by main.ts from the same board
// board.json carries) and renders three views: the ranked radar, the live-token set aside, and the
// model itself. Every figure on the page comes from that one object; the page fetches nothing.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('app');
  var state = { view: 'board', q: '', category: 'all', chain: 'all', wl: false, sort: 'rank', dir: 1, selected: null };

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
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

  // ---- state in the hash, so a view can be linked, screenshotted and restored exactly
  function readHash() {
    var h = window.location.hash.replace(/^#/, '');
    if (!h) return;
    var p = new URLSearchParams(h);
    if (p.get('q') !== null) state.q = p.get('q');
    if (p.get('cat')) state.category = p.get('cat');
    if (p.get('chain')) state.chain = p.get('chain');
    if (p.get('wl') === '1') state.wl = true;
    if (p.get('view')) state.view = p.get('view');
    if (p.get('p')) { state.selected = p.get('p'); state.view = 'board'; }
  }
  function writeHash() {
    var p = new URLSearchParams();
    if (state.view !== 'board') p.set('view', state.view);
    if (state.q) p.set('q', state.q);
    if (state.category !== 'all') p.set('cat', state.category);
    if (state.chain !== 'all') p.set('chain', state.chain);
    if (state.wl) p.set('wl', '1');
    if (state.selected) p.set('p', state.selected);
    var s = p.toString();
    window.history.replaceState(null, '', s ? '#' + s : window.location.pathname + window.location.search);
  }

  // ---- filtering and sorting
  function visibleRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.wl && !r.watchlist) return false;
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
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else if (key === 'comp') { av = a.comp_ratio; bv = b.comp_ratio; }
      else if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else { av = a.rank; bv = b.rank; }
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return a.rank - b.rank;
    });
  }

  // ---- chrome
  function topbar() {
    return el('div', { class: 'topbar' },
      el('div', { class: 'brand' },
        el('span', { class: 'pings', 'aria-hidden': 'true' }, el('i'), el('i'), el('i')),
        el('div', null,
          el('h1', null, 'SON', el('em', null, 'AR')),
          el('div', { class: 'tag', text: 'token launch radar — protocols that record no token yet, priced like the ones that launched' })
        )
      ),
      el('div', { class: 'topmeta' },
        el('div', null, 'Snapshot ', el('b', { text: DATA.as_of })),
        el('div', null, 'Model ', el('b', { text: DATA.model_version + ' · comparables' })),
        el('div', null, el('b', { text: DATA.global_comp_count + ' launched comparables' }), ' in the set')
      )
    );
  }

  function stats() {
    var covered = DATA.rows.filter(function (r) { return r.watchlist; }).length;
    var totalImplied = DATA.rows.reduce(function (n, r) { return n + r.implied_value_usd; }, 0);
    function stat(k, v, sub, cls) {
      return el('div', { class: 'stat ' + (cls || '') },
        el('div', { class: 'k', text: k }),
        el('div', { class: 'v' }, v, sub ? el('small', { text: ' ' + sub }) : null));
    }
    return el('div', { class: 'stats' },
      stat('Watchlist covered', String(covered), '/ ' + DATA.watchlist_size, 'amber'),
      stat('Protocols ranked', String(DATA.board_size), '', 'hot'),
      stat('Early finds off the list', String(DATA.early_size), ''),
      stat('Live tokens set aside', String(DATA.live_total), ''),
      stat('Aggregate implied value', fmtUsd(totalImplied), '')
    );
  }

  function toolbar() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Uncategorized'; }))).sort();
    var chainCount = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { chainCount[c] = (chainCount[c] || 0) + 1; }); });
    var chains = Object.keys(chainCount).sort(function (a, b) { return chainCount[b] - chainCount[a] || (a < b ? -1 : 1); });
    var search = el('input', { type: 'search', placeholder: 'Search a protocol, category or chain', value: state.q, 'aria-label': 'Search the board' });
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
    var wlBox = el('input', { type: 'checkbox' });
    if (state.wl) wlBox.setAttribute('checked', 'checked');
    wlBox.addEventListener('change', function () { state.wl = wlBox.checked; writeHash(); render(); });
    function viewBtn(view, label) {
      return el('button', { type: 'button', 'aria-pressed': state.view === view ? 'true' : 'false', text: label,
        onclick: function () { state.view = view; state.selected = null; writeHash(); render(); } });
    }
    return el('div', { class: 'toolbar' },
      el('div', { class: 'grow' }, search),
      catSel, chainSel,
      el('label', { class: 'check' }, wlBox, 'Watchlist only'),
      el('div', { class: 'views' }, viewBtn('board', 'Radar'), viewBtn('live', 'Live tokens'), viewBtn('model', 'The model'))
    );
  }

  // ---- the board
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
    var parts = [el('p', { class: 'count-line' },
      el('b', { text: list.length + ' protocols' }), ' shown · ranked by implied value, the model’s estimate of what a launch would be worth · select a row for its workings and farm plan')];
    if (list.length === 0) {
      parts.push(el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('div', { text: 'No protocol matches that filter.' }),
        el('button', { type: 'button', text: 'Clear filters', onclick: function () {
          state.q = ''; state.category = 'all'; state.chain = 'all'; state.wl = false; writeHash(); render();
        } }))));
      return el('div', null, parts);
    }
    var max = Math.max.apply(null, list.map(function (r) { return r.implied_value_usd; }));
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growthCls = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      tbody.appendChild(el('tr', { tabindex: '0', 'aria-selected': state.selected === r.slug ? 'true' : 'false',
          onclick: function () { openDetail(r.slug); },
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } },
        el('td', { class: 'rank', text: String(r.rank) }),
        el('td', null,
          el('div', null,
            el('span', { class: 'pname', text: r.name }),
            r.watchlist ? el('span', { class: 'badge wl', text: 'Watchlist' }) : el('span', { class: 'badge early', text: 'Early find' })),
          el('div', { class: 'psub', text: (r.category || 'Uncategorized') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || 'chain unrecorded') })),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthCls, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: fmtRatio(r.comp_ratio) }),
        el('td', { class: 'val' },
          el('div', { class: 'valbar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(2, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'big', text: fmtUsd(r.implied_value_usd) }))
      ));
    });
    parts.push(el('div', { class: 'panel' }, el('div', null,
      el('table', null,
        el('caption', { text: 'Pre-token protocols by implied value. Age is how long the protocol has run with no token on record.' }),
        el('thead', null, el('tr', null,
          sortHead('rank', '#'), sortHead('name', 'Protocol'), sortHead('tvl', 'TVL', true),
          sortHead('growth', '7d', true), sortHead('age', 'Age', true), sortHead('comp', 'Comp', true),
          sortHead('implied', 'Implied', true))),
        tbody))));
    return el('div', null, parts);
  }

  // ---- detail
  function splitStep(s) {
    var ci = s.indexOf('. Cost: ');
    if (ci < 0) return { act: s, meta: '' };
    var rest = s.slice(ci + 2);
    var ti = rest.indexOf('. Time: ');
    var cost = ti >= 0 ? rest.slice(0, ti) : rest;
    var time = ti >= 0 ? rest.slice(ti + 2) : '';
    return { act: s.slice(0, ci) + '.', meta: cost + (time ? ' · ' + time : '') };
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
    function fall(what, note, amt, cls) {
      return el('div', { class: 'fall ' + (cls || '') },
        el('div', { class: 'what' }, what, note ? el('small', { text: note }) : null),
        el('div', { class: 'amt', text: amt }));
    }
    var facts = [
      ['Category', row.category || 'Uncategorized'],
      ['Chains', (row.chains || []).join(', ') || 'unrecorded'],
      ['TVL', fmtUsd(row.tvl_usd)],
      ['TVL change, 7d', fmtPct(row.change_7d)],
      ['First tracked', row.listed_at || 'unrecorded'],
      ['Age with no token', fmtAge(row.age_days)],
      ['On the watchlist', row.watchlist ? 'Yes — above the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor' : 'No — an early find'],
      ['Token', 'none on record'],
    ];
    return el('div', null,
      el('button', { class: 'btn ghost', type: 'button', text: '← Back to the board', onclick: function () { state.selected = null; writeHash(); render(); } }),
      el('div', { class: 'detail-head' },
        el('div', null,
          el('div', { class: 'crumb', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
          el('h2', { text: row.name }),
          el('div', { class: 'mut', text: (row.category || 'Uncategorized') + ' · ' + ((row.chains || []).join(', ') || 'chain unrecorded') })),
        el('div', null, row.watchlist ? el('span', { class: 'badge wl', text: 'Watchlist' }) : el('span', { class: 'badge early', text: 'Early find' }))),
      el('div', { class: 'grid' },
        el('section', { class: 'card' },
          el('h3', { text: 'How the model prices it' }),
          el('div', { class: 'falls' },
            fall('TVL in the snapshot', 'the protocol’s own figure', fmtUsd(row.tvl_usd)),
            fall('× comparable multiple ' + fmtRatio(row.comp_ratio), row.comp_count + ' launched ' + (row.category || '') + ' protocols set this price', fmtUsd(Math.round(afterComp))),
            fall('× momentum ' + fmtRatio(row.growth_multiplier), 'seven-day TVL change of ' + fmtPct(row.change_7d), fmtUsd(Math.round(afterGrowth))),
            fall('× track record ' + fmtRatio(row.maturity_multiplier), fmtAge(row.age_days) + ' running with no token on record', fmtUsd(Math.round(afterMat))),
            fall('× breadth ' + fmtRatio(row.breadth_multiplier), (row.chains || []).length + ' chain(s) served', fmtUsd(Math.round(afterMat * row.breadth_multiplier))),
            fall('Implied value', 'an estimate, not a price or a promise', fmtUsd(row.implied_value_usd), 'total'))),
        el('section', { class: 'card' },
          el('h3', { text: 'The record' }),
          el('div', { class: 'facts' }, facts.map(function (f) {
            return el('div', null, el('span', { text: f[0] }), el('b', { text: f[1] }));
          })))),
      el('section', { class: 'card', style: 'margin-top:14px' },
        el('h3', { text: 'Farm plan — ' + row.name }),
        el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
          var parts = splitStep(s);
          return el('li', null, el('div', null,
            el('span', { class: 'act', text: parts.act }),
            parts.meta ? el('span', { class: 'meta', text: parts.meta }) : null));
        })))
    );
  }

  // ---- live tokens, set aside
  function liveView() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null,
          el('span', { class: 'pname', text: r.name }),
          el('div', { class: 'psub', text: (r.category || 'Uncategorized') + ' · ' + ((r.chains || []).slice(0, 3).join(', ') || '') })),
        el('td', { class: 'num', text: r.symbol || '—' }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })));
    });
    return el('div', { class: 'panel' }, el('table', { class: 'compact' },
      el('caption', { text: 'Already trading: the ' + DATA.live_total + ' protocols whose token exists are never ranked by the model — their market cap is a fact, not an estimate. The largest ' + DATA.live.length + ' are shown; their FDV/TVL ratios are the comparables the radar prices from.' }),
      el('thead', null, el('tr', null,
        el('th', { scope: 'col', text: 'Protocol' }), el('th', { class: 'num', scope: 'col', text: 'Symbol' }),
        el('th', { class: 'num', scope: 'col', text: 'TVL' }), el('th', { class: 'num', scope: 'col', text: '7d' }),
        el('th', { class: 'num', scope: 'col', text: 'Market cap' }))),
      tbody));
  }

  // ---- the model, stated
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
      el('div', { class: 'model-cols' },
        el('section', { class: 'card' },
          el('h3', { text: 'Where each factor comes from' }),
          el('p', null, el('b', { text: 'R — the comparable multiple. ' }), 'Every launched protocol in the snapshot gives one FDV/TVL observation. Each is winsorized to [' + m.ratio_winsor_low + ', ' + m.ratio_winsor_high + '] so a freak ratio cannot set a price, the category takes its median, and the median is shrunk toward the global median (' + fmtRatio(DATA.global_comp_ratio) + ' over ' + DATA.global_comp_count + ' protocols) with a prior of ' + m.ratio_prior_strength + ' observations. Thin categories borrow the market’s price; deep ones speak for themselves.'),
          el('p', null, el('b', { text: 'G — momentum. ' }), '1 + clamp(change_7d, ' + m.growth_floor_pct + ', ' + m.growth_cap_pct + ') × ' + m.growth_weight + ', floored at ' + m.growth_min_factor + '. TVL gathering into a launch is worth more than the same TVL draining.'),
          el('p', null, el('b', { text: 'M — track record. ' }), m.maturity_base + ' + ' + m.maturity_range + ' × (1 − exp(−age / ' + m.maturity_tau_days + ' days)). Years run with no token on record mean a proven product a launch can price; an unrecorded listing date counts as ' + m.unknown_age_days + ' days.'),
          el('p', null, el('b', { text: 'B — breadth. ' }), '1 + ' + m.breadth_per_chain + ' per extra chain served, capped at ' + m.breadth_max_chains + '. Distribution a token launches into is worth a little, not a lot.')),
        el('section', { class: 'card' },
          el('h3', { text: 'Who is ranked, who is not' }),
          el('p', null, 'The watchlist is the floor: all ' + DATA.watchlist_size + ' of its protocols are ranked, always. Around it the radar applies the watchlist’s own product test at every size. A protocol is ranked when it records no token and is not a wrapped, staked or bridged product of one that trades, not an exchange and not a versioned pool of another protocol.'),
          el('p', null, 'Protocols whose token already trades are set aside and shown at market value in the Live view. No protocol name is special-cased anywhere in the model: one function scores every row, and the workings of every row are on its detail page.'),
          el('p', null, 'An implied value is this model’s claim about a launch that has not happened, made from the snapshot alone. It is not a prediction that a token will exist.'))),
      el('section', { class: 'card', style: 'margin-top:14px' },
        el('h3', { text: 'The comparable set — FDV/TVL by category, after winsorizing and shrinkage' }),
        el('table', { class: 'compact' },
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Category' }), el('th', { class: 'num', scope: 'col', text: 'Launched comparables' }),
            el('th', { class: 'num', scope: 'col', text: 'Multiple used' }))),
          tbody))
    );
  }

  function foot() {
    return el('div', { class: 'foot', text: 'Data: ' + DATA.source + '. Implied values are the ' + DATA.model_version + ' model’s estimates from that snapshot alone; a protocol shown here records no token in it, which is a statement about the record, not about the world. Farm plans are starting points, not advice.' });
  }

  function render() {
    app.textContent = '';
    var wrap = el('div', { class: 'wrap' });
    wrap.appendChild(topbar());
    wrap.appendChild(stats());
    var selected = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    if (selected) {
      wrap.appendChild(detailView(selected));
    } else {
      wrap.appendChild(toolbar());
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
