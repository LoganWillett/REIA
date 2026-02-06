/**
 * ui.js
 * Purpose:
 *   UI helpers and renderers:
 *   - DOM query helpers, input hydration, and event binding
 *   - Modal management and help popovers
 *   - Rendering for KPI tiles, health checks, Pro Forma, Amortization, Sensitivity, Monte Carlo
 *   - Import Text workflow (paste -> parse -> preview -> apply)
 */

import { clamp, money, money2, pct, amortSchedule, computeLoanAmount, totalCashInvested, proformaAnnual, flipResults, brrrrResults, randn, parseMeanStd, irr, quantile } from "./calcs.js";
import { importTextToPatch } from "./importParser.js";
import { HELP, IMPORT_EXAMPLES, IMPORT_KEYS } from "./helpContent.js";

export function qs(sel, root=document){ return root.querySelector(sel); }
export function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function escapeHtml(s){
  return String(s)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

export function showHelp(key="global.howto"){
  const item = HELP[key] || { title: "Help", body: `<p>No help found for <code>${escapeHtml(key)}</code>.</p>` };
  const titleEl = qs("#helpTitle");
  const bodyEl = qs("#helpBody");
  if (titleEl) titleEl.textContent = item.title || "Help";
  if (bodyEl) bodyEl.innerHTML = item.body || "";
  openModal("helpModal");
}

export function bindHelp(){
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-help]");
    if (!btn) return;
    e.preventDefault();
    const key = btn.getAttribute("data-help") || "global.howto";
    showHelp(key);
  });
}



export function setStatus(msg, isError=false){
  const el = qs("#status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("error", !!isError);
  el.classList.toggle("ok", !!msg && !isError);
}

let _modalStack = [];
let _modalFocusRestore = new Map();

/** Lightweight modal open with focus management (local-first; no deps). */
export function openModal(id){
  const el = qs("#" + id);
  if (!el) return;

  // Remember focus to restore later
  try{
    _modalFocusRestore.set(id, document.activeElement);
  }catch{}

  el.setAttribute("aria-hidden", "false");
  if (!_modalStack.includes(id)) _modalStack.push(id);
  document.body.classList.add("modalOpen");

  // Focus first meaningful control
  const focusable = Array.from(el.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
    .filter(n => !n.hasAttribute("disabled") && n.getAttribute("aria-hidden") !== "true");

  const preferred = el.querySelector("[data-autofocus]") || el.querySelector("textarea,input,select");
  const target = preferred || focusable[0];
  if (target && typeof target.focus === "function"){
    setTimeout(() => target.focus(), 0);
  }
}

/** Close modal and restore focus. */
export function closeModal(id){
  const el = qs("#" + id);
  if (!el) return;
  el.setAttribute("aria-hidden", "true");

  _modalStack = _modalStack.filter(x => x !== id);
  if (_modalStack.length === 0) document.body.classList.remove("modalOpen");

  const restore = _modalFocusRestore.get(id);
  if (restore && typeof restore.focus === "function"){
    setTimeout(() => restore.focus(), 0);
  }
}

export function bindModalClose(){
  qsa("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close")));
  });
  qsa(".modal__backdrop").forEach(b => {
    b.addEventListener("click", () => closeModal(b.getAttribute("data-close")));
  });

  window.addEventListener("keydown", (e) => {
    const topId = _modalStack[_modalStack.length - 1];
    if (!topId) return;

    const top = qs("#" + topId);
    if (!top || top.getAttribute("aria-hidden") !== "false") return;

    // Escape closes the topmost modal
    if (e.key === "Escape"){
      e.preventDefault();
      closeModal(topId);
      return;
    }

    // Trap focus with Tab
    if (e.key === "Tab"){
      const focusable = Array.from(top.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
        .filter(n => !n.hasAttribute("disabled") && n.getAttribute("aria-hidden") !== "true" && n.offsetParent !== null);
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey){
        if (active === first || !top.contains(active)){
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last){
          e.preventDefault();
          first.focus();
        }
      }
    }
  });
}

/** Generic [data-field] binding */
export function hydrateFields(state){
  qsa("[data-field]").forEach(el => {
    const key = el.getAttribute("data-field");
    if (!(key in state)) return;
    const val = state[key];
    if (val === null || val === undefined) el.value = "";
    else el.value = val;
  });
}

/** Apply form changes to state */
export function bindFieldUpdates(state, onChange, onBeforeChange){
  qsa("[data-field]").forEach(el => {
    const key = el.getAttribute("data-field");
    if (!(key in state)) return;

    const handler = () => {
      onBeforeChange?.(key, el);
      const type = el.getAttribute("type");
      let v = el.value;

      if (type === "number"){
        v = (v === "" ? null : Number(v));
      }
      if (el.tagName === "SELECT"){
        v = el.value;
      }
      if (el.tagName === "TEXTAREA"){
        v = el.value;
      }
      if (el.tagName === "INPUT" && type !== "number"){
        v = el.value;
      }

      state[key] = v;
      onChange?.();
    };

    el.addEventListener("input", handler);
    el.addEventListener("change", handler);
  });
}

export function renderKPIs(state){
  const pf = proformaAnnual(state);
  const loan = computeLoanAmount(state);
  const pmt = (pf.ds/12);
  const invested = totalCashInvested(state);

  const kpis = [
    { k:"NOI (annual)", v: money(pf.noi), s:`EGI ${money(pf.egi)} • OpEx ${money(pf.opex)}` },
    { k:"Cash Flow (annual)", v: money(pf.cashflow), s:`Debt service ${money(pf.ds)}` },
    { k:"Cap Rate", v: pct(pf.capRate*100), s:`On purchase price ${money(state.purchasePrice)}` },
    { k:"Cash-on-Cash", v: pct(pf.coc*100), s:`Cash invested ${money(invested)}` },
    { k:"DSCR", v: (Number.isFinite(pf.dscr) ? pf.dscr.toFixed(2) : "—"), s:"NOI / Debt Service" },
    { k:"Break-even Occupancy", v: pct(pf.breakevenOcc*100), s:"(OpEx + DS) / GSI" },
    { k:"Loan Amount", v: money(loan), s:`~${money2(pmt)} /mo payment` },
    { k:"GSI (annual)", v: money(pf.gsi), s:"Gross scheduled income" },
  ];

  const root = qs("#kpis");
  root.innerHTML = kpis.map(x => `
    <div class="kpi">
      <div class="k">${x.k}</div>
      <div class="v">${x.v}</div>
      <div class="s">${x.s}</div>
    </div>
  `).join("");
}

export function renderHealthChecks(state){
  const pf = proformaAnnual(state);
  const checks = [];

  if (pf.cashflow < 0) checks.push({ t:"Negative annual cash flow", d:"Your NOI is below your debt service. Consider higher rent, lower price, bigger down payment, or different financing.", bad:true });
  else checks.push({ t:"Cash flow is positive", d:"Debt service is covered with some margin.", bad:false });

  if (pf.dscr && pf.dscr < 1.15) checks.push({ t:"DSCR < 1.15", d:"Many lenders like 1.15–1.25+. Your cushion is thin.", bad:true });
  else checks.push({ t:"DSCR looks okay", d:"Coverage is reasonable for typical underwriting.", bad:false });

  const invested = totalCashInvested(state);
  if (invested <= 0) checks.push({ t:"Cash invested is 0", d:"If this is a creative deal, set loan amount / closing / rehab so metrics compute correctly.", bad:true });

  const root = qs("#healthChecks");
  root.innerHTML = checks.map(c => `
    <div class="check ${c.bad ? "bad":"good"}">
      <div style="font-weight:800">${c.t}</div>
      <div class="hint">${c.d}</div>
    </div>
  `).join("");
}

export function renderProforma(state){
  const pf = proformaAnnual(state);

  const rows = [
    ["Gross Scheduled Income (GSI)", pf.gsi],
    ["Vacancy", -pf.vacancy],
    ["Effective Gross Income (EGI)", pf.egi],
    ["—", null],
    ["Taxes", -pf.taxes],
    ["Insurance", -pf.ins],
    ["HOA", -pf.hoa],
    ["Utilities", -pf.util],
    ["Management", -pf.mgmt],
    ["Maintenance", -pf.maint],
    ["CapEx Reserve", -pf.capex],
    ["Other Expenses", -pf.otherExp],
    ["Total OpEx", -pf.opex],
    ["NOI", pf.noi],
    ["Debt Service", -pf.ds],
    ["Cash Flow", pf.cashflow],
  ];

  const table = `
    <table>
      <thead><tr><th>Line</th><th>Annual</th></tr></thead>
      <tbody>
        ${rows.map(([a,b]) => b===null
          ? `<tr><td>${a}</td><td></td></tr>`
          : `<tr><td>${a}</td><td>${money(b)}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
  qs("#proformaTable").innerHTML = table;

  const badges = [
    ["EGI", money(pf.egi)],
    ["OpEx", money(pf.opex)],
    ["NOI", money(pf.noi)],
    ["Debt Service", money(pf.ds)],
    ["Cash Flow", money(pf.cashflow)],
  ].map(([k,v]) => `<div class="badge"><div>${k}</div><div><b>${v}</b></div></div>`).join("");
  qs("#cashflowBreakdown").innerHTML = badges;
}

export function renderAmort(state, limit){
  const loan = computeLoanAmount(state);
  const sched = amortSchedule(loan, state.interestRate, state.termYears);
  const max = Math.min(limit, sched.length);

  const table = `
    <table>
      <thead><tr><th>Month</th><th>Payment</th><th>Principal</th><th>Interest</th><th>Balance</th></tr></thead>
      <tbody>
        ${sched.slice(0,max).map(r => `
          <tr>
            <td>${r.month}</td>
            <td>${money2(r.payment)}</td>
            <td>${money2(r.principal)}</td>
            <td>${money2(r.interest)}</td>
            <td>${money2(r.balance)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  qs("#amortTable").innerHTML = table;
  return sched;
}

export function downloadCSV(rows, filename){
  const csv = rows.map(r => r.map(x => {
    const s = (x ?? "").toString();
    if (/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }).join(",")).join("\n");
  const blob = new Blob([csv], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function renderFlip(state){
  const r = flipResults(state);
  const kpis = [
    { k:"Net Proceeds", v: money(r.netProceeds), s:"Sale - selling - loan payoff" },
    { k:"Total Out-of-Pocket", v: money(r.totalOut), s:"Equity + closing + rehab + holding" },
    { k:"Profit", v: money(r.profit), s:"Net proceeds - total out" },
    { k:"ROI", v: pct(r.roi*100), s:"Profit / Total out-of-pocket" },
  ];
  qs("#flipResults").innerHTML = kpis.map(x => `
    <div class="kpi">
      <div class="k">${x.k}</div>
      <div class="v">${x.v}</div>
      <div class="s">${x.s}</div>
    </div>
  `).join("");
}

export function renderBRRRR(state){
  const r = brrrrResults(state);
  const kpis = [
    { k:"New Loan", v: money(r.newLoan), s:`${state.brrrrRefiLtvPct}% of ${money(r.appraised)}` },
    { k:"Cash Out", v: money(r.cashOut), s:"New loan - payoff - refi costs" },
    { k:"Cash Left In", v: money(r.cashLeftIn), s:"(Total invested) - cash out" },
    { k:"Cash Flow After Refi (annual)", v: money(r.cashflowAfterRefi), s:"NOI - new debt service" },
    { k:"CoC After Refi", v: pct(r.cocAfterRefi*100), s:"Cash flow / Cash left in" },
  ];
  qs("#brrrrResults").innerHTML = kpis.map(x => `
    <div class="kpi">
      <div class="k">${x.k}</div>
      <div class="v">${x.v}</div>
      <div class="s">${x.s}</div>
    </div>
  `).join("");
}

export function renderSensitivity(state, rentDeltaPct, vacDeltaPP, size){
  const center = Math.floor(size/2);
  const baseRent = Number(state.rentMonthly) || 0;
  const baseVac = Number(state.vacancyPct) || 0;

  const header = ["Rent \\ Vacancy"]
    .concat(Array.from({length:size}, (_,i) => (baseVac + (i-center)*vacDeltaPP).toFixed(1) + "%"));

  const rows = [header];

  for (let r=0; r<size; r++){
    const rentAdj = (r-center) * rentDeltaPct;
    const rent = baseRent * (1 + rentAdj/100);

    const row = [(rentAdj>=0?"+":"") + rentAdj.toFixed(0) + "% rent"];
    for (let c=0; c<size; c++){
      const vac = baseVac + (c-center)*vacDeltaPP;
      const s2 = { ...state, rentMonthly: rent, vacancyPct: vac };
      const pf = proformaAnnual(s2);
      row.push(pct(pf.coc*100));
    }
    rows.push(row);
  }

  const table = `
    <table>
      <thead><tr>${rows[0].map((h,i)=>`<th>${h}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.slice(1).map(r => `<tr>${r.map((x,i)=> i===0 ? `<td>${x}</td>` : `<td>${x}</td>`).join("")}</tr>`).join("")}
      </tbody>
    </table>
  `;
  qs("#sensTable").innerHTML = table;
}

export function runMonteCarlo(state, runs, years, dist, exitMethod){
  const base = proformaAnnual(state);
  const invested = totalCashInvested(state);
  const loan = computeLoanAmount(state);
  const sched = amortSchedule(loan, state.interestRate, state.termYears);

  const irrList = [];
  const endEquityList = [];

  for (let i=0; i<runs; i++){
    // sample yearly rates
    const rentG = (dist.rent.mean + dist.rent.std * randn())/100;
    const expG  = (dist.exp.mean  + dist.exp.std  * randn())/100;
    const appr  = (dist.appr.mean + dist.appr.std * randn())/100;
    const vac   = clamp((dist.vac.mean + dist.vac.std * randn())/100, 0, 0.5);

    // yearly cashflows
    const cashflows = [];
    cashflows.push(-invested);

    // rough yearly NOI & DS
    for (let y=1; y<=years; y++){
      const rentMult = Math.pow(1+rentG, y-1);
      const expMult  = Math.pow(1+expG,  y-1);

      const sY = {
        ...state,
        rentMonthly: (Number(state.rentMonthly)||0) * rentMult,
        vacancyPct: vac*100,
        propertyTaxesAnnual: (Number(state.propertyTaxesAnnual)||0) * expMult,
        insuranceAnnual: (Number(state.insuranceAnnual)||0) * expMult,
        hoaMonthly: (Number(state.hoaMonthly)||0) * expMult,
        utilitiesMonthly: (Number(state.utilitiesMonthly)||0) * expMult,
        otherExpenseLines: (state.otherExpenseLines||[]).map(x => ({...x, amount: (Number(x.amount)||0) * expMult })),
        otherIncomeLines: (state.otherIncomeLines||[]).map(x => ({...x, amount: (Number(x.amount)||0) * rentMult })),
      };

      const pf = proformaAnnual(sY);

      // debt service this year based on amort schedule
      const m = Math.min(y*12, sched.length) - 1;
      const ds = pf.ds; // keep constant; (close enough)
      const cf = pf.noi - ds;
      cashflows.push(cf);
    }

    // terminal sale (end of year)
    const payoffBal = sched[Math.min(years*12, sched.length)-1]?.balance ?? 0;

    let salePrice = 0;
    if (exitMethod === "exitcap"){
      // value = NOI / cap
      const cap = clamp((Number(state.exitCapRate)||6.5)/100, 0.01, 0.25);
      // end-year NOI estimate:
      const rentMult = Math.pow(1+rentG, years-1);
      const expMult  = Math.pow(1+expG,  years-1);
      const sY = { ...state, rentMonthly: (Number(state.rentMonthly)||0) * rentMult, vacancyPct: vac*100,
        propertyTaxesAnnual: (Number(state.propertyTaxesAnnual)||0) * expMult,
        insuranceAnnual: (Number(state.insuranceAnnual)||0) * expMult,
        hoaMonthly: (Number(state.hoaMonthly)||0) * expMult,
        utilitiesMonthly: (Number(state.utilitiesMonthly)||0) * expMult,
        otherExpenseLines: (state.otherExpenseLines||[]).map(x => ({...x, amount: (Number(x.amount)||0) * expMult })),
        otherIncomeLines: (state.otherIncomeLines||[]).map(x => ({...x, amount: (Number(x.amount)||0) * rentMult })),
      };
      const pf = proformaAnnual(sY);
      salePrice = pf.noi / cap;
    } else {
      // appreciation on purchase price
      salePrice = (Number(state.purchasePrice)||0) * Math.pow(1+appr, years);
    }

    const sellPct = clamp((Number(state.sellingCostPct)||7)/100, 0, 0.25);
    const netSale = salePrice * (1 - sellPct) - payoffBal;

    cashflows[cashflows.length-1] += netSale;

    const r = irr(cashflows);
    if (Number.isFinite(r)) irrList.push(r);
    endEquityList.push(netSale);
  }

  irrList.sort((a,b)=>a-b);
  endEquityList.sort((a,b)=>a-b);

  const res = {
    irr_p10: quantile(irrList, 0.10),
    irr_p50: quantile(irrList, 0.50),
    irr_p90: quantile(irrList, 0.90),
    irr_mean: irrList.reduce((a,x)=>a+x,0) / (irrList.length || 1),
    eq_p10: quantile(endEquityList, 0.10),
    eq_p50: quantile(endEquityList, 0.50),
    eq_p90: quantile(endEquityList, 0.90),
  };

  return res;
}

export function renderMCResults(res){
  const kpis = [
    { k:"IRR p10", v: pct(res.irr_p10*100), s:"10th percentile (bad-ish outcomes)" },
    { k:"IRR p50", v: pct(res.irr_p50*100), s:"Median outcome" },
    { k:"IRR p90", v: pct(res.irr_p90*100), s:"90th percentile (great outcomes)" },
    { k:"IRR mean", v: pct(res.irr_mean*100), s:"Average of successful runs" },
    { k:"Net Sale p50", v: money(res.eq_p50), s:"After selling costs + loan payoff" },
  ];
  qs("#mcResults").innerHTML = kpis.map(x => `
    <div class="kpi">
      <div class="k">${x.k}</div>
      <div class="v">${x.v}</div>
      <div class="s">${x.s}</div>
    </div>
  `).join("");

  const lines = [
    `Net Sale (p10 / p50 / p90): ${money(res.eq_p10)} / ${money(res.eq_p50)} / ${money(res.eq_p90)}`,
  ];
  qs("#mcSummary").innerHTML = lines.map(t => `<div class="check"><div class="hint">${t}</div></div>`).join("");
}

export function bindImportModal(state, onApply){
  // Guide helpers (examples + recognized keys)
  const keysEl = qs("#importKeys");
  if (keysEl) keysEl.textContent = IMPORT_KEYS.join(", ");

  const exampleBox = qs("#importExampleBox");
  if (exampleBox && IMPORT_EXAMPLES?.rental) exampleBox.textContent = IMPORT_EXAMPLES.rental;

  // Mobile pane toggles (Work vs Guide) when the layout collapses to a single column.
  const layout = qs("#importLayout");
  const btnWork = qs("#btnImportPaneWork");
  const btnGuide = qs("#btnImportPaneGuide");
  function setPane(p){
    if (!layout) return;
    layout.classList.toggle("pane-work", p === "work");
    layout.classList.toggle("pane-guide", p === "guide");
    btnWork?.classList.toggle("active", p === "work");
    btnGuide?.classList.toggle("active", p === "guide");
  }
  btnWork?.addEventListener("click", () => setPane("work"));
  btnGuide?.addEventListener("click", () => setPane("guide"));


  qsa("[data-import-example]").forEach(btn => {
    btn.addEventListener("click", () => {
      const k = btn.getAttribute("data-import-example");
      const txt = IMPORT_EXAMPLES?.[k] || "";
      if (!txt) return;
      const ta = qs("#importText");
      if (ta) ta.value = txt;
      if (exampleBox) exampleBox.textContent = txt;
      setStatus("Loaded import example: " + k, false);
    });
  });

  const helpBtn = qs("#btnImportHelp");
  if (helpBtn) helpBtn.addEventListener("click", () => showHelp("import.guide"));

  const mappedRoot = qs("#importMapped");
  const unmappedEl = qs("#importUnmapped");
  const parseBtn = qs("#btnImportParse");
  const applyBtn = qs("#btnImportApply");
  const clearBtn = qs("#btnImportClear");
  const ta = qs("#importText");

  const FIELD_LABELS = {
    propertyName: "Name",
    address: "Address",
    units: "Units",
    purchasePrice: "Purchase Price ($)",
    closingCosts: "Closing Costs ($)",
    rehabCosts: "Rehab ($)",
    afterRepairValue: "ARV / Appraisal ($)",
    downPaymentPct: "Down Payment (%)",
    interestRate: "Interest Rate (%)",
    termYears: "Term (years)",
    pointsPct: "Points (%)",
    loanFees: "Loan Fees ($)",
    loanAmount: "Loan Amount ($)",
    rentMonthly: "Rent (monthly $)",
    propertyTaxesAnnual: "Taxes (annual $)",
    insuranceAnnual: "Insurance (annual $)",
    hoaMonthly: "HOA (monthly $)",
    utilitiesMonthly: "Utilities (monthly $)",
    vacancyPct: "Vacancy (%)",
    managementPct: "Management (%)",
    maintenancePct: "Maintenance (%)",
    capexPct: "CapEx Reserve (%)",
    holdingYears: "Holding Period (years)",
    sellingCostPct: "Selling Costs (%)",
    appreciationRate: "Appreciation (%/yr)",
    exitCapRate: "Exit Cap Rate (%)",
    lat: "Latitude",
    lng: "Longitude",
    flipResalePrice: "Flip Resale Price ($)",
    flipMonthsHeld: "Flip Months Held",
    flipHoldingCostsMonthly: "Flip Holding Costs (monthly $)",
    flipExtraSellingCosts: "Flip Extra Selling Costs ($)",
    brrrrRefiLtvPct: "Refi LTV (%)",
    brrrrRefiCosts: "Refi Costs ($)",
    brrrrRefiRate: "Refi Rate (%)",
    brrrrRefiTermYears: "Refi Term (years)",
  };

  function clearResults(){
    if (mappedRoot) mappedRoot.innerHTML = "";
    if (unmappedEl) unmappedEl.textContent = "";
    if (applyBtn) applyBtn.disabled = true;
  }

  function createMapRow(item){
    const row = document.createElement("div");
    row.className = "mapRow";
    row.dataset.field = item.field;
    row.dataset.type = item.type || "number";

    const top = document.createElement("div");
    top.className = "mapRow__top";

    const label = document.createElement("div");
    label.className = "mapLabel";
    label.textContent = FIELD_LABELS[item.field] || item.field;

    const input = document.createElement("input");
    input.className = "field field--sm";
    if (row.dataset.type === "text"){
      input.type = "text";
      input.value = (item.value ?? "").toString();
    } else {
      input.type = "number";
      input.step = "0.01";
      input.value = (Number.isFinite(Number(item.value)) ? String(item.value) : "");
    }

    const remove = document.createElement("button");
    remove.className = "mapRemove";
    remove.type = "button";
    remove.title = "Ignore this mapping";
    remove.textContent = "✕";
    remove.addEventListener("click", () => {
      row.classList.toggle("ignored");
      remove.textContent = row.classList.contains("ignored") ? "↺" : "✕";
      remove.title = row.classList.contains("ignored") ? "Restore this mapping" : "Ignore this mapping";
      refreshApplyEnabled();
    });

    top.appendChild(label);
    top.appendChild(input);
    top.appendChild(remove);

    const meta = document.createElement("div");
    meta.className = "mapMeta";
    meta.textContent = item.raw ? `From: ${item.raw}` : "From: (parser)";
    row.appendChild(top);
    row.appendChild(meta);
    return row;
  }

  function refreshApplyEnabled(){
    if (!applyBtn || !mappedRoot) return;
    const rows = Array.from(mappedRoot.querySelectorAll(".mapRow")).filter(r => !r.classList.contains("ignored"));
    applyBtn.disabled = rows.length === 0;
  }

  function renderParseResult(res){
    if (!mappedRoot || !unmappedEl) return;
    mappedRoot.innerHTML = "";

    const mapped = res?.mapped || [];
    if (mapped.length === 0){
      mappedRoot.innerHTML = `<div class="hint">No fields recognized yet. Tip: add “Label: value” lines (Rent: 2800/mo) or include keywords like “price”, “rent”, “taxes”, “rate”, “down”.</div>`;
    } else {
      mapped.forEach(item => mappedRoot.appendChild(createMapRow(item)));
    }

    const unmapped = res?.unmapped || [];
    if (unmapped.length === 0) unmappedEl.textContent = "—";
    else {
      const max = 90;
      const slice = unmapped.slice(0, max);
      unmappedEl.textContent = slice.join("\n") + (unmapped.length > max ? `\n… (${unmapped.length - max} more)` : "");
    }

    refreshApplyEnabled();
  }

  clearResults();

  parseBtn?.addEventListener("click", () => {
    const text = ta?.value || "";
    const res = importTextToPatch(text);
    renderParseResult(res);
    setStatus("Parsed import text. Review mapped fields, then Apply.", false);
  });

  clearBtn?.addEventListener("click", () => {
    if (ta) ta.value = "";
    clearResults();
    setStatus("Cleared import box.", false);
  });

  applyBtn?.addEventListener("click", () => {
    if (!mappedRoot) return;
    const patch = {};

    Array.from(mappedRoot.querySelectorAll(".mapRow")).forEach(row => {
      if (row.classList.contains("ignored")) return;
      const field = row.dataset.field;
      const type = row.dataset.type || "number";
      const input = row.querySelector("input,textarea,select");
      if (!input) return;

      if (type === "text"){
        const v = (input.value || "").trim();
        if (v !== "") patch[field] = v;
        return;
      }

      const num = (input.value === "" ? NaN : Number(input.value));
      if (Number.isFinite(num)) patch[field] = num;
    });

    if (Object.keys(patch).length === 0){
      setStatus("Nothing to apply (all rows ignored or empty).", true);
      return;
    }

    onApply?.(patch);
    clearResults();
  });
}


// --- UX helpers: collapsible inputs, search, and missing/warning indicators ---

let _issuesCache = [];

export function setDirtyPill(isDirty){
  const el = qs("#pillDirty");
  if (!el) return;
  el.textContent = isDirty ? "Editing…" : "Saved";
  el.classList.toggle("good", !isDirty);
}

/** Call once after DOM is ready */
export function enhanceInputsUX(){
  enhanceCollapsibleCards();
  bindInputsSearch();
  bindIssuesButton();
}

/** Call whenever state changes */
export function refreshIssuesUI(state){
  _issuesCache = computeIssues(state);
  applyIssueStyles(_issuesCache);
  updateIssuesPill(_issuesCache);
  if (qs("#issuesModal")?.getAttribute("aria-hidden") === "false") renderIssuesList();
}

function enhanceCollapsibleCards(){
  const tab = qs("#tab-inputs");
  if (!tab) return;

  qsa(".card", tab).forEach(card => {
    if (card.querySelector(".card__head")) return; // already enhanced
    const h2 = card.querySelector(":scope > h2");
    if (!h2) return;

    const head = document.createElement("div");
    head.className = "card__head";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cardToggle";
    toggle.textContent = "▾";
    toggle.title = "Collapse/expand";
    toggle.setAttribute("aria-label", "Collapse/expand section");

    // Wrap existing content (everything except h2) into body
    const body = document.createElement("div");
    body.className = "card__body";

    const children = Array.from(card.children);
    children.forEach(ch => {
      if (ch === h2) return;
      body.appendChild(ch);
    });

    // Rebuild card DOM
    card.innerHTML = "";
    head.appendChild(h2);
    head.appendChild(toggle);
    card.appendChild(head);
    card.appendChild(body);

    // Restore collapsed state
    const key = "reia_collapsed_" + (h2.textContent || "").toLowerCase().replace(/\s+/g,"_");
    const isCollapsed = sessionStorage.getItem(key) === "1";
    if (isCollapsed) card.classList.add("collapsed");
    toggle.textContent = card.classList.contains("collapsed") ? "▸" : "▾";

    toggle.addEventListener("click", () => {
      card.classList.toggle("collapsed");
      const c = card.classList.contains("collapsed");
      toggle.textContent = c ? "▸" : "▾";
      sessionStorage.setItem(key, c ? "1" : "0");
    });
  });

  // Expand/collapse all
  qs("#btnExpandAll")?.addEventListener("click", () => {
    qsa(".card", tab).forEach(card => card.classList.remove("collapsed"));
    qsa(".cardToggle", tab).forEach(t => t.textContent = "▾");
  });
  qs("#btnCollapseAll")?.addEventListener("click", () => {
    qsa(".card", tab).forEach(card => card.classList.add("collapsed"));
    qsa(".cardToggle", tab).forEach(t => t.textContent = "▸");
  });
}

function bindInputsSearch(){
  const input = qs("#inputSearch");
  if (!input) return;

  let hits = [];
  let idx = -1;

  function clearHits(){
    qsa(".search-hit").forEach(el => el.classList.remove("search-hit","active"));
    hits = [];
    idx = -1;
    qs("#searchMeta") && (qs("#searchMeta").textContent = "0");
  }

  function expandTo(el){
    const card = el.closest(".card");
    if (card && card.classList.contains("collapsed")){
      card.classList.remove("collapsed");
      const t = card.querySelector(".cardToggle");
      if (t) t.textContent = "▾";
    }
  }

  function focusHit(i){
    if (!hits.length) return;
    idx = (i + hits.length) % hits.length;
    hits.forEach(h => h.classList.remove("active"));
    const el = hits[idx];
    el.classList.add("active");
    expandTo(el);
    el.scrollIntoView({ behavior:"smooth", block:"center" });
    setTimeout(() => el.focus?.(), 100);
    const meta = qs("#searchMeta");
    if (meta) meta.textContent = `${idx+1} / ${hits.length}`;
  }

  function run(){
    const q = (input.value || "").trim().toLowerCase();
    clearHits();
    if (q.length < 2) return;

    const labels = qsa("#tab-inputs .label");
    for (const lab of labels){
      const txt = lab.textContent?.toLowerCase() || "";
      const field = lab.querySelector("[data-field]")?.getAttribute("data-field") || "";
      if (txt.includes(q) || field.toLowerCase().includes(q)){
        const control = lab.querySelector("input,select,textarea");
        if (control){
          control.classList.add("search-hit");
          hits.push(control);
        }
      }
    }

    const meta = qs("#searchMeta");
    if (meta) meta.textContent = hits.length ? `1 / ${hits.length}` : "0";
    if (hits.length) focusHit(0);
  }

  input.addEventListener("input", () => run());
  qs("#btnSearchNext")?.addEventListener("click", () => focusHit(idx + 1));
  qs("#btnSearchPrev")?.addEventListener("click", () => focusHit(idx - 1));
}

function bindIssuesButton(){
  qs("#btnIssues")?.addEventListener("click", () => {
    renderIssuesList();
    openModal("issuesModal");
  });
}

function updateIssuesPill(issues){
  const btn = qs("#btnIssues");
  if (!btn) return;

  const missing = issues.filter(x => x.level === "missing");
  const warn = issues.filter(x => x.level === "warn");

  btn.classList.remove("bad","warn","good");
  if (missing.length){
    btn.textContent = `Issues: ${missing.length} missing`;
    btn.classList.add("bad");
  } else if (warn.length){
    btn.textContent = `Issues: ${warn.length} warnings`;
    btn.classList.add("warn");
  } else {
    btn.textContent = "Issues: 0";
    btn.classList.add("good");
  }
}

function computeIssues(state){
  const issues = [];

  // Required (for meaningful outputs)
  const required = [
    { field:"purchasePrice", label:"Purchase Price", min: 1 },
    { field:"rentMonthly", label:"Rent", min: 1 },
    { field:"termYears", label:"Term (years)", min: 1 },
  ];

  for (const r of required){
    const num = Number(state?.[r.field]);
    if (!Number.isFinite(num) || num < r.min){
      issues.push({ level:"missing", field: r.field, title: `${r.label} is missing`, detail:"Fill this in for reliable calculations." });
    }
  }

  // Financing sanity
  const down = Number(state?.downPaymentPct);
  const rate = Number(state?.interestRate);

  if (Number.isFinite(down) && down === 0){
    issues.push({ level:"warn", field:"downPaymentPct", title:"Down payment is 0%", detail:"If this isn't an all-cash deal, set a down payment %." });
  }
  if (Number.isFinite(rate) && rate === 0 && (!Number.isFinite(down) || down < 99.9)){
    issues.push({ level:"warn", field:"interestRate", title:"Interest rate is 0%", detail:"If financing is involved, enter an interest rate." });
  }

  // Helpful warnings
  if ((state?.propertyTaxesAnnual ?? 0) === 0){
    issues.push({ level:"warn", field:"propertyTaxesAnnual", title:"Taxes are 0", detail:"If unknown, estimate taxes (annual) for more accurate NOI and cash flow." });
  }
  if ((state?.insuranceAnnual ?? 0) === 0){
    issues.push({ level:"warn", field:"insuranceAnnual", title:"Insurance is 0", detail:"If unknown, estimate insurance (annual) for more accurate NOI and cash flow." });
  }
  if ((state?.vacancyPct ?? 0) === 0){
    issues.push({ level:"warn", field:"vacancyPct", title:"Vacancy is 0%", detail:"Most rentals have some vacancy. 3–8% is common depending on market." });
  }
  if ((state?.address || "").trim() && (state?.lat == null || state?.lng == null)){
    issues.push({ level:"warn", field:"address", title:"Map pin not set", detail:"Click “Use address” in Location to geocode the map pin." });
  }

  return issues;
}


function applyIssueStyles(issues){
  // Clear previous indicators
  qsa(".label__msg").forEach(n => n.remove());
  qsa("[data-field]").forEach(el => el.classList.remove("field--missing","field--warn"));

  for (const issue of issues){
    const el = qs(`[data-field="${issue.field}"]`);
    if (!el) continue;

    el.classList.add(issue.level === "missing" ? "field--missing" : "field--warn");

    const lab = el.closest(".label");
    if (lab){
      const msg = document.createElement("div");
      msg.className = "label__msg" + (issue.level === "warn" ? " warn" : "");
      msg.textContent = issue.title;
      lab.appendChild(msg);
    }
  }
}

function renderIssuesList(){
  const root = qs("#issuesList");
  if (!root) return;

  if (!_issuesCache.length){
    root.innerHTML = `<div class="hint">No issues detected.</div>`;
    return;
  }

  root.innerHTML = "";
  _issuesCache.forEach(issue => {
    const item = document.createElement("div");
    item.className = "issueItem " + (issue.level === "missing" ? "bad" : "warn");
    item.tabIndex = 0;

    const t = document.createElement("div");
    t.className = "issueItem__t";
    t.textContent = issue.title;

    const d = document.createElement("div");
    d.className = "issueItem__d";
    d.textContent = issue.detail || "";

    item.appendChild(t);
    item.appendChild(d);

    item.addEventListener("click", () => jumpToField(issue.field));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") jumpToField(issue.field);
    });

    root.appendChild(item);
  });
}

function jumpToField(field){
  const locFields = new Set(["address","lat","lng"]);
  const targetTab = locFields.has(field) ? "location" : "inputs";

  document.querySelector(`[data-tab="${targetTab}"]`)?.click?.();

  setTimeout(() => {
    const el = qs(`[data-field="${field}"]`);
    if (!el) return;

    const card = el.closest(".card");
    if (card && card.classList.contains("collapsed")){
      card.classList.remove("collapsed");
      const t = card.querySelector(".cardToggle");
      if (t) t.textContent = "▾";
    }

    el.scrollIntoView({ behavior:"smooth", block:"center" });
    setTimeout(() => el.focus?.(), 120);
  }, 30);

  closeModal("issuesModal");
}

