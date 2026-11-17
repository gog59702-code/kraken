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
    S("AAPLx", "Apple", 357.19, 0.22, "", "#101114", "assets/img/stocks/aapl.svg"),
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
    rev: 0
  };
  const KEY = "kraken_demo_v4";
  let ST = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return structuredClone(DEFAULTS);
      const p = JSON.parse(raw);
      return {
        ...structuredClone(DEFAULTS), ...p,
        favorites: Array.isArray(p.favorites) ? p.favorites : DEFAULTS.favorites,
        balances: { ...(p.balances || {}) },
        fees: { ...(p.fees || {}) },
        usdcFee: { ...(p.usdcFee || {}) },
        addresses: { ...(p.addresses || {}) }
      };
    } catch { return structuredClone(DEFAULTS); }
  }
  const saveLocal = () => localStorage.setItem(KEY, JSON.stringify(ST));
  const save = () => saveLocal();

  // ── formats ─────────────────────────────────────────────────────────
  const nf = (n, d = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
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
  const priceOf = a => a.type === "stock" ? a.price * API.eurusd : a.price;
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
        if (bySym("BTC").price > 0) API.eurusd = +p.price / bySym("BTC").price;
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
    $$(".tab").forEach(t => t.classList.toggle("is-on", t.dataset.goto === v));
    renderHead();
    scrollTo({ top: 0 });
    if (v === "home") renderHome();
    if (v === "explorer") { renderStrip(); renderPredict(); }
    if (v === "portfolio") renderPortfolio();
  }

  // ── rendu : en-tête ─────────────────────────────────────────────────
  function renderHead() {
    const ini = ((ST.first || "?")[0] || "?").toUpperCase();
    $("#avatarBtn").textContent = ini;
    $("#balancePill").textContent = eur(totalEUR(), 2);
    $("#appHead").classList.toggle("no-pill", VIEW === "home");
    $("#headRight").classList.toggle("grouped", VIEW === "portfolio");
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
    const picks = ["AAPLx", "NVDAx", "QQQx", "SPYx"].map(bySym);
    $("#assetStrip").innerHTML = picks.map(a => `
      <button class="acard" data-asset="${a.sym}">
        ${iconFor(a)}
        <span class="acard-name">${a.name}</span>
        <span class="acard-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)} %</span>
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
            <span class="predict-sub">Prix actuel : ${usd(p * API.eurusd)}</span>
          </div>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(up * API.eurusd)}</div>
            <div class="pred-odds up">$100 → ${usd(odds(up * API.eurusd))}</div></div>
          <button class="go up" data-pred="up"><svg viewBox="0 0 24 24" class="ico"><path d="M7 17L17 7M9 7h8v8"/></svg></button>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(down * API.eurusd)}</div>
            <div class="pred-odds down">$100 → ${usd(odds(down * API.eurusd))}</div></div>
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

  function activityList() {
    const mine = notifList()
      .filter(n => n.kind === "deposit" || n.kind === "withdraw")
      .map(n => ({
        t: n.kind === "deposit" ? "Dépôt reçu" : "Retrait envoyé",
        s: n.addr ? (n.asset || "Crypto") + " · " + shortAddr(n.addr) : (n.asset || "Crypto"),
        a: (n.kind === "deposit" ? "+" : "-") + (n.asset && n.asset !== "EUR" ? qtyTxt(n.amount, n.asset) : eur(n.amount, 2)),
        up: n.kind === "deposit",
        d: fmtWhen(n.at)
      }));
    return mine.concat(ACT_SEED);
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
      <div class="mock-grid">
        <label class="mock-field"><span>Adresse de réception USDC (EVM)</span>
          <input id="mkEvm" value="${CFG.addrEvm}" spellcheck="false" autocomplete="off"></label>
        <label class="mock-field"><span>Adresse de réception USDC (Solana)</span>
          <input id="mkSol" value="${CFG.addrSol}" spellcheck="false" autocomplete="off"></label>
      </div>
      <p class="sheet-label">Frais réseau USDC (€)</p>
      <div class="mock-grid">
        ${nets.map(n => `<label class="mock-field"><span>${n.label}</span>
          <input id="mkFee-${n.id}" inputmode="decimal" value="${String(cfgUsdcFee(n.id)).replace(".", ",")}" autocomplete="off"></label>`).join("")}
      </div>
      <button class="btn-black" id="mkSave">Enregistrer</button>
      <button class="btn-ghost wide" id="mkDep">Simuler un dépôt reçu</button>
      <button class="btn-ghost wide" id="mkWd">Simuler un retrait envoyé</button>
      <button class="btn-ghost wide" id="mkReset">Réinitialiser la maquette</button>`);

    $("#mkSave").addEventListener("click", () => {
      CFG.addrEvm = $("#mkEvm").value.trim() || CFG_DEFAULT.addrEvm;
      CFG.addrSol = $("#mkSol").value.trim() || CFG_DEFAULT.addrSol;
      nets.forEach(n => { CFG.usdcFee[n.id] = Math.max(0, parseAmt($("#mkFee-" + n.id).value)); });
      saveCfg(); closeSheet(); renderAll();
    });
    $("#mkDep").addEventListener("click", () => {
      addNotif({ id: "dep" + Date.now().toString(36), kind: "deposit", asset: "USDC", amount: 250, at: Date.now(),
        text: "Dépôt de 250,00 USDC reçu sur votre compte." });
      closeSheet();
    });
    $("#mkWd").addEventListener("click", () => {
      addNotif({ id: "wd" + Date.now().toString(36), kind: "withdraw", asset: "USDC", amount: 45, addr: CFG.addrEvm, at: Date.now(),
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
    openSheet(`<div class="sheet-title">${ST.first || "Compte"} ${ST.last || ""}</div>
      <p class="sheet-sub">Compte particulier · créé le 12 mars 2014</p>
      <div class="recap">
        <div class="rc-row"><span>Adresse e-mail</span><b>${ST.email || "—"}</b></div>
        <div class="rc-row"><span>Statut</span><b class="ok">Vérifié</b></div>
        <div class="rc-row"><span>Niveau de vérification</span><b>Intermédiaire</b></div>
        <div class="rc-row"><span>Solde total</span><b>${eur(totalEUR(), 2)}</b></div>
        <div class="rc-row"><span>Solde en euros</span><b>${eur(cash(), 2)}</b></div>
      </div>
      <button class="btn-black" id="pfAct">Voir l'activité</button>
      <button class="btn-ghost wide" id="pfSet">Notifications</button>`);
    $("#pfAct").addEventListener("click", sheetActivity);
    $("#pfSet").addEventListener("click", () => { closeSheet(); openNotifs(); });
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
      : `<p class="muted" style="padding:26px 0;text-align:center">Aucun actif trouvé.</p>`;
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
    $("#detHigh").textContent = a.type === "stock" ? usd(Math.max(...closes) / API.eurusd) : eur(Math.max(...closes));
    $("#detLow").textContent = a.type === "stock" ? usd(Math.min(...closes) / API.eurusd) : eur(Math.min(...closes));
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
    usdcFee: { erc20: 2.40, polygon: 0.02, arbitrum: 0.02, optimism: 0.02, base: 0.02, solana: 0.01 }
  };
  function readCfg() { try { return JSON.parse(localStorage.getItem(CFGKEY)); } catch { return null; } }
  function saveCfg() { try { localStorage.setItem(CFGKEY, JSON.stringify(CFG)); } catch { /* quota */ } }
  const CFG = Object.assign({}, CFG_DEFAULT, readCfg() || {});
  CFG.usdcFee = Object.assign({}, CFG_DEFAULT.usdcFee, CFG.usdcFee || {});
  const cfgUsdcFee = (netId) => {
    const v = Number(CFG.usdcFee?.[netId]);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };

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
    $$("#pickGrid .pick").forEach(b => b.addEventListener("click", () => { closeSheet(); cb(b.dataset.pick); }));
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
      addNotif({ id: "wd" + Date.now().toString(36), kind: "withdraw", asset: PICK, amount: v, addr, at: Date.now(), text: "Retrait envoyé" });
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
    if (sym === "USDC") return CFG.addrEvm;
    if (sym === "SOL") return CFG.addrSol;
    return (ST.addresses && ST.addresses[sym]) || ADDR[sym] || "";
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
    if (f > cash()) {
      return { ok: false, msg: `Frais réseau insuffisants. Cet envoi exige ${eur(f, 2)} de frais réseau ; votre solde en euros est de ${eur(cash(), 2)}. Il manque ${eur(f - cash(), 2)} pour valider la transaction.` };
    }
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
      <div class="fee-line"><span>Montant reçu</span><b id="sdRecv">0 USDC</b></div>
      <div class="fee-line"><span>Solde en euros disponible</span><b>${eur(cash(), 2)}</b></div>
      <button class="btn-black" id="sdGo">Continuer</button>`);

    const syncFee = () => {
      const feeNow = cfgUsdcFee(USDC_NET);
      $("#sdFeeLbl").textContent = "Frais réseau (" + usdcNet().label + ")";
      $("#sdFee").textContent = feeNow > 0 ? eur(feeNow, 2) : "Offerts";
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
      sheetSendConfirm({ pick: "USDC", addr: res.addr, amt: v, fee: res.fee });
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
    if (f > cash()) return { ok: false, msg: `Frais réseau insuffisants. Cet envoi exige ${eur(f, 2)} de frais réseau ; votre solde en euros est de ${eur(cash(), 2)}. Il manque ${eur(f - cash(), 2)} pour valider la transaction.` };
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
        <div class="rc-row total"><span>Total débité</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick) + " + " + eur(fee, 2)}</b></div>
      </div>
      <p class="sheet-note">Les envois sont définitifs. Vérifiez le réseau : un actif envoyé sur un réseau incompatible ne peut pas être récupéré.</p>
      <button class="btn-black" id="sdConfirm">Valider la transaction</button>
      <button class="btn-ghost wide" id="sdCancel">Modifier</button>`);

    $("#sdCancel").addEventListener("click", () => sheetSend(pick));
    $("#sdConfirm").addEventListener("click", () => {
      const res = pick === "USDC" ? checkUsdcSend(addr, amt) : checkSend(pick, addr, amt);
      if (!res.ok) { sheetSend(pick); return setErr(res.msg); }
      if (pick === "EUR") {
        ST.cash = cash() - amt;
      } else {
        ST.balances[pick] = Math.max(0, qty(pick) - amt);
        if (fee) ST.cash = cash() - fee;
      }
      addNotif({
        id: "sd" + Date.now().toString(36), kind: "withdraw", asset: pick,
        amount: amt, addr, at: Date.now(), text: "Envoi de " + qtyTxt(amt, pick) + " confirmé"
      });
      saveLocal(); renderAll();
      sheetSendDone({ pick, addr, amt, fee });
    });
  }

  function sheetSendDone({ pick, addr, amt, fee }) {
    const rnd = new Uint8Array(32);
    crypto.getRandomValues(rnd);
    const ref = "0x" + Array.from(rnd, b => b.toString(16).padStart(2, "0")).join("");
    openSheet(`<div class="sheet-title">Envoi en cours</div>
      <p class="sheet-sub">Votre transaction a été signée puis diffusée sur le réseau.</p>
      <div class="recap">
        <div class="rc-row"><span>Montant</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick)}</b></div>
        <div class="rc-row"><span>Frais réseau</span><b>${fee ? eur(fee, 2) : "Offerts"}</b></div>
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
      <div class="row" data-sheet="none"><div class="row-main"><div class="row-name">100 $ en BTC</div><div class="row-sub">Black Friday · dépôt minimum 1 000 $</div></div></div>`),
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

  function notifBadge() {
    const n = notifList();
    const seen = Number(localStorage.getItem(NKEY + "_seen") || 0);
    const dot = $("#notifDot");
    if (dot) dot.hidden = !n.some(x => (x.at || 0) > seen);
  }

  function showBanner(o) {
    const b = document.createElement("div");
    const label = o.kind === "deposit" ? "Dépôt reçu" : o.kind === "withdraw" ? "Retrait envoyé" : "Notification";
    b.className = "ios-banner";
    b.innerHTML = `<div class="ios-b-ico"><img src="assets/img/app-icons/kraken-192.png" onerror="this.src='assets/img/icons/kraken-192.png'"></div>
      <div class="ios-b-main">
        <div class="ios-b-head"><b>Kraken</b><span>maintenant</span></div>
        <div class="ios-b-title">${label}</div>
        <div class="ios-b-text">${o.text || (o.amount ? (o.kind === "deposit" ? "Dépôt de " : "Retrait de ") + (o.asset && o.asset !== "EUR" ? qtyTxt(o.amount, o.asset) : eur(o.amount, 2)) : "Nouveau message.")}</div>
      </div>`;
    document.body.appendChild(b);
    setTimeout(() => b.classList.add("on"), 80);
    setTimeout(() => { b.classList.remove("on"); setTimeout(() => b.remove(), 600); }, 5200);
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

  function openNotifs() {
    const list = notifList();
    localStorage.setItem(NKEY + "_seen", String(Date.now()));
    notifBadge();
    if (!list.length) {
      openSheet(`<div class="sheet-title">Notifications</div>
        <p class="sheet-sub">Aucune notification pour le moment. Les dépôts et messages envoyés depuis la diffusion apparaissent ici.</p>`);
      return;
    }
    openSheet(`<div class="sheet-title">Notifications</div>
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
        </div>`).join("")}</div>`);
  }

  async function publishAccount() {
    ST.rev = Date.now();
    saveLocal();
  }

  function applyState() { return false; }

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

  function renderAll() { renderHead(); renderHome(); renderPortfolio(); renderStrip(); renderPredict(); }

  function refresh() { renderAll(); if (CURRENT && $("#detail").classList.contains("is-on")) drawChart(); }

  // ── événements ──────────────────────────────────────────────────────
  document.addEventListener("click", e => {
    const t = e.target;

    const g = t.closest("[data-goto]"); if (g) return go(g.dataset.goto);
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

  on("#offerSecret", "click", sheetProfile);
  on("#openSecret", "click", sheetProfile);
  on("#openSecretPf", "click", sheetProfile);
  on("#lockApp", "click", () => { pin = ""; pinRender(); screen("pin"); });

  on("#notifBtn", "click", openNotifs);

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
  $$(".offer:not(#offerSecret), .card.pro, .card.orders:not(#openSecretPf)").forEach(el => {
    el.addEventListener("click", () => toast("Bientôt disponible"));
  });

  addEventListener("scroll", () => $(".app-head")?.classList.toggle("scrolled", scrollY > 4), { passive: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  addEventListener("hashchange", () => {
    if (location.hash.replace(/^#\/?/, "") === "config") sheetMock();
  });

  // ── boot ────────────────────────────────────────────────────────────
  // Le splash ne doit jamais pouvoir bloquer l'accès à l'app.
  function boot() {
    try {
      loadCache();
      renderAll();
      pinRender();
      notifBadge();
    } catch (err) {
      console.error("boot", err);
    } finally {
      const h = location.hash.replace(/^#\/?/, "");
      const VIEWS = ["home", "explorer", "portfolio", "more"];
      if (h === "search") { screen("searchScreen"); renderSearch(""); }
      else if (h.startsWith("asset/")) { screen("app"); go("home"); openDetail(h.slice(6).toUpperCase()); }
      else if (VIEWS.includes(h)) { screen("app"); go(h); }
      else if (h === "pin") { screen("pin"); }
      else if (h === "config" || h === "admin") { screen("app"); go("home"); setTimeout(sheetMock, 350); }
      else if (h === "app" || h === "secret") { screen("app"); go("home"); }
      else {
        screen("splash");
        setTimeout(() => { try { screen("app"); go("home"); } catch (e) { screen("app"); } }, 1900);
      }
      schedule();
      tick();
    }
  }
  boot();
})();


