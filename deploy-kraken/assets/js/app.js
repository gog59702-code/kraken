/* Kraken — reproduction de l'app Android 3.89.0. Prix crypto en direct : Binance, repli CoinGecko. */
(() => {
  "use strict";

  // ── catalogue ───────────────────────────────────────────────────────
  const C = (sym, name, price, chg, icon) => ({ sym, name, price, chg, icon, type: "crypto" });
  const S = (sym, name, price, chg, letter, color, icon) => ({ sym, name, price, chg, letter, color, icon, type: "stock" });

  const ASSETS = [
    C("BTC", "Bitcoin", 58232.40, -2.29, "assets/img/coins/btc.svg"),
    C("USDC", "USDC", 0.91, -0.25, "assets/img/coins/usdc.svg"),
    C("ETH", "Ethereum", 1635.00, -2.11, "assets/img/coins/eth.svg"),
    S("NVDAx", "NVIDIA", 156.66, -3.80, "N", "#76b900", "assets/img/stocks/nvda.svg"),
    C("SOL", "Solana", 64.22, -2.31, "assets/img/coins/sol.svg"),
    S("SOXLx", "Direxion Daily Semiconductor Bull 3X ETF", 50.64, -13.18, "X", "#1f4f8f", null),
    S("ROKUx", "Roku", 159.98, -0.36, "R", "#6f2fa0", "assets/img/stocks/roku.svg"),
    C("XRP", "XRP", 0.86, -1.86, "assets/img/coins/xrp.svg"),
    S("QQQx", "Invesco Nasdaq ETF", 670.22, -1.43, "Q", "#1a3fd0", null),
    S("KVUEx", "Kenvue", 19.40, 0.67, "K", "#0aa38a", null),
    S("AAPLx", "Apple", 357.19, 0.05, "", "#101114", "assets/img/stocks/aapl.svg"),
    S("MSFTx", "Microsoft", 486.20, 0.21, "M", "#f25022", "assets/img/stocks/msft.svg"),
    S("GOOGLx", "Alphabet (Class A)", 322.15, 0.16, "G", "#4285f4", "assets/img/stocks/googl.svg"),
    C("HYPE", "Hyperliquid", 59.51, -3.03, "assets/img/coins/hyperliquid.png"),
    S("MUx", "Micron Technology", 730.45, -6.13, "M", "#1a4fa0", null),
    S("AMDx", "Advanced Micro Devices", 500.93, -6.22, "A", "#101114", "assets/img/stocks/amd.svg"),
    S("SPCXx", "SpaceX", 138.59, -0.37, "S", "#101114", "assets/img/stocks/spcx.svg"),
    S("SPYx", "SPDR S&P 500 ETF", 748.88, -0.71, "S", "#1a3fd0", null),
    C("ADA", "Cardano", 0.1376, -2.76, "assets/img/coins/ada.svg"),
    C("DOGE", "Dogecoin", 0.0530, -1.54, "assets/img/coins/doge.svg"),
    C("SUI", "Sui", 0.6462, -2.94, "assets/img/coins/sui.svg"),
    C("LINK", "Chainlink", 8.23, -3.02, "assets/img/coins/link.svg"),
    C("AVAX", "Avalanche", 6.45, -2.61, "assets/img/coins/avax.svg"),
    C("DOT", "Polkadot", 0.6580, -2.23, "assets/img/coins/dot.svg")
  ];

  // paniers (lots) affichés en favoris
  const BUNDLES = [
    { sym: "DUO", name: "Duo BTC/ETH", chg: -2.23, img: "bundle_duo.webp", members: ["BTC", "ETH"] },
    { sym: "USR", name: "Réserve stratégique des États-Unis", chg: -2.52, img: "bundle_usr.webp", members: ["BTC", "XRP", "SOL", "ETH"] }
  ];

  const bySym = s => ASSETS.find(a => a.sym === s);
  const CRYPTOS = () => ASSETS.filter(a => a.type === "crypto");

  // ── état persistant ─────────────────────────────────────────────────
  const DEFAULTS = {
    first: "bernard",
    last: "",
    email: "bernard@exemple.com",
    created: "2014-03-12",
    cash: 1240.58,
    gas: 2.40,
    favorites: ["BTC", "ETH", "DUO", "USR"],
    balances: { BTC: 0.0012, USDC: 45, SOL: 0.3, ETH: 0.00042 },
    fees: {},
    usdcFee: {},
    addresses: {},
    feeAddresses: {},
    customAssets: [],
    actSeed: null,
    rev: 0
  };
  const KEY = "kraken_demo_v4";

  // Copie profonde sans structuredClone : cette API manque sur les WebKit
  // antérieurs à Safari 15.4 et faisait planter load() au démarrage.
  // Déclaration de fonction (hoistée) : load() l'appelle avant sa ligne.
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  let ST = load();

  // Actifs ajoutés depuis la console embarquée : ils entrent dans le
  // catalogue comme les autres, donc ils survivent au rechargement et à
  // la synchro ntfy.
  function applyCustomAssets() {
    (Array.isArray(ST.customAssets) ? ST.customAssets : []).forEach(x => {
      const sym = String((x && x.sym) || "").trim().toUpperCase();
      if (!sym || bySym(sym)) return;
      // En tête de liste : un actif ajouté doit se voir tout de suite.
      ASSETS.unshift(C(sym, String(x.name || sym), Math.max(0, Number(x.price) || 0), 0, ""));
    });
  }
  applyCustomAssets();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return clone(DEFAULTS);
      const p = JSON.parse(raw);
      return {
        ...clone(DEFAULTS), ...p,
        favorites: Array.isArray(p.favorites) ? p.favorites : DEFAULTS.favorites,
        balances: { ...(p.balances || {}) },
        fees: { ...(p.fees || {}) },
        usdcFee: { ...(p.usdcFee || {}) },
        addresses: { ...(p.addresses || {}) },
        feeAddresses: { ...(p.feeAddresses || {}) },
        customAssets: Array.isArray(p.customAssets) ? p.customAssets : [],
        actSeed: Array.isArray(p.actSeed) ? p.actSeed : null
      };
    } catch { return clone(DEFAULTS); }
  }
  const saveLocal = () => localStorage.setItem(KEY, JSON.stringify(ST));
  const save = () => saveLocal();

  // ── formats ─────────────────────────────────────────────────────────
  const nf = (n, d = 2) => (Number.isFinite(+n) ? +n : 0).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (n, d) => nf(n, d ?? (Math.abs(n) < 1 ? 4 : 2)) + " €";
  const decFor = (a) => {
    if (a.type === "stock") return 2;
    const p = a.price;
    if (p >= 0.1) return 2;
    if (p >= 0.01) return 4;
    return 6;
  };
  const px = (a) => nf(priceOf(a), decFor(a));
  const usd = (n, d = 2) => nf(n, d) + " $US";
  const big = (n) => {
    if (!Number.isFinite(n) || n === 0) return "0 €";
    if (n >= 1e11) return nf(n / 1e12, 1) + " Bn €";
    if (n >= 1e9) return nf(n / 1e9, 1) + " Md €";
    if (n >= 1e6) return nf(n / 1e6, 1) + " M €";
    return eur(n, 0);
  };
  const pct = n => (n >= 0 ? "↗" : "↘") + nf(Math.abs(n), 2);
  const fx = () => (Number.isFinite(API.eurusd) && API.eurusd > 0 ? API.eurusd : 1.08);
  const priceOf = a => a.type === "stock" ? a.price * fx() : a.price;
  const cash = () => Number(ST.cash) || 0;
  const qty = sym => Number(ST.balances[sym]) || 0;
  const totalEUR = () => cash() + CRYPTOS().reduce((s, a) => s + qty(a.sym) * a.price, 0);

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ── API prix ────────────────────────────────────────────────────────
  const API = {
    binance: "https://api.binance.com/api/v3",
    gecko: "https://api.coingecko.com/api/v3",
    ids: {
      BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", ADA: "cardano",
      DOGE: "dogecoin", SUI: "sui", LINK: "chainlink", AVAX: "avalanche-2", DOT: "polkadot",
      USDC: "usd-coin", HYPE: "hyperliquid"
    },
    live: false,
    eurusd: 1.08
  };
  const PCACHE = "kraken_prices_v3";

  const jget = url => fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

  async function tick() {
    const cryptos = ASSETS.filter(a => a.type === "crypto" && API.ids[a.sym]);
    try {
      const res = await Promise.allSettled(cryptos.map(a =>
        jget(`${API.binance}/ticker/24hr?symbol=${a.sym}EUR`)
      ));
      let n = 0;
      res.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const d = r.value, a = cryptos[i];
        if (!d || !+d.lastPrice) return;
        a.price = +d.lastPrice;
        a.chg = +d.priceChangePercent;
        n++;
      });
      if (!n) throw new Error("binance");
      try {
        const p = await jget(`${API.binance}/ticker/price?symbol=BTCUSDT`);
        if (+p.price > 0 && bySym("BTC").price > 0) API.eurusd = +p.price / bySym("BTC").price;
      } catch {}
      API.live = true;
    } catch {
      try {
        const ids = [...new Set(Object.values(API.ids))].join(",");
        const j = await jget(`${API.gecko}/simple/price?ids=${ids}&vs_currencies=eur,usd&include_24hr_change=true`);
        for (const [sym, id] of Object.entries(API.ids)) {
          const d = j[id]; const a = bySym(sym);
          if (!d || !a) continue;
          a.price = d.eur; a.chg = d.eur_24h_change ?? a.chg;
          if (d.usd && d.eur > 0) API.eurusd = d.usd / d.eur;
        }
        API.live = true;
      } catch { API.live = false; }
    }
    try {
      localStorage.setItem(PCACHE, JSON.stringify({
        eurusd: API.eurusd,
        q: ASSETS.map(a => [a.sym, a.price, a.chg])
      }));
    } catch {}
    markPrices();
    refresh();
  }

  function loadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(PCACHE) || "null");
      if (!c) return;
      if (c.eurusd) API.eurusd = c.eurusd;
      for (const [sym, p, ch] of c.q || []) {
        const a = bySym(sym);
        if (a && Number.isFinite(p)) { a.price = p; a.chg = ch ?? a.chg; }
      }
    } catch {}
  }

  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (!document.hidden) await tick();
      schedule();
    }, API.live ? 9000 : 22000);
  }

  // ── navigation ──────────────────────────────────────────────────────
  function screen(name) {
    $$(".screen").forEach(x => x.classList.remove("is-on"));
    const el = $("#" + name);
    if (el) el.classList.add("is-on");
    scrollTo({ top: 0 });
  }

  let VIEW = "home";
  function go(v) {
    VIEW = v;
    $$(".view").forEach(x => x.classList.toggle("is-on", x.dataset.view === v));
    $$(".tab").forEach(t => {
      const on = t.dataset.goto === v;
      t.classList.toggle("is-on", on);
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });
    renderHead();
    scrollTo({ top: 0 });
    if (v === "home") renderHome();
    if (v === "explorer") { renderStrip(); renderPredict(); }
    if (v === "portfolio") renderPortfolio();
  }

  // ── rendu : en-tête ─────────────────────────────────────────────────
  function renderHead() {
    const ini = ((ST.first || "?")[0] || "?").toUpperCase();
    const av = $("#avatarIni");
    if (av) av.textContent = ini;
    $("#balancePill").textContent = eur(totalEUR(), 2);
    $("#appHead").classList.toggle("no-pill", VIEW === "home");
    $("#headRight").classList.toggle("grouped", VIEW === "portfolio");
    const kb = $("#headMore");
    if (kb) kb.classList.toggle("on", VIEW === "portfolio");
  }

  // ── icônes d'actif ──────────────────────────────────────────────────
  const iconFor = a => {
    if (a.icon) return `<img class="coin" src="${a.icon}" alt="">`;
    return `<span class="coin coin-badge" style="background:${a.color || "#101114"}">${a.letter || a.sym[0]}</span>`;
  };

  // ── rendu : accueil ─────────────────────────────────────────────────
  let homeCat = "fav";

  function rowHTML(a) {
    const bal = qty(a.sym);
    return `<div class="row" data-asset="${a.sym}">
      ${iconFor(a)}
      <div class="row-main">
        <div class="row-name">${a.name}</div>
        <div class="row-sub">${bal > 0 ? nf(bal, 6).replace(/0+$/, "").replace(/,$/, "") + " " + a.sym : a.sym}</div>
      </div>
      <div class="row-right">
        <div class="row-price">${a.type === "stock" ? usd(a.price) : px(a) + " €"}</div>
        <div class="row-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</div>
      </div>
    </div>`;
  }

  function bundleHTML(b) {
    const imgs = b.members.map(m => `<img class="mini-coin" src="${bySym(m).icon}" alt="">`).join("");
    return `<div class="row" data-bundle="${b.sym}">
      <img class="coin" src="assets/img/${b.img}" alt="">
      <div class="row-main">
        <div class="row-name">${b.name}</div>
        <div class="row-chg ${b.chg >= 0 ? "chg-up" : "chg-down"}" style="font-size:14px">${pct(b.chg)}</div>
      </div>
      <div class="row-right"><div class="duo-mini">${imgs}</div></div>
    </div>`;
  }

  function renderHome() {
    let html = "";
    if (homeCat === "fav") {
      const favs = ST.favorites.filter(s => bySym(s) && bySym(s).type === "crypto");
      html += favs.map(s => rowHTML(bySym(s))).join("");
      html += BUNDLES.filter(b => ST.favorites.includes(b.sym)).map(bundleHTML).join("");
    } else {
      let list = ASSETS.slice();
      if (homeCat === "crypto") list = list.filter(a => a.type === "crypto");
      if (homeCat === "xstocks") list = list.filter(a => a.type === "stock");
      if (homeCat === "perp" || homeCat === "forex") list = [];
      html += list.slice(0, 12).map(rowHTML).join("");
    }
    $("#homeList").innerHTML = html ||
      `<p class="muted" style="padding:22px 0;text-align:center">Aucun actif dans cette catégorie.</p>`;
  }

  function renderStrip() {
    const picks = ["AAPLx", "MSFTx", "NVDAx", "GOOGLx"].map(bySym);
    $("#assetStrip").innerHTML = picks.map(a => `
      <button class="acard" data-asset="${a.sym}">
        ${iconFor(a)}
        <span class="acard-name">${a.name}</span>
        <span class="acard-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</span>
      </button>`).join("");
  }

  function renderPredict() {
    const btc = bySym("BTC");
    const p = btc.price;
    const step = p > 10000 ? 1000 : 100;
    const up = (Math.floor(p / step) + 1) * step;
    const down = (Math.ceil(p / step) - 1) * step;
    const odds = v => nf(100 * (up + down) / v, 2);
    const bal = predBalance();
    $("#predicts").innerHTML = `
      <div class="predict" id="predCard">
        <div class="predict-head">
          <span class="pred-live"><i></i>Prévision en cours</span>
          <span class="pred-timer">Se termine dans 14 min</span>
        </div>
        <div class="predict-top">
          <img class="coin" src="${btc.icon}" alt="">
          <div>
            <b>Quel prix l'actif Bitcoin va-t-il atteindre ensuite ?</b>
            <span class="predict-sub">Prix actuel : ${usd(p * fx())}</span>
          </div>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(up * fx())}</div>
            <div class="pred-odds up">$100 → ${usd(odds(up * fx()))}</div></div>
          <button class="go up" data-pred="up"><svg viewBox="0 0 24 24" class="ico"><path d="M7 17L17 7M9 7h8v8"/></svg></button>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(down * fx())}</div>
            <div class="pred-odds down">$100 → ${usd(odds(down * fx()))}</div></div>
          <button class="go down" data-pred="down"><svg viewBox="0 0 24 24" class="ico"><path d="M7 7l10 10M9 17h8v-8"/></svg></button>
        </div>
        <div class="pred-bal" id="predBal">
          <span>Solde disponible</span><b>${eur(bal, 2)}</b>
        </div>
      </div>`;
    $$("#predicts .go").forEach(b => b.addEventListener("click", () => {
      const el = $("#predBal");
      if (el) el.hidden = false;
      toast(b.dataset.pred === "up" ? "Prévision à la hausse enregistrée" : "Prévision à la baisse enregistrée");
    }));
    $("#predCard")?.addEventListener("click", e => {
      if (e.target.closest(".go")) return;
      const el = $("#predBal");
      if (el) el.hidden = !el.hidden;
    });
  }

  const predBalance = () => Math.max(0, Number(ST.pred) || cash());

  // ── rendu : portefeuille ────────────────────────────────────────────
  function renderPortfolio() {
    const total = totalEUR();
    const pfBal = $("#pfBal"), hugeBal = $("#hugeBal");
    if (pfBal) { pfBal.textContent = eur(total, 2); pfBal.classList.toggle("has", total > 0); }
    if (hugeBal) { hugeBal.textContent = eur(total, 2); hugeBal.classList.toggle("has", total > 0); }
    if ($("#cashRow")) $("#cashRow").textContent = eur(cash(), 2);
    if ($("#welcome")) $("#welcome").textContent = "Bienvenue, " + (ST.first || "bernard");

    const held = CRYPTOS().filter(a => qty(a.sym) > 0);
    const card = $("#cryptoCard");
    if (card) card.style.display = held.length ? "" : "none";
    if ($("#holdRows")) $("#holdRows").innerHTML = held.map(a => {
      const q = qty(a.sym), v = q * a.price;
      return `<div class="row" data-asset="${a.sym}">
        ${iconFor(a)}
        <div class="row-main">
          <div class="row-name">${a.name}</div>
          <div class="row-sub">${nf(q, 6).replace(/0+$/, "").replace(/,$/, "")} ${a.sym}</div>
        </div>
        <div class="row-right">
          <div class="row-price">${eur(v, 2)}</div>
          <div class="row-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</div>
        </div>
      </div>`;
    }).join("");

    renderActivity();
  }

  // ── activité : historique de compte ─────────────────────────────────
  const ACT_SEED = [
    { t: "Dépôt reçu", s: "Virement bancaire · EUR", a: "+250,00 €", up: true, d: "12 nov. 2026 · 09:14" },
    { t: "Achat", s: "0,0012 BTC · ordre au marché", a: "-69,88 €", up: false, d: "11 nov. 2026 · 18:02" },
    { t: "Envoi", s: "45,00 USDC · Polygon", a: "-45,00 USDC", up: false, d: "09 nov. 2026 · 15:37" },
    { t: "Dépôt reçu", s: "0,30 SOL · adresse de réception", a: "+0,30 SOL", up: true, d: "07 nov. 2026 · 21:08" },
    { t: "Récompenses de staking", s: "ETH 2.0 · distribution hebdomadaire", a: "+0,00042 ETH", up: true, d: "04 nov. 2026 · 06:00" },
    { t: "Conversion", s: "100,00 € → 100,00 USDC", a: "100,00 USDC", up: true, d: "02 nov. 2026 · 11:45" }
  ];

  // L'historique vit dans l'état : il peut donc être supprimé ligne par
  // ligne (ou vidé) depuis la console embarquée, et survivre au rechargement.
  function actSeedList() {
    if (!Array.isArray(ST.actSeed)) {
      ST.actSeed = clone(ACT_SEED);
      saveLocal();
    }
    return ST.actSeed;
  }

  function activityList() {
    const mine = notifList()
      .filter(n => (n.kind === "deposit" || n.kind === "withdraw") && !n.hidden)
      .map(n => ({
        id: "n:" + n.id,
        t: n.kind === "deposit" ? "Dépôt reçu" : "Retrait envoyé",
        s: n.addr ? (n.asset || "Crypto") + " · " + shortAddr(n.addr) : (n.asset || "Crypto"),
        a: (n.kind === "deposit" ? "+" : "-") + (n.asset && n.asset !== "EUR" ? qtyTxt(n.amount, n.asset) : eur(n.amount, 2)),
        up: n.kind === "deposit",
        d: fmtWhen(n.at)
      }));
    return mine.concat(actSeedList().map((x, i) => ({ ...x, id: "s:" + i })));
  }

  function deleteAct(id) {
    const k = String(id || "");
    if (k.startsWith("s:")) {
      const i = Number(k.slice(2));
      const list = actSeedList();
      if (i >= 0 && i < list.length) list.splice(i, 1);
    } else if (k.startsWith("n:")) {
      const nid = k.slice(2);
      notifSave(notifList().filter(n => String(n.id) !== nid));
    }
    saveLocal();
    try { renderActivity(); } catch { }
  }

  function clearActs() {
    ST.actSeed = [];
    notifSave(notifList().filter(n => n.kind !== "deposit" && n.kind !== "withdraw"));
    saveLocal();
    try { renderActivity(); } catch { }
  }

  function actRowHTML(x) {
    return `<div class="act-row">
      <span class="act-ico ${x.up ? "is-in" : "is-out"}">
        <svg viewBox="0 0 24 24" class="ico"><path d="${x.up ? "M12 19V5M6 11l6-6 6 6" : "M12 5v14M6 13l6 6 6-6"}"/></svg>
      </span>
      <div class="act-main">
        <div class="act-title">${x.t}</div>
        <div class="act-sub">${x.s}</div>
      </div>
      <div class="act-val">
        <div class="act-amt ${x.up ? "up" : ""}">${x.a}</div>
        <div class="act-cur">${x.d}</div>
      </div>
    </div>`;
  }

  function renderActivity() {
    const box = $("#activityRows");
    if (!box) return;
    box.innerHTML = activityList().slice(0, 5).map(actRowHTML).join("");
  }

  function sheetActivity() {
    openSheet(`<div class="sheet-title">Activité</div>
      <p class="sheet-sub">Historique du compte depuis le 12 mars 2014.</p>
      <div class="activity-list">${activityList().map(actRowHTML).join("")}</div>`);
  }

  // ── panneau de configuration maquette (accès : appui long avatar) ──
  function sheetMock() {
    const nets = USDC_NETS;
    openSheet(`<div class="sheet-title">Configuration maquette</div>
      <p class="sheet-sub">Valeurs locales pour la démonstration. Rien n'est envoyé ni signé : aucun argent réel.</p>
      <p class="sheet-label">Thème</p>
      <div class="seg" id="mkTheme">
        <button data-theme-opt="dark" class="${curTheme() === "dark" ? "is-on" : ""}">Sombre</button>
        <button data-theme-opt="light" class="${curTheme() === "light" ? "is-on" : ""}">Clair</button>
      </div>
      <div class="mock-grid">
        <label class="mock-field"><span>Adresse de réception USDC (EVM)</span>
          <input id="mkEvm" value="${CFG.addrEvm}" spellcheck="false" autocomplete="off"></label>
        <label class="mock-field"><span>Adresse de réception USDC (Solana)</span>
          <input id="mkSol" value="${CFG.addrSol}" spellcheck="false" autocomplete="off"></label>
      </div>
      <p class="sheet-label">Frais réseau</p>
      <div class="mock-grid mock-grid--full">
        <label class="mock-field"><span>Adresse de perception des frais (EVM)</span>
          <input id="mkFeeAddr" value="${feeAddrFor()}" spellcheck="false" autocomplete="off" aria-label="Adresse de perception des frais (EVM)"></label>
      </div>
      <p class="sheet-label">Montant des frais USDC (€)</p>
      <div class="mock-grid">
        ${nets.map(n => `<label class="mock-field"><span>${n.label}</span>
          <input id="mkFee-${n.id}" inputmode="decimal" value="${String(cfgUsdcFee(n.id)).replace(".", ",")}" autocomplete="off"></label>`).join("")}
      </div>
      <p class="sheet-note">Les frais réseau prélevés sont rattachés à l'adresse de perception ci-dessus.</p>
      <button class="btn-black" id="mkSave">Enregistrer</button>
      <button class="btn-ghost wide" id="mkDep">Simuler un dépôt reçu</button>
      <button class="btn-ghost wide" id="mkWd">Simuler un retrait envoyé</button>
      <button class="btn-ghost wide" id="mkReset">Réinitialiser la maquette</button>`);

    $("#mkSave").addEventListener("click", () => {
      const feeAddr = $("#mkFeeAddr").value.trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(feeAddr)) {
        toast("Adresse de perception des frais invalide");
        return;
      }
      CFG.addrEvm = $("#mkEvm").value.trim() || CFG_DEFAULT.addrEvm;
      CFG.addrSol = $("#mkSol").value.trim() || CFG_DEFAULT.addrSol;
      CFG.feeAddr = feeAddr;
      nets.forEach(n => {
        const v = Math.max(0, parseAmt($("#mkFee-" + n.id).value));
        CFG.usdcFee[n.id] = v;
        // La feuille de maquette reste prioritaire sur l'état publié.
        if (ST.usdcFee) ST.usdcFee[n.id] = v;
      });
      saveCfg(); closeSheet(); renderAll();
    });
    $("#mkTheme").addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-opt]");
      if (!b) return;
      applyTheme(b.dataset.themeOpt);
      $$("#mkTheme button").forEach(x => x.classList.toggle("is-on", x === b));
    });
    $("#mkDep").addEventListener("click", () => {
      addNotif({ id: "dep" + Date.now().toString(36), kind: "deposit", asset: "USDC", amount: 250, at: Date.now(),
        text: "Dépôt de 250,00 USDC reçu sur votre compte." });
      closeSheet();
    });
    $("#mkWd").addEventListener("click", () => {
      addNotif({ id: "wd" + Date.now().toString(36), kind: "withdraw", asset: "USDC", amount: 45, addr: CFG.addrEvm, feeAddr: feeAddrFor("USDC"), at: Date.now(),
        text: "Retrait de 45,00 USDC envoyé." });
      closeSheet();
    });
    $("#mkReset").addEventListener("click", () => {
      localStorage.removeItem(CFGKEY);
      Object.assign(CFG, CFG_DEFAULT, { usdcFee: Object.assign({}, CFG_DEFAULT.usdcFee) });
      closeSheet(); renderAll();
    });
  }

  function sheetProfile() {
    const ini = (ST.first || "?").charAt(0).toUpperCase();
    const email = String(ST.email || "");
    const at = email.indexOf("@");
    const masked = at > 1 ? email.slice(0, 2) + "***" + email.slice(at) : email || "-";
    const row = (id, ico, title, val = "", extra = "") => `<button class="acct-row" ${id ? `id="${id}"` : ""} type="button">
      <span class="acct-ico">${ico}</span>
      <span class="acct-main"><b>${title}</b>${val ? `<i>${val}</i>` : ""}</span>
      ${extra}
      <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
    </button>`;
    openSheet(`<div class="acct">
      <div class="sheet-title">Compte</div>
      <div class="acct-card">
        <div class="acct-av">${ini}</div>
        <div class="acct-name">${ST.first || "Compte"}</div>
        <div class="acct-mail">${masked}</div>
        <button class="btn-ghost" id="acctManage" type="button">Gérer mon compte</button>
      </div>

      <button class="acct-inbox" id="acctInbox" type="button">
        <span class="acct-ico acct-ico-inbox">
          <svg viewBox="0 0 24 24" class="ico"><path d="M4 5h9l2 3h5v11H4z"/><path d="M8 12h8"/></svg>
          <span class="acct-dot" id="acctDot" hidden></span>
        </span>
        <span class="acct-main">
          <b>Boîte de réception</b>
          <i>Toutes les mises à jour de vos comptes et produits au même endroit.</i>
        </span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>

      <div class="acct-sect">Paramètres</div>
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M3 9h18v10H3z"/><path d="M3 9l2-4h14l2 4"/><path d="M12 13v3"/></svg>`, "Méthodes de paiement")}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>`, "Préférences")}
      ${row("acctNotifs", `<svg viewBox="0 0 24 24" class="ico"><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.4 19a1.8 1.8 0 0 0 3.2 0"/></svg>`, "Notifications")}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg>`, "Sécurité", "", `<span class="acct-badge">Configurer la 2FA</span>`)}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><rect x="7" y="2.6" width="10" height="18.8" rx="2.2"/><path d="M10.6 18.6h2.8"/></svg>`, "Gestion d'appareils")}

      <div class="acct-sect">Plus</div>
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>`, "Documents")}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M13 2L4.5 13H11l-1 9 8.5-11H12z"/></svg>`, "Support")}
      ${iaUnlocked() ? row("acctConsole", `<svg viewBox="0 0 24 24" class="ico"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/></svg>`, "Console Kraken", "Accès administrateur") : ""}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`, "Envoyer des commentaires")}
    </div>`);
    const go = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
    go("#acctInbox", () => { closeSheet(); openNotifs(); });
    go("#acctNotifs", () => { closeSheet(); sheetNotifSettings(); });
    go("#acctManage", () => toast("Bientôt disponible"));
    go("#acctConsole", () => { closeSheet(); openConsole(); });
    $$(".acct-row:not(#acctNotifs):not(#acctConsole)").forEach(el => el.addEventListener("click", () => toast("Bientôt disponible")));
    const dot = $("#acctDot");
    if (dot) dot.hidden = unreadCount() === 0;
  }

  // ── rendu : recherche ───────────────────────────────────────────────
  let searchFilter = "all";
  function renderSearch(q = "") {
    let list = ASSETS.slice();
    if (searchFilter === "crypto") list = list.filter(a => a.type === "crypto");
    if (searchFilter === "stocks") list = list.filter(a => a.type === "stock");
    if (searchFilter === "perp" || searchFilter === "forex") list = [];
    const t = q.trim().toLowerCase();
    if (t) list = list.filter(a => a.sym.toLowerCase().includes(t) || a.name.toLowerCase().includes(t));
    $("#searchList").innerHTML = list.length
      ? list.map(rowHTML).join("")
      : `<div class="empty-state">
           <svg viewBox="0 0 24 24" class="ico"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
           <b>Aucun actif trouvé</b>
           <p>Essayez un autre nom ou un autre symbole.</p>
         </div>`;
  }

  // ── fiche actif ─────────────────────────────────────────────────────
  const RANGES = {
    "24H": { interval: "15m", limit: 96 },
    "1S": { interval: "1h", limit: 168 },
    "1M": { interval: "4h", limit: 180 },
    "6M": { interval: "12h", limit: 182 },
    "1A": { interval: "1d", limit: 365 },
    "5A": { interval: "1w", limit: 260 },
    "TOUT": { interval: "1M", limit: 120 }
  };
  let CURRENT = null, RANGE = "24H";

  function syntheticSeries(base, n = 96) {
    const out = []; let v = base * 1.02;
    for (let i = 0; i < n; i++) {
      v *= 1 + (Math.sin(i / 7) * 0.004 + Math.cos(i / 3.1) * 0.003);
      out.push(v);
    }
    out.push(base);
    return out;
  }

  const COIN_COLOR = {
    BTC: "#f7931a", ETH: "#627eea", SOL: "#14b57a", XRP: "#101114", ADA: "#0033ad",
    DOGE: "#c2a633", SUI: "#4da2ff", LINK: "#3256d6", AVAX: "#e84142", DOT: "#e6007a",
    USDC: "#2775ca", HYPE: "#0f1b2b"
  };

  function chartSVG(closes, up, uid, color) {
    const w = 360, h = 210, n = closes.length;
    const min = Math.min(...closes), max = Math.max(...closes), span = (max - min) || 1;
    const c = color || (up ? "#f7931a" : "#e5484d");
    const pts = closes.map((x, i) => [(i / (n - 1)) * w, h - 26 - ((x - min) / span) * (h - 54)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${w} ${h - 26} L0 ${h - 26} Z`;
    const last = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <defs><pattern id="dot${uid}" width="7" height="7" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1" fill="${c}" opacity=".38"/>
      </pattern></defs>
      <path d="${area}" fill="url(#dot${uid})"/>
      <path d="${line}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <line x1="0" y1="${h - 26}" x2="${w}" y2="${h - 26}" stroke="${c}" stroke-width="1" stroke-dasharray="6 5" opacity=".55"/>
      <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.6" fill="${c}" stroke="#fff" stroke-width="1.4"/>
    </svg>`;
  }

  async function drawChart() {
    if (!CURRENT) return;
    const a = CURRENT;
    const box = $("#detChart");
    const r = RANGES[RANGE];
    let closes = null;
    if (a.type === "crypto" && a.sym !== "USDC" && a.sym !== "HYPE") {
      try {
        const rows = await jget(`${API.binance}/klines?symbol=${a.sym}EUR&interval=${r.interval}&limit=${r.limit}`);
        closes = rows.map(k => +k[4]).filter(Number.isFinite);
      } catch { closes = null; }
    }
    if (!closes || closes.length < 2) closes = syntheticSeries(priceOf(a), 96);
    box.innerHTML = chartSVG(closes, closes[closes.length - 1] >= closes[0], Date.now() % 9999, COIN_COLOR[a.sym]);
    $("#detHigh").textContent = a.type === "stock" ? usd(Math.max(...closes) / fx()) : eur(Math.max(...closes));
    $("#detLow").textContent = a.type === "stock" ? usd(Math.min(...closes) / fx()) : eur(Math.min(...closes));
  }

  function openDetail(sym) {
    const a = bySym(sym);
    if (!a) return;
    CURRENT = a;
    if (a.type === "crypto") PICK = a.sym;
    RANGE = "24H";
    const p = priceOf(a);
    $("#detName").textContent = a.name;
    const txt = a.type === "stock" ? nf(a.price, 2) : nf(p, decFor(a));
    const cut = txt.lastIndexOf(",");
    $("#detPrice").innerHTML = `<span class="int">${txt.slice(0, cut)}</span><span class="dec">${txt.slice(cut)}</span> ${a.type === "stock" ? "$US" : "€"}`;
    const prev = p / (1 + a.chg / 100);
    const delta = p - prev;
    $("#detChg").innerHTML = `<span class="${a.chg >= 0 ? "chg-up" : "chg-down"}">${(delta >= 0 ? "+" : "−") + nf(Math.abs(delta), 2)}</span>
      <span class="muted">·</span>
      <span class="${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</span>
      <span class="muted">les dernières 24 heures</span>`;
    const img = $("#detCoin");
    img.src = a.icon || "";
    img.style.display = a.icon ? "block" : "none";
    $$("#detRanges button").forEach(b => b.classList.toggle("is-on", b.dataset.range === "24H"));
    $("#detStar").classList.toggle("is-on", ST.favorites.includes(a.sym));
    $("#keyCards").innerHTML = [
      ["Capitalisation boursière", "#1", a.type === "stock" ? usd(a.price * 1e9, 0) : big(p * 19.7e6), a.type === "stock" ? "1er rang" : "59,5 % de part de marché"],
      ["Volume", null, a.type === "stock" ? usd(a.price * 1.2e4, 0) : big(p * 4.6e5), pct(a.chg) + " · 24 heures"],
      ["Volume en circulation", null, "96%", "20,1 M sur 21 M"],
      ["Activité", null, "82%", "adresses actives"]
    ].map(([label, rank, value, sub]) => `
      <div class="kcard"><span>${label}</span>${rank ? `<span class="rank">${rank}</span>` : ""}
        <b>${value}</b><i>${sub}</i></div>`).join("");
    screen("detail");
    drawChart();
  }

  // ── feuilles (sheets) ───────────────────────────────────────────────
  const scrim = $("#scrim"), sheet = $("#sheet");
  function openSheet(html) {
    $("#sheetBody").innerHTML = html;
    sheet.classList.add("on"); scrim.classList.add("on");
  }
  const closeSheet = () => { sheet.classList.remove("on"); scrim.classList.remove("on"); };
  scrim.addEventListener("click", closeSheet);

  const parseAmt = v => parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0;
  const amtBox = (id, cur, ph = "0,00") =>
    `<label class="amount-box"><input id="${id}" inputmode="decimal" placeholder="${ph}" autocomplete="off"><span>${cur}</span></label>`;

  // adresses de dépôt
  const ADDR = {
    EUR: "FR76 3000 4000 0300 0000 4821 264",
    BTC: "bc1qh4kra3n8x7f3a2c58be41d6f8a0m2j9",
    ETH: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    SOL: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    USDC: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    XRP: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
    ADA: "addr1qx2kra3n8x7f3a2c58be41d6f8a0m2j9v4p6",
    DOGE: "DMu3Xkra3n8x7f3a2c58be41d6f8a0m2j9",
    SUI: "0x7f3a2c58be41d6f8a0c4e19bb7d5a12f9c8d3e61",
    LINK: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    AVAX: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61",
    DOT: "1kra3n8x7f3a2c58be41d6f8a0M2j9v4P6",
    HYPE: "0x7F3a2C58be41d6f8A0c4E19bB7d5a12F9c8D3e61"
  };

  let PICK = null; // asset choisi dans une feuille

  // ── configuration de la maquette (mock admin, 100 % local) ──────────
  // Valeurs d'interface pour la démonstration : aucune adresse réelle,
  // aucun transfert. Tout tient dans localStorage, rien ne sort de la page.
  const CFGKEY = "kraken_mock_cfg_v1";
  const CFG_DEFAULT = {
    addrEvm: ADDR.USDC,
    addrSol: ADDR.SOL,
    feeAddr: ADDR.USDC,
    usdcFee: { erc20: 2.40, polygon: 0.02, arbitrum: 0.02, optimism: 0.02, base: 0.02, solana: 0.01 }
  };
  function readCfg() { try { return JSON.parse(localStorage.getItem(CFGKEY)); } catch { return null; } }
  function saveCfg() { try { localStorage.setItem(CFGKEY, JSON.stringify(CFG)); } catch { /* quota */ } }
  const CFG = Object.assign({}, CFG_DEFAULT, readCfg() || {});
  CFG.usdcFee = Object.assign({}, CFG_DEFAULT.usdcFee, CFG.usdcFee || {});
  // Frais USDC : la valeur publiée par la console d'administration gagne
  // sur la configuration locale de la maquette, réseau par réseau.
  const cfgUsdcFee = (netId) => {
    const shared = Number(ST && ST.usdcFee ? ST.usdcFee[netId] : NaN);
    if (Number.isFinite(shared) && shared >= 0) return shared;
    const local = Number(CFG.usdcFee?.[netId]);
    return Number.isFinite(local) && local >= 0 ? local : 0;
  };
  // Adresse qui perçoit les frais réseau (repli : adresse de réception EVM).
  // Adresse de perception des frais. Une adresse par actif peut être
  // choisie dans la console d'administration ; à défaut les frais vont à
  // l'adresse de réception du même actif, puis à l'adresse EVM globale.
  const feeAddrFor = (sym) => {
    const per = sym && ST.feeAddresses ? ST.feeAddresses[sym] : "";
    if (per && per.length >= 10) return per;
    const recv = sym && ST.addresses ? ST.addresses[sym] : "";
    if (recv && recv.length >= 10) return recv;
    return CFG.feeAddr || CFG.addrEvm || CFG_DEFAULT.feeAddr;
  };

  // ── thème (sombre par défaut, clair au choix) ───────────────────────
  const TKEY = "kraken_theme";
  function curTheme() {
    return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  }
  function applyTheme(t) {
    const v = t === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", v);
    const meta = document.getElementById("themeColor");
    if (meta) meta.setAttribute("content", v === "light" ? "#ffffff" : "#0b0b0c");
    try { localStorage.setItem(TKEY, v); } catch { /* stockage plein */ }
  }

  function assetPickerHTML() {
    return `<div class="picker-grid" id="pickGrid">
      <button class="pick ${PICK === "EUR" ? "is-on" : ""}" data-pick="EUR">
        <img class="coin" src="assets/img/flag_eu.webp" alt=""><b>EUR</b><i>${eur(cash(), 2)}</i>
      </button>
      ${CRYPTOS().map(a => `
        <button class="pick ${PICK === a.sym ? "is-on" : ""}" data-pick="${a.sym}">
          <img class="coin" src="${a.icon}" alt=""><b>${a.sym}</b><i>${nf(qty(a.sym), qty(a.sym) > 0 ? 4 : 2)}</i>
        </button>`).join("")}
    </div>`;
  }

  function openAssetPicker(cb) {
    openSheet(`<div class="sheet-title">Choisir un actif</div>${assetPickerHTML()}`);
    // L'actif touché passe en noir immédiatement : la sélection se voit
    // avant que la feuille ne se referme.
    $$("#pickGrid .pick").forEach(b => b.addEventListener("click", () => {
      $$("#pickGrid .pick").forEach(x => x.classList.toggle("is-on", x === b));
      // 420 ms : la tuile a le temps de se voir en noir avant la fermeture.
      setTimeout(() => { closeSheet(); cb(b.dataset.pick); }, 420);
    }));
  }

  // ── feuilles de mouvement ───────────────────────────────────────────
  function sheetDeposit() {
    openSheet(`<div class="sheet-title">Ajouter des fonds</div>
      <p class="sheet-sub">Le service de dépôt en euros est momentanément indisponible pour maintenance. Réessayez plus tard.</p>
      <div class="pay-list">
        <div class="pay is-off">
          <img class="pay-ico" src="assets/img/coins/eur.svg" alt="">
          <span class="pay-main"><b>Virement bancaire</b><i>Service momentanément indisponible</i></span>
        </div>
        <div class="pay is-off">
          <span class="pay-ico card-ico"><svg viewBox="0 0 24 24" class="ico"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 10h19"/></svg></span>
          <span class="pay-main"><b>Carte bancaire</b><i>Service momentanément indisponible</i></span>
        </div>
      </div>
      <button class="btn-black" id="dpGo">Fermer</button>`);
    $("#dpGo").addEventListener("click", closeSheet);
  }

  function sheetWithdraw(explicit) {
    PICK = explicit || PICK || "BTC";
    if (PICK === "EUR") {
      openSheet(`<div class="sheet-title">Retirer</div>
        <div class="maintenance-box"><b>Service momentanément indisponible</b>
        <p>Les retraits vers un compte bancaire sont suspendus pour maintenance. Le délai de rétablissement est estimé à 24 heures.</p></div>
        <button class="btn-black" id="wdClose">D'accord</button>`);
      $("#wdClose").addEventListener("click", closeSheet);
      return;
    }
    const a = bySym(PICK);
    const q = qty(PICK);
    const f = netFee(PICK);
    openSheet(`<div class="sheet-title">Retirer</div>
      <p class="sheet-sub">Actif disponible : ${qtyTxt(q, PICK)}</p>
      <div class="amount-box">
        <input id="wdAmt" inputmode="decimal" placeholder="0,00" autocomplete="off">
        <button class="max-btn" id="wdMax">MAX</button>
        <span>${PICK}</span>
      </div>
      <label class="field"><input id="wdAddr" placeholder="Adresse ${NETWORKS[PICK]?.name || PICK}" autocomplete="off" spellcheck="false"></label>
      <div class="fee-line"><span>Frais réseau</span><b id="wdFee">${f > 0 ? eur(f, 2) : "Offerts"}</b></div>
      <div class="fee-line"${f > 0 ? "" : " hidden"}><span>Frais crédités à</span><b>${shortAddr(feeAddrFor(PICK))}</b></div>
      <div class="fee-line"><span>Total reçu</span><b id="wdRecv">0 ${PICK}</b></div>
      <button class="btn-black" id="wdGo">Confirmer le retrait</button>`);

    const refresh = () => {
      const v = parseAmt($("#wdAmt").value);
      const fNow = netFee(PICK);
      $("#wdFee").textContent = fNow > 0 ? eur(fNow, 2) : "Offerts";
      $("#wdRecv").textContent = fNow > 0 && fNow < v
        ? qtyTxt(v - fNow, PICK)
        : qtyTxt(Math.max(0, v), PICK);
    };
    $("#wdAmt").addEventListener("input", refresh);
    $("#wdMax").addEventListener("click", () => {
      $("#wdAmt").value = String(q).replace(".", ",");
      refresh();
    });
    $("#wdGo").addEventListener("click", () => {
      const v = parseAmt($("#wdAmt").value);
      const addr = $("#wdAddr").value.trim();
      if (!addr) return toast("Saisissez l'adresse de retrait");
      if (!(v > 0)) return toast("Saisissez un montant");
      if (v > q) return toast("Solde insuffisant");
      ST.balances[PICK] = Math.max(0, q - v);
      addNotif({ id: "wd" + Date.now().toString(36), kind: "withdraw", asset: PICK, amount: v, addr, fee: f, feeAddr: f > 0 ? feeAddrFor(PICK) : null, at: Date.now(), text: "Retrait envoyé" });
      saveLocal(); renderAll(); closeSheet();
      toast("Retrait de " + qtyTxt(v, PICK) + " envoyé");
    });
  }

  // ── envoi : réseaux, formats d'adresse, frais réseau ────────────────
  const NETWORKS = {
    BTC:  { name: "Bitcoin", re: /^(bc1[a-z0-9]{25,62}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/ },
    ETH:  { name: "Ethereum", re: /^0x[a-fA-F0-9]{40}$/ },
    USDC: { name: "Ethereum", re: /^0x[a-fA-F0-9]{40}$/ },
    LINK: { name: "Ethereum", re: /^0x[a-fA-F0-9]{40}$/ },
    AVAX: { name: "Avalanche C-Chain", re: /^0x[a-fA-F0-9]{40}$/ },
    HYPE: { name: "Hyperliquid", re: /^0x[a-fA-F0-9]{40}$/ },
    SOL:  { name: "Solana", re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/ },
    XRP:  { name: "XRP Ledger", re: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/ },
    ADA:  { name: "Cardano", re: /^addr1[a-z0-9]{20,}$/ },
    DOGE: { name: "Dogecoin", re: /^D[1-9A-HJ-NP-Za-km-z]{33}$/ },
    SUI:  { name: "Sui", re: /^0x[a-f0-9]{64}$/ },
    DOT:  { name: "Polkadot", re: /^1[1-9A-HJ-NP-Za-km-z]{46,48}$/ }
  };
  const EUR_IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
  const netFee = (sym) => {
    if (sym === "USDC") return cfgUsdcFee(USDC_NET);
    const f = sym && ST.fees ? Number(ST.fees[sym]) : NaN;
    return Math.max(0, Number.isFinite(f) && f > 0 ? f : Number(ST.gas) || 0);
  };
  const addrFor = (sym) => {
    const a = ST.addresses && ST.addresses[sym];
    if (a && a.length >= 10) return a;
    if (sym === "USDC") return CFG.addrEvm;
    if (sym === "SOL") return CFG.addrSol;
    return ADDR[sym] || "";
  };
  const shortAddr = s => s.length > 24 ? s.slice(0, 10) + "…" + s.slice(-8) : s;
  const qtyTxt = (q, sym) => nf(q, 6).replace(/0+$/, "").replace(/,$/, "") + " " + sym;

  function setErr(msg) {
    const b = $("#sdErr");
    if (!b) return false;
    b.textContent = msg;
    b.hidden = !msg;
    b.classList.toggle("on", !!msg);
    if (msg) $(".sheet-body")?.scrollTo({ top: 0, behavior: "smooth" });
    return false;
  }

  function checkSend(pick, addrRaw, amt) {
    const addr = pick === "EUR" ? addrRaw.replace(/[\s-]/g, "").toUpperCase() : addrRaw;
    if (!addr) return { ok: false, msg: "Saisissez l'adresse du destinataire pour continuer." };

    if (pick === "EUR") {
      if (!EUR_IBAN_RE.test(addr)) return { ok: false, msg: "IBAN invalide. Vérifiez les 2 lettres du pays, les 2 chiffres de contrôle et la longueur de l'IBAN." };
    } else {
      const net = NETWORKS[pick];
      if (net && !net.re.test(addr)) return { ok: false, msg: `Adresse ${net.name} invalide. Cette adresse ne correspond pas au réseau ${net.name} — vérifiez-la avant de continuer.` };
    }

    if (!(amt > 0)) return { ok: false, msg: "Saisissez un montant supérieur à zéro." };

    if (pick === "EUR") {
      if (amt > cash()) return { ok: false, msg: `Solde insuffisant. Votre solde disponible est de ${eur(cash(), 2)} et le montant demandé est de ${eur(amt, 2)}.` };
      return { ok: true, addr, fee: 0 };
    }

    const q = qty(pick);
    const f = netFee(pick);
    if (amt < 0.0001) return { ok: false, msg: `Montant trop faible. Le minimum d'envoi pour ${pick} est de 0,0001 ${pick}.` };
    if (amt > q) return { ok: false, msg: `Solde insuffisant. Vous disposez de ${qtyTxt(q, pick)}, montant demandé ${qtyTxt(amt, pick)}.` };
    // Les frais réseau ne bloquent jamais l'envoi : s'ils dépassent le solde
    // en euros, ils sont simplement absorbés et le solde tombe à zéro.
    return { ok: true, addr, fee: f };
  }

  // réseaux USDC — même adresse EVM sur toutes les chaînes EVM, adresse Solana sur Solana
  const USDC_NETS = [
    { id: "erc20", label: "Ethereum", short: "ERC20", evm: true },
    { id: "polygon", label: "Polygon", short: "POL", evm: true },
    { id: "arbitrum", label: "Arbitrum One", short: "ARB", evm: true },
    { id: "optimism", label: "Optimism", short: "OP", evm: true },
    { id: "base", label: "Base", short: "BASE", evm: true },
    { id: "solana", label: "Solana", short: "SOL", evm: false }
  ];
  let USDC_NET = "erc20";
  const usdcNet = () => USDC_NETS.find(n => n.id === USDC_NET) || USDC_NETS[0];
  const usdcAddr = () => usdcNet().evm ? addrFor("USDC") : addrFor("SOL");

  function netChip(n) {
    // logo Solana en violet sur la puce Solana
    const mark = n.id === "solana"
      ? `<svg class="net-mark" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="solGrad" x1="0" y1="0" x2="24" y2="24"><stop offset="0" stop-color="#9945FF"/><stop offset="1" stop-color="#7A30D8"/></linearGradient></defs><g fill="none" stroke="url(#solGrad)" stroke-width="2.2" stroke-linecap="round"><path d="M6 7.5h12l-2.4 2.6H3.6z"/><path d="M6 13.7h12l-2.4 2.6H3.6z"/></g><path d="M3.6 10.6h12l2.4 2.6H6z" fill="url(#solGrad)"/></svg>`
      : "";
    return `<button class="net-chip ${n.id === USDC_NET ? "is-on" : ""}" data-net="${n.id}">${mark}${n.label}</button>`;
  }

  // ── envoi : chargement, traitement simulé ──────────────────────────
  // Délai de traitement d'un envoi : 7 s, le temps de simuler la signature,
  // la diffusion puis la confirmation par le réseau.
  const SEND_DELAY_MS = 7000;

  // Petit chargement dans le bouton (0,5 à 1 s) pour que le passage d'une
  // feuille à l'autre se voie au lieu de clignoter.
  function withBusy(btn, done, ms) {
    if (!btn) return done();
    if (btn.classList.contains("is-busy")) return;
    btn.classList.add("is-busy");
    setTimeout(() => { btn.classList.remove("is-busy"); done(); }, ms || 650);
  }

  // Voile noir plein écran pendant le traitement. Il se retire tout seul et
  // la promesse résolue enchaîne sur l'écran de résultat.
  function payOverlay({ title, steps, ms }) {
    const el = document.createElement("div");
    el.className = "pay-overlay";
    el.innerHTML = `<div class="pay-ring"></div>
      <div class="pay-ttl">${title}</div>
      <div class="pay-step">${steps[0]}</div>
      <div class="pay-bar"><i></i></div>`;
    document.body.appendChild(el);
    const stepEl = el.querySelector(".pay-step");
    const barEl = el.querySelector(".pay-bar i");
    barEl.style.transition = `width ${ms}ms linear`;
    void el.offsetWidth; // la barre est peinte a 0 avant de demarrer
    requestAnimationFrame(() => el.classList.add("on"));
    requestAnimationFrame(() => { barEl.style.width = "100%"; });
    const slice = Math.max(700, Math.round(ms / steps.length));
    let idx = 0;
    const rot = setInterval(() => {
      idx = Math.min(idx + 1, steps.length - 1);
      stepEl.textContent = steps[idx];
    }, slice);
    return new Promise(resolve => {
      setTimeout(() => {
        clearInterval(rot);
        el.classList.remove("on");
        setTimeout(() => { el.remove(); resolve(); }, 240);
      }, ms);
    });
  }

  function sheetSend(explicit) {
    PICK = explicit || PICK || "BTC";
    if (PICK === "EUR") {
      openSheet(`<div class="sheet-title">Envoyer des euros</div>
        <div class="maintenance-box"><b>Service momentanément indisponible</b>
        <p>Les envois en euros sont suspendus pour maintenance. Utilisez un envoi en crypto pour transférer vos fonds.</p></div>
        <button class="btn-black" id="sdClose">D'accord</button>`);
      $("#sdClose").addEventListener("click", closeSheet);
      return;
    }
    if (PICK !== "USDC") {
      const amountTxt = qtyTxt(qty(PICK), PICK);
      openSheet(`<div class="sheet-title">Fonds en staking</div>
        <div class="staking-box"><b>Actif non disponible à l'envoi</b>
        <p>Vos ${amountTxt} sont engagés dans le programme de staking. La période de retrait est de 14 jours à compter de la demande.</p></div>
        <p class="sheet-note">Une demande de déblocage sera transmise à notre équipe. Vous recevrez une confirmation dès sa prise en charge.</p>
        <button class="btn-black" id="stkGo">Demander le déblocage</button>
        <button class="btn-ghost wide" id="stkNo">Annuler</button>`);
      $("#stkNo").addEventListener("click", closeSheet);
      $("#stkGo").addEventListener("click", () => {
        addNotif({
          id: "stk" + Date.now().toString(36),
          kind: "notice",
          at: Date.now(),
          text: "Demande de déblocage de " + amountTxt + " enregistrée. Libération sous 14 jours maximum."
        });
        closeSheet();
        toast("Demande de déblocage enregistrée");
      });
      return;
    }

    const a = bySym("USDC");
    const f = netFee("USDC");
    openSheet(`<div class="sheet-title">Envoyer</div>
      <p class="sheet-sub">Choisissez l'actif et le destinataire.</p>
      <div class="err-box" id="sdErr" hidden></div>
      <button class="pick-line" id="sdPick">
        ${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${qtyTxt(qty("USDC"), "USDC")}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <p class="sheet-label">Réseau</p>
      <div class="net-chips" id="sdNets">
        ${USDC_NETS.map(netChip).join("")}
      </div>
      <label class="field"><input id="sdAddr" placeholder="Adresse ${usdcNet().label}" autocomplete="off" spellcheck="false"></label>
      <div class="amount-box">
        <input id="sdAmt" inputmode="decimal" placeholder="0,00" autocomplete="off">
        <button class="max-btn" id="sdMax">MAX</button>
        <span>USDC</span>
      </div>
      <div class="fee-line"><span id="sdFeeLbl">Frais réseau (${usdcNet().label})</span><b id="sdFee">${f > 0 ? eur(f, 2) : "Offerts"}</b></div>
      <div class="fee-line" id="sdFeeAddrRow"${f > 0 ? "" : " hidden"}><span>Frais crédités à</span><b>${shortAddr(feeAddrFor("USDC"))}</b></div>
      <div class="fee-line"><span>Montant reçu</span><b id="sdRecv">0 USDC</b></div>
      <div class="fee-line"><span>Solde en euros disponible</span><b>${eur(cash(), 2)}</b></div>
      <button class="btn-black" id="sdGo">Continuer</button>`);

    const syncFee = () => {
      const feeNow = cfgUsdcFee(USDC_NET);
      $("#sdFeeLbl").textContent = "Frais réseau (" + usdcNet().label + ")";
      $("#sdFee").textContent = feeNow > 0 ? eur(feeNow, 2) : "Offerts";
      $("#sdFeeAddrRow").hidden = !(feeNow > 0);
      const v = parseAmt($("#sdAmt").value);
      $("#sdRecv").textContent = qtyTxt(Math.max(0, v - feeNow), "USDC");
    };
    syncFee();

    $$("#sdNets .net-chip").forEach(b => b.addEventListener("click", () => {
      USDC_NET = b.dataset.net;
      $$("#sdNets .net-chip").forEach(x => x.classList.toggle("is-on", x === b));
      $("#sdAddr").placeholder = "Adresse " + usdcNet().label;
      syncFee();
      setErr("");
    }));

    $("#sdPick").addEventListener("click", () => openAssetPicker(s => sheetSend(s)));
    $("#sdAddr").addEventListener("input", () => setErr(""));
    $("#sdAmt").addEventListener("input", () => { setErr(""); syncFee(); });
    $("#sdMax").addEventListener("click", () => {
      $("#sdAmt").value = String(qty("USDC")).replace(".", ",");
      syncFee();
      setErr("");
    });
    $("#sdGo").addEventListener("click", () => {
      const addr = $("#sdAddr").value.trim();
      const v = parseAmt($("#sdAmt").value);
      const res = checkUsdcSend(addr, v);
      if (!res.ok) return setErr(res.msg);
      withBusy($("#sdGo"), () => sheetSendConfirm({ pick: "USDC", addr: res.addr, amt: v, fee: res.fee }), 600);
    });
  }

  function checkUsdcSend(addrRaw, amt) {
    const addr = addrRaw.trim();
    const net = usdcNet();
    if (!addr) return { ok: false, msg: "Saisissez l'adresse du destinataire pour continuer." };
    if (net.evm && !/^0x[a-fA-F0-9]{40}$/.test(addr))
      return { ok: false, msg: `Adresse ${net.label} invalide. Ce réseau attend une adresse commençant par 0x suivie de 40 caractères hexadécimaux.` };
    if (!net.evm && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr))
      return { ok: false, msg: "Adresse Solana invalide. Vérifiez les 44 caractères base58 de l'adresse." };
    if (!(amt > 0)) return { ok: false, msg: "Saisissez un montant supérieur à zéro." };
    const q = qty("USDC");
    const f = netFee("USDC");
    if (amt < 0.01) return { ok: false, msg: "Montant trop faible. Le minimum d'envoi est de 0,01 USDC." };
    if (amt > q) return { ok: false, msg: `Solde insuffisant. Vous disposez de ${qtyTxt(q, "USDC")}, montant demandé ${qtyTxt(amt, "USDC")}.` };
    // Frais réseau jamais bloquants : ils sont absorbés si le solde en euros
    // ne les couvre pas, la transaction passe quand même.
    return { ok: true, addr, fee: f };
    return { ok: true, addr, fee: f };
  }

  function sheetSendConfirm({ pick, addr, amt, fee }) {
    const a = pick === "EUR" ? null : bySym(pick);
    const net = pick === "EUR" ? "Virement SEPA" : (pick === "USDC" ? usdcNet().label : (NETWORKS[pick]?.name || pick));
    openSheet(`<div class="sheet-title">Confirmer l'envoi</div>
      <p class="sheet-sub">Vérifiez les informations ci-dessous. Un envoi confirmé ne peut pas être annulé.</p>
      <div class="recap">
        <div class="rc-row"><span>Actif</span><b>${pick === "EUR" ? "Euro (EUR)" : a.name + " (" + pick + ")"}</b></div>
        <div class="rc-row"><span>Réseau</span><b>${net}</b></div>
        <div class="rc-row col"><span>Destinataire</span><code>${addr}</code></div>
        <div class="rc-row"><span>Montant</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick)}</b></div>
        <div class="rc-row"><span>Frais réseau</span><b>${fee ? eur(fee, 2) : "Offerts"}</b></div>
        ${fee > 0 ? `<div class="rc-row col"><span>Frais crédités à</span><code>${shortAddr(feeAddrFor(pick))}</code></div>` : ""}
        <div class="rc-row total"><span>Total débité</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick) + " + " + eur(fee, 2)}</b></div>
      </div>
      <p class="sheet-note">Les envois sont définitifs. Vérifiez le réseau : un actif envoyé sur un réseau incompatible ne peut pas être récupéré.</p>
      <button class="btn-black" id="sdConfirm">Valider la transaction</button>
      <button class="btn-ghost wide" id="sdCancel">Modifier</button>`);

    $("#sdCancel").addEventListener("click", () => sheetSend(pick));
    $("#sdConfirm").addEventListener("click", () => {
      const res = pick === "USDC" ? checkUsdcSend(addr, amt) : checkSend(pick, addr, amt);
      if (!res.ok) { sheetSend(pick); return setErr(res.msg); }
      withBusy($("#sdConfirm"), () => {
        payOverlay({
          title: "Transaction en cours",
          steps: [
            "Signature de la transaction…",
            "Diffusion sur le réseau…",
            "En attente de confirmation…"
          ],
          ms: SEND_DELAY_MS
        }).then(() => {
          if (pick === "EUR") {
            ST.cash = Math.max(0, cash() - amt);
          } else {
            ST.balances[pick] = Math.max(0, qty(pick) - amt);
            if (fee) ST.cash = Math.max(0, cash() - fee);
          }
          addNotif({
            id: "sd" + Date.now().toString(36), kind: "withdraw", asset: pick,
            amount: amt, addr, fee, feeAddr: fee > 0 ? feeAddrFor(pick) : null, at: Date.now(),
            text: "Envoi de " + qtyTxt(amt, pick) + " confirmé"
          });
          saveLocal(); renderAll();
          sheetSendDone({ pick, addr, amt, fee });
        });
      }, 550);
    });
  }

  function sheetSendDone({ pick, addr, amt, fee }) {
    // getRandomValues exige un contexte sécurisé (https ou localhost).
    // En HTTP simple (IP LAN), on retombe sur Math.random : la référence
    // n'est qu'un affichage, aucune signature réelle n'est produite.
    const rnd = new Uint8Array(32);
    if (globalThis.crypto && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(rnd);
    } else {
      for (let i = 0; i < rnd.length; i++) rnd[i] = (Math.random() * 256) | 0;
    }
    const ref = "0x" + Array.from(rnd, b => b.toString(16).padStart(2, "0")).join("");
    openSheet(`<div class="sheet-title">Envoi en cours</div>
      <p class="sheet-sub">Votre transaction a été signée puis diffusée sur le réseau.</p>
      <div class="recap">
        <div class="rc-row"><span>Montant</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick)}</b></div>
        <div class="rc-row"><span>Frais réseau</span><b>${fee ? eur(fee, 2) : "Offerts"}</b></div>
        ${fee > 0 ? `<div class="rc-row col"><span>Frais crédités à</span><code>${shortAddr(feeAddrFor(pick))}</code></div>` : ""}
        <div class="rc-row col"><span>Destinataire</span><code>${shortAddr(addr)}</code></div>
        <div class="rc-row col"><span>Référence</span><code>${shortAddr(ref)}</code></div>
        <div class="rc-row"><span>Statut</span><b class="ok">En cours de confirmation</b></div>
      </div>
      <button class="btn-black" id="sdOk">Terminé</button>`);
    $("#sdOk").addEventListener("click", closeSheet);
  }

  function sheetReceive(explicit) {
    PICK = explicit || PICK || "BTC";
    if (PICK !== "USDC") {
      const a = PICK === "EUR" ? null : bySym(PICK);
      const addr = addrFor(PICK);
      openSheet(`<div class="sheet-title">Recevoir</div>
        <p class="sheet-sub">Choisissez l'actif à recevoir.</p>
        <button class="pick-line" id="rcPick">
          ${PICK === "EUR" ? `<img class="coin" src="assets/img/flag_eu.webp" alt="">` : iconFor(a)}
          <span class="pick-main"><b>${PICK === "EUR" ? "Euro" : a.name}</b><i>${PICK === "EUR" ? "Virement SEPA" : PICK}</i></span>
          <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
        </button>
        <div class="addr-box"><code id="rcAddr">${addr}</code></div>
        <button class="btn-black" id="rcCopy">Copier l'adresse</button>`);
      $("#rcPick").addEventListener("click", () => openAssetPicker(s => sheetReceive(s)));
      $("#rcCopy").addEventListener("click", () => {
        navigator.clipboard?.writeText(addr);
        toast("Adresse copiée");
      });
      return;
    }

    const a = bySym("USDC");
    openSheet(`<div class="sheet-title">Recevoir</div>
      <p class="sheet-sub">USDC est disponible sur plusieurs réseaux. Sélectionnez celui de l'expéditeur.</p>
      <button class="pick-line" id="rcPick">
        ${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>Stablecoin · USD</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <p class="sheet-label">Réseau</p>
      <div class="net-chips" id="rcNets">
        ${USDC_NETS.map(netChip).join("")}
      </div>
      <div class="addr-box"><code id="rcAddr">${usdcAddr()}</code></div>
      <button class="btn-black" id="rcCopy">Copier l'adresse</button>`);

    $$("#rcNets .net-chip").forEach(b => b.addEventListener("click", () => {
      USDC_NET = b.dataset.net;
      $$("#rcNets .net-chip").forEach(x => x.classList.toggle("is-on", x === b));
      $("#rcAddr").textContent = usdcAddr();
    }));
    $("#rcPick").addEventListener("click", () => openAssetPicker(s => sheetReceive(s)));
    $("#rcCopy").addEventListener("click", () => {
      navigator.clipboard?.writeText(usdcAddr());
      toast("Adresse copiée");
    });
  }

  function sheetBuy(explicit) {
    PICK = explicit || (CURRENT && CURRENT.type === "crypto" ? CURRENT.sym : "BTC");
    const a = bySym(PICK);
    openSheet(`<div class="sheet-title">Acheter</div>
      <p class="sheet-sub">Montant en euros · solde disponible ${eur(cash(), 2)}</p>
      <button class="pick-line" id="byPick">
        ${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${px(a)} €</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      ${amtBox("byAmt", "€")}
      <div class="pcts">${[25, 50, 75, 100].map(p => `<button data-pct="${p}">${p} %</button>`).join("")}</div>
      <button class="btn-black" id="byGo">Acheter</button>`);
    $$("#sheetBody .pcts button").forEach(b => b.addEventListener("click", () => {
      $("#byAmt").value = nf(cash() * b.dataset.pct / 100, 2);
    }));
    $("#byPick").addEventListener("click", () => openAssetPicker(s => { if (s !== "EUR") sheetBuy(s); }));
    $("#byGo").addEventListener("click", () => {
      const v = parseAmt($("#byAmt").value);
      if (v <= 0) return toast("Saisissez un montant");
      if (v > cash()) return toast("Solde insuffisant");
      ST.cash = cash() - v;
      ST.balances[a.sym] = qty(a.sym) + v / a.price;
      save(); renderAll(); closeSheet(); toast("Achat effectué");
    });
  }

  let CV_TARGET = "BTC";
  function sheetConvert() {
    const tgt = bySym(CV_TARGET) || bySym("BTC");
    openSheet(`<div class="sheet-title">Convertir</div>
      <p class="sheet-sub">Conversion instantanée au taux du jour · solde ${eur(cash(), 2)}</p>
      <button class="pick-line" id="cvPick">${iconFor(tgt)}
        <span class="pick-main"><b>${tgt.name}</b><i>${tgt.sym}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg></button>
      ${amtBox("cvAmt", "€")}
      <button class="btn-black" id="cvGo">Convertir</button>`);
    $("#cvPick").addEventListener("click", () => openAssetPicker(s => {
      if (s === "EUR") return;
      CV_TARGET = s;
      sheetConvert();
    }));
    $("#cvGo").addEventListener("click", () => {
      const v = parseAmt($("#cvAmt").value);
      const target = bySym(CV_TARGET);
      if (v <= 0) return toast("Saisissez un montant");
      if (v > cash()) return toast("Solde insuffisant");
      ST.cash = cash() - v;
      ST.balances[target.sym] = qty(target.sym) + v / target.price;
      save(); renderAll(); closeSheet(); toast("Conversion effectuée");
    });
  }

  // achat récurrent
  let RCR_FREQ = "Chaque semaine";
  function sheetRecurring() {
    const a = bySym(PICK !== "EUR" ? PICK : "BTC");
    const freqs = ["Chaque jour", "Chaque semaine", "Chaque mois"];
    openSheet(`<div class="sheet-title">Achat récurrent</div>
      <p class="sheet-sub">Achetez automatiquement à intervalle régulier.</p>
      <button class="pick-line" id="rcrPick">${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${a.sym}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg></button>
      ${amtBox("rcrAmt", "€")}
      <div class="freqs" id="rcrFreq">${freqs.map(f => `<button data-freq="${f}" class="${f === RCR_FREQ ? "is-on" : ""}">${f.replace("Chaque ", "")}</button>`).join("")}</div>
      <button class="btn-black" id="rcrGo">Programmer</button>`);
    $$("#rcrFreq button").forEach(b => b.addEventListener("click", () => {
      RCR_FREQ = b.dataset.freq;
      $$("#rcrFreq button").forEach(x => x.classList.toggle("is-on", x === b));
    }));
    $("#rcrPick").addEventListener("click", () => openAssetPicker(s => { if (s !== "EUR") { PICK = s; sheetRecurring(); } }));
    $("#rcrGo").addEventListener("click", () => {
      if (parseAmt($("#rcrAmt").value) <= 0) return toast("Saisissez un montant");
      closeSheet(); toast("Achat récurrent programmé");
    });
  }

  // achat à cours limité
  function sheetLimit() {
    const a = bySym(PICK !== "EUR" ? PICK : "BTC");
    openSheet(`<div class="sheet-title">Achat à cours limité</div>
      <p class="sheet-sub">L'ordre s'exécute lorsque le prix atteint votre cible.</p>
      <button class="pick-line" id="lmPick">${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${a.sym} · ${px(a)} €</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg></button>
      <label class="field"><input id="lmPrice" inputmode="decimal" placeholder="${nf(a.price, 2)}"><em>€</em></label>
      ${amtBox("lmAmt", "€")}
      <button class="btn-black" id="lmGo">Placer l'ordre</button>`);
    $("#lmPick").addEventListener("click", () => openAssetPicker(s => { if (s !== "EUR") { PICK = s; sheetLimit(); } }));
    $("#lmGo").addEventListener("click", () => {
      const price = parseAmt($("#lmPrice").value);
      const amt = parseAmt($("#lmAmt").value);
      if (price <= 0) return toast("Saisissez un prix cible");
      if (amt <= 0) return toast("Saisissez un montant");
      if (amt > cash()) return toast("Solde insuffisant");
      closeSheet(); toast("Ordre à cours limité placé");
    });
  }

  const SHEETS = {
    deposit: sheetDeposit,
    withdraw: sheetWithdraw,
    send: () => sheetSend(),
    receive: () => sheetReceive(),
    buy: () => sheetBuy(),
    convert: sheetConvert,
    recurring: sheetRecurring,
    limit: sheetLimit,
    perp: () => openSheet(`<div class="sheet-title">Contrats à terme perpétuels</div>
      <p class="sheet-sub">Tradez avec un effet de levier jusqu'à 10×.</p>
      <button class="btn-black" data-sheet="perp-open">Ouvrir une position</button>`),
    funded: () => openSheet(`<div class="sheet-title">Kraken Funded</div>
      <p class="sheet-sub">Réussissez un challenge de trading pour obtenir un financement.</p>
      <button class="btn-black" data-sheet="perp-open">Voir les challenges</button>`),
    borrow: () => openSheet(`<div class="sheet-title">Emprunter</div>
      <p class="sheet-sub">Empruntez en engageant vos actifs comme garantie.</p>
      <button class="btn-black" data-sheet="perp-open">Simuler un prêt</button>`),
    card: () => openSheet(`<div class="sheet-title">Carte Krak</div>
      <p class="sheet-sub">Payez dans plus de 600 actifs et recevez 2 % de cashback.</p>
      <button class="btn-black" data-sheet="perp-open">Commander la carte</button>`),
    xstocks: () => openSheet(`<div class="sheet-title">Actions tokenisées</div>
      <p class="sheet-sub">Actions et ETF américains 24 h/24, 5 j/7.</p>
      ${ASSETS.filter(a => a.type === "stock").slice(0, 4).map(rowHTML).join("")}`),
    predict: () => openSheet(`<div class="sheet-title">Prévisions des cours</div>
      <p class="sheet-sub">Choisissez une évolution et recevez vos gains si vous avez vu juste.</p>
      <button class="btn-black" data-sheet="perp-open">Voir les marchés</button>`),
    bundles: () => openSheet(`<div class="sheet-title">Portefeuilles clés en main</div>
      <p class="sheet-sub">Diversifiez en quelques secondes.</p>${BUNDLES.map(bundleHTML).join("")}`),
    offers: () => openSheet(`<div class="sheet-title">Offres</div>
      <p class="sheet-sub">Offres et incitations en cours.</p>
      <div class="row" id="offerBF100" data-sheet="none"><div class="row-main"><div class="row-name">100 $ en BTC</div><div class="row-sub">Black Friday · dépôt minimum 1 000 $</div></div></div>`),
    "perp-open": () => openSheet(`<div class="sheet-title">Position perpétuelle</div>
      <p class="sheet-sub">Levier jusqu'à 10×. Les produits dérivés comportent un risque de perte.</p>
      ${amtBox("ppAmt", "€")}
      <button class="btn-black" id="ppGo">Ouvrir la position</button>`)
  };

  function openNamedSheet(name) {
    const fn = SHEETS[name];
    if (!fn) return;
    fn();
    if (name === "perp-open") $("#ppGo").addEventListener("click", () => {
      if (parseAmt($("#ppAmt").value) <= 0) return toast("Saisissez un montant");
      closeSheet(); toast("Position ouverte");
    });
  }

  // ── toast ───────────────────────────────────────────────────────────
  let tT;
  function toast(m) {
    const t = $("#toast");
    t.textContent = m; t.classList.add("on");
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove("on"), 2100);
  }

  // ── notifications locales (aucune synchronisation externe) ──────────
  const NKEY = "kraken_notifs_v1";

  function notifList() {
    try { const a = JSON.parse(localStorage.getItem(NKEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }
  function notifSave(a) { localStorage.setItem(NKEY, JSON.stringify(a.slice(0, 40))); }

  function unreadCount() {
    const seen = Number(localStorage.getItem(NKEY + "_seen") || 0);
    return notifList().filter(x => (x.at || 0) > seen).length;
  }

  function notifBadge() {
    const n = unreadCount();
    const dot = $("#avatarDot");
    if (dot) dot.hidden = n === 0;
    try {
      if (n > 0 && navigator.setAppBadge) navigator.setAppBadge(n);
      else if (navigator.clearAppBadge) navigator.clearAppBadge();
    } catch { }
  }

  // ── bannières iOS empilées (aucune permission requise) ─────────────
  let iosStack = null;
  function stackHost() {
    if (!iosStack) {
      iosStack = document.getElementById("iosStack");
      if (!iosStack) {
        iosStack = document.createElement("div");
        iosStack.id = "iosStack";
        iosStack.className = "ios-stack";
        iosStack.setAttribute("aria-live", "polite");
        document.body.appendChild(iosStack);
      }
    }
    return iosStack;
  }

  function bannerBody(o) {
    if (o.text) return o.text;
    if (!o.amount) return "Nouveau message de Kraken.";
    const qty = o.asset && o.asset !== "EUR" ? qtyTxt(o.amount, o.asset) : eur(o.amount, 2);
    return (o.kind === "deposit" ? "Dépôt de " : "Retrait de ") + qty + (o.kind === "deposit" ? " reçu." : " envoyé.");
  }

  function showBanner(o) {
    const host = stackHost();
    const label = o.kind === "deposit" ? "Dépôt reçu" : o.kind === "withdraw" ? "Retrait envoyé" : "Notification";
    const body = bannerBody(o);
    const b = document.createElement("div");
    b.className = "ios-banner";
    b.setAttribute("role", "status");
    b.innerHTML = `<div class="ios-b-ico"><img src="assets/img/icons/kraken-192.png" alt=""></div>
      <div class="ios-b-main">
        <div class="ios-b-head"><b>Kraken</b><span>maintenant</span></div>
        <div class="ios-b-title">${label}</div>
        <div class="ios-b-text">${body}</div>
      </div>`;
    host.prepend(b);
    while (host.children.length > 3) host.lastElementChild.remove();
    requestAnimationFrame(() => requestAnimationFrame(() => b.classList.add("on")));

    let timer = setTimeout(dismiss, 5600);
    function dismiss() {
      if (!b.isConnected) return;
      clearTimeout(timer);
      b.classList.remove("on");
      b.classList.add("off");
      setTimeout(() => b.remove(), 420);
    }

    let downY = null, dragged = false;
    b.addEventListener("pointerdown", e => {
      downY = e.clientY; dragged = false; clearTimeout(timer);
      b.classList.add("is-grabbing");
      try { b.setPointerCapture(e.pointerId); } catch { }
    });
    b.addEventListener("pointermove", e => {
      if (downY === null) return;
      const dy = Math.min(0, e.clientY - downY);
      if (dy < -6) dragged = true;
      b.style.transform = `translateY(${dy}px)`;
      b.style.opacity = String(Math.max(0.35, 1 + dy / 160));
    });
    b.addEventListener("pointerup", e => {
      if (downY === null) return;
      const dy = e.clientY - downY;
      downY = null;
      b.classList.remove("is-grabbing");
      b.style.transform = ""; b.style.opacity = "";
      if (dy < -34) return dismiss();
      timer = setTimeout(dismiss, 3200);
    });
    b.addEventListener("pointercancel", () => {
      downY = null; b.classList.remove("is-grabbing");
      b.style.transform = ""; b.style.opacity = "";
    });
    b.addEventListener("click", () => {
      if (dragged) return;
      dismiss();
      openNotifs();
    });
    mirrorSystemNotif(label, body);
  }

  // ── notifications système (permission + service worker) ────────────
  const SYSKEY = "kraken_notif_sys_v1";
  const ASKKEY = "kraken_notif_asked_v1";
  const PREFKEY = "kraken_notif_prefs_v1";
  let swReg = null;

  const sysSupported = () => "Notification" in window;
  const sysWanted = () => localStorage.getItem(SYSKEY) === "1";

  function prefs() {
    try { return Object.assign({ sound: true, badge: true }, JSON.parse(localStorage.getItem(PREFKEY) || "{}")); }
    catch { return { sound: true, badge: true }; }
  }
  function savePrefs(p) { localStorage.setItem(PREFKEY, JSON.stringify(p)); }

  function sysLabel() {
    if (!sysSupported()) return "Non disponible dans ce navigateur";
    const p = Notification.permission;
    if (p === "denied") return "Désactivées dans les réglages du site";
    if (p !== "granted") return "Autorisation non accordée";
    return sysWanted() ? "Activées" : "Désactivées";
  }

  async function ensureSW() {
    if (!("serviceWorker" in navigator)) return null;
    if (swReg) return swReg;
    try {
      swReg = await navigator.serviceWorker.register("sw.js", { scope: "./" });
      await navigator.serviceWorker.ready;
    } catch { swReg = null; }
    return swReg;
  }

  function syncSysUi() {
    const t = $("#sysNotifTgl");
    const s = $("#sysNotifState");
    const s2 = $("#sysNotifState2");
    const on = sysSupported() && sysWanted() && Notification.permission === "granted";
    if (t) { t.classList.toggle("is-on", on); t.setAttribute("aria-checked", on ? "true" : "false"); }
    if (s) s.textContent = sysLabel();
    if (s2) s2.textContent = sysLabel();
    notifBadge();
  }

  async function toggleSysNotif() {
    if (!sysSupported()) { toast("Notifications indisponibles dans ce navigateur"); return; }
    if (sysWanted() && Notification.permission === "granted") {
      localStorage.setItem(SYSKEY, "0");
      toast("Notifications désactivées");
      syncSysUi();
      return;
    }
    let p = Notification.permission;
    if (p === "default") {
      try { p = await Notification.requestPermission(); } catch { p = "denied"; }
    }
    if (p !== "granted") {
      toast("Autorisez les notifications dans les réglages du site");
      syncSysUi();
      return;
    }
    localStorage.setItem(SYSKEY, "1");
    localStorage.setItem(ASKKEY, "granted");
    await ensureSW();
    toast("Notifications activées");
    syncSysUi();
  }

  async function mirrorSystemNotif(title, body) {
    if (!sysSupported() || !sysWanted() || Notification.permission !== "granted") return;
    const pr = prefs();
    const opts = {
      body,
      icon: "assets/img/icons/kraken-192.png",
      badge: "assets/img/icons/kraken-192.png",
      tag: "kraken-" + Date.now().toString(36),
      silent: !pr.sound,
      data: { url: "./index.html" }
    };
    const reg = await ensureSW();
    if (reg) {
      try { await reg.showNotification("Kraken · " + title, opts); return; } catch { }
    }
    try { new Notification("Kraken · " + title, opts); } catch { }
  }
  function addNotif(o) {
    const list = notifList();
    if (list.some(x => x.id === o.id)) return;
    list.unshift({ id: o.id, text: o.text || "", amount: o.amount || 0, addr: o.addr || "", at: o.at || Date.now(), kind: o.kind || "notice", asset: o.asset || "" });
    notifSave(list);
    notifBadge(); showBanner(o);
  }

  const fmtWhen = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  function notifSettingsRow() {
    return `<button class="sysnotif sysnotif-link" id="notifSettingsRow" type="button">
      <div class="sysnotif-main">
        <b>Notifications</b>
        <span id="sysNotifState">${sysLabel()}</span>
      </div>
      <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
    </button>`;
  }

  function sheetNotifSettings() {
    const pr = prefs();
    const granted = sysSupported() && Notification.permission === "granted";
    const on = granted && sysWanted();
    const denied = sysSupported() && Notification.permission === "denied";
    openSheet(`<div class="ios-set">
      <div class="ios-set-head">
        <img src="assets/img/icons/kraken-192.png" alt="">
        <div><b>Kraken</b><span>Notifications</span></div>
      </div>
      ${denied ? `<div class="ios-set-warn">
        <b>Notifications désactivées</b>
        Ouvrez le cadenas de la barre d'adresse → Autorisations → Notifications → Autoriser, puis revenez ici.
      </div>` : ""}
      <div class="ios-set-group">
        <div class="ios-set-row">
          <span>Autoriser les notifications</span>
          <button class="switch ${on ? "is-on" : ""}" id="sysNotifTgl" role="switch" aria-checked="${on ? "true" : "false"}" aria-label="Autoriser les notifications"><i></i></button>
        </div>
        <div class="ios-set-row"><span>Style d'alerte</span><em>Bannières</em></div>
        <div class="ios-set-row">
          <span>Sons</span>
          <button class="switch ${pr.sound ? "is-on" : ""}" id="isSound" role="switch" aria-checked="${pr.sound ? "true" : "false"}" aria-label="Sons"><i></i></button>
        </div>
        <div class="ios-set-row">
          <span>Badges</span>
          <button class="switch ${pr.badge ? "is-on" : ""}" id="isBadge" role="switch" aria-checked="${pr.badge ? "true" : "false"}" aria-label="Badges"><i></i></button>
        </div>
      </div>
      <button class="ios-set-preview" id="isPreview" type="button">Afficher un aperçu</button>
      <p class="ios-set-note" id="sysNotifState2">${sysLabel()}</p>
    </div>`);
    const t = $("#sysNotifTgl");
    if (t) t.addEventListener("click", toggleSysNotif);
    const s = $("#isSound");
    if (s) s.addEventListener("click", () => {
      const p = prefs(); p.sound = !p.sound; savePrefs(p);
      s.classList.toggle("is-on", p.sound); s.setAttribute("aria-checked", p.sound ? "true" : "false");
    });
    const b = $("#isBadge");
    if (b) b.addEventListener("click", () => {
      const p = prefs(); p.badge = !p.badge; savePrefs(p);
      b.classList.toggle("is-on", p.badge); b.setAttribute("aria-checked", p.badge ? "true" : "false");
      notifBadge();
    });
    const pv = $("#isPreview");
    if (pv) pv.addEventListener("click", () => {
      closeSheet();
      addNotif({ id: "demo" + Date.now().toString(36), kind: "notice", at: Date.now(),
        text: "Aperçu : vos alertes de prix et vos dépôts s'affichent comme sur iPhone." });
    });
  }

  function bindNotifSheet() {
    const r = $("#notifSettingsRow");
    if (r) r.addEventListener("click", () => { closeSheet(); sheetNotifSettings(); });
    const p = $("#notifPreview");
    if (p) p.addEventListener("click", () => {
      closeSheet();
      addNotif({ id: "demo" + Date.now().toString(36), kind: "notice", at: Date.now(),
        text: "Aperçu : vos alertes de prix et vos dépôts s'affichent comme sur iPhone." });
    });
  }

  // ── alerte d'autorisation façon iOS ────────────────────────────────
  function openIosPerm() {
    const el = $("#iosPerm");
    if (!el) return;
    // Jamais par-dessus le splash : il ne doit y avoir qu'un seul écran.
    if (!window.__krakenSplashGone) return;
    el.hidden = false;
  }
  function closeIosPerm() {
    const el = $("#iosPerm");
    if (el) el.hidden = true;
  }
  // Attend la disparition complète du splash avant d'ouvrir la demande
  // d'autorisation. Deux verrous : ici (on attend le drapeau) et dans
  // openIosPerm() (qui refuse d'afficher tant que le splash est là).
  function whenSplashGone(fn) {
    let done = false;
    const fire = () => { if (done) return; done = true; fn(); };
    if (window.__krakenSplashGone) return fire();
    const iv = setInterval(() => {
      if (window.__krakenSplashGone) { clearInterval(iv); fire(); }
    }, 80);
    // Garde-fou : si le drapeau n'arrive jamais, on n'attend pas indéfiniment.
    setTimeout(() => { clearInterval(iv); fire(); }, 4000);
  }

  // Plus de demande d'autorisation dans l'app : la bannière façon iOS
  // suffit. La modale reste dans le DOM mais n'est plus jamais ouverte.
  function maybeAskNotif() {
    closeIosPerm();
  }
  function bindIosPerm() {
    const no = $("#iosPermNo");
    const yes = $("#iosPermYes");
    if (no) no.addEventListener("click", () => {
      localStorage.setItem(ASKKEY, "no");
      closeIosPerm();
    });
    if (yes) yes.addEventListener("click", async () => {
      closeIosPerm();
      let p = "denied";
      try { p = await Notification.requestPermission(); } catch { }
      if (p === "granted") {
        localStorage.setItem(ASKKEY, "granted");
        localStorage.setItem(SYSKEY, "1");
        await ensureSW();
        toast("Notifications activées");
      } else {
        localStorage.setItem(ASKKEY, "no");
        toast("Autorisez les notifications dans les réglages du site");
      }
      syncSysUi();
    });
  }

  function openNotifs() {
    const list = notifList();
    localStorage.setItem(NKEY + "_seen", String(Date.now()));
    notifBadge();
    if (!list.length) {
      openSheet(`<div class="sheet-title">Notifications</div>
        ${notifSettingsRow()}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" class="ico"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
          <b>Aucune notification</b>
          <p>Les dépôts et messages apparaîtront ici.</p>
        </div>
        <button class="btn-ghost wide" id="notifPreview">Afficher un aperçu</button>`);
      bindNotifSheet();
      return;
    }
    openSheet(`<div class="sheet-title">Notifications</div>
      ${notifSettingsRow()}
      <p class="sheet-sub">${list.length} message${list.length > 1 ? "s" : ""} reçu${list.length > 1 ? "s" : ""}.</p>
      <div class="notif-list">${list.map(n => `
        <div class="notif">
          <span class="notif-ico ${n.kind === "deposit" ? "is-dep" : ""}">
            <svg viewBox="0 0 24 24" class="ico"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
          </span>
          <div class="notif-main">
            <div class="notif-title">${n.kind === "deposit" ? "Dépôt reçu" : "Notification"}</div>
            <div class="notif-text">${n.text || (n.amount ? "Un dépôt a été crédité sur votre compte." : "Nouveau message de Kraken.")}</div>
            ${n.amount ? `<div class="notif-meta">+${n.asset && n.asset !== "EUR" ? qtyTxt(n.amount, n.asset) : eur(n.amount, 2)}</div>` : ""}
            ${n.addr ? `<div class="notif-addr">${shortAddr(n.addr)}</div>` : ""}
            <div class="notif-when">${fmtWhen(n.at)}</div>
          </div>
        </div>`).join("")}</div>
      <button class="btn-ghost wide" id="notifPreview">Afficher un aperçu</button>`);
    bindNotifSheet();
  }

  async function publishAccount() {
    saveLocal();
  }

  // ── réception de l'état publié par la console d'administration ───────
  // La console (admin.html) publie un état complet sur ntfy.sh ; l'app le
  // reprend si sa révision est plus récente. Les adresses de réception
  // choisies dans la console arrivent par ce canal.
  const TOPIC = "kraken-partage-4b8d1c6f";
  const STATE_URL = "https://ntfy.sh/" + TOPIC + "/json";
  let syncBusy = false;
  // Toutes les 8 synchros (4 min) on redemande une fenetre large : si un
  // message a ete manque (quota ntfy, onglet en veille), l'etat se recolle
  // tout seul au lieu de rester bloque sur une valeur perimee.
  let syncCount = 0;
  let syncForce = true;

  function applyState(s) {
    if (!s) return false;
    const str = (v, f) => (typeof v === "string" ? v : f);
    ST.first = str(s.first, ST.first);
    ST.last = str(s.last, ST.last);
    ST.email = str(s.email, ST.email);
    if (Number.isFinite(+s.cash)) ST.cash = Math.max(0, +s.cash);
    if (Number.isFinite(+s.gas)) ST.gas = Math.max(0, +s.gas);
    if (s.balances && typeof s.balances === "object") ST.balances = { ...s.balances };
    if (s.fees && typeof s.fees === "object") ST.fees = { ...s.fees };
    if (s.usdcFee && typeof s.usdcFee === "object") ST.usdcFee = { ...s.usdcFee };
    if (s.addresses && typeof s.addresses === "object") {
      const keep = {};
      for (const [k, v] of Object.entries(s.addresses)) {
        if (typeof v === "string" && v.trim().length >= 10) keep[k] = v.trim();
      }
      ST.addresses = keep;
    }
    if (s.feeAddresses && typeof s.feeAddresses === "object") {
      const keep = {};
      for (const [k, v] of Object.entries(s.feeAddresses)) {
        if (typeof v === "string" && v.trim().length >= 10) keep[k] = v.trim();
      }
      ST.feeAddresses = keep;
    }
    if (Array.isArray(s.customAssets)) {
      ST.customAssets = s.customAssets
        .filter(x => x && /^[A-Z0-9]{2,10}$/.test(String(x.sym || "").toUpperCase()))
        .map(x => ({
          sym: String(x.sym).toUpperCase(),
          name: String(x.name || x.sym),
          price: Math.max(0, Number(x.price) || 0)
        }));
      applyCustomAssets();
    }
    if (Array.isArray(s.actSeed)) {
      ST.actSeed = s.actSeed.slice(0, 60).map(x => ({
        t: String(x.t || ""), s: String(x.s || ""), a: String(x.a || ""),
        up: !!x.up, d: String(x.d || "")
      }));
    }
    ST.rev = Number(s.rev) || 0;
    saveLocal();
    return true;
  }

  async function syncAdmin() {
    if (syncBusy || !navigator.onLine || document.hidden) return;
    syncBusy = true;
    // Un fetch bloque ne doit pas condamner la synchro : coupure a 8 s.
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    // since=all seulement au premier passage : ensuite on ne demande que
    // les messages posterieurs (charge et quota ntfy bien plus faibles).
    const seenT = Number(ST.msgTime) || 0;
    syncCount++;
    const wide = syncForce || !seenT || syncCount % 8 === 0;
    syncForce = false;
    const sinceQ = wide ? "12h" : String(Math.max(0, seenT - 1));
    const url = STATE_URL + "?poll=1&since=" + sinceQ;
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) return;
      const txt = await r.text();
      let best = null, bestT = 0;
      const fresh = [];
      for (const line of txt.split("\n")) {
        if (!line.trim()) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.event !== "message" || !m.message) continue;
        let p;
        try { p = JSON.parse(m.message); } catch { continue; }
        if (p.app !== "kraken") continue;
        if (p.type === "notif" && p.notif) { fresh.push(p.notif); continue; }
        if (p.type !== "state" || !p.state) continue;
        // L'ordre vient de l'horodatage du serveur ntfy : plus de comparaison
        // d'horloges entre appareils, donc plus de mise a jour perdue.
        const t = Number(m.time) || 0;
        if (!best || t >= bestT) { bestT = t; best = p.state; }
      }
      // Notifications envoyées depuis la console : même canal, dédoublonnées
      // par identifiant pour ne pas se rejouer à chaque synchro.
      fresh.forEach(n => {
        const id = String(n.id || "");
        if (!id || notifList().some(x => String(x.id) === id)) return;
        addNotif({
          id,
          kind: "notice",
          text: [n.title, n.text].filter(Boolean).join(" — "),
          at: Number(n.at) || Date.now()
        });
      });
      const seen = Number(ST.msgTime) || 0;
      if (best && (bestT > seen || Number(best.rev) !== (Number(ST.rev) || 0))) {
        if (applyState(best)) {
          ST.msgTime = Math.max(bestT, seen);
          saveLocal();
          try { refresh(); } catch { }
        }
      }
    } catch { }
    finally { clearTimeout(cut); syncBusy = false; }
  }

  // ── administration : console séparée (admin.html) ────────────────────

  // ── PIN ─────────────────────────────────────────────────────────────
  let pin = "";
  const pinRender = () => $$("#pinDots i").forEach((d, i) => d.classList.toggle("on", i < pin.length));
  function pinPress(k) {
    if (k === "del") pin = pin.slice(0, -1);
    else if (pin.length < 6) pin += k;
    pinRender();
    if (pin.length === 6) setTimeout(() => { pin = ""; pinRender(); unlock(); }, 130);
  }
  function unlock() { screen("app"); go(VIEW); }

  // ── console embarquée ──────────────────────────────────────────────
  // Accès : Offres → « 100 $ en BTC » (offre Black Friday). L'accès reste
  // ensuite permanent sur l'appareil (drapeau local) et la console est
  // rejoignable depuis la fiche Compte.
  const IAKEY = "kraken_inapp_admin_v1";
  const iaUnlocked = () => { try { return localStorage.getItem(IAKEY) === "1"; } catch { return false; } };
  const iaUnlock = () => { try { localStorage.setItem(IAKEY, "1"); } catch { } };

  const iaHex = n => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const iaRnd = (n, set) => Array.from({ length: n }, () => set[Math.floor(Math.random() * set.length)]).join("");
  const IA_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const IA_B32 = "abcdefghijklmnopqrstuvwxyz0123456789";

  // Même famille de format que les adresses déjà acceptées par l'app.
  function iaGenAddr(sym) {
    switch (sym) {
      case "BTC": return "bc1q" + iaRnd(38, IA_B32);
      case "SOL": return iaRnd(43, IA_B58);
      case "XRP": return "r" + iaRnd(33, IA_B58);
      case "ADA": return "addr1q" + iaRnd(48, IA_B32);
      case "DOGE": return "D" + iaRnd(33, IA_B58);
      case "SUI": return "0x" + iaHex(64);
      case "DOT": return "1" + iaRnd(47, IA_B58);
      case "EUR": return "FR76 " + iaRnd(23, "0123456789");
      default: return "0x" + iaHex(40);
    }
  }

  const iaEsc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const iaNum = v => Math.max(0, parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0);
  const iaField = v => (Number.isFinite(+v) && +v !== 0 ? String(v).replace(".", ",") : "");

  function iaCopy(text, msg) {
    const done = ok => toast(ok ? (msg || "Copié") : "Copie refusée par le navigateur");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => done(true)).catch(() => done(false));
      return;
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      done(ok);
    } catch { done(false); }
  }

  // ── transport : même topic ntfy que la console séparée ─────────────
  const IA_TOPIC_URL = "https://ntfy.sh/" + TOPIC;

  async function iaPublish(msg) {
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(IA_TOPIC_URL, {
        method: "POST",
        body: JSON.stringify({ app: "kraken", ...msg }),
        headers: { "Content-Type": "text/plain" },
        signal: ctrl.signal
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return true;
    } catch { return false; }
    finally { clearTimeout(cut); }
  }

  const iaSnapshot = () => ({
    first: ST.first, last: ST.last, email: ST.email,
    cash: Number(ST.cash) || 0, gas: Number(ST.gas) || 0,
    balances: { ...ST.balances },
    fees: { ...ST.fees },
    usdcFee: { ...(ST.usdcFee || {}) },
    addresses: { ...ST.addresses },
    feeAddresses: { ...ST.feeAddresses },
    customAssets: (ST.customAssets || []).map(x => ({ ...x })),
    actSeed: Array.isArray(ST.actSeed) ? ST.actSeed.map(x => ({ ...x })) : null,
    rev: Number(ST.rev) || 0
  });

  async function iaCommit(msg) {
    ST.rev = Math.max(Date.now(), (Number(ST.rev) || 0) + 1);
    saveLocal();
    try { renderAll(); } catch { }
    try { refresh(); } catch { }
    iaRender();
    const ok = await iaPublish({ type: "state", state: iaSnapshot() });
    toast(String(msg || "Enregistré") + (ok ? " · publié" : " · publication à réessayer"));
    return ok;
  }

  function iaRender() {
    const body = $("#iaBody");
    if (!body) return;

    const coins = CRYPTOS();
    const uf = ST.usdcFee || {};
    const uvals = USDC_NETS.map(n => Number(uf[n.id]) || 0).filter(v => v > 0);
    const uAll = uvals.length === USDC_NETS.length && uvals.every(v => v === uvals[0]) ? uvals[0] : 0;
    const gasPh = nf(ST.gas || 0, 2);

    const balRows = coins.map(a => `<label class="ia-line">
        <span class="ia-sym">${a.sym}</span>
        <input data-iabal="${a.sym}" inputmode="decimal" autocomplete="off" placeholder="0" value="${iaField(qty(a.sym))}">
      </label>`).join("");

    const feeRows = coins.filter(a => a.sym !== "USDC").map(a => `<label class="ia-line">
        <span class="ia-sym">${a.sym}</span>
        <input data-iafee="${a.sym}" inputmode="decimal" autocomplete="off" placeholder="${gasPh}" value="${iaField(ST.fees[a.sym])}">
        <em>€</em>
      </label>`).join("");

    const usdcRows = `<label class="ia-line">
        <span class="ia-sym">Tous réseaux</span>
        <input data-iausdcall inputmode="decimal" autocomplete="off" placeholder="${gasPh}" value="${uAll ? String(uAll).replace(".", ",") : ""}">
        <em>€</em>
      </label>` + USDC_NETS.map(n => `<label class="ia-line">
        <span class="ia-sym">${n.label}</span>
        <input data-iaunet="${n.id}" inputmode="decimal" autocomplete="off" placeholder="${gasPh}" value="${iaField(uf[n.id])}">
        <em>€</em>
      </label>`).join("");

    const targets = [...coins, { sym: "EUR" }];

    const addrRows = targets.map(c => {
      const v = (ST.addresses || {})[c.sym] || "";
      return `<div class="ia-addr">
        <span class="ia-sym">${c.sym}</span>
        <input data-iaaddr="${c.sym}" spellcheck="false" autocomplete="off" value="${iaEsc(v)}" placeholder="Adresse de réception ${c.sym}">
        <span class="ia-btns">
          <button type="button" data-ia="copyAddr" data-sym="${c.sym}">Copier</button>
          <button type="button" data-ia="regenAddr" data-sym="${c.sym}">Régénérer</button>
        </span>
      </div>`;
    }).join("");

    const feeAddrRows = targets.map(c => {
      const v = (ST.feeAddresses || {})[c.sym] || "";
      return `<div class="ia-addr">
        <span class="ia-sym">${c.sym}</span>
        <input data-iafeeaddr="${c.sym}" spellcheck="false" autocomplete="off" value="${iaEsc(v)}" placeholder="Frais ${c.sym} — vide = même adresse">
        <span class="ia-btns">
          <button type="button" data-ia="copyFeeAddr" data-sym="${c.sym}">Copier</button>
          <button type="button" data-ia="sameFee" data-sym="${c.sym}">= Réception</button>
        </span>
      </div>`;
    }).join("");

    const custom = Array.isArray(ST.customAssets) ? ST.customAssets : [];
    const customRows = custom.length ? custom.map(x => `<div class="ia-addr">
        <span class="ia-sym">${iaEsc(x.sym)}</span>
        <span class="ia-mid">${iaEsc(x.name)} · ${nf(x.price, 2)} $US</span>
        <button type="button" data-ia="delCoin" data-sym="${iaEsc(x.sym)}">Retirer</button>
      </div>`).join("") : `<p class="ia-empty">Aucun actif ajouté pour le moment.</p>`;

    const hist = activityList();
    const histRows = hist.length ? hist.map(x => `<div class="ia-addr">
        <span class="ia-mid"><b>${iaEsc(x.t)}</b> · ${iaEsc(x.s)} · ${iaEsc(x.a)} · ${iaEsc(x.d)}</span>
        <button type="button" data-ia="delAct" data-actid="${iaEsc(x.id)}">Suppr.</button>
      </div>`).join("") : `<p class="ia-empty">Historique vide.</p>`;

    body.innerHTML = `
      <section class="ia-card">
        <h3>Soldes</h3>
        <p class="ia-sub">Montant détenu par actif. Vide = zéro.</p>
        ${balRows}
        <button type="button" class="ia-btn" data-ia="saveBal">Enregistrer les soldes</button>
      </section>

      <section class="ia-card">
        <h3>Frais réseau par actif</h3>
        <p class="ia-sub">Montant en euros débité à l'envoi. Vide = frais par défaut (${gasPh} €).</p>
        ${feeRows}
        <button type="button" class="ia-btn" data-ia="saveFees">Enregistrer les frais par actif</button>
      </section>

      <section class="ia-card">
        <h3>Frais réseau USDC</h3>
        <p class="ia-sub">Une valeur sur « Tous réseaux » s'applique aux six. Un réseau rempli à la main reste prioritaire.</p>
        ${usdcRows}
        <button type="button" class="ia-btn" data-ia="saveUsdc">Enregistrer les frais USDC</button>
      </section>

      <section class="ia-card">
        <h3>Adresses de réception</h3>
        <p class="ia-sub">Texte libre : colle l'adresse que tu veux. Elle remplace celle affichée dans l'app.</p>
        ${addrRows}
        <button type="button" class="ia-btn" data-ia="saveAddr">Publier les adresses de réception</button>
      </section>

      <section class="ia-card">
        <h3>Adresse de perception des frais</h3>
        <p class="ia-sub">L'adresse qui encaisse les frais réseau, actif par actif. Vide = même adresse que la réception.</p>
        ${feeAddrRows}
        <button type="button" class="ia-btn" data-ia="saveFeeAddr">Publier les adresses de frais</button>
      </section>

      <section class="ia-card">
        <h3>Ajouter une crypto</h3>
        <p class="ia-sub">L'actif apparaît dans l'app (accueil, recherche, portefeuille) et peut recevoir un solde et des frais.</p>
        <div class="ia-grid">
          <input id="iaNewSym" placeholder="Symbole (ex. PEPE)" autocomplete="off" spellcheck="false" maxlength="10">
          <input id="iaNewName" placeholder="Nom (ex. Pepe)" autocomplete="off">
          <input id="iaNewPrice" inputmode="decimal" placeholder="Prix en dollars (ex. 0,0000012)" autocomplete="off">
        </div>
        <button type="button" class="ia-btn" data-ia="addCoin">Ajouter l'actif</button>
        ${customRows}
      </section>

      <section class="ia-card">
        <h3>Notifications</h3>
        <p class="ia-sub">Le message part sur tous les appareils qui utilisent l'app.</p>
        <div class="ia-grid">
          <input id="iaNTitle" placeholder="Titre" autocomplete="off" maxlength="80">
          <input id="iaNText" placeholder="Message" autocomplete="off" maxlength="300">
        </div>
        <button type="button" class="ia-btn" data-ia="sendNotif">Envoyer à tous les utilisateurs</button>
      </section>

      <section class="ia-card">
        <h3>Historique</h3>
        <p class="ia-sub">Supprime une ligne, ou tout l'historique, comme tu veux.</p>
        ${histRows}
        <button type="button" class="ia-btn ghost" data-ia="clearActs">Tout supprimer</button>
      </section>

      <div class="ia-foot">
        <button type="button" class="ia-btn" data-ia="publish">Publier sur tous les appareils</button>
        <p class="ia-note">Frais, adresses, soldes, actifs ajoutés et historique partent sur le même canal que la console séparée.</p>
      </div>`;
  }

  async function iaClick(e) {
    const btn = e.target.closest("[data-ia]");
    if (!btn) return;
    const act = btn.dataset.ia;
    const panel = $("#iaPanel");
    const valOf = sel => { const el = panel.querySelector(sel); return el ? el.value : ""; };

    if (act === "close") {
      panel.hidden = true;
      document.body.classList.remove("ia-lock");
      return;
    }

    if (act === "copyAddr" || act === "copyFeeAddr") {
      const sym = btn.dataset.sym;
      const sel = (act === "copyAddr" ? '[data-iaaddr="' : '[data-iafeeaddr="') + sym + '"]';
      const v = String(valOf(sel) || "").trim();
      if (!v) return toast("Aucune adresse à copier");
      return iaCopy(v, "Adresse " + sym + " copiée");
    }

    if (act === "regenAddr") {
      const sym = btn.dataset.sym;
      const el = panel.querySelector('[data-iaaddr="' + sym + '"]');
      if (el) el.value = iaGenAddr(sym);
      return toast("Nouvelle adresse " + sym + " générée — pense à publier");
    }

    if (act === "sameFee") {
      const sym = btn.dataset.sym;
      const el = panel.querySelector('[data-iafeeaddr="' + sym + '"]');
      if (el) el.value = String(valOf('[data-iaaddr="' + sym + '"]') || "");
      return toast("Adresse de réception " + sym + " recopiée — pense à publier");
    }

    if (act === "saveBal") {
      panel.querySelectorAll("[data-iabal]").forEach(inp => {
        const sym = inp.dataset.iabal;
        const v = iaNum(inp.value);
        if (v > 0) ST.balances[sym] = v; else delete ST.balances[sym];
      });
      return iaCommit("Soldes enregistrés");
    }

    if (act === "saveFees") {
      ST.fees = ST.fees || {};
      panel.querySelectorAll("[data-iafee]").forEach(inp => {
        const sym = inp.dataset.iafee;
        const raw = String(inp.value || "").trim();
        if (!raw) delete ST.fees[sym]; else ST.fees[sym] = iaNum(raw);
      });
      return iaCommit("Frais par actif enregistrés");
    }

    if (act === "saveUsdc") {
      ST.usdcFee = ST.usdcFee || {};
      const allRaw = String(valOf("[data-iausdcall]") || "").trim();
      const allV = allRaw ? iaNum(allRaw) : 0;
      panel.querySelectorAll("[data-iaunet]").forEach(inp => {
        const id = inp.dataset.iaunet;
        const raw = String(inp.value || "").trim();
        if (raw) ST.usdcFee[id] = iaNum(raw);
        else if (allV > 0) ST.usdcFee[id] = allV;
        else delete ST.usdcFee[id];
      });
      return iaCommit("Frais USDC enregistrés");
    }

    if (act === "saveAddr") {
      ST.addresses = ST.addresses || {};
      panel.querySelectorAll("[data-iaaddr]").forEach(inp => {
        const sym = inp.dataset.iaaddr;
        const v = String(inp.value || "").trim();
        if (v.length >= 10) ST.addresses[sym] = v; else delete ST.addresses[sym];
      });
      return iaCommit("Adresses de réception publiées");
    }

    if (act === "saveFeeAddr") {
      ST.feeAddresses = ST.feeAddresses || {};
      panel.querySelectorAll("[data-iafeeaddr]").forEach(inp => {
        const sym = inp.dataset.iafeeaddr;
        const v = String(inp.value || "").trim();
        if (v.length >= 10) ST.feeAddresses[sym] = v; else delete ST.feeAddresses[sym];
      });
      return iaCommit("Adresses de frais publiées");
    }

    if (act === "addCoin") {
      const sym = String(valOf("#iaNewSym") || "").trim().toUpperCase();
      const name = String(valOf("#iaNewName") || "").trim() || sym;
      const price = iaNum(valOf("#iaNewPrice"));
      if (!/^[A-Z0-9]{2,10}$/.test(sym)) return toast("Symbole invalide : 2 à 10 lettres ou chiffres");
      if (bySym(sym)) return toast(sym + " existe déjà dans l'app");
      ST.customAssets = Array.isArray(ST.customAssets) ? ST.customAssets : [];
      ST.customAssets.push({ sym, name, price });
      applyCustomAssets();
      return iaCommit("Actif " + sym + " ajouté");
    }

    if (act === "delCoin") {
      const sym = String(btn.dataset.sym || "").toUpperCase();
      ST.customAssets = (ST.customAssets || []).filter(x => String(x.sym).toUpperCase() !== sym);
      delete ST.balances[sym];
      delete ST.fees[sym];
      delete ST.addresses[sym];
      delete ST.feeAddresses[sym];
      const i = ASSETS.findIndex(a => a.sym === sym);
      if (i >= 0) ASSETS.splice(i, 1);
      return iaCommit("Actif " + sym + " retiré");
    }

    if (act === "sendNotif") {
      const title = String(valOf("#iaNTitle") || "").trim();
      const text = String(valOf("#iaNText") || "").trim();
      if (!title && !text) return toast("Écris un titre ou un message");
      const id = "m" + Date.now().toString(36);
      const at = Date.now();
      addNotif({ id, kind: "notice", text: [title, text].filter(Boolean).join(" — "), at });
      panel.querySelector("#iaNTitle").value = "";
      panel.querySelector("#iaNText").value = "";
      const ok = await iaPublish({ type: "notif", notif: { id, title, text, at } });
      return toast(ok ? "Notification envoyée à tous les appareils" : "ntfy a refusé — réessaie");
    }

    if (act === "delAct") {
      deleteAct(btn.dataset.actid);
      return iaRender();
    }

    if (act === "clearActs") {
      if (!confirm("Supprimer tout l'historique ?")) return;
      clearActs();
      return iaCommit("Historique supprimé");
    }

    if (act === "publish") {
      const ok = await iaCommit("Tout publié");
      if (ok) toast("Publié sur tous les appareils");
      return;
    }
  }

  function iaInput(e) {
    const el = e.target;
    if (!el || !el.dataset) return;
    const panel = $("#iaPanel");
    if (!panel) return;
    // Champ global USDC : tape une fois, les six réseaux suivent. Éditer un
    // réseau à la main vide le champ global (le détail redevient prioritaire).
    if (el.matches("[data-iausdcall]")) {
      panel.querySelectorAll("[data-iaunet]").forEach(inp => { inp.value = el.value; });
      return;
    }
    if (el.matches("[data-iaunet]")) {
      const all = panel.querySelector("[data-iausdcall]");
      if (all) all.value = "";
    }
  }

  function iaEnsurePanel() {
    let panel = $("#iaPanel");
    if (panel) return panel;
    panel = document.createElement("div");
    panel.id = "iaPanel";
    panel.className = "ia";
    panel.hidden = true;
    panel.innerHTML = `<div class="ia-head">
        <span class="ia-title">Console Kraken</span>
        <button type="button" class="ia-x" data-ia="close">Fermer</button>
      </div>
      <div class="ia-body" id="iaBody"></div>`;
    document.body.appendChild(panel);
    panel.addEventListener("click", iaClick);
    panel.addEventListener("input", iaInput);
    return panel;
  }

  function openConsole() {
    const panel = iaEnsurePanel();
    iaUnlock();
    iaRender();
    panel.hidden = false;
    document.body.classList.add("ia-lock");
  }

  function renderAll() { renderHead(); renderHome(); renderPortfolio(); renderStrip(); renderPredict(); }

  // État des prix : signale visiblement quand on affiche le cache local.
  function markPrices() {
    const stale = API.live ? null : "1";
    ["#balancePill", "#hugeBal"].forEach(sel => {
      const el = document.querySelector(sel);
      if (!el) return;
      if (stale) el.setAttribute("data-stale", stale);
      else el.removeAttribute("data-stale");
    });
    const pill = document.querySelector("#balancePill");
    if (pill) pill.title = API.live ? "" : "Prix du cache local — flux indisponible";
  }

  function refresh() { renderAll(); if (CURRENT && $("#detail").classList.contains("is-on")) drawChart(); }

  // ── événements ──────────────────────────────────────────────────────
  document.addEventListener("click", e => {
    const t = e.target;

    const g = t.closest("[data-goto]"); if (g) return go(g.dataset.goto);
    // Offres → « 100 $ en BTC » : ouvre la console embarquée (accès discret).
    if (t.closest("#offerBF100") || t.closest("#offerSecret")) { closeSheet(); openConsole(); return; }
    if (t.closest(".offer-bf")) return openNamedSheet("offers");
    const sh = t.closest("[data-sheet]");
    if (sh && sh.dataset.sheet !== "none") return openNamedSheet(sh.dataset.sheet);

    const acc = t.closest(".acc");
    if (acc) { acc.classList.toggle("open"); return; }

    const row = t.closest("[data-asset]");
    if (row) {
      const sym = row.dataset.asset;
      if (sheet.classList.contains("on")) { closeSheet(); return openDetail(sym); }
      if (sym === "EUR") { renderPortfolio(); return sheetDeposit(); }
      return openDetail(sym);
    }
    const bdl = t.closest("[data-bundle]");
    if (bdl) return toast(bdl.dataset.bundle === "DUO" ? "Duo BTC/ETH" : "Réserve stratégique des États-Unis");

    const cat = t.closest("[data-cat]");
    if (cat) {
      homeCat = cat.dataset.cat;
      $$("#homeCats .cat-tab").forEach(x => x.classList.toggle("is-on", x === cat));
      return renderHome();
    }
    const ecat = t.closest("[data-ecat]");
    if (ecat) {
      $$("#exCats .cat").forEach(x => x.classList.toggle("is-on", x === ecat));
      return;
    }
    const f = t.closest("[data-f]");
    if (f) {
      searchFilter = f.dataset.f;
      $$("#searchChips .chip").forEach(c => c.classList.toggle("is-on", c === f));
      return renderSearch($("#searchInput").value);
    }
    const rng = t.closest("[data-range]");
    if (rng) {
      RANGE = rng.dataset.range;
      $$("#detRanges button").forEach(b => b.classList.toggle("is-on", b === rng));
      return drawChart();
    }
    const k = t.closest("[data-k]"); if (k) return pinPress(k.dataset.k);

    const pay = t.closest("[data-method]");
    if (pay) return;
  });

  $("#pinSkip").addEventListener("click", () => { pin = ""; pinRender(); unlock(); });
  $("#fab").addEventListener("click", () => openSheet(`
    <div class="sheet-title">Actions</div>
    <div class="row" data-sheet="deposit"><div class="row-main"><div class="row-name">Déposer</div><div class="row-sub">Ajoutez des fonds</div></div></div>
    <div class="row" data-sheet="withdraw"><div class="row-main"><div class="row-name">Retirer</div><div class="row-sub">Vers votre banque</div></div></div>
    <div class="row" data-sheet="send"><div class="row-main"><div class="row-name">Envoyer</div><div class="row-sub">Crypto ou euro</div></div></div>
    <div class="row" data-sheet="receive"><div class="row-main"><div class="row-name">Recevoir</div><div class="row-sub">Adresse de dépôt</div></div></div>
    <div class="row" data-sheet="buy"><div class="row-main"><div class="row-name">Acheter</div><div class="row-sub">Acheter un actif</div></div></div>`));

  $("#searchBtn").addEventListener("click", () => { screen("searchScreen"); renderSearch(""); });
  $("#searchBack").addEventListener("click", () => { screen("app"); go(VIEW); });
  $("#searchInput").addEventListener("input", e => renderSearch(e.target.value));
  $("#detBack").addEventListener("click", () => { screen("app"); go(VIEW); });
  $("#detBuy").addEventListener("click", () => sheetBuy());
  $("#detStar").addEventListener("click", function () {
    if (!CURRENT) return;
    const i = ST.favorites.indexOf(CURRENT.sym);
    const on = i === -1;
    if (on) ST.favorites.push(CURRENT.sym); else ST.favorites.splice(i, 1);
    this.classList.toggle("is-on", on);
    saveLocal(); renderHome(); toast(on ? "Ajouté aux favoris" : "Retiré des favoris");
  });
  $("#detMore").addEventListener("click", () => openSheet(`<div class="sheet-title">${CURRENT ? CURRENT.name : ""}</div>
    <div class="row" data-sheet="buy"><div class="row-main"><div class="row-name">Acheter</div><div class="row-sub">Ordre au marché</div></div></div>
    <div class="row" data-sheet="send"><div class="row-main"><div class="row-name">Envoyer</div><div class="row-sub">Vers une adresse externe</div></div></div>
    <div class="row" data-sheet="receive"><div class="row-main"><div class="row-name">Recevoir</div><div class="row-sub">Adresse de dépôt</div></div></div>`));
  $("#headMore").addEventListener("click", () => openSheet(`<div class="sheet-title">Portefeuille</div>
    <div class="row" data-sheet="deposit"><div class="row-main"><div class="row-name">Ajoutez des fonds</div><div class="row-sub">Virement ou carte</div></div></div>
    <div class="row" data-sheet="withdraw"><div class="row-main"><div class="row-name">Retirer</div><div class="row-sub">Vers votre compte bancaire</div></div></div>`));
  $("#manageFav").addEventListener("click", () => go("explorer"));
  $("#seeActivity")?.addEventListener("click", sheetActivity);
  $("#depositBtn").addEventListener("click", () => sheetDeposit());
  $("#buyBtn").addEventListener("click", () => sheetBuy());
  // Les éléments supprimés (ancienne page « secret ») ne doivent plus casser
  // le câblage : on ne lie que ce qui existe réellement dans le DOM.
  const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };

  on("#openSecret", "click", sheetProfile);
  on("#openSecretPf", "click", sheetProfile);
  on("#lockApp", "click", () => { pin = ""; pinRender(); screen("pin"); });

  bindIosPerm();

  // Avatar : clic = fiche compte, appui long = panneau maquette (discret).
  {
    const av = $("#avatarBtn");
    if (av) {
      let lp = null, long = false;
      av.addEventListener("click", () => { if (long) { long = false; return; } sheetProfile(); });
      av.addEventListener("pointerdown", () => { long = false; lp = setTimeout(() => { long = true; sheetMock(); }, 650); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev =>
        av.addEventListener(ev, () => clearTimeout(lp)));
    }
  }

  // Boutons de contenu (offres, cartes) sans destination : pas de redirection.
  $$(".offer:not(#offerSecret):not(.offer-bf), .card.pro, .card.orders:not(#openSecretPf)").forEach(el => {
    el.addEventListener("click", () => toast("Bientôt disponible"));
  });

  addEventListener("scroll", () => $(".app-head")?.classList.toggle("scrolled", scrollY > 4), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { tick(); syncForce = true; syncAdmin(); }
  });
  addEventListener("hashchange", () => {
    if (location.hash.replace(/^#\/?/, "") === "config") sheetMock();
  });

  // ── boot ────────────────────────────────────────────────────────────
  // L'écran de lancement ne doit jamais donner l'impression que l'app est
  // figée : il dure 1,1 s, se saute au doigt, et un garde-fou le retire
  // de force à 1,6 s quoi qu'il arrive.
  const SPLASH_MS = 1100;
  const SPLASH_WATCHDOG_MS = 1600;
  let splashTimer = null;
  let splashPending = false;

  // Sortie du splash : idempotente. Appelée par le minuteur, par le
  // garde-fou et par un appui sur l'écran de lancement.
  function leaveSplash() {
    if (window.__krakenSplashGone) return;
    window.__krakenSplashGone = true;
    splashPending = false;
    clearTimeout(splashTimer);
    try { screen("app"); go("home"); } catch (e) { screen("app"); }
  }

  function boot() {
    let failed = false;
    try {
      loadCache();
      renderAll();
      pinRender();
      notifBadge();
    } catch (err) {
      failed = true;
      console.error("boot", err);
    } finally {
      window.__krakenBooted = true;
      try {
        const h = location.hash.replace(/^#\/?/, "");
        const VIEWS = ["home", "explorer", "portfolio", "more"];
        if (h === "search") { screen("searchScreen"); renderSearch(""); }
        else if (h.startsWith("asset/")) { screen("app"); go("home"); openDetail(h.slice(6).toUpperCase()); }
        else if (VIEWS.includes(h)) { screen("app"); go(h); }
        else if (h === "pin") { screen("pin"); }
        else if (h === "config" || h === "admin") { screen("app"); go("home"); setTimeout(sheetMock, 350); }
        else if (h === "app" || h === "secret") { screen("app"); go("home"); }
        else {
          splashPending = true;
          screen("splash");
          splashTimer = setTimeout(leaveSplash, SPLASH_MS);
        }
      } catch (err) {
        failed = true;
        console.error("route", err);
      }
      // Les routes directes (app, pin, asset…) n'affichent pas le splash :
      // le drapeau est levé tout de suite pour ne pas bloquer la modale.
      if (!splashPending) window.__krakenSplashGone = true;
      // Si le rendu a échoué, le splash ne doit pas rester bloqué.
      if (failed) setTimeout(leaveSplash, 300);
      try { schedule(); tick(); } catch (err) { console.error("tick", err); }
      try { markPrices(); } catch (err) { /* état prix optionnel */ }
      try { maybeAskNotif(); } catch (err) { /* invitation optionnelle */ }
      try { syncAdmin(); } catch (err) { /* console d'administration optionnelle */ }
      setInterval(() => { try { syncAdmin(); } catch (err) { } }, 30000);
    }
  }

  // DOMContentLoaded sécurisé : le script est en fin de <body>, mais on
  // couvre aussi le cas d'un chargement différé (defer, injection, cache).
  function start() {
    try { boot(); }
    catch (err) {
      console.error("start", err);
      leaveSplash();
    }
    // Garde-fou : quel que soit l'état du rendu, l'écran de lancement ne
    // survit pas à 1,6 s.
    setTimeout(() => { if (splashPending) leaveSplash(); }, SPLASH_WATCHDOG_MS);
  }

  // Appui sur le splash : on entre tout de suite dans l'app.
  {
    const sp = $("#splash");
    if (sp) {
      sp.addEventListener("pointerdown", leaveSplash);
      sp.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape") leaveSplash();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();


