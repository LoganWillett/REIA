/**
 * app.js
 * Purpose:
 *   Main application controller:
 *   - Loads/saves the current deal state
 *   - Wires tab navigation + top-bar actions (save/export/import)
 *   - Triggers all underwriting renders (KPIs, Pro Forma, Flip, BRRRR, etc.)
 *   - Integrates Portfolio and the new Transactions/Actuals layer
 */

import { loadState, saveState, clearState, loadPortfolio, savePortfolio } from "./state.js";
import { setStatus, hydrateFields, bindFieldUpdates, bindModalClose, openModal, closeModal, renderKPIs, renderHealthChecks, renderProforma, renderAmort, downloadCSV, renderFlip, renderBRRRR, renderSensitivity, runMonteCarlo, renderMCResults, bindImportModal, bindHelp, showHelp, qs, qsa, enhanceInputsUX, refreshIssuesUI, setDirtyPill } from "./ui.js";
import { computeLoanAmount, parseMeanStd, money2 } from "./calcs.js";
import { initMap, geocode, setMarker } from "./map.js";
import { saveCurrentToPortfolio, renderPortfolio, deleteFromPortfolio, renderPortfolioSummary } from "./portfolio.js";
import { loadTransactions, saveTransactions, clearTransactions, loadRules, saveRules, DEFAULT_CATEGORIES, applyRulesToTx, csvToTransactions, rollupByMonth, toMonthlyCSV, normalizeTx } from "./transactions.js";

let state = loadState();
let mapCtx = null;

// Actuals storage (separate from deal underwriting state)
let txItems = loadTransactions();
let txRules = loadRules();


function markDirty(){
  setDirtyPill(true);
}

function getPropertyOptions(){
  // Portfolio items represent saved deals/properties; allow attaching transactions to them.
  const plist = loadPortfolio();
  const opts = [{ id: "unassigned", name: "Unassigned / Current deal" }];
  for (const p of plist){
    opts.push({ id: p.id, name: p.propertyName || p.name || ("Property " + p.id.slice(-4)) });
  }
  return opts;
}

let lastAmort = null;

function activateTab(name){
  qsa(".tab").forEach(t => t.classList.remove("active"));
  qsa(".tabbtn").forEach(b => b.classList.remove("active"));
  qs("#tab-" + name).classList.add("active");
  qs(`[data-tab="${name}"]`).classList.add("active");
  if (name === "location" && mapCtx) mapCtx.map.invalidateSize();
  saveState(state);
}

function addLine(containerId, arrKey, item={label:"", amount:0}){
  const tpl = qs("#tplLine");
  const node = tpl.content.firstElementChild.cloneNode(true);
  const label = node.querySelector('[data-line="label"]');
  const amount = node.querySelector('[data-line="amount"]');
  const remove = node.querySelector('[data-line="remove"]');

  label.value = item.label ?? "";
  amount.value = item.amount ?? 0;

  const idx = state[arrKey].length;
  state[arrKey].push({ label: label.value, amount: Number(amount.value) });

  const sync = () => {
    markDirty();
    state[arrKey][idx] = { label: label.value, amount: Number(amount.value) || 0 };
    onStateChange();
  };

  label.addEventListener("input", sync);
  amount.addEventListener("input", sync);

  remove.addEventListener("click", () => {
    const realIndex = Array.from(qs("#"+containerId).children).indexOf(node);
    if (realIndex >= 0) state[arrKey].splice(realIndex, 1);
    node.remove();
    onStateChange();
  });

  qs("#"+containerId).appendChild(node);
}

function renderLines(containerId, arrKey){
  const root = qs("#"+containerId);
  root.innerHTML = "";
  (state[arrKey] || []).forEach(item => addLine(containerId, arrKey, item));
}

function reconcileLoanAuto(){
  // If loanAmount is null, show computed value in the field without overwriting state.
  const el = qs('[data-field="loanAmount"]');
  if (!el) return;
  if (state.loanAmount === null || state.loanAmount === undefined || state.loanAmount === ""){
    el.value = computeLoanAmount(state);
  }
}

function onStateChange(){
  // Keep loan field display coherent
  reconcileLoanAuto();

  // Render computed areas
  try{
    renderKPIs(state);
    renderHealthChecks(state);
    renderProforma(state);
    renderFlip(state);
    renderBRRRR(state);

    const limit = Number(qs("#amortRows").value) || 360;
    lastAmort = renderAmort(state, limit);

    // portfolio summary (if tab open)
    const plist = loadPortfolio();
    renderPortfolioSummary(plist);

    saveState(state);
    setDirtyPill(false);
    refreshIssuesUI(state);
    setStatus("Saved • " + new Date().toLocaleTimeString(), false);
  }catch(err){
    console.error(err);
    setStatus("Error: " + (err?.message || err), true);
  }
}

function bindNav(){
  qs("#tabNav").addEventListener("click", (e) => {
    const btn = e.target.closest(".tabbtn");
    if (!btn) return;
    activateTab(btn.getAttribute("data-tab"));
  });
}

function bindTopButtons(){
  qs("#btnImport").addEventListener("click", () => openModal("importModal"));
  qs("#btnAbout").addEventListener("click", () => openModal("aboutModal"));
  qs("#btnHelp")?.addEventListener("click", () => showHelp("global.howto"));

  qs("#btnExport").addEventListener("click", () => {
    const json = JSON.stringify(state, null, 2);
    navigator.clipboard.writeText(json).then(() => setStatus("Copied JSON to clipboard.", false))
      .catch(() => {
        // fallback download
        const blob = new Blob([json], {type:"application/json"});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "deal.json";
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        setStatus("Downloaded deal.json", false);
      });
  });

  qs("#btnReset").addEventListener("click", () => {
    clearState();
    location.reload();
  });

  qs("#btnSavePortfolio").addEventListener("click", () => {
    const list = saveCurrentToPortfolio(state);
    setStatus("Saved to Portfolio ("+list.length+")", false);
    refreshPortfolio();
  });
}

function bindInputs(){
  hydrateFields(state);
  renderLines("otherIncomeLines", "otherIncomeLines");
  renderLines("otherExpenseLines", "otherExpenseLines");

  bindFieldUpdates(state, onStateChange, () => markDirty());

  qs("#btnAddIncomeLine").addEventListener("click", () => addLine("otherIncomeLines", "otherIncomeLines"));
  qs("#btnClearIncomeLines").addEventListener("click", () => { state.otherIncomeLines = []; renderLines("otherIncomeLines","otherIncomeLines"); onStateChange(); });

  qs("#btnAddExpenseLine").addEventListener("click", () => addLine("otherExpenseLines", "otherExpenseLines"));
  qs("#btnClearExpenseLines").addEventListener("click", () => { state.otherExpenseLines = []; renderLines("otherExpenseLines","otherExpenseLines"); onStateChange(); });

  // If user edits loanAmount, treat as override (not auto)
  const loanEl = qs('[data-field="loanAmount"]');
  loanEl.addEventListener("input", () => {
    const v = loanEl.value;
    if (v === "" || v === null) state.loanAmount = null;
  });

  qs("#amortRows").addEventListener("change", onStateChange);
  qs("#btnDownloadAmort").addEventListener("click", () => {
    if (!lastAmort) return;
    const rows = [["month","payment","principal","interest","balance"]]
      .concat(lastAmort.map(r => [r.month, r.payment, r.principal, r.interest, r.balance]));
    downloadCSV(rows, "amortization.csv");
  });
}

function bindLocation(){
  mapCtx = initMap(qs("#map"), (m, err)=>setStatus(m, !!err));
  if (mapCtx){
    // sync marker drag -> state lat/lng
    mapCtx.marker.on("dragend", () => {
      const ll = mapCtx.marker.getLatLng();
      state.lat = Number(ll.lat.toFixed(6));
      state.lng = Number(ll.lng.toFixed(6));
      hydrateFields(state);
      onStateChange();
    });
  }

  qs("#btnUseInputsAddress").addEventListener("click", () => {
    qs("#geoQuery").value = state.address || "";
  });

  qs("#btnGeocode").addEventListener("click", async () => {
    try{
      const q = qs("#geoQuery").value.trim();
      if (!q){ setStatus("Type an address first.", true); return; }
      const hit = await geocode(q, (m)=>setStatus(m,false));
      if (!hit){ setStatus("No results for that query.", true); return; }
      state.lat = Number(hit.lat.toFixed(6));
      state.lng = Number(hit.lng.toFixed(6));
      hydrateFields(state);
      setMarker(mapCtx, state.lat, state.lng);
      setStatus("Mapped: " + (hit.displayName || "OK"), false);
      onStateChange();
    }catch(err){
      console.error(err);
      setStatus("Geocode error: " + (err?.message || err), true);
    }
  });

  // manual lat/lng edits should move marker
  qsa('[data-field="lat"], [data-field="lng"]').forEach(el => {
    el.addEventListener("change", () => {
      if (!mapCtx) return;
      if (Number.isFinite(Number(state.lat)) && Number.isFinite(Number(state.lng))){
        setMarker(mapCtx, state.lat, state.lng);
      }
    });
  });
}

function bindSensitivity(){
  qs("#btnRunSensitivity").addEventListener("click", () => {
    const rent = Number(qs("#sensRentDelta").value) || 10;
    const vac = Number(qs("#sensVacDelta").value) || 3;
    const size = Number(qs("#sensSize").value) || 5;
    renderSensitivity(state, rent, vac, size);
    setStatus("Sensitivity updated.", false);
  });
}

function bindMonteCarlo(){
  qs("#btnRunMC").addEventListener("click", () => {
    const runs = Math.min(50000, Math.max(100, Number(qs("#mcRuns").value) || 3000));
    const years = Math.min(50, Math.max(1, Number(qs("#mcYears").value) || 10));

    const dist = {
      rent: parseMeanStd(qs("#mcRent").value),
      exp: parseMeanStd(qs("#mcExp").value),
      appr: parseMeanStd(qs("#mcAppr").value),
      vac: parseMeanStd(qs("#mcVac").value),
    };
    const exitMethod = qs("#mcExitMethod").value;

    setStatus("Running Monte Carlo…", false);
    // avoid locking UI completely: run in next tick
    setTimeout(() => {
      try{
        const res = runMonteCarlo(state, runs, years, dist, exitMethod);
        renderMCResults(res);
        setStatus("Monte Carlo complete ("+runs+" runs).", false);
      }catch(err){
        console.error(err);
        setStatus("Monte Carlo error: " + (err?.message || err), true);
      }
    }, 20);
  });
}

function refreshPortfolio(){
  const list = loadPortfolio();
  renderPortfolio(list,
    (id) => {
      const item = list.find(x => x.id === id);
      if (!item) return;
      state = { ...state, ...item.snapshot };
      saveState(state);
      hydrateFields(state);
      renderLines("otherIncomeLines","otherIncomeLines");
      renderLines("otherExpenseLines","otherExpenseLines");
      onStateChange();
      setStatus("Loaded: " + item.propertyName, false);
      activateTab("overview");
    },
    (id) => {
      const updated = deleteFromPortfolio(id);
      setStatus("Deleted. Portfolio size: " + updated.length, false);
      refreshPortfolio();
    }
  );
  renderPortfolioSummary(list);

  qs("#btnPortfolioExport").addEventListener("click", () => {
    const json = JSON.stringify(list, null, 2);
    const blob = new Blob([json], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "portfolio.json";
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  });

  qs("#btnPortfolioImport").addEventListener("click", () => qs("#portfolioFile").click());
  qs("#portfolioFile").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try{
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) throw new Error("JSON must be an array");
      savePortfolio(arr);
      setStatus("Imported portfolio ("+arr.length+").", false);
      refreshPortfolio();
    }catch(err){
      setStatus("Portfolio import error: " + (err?.message || err), true);
    }finally{
      e.target.value = "";
    }
  });
}

function bindImport(){
  bindImportModal(state, (patch) => {
    markDirty();
    Object.assign(state, patch);
    // If patch explicitly sets loanAmount, keep it; else leave existing override/auto state.
    saveState(state);
    hydrateFields(state);
    renderLines("otherIncomeLines","otherIncomeLines");
    renderLines("otherExpenseLines","otherExpenseLines");
    onStateChange();
    closeModal("importModal");
    setStatus("Imported fields applied.", false);
  });
}


// ------------------------------
// Transactions + Actuals (new)
// ------------------------------
function syncTxSelectors(){
  const opts = getPropertyOptions();

  const fill = (selId, includeAll=false) => {
    const sel = qs(selId);
    if (!sel) return;
    sel.innerHTML = "";
    if (includeAll) sel.appendChild(new Option("All", "all"));
    for (const o of opts){
      sel.appendChild(new Option(o.name, o.id));
    }
  };

  fill("#txProperty");
  fill("#txFilterProperty", true);
  fill("#actProperty", true);
}

function syncCategorySelectors(){
  const catSelIds = ["#txCategory", "#ruleCategory"];
  for (const id of catSelIds){
    const sel = qs(id);
    if (!sel) continue;
    sel.innerHTML = "";
    for (const c of DEFAULT_CATEGORIES){
      sel.appendChild(new Option(c, c));
    }
  }
}

function escapeHtml(s){
      return String(s)
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#39;");
    }

    function renderRules(){
  const root = qs("#rulesTable");
  if (!root) return;
  if (!txRules.length){
    root.innerHTML = '<div class="hint">No rules yet.</div>';
    return;
  }
  const rows = txRules.map((r, i) => `
    <tr>
      <td>${escapeHtml(r.needle||"")}</td>
      <td>${escapeHtml(r.category||"Other")}</td>
      <td><button class="btn btn--danger btn--small" data-rule-del="${i}">Delete</button></td>
    </tr>
  `).join("");
  root.innerHTML = `
    <table>
      <thead><tr><th>Keyword</th><th>Category</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
  qsa("[data-rule-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = Number(btn.getAttribute("data-rule-del"));
      txRules.splice(i, 1);
      saveRules(txRules);
      renderRules();
    });
  });
}

function renderTxTable(){
  const root = qs("#txTable");
  if (!root) return;

  const filterProp = qs("#txFilterProperty")?.value || "all";
  const query = (qs("#txSearch")?.value || "").trim().toLowerCase();

  let items = txItems.slice().sort((a,b)=> String(b.date).localeCompare(String(a.date)));
  if (filterProp !== "all") items = items.filter(t => t.propertyId === filterProp);
  if (query) items = items.filter(t => (t.desc||"").toLowerCase().includes(query));

  if (!items.length){
    root.innerHTML = '<div class="hint">No transactions yet.</div>';
    return;
  }

  const propName = (id) => {
    const opts = getPropertyOptions();
    const o = opts.find(x => x.id === id);
    return o ? o.name : id;
  };

  const rows = items.map((t) => `
    <tr>
      <td>${escapeHtml(String(t.date||"").slice(0,10))}</td>
      <td>${escapeHtml(t.desc||"")}</td>
      <td><span class="tag ${t.type}">${t.type}</span></td>
      <td>${escapeHtml(t.category||"Other")}</td>
      <td>${escapeHtml(propName(t.propertyId))}</td>
      <td style="text-align:right">${money2(t.amount)}</td>
      <td><button class="btn btn--danger btn--small" data-tx-del="${t.id}">Delete</button></td>
    </tr>
  `).join("");

  root.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Date</th><th>Description</th><th>Type</th><th>Category</th><th>Property</th><th style="text-align:right">Amount</th><th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  qsa("[data-tx-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-tx-del");
      txItems = txItems.filter(t => t.id !== id);
      saveTransactions(txItems);
      renderTxTable();
      renderActuals();
    });
  });
}

function renderActuals(){
  const tableRoot = qs("#actualsTable");
  const kpiRoot = qs("#actualsKpis");
  const notesRoot = qs("#actualsNotes");
  if (!tableRoot || !kpiRoot || !notesRoot) return;

  const prop = qs("#actProperty")?.value || "all";
  const months = rollupByMonth(txItems, { propertyId: prop });

  if (!months.length){
    tableRoot.innerHTML = '<div class="hint">No actuals yet. Add or import transactions first.</div>';
    kpiRoot.innerHTML = "";
    notesRoot.innerHTML = "";
    return;
  }

  const rows = months.map(m => `
    <tr>
      <td>${m.month}</td>
      <td style="text-align:right">${money2(m.income)}</td>
      <td style="text-align:right">${money2(m.expense)}</td>
      <td style="text-align:right">${money2(m.debt)}</td>
      <td style="text-align:right">${money2(m.noi)}</td>
      <td style="text-align:right">${money2(m.cashflow)}</td>
    </tr>
  `).join("");

  tableRoot.innerHTML = `
    <table>
      <thead>
        <tr><th>Month</th><th style="text-align:right">Income</th><th style="text-align:right">Expenses</th><th style="text-align:right">Debt</th><th style="text-align:right">NOI</th><th style="text-align:right">Cash Flow</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  // KPIs
  const avg = (arr, key) => arr.reduce((s,x)=>s+(Number(x[key])||0),0)/arr.length;
  const avgCF = avg(months,"cashflow");
  const avgNOI = avg(months,"noi");
  const variance = (arr, key, mu) => arr.reduce((s,x)=>s+Math.pow((Number(x[key])||0)-mu,2),0)/arr.length;
  const vol = Math.sqrt(variance(months,"cashflow",avgCF));

  kpiRoot.innerHTML = [
  { k: "Avg monthly cash flow", v: money2(avgCF), s: "" },
  { k: "Avg monthly NOI", v: money2(avgNOI), s: "" },
  { k: "Cash flow volatility", v: money2(vol), s: "" }
].map(x => `
  <div class="kpi">
    <div class="k">${x.k}</div>
    <div class="v">${x.v}</div>
    <div class="s">${x.s}</div>
  </div>
`).join("");

  notesRoot.innerHTML = `
    <div class="check">
      <div><b>Download</b> exports the monthly rollup as CSV for spreadsheets or taxes.</div>
    </div>
  `;
}

function bindTransactionsUI(){
  syncCategorySelectors();
  syncTxSelectors();
  renderRules();
  renderTxTable();
  renderActuals();

  qs("#btnRuleAdd")?.addEventListener("click", () => {
    const needle = qs("#ruleNeedle")?.value?.trim();
    const category = qs("#ruleCategory")?.value;
    if (!needle) return setStatus("Rule keyword is required.", true);
    txRules.push({ needle, category });
    saveRules(txRules);
    qs("#ruleNeedle").value = "";
    renderRules();
  });

  qs("#btnTxAdd")?.addEventListener("click", () => {
    const tx = normalizeTx({
      date: qs("#txDate")?.value,
      amount: Number(qs("#txAmount")?.value || 0),
      desc: qs("#txDesc")?.value,
      type: qs("#txType")?.value,
      category: qs("#txCategory")?.value,
      propertyId: qs("#txProperty")?.value || "unassigned"
    });
    const applied = applyRulesToTx(tx, txRules);
    txItems.unshift(applied);
    saveTransactions(txItems);
    renderTxTable();
    renderActuals();
    setStatus("Transaction added.", false);
  });

  qs("#btnTxClearAll")?.addEventListener("click", () => {
    if (!confirm("Clear ALL stored transactions?")) return;
    clearTransactions();
    txItems = [];
    renderTxTable();
    renderActuals();
    setStatus("Transactions cleared.", false);
  });

  qs("#btnTxParse")?.addEventListener("click", async () => {
    const file = qs("#txFile")?.files?.[0];
    if (!file) return setStatus("Choose a CSV file first.", true);
    const text = await file.text();
    let parsed = csvToTransactions(text);
    // Apply rules
    parsed = parsed.map(tx => applyRulesToTx(tx, txRules));
    txItems = parsed.concat(txItems);
    saveTransactions(txItems);
    renderTxTable();
    renderActuals();
    setStatus(`Imported ${parsed.length} transactions.`, false);
  });

  qs("#txFilterProperty")?.addEventListener("change", renderTxTable);
  qs("#txSearch")?.addEventListener("input", renderTxTable);
  qs("#actProperty")?.addEventListener("change", renderActuals);

  qs("#btnActDownload")?.addEventListener("click", () => {
    const prop = qs("#actProperty")?.value || "all";
    const months = rollupByMonth(txItems, { propertyId: prop });
    const csv = toMonthlyCSV(months);
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `actuals_${prop}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  });
}


function main(){
  setStatus("Loaded.", false);

  bindNav();
  bindModalClose();
  bindHelp();
  // New: Transactions/Actuals
  bindTransactionsUI();
  bindTopButtons();
  bindInputs();
  enhanceInputsUX();
  bindLocation();
  bindSensitivity();
  bindMonteCarlo();
  bindImport();
  refreshPortfolio();

  // default tab
  activateTab("overview");
  onStateChange();

  // Global error trap -> status
  window.addEventListener("error", (e) => {
    setStatus("Runtime error: " + (e?.message || "Unknown"), true);
  });
  window.addEventListener("unhandledrejection", (e) => {
    setStatus("Promise error: " + (e?.reason?.message || e?.reason || "Unknown"), true);
  });
}

main();