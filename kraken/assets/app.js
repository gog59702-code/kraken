/* Kraken clone — front-end only. No network calls, no backend. */
(() => {
  "use strict";

  // ── data ───────────────────────────────────────────────────────────────
  const COINS = [
    { sym:"BTC",  name:"Bitcoin",     glyph:"\u20BF", price: 68432.10, chg:  2.41, color:"#f7931a", vol: 18400000000, high: 69180.00, low: 66210.00, held: 0.2142, fav:true },
    { sym:"ETH",  name:"Ethereum",    glyph:"\u039E", price:  3512.44, chg:  1.18, color:"#627eea", vol:  9200000000, high:  3590.20, low:  3402.10, held: 3.412,  fav:true },
    { sym:"SOL",  name:"Solana",      glyph:"\u25CE", price:   168.92, chg:  5.72, color:"#14f195", vol:  3100000000, high:   171.40, low:   157.20, held: 12.5,   fav:true },
    { sym:"XRP",  name:"XRP",         glyph:"\u2715", price:     0.6214,chg: -1.24, color:"#23292f", vol:  1400000000, high:     0.6470,low:     0.6110, held: 0,     fav:false },
    { sym:"ADA",  name:"Cardano",     glyph:"\u25C7", price:     0.4412,chg: -2.87, color:"#0033ad", vol:   640000000, high:     0.4620,low:     0.4350, held: 0,     fav:false },
    { sym:"DOGE", name:"Dogecoin",    glyph:"\u00D0", price:     0.1421,chg:  8.35, color:"#c2a633", vol:   980000000, high:     0.1498,low:     0.1301, held: 2400,  fav:true },
    { sym:"AVAX", name:"Avalanche",   glyph:"\u25B2", price:    34.18,  chg:  3.02, color:"#e84142", vol:   410000000, high:    35.60,  low:    32.90,  held: 0,     fav:false },
    { sym:"LINK", name:"Chainlink",   glyph:"\u25C6", price:    16.42,  chg:  0.88, color:"#3256d6", vol:   380000000, high:    16.98,  low:    15.90,  held: 8.2,   fav:false },
    { sym:"DOT",  name:"Polkadot",    glyph:"\u25CF", price:     6.84,  chg: -3.41, color:"#e6007a", vol:   240000000, high:     7.12,  low:     6.74,  held: 0,     fav:false },
    { sym:"SUI",  name:"Sui",         glyph:"\u25CB", price:     1.842, chg: 11.62, color:"#4da2ff", vol:   310000000, high:     1.910, low:     1.601, held: 420,   fav:true },
    { sym:"ATOM", name:"Cosmos",      glyph:"\u269B", price:     9.12,  chg: -0.94, color:"#2e3148", vol:   180000000, high:     9.44,  low:     8.98,  held: 0,     fav:false },
    { sym:"MATIC",name:"Polygon",     glyph:"\u2B21", price:     0.7812,chg:  4.12, color:"#8247e5", vol:   260000000, high:     0.7960,low:     0.7420, held: 0,     fav:false }
  ];

  const state = {
    view: "home",
    filter: "all",
    side: "buy",
    selected: "BTC",
    range: "1D",
    balanceHidden: false,
    cash: 12480.55
  };

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const coin = sym => COINS.find(c => c.sym === sym);

  // ── formatting ─────────────────────────────────────────────────────────
  const usd = (n, d) => {
    const dec = n >= 1000 ? 2 : n >= 1 ? 2 : 4;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: d ?? dec, maximumFractionDigits: d ?? dec });
  };
  const usdShort = n => {
    if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
    return usd(n);
  };
  const pct = n => (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  const qtyStr = (q, sym) => {
    const v = q >= 1000 ? q.toLocaleString("en-US", { maximumFractionDigits: 1 })
            : q >= 1 ? q.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")
            : q.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return v + " " + sym;
  };

  // ── seeded series ──────────────────────────────────────────────────────
  function mulberry32(a) {
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function series(seed, n, drift = 0, vol = 0.018) {
    const rnd = mulberry32(seed);
    const out = [];
    let v = 100;
    for (let i = 0; i < n; i++) {
      v *= 1 + (rnd() - 0.5) * vol * 2 + drift / n;
      out.push(v);
    }
    return out;
  }
  const coinSeed = sym => sym.split("").reduce((a, c) => a + c.charCodeAt(0) * 97, 7);

  function coinSeries(c, range) {
    const cfg = { "1H": [60, 0.004], "1D": [96, 0.012], "1W": [112, 0.03], "1M": [120, 0.05], "1Y": [140, 0.12] };
    const [n, vol] = cfg[range] || cfg["1D"];
    return series(coinSeed(c.sym) + range.length * 31, n, c.chg / 100, vol);
  }

  // ── canvas helpers ─────────────────────────────────────────────────────
  function fitCanvas(cv) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const r = cv.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (cv.width !== w * dpr || cv.height !== h * dpr) {
      cv.width = w * dpr; cv.height = h * dpr;
    }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function drawLine(cv, data, color, fill = true, pad = 4) {
    if (!cv) return;
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...data), max = Math.max(...data);
    const span = max - min || 1;
    const x = i => (i / (data.length - 1)) * w;
    const y = v => h - pad - ((v - min) / span) * (h - pad * 2);

    if (fill) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, hexA(color, 0.28));
      g.addColorStop(1, hexA(color, 0));
      ctx.beginPath();
      ctx.moveTo(0, h);
      data.forEach((v, i) => ctx.lineTo(x(i), y(v)));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = g;
      ctx.fill();
    }

    ctx.beginPath();
    data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // leading dot
    const lx = x(data.length - 1), ly = y(data[data.length - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = "rgba(11,11,18,.9)"; ctx.lineWidth = 2; ctx.stroke();
  }

  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }

  // ── balances ───────────────────────────────────────────────────────────
  function holdingsValue() {
    return COINS.reduce((s, c) => s + c.held * c.price, 0);
  }
  function totalValue() { return holdingsValue() + state.cash; }

  // ── rows ───────────────────────────────────────────────────────────────
  function coinRow(c) {
    const up = c.chg >= 0;
    return `
      <div class="row" data-coin="${c.sym}">
        <span class="coin-badge" style="background:${c.color}">${c.glyph}</span>
        <div class="row-main">
          <div class="row-name">${c.name}${c.fav ? '<span class="pill">★</span>' : ""}</div>
          <div class="row-sub">${c.sym}</div>
        </div>
        <div class="row-right">
          <div class="row-price">${usd(c.price)}</div>
          <div class="row-chg ${up ? "up" : "down"}">${pct(c.chg)}</div>
        </div>
      </div>`;
  }

  // ── render ─────────────────────────────────────────────────────────────
  function renderHome() {
    const total = totalValue();
    $("#pcValue").textContent = state.balanceHidden ? "••••••" : usd(total);
    const delta = total * 0.0183;
    const el = $("#pcDelta");
    el.textContent = state.balanceHidden
      ? "••••••"
      : `+${usd(delta)} (+1.83%) today`;
    el.className = "pc-delta up";
    drawLine($("#pcSpark"), series(4242, 48, 0.9, 0.008), "#8dffc4", true, 6);

    $("#watchlist").innerHTML = COINS.filter(c => c.fav).map(coinRow).join("");

    const movers = [...COINS].sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg)).slice(0, 6);
    $("#movers").innerHTML = movers.map(c => `
      <div class="mover" data-coin="${c.sym}">
        <div class="mover-top">
          <span class="coin-badge" style="background:${c.color}">${c.glyph}</span>
          <span class="mover-sym">${c.sym}</span>
        </div>
        <div class="mover-price">${usd(c.price)}</div>
        <div class="mover-chg ${c.chg >= 0 ? "up" : "down"}">${pct(c.chg)}</div>
      </div>`).join("");
  }

  function renderMarkets() {
    let list = COINS;
    if (state.filter === "fav") list = COINS.filter(c => c.fav);
    if (state.filter === "gainers") list = COINS.filter(c => c.chg > 0).sort((a, b) => b.chg - a.chg);
    if (state.filter === "losers") list = COINS.filter(c => c.chg < 0).sort((a, b) => a.chg - b.chg);
    if (state.filter === "volume") list = [...COINS].sort((a, b) => b.vol - a.vol);
    $("#marketList").innerHTML = list.map(coinRow).join("");
  }

  function renderTrade() {
    const c = coin(state.selected) || COINS[0];
    $("#tradeCoinBadge").textContent = c.glyph;
    $("#tradeCoinBadge").style.background = c.color;
    $("#tradeCoinName").textContent = `${c.sym} / USD`;
    $("#tradePrice").textContent = usd(c.price);
    const chg = $("#tradeChg");
    chg.textContent = `${pct(c.chg)}  ·  ${state.range}`;
    chg.className = "trade-chg " + (c.chg >= 0 ? "up" : "down");

    drawLine($("#tradeChart"), coinSeries(c, state.range), c.chg >= 0 ? "#2bcf82" : "#f2555a", true);

    const amount = parseFloat($("#orderAmount").value) || 0;
    $("#orderQty").textContent = qtyStr(amount / c.price, c.sym);
    $("#availBal").textContent = usd(state.side === "buy" ? state.cash : c.held * c.price);
    $("#estFee").textContent = usd(amount * 0.0016, 2);
  }

  function renderPortfolio() {
    const hv = holdingsValue();
    $("#pfValue").textContent = state.balanceHidden ? "••••••" : usd(totalValue(), 2);
    $("#pfDelta").textContent = state.balanceHidden ? "••••••" : `+${usd(totalValue() * 0.0183, 2)} (+1.83%) all time`;
    $("#pfDelta").className = "pc-delta up";

    const held = COINS.filter(c => c.held > 0).sort((a, b) => b.held * b.price - a.held * a.price);
    drawDonut($("#allocChart"), held.map(c => ({ v: c.held * c.price, color: c.color })));

    $("#allocLegend").innerHTML = held.map(c => `
      <span class="leg"><i style="background:${c.color}"></i>${c.sym} ${((c.held * c.price) / (hv || 1) * 100).toFixed(0)}%</span>`).join("");

    $("#holdings").innerHTML = held.map(c => {
      const v = c.held * c.price;
      return `
        <div class="row" data-coin="${c.sym}">
          <span class="coin-badge" style="background:${c.color}">${c.glyph}</span>
          <div class="row-main">
            <div class="row-name">${c.name}</div>
            <div class="row-sub">${qtyStr(c.held, c.sym)}</div>
          </div>
          <div class="row-right">
            <div class="row-price">${usd(v, 2)}</div>
            <div class="row-chg ${c.chg >= 0 ? "up" : "down"}">${pct(c.chg)}</div>
          </div>
        </div>`;
    }).join("");
  }

  function drawDonut(cv, slices) {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 4, r = R * 0.66;
    const total = slices.reduce((s, x) => s + x.v, 0) || 1;
    let a = -Math.PI / 2;
    slices.forEach(s => {
      const sweep = (s.v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, R, a, a + sweep - 0.02);
      ctx.arc(cx, cy, r, a + sweep - 0.02, a, true);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
      a += sweep;
    });
  }

  // ── views ──────────────────────────────────────────────────────────────
  const TITLES = { home:"Home", markets:"Markets", trade:"Trade", portfolio:"Portfolio", account:"Account" };

  function go(view) {
    state.view = view;
    $$(".view").forEach(v => v.classList.toggle("is-active", v.dataset.view === view));
    $$(".tab").forEach(t => t.classList.toggle("is-on", t.dataset.goto === view));
    $("#topbarTitle").textContent = TITLES[view] || "Kraken";
    window.scrollTo({ top: 0 });
    if (view === "home") renderHome();
    if (view === "markets") renderMarkets();
    if (view === "trade") renderTrade();
    if (view === "portfolio") renderPortfolio();
  }

  // ── panels ─────────────────────────────────────────────────────────────
  const scrim = $("#scrim"), sheet = $("#sheet"), searchPanel = $("#searchPanel");

  function openSheet(html) {
    $("#sheetBody").innerHTML = html;
    sheet.classList.add("on");
    scrim.classList.add("on");
  }
  function closePanels() {
    sheet.classList.remove("on");
    searchPanel.classList.remove("on");
    scrim.classList.remove("on");
  }
  scrim.addEventListener("click", closePanels);

  function openCoin(sym) {
    const c = coin(sym) || COINS[0];
    state.selected = c.sym;
    const ch = coinSeries(c, "1D");
    openSheet(`
      <div class="sheet-head">
        <span class="coin-badge" style="background:${c.color};width:44px;height:44px;font-size:19px">${c.glyph}</span>
        <div>
          <div class="sheet-title">${c.name}</div>
          <div class="muted-sm">${c.sym} · USD</div>
        </div>
      </div>
      <div class="sheet-price">${usd(c.price)}</div>
      <div class="trade-chg ${c.chg >= 0 ? "up" : "down"}" style="margin-top:4px">${pct(c.chg)} · 24h</div>
      <div class="chart-wrap" style="margin:14px 0 0">
        <canvas id="sheetChart" height="150"></canvas>
      </div>
      <div class="stat-grid">
        <div><span>24h high</span><strong>${usd(c.high)}</strong></div>
        <div><span>24h low</span><strong>${usd(c.low)}</strong></div>
        <div><span>24h volume</span><strong>${usdShort(c.vol)}</strong></div>
        <div><span>Your holdings</span><strong>${c.held ? usd(c.held * c.price, 2) : "—"}</strong></div>
      </div>
      <div class="actions-2">
        <button class="btn-buy" data-quick="buy" data-sym="${c.sym}">Buy</button>
        <button class="btn-sell" data-quick="sell" data-sym="${c.sym}">Sell</button>
      </div>
      <p class="note">Demo interface · prices are simulated</p>
    `);
    const cv = $("#sheetChart");
    if (cv) drawLine(cv, ch, c.chg >= 0 ? "#2bcf82" : "#f2555a", true);
  }

  function openSearch() {
    $("#searchInput").value = "";
    renderSearch("");
    searchPanel.classList.add("on");
    scrim.classList.add("on");
    setTimeout(() => $("#searchInput").focus(), 260);
  }
  function renderSearch(q) {
    const term = q.trim().toLowerCase();
    const list = term
      ? COINS.filter(c => c.sym.toLowerCase().includes(term) || c.name.toLowerCase().includes(term))
      : COINS;
    $("#searchResults").innerHTML = list.length
      ? list.map(coinRow).join("")
      : `<div class="empty-state"><p>No assets match "${q}".</p></div>`;
  }

  // ── order flow ─────────────────────────────────────────────────────────
  function openOrder(sym, side) {
    const c = coin(sym) || COINS[0];
    state.selected = c.sym;
    state.side = side || "buy";
    go("trade");
    $$("#sideSeg .seg-btn").forEach(b => b.classList.toggle("is-on", b.dataset.side === state.side));
    $("#orderAmount").value = "";
    renderTrade();
    closePanels();
  }

  function reviewOrder() {
    const c = coin(state.selected) || COINS[0];
    const amount = parseFloat($("#orderAmount").value) || 0;
    if (amount <= 0) { toast("Enter an amount first"); return; }
    if (amount > state.cash && state.side === "buy") { toast("Insufficient USD balance"); return; }
    const qty = amount / c.price;
    const fee = amount * 0.0016;
    openSheet(`
      <div class="confirm-big">
        <span>You ${state.side === "buy" ? "pay" : "receive"}</span>
        <strong>${usd(amount, 2)}</strong>
        <span style="margin-top:6px">${state.side === "buy" ? "for" : "selling"} ${qtyStr(qty, c.sym)}</span>
      </div>
      <div class="confirm-list">
        <div><span>Asset</span><strong>${c.name} (${c.sym})</strong></div>
        <div><span>Order type</span><strong>${$("#orderType").value}</strong></div>
        <div><span>Price</span><strong>${usd(c.price)}</strong></div>
        <div><span>Estimated fee</span><strong>${usd(fee, 2)}</strong></div>
        <div><span>Total</span><strong>${usd(state.side === "buy" ? amount + fee : amount - fee, 2)}</strong></div>
      </div>
      <button class="primary-btn" id="confirmBtn">Confirm ${state.side}</button>
      <button class="primary-btn ghost" id="cancelBtn" style="margin-top:10px">Cancel</button>
      <p class="note">Demo only — nothing is sent anywhere</p>
    `);
    $("#confirmBtn").addEventListener("click", () => {
      if (state.side === "buy") { state.cash -= amount; c.held += qty; }
      else { const sell = Math.min(qty, c.held); state.cash += sell * c.price; c.held -= sell; }
      closePanels();
      renderTrade(); renderHome(); renderPortfolio();
      toast(`${state.side === "buy" ? "Bought" : "Sold"} ${qtyStr(qty, c.sym)}`, "good");
    });
    $("#cancelBtn").addEventListener("click", closePanels);
  }

  // ── toast ──────────────────────────────────────────────────────────────
  let toastT;
  function toast(msg, kind) {
    const el = $("#toast");
    el.textContent = msg;
    el.className = "toast on" + (kind ? " " + kind : "");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("on"), 2200);
  }

  // ── events ─────────────────────────────────────────────────────────────
  document.addEventListener("click", e => {
    const tab = e.target.closest("[data-goto]");
    if (tab) { go(tab.dataset.goto); return; }

    const row = e.target.closest("[data-coin]");
    if (row) { openCoin(row.dataset.coin); return; }

    const qa = e.target.closest("[data-action]");
    if (qa) {
      const a = qa.dataset.action;
      if (a === "buy" || a === "sell") openOrder(state.selected, a);
      else if (a === "deposit") toast("Deposit flow · demo");
      else if (a === "send") toast("Send flow · demo");
      else if (a === "earn") toast("Earn · up to 5.5% APY · demo");
      else if (a === "convert") toast("Convert · demo");
      return;
    }

    const quick = e.target.closest("[data-quick]");
    if (quick) { openOrder(quick.dataset.sym, quick.dataset.quick); return; }

    const f = e.target.closest("[data-filter]");
    if (f) {
      state.filter = f.dataset.filter;
      $$("#marketFilters .chip").forEach(c => c.classList.toggle("is-on", c === f));
      renderMarkets();
      return;
    }

    const side = e.target.closest("#sideSeg .seg-btn");
    if (side) {
      state.side = side.dataset.side;
      $$("#sideSeg .seg-btn").forEach(b => b.classList.toggle("is-on", b === side));
      renderTrade();
      return;
    }

    const rg = e.target.closest("[data-range]");
    if (rg) {
      state.range = rg.dataset.range;
      $$("#chartRanges .chip").forEach(c => c.classList.toggle("is-on", c === rg));
      renderTrade();
      return;
    }

    const p = e.target.closest("[data-pct]");
    if (p) {
      const c = coin(state.selected) || COINS[0];
      const base = state.side === "buy" ? state.cash : c.held * c.price;
      const v = base * (parseInt(p.dataset.pct, 10) / 100);
      $("#orderAmount").value = v.toFixed(2);
      renderTrade();
      return;
    }
  });

  $("#reviewBtn").addEventListener("click", reviewOrder);
  $("#orderAmount").addEventListener("input", renderTrade);
  $("#orderType").addEventListener("change", renderTrade);

  $("#coinPick").addEventListener("click", () => { openSearch(); });
  $("#searchBtn").addEventListener("click", openSearch);
  $("#bellBtn").addEventListener("click", () => toast("No new notifications"));
  $("#searchInput").addEventListener("input", e => renderSearch(e.target.value));

  $("#eyeBtn").addEventListener("click", () => {
    state.balanceHidden = !state.balanceHidden;
    renderHome(); if (state.view === "portfolio") renderPortfolio();
  });

  $$("#sideSeg .seg-btn").forEach(b => b.addEventListener("click", () => {
    state.side = b.dataset.side;
    $$("#sideSeg .seg-btn").forEach(x => x.classList.toggle("is-on", x === b));
    renderTrade();
  }));

  window.addEventListener("scroll", () => {
    $("#topbar").classList.toggle("scrolled", window.scrollY > 4);
  }, { passive: true });

  let rz;
  window.addEventListener("resize", () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      if (state.view === "home") renderHome();
      if (state.view === "trade") renderTrade();
      if (state.view === "portfolio") renderPortfolio();
    }, 120);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.view === "trade") renderTrade();
  });

  // ── boot ───────────────────────────────────────────────────────────────
  renderHome();
  renderMarkets();
  renderTrade();
  renderPortfolio();
  go("home");
})();
