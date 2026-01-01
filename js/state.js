const STORAGE_KEY = "reia_state_v1";
const PORTFOLIO_KEY = "reia_portfolio_v1";

/** Default state. Keep this small + sane, but comprehensive enough to be useful. */
export function defaultState() {
  return {
    propertyName: "",
    units: 1,
    propertyClass: "C",
    address: "",
    notes: "",

    purchasePrice: 350000,
    closingCosts: 8000,
    rehabCosts: 0,
    afterRepairValue: 350000,

    downPaymentPct: 25,
    interestRate: 6.75,
    termYears: 30,
    pointsPct: 0,
    loanFees: 0,
    loanAmount: null, // null = auto

    rentMonthly: 2800,
    otherIncomeLines: [
      // { label:"Parking", amount:50 }
    ],

    propertyTaxesAnnual: 3600,
    insuranceAnnual: 1200,
    hoaMonthly: 0,
    utilitiesMonthly: 0,

    vacancyPct: 5,
    managementPct: 8,
    maintenancePct: 5,
    capexPct: 5,
    otherExpenseLines: [
      // { label:"Lawn care", amount:80 }
    ],

    holdingYears: 10,
    sellingCostPct: 7,
    appreciationRate: 3,
    exitCapRate: 6.5,

    lat: null,
    lng: null,

    // Flip
    flipResalePrice: 420000,
    flipMonthsHeld: 6,
    flipHoldingCostsMonthly: 0,
    flipExtraSellingCosts: 0,

    // BRRRR
    brrrrRefiLtvPct: 75,
    brrrrRefiCosts: 6000,
    brrrrRefiRate: 6.5,
    brrrrRefiTermYears: 30,
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return { ...defaultState(), ...parsed };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

export function loadPortfolio() {
  try {
    const raw = localStorage.getItem(PORTFOLIO_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function savePortfolio(list) {
  localStorage.setItem(PORTFOLIO_KEY, JSON.stringify(list));
}

export function makeId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}
