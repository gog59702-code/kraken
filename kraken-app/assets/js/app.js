/* Kraken — client web (PWA). */
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
    first: "Bernard",
    last: "Lefèvre",
    email: "bernard.lefevre@proton.me",
    username: "blefevre",
    phone: "+33 6 12 44 87 21",
    dob: "1987-04-19",
    country: "France",
    postal: "14 rue des Archives, 75004 Paris",
    profileAt: 0,
    created: "2014-03-12",
    cash: 1240.58,
    gas: 2.40,
    favorites: ["BTC", "ETH", "DUO", "USR"],
    balances: { BTC: 0.0012, USDC: 45, SOL: 0.3, ETH: 0.0064 },
    fees: {},
    usdcFee: {},
    addresses: {},
    feeAddresses: {},
    customAssets: [],
    actSeed: null,
    // Suppressions définitives : identifiants masqués pour toujours et date
    // du dernier « tout supprimer ». Publiés dans l'état pour qu'aucun
    // appareil ne ressuscite une ligne effacée.
    delNotifs: [],
    actsAt: 0,
    actSeedAt: 0,
    // Ordres de frais supprimés : même principe que delNotifs, un identifiant
    // enterré ne revient pas par un état publié plus ancien.
    delFees: [],
    // Deltas qui n'ont pas pu partir (quota ntfy, réseau coupé) : ils restent
    // en file et repartent au prochain cycle, sinon un appareil ne verrait
    // jamais le changement et le direct resterait muet jusqu'à la prochaine
    // action de la console.
    outbox: [],
    feeOrders: {},
    rev: 0
  };
  const KEY = "kraken_state_v5";

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
        balAt: { ...(p.balAt || {}) },
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
  // ── API prix : place publique Kraken (paires EUR), repli Binance, puis CoinGecko
  const API = {
    kraken: "https://api.kraken.com/0/public",
    binance: "https://api.binance.com/api/v3",
    gecko: "https://api.coingecko.com/api/v3",
    ids: {
      BTC: "bitcoin", ETH: "ethereum", SOL: "solana", XRP: "ripple", ADA: "cardano",
      DOGE: "dogecoin", SUI: "sui", LINK: "chainlink", AVAX: "avalanche-2", DOT: "polkadot",
      USDC: "usd-coin", HYPE: "hyperliquid"
    },
    pairs: {
      BTC: "XBTEUR", ETH: "ETHEUR", SOL: "SOLEUR", XRP: "XRPEUR", ADA: "ADAEUR",
      DOGE: "DOGEEUR", SUI: "SUIEUR", LINK: "LINKEUR", AVAX: "AVAXEUR", DOT: "DOTEUR",
      USDC: "USDCEUR", HYPE: "HYPEEUR"
    },
    live: false,
    eurusd: 1.08
  };
  const PCACHE = "kraken_prices_v4";

  const jget = url => fetch(url, { cache: "no-store" }).then(r => {
    if (!r.ok) throw new Error(r.status);
    return r.json();
  });

  // Kraken normalise la clé de réponse (XXBTZEUR, XETHZEUR, …) : on lit la
  // première valeur du résultat, quelle que soit la clé renvoyée.
  const firstResult = j => {
    const res = j && j.result;
    if (!res || typeof res !== "object") return null;
    return res[Object.keys(res)[0]] || null;
  };

  async function tick() {
    const cryptos = ASSETS.filter(a => a.type === "crypto" && API.pairs[a.sym]);
    try {
      const res = await Promise.allSettled(cryptos.map(a =>
        jget(`${API.kraken}/Ticker?pair=${API.pairs[a.sym]}`)
      ));
      let n = 0;
      res.forEach((r, i) => {
        if (r.status !== "fulfilled") return;
        const d = firstResult(r.value);
        const last = d && +d.c[0];
        if (!(last > 0)) return;
        const a = cryptos[i];
        a.price = last;
        const open = +d.o;
        if (open > 0) a.chg = ((last - open) / open) * 100;
        n++;
      });
      if (!n) throw new Error("kraken");
      try {
        const d = firstResult(await jget(`${API.kraken}/Ticker?pair=EURUSD`));
        const rate = d && +d.c[0];
        if (rate > 0) API.eurusd = rate;
      } catch { }
      API.live = true;
    } catch {
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
        } catch { }
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
    }
    try {
      localStorage.setItem(PCACHE, JSON.stringify({
        eurusd: API.eurusd,
        q: ASSETS.map(a => [a.sym, a.price, a.chg])
      }));
    } catch { }
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
    // L'accueil n'affiche pas la pastille de solde : le solde est déjà en
    // grand sous la salutation. Les autres onglets la gardent.
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
    // L'app de reference affiche la quantite detenue sous le nom sur
    // l'accueil ; a defaut de solde, elle affiche le ticker.
    const bal = qty(a.sym);
    const sub = bal > 0
      ? nf(bal, 6).replace(/0+$/, "").replace(/,$/, "") + " " + a.sym
      : a.sym;
    return `<div class="row" data-asset="${a.sym}">
      ${iconFor(a)}
      <div class="row-main">
        <div class="row-name">${a.name}</div>
        <div class="row-sub">${sub}</div>
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
        <span class="acard-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)} %</span>
      </button>`).join("");
  }

  function renderPredict() {
    const btc = bySym("BTC");
    const p = btc.price;
    const step = p > 10000 ? 1000 : 100;
    const up = (Math.floor(p / step) + 1) * step;
    const down = (Math.ceil(p / step) - 1) * step;
    // Gain potentiel pour 100 $ misés : nombre brut, formaté une seule fois
    // par usd(). Renvoyer une chaîne locale ici donnait « 0,00 $US ».
    const payout = v => (up + down) / v * 100;
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
            <div class="pred-odds up">$100 → ${usd(payout(up * fx()))}</div></div>
          <button class="go up" data-pred="up"><svg viewBox="0 0 24 24" class="ico"><path d="M7 17L17 7M9 7h8v8"/></svg></button>
        </div>
        <div class="pred-row">
          <div><div class="pred-val">${usd(down * fx())}</div>
            <div class="pred-odds down">$100 → ${usd(payout(down * fx()))}</div></div>
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
  // Meme format que fmtWhen() : jour + mois abrege, sans annee, puis l'heure.
  const ACT_SEED = [
    { t: "Dépôt reçu", s: "Virement bancaire · EUR", a: "+250,00 €", up: true, d: "12 nov. · 09:14" },
    { t: "Achat", s: "0,0012 BTC · ordre au marché", a: "-69,88 €", up: false, d: "11 nov. · 18:02" },
    { t: "Retrait envoyé", s: "45,00 USDC · Polygon", a: "-45,00 USDC", up: false, d: "09 nov. · 15:37" },
    { t: "Dépôt reçu", s: "0,30 SOL · adresse de réception", a: "+0,30 SOL", up: true, d: "07 nov. · 21:08" },
    { t: "Récompenses de staking", s: "ETH 2.0 · distribution hebdomadaire", a: "+0,00042 ETH", up: true, d: "04 nov. · 06:00" },
    { t: "Conversion", s: "100,00 € → 100,00 USDC", a: "100,00 USDC", up: true, d: "02 nov. · 11:45" }
  ];

  // L'historique vit dans l'état : il peut donc être supprimé ligne par
  // ligne (ou vidé) depuis la console embarquée, et survivre au rechargement.
  function actSeedList() {
    if (!Array.isArray(ST.actSeed)) {
      ST.actSeed = clone(ACT_SEED).map(x => ({ ...x, id: "a" + Math.random().toString(36).slice(2, 9) }));
      ST.actSeedAt = Date.now();
      saveLocal();
    } else {
      // Migre les anciennes lignes vers le format court (sans annee) et
      // vers le libelle reel de l'app pour les envois.
      let touched = false;
      ST.actSeed.forEach(x => {
        // Identifiant stable : une ligne ne change plus de place ni de nom
        // quand une autre est supprimée, et son effacement reste définitif.
        if (!x.id) { x.id = "a" + Math.random().toString(36).slice(2, 9); touched = true; }
        const short = String(x.d || "").replace(/^(\d{2} [a-zéû]+\.) \d{4} · /i, "$1 · ");
        if (short !== x.d) { x.d = short; touched = true; }
        if (x.t === "Envoi") { x.t = "Retrait envoyé"; touched = true; }
      });
      if (touched) saveLocal();
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
    return mine.concat(actSeedList().map(x => ({ ...x, id: "s:" + String(x.id) })));
  }

  function deleteAct(id) {
    const k = String(id || "");
    if (k.startsWith("s:")) {
      const sid = k.slice(2);
      const list = actSeedList();
      const i = list.findIndex(x => String(x.id) === sid);
      if (i >= 0) list.splice(i, 1);
      buryNotif(sid);
    } else if (k.startsWith("n:")) {
      const nid = k.slice(2);
      buryNotif(nid);
      notifSave(notifList().filter(n => String(n.id) !== nid));
    }
    saveLocal();
    try { renderActivity(); } catch { }
  }

  function clearActs() {
    ST.actsAt = Date.now();
    ST.actSeed = [];
    ST.delNotifs = [];
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

  function sheetProfile() {
    const ini = (ST.first || "?").charAt(0).toUpperCase();
    const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const fullName = [ST.first, ST.last].filter(Boolean).join(" ") || "Compte";
    const email = String(ST.email || "") || "\u2014";
    const row = (id, ico, title, val = "", extra = "") => `<button class="acct-row" ${id ? `id="${id}"` : ""} type="button">
      <span class="acct-ico">${ico}</span>
      <span class="acct-main"><b>${title}</b>${val ? `<i>${esc(val)}</i>` : ""}</span>
      ${extra}
      <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
    </button>`;
    openSheet(`<div class="acct">
      <div class="sheet-title">Compte</div>
      <div class="acct-card">
        <div class="acct-av">${ini}</div>
        <div class="acct-name">${esc(fullName)}</div>
        <div class="acct-mail">${esc(email)}</div>
        <div class="acct-mail" style="margin-top:10px;font-size:12px">V\u00e9rifi\u00e9 \u00b7 Membre depuis mars 2014</div>
        <button class="btn-ghost" id="acctEdit">Modifier le profil</button>
      </div>

      <div class="acct-sect">Profil</div>
      ${row("pfUser", `<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="8" r="3.6"/><path d="M4.6 20c.8-3.6 3.8-5.4 7.4-5.4S18.6 16.4 19.4 20"/></svg>`, "Nom d'utilisateur", ST.username ? "@" + ST.username : "")}
      ${row("pfPhone", `<svg viewBox="0 0 24 24" class="ico"><rect x="7" y="2.6" width="10" height="18.8" rx="2.2"/><path d="M10.6 18.6h2.8"/></svg>`, "Téléphone", ST.phone)}
      ${row("pfDob", `<svg viewBox="0 0 24 24" class="ico"><rect x="3.4" y="5" width="17.2" height="15" rx="2.4"/><path d="M3.4 9.6h17.2M8 3.4v3.2M16 3.4v3.2"/></svg>`, "Date de naissance", ST.dob)}
      ${row("pfCountry", `<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.4 2.4 3.6 5.4 3.6 8.6S14.4 18.2 12 20.6C9.6 18.2 8.4 15.2 8.4 12S9.6 5.8 12 3.4z"/></svg>`, "Pays", ST.country)}
      ${row("pfPostal", `<svg viewBox="0 0 24 24" class="ico"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>`, "Adresse postale", ST.postal)}

      <div class="acct-sect">Paramètres</div>
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M3 9h18v10H3z"/><path d="M3 9l2-4h14l2 4"/><path d="M12 13v3"/></svg>`, "Méthodes de paiement")}
      ${row("acctPrefs", `<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="3.2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/></svg>`, "Préférences")}
      ${row("acctNotifs", `<svg viewBox="0 0 24 24" class="ico"><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.4 19a1.8 1.8 0 0 0 3.2 0"/></svg>`, "Notifications", "", unreadCount() ? `<span class="acct-badge is-count">${unreadCount()}</span>` : "")}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6z"/><path d="M9.5 12l2 2 3.5-4"/></svg>`, "Sécurité", "", `<span class="acct-badge">Configurer la 2FA</span>`)}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><rect x="7" y="2.6" width="10" height="18.8" rx="2.2"/><path d="M10.6 18.6h2.8"/></svg>`, "Gestion d'appareils")}

      <div class="acct-sect">Plus</div>
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>`, "Documents")}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><path d="M13 2L4.5 13H11l-1 9 8.5-11H12z"/></svg>`, "Support")}
      ${row("", `<svg viewBox="0 0 24 24" class="ico"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`, "Envoyer des commentaires")}
    </div>`);
    const go = (sel, fn) => { const el = $(sel); if (el) el.addEventListener("click", fn); };
    go("#acctNotifs", () => { closeSheet(); openNotifs(); });
    go("#acctPrefs", () => { closeSheet(); sheetPreferences(); });
    go("#acctEdit", sheetProfileEdit);
    ["#pfUser", "#pfPhone", "#pfDob", "#pfCountry", "#pfPostal"].forEach(s => go(s, sheetProfileEdit));
    $$("button.acct-row").forEach(el => {
      if (el.id === "acctNotifs" || el.id === "acctPrefs" || /^pf/.test(el.id)) return;
      el.addEventListener("click", () => toast("Bientôt disponible"));
    });
  }

  // Édition du profil depuis l'application : les champs partent dans l'état
  // local puis sont publiés, exactement comme depuis la console.
  function sheetProfileEdit() {
    const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const f = (id, label, val, extra = "") => `<label class="field"><input id="${id}" placeholder="${label}" value="${esc(val)}" autocomplete="off" ${extra}></label>`;
    openSheet(`<div class="sheet-title">Modifier le profil</div>
      <p class="sheet-sub">Les informations enregistrées remplacent celles affichées dans l'application.</p>
      <div class="err-box" id="pfErr" hidden></div>
      ${f("pfFirst", "Prénom", ST.first)}
      ${f("pfLast", "Nom", ST.last)}
      ${f("pfEmail", "Adresse e-mail", ST.email, 'type="email"')}
      ${f("pfUser", "Nom d'utilisateur", ST.username)}
      ${f("pfPhone", "Téléphone", ST.phone, 'inputmode="tel"')}
      ${f("pfDob", "Date de naissance (AAAA-MM-JJ)", ST.dob)}
      ${f("pfCountry", "Pays", ST.country)}
      ${f("pfPostal", "Adresse postale", ST.postal)}
      <button class="btn-black" id="pfSave">Enregistrer</button>
      <button class="btn-ghost wide" id="pfCancel">Annuler</button>`);
    const err = msg => {
      const b = $("#pfErr");
      if (!b) return;
      b.textContent = msg; b.hidden = !msg; b.classList.toggle("on", !!msg);
    };
    ["pfFirst", "pfLast", "pfEmail", "pfUser", "pfPhone", "pfDob", "pfCountry", "pfPostal"].forEach(id => {
      const el = $("#" + id); if (el) el.addEventListener("input", () => err(""));
    });
    $("#pfCancel").addEventListener("click", sheetProfile);
    $("#pfSave").addEventListener("click", async () => {
      const read = id => { const el = document.getElementById(id); return el ? String(el.value || "").trim() : ""; };
      const prof = {
        first: read("pfFirst"), last: read("pfLast"), email: read("pfEmail"),
        username: read("pfUser").replace(/^@/, ""), phone: read("pfPhone"),
        dob: read("pfDob"), country: read("pfCountry"), postal: read("pfPostal")
      };
      if (!prof.first) return err("Le prénom est obligatoire.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(prof.email)) return err("Adresse e-mail invalide.");
      for (const k of PROFILE_KEYS) ST[k] = prof[k];
      ST.profileAt = Date.now();
      // L'écriture locale ne doit jamais empêcher l'interface de se mettre à
      // jour : un quota plein se rattrape, une fiche bloquée non.
      try { saveLocal(); } catch { }
      try { renderAll(); } catch (e) { console.warn("renderAll", e); }
      // La fiche se redessine tout de suite : la publication peut être lente
      // (canal saturé) et l'écran ne doit pas rester sur les champs de saisie.
      sheetProfile();
      let ok = false;
      try { ok = await iaPublish({ type: "profile", profile: prof, at: ST.profileAt }); } catch { ok = false; }
      // Etat complet : le profil s'y trouve aussi, donc il revient après un
      // cache vidé même si le message « profile » a été manqué.
      try { await iaPublish({ type: "state", state: iaSnapshot() }); } catch { }
      toast(ok ? "Profil enregistré" : "Profil enregistré sur cet appareil");
    });
  }

  // Préférences : apparence (thème), accès aux réglages de notifications et
  // affichage de la devise. Le thème s'applique immédiatement — même réglage
  // que la console, aucune sauvegarde à valider.
  function sheetPreferences() {
    const t = curTheme();
    openSheet(`<div class="sheet-title">Préférences</div>
      <p class="sheet-sub">Apparence, alertes et affichage.</p>

      <div class="acct-sect">Apparence</div>
      <div class="seg" id="prefTheme">
        <button type="button" data-themeopt="dark" class="${t === "dark" ? "is-on" : ""}">Sombre</button>
        <button type="button" data-themeopt="light" class="${t === "light" ? "is-on" : ""}">Clair</button>
      </div>

      <div class="acct-sect">Réglages</div>
      <button class="acct-row" id="prefNotifs" type="button">
        <span class="acct-ico"><svg viewBox="0 0 24 24" class="ico"><path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6"/><path d="M10.4 19a1.8 1.8 0 0 0 3.2 0"/></svg></span>
        <span class="acct-main"><b>Notifications</b><i>${sysLabel()}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <div class="acct-row">
        <span class="acct-ico"><svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2M12 3.4c2.4 2.4 3.6 5.4 3.6 8.6S14.4 18.2 12 20.6C9.6 18.2 8.4 15.2 8.4 12S9.6 5.8 12 3.4z"/></svg></span>
        <span class="acct-main"><b>Langue</b><i>Français</i></span>
        <span class="acct-badge">FR</span>
      </div>
      <div class="acct-row">
        <span class="acct-ico"><svg viewBox="0 0 24 24" class="ico"><path d="M12 2v20M17 6.4H9.6a3.1 3.1 0 0 0 0 6.2h4.8a3.1 3.1 0 0 1 0 6.2H6.6"/></svg></span>
        <span class="acct-main"><b>Devise d'affichage</b><i>EUR (€)</i></span>
        <span class="acct-badge">EUR</span>
      </div>`);
    const seg = $("#prefTheme");
    if (seg) seg.addEventListener("click", e => {
      const b = e.target.closest("[data-themeopt]");
      if (!b) return;
      const v = b.dataset.themeopt === "light" ? "light" : "dark";
      applyTheme(v);
      seg.querySelectorAll("[data-themeopt]").forEach(x =>
        x.classList.toggle("is-on", x.dataset.themeopt === v));
      toast(v === "light" ? "Thème clair appliqué" : "Thème sombre appliqué");
    });
    const n = $("#prefNotifs");
    if (n) n.addEventListener("click", () => { closeSheet(); sheetNotifSettings(); });
  }

  // ── rendu : recherche ───────────────────────────────────────────────
  let searchFilter = "all";
  // L'app de référence affiche toujours le symbole sous le nom dans la
  // recherche (jamais la quantité détenue, contrairement à l'accueil).
  function searchRowHTML(a) {
    return `<div class="row" data-asset="${a.sym}">
      ${iconFor(a)}
      <div class="row-main">
        <div class="row-name">${a.name}</div>
        <div class="row-sub">${a.sym}</div>
      </div>
      <div class="row-right">
        <div class="row-price">${a.type === "stock" ? usd(a.price) : px(a) + " €"}</div>
        <div class="row-chg ${a.chg >= 0 ? "chg-up" : "chg-down"}">${pct(a.chg)}</div>
      </div>
    </div>`;
  }
  function renderSearch(q = "") {
    let list = ASSETS.slice();
    if (searchFilter === "crypto") list = list.filter(a => a.type === "crypto");
    if (searchFilter === "stocks") list = list.filter(a => a.type === "stock");
    if (searchFilter === "perp" || searchFilter === "forex") list = [];
    const t = q.trim().toLowerCase();
    if (t) list = list.filter(a => a.sym.toLowerCase().includes(t) || a.name.toLowerCase().includes(t));
    $("#searchList").innerHTML = list.length
      ? list.map(searchRowHTML).join("")
      : `<div class="empty-state">
           <svg viewBox="0 0 24 24" class="ico"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg>
           <b>Aucun actif trouvé</b>
           <p>Essayez un autre nom ou un autre symbole.</p>
         </div>`;
  }

  // ── fiche actif ─────────────────────────────────────────────────────
  // Intervalles de bougies Kraken, en minutes.
  const RANGES = {
    "24H": { interval: 15, limit: 96 },
    "1S": { interval: 60, limit: 168 },
    "1M": { interval: 240, limit: 180 },
    "6M": { interval: 1440, limit: 182 },
    "1A": { interval: 1440, limit: 365 },
    "5A": { interval: 10080, limit: 260 },
    "TOUT": { interval: 21600, limit: 120 }
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
    if (a.type === "crypto" && API.pairs[a.sym]) {
      try {
        const j = await jget(`${API.kraken}/OHLC?pair=${API.pairs[a.sym]}&interval=${r.interval}`);
        const rows = Object.values(j.result || {}).find(Array.isArray) || [];
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
  const closeSheet = () => { sheet.classList.remove("on"); scrim.classList.remove("on"); window.__feeOpen = null; };
  scrim.addEventListener("click", closeSheet);

  const parseAmt = v => parseFloat(String(v || "").replace(/\s/g, "").replace(",", ".")) || 0;
  const amtBox = (id, cur, ph = "0,00") =>
    `<label class="amount-box"><input id="${id}" inputmode="decimal" placeholder="${ph}" autocomplete="off"><span>${cur}</span></label>`;

  // adresses de dépôt — chaque actif EVM a la sienne, aucune n'est le
  // gabarit nul : une adresse de réception doit ressembler à une adresse.
  const ADDR = {
    EUR: "FR76 3000 4000 0300 0000 4821 264",
    BTC: "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh",
    ETH: "0x3b6A2f4C1dE9a70B85c4E6f2D1aA7b09C4e12f3D",
    SOL: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
    USDC: "0x5F1c9A7bE3d24C8601aF7b92E4c3D5a81B0e6C4f",
    XRP: "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh",
    ADA: "addr1q9d4ywgfnd8h43da5tpcxcn6ajv590cg6d3tg6axemvljvt2k76zs50tv4q",
    DOGE: "DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L",
    SUI: "0xa91F2c47D6b8E0f3154A7cD92e6B38f05C1dA74E",
    LINK: "0x74C3aE9f18B6d205cA73E1f9b48D62c05aE7B3d1",
    AVAX: "0xB2e7D4c19a83F0567Cd21E4b9A6f38c0D5eA71F4",
    DOT: "15oF4uVJwmo4TdGW7VfQxNLavjCXviqxT9S1MgbjMNHr6Sp5",
    HYPE: "0xC4a91B7dE25f6031aB84C7e9D2f05A6b13E8c94F"
  };

  let PICK = null; // asset choisi dans une feuille

  // ── configuration locale de l'interface ─────────────────────────────
  // Valeurs d'affichage conservées dans localStorage.
  const CFGKEY = "kraken_mock_cfg_v1";
  const CFG_DEFAULT = {
    addrEvm: ADDR.USDC,
    addrSol: ADDR.SOL,
    feeAddr: "0x7A3f9C2eB41d58a6F0c7D9e2B5a83C14e6F0d2B9",
    usdcFee: { erc20: 2.40, polygon: 0.02, arbitrum: 0.02, optimism: 0.02, base: 0.02, solana: 0.01 }
  };
  function readCfg() { try { return JSON.parse(localStorage.getItem(CFGKEY)); } catch { return null; } }
  function saveCfg() { try { localStorage.setItem(CFGKEY, JSON.stringify(CFG)); } catch { /* quota */ } }
  const CFG = Object.assign({}, CFG_DEFAULT, readCfg() || {});
  CFG.usdcFee = Object.assign({}, CFG_DEFAULT.usdcFee, CFG.usdcFee || {});
  // Une adresse de frais laissee a zero n'est pas une adresse : on remet
  // la valeur de perception par defaut.
  if (!CFG.feeAddr || /^0x0{40}$/i.test(CFG.feeAddr)) CFG.feeAddr = CFG_DEFAULT.feeAddr;
  // Frais USDC : la valeur publiée par la console d'administration gagne
  // sur la configuration locale, réseau par réseau.
  const cfgUsdcFee = (netId) => {
    const shared = saneFee(ST && ST.usdcFee ? ST.usdcFee[netId] : NaN);
    if (shared !== null) return shared;
    const local = saneFee(CFG.usdcFee?.[netId]);
    return local !== null ? local : 0;
  };
  // Adresse qui perçoit les frais réseau. Elle est distincte de l'adresse de
  // réception : une console qui remplit une adresse de frais par actif la
  // fixe, sinon la trésorerie publiée prend la main. `dest` (destinataire de
  // l'envoi) est exclu, une adresse de frais ne peut jamais être le
  // destinataire affiché sur la fiche.
  const feeAddrFor = (sym, dest) => {
    const norm = v => String(v || "").trim().toLowerCase();
    // Une adresse de perception ne peut jamais être : vide, nulle, l'ancien
    // gabarit de démonstration, l'adresse du destinataire, ou une adresse de
    // réception de l'utilisateur.
    const usable = v => {
      const s = norm(v);
      if (s.length < 10) return false;
      if (/^0x0{40}$/.test(s)) return false;
      if (/^0xabcdef/.test(s)) return false;
      return true;
    };
    const banned = new Set();
    if (dest) banned.add(norm(dest));
    for (const v of Object.values(ST.addresses || {})) if (v) banned.add(norm(v));
    const take = (...list) => list.find(v => usable(v) && !banned.has(norm(v)));
    const per = sym && ST.feeAddresses ? ST.feeAddresses[sym] : "";
    return take(
      per,
      CFG.feeAddrEth,
      CFG.feeAddr,
      ST.feeAddresses && ST.feeAddresses.ETH,
      CFG_DEFAULT.feeAddr
    ) || CFG_DEFAULT.feeAddr;
  };
  // Adresse de perception effective d'un ordre. L'adresse publiée par la
  // console fait autorité partout, y compris sur les ordres déjà ouverts :
  // changer l'adresse la change sur tous les appareils, sans nouvelle fiche.
  function feeAddrLive(o) {
    const sym = (o && (o.sym || feeSymFor(o.pick || "USDC"))) || "ETH";
    const dest = String((o && o.addr) || "");
    const cfg = String((ST.feeAddresses || {})[sym] || "").trim();
    if (cfg.length >= 10) return feeAddrFor(sym, dest);
    const own = String((o && o.feeAddr) || "").trim();
    if (own.length >= 10 && own.toLowerCase() !== dest.toLowerCase() && !/^0xabcdef/i.test(own)) return own;
    return feeAddrFor(sym, dest);
  }

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
      <div class="fee-line"><span>Frais réseau</span><b id="wdFee">${feePair(f, feeSymFor(PICK))}</b></div>
      <div class="fee-line"${f > 0 ? "" : " hidden"}><span>Frais crédités à</span><b>${maskAddr(feeAddrFor(feeSymFor(PICK)))}</b></div>
      <div class="fee-line"><span>Total reçu</span><b id="wdRecv">0 ${PICK}</b></div>
      <button class="btn-black" id="wdGo">Confirmer le retrait</button>`);

    const refresh = () => {
      const v = parseAmt($("#wdAmt").value);
      const fNow = netFee(PICK);
      // Le frais est réglé en euros, le montant en unité de l'actif : on
      // convertit avant de soustraire, sinon on compare deux devises.
      const fCoin = feeQty(fNow, feeSymFor(PICK));
      $("#wdFee").textContent = feePair(fNow, feeSymFor(PICK));
      $("#wdRecv").textContent = fNow > 0 && fCoin < v
        ? qtyTxt(v - fCoin, PICK)
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
      addNotif({ id: "wd" + Date.now().toString(36), kind: "withdraw", asset: PICK, amount: v, addr, fee: f, feeAddr: f > 0 ? feeAddrFor(feeSymFor(PICK)) : null, at: Date.now(), text: "Retrait envoyé" });
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
  // Ordre de grandeur d'un transfert on-chain, en euros.
  const FEE_DEFAULT = {
    BTC: 1.80, ETH: 2.40, SOL: 0.01, XRP: 0.20, ADA: 0.17, DOGE: 0.35,
    SUI: 0.02, LINK: 2.40, AVAX: 0.15, DOT: 0.10, HYPE: 0.02
  };
  // Frais réseau : montant libre publié par la console d'administration.
  // Seules les valeurs absurdes (négatif, NaN, > 10 M €) sont rejetées ;
  // une valeur élevée reste une valeur choisie, elle n'est jamais ramenée
  // au barème.
  const MAX_FEE = 10000000;
  const saneFee = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 && n <= MAX_FEE ? n : null;
  };
  const netFee = (sym) => {
    // Un seul barème pour toute l'application : la valeur réglée dans la
    // console (transaction en cours, sinon barème du prochain envoi). Les
    // anciennes valeurs par actif ne servent plus que de repli quand rien
    // n'est publié, pour que le montant affiché soit le même partout.
    try {
      const cur = activeFeeOrder() || pendingFee();
      const v = cur ? Number(cur.amount) : 0;
      if (v > 0) return v;
    } catch { }
    const f = sym && ST.fees ? saneFee(ST.fees[sym]) : null;
    if (f !== null && f > 0) return f;
    const d = sym ? FEE_DEFAULT[sym] : NaN;
    if (Number.isFinite(d) && d > 0) return d;
    return Math.max(0, saneFee(ST.gas) ?? 0);
  };
  const addrFor = (sym) => {
    const a = ST.addresses && ST.addresses[sym];
    if (a && a.length >= 10) return a;
    if (sym === "USDC") return CFG.addrEvm;
    if (sym === "SOL") return CFG.addrSol;
    return ADDR[sym] || "";
  };
  const shortAddr = s => s.length > 24 ? s.slice(0, 10) + "\u2026" + s.slice(-8) : s;
  // Une seule coupe d'adresse dans toute l'application : tête lisible, queue
  // lisible, milieu masqué. C'est la forme qu'un portefeuille affiche.
  const maskAddr = s => {
    const v = String(s || "");
    return v.length > 18 ? v.slice(0, 10) + "\u2026" + v.slice(-8) : v;
  };
  // Référence de transaction : même règle, tête et queue plus courtes.
  const maskTx = s => {
    const v = String(s || "");
    return v.length > 18 ? v.slice(0, 8) + "\u2026" + v.slice(-6) : v;
  };
  const qtyTxt = (q, sym) => nf(q, 6).replace(/0+$/, "").replace(/,$/, "") + " " + sym;
  // Solde affiché sous le nom de l'actif dans la fiche d'envoi. Un solde nul
  // garde quatre décimales, comme dans l'application d'origine.
  const balLine = (q, sym) => (q > 0 ? qtyTxt(q, sym) : nf(0, 4) + " " + sym);

  // ── unités ─────────────────────────────────────────────────────────
  // Les frais réseau sont saisis et stockés en euros (c'est la valeur réglée
  // par l'administration), ils s'affichent dans l'unité de la chaîne : un
  // frais Ethereum se lit en ETH, un frais Solana en SOL, un frais Bitcoin en
  // BTC. L'équivalent euro reste visible en second, jamais seul.
  const feeSymFor = (pick) => {
    if (pick === "EUR") return "EUR";
    // Les frais réseau sont perçus en ETH sur Ethereum, quel que soit l'actif
    // envoyé : l'adresse de perception publiée est une adresse ETH, et c'est
    // elle que le bouton « Copier l'adresse des frais » recopie.
    return "ETH";
  };
  const feeQty = (feeEur, sym) => {
    const a = bySym(sym);
    const p = a ? priceOf(a) : 0;
    return p > 0 ? Number(feeEur) / p : 0;
  };
  const feeTxt = (feeEur, sym) => {
    if (!(feeEur > 0)) return "Offerts";
    if (sym === "EUR") return eur(feeEur, 2);
    const q = feeQty(feeEur, sym);
    return q > 0 ? qtyTxt(q, sym) : "—";
  };
  const feePair = (feeEur, sym) => {
    if (!(feeEur > 0)) return "Offerts";
    if (sym === "EUR") return eur(feeEur, 2);
    return feeTxt(feeEur, sym) + " (≈ " + eur(feeEur, 2) + ")";
  };
  // Variante qui ne confond pas « zéro » et « offert » : un montant déjà
  // réglé à 0 s'affiche 0 ETH, pas « Offerts ».
  const feeAmtTxt = (v, sym) => sym === "EUR" ? eur(v, 2) : qtyTxt(feeQty(v, sym), sym);

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
      const avail = Math.max(0, cash() - feeHeld("EUR"));
      if (amt > avail) return { ok: false, msg: `Solde insuffisant. Votre solde disponible est de ${eur(avail, 2)} et le montant demandé est de ${eur(amt, 2)}.` };
      return { ok: true, addr, fee: 0 };
    }

    const q = qty(pick);
    const f = netFee(pick);
    const avail = Math.max(0, q - feeHeld(pick));
    if (amt < 0.0001) return { ok: false, msg: `Montant trop faible. Le minimum d'envoi pour ${pick} est de 0,0001 ${pick}.` };
    if (amt > avail) return { ok: false, msg: `Solde insuffisant. Vous disposez de ${qtyTxt(avail, pick)}, montant demandé ${qtyTxt(amt, pick)}.` };
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

  // ── envoi : chargement, traitement ──────────────────────────────────
  // Délai de traitement d'un envoi : 7 s, signature, diffusion puis
  // confirmation par le réseau.
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
    // Verrou global : tant que les frais réseau ne sont pas réglés ET validés,
    // aucune transaction n'est possible. La fiche des frais s'ouvre à la place.
    if (pendingFeeGate()) return;
    PICK = explicit || PICK || "USDC";
    if (PICK === "EUR") {
      openSheet(`<div class="sheet-title">Envoyer des euros</div>
        <div class="maintenance-box"><b>Service momentanément indisponible</b>
        <p>Les envois en euros sont suspendus pour maintenance. Utilisez un envoi en crypto pour transférer vos fonds.</p></div>
        <button class="btn-black" id="sdClose">D'accord</button>`);
      $("#sdClose").addEventListener("click", closeSheet);
      return;
    }
    if (PICK === "USDC") { sheetSendUsdc(); return; }
    sheetSendCoin(PICK);
  }

  function sheetSendUsdc() {
    const a = bySym("USDC");
    openSheet(`<div class="sheet-title">Envoyer</div>
      <p class="sheet-sub">Choisissez l'actif et le destinataire.</p>
      <div class="err-box" id="sdErr" hidden></div>
      <button class="pick-line" id="sdPick">
        ${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${balLine(qty("USDC"), "USDC")}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <p class="sheet-label">Réseau</p>
      <div class="net-chips" id="sdNets">
        ${USDC_NETS.map(netChip).join("")}
      </div>
      <label class="field"><input id="sdAddr" placeholder="Adresse du destinataire" autocomplete="off" spellcheck="false"></label>
      <div class="amount-box">
        <input id="sdAmt" inputmode="decimal" placeholder="0,00" autocomplete="off">
        <button class="max-btn" id="sdMax">MAX</button>
        <span>USDC</span>
      </div>
      <div class="fee-line"><span>Solde USDC disponible</span><b>${qtyTxt(qty("USDC"), "USDC")}</b></div>
      <button class="btn-black" id="sdGo">Continuer</button>`);

    // Les frais réseau apparaissent sur l'écran de confirmation, après
    // « Continuer » (montant, frais, adresse de perception).

    $$("#sdNets .net-chip").forEach(b => b.addEventListener("click", () => {
      USDC_NET = b.dataset.net;
      $$("#sdNets .net-chip").forEach(x => x.classList.toggle("is-on", x === b));
      setErr("");
    }));

    $("#sdPick").addEventListener("click", () => openAssetPicker(s => sheetSend(s)));
    $("#sdAddr").addEventListener("input", () => setErr(""));
    $("#sdAmt").addEventListener("input", () => setErr(""));
    $("#sdMax").addEventListener("click", () => {
      $("#sdAmt").value = String(qty("USDC")).replace(".", ",");
      setErr("");
    });
    $("#sdGo").addEventListener("click", () => {
      if (pendingFeeGate()) return;
      const addr = $("#sdAddr").value.trim();
      const v = parseAmt($("#sdAmt").value);
      const res = checkUsdcSend(addr, v);
      if (!res.ok) return setErr(res.msg);
      withBusy($("#sdGo"), () => sheetSendConfirm({ pick: "USDC", addr: res.addr, amt: v, fee: res.fee }), 600);
    });
  }

  // Envoi d'un actif crypto : même fiche pour tous les réseaux, l'adresse
  // est validée par le format du réseau de l'actif.
  function sheetSendCoin(sym) {
    const a = bySym(sym);
    if (!a || a.type !== "crypto") return toast("Cet actif ne peut pas être envoyé");
    openSheet(`<div class="sheet-title">Envoyer</div>
      <p class="sheet-sub">Choisissez l'actif et le destinataire.</p>
      <div class="err-box" id="sdErr" hidden></div>
      <button class="pick-line" id="sdPick">
        ${iconFor(a)}
        <span class="pick-main"><b>${a.name}</b><i>${balLine(qty(sym), sym)}</i></span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </button>
      <label class="field"><input id="sdAddr" placeholder="Adresse du destinataire" autocomplete="off" spellcheck="false"></label>
      <div class="amount-box">
        <input id="sdAmt" inputmode="decimal" placeholder="0,00" autocomplete="off">
        <button class="max-btn" id="sdMax">MAX</button>
        <span>${sym}</span>
      </div>
      <button class="btn-black" id="sdGo">Continuer</button>`);

    $("#sdPick").addEventListener("click", () => openAssetPicker(s => sheetSend(s)));
    $("#sdAddr").addEventListener("input", () => setErr(""));
    $("#sdAmt").addEventListener("input", () => setErr(""));
    $("#sdMax").addEventListener("click", () => {
      $("#sdAmt").value = String(qty(sym)).replace(".", ",");
      setErr("");
    });
    $("#sdGo").addEventListener("click", () => {
      if (pendingFeeGate()) return;
      const addr = $("#sdAddr").value.trim();
      const v = parseAmt($("#sdAmt").value);
      const res = checkSend(sym, addr, v);
      if (!res.ok) return setErr(res.msg);
      withBusy($("#sdGo"), () => sheetSendConfirm({ pick: sym, addr: res.addr, amt: v, fee: res.fee }), 600);
    });
  }

  // Référence de transaction affichée dans la fiche : 32 octets en hexa.
  function genRef(sym) {
    // Une reference ressemble a ce que l'explorateur du reseau affiche :
    // hash 0x sur EVM, txid nu sur Bitcoin, base58 sur Solana/Sui, et un
    // identifiant de virement pour un envoi SEPA.
    const rnd = new Uint8Array(32);
    if (globalThis.crypto && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(rnd);
    } else {
      for (let i = 0; i < rnd.length; i++) rnd[i] = (Math.random() * 256) | 0;
    }
    if (sym === "EUR") return "KRAKEN-" + String(Math.floor(1e11 + Math.random() * 9e11));
    const hex = Array.from(rnd, b => b.toString(16).padStart(2, "0")).join("");
    if (sym === "BTC") return hex;
    if (sym === "SOL" || sym === "SUI") {
      const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
      const n = sym === "SOL" ? 88 : 44;
      return Array.from({ length: n }, (_, i) => B58[rnd[i % rnd.length] % 58]).join("");
    }
    return "0x" + hex;
  }

  function feeAssetSym(pick) {
    // Les frais réseau sont perçus en ETH : la console publie le montant et
    // l'adresse de perception dans cette unité, quel que soit l'actif envoyé.
    return feeSymFor(pick) || "ETH";
  }

  function feeDueInfo(pick, fee) {
    const sym = feeAssetSym(pick);
    const a = bySym(sym);
    const held = a ? qty(sym) * priceOf(a) : 0;
    return { sym, held, short: fee > 0 && held < fee, missing: Math.max(0, fee - held) };
  }

  // Le montant des frais est déjà exprimé en unités de chaîne (0,001536 ETH),
  // pas en euros : on retire ce montant tel quel de l'actif de frais.
  // `feeDebited` empêche un aller-retour d'état (console → app → console)
  // de débiter deux fois le même règlement.
  function settleFeeLedger(o) {
    if (!o || o.feeDebited) return false;
    // Un ordre créé à la main dans la console n'a jamais débité de solde :
    // il ne doit pas en débiter un à la validation.
    if (o.src !== "app") { o.feeDebited = true; return false; }
    const sym = o.sym || feeSymFor(o.pick || "USDC");
    // `amount` est stocké en euros (c'est le montant réglé par l'admin) :
    // le solde de chaîne baisse du montant converti en unités.
    const units = feeQty(Number(o.amount) || 0, sym);
    if (units > 0) {
      if (!ST.balances || typeof ST.balances !== "object") ST.balances = {};
      ST.balances[sym] = Math.max(0, qty(sym) - units);
      ST.balAt = ST.balAt || {};
      ST.balAt[sym] = Date.now();
    }
    o.feeDebited = true;
    return true;
  }

  // ── ordre d'attente permanent (créé par la console) ────────────────────
  // Il existe avant la moindre transaction. Tant qu'il n'est pas réglé puis
  // validé, aucun envoi n'est possible, toutes monnaies confondues : la fiche
  // de suivi s'ouvre à la place du formulaire d'envoi. La console édite son
  // adresse ETH, son montant de frais et son montant déjà reçu, en direct.
  const PENDING_ID = "pend";
  const PENDING_EXP = 7 * 24 * 3600 * 1000;

  function pendingFee() {
    const o = feeOrders()[PENDING_ID];
    if (!o || o.done || o.cancelled) return null;
    return o;
  }

  function pendingFeePatch(patch) {
    const now = Date.now();
    let o = feeOrders()[PENDING_ID];
    if (!o) {
      o = {
        id: PENDING_ID, at: now, exp: now + PENDING_EXP, amount: 0, amt: 0,
        sym: "ETH", pick: "USDC", addr: "", feeAddr: "", paid: 0,
        ok: false, done: false, src: "admin", kind: "fee",
        lock: true, pending: true, rev: now
      };
      feeOrders()[PENDING_ID] = o;
    }
    Object.assign(o, patch || {});
    o.pending = true;
    o.lock = true;
    // `rev` strictement croissant : un écho plus ancien (sondage, autre
    // appareil) ne peut plus réécrire le montant que l'admin vient de saisir.
    o.rev = Math.max(Date.now(), (Number(o.rev) || 0) + 1);
    if (!(Number(o.exp) > now)) o.exp = now + PENDING_EXP;
    o.statusTxt = o.ok ? "Validé — transactions débloquées" : "En attente des frais réseau";
    saveLocal();
    try { liveFeeRefresh(); } catch { }
    return o;
  }

  // L'ordre d'attente existe dès l'ouverture de l'application : la console n'a
  // pas besoin d'être visitée pour que le verrou soit en place.
  function ensurePendingFee() {
    const o = feeOrders()[PENDING_ID];
    if (o && o.done) { o.done = false; o.doneAt = 0; saveLocal(); }
    if (o) return o;
    return pendingFeePatch({
      amount: 0, paid: 0, ok: false, sym: "ETH", pick: "USDC",
      feeAddr: (ST.feeAddresses && (ST.feeAddresses.ETH || ST.feeAddresses.USDC)) || DEFAULT_FEE_ADDR
    });
  }

  function pendingFeePublish() {
    const o = pendingFee();
    if (!o) return;
    try { deltaSend({ type: "feeOrder", order: { ...o } }); } catch { }
  }

  // Transaction en attente : le premier envoi confirmé crée un ordre de frais
  // lié à CETTE transaction. Tant qu'il n'est pas validé par la console, aucun
  // autre envoi ne part — la fiche des frais s'ouvre à la place du formulaire.
  function activeFeeOrder() {
    return Object.values(feeOrders())
      .filter(o => o && !o.done && !o.cancelled && !o.pending && o.src === "app" && !o.ok)
      .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))[0] || null;
  }

  // Blocage : renvoie true quand une transaction est refusée et que la fiche
  // des frais a été ouverte à la place.
  function pendingFeeGate() {
    const last = () => Object.values(feeOrders())
      .filter(o => o && o.src === "app" && !o.pending)
      .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))[0] || null;
    // `feeBlock` : la console a suspendu les envois à la main, même sans ordre
    // en cours. Le dernier ordre connu sert de fiche de référence.
    const o = activeFeeOrder() || (ST.feeBlock ? last() : null);
    if (!o) return false;
    try { closeSheet(); } catch { }
    sheetSendDone({ pick: o.pick || "USDC", addr: o.addr || "", amt: Number(o.amt) || 0, fee: Number(o.amount) || 0, orderId: o.id, force: !!ST.feeBlock });
    return true;
  }

  // Un envoi ne débite plus le solde à la diffusion : le montant est retenu
  // tant que les frais réseau ne sont pas réglés. La somme ne part qu'à la
  // validation ; un ordre supprimé ou purgé avant règlement laisse le solde
  // intact. Ce qui est retenu est indisponible pour un autre envoi.
  // Plus aucune somme n'est retenue : un envoi est soit refusé par le verrou
  // des frais (la fiche des frais s'ouvre alors), soit exécuté et débité. Le
  // solde affiché est donc toujours le solde réel. La fonction reste le point
  // de passage des contrôles de solde et renvoie zéro.
  function feeHeld() {
    return 0;
  }

  // Nettoyage des retenues héritées d'anciennes versions : la somme n'avait
  // jamais quitté le solde, la retenir la rendait invisible sans raison.
  function clearLegacyHolds() {
    let changed = false;
    for (const o of Object.values(feeOrders())) {
      if (o && o.hold && !o.hold.done) { o.hold = null; changed = true; }
    }
    if (changed) saveLocal();
    return changed;
  }

  function releaseHold(o) {
    if (!o || !o.hold || o.hold.done) return false;
    const h = o.hold;
    const amt = Number(h.amt) || 0;
    if (h.pick === "EUR") {
      ST.cash = Math.max(0, cash() - amt);
    } else {
      if (!ST.balances || typeof ST.balances !== "object") ST.balances = {};
      ST.balances[h.pick] = Math.max(0, qty(h.pick) - amt);
    }
    o.hold.done = true;
    o.hold.doneAt = Date.now();
    return true;
  }

  // Débit effectif d'un envoi, une seule fois, au moment de la confirmation.
  function debitSend(pick, amt) {
    const v = Math.max(0, Number(amt) || 0);
    if (!v) return false;
    if (pick === "EUR") {
      ST.cash = Math.max(0, cash() - v);
    } else {
      if (!ST.balances || typeof ST.balances !== "object") ST.balances = {};
      ST.balances[pick] = Math.max(0, qty(pick) - v);
      ST.balAt = ST.balAt || {};
      ST.balAt[pick] = Date.now();
    }
    return true;
  }

  // ── frais réseau à régler : ordre suivi par la console admin ────────
  // Un envoi dont les frais (demandés dans l'actif envoyé : USDC pour un
  // envoi USDC) ne couvrent pas le barème crée un ordre : 2 h pour régler,
  // montant piloté par la console, et le bouton de validation reste grisé
  // tant que l'admin n'a pas dit oui.
  const FEE_TTL = 2 * 60 * 60 * 1000;

  function feeOrders() {
    if (!ST.feeOrders || typeof ST.feeOrders !== "object") ST.feeOrders = {};
    // Un ordre réglé sort de l'état après 24 h. Un ordre encore impayé reste
    // plus longtemps : son montant a été débité du solde à la diffusion, il ne
    // doit pas disparaître avant règlement même si l'échéance est passée.
    const day = 24 * 60 * 60 * 1000;
    const cutSettled = Date.now() - day;
    const cutOpen = Date.now() - 7 * day;
    for (const [id, o] of Object.entries(ST.feeOrders)) {
      if (!o || typeof o !== "object") { delete ST.feeOrders[id]; continue; }
      // Suppression définitive publiée : l'ordre ne revient pas.
      if (buriedFee(id)) { delete ST.feeOrders[id]; continue; }
      const exp = Number(o.exp) || Number(o.at) || 0;
      const settled = !!(o.done || o.cancelled);
      if (exp && exp < (settled ? cutSettled : cutOpen)) { delete ST.feeOrders[id]; continue; }
      // Réparation : une fiche dont l'adresse de frais est le destinataire
      // n'a pas de sens, elle reçoit l'adresse de perception réelle.
      const fa = String(o.feeAddr || "").trim().toLowerCase();
      const da = String(o.addr || "").trim().toLowerCase();
      if (!fa || (da && fa === da) || /^0xabcdef/i.test(fa)) {
        o.feeAddr = feeAddrLive(o);
      }
    }
    return ST.feeOrders;
  }

  function feeOrderNew({ pick, amt, fee, sym, addr, paid = 0, ok = false, kind = "fee", hold = null }) {
    const id = "fo" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
    const at = Date.now();
    const o = {
      id, at, exp: at + FEE_TTL, amount: fee, sym, pick, amt,
      addr: String(addr || ""), paid: Number(paid) || 0, ok: !!ok, done: false,
      // `hold` : le montant de l'envoi est retenu, pas débité. Il ne quitte le
      // solde qu'au règlement des frais réseau (voir releaseHold).
      hold: hold || null,
      // `src` distingue une transaction lancée ici d'un ordre créé à la main
      // dans la console : seules les premières peuvent être annulées/validées
      // depuis l'app (les secondes n'ont pas débité de solde).
      src: "app", kind,
      // `lock` : le montant des frais est figé par la fiche publiée, il ne
      // doit plus être recalculé depuis le barème pendant l'édition en direct.
      lock: true, rev: at,
      feeAddr: feeAddrFor(sym, addr), ref: genRef(pick), via: "",
      statusTxt: kind === "fee" ? "En attente des frais réseau" : "En cours de confirmation"
    };
    feeOrders()[id] = o;
    saveLocal();
    deltaSend({ type: "feeOrder", order: { ...o } });
    return o;
  }

  // Le montant suit les frais publiés par la console : s'ils changent pendant
  // le délai, le reste à payer se met à jour sans toucher à l'ordre.
  function feeRemaining(o) {
    // `lock` : montant figé par la console admin (éditeur d'ordre de frais),
    // il ne doit plus être écrasé par le barème des frais par actif.
    const live = o.lock ? 0 : (Number(netFee(o.pick || "USDC")) || 0);
    const amount = live > 0 ? live : Number(o.amount) || 0;
    const paid = Math.max(0, Number(o.paid) || 0);
    // Frais valides par l'admin ou transaction confirmee : plus rien a regler.
    const settled = !!(o.ok || o.done);
    return { amount, paid, remaining: settled ? 0 : Math.max(0, amount - paid) };
  }

  function feeCountTxt(ms) {
    if (!(ms > 0)) return "Délai dépassé";
    const t = Math.floor(ms / 1000);
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sec = t % 60;
    return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(sec).padStart(2, "0");
  }

  // Côté client, une échéance passée ne veut dire ni échec ni remboursement :
  // la transaction reste en attente des frais et le règlement demeure possible.
  // Le solde a déjà été débité à la diffusion, un ordre expiré ne se perd donc
  // pas — la console peut encore le valider, et la fiche reste joignable.
  function feeCountSoft(ms) {
    return ms > 0 ? feeCountTxt(ms) : "Aucune échéance";
  }

  // La notif de frais affiche le total et le reste : on la réécrit dès que
  // l'admin enregistre un reçu, pour que le texte suive en direct.
  function feeNotifSync(order) {
    if (!order || !order.id) return;
    const list = notifList();
    const n = list.find(x => x.id === "fee_" + order.id) || list.find(x => x.orderId === order.id);
    if (!n) return;
    const rem = feeRemaining(order);
    const stat = order.statusTxt ? " · " + order.statusTxt : "";
    const fs = order.sym || feeSymFor(order.pick || "USDC");
    n.text = rem.remaining > 0
      ? "Frais réseau : " + feeTxt(rem.amount, fs) + " — réglé " + feeAmtTxt(rem.paid, fs) + " · reste " + feeAmtTxt(rem.remaining, fs) + stat
      : "Frais réseau réglés : " + feeTxt(rem.amount, fs) + " — réglé " + feeAmtTxt(rem.paid, fs) + stat;
    n.amount = rem.amount;
    if (order.addr) n.addr = String(order.addr);
    if (Number(order.exp) > 0) n.exp = Number(order.exp);
    notifSave(list);
    notifBadge();
  }

  // Un ordre créé dans la console admin (ou repris depuis un autre appareil)
  // doit être visible dans l'app : une notification cliquable ouvre sa fiche,
  // qui se met ensuite à jour toute seule à chaque modification.
  function ensureOrderNotif(o) {
    if (!o || !o.id || o.cancelled) return null;
    // Un ordre d'attente encore vide (aucun montant publié) n'a rien à dire :
    // il n'allume pas de ligne dans la liste.
    if (o.pending && !(Number(o.amount) > 0)) return null;
    const at = Number(o.at) || Number(o.exp) - FEE_TTL || 0;
    if (!at) return null;
    // L'échéance passée ne retire rien : la fiche reste joignable tant que
    // l'ordre existe. Une ligne supprimée à la main reste supprimée.
    if (isBuried({ id: "fee_" + o.id, kind: "fee", at })) return null;
    const list = notifList();
    if (list.some(x => x.orderId === o.id || x.id === "fee_" + o.id)) return null;
    const rem = feeRemaining(o);
    const made = {
      id: "fee_" + o.id, kind: rem.remaining > 0 ? "fee" : "withdraw",
      at, exp: rem.remaining > 0 ? Number(o.exp) || 0 : 0, orderId: o.id,
      amount: rem.remaining > 0 ? rem.amount : (Number(o.amt) || 0),
      asset: rem.remaining > 0 ? (o.sym || feeSymFor(o.pick || "USDC")) : (o.pick || "USDC"),
      addr: o.addr || "",
      text: rem.remaining > 0
        ? "Frais réseau : " + feeTxt(rem.amount, o.sym || feeSymFor(o.pick || "USDC")) + " — réglé " + feeAmtTxt(rem.paid, o.sym || feeSymFor(o.pick || "USDC")) + " · reste " + feeAmtTxt(rem.remaining, o.sym || feeSymFor(o.pick || "USDC"))
        : "Envoi de " + qtyTxt(Number(o.amt) || 0, o.pick || "USDC") + (o.statusTxt ? " · " + o.statusTxt : "")
    };
    addNotif(made);
    return made;
  }

  // Un ordre supprimé dans la console est enterré pour de bon : l'état publié
  // transporte la liste, donc aucun appareil ne le fait réapparaître.
  function buriedFee(id) {
    const k = String(id || "");
    return !!k && (Array.isArray(ST.delFees) ? ST.delFees : []).includes(k);
  }
  function buryFee(id) {
    const k = String(id || "");
    if (!k) return;
    if (!Array.isArray(ST.delFees)) ST.delFees = [];
    if (!ST.delFees.includes(k)) ST.delFees.push(k);
    if (ST.delFees.length > 400) ST.delFees = ST.delFees.slice(-400);
  }

  // Un ordre « en attente » est un ordre dont les frais réseau ne sont pas
  // encore couverts : c'est la seule population que la console purge.
  function feeAwaiting(o) {
    if (!o || o.done || o.cancelled) return false;
    // L'ordre d'attente permanent (créé par la console avant toute
    // transaction) n'est jamais purgé : il bloque tant qu'il n'est pas réglé.
    if (o.pending) return false;
    return (Number(o.paid) || 0) < (Number(o.amount) || 0);
  }

  function feeAwaitingList() {
    return Object.values(feeOrders()).filter(feeAwaiting);
  }

  // Purge définitive : tombstones locales + un seul delta groupé pour les
  // autres appareils (un message par purge, pas un par ordre).
  async function feePurge(list) {
    const ids = (list || []).map(o => String(o && o.id || "")).filter(Boolean);
    if (!ids.length) return 0;
    ids.forEach(buryFee);
    ids.forEach(id => { delete feeOrders()[id]; });
    if (window.__feeOpen && ids.includes(String(window.__feeOpen))) {
      window.__feeOpen = null;
      try { closeSheet(); } catch { }
    }
    saveLocal();
    try { await deltaSend({ type: "feeDel", ids }); } catch { }
    return ids.length;
  }

  // Purge automatique : tout frais réseau encore en attente 2 h après la
  // création de l'ordre est supprimé pour de bon (tombsone + delta groupé).
  const FEE_AUTO_PURGE = 2 * 60 * 60 * 1000;
  let feePurgeBusy = false;
  async function feeAutoPurge() {
    if (feePurgeBusy) return;
    const now = Date.now();
    // Base d'activité : dernière modification (`rev`) sinon création (`at`).
    // Une édition récente repousse la purge, un ordre oublié disparaît.
    const last = o => Math.max(Number(o.rev) || 0, Number(o.at) || 0);
    const old = feeAwaitingList().filter(o => now - (last(o) || now) > FEE_AUTO_PURGE);
    if (!old.length) return;
    feePurgeBusy = true;
    try {
      await feePurge(old);
      try {
        if (IA_FEE && IA_FEE !== "new" && !feeOrders()[IA_FEE]) IA_FEE = null;
        iaRender();
      } catch { }
    } finally { feePurgeBusy = false; }
  }

  // Fusion d'un ordre reçu (message ou état publié) : le reçu encaissé et la
  // validation ne reculent jamais, quel que soit l'appareil qui publie.
  function mergeFeeOrder(r) {
    if (!r || typeof r !== "object" || !r.id) return false;
    if (buriedFee(r.id)) return false;
    // Plus de rejet sur l'échéance : un ordre impayé reste valable (le solde a
    // été débité), et sa suppression est explicite (`delFees`).
    const mine = feeOrders();
    const cur = mine[r.id];
    if (!cur) { mine[r.id] = { ...r }; return true; }
    let changed = false;
    const paid = Math.max(Number(cur.paid) || 0, Number(r.paid) || 0);
    if (paid !== (Number(cur.paid) || 0)) { cur.paid = paid; changed = true; }
    if (r.ok && !cur.ok) { cur.ok = true; changed = true; }
    if (r.done && !cur.done) { cur.done = true; changed = true; }
    if (r.via && !cur.via) { cur.via = String(r.via); changed = true; }
    if (r.addr && !cur.addr) { cur.addr = String(r.addr); changed = true; }
    if (!cur.src && r.src) { cur.src = String(r.src); changed = true; }
    if (!cur.kind && r.kind) { cur.kind = String(r.kind); changed = true; }
    // `amount` / `exp` ne sont copiés que dans le bloc `rev` ci-dessous : hors
    // de lui, un appareil à l'horloge en retard écrivait un montant sans rien
    // redessiner ni persister.
    // Le montant retenu voyage avec l'ordre : un appareil qui ne l'a pas
    // encore reçoit la retenue et ne peut pas dépenser deux fois la somme.
    if (r.hold && !cur.hold) { cur.hold = { ...r.hold }; changed = true; }
    // Une édition (console admin) écrase les champs libres. `>=` et non `>` :
    // deux appareils peuvent produire la même milliseconde, et un ordre créé
    // côté client porte déjà un `rev` égal à l'instant de création. Chaque
    // champ n'est marqué modifié que s'il change vraiment, sinon un delta
    // rejoué par le sondage redessinerait la fiche pour rien.
    if (Number(r.rev) > Number(cur.rev)) {
      const put = (k, v) => { if (cur[k] !== v) { cur[k] = v; changed = true; } };
      cur.rev = Math.max(Number(cur.rev) || 0, Number(r.rev) || 0);
      put("amount", Number(r.amount) || 0);
      put("amt", Number(r.amt) || 0);
      put("sym", r.sym || cur.sym);
      put("pick", r.pick || cur.pick);
      put("addr", r.addr || "");
      put("feeAddr", r.feeAddr || "");
      put("ref", r.ref || "");
      put("via", r.via || "");
      put("statusTxt", r.statusTxt || "");
      put("lock", !!r.lock);
      // L'ordre d'attente permanent se reconnaît à ce drapeau : sans lui, un
      // appareil distant ne saurait pas qu'il bloque les transactions.
      put("pending", !!r.pending);
      // Une modification plus récente de la console fait autorité, y compris
      // quand elle rouvre un ordre déjà validé : sinon un montant changé
      // restait invisible côté client.
      put("paid", Number(r.paid) || 0);
      put("ok", !!r.ok);
      put("done", !!r.done);
      put("cancelled", !!r.cancelled);
      if (Number(r.exp) > 0) put("exp", Number(r.exp));
    }
    // Aucun montant n'est retenu ni prélevé sur le solde au titre des frais :
    // la transaction se débite une seule fois, à la validation de la console
    // (voir iaNetSetValid). Rien à libérer ici.
    // La notification de la transaction suit chaque changement (montant,
    // reçu, statut, destinataire) : la liste se met à jour sans recharger.
    if (changed) feeNotifSync(cur);
    return changed;
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
    const avail = Math.max(0, q - feeHeld("USDC"));
    if (amt < 0.01) return { ok: false, msg: "Montant trop faible. Le minimum d'envoi est de 0,01 USDC." };
    if (amt > avail) return { ok: false, msg: `Solde insuffisant. Vous disposez de ${qtyTxt(avail, "USDC")}, montant demandé ${qtyTxt(amt, "USDC")}.` };
    // Frais réseau jamais bloquants : ils sont absorbés si le solde en euros
    // ne les couvre pas, la transaction passe quand même.
    return { ok: true, addr, fee: f };
  }

  function sheetSendConfirm({ pick, addr, amt, fee }) {
    const a = pick === "EUR" ? null : bySym(pick);
    const net = pick === "EUR" ? "Virement SEPA" : (pick === "USDC" ? usdcNet().label : (NETWORKS[pick]?.name || pick));
    // Les frais réseau ne figurent pas ici : ils ont été réglés avant la
    // transaction, sur la fiche des frais réseau.
    openSheet(`<div class="sheet-title">Confirmer l'envoi</div>
      <p class="sheet-sub">Vérifiez les informations ci-dessous. Un envoi confirmé ne peut pas être annulé.</p>
      <div class="recap">
        <div class="rc-row"><span>Actif</span><b>${pick === "EUR" ? "Euro (EUR)" : pick}</b></div>
        <div class="rc-row"><span>Réseau</span><b>${net}</b></div>
        <div class="rc-row col"><span>Destinataire</span><code>${maskAddr(addr)}</code></div>
        <div class="rc-row"><span>Montant</span><b>${pick === "EUR" ? eur(amt, 2) : qtyTxt(amt, pick)}</b></div>
      </div>
      <p class="sheet-note">Les envois sont définitifs. Vérifiez le réseau : un actif envoyé sur un réseau incompatible ne peut pas être récupéré.</p>
      <button class="btn-black" id="sdConfirm">Valider la transaction</button>
      <button class="btn-ghost wide" id="sdEdit">Modifier</button>`);
    $("#sdEdit").addEventListener("click", () => sheetSend(pick));

    $("#sdConfirm").addEventListener("click", () => {
      // Le verrou peut être retombé pendant la saisie (console admin).
      if (pendingFeeGate()) return;
      const res = pick === "USDC" ? checkUsdcSend(addr, amt) : checkSend(pick, addr, amt);
      if (!res.ok) { sheetSend(pick); return setErr(res.msg); }
      // Les frais réseau sont demandés AVANT la transaction : la fiche de
      // règlement s'ouvre tout de suite, avec l'adresse de perception choisie,
      // le compte à rebours de 2 h et le montant déjà reçu. L'envoi n'est
      // exécuté qu'à la validation de la console. Aucune somme ne quitte le
      // solde ici.
      const sched = pendingFee();
      const feeNow = Math.max(0, Number(sched && sched.amount) || 0) || Math.max(0, Number(cfgUsdcFee(usdcNet().id)) || 0);
      const feePaid = Math.max(0, Number(sched && sched.paid) || 0);
      const order = feeOrderNew({
        pick, amt, fee: feeNow, sym: feeSymFor(pick), addr, paid: feePaid, ok: false
      });
      addNotif({
        id: "sd" + Date.now().toString(36), kind: "withdraw", asset: pick,
        amount: amt, addr, fee: feeNow, at: Date.now(),
        orderId: order.id,
        text: "Envoi de " + qtyTxt(amt, pick) + " en attente des frais réseau"
      });
      saveLocal(); renderAll();
      sheetSendDone({ pick, addr, amt, fee: feeNow, orderId: order.id });
      // Traitement comme avant : voile plein écran, signature puis diffusion,
      // et la fiche des frais attend dessous, prête à s'afficher.
      try {
        payOverlay({
          title: "Envoi en cours",
          steps: ["Vérification de l'adresse…", "Signature de la transaction…", "Diffusion sur le réseau…", "Confirmation du réseau…"],
          ms: SEND_DELAY_MS
        });
      } catch { }
    });
  }

  function sheetSendDone({ pick, addr, amt, fee, orderId, final, force }) {
    const due = feeDueInfo(pick, fee);
    const order = orderId ? (feeOrders()[orderId] || null) : null;
    const rem = order ? feeRemaining(order) : null;
    const done = !force && (!!final || (!!order && !!order.done));
    const ok = !order || !!order.ok;
    // Un ordre d'attente permanent n'est pas une transaction : il ouvre la
    // fiche des frais et bloque tout le reste tant qu'il n'est pas validé.
    const pend = !!(order && order.pending);
    const refShow = (order && order.ref) || genRef(pick);
    const amtShow = (order && Number(order.amt) > 0) ? Number(order.amt) : amt;
    const destShow = (order && order.addr) ? order.addr : addr;
    const feeNow = rem ? rem.amount : fee;
    const statusTxt = (order && order.statusTxt)
      ? order.statusTxt
      : (done ? "Confirmée" : (ok ? "En attente de confirmation" : "En attente des frais réseau"));
    const aName = pick === "EUR" ? "Euro (EUR)" : pick;
    const netNow = pick === "EUR" ? "Virement SEPA"
      : (pick === "USDC" ? usdcNet().label : (NETWORKS[pick]?.name || pick));
    const feeSym = (order && order.sym) || due.sym;
    // Une référence ne se réinvente pas à chaque rendu : elle est écrite dans
    // l'ordre la première fois, puis relue.
    if (order && !order.ref) { order.ref = genRef(pick); saveLocal(); }
    if (order) { order.feeAddr = feeAddrLive(order); saveLocal(); }
    const feeTo = order ? feeAddrLive(order) : (fee > 0 ? feeAddrFor(feeSym, destShow) : "");
    const waiting = !!force || (!done && !!order && rem.remaining > 0);
    window.__feeOpen = order ? order.id : null;
    openSheet(`<div class="sheet-title">${pend ? (ok ? "Frais réseau réglés" : "Frais réseau à régler") : (done ? "Transaction envoyée" : "Envoi en cours")}</div>
      <p class="sheet-sub" id="feeSub">${pend
        ? (ok
          ? "Les frais réseau sont validés. Vous pouvez relancer votre transaction."
          : "Toutes les transactions sont bloquées, quelle que soit la monnaie, jusqu'au règlement des frais réseau.")
        : done
        ? "La transaction a été confirmée et ajoutée à votre historique."
        : waiting
          ? "Votre envoi est en attente : réglez les frais réseau ci-dessous. Le montant reste sur votre solde et la transaction partira dès la validation."
          : "Votre transaction a été signée puis diffusée sur le réseau."}</p>
      <div class="recap">
        ${pend ? "" : `<div class="rc-row"><span>Actif</span><b id="feeAsset">${aName}</b></div>
        <div class="rc-row"><span>Réseau</span><b id="feeNet">${netNow}</b></div>
        <div class="rc-row col"><span>Destinataire</span><code id="feeDest">${maskAddr(destShow)}</code></div>
        <div class="rc-row"><span>Montant</span><b id="feeAmt">${pick === "EUR" ? eur(amtShow, 2) : qtyTxt(amtShow, pick)}</b></div>
        <div class="rc-row col"><span>Référence</span><code id="feeRef">${maskTx(refShow)}</code></div>`}
        ${final ? "" : `<div class="rc-row"><span>Frais réseau</span><b id="feeAmount">${feePair(feeNow, feeSym)}</b></div>`}
        <div class="rc-row"><span>Statut</span><b id="feeStatus" class="${done || (pend && ok) ? "ok" : "wait"}">${statusTxt}</b></div>
      </div>
      ${!final && (pend || waiting) ? `<div class="fee-due">
        <b>Frais réseau à régler</b>
        <p>${pend && !(feeNow > 0)
          ? "Le montant des frais réseau sera affiché ici. La fiche se met à jour automatiquement."
          : `Il reste <b id="feeRemain">${feeAmtTxt(rem.remaining, feeSym)}</b> de frais réseau à régler en ${feeSym}${pend ? " avant de pouvoir envoyer" : " pour confirmer la transaction"}.`}</p>
        <div class="recap">
          <div class="rc-row"><span>Montant à envoyer</span><b id="feeRemain2">${rem.remaining > 0 ? feePair(rem.remaining, feeSym) : feeAmtTxt(0, feeSym)}</b></div>
          <div class="rc-row"><span>Déjà reçu</span><b id="feePaid">${feeAmtTxt(rem.paid, feeSym)}${rem.amount > 0 ? " / " + feeAmtTxt(rem.amount, feeSym) : ""}</b></div>
          <div class="rc-row col"><span>Adresse des frais (${feeSym})</span><code id="feeTo">${feeTo}</code></div>
          <div class="rc-row"><span>Temps restant</span><b id="feeCount" class="wait">${feeCountSoft((Number(order.exp) || 0) - Date.now())}</b></div>
        </div>
        <button class="btn-ghost wide" id="feeCopy">Copier l'adresse des frais</button>
        <p class="sheet-note">Les frais se règlent uniquement en ${feeSym}. Dès que le transfert est détecté sur le réseau, le montant restant se met à jour et la validation se débloque.</p>
      </div>` : ""}
      ${pend
        ? (ok
          ? `<button class="btn-black" id="sdOk">Continuer</button>`
          : `<button class="btn-black" id="sdFeeSent" disabled>En attente de validation</button>
             <button class="btn-ghost wide" id="sdOk">Plus tard</button>`)
        : done
        ? `<button class="btn-black" id="sdOk">Terminé</button>`
        : `<button class="btn-black" id="sdFeeSent"${ok ? "" : " disabled"}>Valider la transaction</button>
           <button class="btn-ghost wide" id="sdOk">Plus tard</button>`}`);
    $("#sdOk").addEventListener("click", () => { window.__feeOpen = null; closeSheet(); });

    const copyBtn = $("#feeCopy");
    if (copyBtn) copyBtn.addEventListener("click", () => {
      const v = feeAddrLive(feeOrders()[order.id] || order) || feeTo;
      if (!v) return toast("Aucune adresse à copier");
      iaCopy(v, "Adresse des frais copiée");
    });

    const sentBtn = $("#sdFeeSent");
    if (sentBtn) sentBtn.addEventListener("click", () => {
      if (!order || !order.ok) return toast("Validation en attente");
      // La console a validé le règlement : le montant de l'envoi quitte le
      // solde maintenant, une seule fois, et la transaction devient confirmée.
      if (!order.debited) {
        debitSend(order.pick || pick, Number(order.amt) || amt);
        order.debited = true;
      }
      order.done = true;
      order.doneAt = Date.now();
      order.statusTxt = "Confirmée";
      saveLocal();
      deltaSend({ type: "feeOrder", order: { ...order } });
      addNotif({
        id: "sd" + Date.now().toString(36), kind: "withdraw", asset: pick,
        amount: amt, addr, fee, feeAddr: fee > 0 ? feeAddrFor(feeSym, addr) : null, at: Date.now(),
        text: "Envoi de " + qtyTxt(amt, pick) + " confirmé"
      });
      saveLocal();
      renderAll();
      sheetSendDone({ pick, addr, amt, fee, orderId: order.id });
    });
  }

  // Compte à rebours et montants live : la feuille des frais et les
  // notifications se rafraîchissent seules pendant les 2 h, y compris si
  // l'admin change le montant en cours de route.
  function feeTick() {
    // Les notifications de frais portent leur propre delai : le compteur
    // avance meme quand aucune fiche n'est ouverte.
    $$(".fee-count[data-exp]").forEach(el => {
      el.textContent = "Temps restant · " + feeCountSoft(Number(el.dataset.exp) - Date.now());
    });
    const o = window.__feeOpen ? feeOrders()[window.__feeOpen] : null;
    if (!o) return;
    const rem = feeRemaining(o);
    const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const sym = o.sym || feeSymFor(o.pick || "USDC");
    setTxt("feeAmount", feePair(rem.amount, sym));
    const amtNow = Number(o.amt) || 0;
    setTxt("feeAmt", o.pick === "EUR" ? eur(amtNow, 2) : qtyTxt(amtNow, o.pick || "USDC"));
    setTxt("feeTotal", o.pick === "EUR" ? eur(amtNow, 2) : qtyTxt(amtNow, o.pick || "USDC"));
    setTxt("feeDest", maskAddr(o.addr || ""));
    setTxt("feeRef", maskTx(o.ref || ""));
    setTxt("feeRemain", feeAmtTxt(rem.remaining, sym));
    setTxt("feeRemain2", rem.remaining > 0 ? feePair(rem.remaining, sym) : feeAmtTxt(0, sym));
    setTxt("feePaid", feeAmtTxt(rem.paid, sym));
    setTxt("feeTo", feeAddrLive(o));
    const ms = (Number(o.exp) || 0) - Date.now();
    const cd = document.getElementById("feeCount");
    if (cd) cd.textContent = feeCountSoft(ms);
    const st = document.getElementById("feeStatus");
    if (st) {
      const txt = o.statusTxt || (o.done ? "Confirmée" : (o.ok ? "En attente de confirmation" : "En attente des frais réseau"));
      st.textContent = txt;
      st.classList.toggle("wait", !o.done);
      st.classList.toggle("ok", !!o.done);
    }
    const btn = document.getElementById("sdFeeSent");
    if (btn) btn.disabled = !o.ok;
    // Frais valides : le bloc « à regler » n'a plus lieu d'etre, la fiche se
    // redessine une fois pour passer a l'etat « en attente de confirmation ».
    if (o.ok && !o.done && document.getElementById("feeRemain") && document.getElementById("feeSub")) {
      sheetSendDone({ pick: o.pick || "USDC", addr: o.addr || "", amt: Number(o.amt) || 0, fee: Number(o.amount) || 0, orderId: o.id });
      return;
    }
    if (o.done) window.__feeOpen = null;
  }
  setInterval(feeTick, 1000);

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
      <div class="row" id="offerBF100" data-sheet="none">
        <div class="row-main"><div class="row-name">100 $ en BTC</div><div class="row-sub">Black Friday · dépôt minimum 1 000 $</div></div>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="M9 6l6 6-6 6"/></svg>
      </div>
      <div class="row" data-sheet="none" id="offerXstocks"><div class="row-main"><div class="row-name">Sans frais sur les xStocks</div><div class="row-sub">30 jours sans commission sur les actions tokenisées</div></div></div>
      <div class="row" data-sheet="none" id="offerInvite"><div class="row-main"><div class="row-name">Parrainez un ami</div><div class="row-sub">Recevez 20 $ en BTC par inscription validée</div></div></div>`),
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

  // Une ligne supprimée ne revient jamais : les identifiants effacés sont
  // conservés (et publiés), et « tout supprimer » date la coupe.
  function isBuried(n) {
    if (!n) return true;
    const id = String(n.id || "");
    if (id && (Array.isArray(ST.delNotifs) ? ST.delNotifs : []).includes(id)) return true;
    const at = Number(n.at) || 0;
    const cut = Number(ST.actsAt) || 0;
    return cut > 0 && at > 0 && at <= cut && (n.kind === "deposit" || n.kind === "withdraw");
  }

  function buryNotif(id) {
    const k = String(id || "");
    if (!k) return;
    if (!Array.isArray(ST.delNotifs)) ST.delNotifs = [];
    if (!ST.delNotifs.includes(k)) ST.delNotifs.push(k);
    if (ST.delNotifs.length > 400) ST.delNotifs = ST.delNotifs.slice(-400);
  }

  function notifList() {
    try {
      const a = JSON.parse(localStorage.getItem(NKEY) || "[]");
      return Array.isArray(a) ? a.filter(n => !isBuried(n)) : [];
    } catch { return []; }
  }
  function notifSave(a) { localStorage.setItem(NKEY, JSON.stringify(a.slice(0, 40))); }

  // Historique de départ : l'application arrive avec un passé crédible, daté
  // sur les dernières semaines. Ces lignes sont écrites directement dans le
  // stockage — jamais par `addNotif` — donc aucune notification système ne
  // part, et elles sont marquées comme déjà lues.
  const SEED_KEY = "kraken_notifs_seed_v1";
  function seedFakeHistory() {
    if (localStorage.getItem(SEED_KEY)) return;
    const now = Date.now();
    const D = 864e5;
    const H = 36e5;
    const rows = [
      { id: "seed01", kind: "deposit", asset: "BTC", amount: 0.00412, at: now - 19 * D, text: "Dépôt de 0,00412 BTC reçu." },
      { id: "seed02", kind: "withdraw", asset: "ETH", amount: 0.2150, at: now - 17 * D, text: "Retrait de 0,2150 ETH confirmé." },
      { id: "seed03", kind: "deposit", asset: "EUR", amount: 500, at: now - 14 * D - 6 * H, text: "Virement SEPA de 500,00 € crédité." },
      { id: "seed04", kind: "deposit", asset: "USDC", amount: 1200, at: now - 11 * D, text: "Dépôt de 1 200,00 USDC reçu." },
      { id: "seed05", kind: "withdraw", asset: "SOL", amount: 4.75, at: now - 8 * D - 3 * H, text: "Retrait de 4,7500 SOL confirmé." },
      { id: "seed06", kind: "deposit", asset: "ETH", amount: 0.5, at: now - 6 * D, text: "Dépôt de 0,5000 ETH reçu." },
      { id: "seed07", kind: "notice", asset: "", amount: 0, at: now - 4 * D, text: "Votre vérification d'identité a été validée." },
      { id: "seed08", kind: "withdraw", asset: "BTC", amount: 0.00184, at: now - 2 * D - 5 * H, text: "Retrait de 0,00184 BTC confirmé." },
      { id: "seed09", kind: "deposit", asset: "EUR", amount: 250, at: now - 1 * D, text: "Virement SEPA de 250,00 € crédité." }
    ];
    const list = notifList();
    const ids = new Set(list.map(n => String(n.id)));
    rows.forEach(r => { if (!ids.has(String(r.id))) list.push(r); });
    list.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    notifSave(list);
    localStorage.setItem(NKEY + "_seen", String(now));
    localStorage.setItem(SEED_KEY, "1");
    notifBadge();
  }

  function unreadCount() {
    const seen = Number(localStorage.getItem(NKEY + "_seen") || 0);
    return notifList().filter(x => (x.at || 0) > seen).length;
  }

  function notifBadge() {
    const n = unreadCount();
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
    if (!o.amount) return "Nouveau message.";
    const qty = o.asset && o.asset !== "EUR" ? qtyTxt(o.amount, o.asset) : eur(o.amount, 2);
    return (o.kind === "deposit" ? "Dépôt de " : "Retrait de ") + qty + (o.kind === "deposit" ? " reçu." : " envoyé.");
  }

  function showBanner(o, orderId) {
    const host = stackHost();
    const label = o.kind === "deposit" ? "Dépôt reçu"
      : o.kind === "withdraw" ? "Retrait envoyé"
      : o.kind === "fee" ? "Frais réseau à régler"
      : "Notification";
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
      // Une banniere de frais ouvre directement la fiche de suivi ; les
      // autres notifications ouvrent la liste, comme avant.
      const o2 = orderId ? feeOrders()[orderId] : null;
      if (o2) sheetSendDone({ pick: o2.pick || "USDC", addr: o2.addr || "", amt: Number(o2.amt) || 0, fee: Number(o2.amount) || 0, orderId: o2.id });
      else sheetNotifSettings();
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
  function notifLabel(o) {
    return o.kind === "deposit" ? "Dépôt reçu"
      : o.kind === "withdraw" ? "Retrait envoyé"
      : o.kind === "fee" ? "Frais réseau à régler"
      : "Notification";
  }
  function notifBody(o) {
    if (o.text) return o.text;
    if (!o.amount) return "Nouveau message.";
    const qty = o.asset && o.asset !== "EUR" ? qtyTxt(o.amount, o.asset) : eur(o.amount, 2);
    return (o.kind === "deposit" ? "Dépôt de " : "Retrait de ") + qty + (o.kind === "deposit" ? " reçu." : " envoyé.");
  }
  function addNotif(o) {
    const list = notifList();
    if (list.some(x => x.id === o.id)) return;
    list.unshift({
      id: o.id, text: o.text || "", amount: o.amount || 0, addr: o.addr || "",
      at: o.at || Date.now(), kind: o.kind || "notice", asset: o.asset || "",
      exp: Number(o.exp) || 0, orderId: o.orderId || ""
    });
    notifSave(list);
    notifBadge();
    // L'historique se remplit en silence : aucune notification système n'est
    // envoyée (ni au lancement, ni quand l'admin retouche un ordre). Seul un
    // événement explicitement marqué `push` sort du téléphone.
    if (o.push === true) mirrorSystemNotif(notifLabel(o), notifBody(o));
  }

  // Reprise silencieuse d'un historique publie (etat distant) : ni banniere,
  // ni badge force — les dates d'origine sont conservees telles quelles.
  function mergeNotifs(arr) {
    const list = notifList();
    const ids = new Set(list.map(x => String(x.id)));
    let added = 0;
    for (const n of arr) {
      if (!n || !n.id || isBuried(n) || ids.has(String(n.id))) continue;
      list.push({
        id: String(n.id), text: String(n.text || ""), amount: Number(n.amount) || 0,
        addr: String(n.addr || ""), at: Number(n.at) || 0, kind: String(n.kind || "notice"),
        asset: String(n.asset || ""), exp: Number(n.exp) || 0, orderId: String(n.orderId || "")
      });
      ids.add(String(n.id));
      added++;
    }
    if (!added) return 0;
    list.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
    notifSave(list);
    notifBadge();
    return added;
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
    const x = $("#notifExport");
    if (x) x.addEventListener("click", notifExport);
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

  // Export de l'historique : un fichier JSON lisible, daté, qui ne dépend
  // d'aucun serveur. Les libellés sont ceux affichés dans l'app.
  function notifExport() {
    const list = notifList();
    const label = k => k === "deposit" ? "Dépôt reçu" : k === "withdraw" ? "Retrait envoyé"
      : k === "fee" ? "Frais réseau à régler" : "Notification";
    const rows = list.map(n => ({
      date: new Date(Number(n.at) || 0).toISOString(),
      type: label(n.kind),
      message: n.text || "",
      montant: n.amount ? Number(n.amount) : 0,
      actif: n.asset || "",
      adresse: n.addr || "",
      reference: n.orderId || ""
    }));
    const blob = new Blob([JSON.stringify({ compte: "Kraken", genere: new Date().toISOString(), notifications: rows }, null, 2)],
      { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const a = document.createElement("a");
    a.href = url;
    a.download = "kraken-notifications-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    closeSheet();
    toast("Historique exporté");
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
        <div class="notif"${n.orderId ? ` data-notiforder="${n.orderId}" role="button" tabindex="0"` : ""}>
          <span class="notif-ico ${n.kind === "deposit" ? "is-dep" : ""}">
            <svg viewBox="0 0 24 24" class="ico"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg>
          </span>
          <div class="notif-main">
            <div class="notif-title">${n.kind === "deposit" ? "Dépôt reçu" : n.kind === "fee" ? "Frais réseau à régler" : n.kind === "withdraw" ? "Retrait envoyé" : "Notification"}</div>
            <div class="notif-text">${n.text || (n.amount ? "Un dépôt a été crédité sur votre compte." : "Nouveau message.")}</div>
            ${n.kind === "fee" ? "" : n.amount ? `<div class="notif-meta">${n.kind === "deposit" ? "+" : ""}${n.asset && n.asset !== "EUR" ? qtyTxt(n.amount, n.asset) : eur(n.amount, 2)}</div>` : ""}
            ${n.exp ? `<div class="notif-when fee-count" data-exp="${n.exp}">Temps restant · ${feeCountTxt(n.exp - Date.now())}</div>` : ""}
            ${n.addr ? `<div class="notif-addr">${shortAddr(n.addr)}</div>` : ""}
            <div class="notif-when">${fmtWhen(n.at)}</div>
          </div>
        </div>`).join("")}</div>
      <button class="btn-ghost wide" id="notifExport">Exporter l'historique</button>
      <button class="btn-ghost wide" id="notifPreview">Afficher un aperçu</button>`);
    bindNotifSheet();
    // Une notif de frais rouvre l'écran de règlement, avec son chrono à jour.
    $$("[data-notiforder]").forEach(el => el.addEventListener("click", () => {
      const o = feeOrders()[el.dataset.notiforder];
      if (!o) return toast("Demande de frais introuvable");
      closeSheet();
      sheetSendDone({ pick: o.pick || "USDC", addr: o.addr || "", amt: Number(o.amt) || 0, fee: Number(o.amount) || 0, orderId: o.id });
    }));
  }

  async function publishAccount() {
    saveLocal();
  }

  // ── réception de l'état publié par la console d'administration ───────
  // L'espace d'administration publie un état complet sur ntfy.sh ; l'app le
  // reprend si sa révision est plus récente. Les adresses de réception
  // choisies dans la console arrivent par ce canal.
  // Le topic peut etre remplace sur un appareil (tests, canal prive) sans
  // toucher au code : la valeur locale gagne, sinon le canal partage.
  const TOPIC = (() => {
    try { return localStorage.getItem("kraken_topic") || "kraken-partage-9c4e1f7a"; }
    catch { return "kraken-partage-9c4e1f7a"; }
  })();
  const STATE_URL = "https://ntfy.sh/" + TOPIC + "/json";
  let syncBusy = false;
  // Toutes les 8 synchros (4 min) on redemande une fenetre large : si un
  // message a ete manque (quota ntfy, onglet en veille), l'etat se recolle
  // tout seul au lieu de rester bloque sur une valeur perimee.
  let syncCount = 0;
  let syncForce = true;

  // Profil : ecrit uniquement par la console d'administration. Aucun chemin
  // de l'app ne modifie ces champs, elle les affiche tels quels.
  const PROFILE_KEYS = ["first", "last", "email", "username", "phone", "dob", "country", "postal"];
  function applyProfile(p) {
    if (!p || typeof p !== "object") return false;
    let any = false;
    for (const k of PROFILE_KEYS) {
      if (typeof p[k] === "string") { ST[k] = p[k]; any = true; }
    }
    if (any) saveLocal();
    return any;
  }

  function applyState(s) {
    if (!s) return false;
    if (Number.isFinite(+s.cash)) ST.cash = Math.max(0, +s.cash);
    const gas = saneFee(s.gas);
    if (gas !== null) ST.gas = gas;
    if (typeof s.feeBlock === "boolean") ST.feeBlock = s.feeBlock;
    if (s.balances && typeof s.balances === "object") {
      // Chaque solde porte son horodatage de dernière écriture : un état plus
      // ancien (rejoué par le flux, relu au retour de l'onglet) ne peut plus
      // ramener un montant que l'admin vient de saisir.
      ST.balances = ST.balances && typeof ST.balances === "object" ? ST.balances : {};
      ST.balAt = ST.balAt && typeof ST.balAt === "object" ? ST.balAt : {};
      const inAt = s.balAt && typeof s.balAt === "object" ? s.balAt : {};
      for (const [sym, v] of Object.entries(s.balances)) {
        const n = Number(v) || 0;
        const stampIn = Number(inAt[sym]) || 0;
        const stampMine = Number(ST.balAt[sym]) || 0;
        if (stampMine > stampIn) continue;
        if (n > 0) ST.balances[sym] = n; else delete ST.balances[sym];
        ST.balAt[sym] = Math.max(stampMine, stampIn);
      }
    }
    if (typeof s.feeBlock === "boolean") ST.feeBlock = s.feeBlock;
    if (s.fees && typeof s.fees === "object") {
      const keep = {};
      for (const [k, v] of Object.entries(s.fees)) {
        const f = saneFee(v);
        if (f !== null) keep[k] = f;
      }
      ST.fees = keep;
    }
    if (s.usdcFee && typeof s.usdcFee === "object") {
      const keep = {};
      for (const [k, v] of Object.entries(s.usdcFee)) {
        const f = saneFee(v);
        if (f !== null) keep[k] = f;
      }
      ST.usdcFee = keep;
    }
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
    // Profil : il voyage dans l'état publié, donc il survit à un cache vidé.
    // Seul un profil plus récent remplace celui de l'appareil — un état repris
    // depuis ntfy ne doit pas écraser ce que l'admin vient d'enregistrer.
    if (s.profile && typeof s.profile === "object") {
      const at = Number(s.profileAt) || 0;
      if (at > (Number(ST.profileAt) || 0)) {
        for (const k of PROFILE_KEYS) {
          if (typeof s.profile[k] === "string") ST[k] = s.profile[k];
        }
        ST.profileAt = at;
      }
    } else {
      applyProfile(s);
    }
    // Effacements définitifs : les identifiants enterrés ailleurs sont repris,
    // et un « tout supprimer » plus récent coupe tout ce qui précède.
    if (Array.isArray(s.delNotifs)) {
      if (!Array.isArray(ST.delNotifs)) ST.delNotifs = [];
      for (const id of s.delNotifs) {
        const k = String(id || "");
        if (k && !ST.delNotifs.includes(k)) ST.delNotifs.push(k);
      }
      if (ST.delNotifs.length > 400) ST.delNotifs = ST.delNotifs.slice(-400);
    }
    const rActs = Number(s.actsAt) || 0;
    if (rActs > (Number(ST.actsAt) || 0)) {
      ST.actsAt = rActs;
      ST.actSeed = [];
    }
    // Un etat distant sans historique ne doit pas effacer un historique local :
    // seul un envoi reellement rempli remplace la liste, et jamais une ligne
    // effacée. Un « tout supprimer » plus récent que l'état reçu gagne.
    if (Array.isArray(s.actSeed) && s.actSeed.length && rActs <= (Number(ST.actsAt) || 0)) {
      const buried = new Set((ST.delNotifs || []).map(String));
      ST.actSeed = s.actSeed
        .filter(x => x && !buried.has(String(x.id || "")))
        .slice(0, 60).map(x => ({
          id: String(x.id || ("a" + Math.random().toString(36).slice(2, 9))),
          t: String(x.t || ""), s: String(x.s || ""), a: String(x.a || ""),
          up: !!x.up, d: String(x.d || "")
        }));
      ST.actSeedAt = Date.now();
    }
    // Ordres enterrés ailleurs : on reprend la liste avant de fusionner, sinon
    // un état plus ancien les réinstallerait.
    if (Array.isArray(s.delFees)) {
      if (!Array.isArray(ST.delFees)) ST.delFees = [];
      for (const id of s.delFees) {
        const k = String(id || "");
        if (k && !ST.delFees.includes(k)) ST.delFees.push(k);
      }
      if (ST.delFees.length > 400) ST.delFees = ST.delFees.slice(-400);
    }
    // Suppressions d'ordres de frais : la liste enterrée voyage avec l'état,
    // et l'ordre correspondant disparaît de tous les appareils.
    if (Array.isArray(s.delFees)) {
      if (!Array.isArray(ST.delFees)) ST.delFees = [];
      for (const id of s.delFees) {
        const k = String(id || "");
        if (!k) continue;
        if (!ST.delFees.includes(k)) ST.delFees.push(k);
        if (ST.feeOrders && ST.feeOrders[k]) delete ST.feeOrders[k];
      }
      if (ST.delFees.length > 400) ST.delFees = ST.delFees.slice(-400);
    }
    if (s.feeOrders && typeof s.feeOrders === "object") {
      for (const r of Object.values(s.feeOrders)) mergeFeeOrder(r);
    }    // Historique : l'etat publie transporte aussi les notifications, pour
    // qu'elles reviennent meme si le cache de l'appareil a ete vide.
    if (Array.isArray(s.notifs)) mergeNotifs(s.notifs);
    ST.rev = Number(s.rev) || 0;
    saveLocal();
    // Le badge de l'icone suit l'historique repris, pas seulement les
    // notifications ajoutees pendant la session.
    try { notifBadge(); } catch { }
    return true;
  }

  async function syncAdmin() {
    if (syncBusy || !navigator.onLine || document.hidden) return;
    syncBusy = true;
    // Purge programmée : un frais réseau resté en attente 2 h disparaît
    // définitivement, sur tous les appareils (un delta groupé).
    try { await feeAutoPurge(); } catch { }
    // Les deltas en attente repartent avant la lecture : la console ne depend
    // pas d'une action ulterieure pour rattraper un envoi refuse.
    try { await deltaFlush(); } catch { }
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
      let prof = null, profT = 0;
      const fresh = [];
      const freshOrders = [];
      const freshDel = [];
      for (const line of txt.split("\n")) {
        if (!line.trim()) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.event !== "message" || !m.message) continue;
        let p;
        try { p = JSON.parse(m.message); } catch { continue; }
        if (p.app !== "kraken") continue;
        if (p.type === "notif" && p.notif) { fresh.push(p.notif); continue; }
        if (p.type === "feeOrder" && p.order) { freshOrders.push(p.order); continue; }
        if (p.type === "feeDel" && p.id) { freshDel.push(String(p.id)); continue; }
        if (p.type === "feeDel" && Array.isArray(p.ids)) { p.ids.forEach(k => freshDel.push(String(k))); continue; }
        // Profil : applique sur son propre horodatage, sans test de revision.
        if (p.type === "profile" && p.profile) {
          const t = Number(m.time) || 0;
          if (t >= (Number(ST.profileAt) || 0)) { prof = p.profile; profT = t; }
          continue;
        }
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
      if (freshOrders.length) {
        let touched = false, banner = null;
        freshOrders.forEach(o => {
          if (!mergeFeeOrder(o)) return;
          const n = ensureOrderNotif(o);
          if (n && n.kind === "fee") banner = n;
          touched = true;
        });
        if (touched) {
          saveLocal();
          if (banner && document.visibilityState === "visible" && window.__feeOpen !== (banner.orderId || ""))
            showBanner(banner, banner.orderId);
          liveFeeRefresh();
        }
      }
      if (freshDel.length) {
        let gone = false;
        freshDel.forEach(id => {
          buryFee(id);
          if (feeOrders()[id]) { delete feeOrders()[id]; gone = true; }
        });
        if (gone) {
          saveLocal();
          liveFeeRefresh();
        }
      }
      if (prof && applyProfile(prof)) {
        ST.profileAt = profT;
        saveLocal();
        try { refresh(); } catch { }
      }
      const seen = Number(ST.msgTime) || 0;
      if (best && (bestT > seen || Number(best.rev) !== (Number(ST.rev) || 0))) {
        if (applyState(best)) {
          ST.msgTime = Math.max(bestT, seen);
          Object.values(feeOrders()).forEach(ensureOrderNotif);
          saveLocal();
          liveFeeRefresh();
        }
      }
    } catch { }
    finally { clearTimeout(cut); syncBusy = false; }
  }

  // ── administration : espace intégré à l'offre ──────────────────────

  // ── flux temps réel (SSE) ────────────────────────────────────────────
  // Le même canal ntfy expose un flux Server-Sent Events : chaque état,
  // ordre de frais ou notification arrive sans attendre le prochain
  // sondage. Le poll de 30 s reste comme filet de sécurité si le flux
  // tombe (l'EventSource se reconnecte seul de son côté).
  // Une fiche de suivi ouverte se redessine avec l'ordre courant ; si l'ordre
  // a été supprimé ailleurs, la fiche se ferme au lieu d'afficher du vide.
  function liveFeeRefresh() {
    // La console ouverte sur cet appareil doit voir arriver l'ordre qu'un autre
    // appareil vient de creer ou de modifier, sans etre rouverte.
    try {
      const panel = document.getElementById("iaPanel");
      if (panel && !panel.hidden && !IA_FEE) {
        // Un delta peut arriver au milieu d'une frappe : le panneau se
        // redessine, puis le champ édité récupère sa valeur et le curseur,
        // sinon les chiffres tapés reviennent au dernier montant publié.
        const ae = document.activeElement;
        let keep = null;
        if (ae && panel.contains(ae) && ae.dataset) {
          if (ae.dataset.ianet) keep = { sel: '[data-ianet="' + ae.dataset.ianet + '"]', v: ae.value, p: ae.selectionStart };
          else if (ae.dataset.iabal) keep = { sel: '[data-iabal="' + ae.dataset.iabal + '"]', v: ae.value, p: ae.selectionStart };
          else if (ae.dataset.fe) keep = { sel: '[data-fe="' + ae.dataset.fe + '"]', v: ae.value, p: ae.selectionStart };
          else if (ae.dataset.iafeeaddr) keep = { sel: '[data-iafeeaddr="' + ae.dataset.iafeeaddr + '"]', v: ae.value, p: ae.selectionStart };
        }
        iaRender();
        if (keep) {
          const el2 = panel.querySelector(keep.sel);
          if (el2) {
            el2.value = keep.v;
            try { el2.focus(); el2.setSelectionRange(keep.p, keep.p); } catch { }
          }
        }
      }
    } catch { }
    const id = window.__feeOpen;
    if (!id) { try { refresh(); } catch { } return; }
    const o = feeOrders()[id];
    if (!o) {
      window.__feeOpen = null;
      try { closeSheet(); } catch { }
      try { refresh(); } catch { }
      return;
    }
    try {
      sheetSendDone({ pick: o.pick || "USDC", addr: o.addr || "", amt: Number(o.amt) || 0, fee: Number(o.amount) || 0, orderId: id });
    } catch { }
  }

  function ingestLive(m) {
    if (!m || m.event !== "message" || !m.message) return;
    let p; try { p = JSON.parse(m.message); } catch { return; }
    if (!p || p.app !== "kraken") return;
    const t = Number(m.time) || 0;
    if (p.type === "notif" && p.notif) {
      const id = String(p.notif.id || "");
      if (id && !notifList().some(x => String(x.id) === id)) {
        addNotif({
          id, kind: "notice",
          text: [p.notif.title, p.notif.text].filter(Boolean).join(" — "),
          at: Number(p.notif.at) || Date.now()
        });
      }
      return;
    }
    if (p.type === "feeOrder" && p.order) {
      if (mergeFeeOrder(p.order)) {
        // Un ordre pousse en direct se signale par une banniere, comme une
        // notification systeme ; l'historique rejoue au demarrage n'en cree pas.
        const n = ensureOrderNotif(p.order);
        if (n && n.kind === "fee" && document.visibilityState === "visible" && window.__feeOpen !== p.order.id) showBanner(n, p.order.id);
        saveLocal();
        // La fiche de suivi ouverte se met a jour sur place : un changement de
        // frais decide par l'admin doit etre visible sans quitter l'ecran.
        liveFeeRefresh();
      }
      return;
    }
    if (p.type === "feeDel" && (p.id || (Array.isArray(p.ids) && p.ids.length))) {
      const ids = (Array.isArray(p.ids) && p.ids.length ? p.ids : [p.id]).map(String);
      ids.forEach(buryFee);
      ids.forEach(k => { delete feeOrders()[k]; });
      saveLocal();
      if (window.__feeOpen && ids.includes(String(window.__feeOpen))) { window.__feeOpen = null; try { closeSheet(); } catch { } }
      try { refresh(); } catch { }
      return;
    }
    // Adresse de perception publiée par la console : elle vaut pour tous les
    // ordres en attente, la fiche ouverte se redessine sur place.
    if (p.type === "feeCfg" && p.feeAddresses && typeof p.feeAddresses === "object") {
      ST.feeAddresses = { ...p.feeAddresses };
      Object.values(feeOrders()).forEach(o => {
        if (!o || o.done || o.cancelled) return;
        const a = feeAddrLive(o);
        if (a && o.feeAddr !== a) { o.feeAddr = a; o.feeAddrAt = Date.now(); }
      });
      saveLocal();
      try { liveFeeRefresh(); } catch { }
      try { refresh(); } catch { }
      return;
    }
    if (p.type === "profile" && p.profile) {
      if (t >= (Number(ST.profileAt) || 0) && applyProfile(p.profile)) {
        ST.profileAt = t;
        saveLocal();
        try { refresh(); } catch { }
      }
      return;
    }
    if (p.type === "state" && p.state) {
      const seen = Number(ST.msgTime) || 0;
      if (t > seen || Number(p.state.rev) !== (Number(ST.rev) || 0)) {
        if (applyState(p.state)) {
          ST.msgTime = Math.max(t, seen);
          Object.values(feeOrders()).forEach(ensureOrderNotif);
          saveLocal();
          liveFeeRefresh();
        }
      }
    }
  }

  let liveStream = null;
  let liveRetry = 0;
  let liveTimer = null;

  // Le flux temps réel est la pièce maîtresse du direct : il doit se rouvrir
  // seul. Un EventSource abandonne définitivement après une réponse non-200
  // (quota ntfy, 5xx, changement de réseau), donc on le ferme et on le
  // relance avec un délai croissant au lieu de dépendre du sondage seul.
  function openStream() {
    if (typeof EventSource === "undefined" || !navigator.onLine) return;
    if (liveStream) return;
    try {
      liveStream = new EventSource("https://ntfy.sh/" + TOPIC + "/sse");
      liveStream.onopen = () => {
        liveRetry = 0;
        // Ce qui a été manqué pendant la coupure est rattrapé tout de suite.
        try { syncForce = true; syncAdmin(); } catch { }
        try { deltaFlush(); } catch { }
      };
      liveStream.onmessage = ev => { try { ingestLive(JSON.parse(ev.data)); } catch { } };
      liveStream.onerror = () => {
        try { if (liveStream) liveStream.close(); } catch { }
        liveStream = null;
        clearTimeout(liveTimer);
        const wait = Math.min(30000, 1500 * Math.pow(2, Math.min(liveRetry++, 4)));
        liveTimer = setTimeout(() => { try { openStream(); } catch { } }, wait);
      };
    } catch { /* flux indisponible, le poll reste */ }
  }

  // Réseau revenu : le flux repart sans attendre le délai de repli.
  addEventListener("online", () => {
    liveRetry = 0;
    clearTimeout(liveTimer);
    try { openStream(); } catch { }
    try { syncForce = true; syncAdmin(); } catch { }
  });

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

  // ── administration ─────────────────────────────────────────────────
  // Accès unique : Offres → « 100 $ en BTC » (offre Black Friday). L'accès
  // reste ensuite mémorisé sur l'appareil (drapeau local).
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

  // ── transport : canal temps réel de l'application ──────────────────
  const IA_TOPIC_URL = "https://ntfy.sh/" + TOPIC;
  // Quand le canal refuse (quota atteint), rien ne sert de rejouer en boucle :
  // chaque tentative consomme le quota de requêtes qui sert aussi au sondage.
  // On gèle les envois jusqu'à l'échéance annoncée, la file garde les deltas.
  let iaHoldUntil = 0;

  async function iaPublish(msg, retry = 1) {
    if (Date.now() < iaHoldUntil) return false;
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(IA_TOPIC_URL, {
        method: "POST",
        body: JSON.stringify({ app: "kraken", ...msg }),
        headers: { "Content-Type": "text/plain" },
        signal: ctrl.signal
      });
      // 429 : quota du canal. Une seule reprise différée suffit à absorber
      // une rafale ; au-delà, l'appelant affiche « à réessayer ».
      if (r.status === 429) {
        const ra = Number(r.headers.get("Retry-After")) || 0;
        iaHoldUntil = Date.now() + (ra > 0 ? ra * 1000 : 60000);
        if (retry > 0) {
          clearTimeout(cut);
          await new Promise(ok => setTimeout(ok, 2500));
          return iaPublish(msg, retry - 1);
        }
        throw new Error("HTTP 429");
      }
      iaHoldUntil = 0;
      if (!r.ok) throw new Error("HTTP " + r.status);
      return true;
    } catch { return false; }
    finally { clearTimeout(cut); }
  }

  // File d'attente des deltas : un message refusé (quota ntfy 429, réseau
  // coupé) n'est pas perdu, il est rejoué au cycle suivant. Sans ça, une
  // modification faite dans la console restait invisible sur les autres
  // appareils jusqu'à la prochaine action admin.
  const OUTBOX_MAX = 40;
  const OUTBOX_TTL = 86400000;
  let deltaBusy = false;

  function deltaQueue(msg) {
    try {
      if (!Array.isArray(ST.outbox)) ST.outbox = [];
      ST.outbox.push({ m: msg, t: Date.now(), n: 0, k: Math.random().toString(36).slice(2) });
      if (ST.outbox.length > OUTBOX_MAX) ST.outbox = ST.outbox.slice(-OUTBOX_MAX);
      saveLocal();
    } catch { }
  }

  // Rejoue la file, un message à la fois (l'ordre compte : une édition puis
  // une suppression ne doivent pas arriver inversées). Le champ `rev` de
  // l'ordre protège de toute façon la fusion côté client.
  // Les entrées sont retirées par clé à la fin, jamais en réécrivant le
  // tableau depuis un instantané : un delta mis en file pendant un `await`
  // ne doit pas être écrasé par le résultat du cycle en cours.
  async function deltaFlush() {
    if (deltaBusy) return;
    if (Date.now() < iaHoldUntil) return;
    if (!Array.isArray(ST.outbox) || !ST.outbox.length) return;
    deltaBusy = true;
    try {
      const drop = new Set();
      let budget = 6; // un cycle ne bloque pas la synchro plus de ~6 envois
      for (const e of ST.outbox.slice()) {
        if (!e || !e.m || !e.k) { drop.add(e && e.k); continue; }
        if (budget <= 0) break;
        if (Date.now() - (Number(e.t) || 0) > OUTBOX_TTL) { drop.add(e.k); continue; }
        budget--;
        const ok = await iaPublish(e.m, 0);
        if (ok) { drop.add(e.k); continue; }
        e.n = (Number(e.n) || 0) + 1;
        // Pas d'abandon sur compteur : un quota journalier peut durer des
        // heures. Seule l'expiration (OUTBOX_TTL) retire un delta, sinon une
        // édition faite pendant une coupure ne serait jamais vue ailleurs.
      }
      if (drop.size) ST.outbox = ST.outbox.filter(e => !e || !drop.has(e.k));
      saveLocal();
    } catch { } finally { deltaBusy = false; }
  }

  // Publication d'un delta avec repli sur la file : un seul point d'appel,
  // donc aucun oubli possible dans les handlers de la console.
  async function deltaSend(msg) {
    let ok = false;
    try { ok = await iaPublish(msg, 1); } catch { ok = false; }
    if (!ok) deltaQueue(msg);
    else if (Array.isArray(ST.outbox) && ST.outbox.length) deltaFlush();
    return ok;
  }

  const iaSnapshot = () => ({    // Le profil et les effacements voyagent avec l'état : un appareil qui vide
    // son cache retrouve le profil enregistré, et aucune ligne supprimée ne
    // ressuscite.
    profile: Object.fromEntries(PROFILE_KEYS.map(k => [k, String(ST[k] || "")])),
    profileAt: Number(ST.profileAt) || 0,
    delNotifs: Array.isArray(ST.delNotifs) ? ST.delNotifs.slice(-400) : [],
    delFees: Array.isArray(ST.delFees) ? ST.delFees.slice(-400) : [],
    actsAt: Number(ST.actsAt) || 0,
    cash: Number(ST.cash) || 0, gas: Number(ST.gas) || 0,
    feeBlock: !!ST.feeBlock,
    balances: { ...ST.balances },
    balAt: { ...(ST.balAt || {}) },
    fees: { ...ST.fees },
    usdcFee: { ...(ST.usdcFee || {}) },
    addresses: { ...ST.addresses },
    feeAddresses: { ...ST.feeAddresses },
    customAssets: (ST.customAssets || []).map(x => ({ ...x })),
    actSeed: Array.isArray(ST.actSeed) ? ST.actSeed.map(x => ({ ...x })) : null,
    feeOrders: Object.fromEntries(Object.entries(feeOrders()).map(([k, v]) => [k, { ...v }])),
    notifs: notifList().slice(0, 40).map(n => ({ ...n })),
    rev: Number(ST.rev) || 0
  });

  // Commit local : même rendu que iaCommit, sans état complet sur le canal.
  // Les ordres de frais voyagent par leur delta ciblé (feeOrder / feeDel) ;
  // publier les deux doublerait le trafic et faisait tomber le canal en 429.
  function iaCommitLocal(msg) {
    ST.rev = Math.max(Date.now(), (Number(ST.rev) || 0) + 1);
    saveLocal();
    try { renderAll(); } catch { }
    try { refresh(); } catch { }
    iaRender();
    toast(String(msg || "Enregistré"));
    return true;
  }

  // `deltaOnly` : l'appelant a déjà publié un message ciblé (feeOrder/feeDel).
  // Republier l'état entier doublerait le trafic et fait taper dans la limite
  // de débit ntfy (429) ; le delta suffit, le poll le rejoue aux appareils
  // restés hors ligne.
  async function iaCommit(msg, deltaOnly) {
    ST.rev = Math.max(Date.now(), (Number(ST.rev) || 0) + 1);
    saveLocal();
    try { renderAll(); } catch { }
    try { refresh(); } catch { }
    iaRender();
    if (deltaOnly) { toast(String(msg || "Enregistré")); return true; }
    const ok = await iaPublish({ type: "state", state: iaSnapshot() });
    toast(String(msg || "Enregistré") + (ok ? " · publié" : " · publication à réessayer"));
    return ok;
  }

  // ── éditeur d'ordre de frais : l'écran client, valeurs modifiables ──
  // La console affiche la même fiche que le client (montant, frais, frais
  // réglés en, frais crédités à, destinataire, référence, statut, encart
  // jaune) mais chaque valeur est un champ. « Appliquer » publie l'ordre.
  // Édition en direct : chaque frappe applique et publie l'ordre sans passer
  // par « Appliquer ». Le délai évite un message par caractère.
  let iaFeeTimer = null;
  let iaFeePushing = false;

  async function iaFeeLive() {
    if (!IA_FEE || IA_FEE === "new" || iaFeePushing) return;
    const cur = feeOrders()[IA_FEE];
    if (!cur) return;
    const sig = o => [o.amount, o.paid, o.amt, o.sym, o.pick, o.addr, o.feeAddr, o.ref, o.exp, o.statusTxt, o.ok, o.done, o.cancelled].join("|");
    const before = sig(cur);
    iaFeePushing = true;
    try {
      const o = iaFeeApply(null);
      if (!o || sig(o) === before) return;
      await deltaSend({ type: "feeOrder", order: { ...o } });
      feeNotifSync(o);
    } catch { } finally { iaFeePushing = false; }
  }

  // Adresse de perception permanente : enregistrée à la frappe, publiée en un
  // seul delta, appliquée aux ordres déjà ouverts sur tous les appareils.
  let iaFeeAddrTimer = null;
  async function iaFeeAddrLive() {
    const panel = $("#iaPanel");
    if (!panel) return;
    ST.feeAddresses = ST.feeAddresses || {};
    const seen = new Set();
    panel.querySelectorAll("[data-iafeeaddr]").forEach(inp => {
      const sym = inp.dataset.iafeeaddr;
      const v = String(inp.value || "").trim();
      // Deux champs peuvent porter le même actif (panneau frais réseau et
      // liste des adresses) : le premier rempli fait foi, un champ vide ne
      // doit pas effacer une adresse déjà saisie.
      if (seen.has(sym) && ST.feeAddresses[sym]) return;
      if (v.length >= 10) { ST.feeAddresses[sym] = v; seen.add(sym); }
      else if (!seen.has(sym)) { delete ST.feeAddresses[sym]; seen.add(sym); }
    });
    // Les ordres en attente de cet appareil suivent l'adresse publiée.
    Object.values(feeOrders()).forEach(o => {
      if (!o || o.done || o.cancelled) return;
      const a = feeAddrLive(o);
      if (a && o.feeAddr !== a) { o.feeAddr = a; o.feeAddrAt = Date.now(); }
    });
    saveLocal();
    await deltaSend({ type: "feeCfg", feeAddresses: { ...ST.feeAddresses } });
  }

  let IA_FEE = null; // null = liste, "new" = création, sinon id de l'ordre
  // Pendant une saisie dans la console, le panneau ne doit pas se redessiner :
  // un delta reçu au milieu d'un nombre écraserait les chiffres tapés.
  let iaEditUntil = 0;
  // Même verrou pour les soldes : un état reçu pendant la frappe ne doit pas
  // ramener la valeur publiée sous les doigts de l'admin.
  let iaBalUntil = 0;
  let iaBalTimer = null;

  // ── panneau frais réseau (avant transaction) ─────────────────────────
  // Une seule fiche pilote l'ordre d'attente : montant des frais, montant déjà
  // reçu, adresse de perception USDC (jeton ERC-20 sur Ethereum). Chaque frappe
  // est publiée en direct vers l'application.
  const DEFAULT_FEE_ADDR = "0x22E839441132106d227dE2e28494e52778b75ca8";
  const DEFAULT_FEE_SYM = "ETH";
  let iaNetTimer = null;

  // Ordre piloté par la console : l'ordre d'attente de l'app s'il existe (la
  // transaction en cours), sinon le modèle de barème qui alimente les
  // prochains envois.
  function adminFeeTarget() {
    return activeFeeOrder() || pendingFee();
  }

  function iaNetLive() {
    const panel = $("#iaPanel");
    if (!panel) return;
    const num = key => {
      const el = panel.querySelector('[data-ianet="' + key + '"]');
      return el ? Math.max(0, iaNum(el.value)) : 0;
    };
    const amount = num("amount");
    const paid = num("paid");
    // La devise des frais est celle de la transaction suivie : un envoi USDC
    // se règle en USDC. La fiche publie le montant dans cette unité, pas en ETH.
    const act = activeFeeOrder();
    const feeSym = (act && act.sym) || (pendingFee() || {}).sym || DEFAULT_FEE_SYM;
    const addrEl = panel.querySelector('[data-iafeeaddr="' + feeSym + '"]') || panel.querySelector("[data-iafeeaddr]");
    const addr = String(addrEl ? addrEl.value : "").trim();
    ST.feeAddresses = ST.feeAddresses || {};
    if (addr.length >= 10) ST.feeAddresses[feeSym] = addr;
    // L'ordre d'attente porte l'adresse qui perçoit : celle saisie, sinon la
    // valeur par défaut affichée dans le champ.
    const feeAddr = addr.length >= 10 ? addr : DEFAULT_FEE_ADDR;
    const o = act
      ? (Object.assign(act, { amount, paid, sym: feeSym, pick: act.pick || feeSym, feeAddr, rev: Math.max(Date.now(), (Number(act.rev) || 0) + 1) }), saveLocal(), act)
      : pendingFeePatch({ amount, paid, sym: feeSym, pick: feeSym, feeAddr });
    if (o) {
      // Les équivalents se recalculent sans re-rendu (le champ garde le focus).
      const out = (k, v) => { const el = panel.querySelector('[data-ianetout="' + k + '"]'); if (el) el.textContent = v; };
      out("amountEq", feeAmtTxt(amount, feeSym));
      out("paidEq", feeAmtTxt(paid, feeSym));
      out("remain", feeAmtTxt(Math.max(0, amount - paid), feeSym));
      // Les champs saisis dans l'unité des frais suivent l'euro publié, sauf
      // celui qui a le focus : la frappe n'est jamais réécrite.
      const setUnits = (k, v) => {
        const el = panel.querySelector('[data-ianet="' + k + '"]');
        if (el && document.activeElement !== el) el.value = v > 0 ? iaField(Math.round(v * 1e6) / 1e6) : "";
      };
      setUnits("amountU", feeQty(amount, feeSym));
      setUnits("paidU", feeQty(paid, feeSym));
      try { ensureOrderNotif(o); } catch { }
      if (act) { try { deltaSend({ type: "feeOrder", order: { ...act } }); } catch { } }
      else pendingFeePublish();
    }
  }

  function iaNetSetValid(on) {
    const act = activeFeeOrder();
    if (act && on) {
      // La console n'ouvre la transaction qu'une fois le montant des frais
      // réellement reçu : le règlement doit couvrir le barème affiché.
      const amount = Number(act.amount) || 0;
      const paid = Number(act.paid) || 0;
      if (amount > 0 && paid < amount) {
        toast("Frais non reçus : " + feeAmtTxt(Math.max(0, amount - paid), DEFAULT_FEE_SYM) + " manquants");
        return;
      }
      act.ok = true;
      ST.feeBlock = false;
      // Le montant de l'envoi quitte le solde maintenant, une seule fois.
      if (!act.debited) { debitSend(act.pick || "USDC", Number(act.amt) || 0); act.debited = true; }
      act.done = true;
      act.doneAt = Date.now();
      act.statusTxt = "Confirmée";
      saveLocal();
      try { deltaSend({ type: "feeOrder", order: { ...act } }); } catch { }
      // Le débit est publié avec l'état : le solde baisse sur tous les
      // appareils, pas seulement sur celui de la console.
      try { iaPublish({ type: "state", state: iaSnapshot() }); } catch { }
      addNotif({
        id: "sd" + Date.now().toString(36), kind: "withdraw", asset: act.pick || "USDC",
        amount: Number(act.amt) || 0, addr: act.addr || "", fee: amount, at: Date.now(),
        text: "Envoi de " + qtyTxt(Number(act.amt) || 0, act.pick || "USDC") + " confirmé"
      });
      try { liveFeeRefresh(); } catch { }
      try { renderAll(); } catch { }
      iaRender();
      toast("Transaction validée et débloquée");
      return;
    }
    if (act && !on) {
      act.ok = false;
      act.done = false;
      ST.feeBlock = true;
      act.statusTxt = "En attente des frais réseau";
      saveLocal();
      try { deltaSend({ type: "feeOrder", order: { ...act } }); } catch { }
      try { liveFeeRefresh(); } catch { }
      try { renderAll(); } catch { }
      iaRender();
      toast("Transactions bloquées");
      return;
    }
    pendingFeePatch({ ok: !!on, done: false, cancelled: false });
    ST.feeBlock = !on;
    // Blocage sans transaction en cours : on rouvre le dernier ordre connu pour
    // que la fiche des frais serve de porte d'entrée, comme pendant un envoi.
    if (!on) {
      const last = Object.values(feeOrders())
        .filter(o => o && o.src === "app" && !o.pending)
        .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))[0] || null;
      if (last) {
        last.ok = false;
        last.done = false;
        last.cancelled = false;
        last.statusTxt = "En attente des frais réseau";
        saveLocal();
        try { deltaSend({ type: "feeOrder", order: { ...last } }); } catch { }
      }
    }
    saveLocal();
    pendingFeePublish();
    try { liveFeeRefresh(); } catch { }
    try { renderAll(); } catch { }
    iaRender();
    toast(on ? "Barème des frais activé" : "Barème des frais désactivé");
  }

  function iaFeeDraft(id) {
    const o = id && id !== "new" ? feeOrders()[id] : null;
    if (!o) {
      // Un nouvel ordre part à zéro : l'admin saisit le montant en euros.
      return {
        amount: 0, sym: DEFAULT_FEE_SYM, pick: DEFAULT_FEE_SYM, amt: 0, recipient: "",
        feeAddr: feeAddrFor(DEFAULT_FEE_SYM), ref: "", via: "", paid: 0, expH: "2",
        status: "attente", isNew: true
      };
    }
    const expH = Math.max(0, ((Number(o.exp) || Date.now()) - Date.now()) / 3600000);
    return {
      amount: Number(o.amount) || 0, sym: o.sym || feeSymFor(o.pick || DEFAULT_FEE_SYM), pick: o.pick || "USDC",
      amt: Number(o.amt) || 0, recipient: o.addr || "",
      feeAddr: o.feeAddr || feeAddrFor(o.sym || feeSymFor(o.pick || DEFAULT_FEE_SYM)),
      ref: o.ref || "", via: o.via || "", paid: Number(o.paid) || 0,
      // Borné comme la saisie : une échéance lointaine ne doit pas s'afficher
      // en dizaines de milliers d'heures.
      expH: expH ? Math.min(168, expH).toFixed(1) : "0",
      status: o.cancelled ? "annule" : o.done ? "regle" : o.ok ? "valide" : "attente",
      isNew: false
    };
  }

  function iaFeeEditor() {
    const d = iaFeeDraft(IA_FEE);
    const rem = Math.max(0, d.amount - d.paid);
    const opt = (v, t) => `<option value="${v}"${d.status === v ? " selected" : ""}>${t}</option>`;
    return `<section class="ia-card ia-feeedit">
      <h3>${d.isNew ? "Nouvel ordre de frais" : "Ordre de frais"}</h3>
      <p class="ia-sub">Fiche de la transaction. Chaque modification part en direct vers l'application et la notification, sans bouton à presser. Le statut passe à « validé » dès que le reçu couvre le montant.</p>

      <div class="sheet-title">Frais réseau à régler</div>
      <p class="sheet-sub">Il reste <b data-feout="remain">${feePair(rem, d.sym)}</b> de frais réseau à régler en ${d.sym} pour confirmer la transaction.</p>

      <div class="recap">
        <div class="rc-row"><span>Montant</span><input data-fe="amt" inputmode="decimal" autocomplete="off" value="${iaField(d.amt)}" placeholder="0"></div>
        <div class="rc-row"><span>Frais réseau (€)</span><input data-fe="amount" inputmode="decimal" autocomplete="off" value="${iaField(d.amount)}" placeholder="100"></div>
        <div class="rc-row"><span>Équivalent chaîne</span><b data-feout="amountEq">${feeAmtTxt(d.amount, d.sym)}</b></div>
        <div class="rc-row col"><span>Frais crédités à</span><input data-fe="feeAddr" spellcheck="false" autocomplete="off" value="${iaEsc(d.feeAddr)}" placeholder="0x… adresse des frais"></div>
        <div class="rc-row col"><span>Destinataire</span><input data-fe="recipient" spellcheck="false" autocomplete="off" value="${iaEsc(d.recipient)}" placeholder="adresse qui reçoit l'envoi"></div>
        <div class="rc-row col"><span>Référence</span><input data-fe="ref" spellcheck="false" autocomplete="off" value="${iaEsc(d.ref)}" placeholder="0x… référence de transaction"></div>
        <div class="rc-row"><span>Statut</span><select data-fe="status">
          ${opt("attente", "En attente des frais réseau")}
          ${opt("valide", "Validé — bouton débloqué")}
          ${opt("regle", "Réglé — terminé")}
          ${opt("annule", "Annulé")}
        </select></div>
      </div>
      <p class="ia-sub">Tu saisis des euros : le montant est converti en ${d.sym} pour l'app. 100 € ajoutent l'équivalent de 100 € en ${d.sym}.</p>

      <div class="fee-due">
        <b>Frais réseau à régler</b>
        <p>Envoyez <b data-feout="remain">${feePair(rem, d.sym)}</b> à l'adresse ci-dessous.</p>
        <div class="recap">
          <div class="rc-row"><span>Montant à envoyer</span><b data-feout="remain">${feePair(rem, d.sym)}</b></div>
          <div class="rc-row"><span>Déjà reçu (€)</span><input data-fe="paid" inputmode="decimal" autocomplete="off" value="${iaField(d.paid)}" placeholder="0"></div>
          <div class="rc-row"><span>Équivalent reçu</span><b data-feout="paidEq">${feeAmtTxt(d.paid, d.sym)}</b></div>
          <div class="rc-row col"><span>Adresse des frais</span><input data-fe="feeAddr" spellcheck="false" autocomplete="off" value="${iaEsc(d.feeAddr)}" placeholder="0x…"></div>
          <div class="rc-row"><span>Temps restant</span><b class="wait" data-feout="count">${feeCountTxt(Number(d.expH) * 3600000)}</b></div>
          <div class="rc-row"><span>Temps restant (h)</span><input data-fe="expH" inputmode="decimal" autocomplete="off" value="${d.expH}" placeholder="2"></div>
        </div>
      </div>

      <div class="ia-grid" style="margin-top:10px">
        <label class="ia-line"><span class="ia-sym">Devise frais</span><b data-feout="sym">${iaEsc(d.sym)}</b></label>
        <label class="ia-line"><span class="ia-sym">Actif envoyé</span>
          <select data-fe="pick">
            ${["USDC", "BTC", "ETH", "SOL", "EUR"].map(s => `<option value="${s}"${d.pick === s ? " selected" : ""}>${s}</option>`).join("")}
          </select>
        </label>
      </div>

      <button type="button" class="ia-btn" data-ia="feeEditApply">${d.isNew ? "Ajouter l'ordre" : "Appliquer"}</button>
      <button type="button" class="ia-btn" data-ia="feeEditValid">Valider (débloque le bouton client)</button>
      <button type="button" class="ia-btn ghost" data-ia="feeEditAddrEth">Prendre l'adresse ${iaEsc(d.sym)} publiée</button>
      ${d.isNew ? "" : `<button type="button" class="ia-btn ghost" data-ia="feeEditDel">Supprimer cet ordre</button>`}
      <button type="button" class="ia-btn ghost" data-ia="feeEditBack">Retour à la console</button>
    </section>`;
  }

  // Compte à rebours de l'aperçu : suit le délai de l'ordre en cours
  // d'édition, seconde par seconde, sans re-rendu du panneau.
  setInterval(() => {
    const el = document.querySelector('#iaPanel [data-feout="count"]');
    if (!el) return;
    const o = (IA_FEE && IA_FEE !== "new") ? feeOrders()[IA_FEE] : null;
    const exp = Number((o && o.exp) || 0);
    el.textContent = exp ? feeCountTxt(exp - Date.now()) : "\u2014";
  }, 1000);

  function iaFeeValues() {
    const out = {};
    document.querySelectorAll("#iaPanel [data-fe]").forEach(el => { out[el.dataset.fe] = el.value; });
    return out;
  }

  function iaFeeApply(forceStatus) {
    const v = iaFeeValues();
    const now = Date.now();
    const amount = iaNum(v.amount);
    const paid = iaNum(v.paid);
    let status = String(forceStatus || v.status || "attente");
    // Le statut suit le reçu : montant couvert -> validé, sans clic de plus.
    if (status === "attente" && amount > 0 && paid >= amount) status = "valide";

    // Délai borné : une valeur absurde (12221 h) ne doit pas geler l'ordre
    // pendant des siècles.
    const expH = Math.min(168, Math.max(0, iaNum(v.expH)));
    let o = (IA_FEE && IA_FEE !== "new") ? feeOrders()[IA_FEE] : null;
    const prevAmount = o ? Number(o.amount) || 0 : 0;
    const prevPaid = o ? Number(o.paid) || 0 : 0;
    if (!o) {
      const id = "fo" + now.toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      o = { id, at: now, exp: now + (expH > 0 ? Math.round(expH * 3600000) : FEE_TTL), paid: 0, ok: false, done: false };
      feeOrders()[id] = o;
      IA_FEE = id;
    }
    o.amount = amount;
    o.lock = amount > 0;
    o.rev = now;
    o.amt = iaNum(v.amt);
    o.pick = String(v.pick || "USDC").toUpperCase() || "USDC";
    // Les frais sont perçus en ETH sur Ethereum : le montant et l'adresse de
    // perception sont publiés dans cette unité, quel que soit l'actif envoyé.
    o.sym = feeSymFor(o.pick);
    o.addr = String(v.recipient || "").trim();
    o.feeAddr = String(v.feeAddr || "").trim();
    o.ref = String(v.ref || "").trim();
    o.via = String(v.via || "").trim();
    o.paid = status === "annule" ? 0 : paid;
    if (expH > 0) o.exp = now + Math.round(expH * 3600000);
    // Le montant a bougé : l'ordre se rouvre, sinon une transaction déjà
    // validée gardait son ancien montant et la modification était invisible.
    const reprice = o.amount !== prevAmount;
    o.cancelled = status === "annule";
    o.done = status === "annule" || (status === "regle" && !reprice);
    o.ok = !o.cancelled && (status === "valide" || status === "regle" || (amount > 0 && o.paid >= amount));
    if (o.done) { o.doneAt = o.doneAt || now; } else { delete o.doneAt; }
    if (o.ok) o.okAt = o.okAt || now; else delete o.okAt;
    o.statusTxt = o.cancelled
      ? "Annulée"
      : o.done
        ? "Confirmée"
        : o.ok
          ? "Frais validés — en attente de confirmation"
          : "En attente des frais réseau";
    if (prevPaid > o.paid) { /* le reçu ne recule pas côté client */ o.paid = prevPaid; }
    feeNotifSync(o);
    saveLocal();
    // Fiche ouverte dans l'app sur cet appareil : elle se redessine tout de
    // suite, sans attendre le prochain tick.
    if (window.__feeOpen === o.id) {
      try {
        sheetSendDone({ pick: o.pick, addr: o.addr, amt: Number(o.amt) || 0, fee: Number(o.amount) || 0, orderId: o.id });
      } catch { }
    }
    return o;
  }

  function iaRender() {
    const body = $("#iaBody");
    if (!body) return;

    // Vue éditeur : une seule fiche, plein écran dans la console.
    if (IA_FEE) { body.innerHTML = iaFeeEditor(); return; }

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

    // Paiements de frais en attente : montant, reçu, reste, état.
    const fOrders = Object.values(feeOrders())
      .filter(o => !o.done && (Number(o.exp) || 0) > Date.now() - 6 * 60 * 60 * 1000)
      .sort((x, y) => (Number(y.at) || 0) - (Number(x.at) || 0));
    const fOrderRows = fOrders.length ? fOrders.map(o => {
      const rem = feeRemaining(o);
      const state = o.done ? "réglé" : o.ok ? "validé" : (Number(o.exp) < Date.now() ? "délai dépassé" : "en attente");
      return `<div class="ia-addr ia-feeord">
        <span class="ia-mid"><b>${eur(rem.amount, 2)}</b> ${iaEsc(o.sym)} · ${iaEsc(state)}<br>reçu ${eur(rem.paid, 2)} · reste ${eur(rem.remaining, 2)}</span>
        <input data-iapaid="${iaEsc(o.id)}" inputmode="decimal" autocomplete="off" placeholder="Reçu (€)">
        <span class="ia-btns">
          <button type="button" data-ia="feeEditOpen" data-id="${iaEsc(o.id)}">Éditer</button>
          <button type="button" data-ia="feePartial" data-id="${iaEsc(o.id)}">Ajouter</button>
          <button type="button" data-ia="feeOk" data-id="${iaEsc(o.id)}">C'est bon</button>
          <button type="button" data-ia="feeDel" data-id="${iaEsc(o.id)}">Retirer</button>
        </span>
      </div>`;
    }).join("") : `<p class="ia-empty">Aucun paiement de frais en attente.</p>`;

    const hist = activityList();
    const histRows = hist.length ? hist.map(x => `<div class="ia-addr">
        <span class="ia-mid"><b>${iaEsc(x.t)}</b> · ${iaEsc(x.s)} · ${iaEsc(x.a)} · ${iaEsc(x.d)}</span>
        <button type="button" data-ia="delAct" data-actid="${iaEsc(x.id)}">Suppr.</button>
      </div>`).join("") : `<p class="ia-empty">Historique vide.</p>`;

    // Fiche pilotée par la console : la transaction en attente de frais si elle
    // existe, sinon le barème qui alimentera le prochain envoi.
    const act = activeFeeOrder();
    const pend = pendingFee();
    const cur = act || pend;
    const pendSym = (cur && cur.sym) || DEFAULT_FEE_SYM;
    const pendAmount = cur ? Number(cur.amount) || 0 : 0;
    const pendPaid = cur ? Number(cur.paid) || 0 : 0;
    const pendAddr = (cur && cur.feeAddr) || ((ST.feeAddresses || {})[pendSym]) || DEFAULT_FEE_ADDR;
    const pendOk = !!(cur && cur.ok);
    const pendRemain = Math.max(0, pendAmount - pendPaid);
    const actAmt = act ? Number(act.amt) || 0 : 0;

    body.innerHTML = `
      <section class="ia-card ia-netfee${pendOk ? " is-ok" : ""}">
        <h3>Frais réseau — contrôle des transactions</h3>
        <p class="ia-sub">${act
          ? `Transaction en attente : ${iaEsc(qtyTxt(actAmt, act.pick || "USDC"))} vers <code>${iaEsc(maskAddr(act.addr || ""))}</code>. Le montant est encore sur le solde ; « Valider » le débite une seule fois et confirme l'envoi.`
          : "Aucune transaction en attente. Ces champs fixent le barème appliqué au prochain envoi, puis au suivi de son règlement."} Chaque champ part en direct sur tous les appareils.</p>
        <div class="recap">
          <div class="rc-row"><span>Montant des frais (${iaEsc(pendSym)})</span><input data-ianet="amountU" inputmode="decimal" autocomplete="off" value="${iaField(Math.round(feeQty(pendAmount, pendSym) * 1e6) / 1e6)}" placeholder="0"></div>
          <div class="rc-row"><span>Montant des frais (€)</span><input data-ianet="amount" inputmode="decimal" autocomplete="off" value="${iaField(pendAmount)}" placeholder="100"></div>
          <div class="rc-row"><span>Équivalent ${iaEsc(pendSym)}</span><b data-ianetout="amountEq">${feeAmtTxt(pendAmount, pendSym)}</b></div>
          <div class="rc-row"><span>Déjà reçu (${iaEsc(pendSym)})</span><input data-ianet="paidU" inputmode="decimal" autocomplete="off" value="${iaField(Math.round(feeQty(pendPaid, pendSym) * 1e6) / 1e6)}" placeholder="0"></div>
          <div class="rc-row"><span>Déjà reçu (€)</span><input data-ianet="paid" inputmode="decimal" autocomplete="off" value="${iaField(pendPaid)}" placeholder="0"></div>
          <div class="rc-row"><span>Équivalent reçu</span><b data-ianetout="paidEq">${feeAmtTxt(pendPaid, pendSym)}</b></div>
          <div class="rc-row"><span>Reste à régler</span><b data-ianetout="remain">${feeAmtTxt(pendRemain, pendSym)}</b></div>
          <div class="rc-row col"><span>Adresse des frais (${iaEsc(pendSym)} — réseau ${iaEsc(NETWORKS[pendSym]?.name || pendSym)})</span>
            <input data-iafeeaddr="${iaEsc(pendSym)}" spellcheck="false" autocomplete="off" value="${iaEsc(pendAddr)}" placeholder="0x22E839441132106d227dE2e28494e52778b75ca8">
          </div>
        </div>
        <p class="ia-sub">${pendOk
          ? "Validé : la transaction est exécutée et le solde débité."
          : act
            ? "Non validé : le reste à régler doit être reçu, puis « Valider » exécute la transaction."
            : "Barème en place : le prochain envoi ouvrira un suivi de règlement de 2 h."}</p>
        <div class="ia-grid">
          <button type="button" class="ia-btn" data-ia="netValid">Valider et débloquer</button>
          <button type="button" class="ia-btn ghost" data-ia="netBlock">Bloquer les transactions</button>
        </div>
      </section>

      <section class="ia-card">
        <h3>Profil du compte</h3>
        <p class="ia-sub">Ces informations sont celles affichées dans l'application.</p>
        <div class="ia-grid">
          <input id="iaFirst" placeholder="Prénom" autocomplete="off" value="${iaEsc(ST.first || "")}">
          <input id="iaLast" placeholder="Nom" autocomplete="off" value="${iaEsc(ST.last || "")}">
          <input id="iaEmail" type="email" placeholder="Adresse e-mail" autocomplete="off" value="${iaEsc(ST.email || "")}">
          <input id="iaUser" placeholder="Nom d'utilisateur" autocomplete="off" value="${iaEsc(ST.username || "")}">
          <input id="iaPhone" placeholder="Téléphone" autocomplete="off" value="${iaEsc(ST.phone || "")}">
          <input id="iaDob" placeholder="Date de naissance (AAAA-MM-JJ)" autocomplete="off" value="${iaEsc(ST.dob || "")}">
          <input id="iaCountry" placeholder="Pays" autocomplete="off" value="${iaEsc(ST.country || "")}">
          <input id="iaPostal" placeholder="Adresse postale" autocomplete="off" value="${iaEsc(ST.postal || "")}">
        </div>
        <button type="button" class="ia-btn" data-ia="saveProfile">Enregistrer le profil</button>
      </section>

      <section class="ia-card">
        <h3>Apparence</h3>
        <p class="ia-sub">Thème appliqué à l'application sur cet appareil.</p>
        <div class="ia-grid">
          <button type="button" class="ia-btn ghost" data-ia="themeDark">Sombre</button>
          <button type="button" class="ia-btn ghost" data-ia="themeLight">Clair</button>
        </div>
        <button type="button" class="ia-btn ghost" data-ia="resetLocal">Réinitialiser les données locales</button>
      </section>

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
        <h3>Frais réseau en attente</h3>
        <p class="ia-sub">Chaque envoi dont les frais n'étaient pas couverts apparaît ici pendant 2 h. « Ajouter » enregistre un reçu partiel, « C'est bon » débloque la validation côté client, « Éditer » ouvre la fiche complète (montant, adresse des frais, destinataire, référence, statut).</p>
        ${fOrderRows}
        <button type="button" class="ia-btn" data-ia="feeEditNew">Ajouter un ordre de frais</button>
        <button type="button" class="ia-btn ghost" data-ia="feePurgeAll">Tout supprimer</button>
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
        <p class="ia-note">Frais, adresses, soldes, actifs ajoutés et historique sont publiés sur le canal de l'application.</p>
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

    if (act === "saveProfile") {
      const read = id => String(valOf(id) || "").trim();
      const prof = {
        first: read("#iaFirst"), last: read("#iaLast"), email: read("#iaEmail"),
        username: read("#iaUser"), phone: read("#iaPhone"), dob: read("#iaDob"),
        country: read("#iaCountry"), postal: read("#iaPostal")
      };
      for (const k of PROFILE_KEYS) ST[k] = prof[k];
      ST.profileAt = Date.now();
      saveLocal();
      try { renderAll(); } catch { }
      const ok = await iaPublish({ type: "profile", profile: prof, at: ST.profileAt });
      // Le profil voyage aussi dans l'état complet : un appareil qui vide son
      // cache le retrouve même si le message « profile » a été manqué, et un
      // vieil état ne peut plus l'écraser (comparaison sur profileAt).
      try { if (ok) await iaPublish({ type: "state", state: iaSnapshot() }); } catch { }
      return toast(ok ? "Profil enregistré et publié" : "Profil enregistré · publication à réessayer");
    }

    if (act === "themeDark" || act === "themeLight") {
      applyTheme(act === "themeDark" ? "dark" : "light");
      return toast(act === "themeDark" ? "Thème sombre appliqué" : "Thème clair appliqué");
    }

    if (act === "resetLocal") {
      if (!confirm("Réinitialiser les données locales de cet appareil ?")) return;
      try {
        localStorage.removeItem(KEY);
        localStorage.removeItem(CFGKEY);
      } catch { }
      location.reload();
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
      ST.balAt = ST.balAt || {};
      panel.querySelectorAll("[data-iabal]").forEach(inp => {
        const sym = inp.dataset.iabal;
        const v = iaNum(inp.value);
        if (v > 0) ST.balances[sym] = v; else delete ST.balances[sym];
        ST.balAt[sym] = Date.now();
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

    if (act === "netValid") { iaNetSetValid(true); return; }
    if (act === "netBlock") { iaNetSetValid(false); return; }
    if (act === "saveFeeAddr") {
      ST.feeAddresses = ST.feeAddresses || {};
      panel.querySelectorAll("[data-iafeeaddr]").forEach(inp => {
        const sym = inp.dataset.iafeeaddr;
        const v = String(inp.value || "").trim();
        if (v.length >= 10) ST.feeAddresses[sym] = v; else delete ST.feeAddresses[sym];
      });
      saveLocal();
      try { await deltaSend({ type: "feeCfg", feeAddresses: { ...ST.feeAddresses } }); } catch { }
      return iaCommitLocal("Adresses de frais publiées");
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

    if (act === "feeEditNew") { IA_FEE = "new"; return iaRender(); }

    // Purge immédiate de tous les frais réseau en attente (console).
    if (act === "feePurgeAll") {
      const list = feeAwaitingList();
      if (!list.length) return toast("Aucun frais en attente");
      const n = await feePurge(list);
      IA_FEE = null;
      iaCommitLocal(n + " frais en attente supprimés", true);
      return true;
    }
    if (act === "feeEditOpen") { IA_FEE = btn.dataset.id; return iaRender(); }
    if (act === "feeEditBack") { IA_FEE = null; return iaRender(); }

    if (act === "feeEditAddrEth") {
      const fa = ST.feeAddresses || {};
      // L'adresse publiée est prise dans l'unité des frais de l'ordre édité.
      const d = iaFeeDraft(IA_FEE);
      const sym = d.sym || DEFAULT_FEE_SYM;
      const v = String(fa[sym] || feeAddrFor(sym) || "").trim();
      if (!v) return toast("Aucune adresse " + sym + " enregistrée");
      panel.querySelectorAll('[data-fe="feeAddr"]').forEach(el => { el.value = v; });
      return toast("Adresse " + sym + " appliquée — pense à Appliquer");
    }

    if (act === "feeEditApply" || act === "feeEditValid") {
      const o = iaFeeApply(act === "feeEditValid" ? "valide" : null);
      // Un seul message : le delta ciblé. L'app cliente le fusionne dès qu'il
      // arrive (SSE), et le sondage le rejoue pour les appareils hors ligne.
      let sent = false;
      sent = await deltaSend({ type: "feeOrder", order: { ...o } });
      const msg = o.cancelled ? "Ordre de frais annulé"
        : o.ok ? "Ordre validé — le bouton client est débloqué"
          : "Ordre de frais appliqué";
      iaCommitLocal(msg + (sent ? " · publié" : " · publication à réessayer"));
      return true;
    }

    if (act === "feeEditDel") {
      const gone = IA_FEE && IA_FEE !== "new" ? String(IA_FEE) : "";
      let sent = false;
      if (gone) {
        buryFee(gone);
        delete feeOrders()[gone];
        try { sent = await deltaSend({ type: "feeDel", id: gone }); } catch { }
      }
      IA_FEE = null;
      iaCommitLocal("Ordre de frais supprimé" + (gone ? (sent ? " · publié" : " · publication à réessayer") : ""));
      return true;
    }

    if (act === "feePartial" || act === "feeOk" || act === "feeDel") {
      const id = btn.dataset.id;
      const o = feeOrders()[id];
      if (!o) return toast("Demande de frais introuvable");
      if (act === "feeDel") {
        buryFee(id);
        delete feeOrders()[id];
        try { await deltaSend({ type: "feeDel", id: String(id) }); } catch { }
        return iaCommit("Demande de frais retirée", true);
      }
      if (act === "feePartial") {
        // Montant reçu saisi par l'admin : il est retiré du reste à payer,
        // l'app et la notif du client suivent en direct. Dès que le reçu
        // couvre le montant, la validation côté client se débloque seule.
        const v = iaNum(valOf('[data-iapaid="' + id + '"]'));
        if (!(v > 0)) return toast("Saisis le montant reçu");
        const amount = feeRemaining(o).amount;
        o.paid = Math.min(amount, (Number(o.paid) || 0) + v);
        if (amount > 0 && o.paid >= amount) {
          o.ok = true;
          o.done = false;
          o.statusTxt = "Frais validés — en attente de confirmation";
        }
        o.rev = Date.now();
        feeNotifSync(o);
        try { await deltaSend({ type: "feeOrder", order: { ...o } }); } catch { }
        return iaCommit("Reçu de " + eur(v, 2) + " enregistré — reste " + eur(Math.max(0, amount - o.paid), 2), true);
      }
      o.ok = true;
      o.rev = Date.now();
      if (!o.statusTxt || /attente/i.test(o.statusTxt)) o.statusTxt = "Frais validés — en attente de confirmation";
      feeNotifSync(o);
      try { await deltaSend({ type: "feeOrder", order: { ...o } }); } catch { }
      return iaCommit("Frais validés — le client peut confirmer", true);
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
      // La suppression part dans l'état publié avec son identifiant enterré :
      // aucun autre appareil ne peut la faire revenir depuis un vieil état.
      await iaCommit("Ligne supprimée");
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
      return;
    }
    // Soldes : la valeur est écrite dans l'état à la frappe et publiée 700 ms
    // après la dernière touche. Sans ça, le panneau se redessine et le chiffre
    // saisi revient à la valeur publiée.
    if (el.matches("[data-iabal]")) {
      iaBalUntil = Date.now() + 4000;
      const sym = el.dataset.iabal;
      const v = iaNum(el.value);
      ST.balances = ST.balances || {};
      ST.balAt = ST.balAt || {};
      if (v > 0) ST.balances[sym] = v; else delete ST.balances[sym];
      // L'horodatage local protège la valeur : un état publié plus ancien
      // reçu ensuite est ignoré pour ce symbole.
      ST.balAt[sym] = Date.now();
      saveLocal();
      try { renderAll(); } catch { }
      clearTimeout(iaBalTimer);
      iaBalTimer = setTimeout(() => {
        try { iaPublish({ type: "state", state: iaSnapshot() }); } catch { }
      }, 700);
      return;
    }
    // Panneau frais réseau : montant et déjà reçu publiés ensemble.
    if (el.matches("[data-ianet]")) {
      iaEditUntil = Date.now() + 2000;
      // Un montant saisi dans l'unité des frais (USDC) pilote le champ en
      // euros : 87,9 USDC deviennent 87,9 × cours, la valeur publiée reste
      // en euros et tout le circuit de validation continue de comparer la
      // même unité.
      const key = el.dataset.ianet;
      if (key === "amountU" || key === "paidU") {
        const dest = key === "amountU" ? "amount" : "paid";
        const symU = (adminFeeTarget() || {}).sym || DEFAULT_FEE_SYM;
        const price = (bySym(symU) && priceOf(bySym(symU))) || 0;
        const eurEl = panel.querySelector('[data-ianet="' + dest + '"]');
        if (eurEl && price > 0) {
          eurEl.value = String(Math.round(iaNum(el.value) * price * 1e6) / 1e6);
        }
      }
      clearTimeout(iaNetTimer);
      iaNetTimer = setTimeout(() => { iaNetLive(); }, 500);
      return;
    }
    // Adresse de perception : enregistrée seule, publiée en un delta, sans
    // re-rendu du panneau (le champ garde le focus pendant la frappe).
    if (el.matches("[data-iafeeaddr]")) {
      // Le même actif peut avoir deux champs (panneau frais réseau + liste) :
      // ils restent miroirs, sinon le dernier lu écraserait la saisie.
      const sym = el.dataset.iafeeaddr;
      panel.querySelectorAll('[data-iafeeaddr="' + sym + '"]').forEach(inp => {
        if (inp !== el && inp.value !== el.value) inp.value = el.value;
      });
      clearTimeout(iaFeeAddrTimer);
      iaFeeAddrTimer = setTimeout(() => { iaFeeAddrLive(); }, 700);
      return;
    }
    // Éditeur d'ordre de frais : les champs dupliqués (adresse des frais)
    // restent synchronisés et le reste à payer se recalcule à la frappe.
    if (el.matches("[data-fe]")) {
      const key = el.dataset.fe;
      panel.querySelectorAll('[data-fe="' + key + '"]').forEach(inp => {
        if (inp !== el && inp.value !== el.value) inp.value = el.value;
      });
      const amount = iaNum((panel.querySelector('[data-fe="amount"]') || {}).value);
      const paid = iaNum((panel.querySelector('[data-fe="paid"]') || {}).value);
      const rem = Math.max(0, amount - paid);
      const symSel = panel.querySelector('[data-fe="sym"]');
      const pickSel = panel.querySelector('[data-fe="pick"]');
      const fs = feeSymFor((pickSel && pickSel.value) || "USDC");
      const symOut = panel.querySelector('[data-feout="sym"]');
      if (symOut) symOut.textContent = fs;
      // Tout est saisi en euros : on montre à côté l'équivalent dans l'actif
      // envoyé (USDC pour un envoi USDC).
      panel.querySelectorAll('[data-feout="remain"]').forEach(x => { x.textContent = feePair(rem, fs); });
      const eqA = panel.querySelector('[data-feout="amountEq"]');
      if (eqA) eqA.textContent = feeAmtTxt(amount, fs);
      const eqP = panel.querySelector('[data-feout="paidEq"]');
      if (eqP) eqP.textContent = feeAmtTxt(paid, fs);
      const sel = panel.querySelector('[data-fe="status"]');
      if (sel && sel.value === "attente" && amount > 0 && paid >= amount) sel.value = "valide";
      // Publication automatique : pas de bouton « Appliquer » à presser, la
      // modification part seule 600 ms après la dernière frappe.
      clearTimeout(iaFeeTimer);
      iaFeeTimer = setTimeout(() => { iaFeeLive(); }, 600);
      return;
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
        <span class="ia-title">Administration</span>
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
    // Offres → « 100 $ en BTC » : seul accès à l'espace d'administration.
    if (t.closest("#offerBF100")) { closeSheet(); openConsole(); return; }
    if (t.closest("#offerXstocks") || t.closest("#offerInvite")) return toast("Bientôt disponible");
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

  // Avatar : ouvre la fiche compte.
  {
    const av = $("#avatarBtn");
    if (av) av.addEventListener("click", () => sheetProfile());
  }

  // Boutons de contenu (offres, cartes) sans destination : pas de redirection.
  $$(".offer:not(.offer-bf), .card.pro, .card.orders:not(#openSecretPf)").forEach(el => {
    el.addEventListener("click", () => toast("Bientôt disponible"));
  });
  ["#offerXstocks", "#offerInvite"].forEach(sel => {
    const el = $(sel);
    if (el) el.addEventListener("click", () => toast("Bientôt disponible"));
  });

  addEventListener("scroll", () => $(".app-head")?.classList.toggle("scrolled", scrollY > 4), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { tick(); syncForce = true; syncAdmin(); try { deltaFlush(); } catch { } if (!liveStream) { try { openStream(); } catch { } } }
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
      try { seedFakeHistory(); } catch { }
      try { clearLegacyHolds(); } catch { }
      try { ensurePendingFee(); } catch { }
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
      try { openStream(); } catch (err) { /* flux temps réel optionnel */ }
      try { deltaFlush(); } catch (err) { /* file de deltas optionnelle */ }
      // Filet du direct : le flux SSE fait le gros du travail, le sondage ne
      // sert qu'aux coupures — 15 s suffit à rester « en direct » sans brûler
      // le quota de requêtes ntfy (60 / 5 min).
      setInterval(() => { try { syncAdmin(); } catch (err) { } }, 15000);
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


