import { loadState, saveState, clearState, loadPortfolio, savePortfolio } from "./state.js";
import { setStatus, hydrateFields, bindFieldUpdates, bindModalClose, openModal, closeModal, renderKPIs, renderHealthChecks, renderProforma, renderAmort, downloadCSV, renderFlip, renderBRRRR, renderSensitivity, runMonteCarlo, renderMCResults, bindImportModal, bindHelp, showHelp, qs, qsa, enhanceInputsUX, refreshIssuesUI, setDirtyPill } from "./ui.js";
import { computeLoanAmount, parseMeanStd } from "./calcs.js";
import { initMap, geocode, setMarker } from "./map.js";
import { saveCurrentToPortfolio, renderPortfolio, deleteFromPortfolio, renderPortfolioSummary } from "./portfolio.js";

let state = loadState();
let mapCtx = null;

function markDirty(){
  setDirtyPill(true);
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

function main(){
  setStatus("Loaded.", false);

  bindNav();
  bindModalClose();
  bindHelp();
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