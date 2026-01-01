function n(v){ return Number.isFinite(v) ? v : 0; }
export function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }

export function money(v){
  const x = n(v);
  return x.toLocaleString(undefined, { style:"currency", currency:"USD", maximumFractionDigits:0 });
}
export function money2(v){
  const x = n(v);
  return x.toLocaleString(undefined, { style:"currency", currency:"USD", maximumFractionDigits:2 });
}
export function pct(v){
  const x = n(v);
  return x.toFixed(2) + "%";
}

export function monthlyPayment(loanAmount, annualRatePct, termYears){
  const P = n(loanAmount);
  const r = n(annualRatePct)/100/12;
  const N = Math.round(n(termYears)*12);
  if (P <= 0 || N <= 0) return 0;
  if (r === 0) return P / N;
  return P * (r * Math.pow(1+r, N)) / (Math.pow(1+r, N) - 1);
}

export function amortSchedule(loanAmount, annualRatePct, termYears){
  const P0 = n(loanAmount);
  const r = n(annualRatePct)/100/12;
  const N = Math.round(n(termYears)*12);
  const pay = monthlyPayment(P0, annualRatePct, termYears);

  let bal = P0;
  const out = [];
  for (let m=1; m<=N; m++){
    const interest = bal * r;
    const principal = Math.max(0, pay - interest);
    bal = Math.max(0, bal - principal);
    out.push({ month:m, payment:pay, principal, interest, balance:bal });
    if (bal <= 0.005) break;
  }
  return out;
}

export function computeLoanAmount(state){
  // If loanAmount is null, compute from purchasePrice and downPaymentPct.
  if (state.loanAmount !== null && Number.isFinite(Number(state.loanAmount))){
    return n(state.loanAmount);
  }
  const purchase = n(state.purchasePrice);
  const down = clamp(n(state.downPaymentPct)/100, 0, 1);
  return purchase * (1 - down);
}

export function totalCashInvested(state){
  const purchase = n(state.purchasePrice);
  const down = purchase - computeLoanAmount(state);
  const points = computeLoanAmount(state) * (n(state.pointsPct)/100);
  return down + n(state.closingCosts) + n(state.rehabCosts) + n(state.loanFees) + points;
}

export function sumLines(lines){
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((a, x) => a + n(x?.amount), 0);
}

export function proformaAnnual(state){
  const rent = n(state.rentMonthly) * 12;
  const otherIncome = sumLines(state.otherIncomeLines) * 12;
  const gsi = rent + otherIncome;

  const vacancy = gsi * clamp(n(state.vacancyPct)/100, 0, 0.9);
  const egi = gsi - vacancy;

  const taxes = n(state.propertyTaxesAnnual);
  const ins = n(state.insuranceAnnual);
  const hoa = n(state.hoaMonthly) * 12;
  const util = n(state.utilitiesMonthly) * 12;

  // percent-of-income buckets (use GSI as base)
  const mgmt = gsi * clamp(n(state.managementPct)/100, 0, 0.9);
  const maint = gsi * clamp(n(state.maintenancePct)/100, 0, 0.9);
  const capex = gsi * clamp(n(state.capexPct)/100, 0, 0.9);

  const otherExp = sumLines(state.otherExpenseLines) * 12;

  const opex = taxes + ins + hoa + util + mgmt + maint + capex + otherExp;
  const noi = egi - opex;

  const loan = computeLoanAmount(state);
  const ds = monthlyPayment(loan, n(state.interestRate), n(state.termYears)) * 12;
  const cashflow = noi - ds;

  const capRate = (n(state.purchasePrice) > 0) ? (noi / n(state.purchasePrice)) : 0;
  const coc = (totalCashInvested(state) > 0) ? (cashflow / totalCashInvested(state)) : 0;
  const dscr = (ds > 0) ? (noi / ds) : 0;
  const breakevenOcc = (gsi > 0) ? ((opex + ds) / gsi) : 0;

  return {
    gsi, vacancy, egi,
    taxes, ins, hoa, util,
    mgmt, maint, capex, otherExp,
    opex, noi, ds, cashflow,
    capRate, coc, dscr, breakevenOcc
  };
}

export function flipResults(state){
  const sale = n(state.flipResalePrice);
  const months = n(state.flipMonthsHeld);

  const purchase = n(state.purchasePrice);
  const closing = n(state.closingCosts);
  const rehab = n(state.rehabCosts);

  const holding = n(state.flipHoldingCostsMonthly) * months;

  const sellingPct = clamp(n(state.sellingCostPct)/100, 0, 0.25);
  const selling = sale * sellingPct + n(state.flipExtraSellingCosts);

  const loan = computeLoanAmount(state);
  // rough payoff: use remaining balance after months on original loan
  const sched = amortSchedule(loan, n(state.interestRate), n(state.termYears));
  const bal = (months <= 0) ? loan : (sched[Math.min(months, sched.length)-1]?.balance ?? 0);

  // Total cost basis: cash invested + holding + selling + payoff
  const invested = totalCashInvested(state);
  const profit = sale - selling - holding - bal - (purchase - loan); // adjust for equity? keep simple

  // More interpretable:
  const totalOut = (purchase - loan) + closing + rehab + n(state.loanFees) + (loan * n(state.pointsPct)/100) + holding;
  const netProceeds = sale - selling - bal;
  const profit2 = netProceeds - totalOut;
  const roi = (totalOut > 0) ? (profit2 / totalOut) : 0;

  return { sale, months, holding, selling, loanBalance: bal, totalOut, netProceeds, profit: profit2, roi };
}

export function brrrrResults(state){
  const appraised = n(state.afterRepairValue) || n(state.purchasePrice);
  const ltv = clamp(n(state.brrrrRefiLtvPct)/100, 0, 1);
  const newLoan = appraised * ltv;

  const origLoan = computeLoanAmount(state);
  // assume refi happens after rehab, before much amortization
  const payoff = origLoan;

  const cashOut = Math.max(0, newLoan - payoff - n(state.brrrrRefiCosts));
  const invested = totalCashInvested(state);
  const cashLeftIn = invested - cashOut;

  const newPmt = monthlyPayment(newLoan, n(state.brrrrRefiRate), n(state.brrrrRefiTermYears)) * 12;
  const pf = proformaAnnual(state);
  const cashflowAfterRefi = pf.noi - newPmt;
  const cocAfterRefi = (cashLeftIn > 0) ? (cashflowAfterRefi / cashLeftIn) : 0;

  return { appraised, newLoan, payoff, cashOut, cashLeftIn, newPmt, cashflowAfterRefi, cocAfterRefi };
}

/** Normal distribution via Box–Muller. */
export function randn(){
  let u=0, v=0;
  while(u===0) u=Math.random();
  while(v===0) v=Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0*Math.PI*v);
}

export function parseMeanStd(str){
  // "3 ± 2" or "3+/-2" or "3,2"
  const s = (str ?? "").toString().replace(/\s/g,"");
  const pm = s.split("±");
  if (pm.length === 2) return { mean: Number(pm[0]), std: Number(pm[1]) };
  const alt = s.split("+/-");
  if (alt.length === 2) return { mean: Number(alt[0]), std: Number(alt[1]) };
  const comma = s.split(",");
  if (comma.length === 2) return { mean: Number(comma[0]), std: Number(comma[1]) };
  const mean = Number(s);
  return { mean, std: 0 };
}

/** Compute IRR (annual) for irregular cash flows at yearly spacing. */
export function irr(cashflows){
  // cashflows: [t0, t1, ...] where t0 is negative typically
  // Use Newton with fallback bisection
  const maxIter = 80;
  const eps = 1e-7;
  function npv(r){
    let s=0;
    for(let t=0; t<cashflows.length; t++){
      s += cashflows[t] / Math.pow(1+r, t);
    }
    return s;
  }
  function dnpv(r){
    let s=0;
    for(let t=1; t<cashflows.length; t++){
      s += -t * cashflows[t] / Math.pow(1+r, t+1);
    }
    return s;
  }

  let r = 0.1;
  for(let i=0;i<maxIter;i++){
    const f = npv(r);
    const df = dnpv(r);
    if (Math.abs(f) < eps) return r;
    if (Math.abs(df) < 1e-12) break;
    const nr = r - f/df;
    if (!Number.isFinite(nr)) break;
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }

  // bisection on [-0.95, 5]
  let lo = -0.95, hi = 5;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return NaN;

  for(let i=0;i<120;i++){
    const mid = (lo+hi)/2;
    const fmid = npv(mid);
    if (Math.abs(fmid) < eps) return mid;
    if (flo * fmid < 0){ hi = mid; fhi = fmid; }
    else { lo = mid; flo = fmid; }
  }
  return (lo+hi)/2;
}

export function quantile(sorted, q){
  if (sorted.length === 0) return NaN;
  const p = (sorted.length-1) * q;
  const i = Math.floor(p);
  const f = p - i;
  if (i+1 >= sorted.length) return sorted[i];
  return sorted[i]*(1-f) + sorted[i+1]*f;
}
