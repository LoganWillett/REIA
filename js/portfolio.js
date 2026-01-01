import { proformaAnnual, money, pct } from "./calcs.js";
import { makeId, loadPortfolio, savePortfolio } from "./state.js";
import { qs } from "./ui.js";

export function saveCurrentToPortfolio(state){
  const list = loadPortfolio();
  const pf = proformaAnnual(state);
  const item = {
    id: makeId(),
    ts: Date.now(),
    propertyName: state.propertyName || "(Untitled)",
    address: state.address || "",
    purchasePrice: state.purchasePrice,
    rentMonthly: state.rentMonthly,
    cashflow: pf.cashflow,
    capRate: pf.capRate,
    coc: pf.coc,
    snapshot: state,
  };
  list.unshift(item);
  savePortfolio(list);
  return list;
}

export function deleteFromPortfolio(id){
  const list = loadPortfolio().filter(x => x.id !== id);
  savePortfolio(list);
  return list;
}

export function renderPortfolio(list, onLoad, onDelete){
  if (!Array.isArray(list)) list = [];
  const table = `
    <table>
      <thead><tr>
        <th>Name</th><th>Purchase</th><th>Rent/mo</th><th>Cash Flow/yr</th><th>Cap</th><th>CoC</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${list.map(x => `
          <tr>
            <td>${x.propertyName}</td>
            <td>${money(x.purchasePrice)}</td>
            <td>${money(x.rentMonthly)}</td>
            <td>${money(x.cashflow)}</td>
            <td>${pct(x.capRate*100)}</td>
            <td>${pct(x.coc*100)}</td>
            <td>
              <button class="btn btn--small" data-load="${x.id}">Load</button>
              <button class="btn btn--danger btn--small" data-del="${x.id}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
  qs("#portfolioTable").innerHTML = table;

  qs("#portfolioTable").querySelectorAll("[data-load]").forEach(b => {
    b.addEventListener("click", () => onLoad?.(b.getAttribute("data-load")));
  });
  qs("#portfolioTable").querySelectorAll("[data-del]").forEach(b => {
    b.addEventListener("click", () => onDelete?.(b.getAttribute("data-del")));
  });
}

export function renderPortfolioSummary(list){
  const sum = (arr, f) => arr.reduce((a,x)=>a+f(x),0);
  const totalPurchase = sum(list, x => Number(x.purchasePrice)||0);
  const totalRentMo   = sum(list, x => Number(x.rentMonthly)||0);
  const totalCF       = sum(list, x => Number(x.cashflow)||0);

  const cards = [
    { k:"Properties", v: String(list.length), s:"Saved locally" },
    { k:"Total Purchase", v: money(totalPurchase), s:"Sum of purchase prices" },
    { k:"Total Rent/mo", v: money(totalRentMo), s:"Sum of current rent" },
    { k:"Total Cash Flow/yr", v: money(totalCF), s:"Sum of annual CF" },
  ];

  qs("#portfolioSummary").innerHTML = cards.map(x => `
    <div class="kpi">
      <div class="k">${x.k}</div>
      <div class="v">${x.v}</div>
      <div class="s">${x.s}</div>
    </div>
  `).join("");
}
