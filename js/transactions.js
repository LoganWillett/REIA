/**
 * File: transactions.js
 * Purpose:
 *   Offline-first "actuals" storage + rollups.
 *   - Store transactions in localStorage
 *   - Store keyword rules for auto-categorization
 *   - Provide helpers to roll up by month/property for the Actuals tab
 */
const TX_KEY = "reia_transactions_v1";
const RULES_KEY = "reia_tx_rules_v1";

// Default category list (Schedule-E-ish buckets + common landlord categories)
export const DEFAULT_CATEGORIES = [
  "Rent",
  "Other Income",
  "Advertising",
  "Cleaning and Maintenance",
  "Commissions",
  "Insurance",
  "Legal and Professional",
  "Management Fees",
  "Mortgage Interest",
  "Other Interest",
  "Repairs",
  "Supplies",
  "Taxes",
  "Utilities",
  "HOA",
  "CapEx",
  "Travel",
  "Other"
];

function safeJsonParse(s, fallback){
  try{ return JSON.parse(s); }catch{ return fallback; }
}

export function loadTransactions(){
  return safeJsonParse(localStorage.getItem(TX_KEY) || "[]", []).map(normalizeTx);
}
export function saveTransactions(items){
  localStorage.setItem(TX_KEY, JSON.stringify(items.map(normalizeTx)));
}
export function clearTransactions(){
  localStorage.removeItem(TX_KEY);
}

export function loadRules(){
  return safeJsonParse(localStorage.getItem(RULES_KEY) || "[]", []);
}
export function saveRules(rules){
  localStorage.setItem(RULES_KEY, JSON.stringify(rules || []));
}

// Normalize/validate a transaction record
export function normalizeTx(tx){
  const t = tx || {};
  // date stored as YYYY-MM-DD for predictable month bucketing
  const date = String(t.date || "").slice(0,10);
  const amount = Number(t.amount);
  return {
    id: t.id || ("tx_" + Math.random().toString(36).slice(2) + "_" + Date.now()),
    date: date || new Date().toISOString().slice(0,10),
    desc: String(t.desc || ""),
    amount: Number.isFinite(amount) ? amount : 0,
    type: (t.type === "income" || t.type === "expense" || t.type === "debt") ? t.type : "expense",
    category: String(t.category || "Other"),
    propertyId: t.propertyId || "unassigned"
  };
}

// Apply keyword rules (case-insensitive contains match) to assign category
export function applyRulesToTx(tx, rules){
  const desc = (tx.desc || "").toLowerCase();
  for (const r of (rules || [])){
    const needle = String(r.needle || "").trim().toLowerCase();
    if (!needle) continue;
    if (desc.includes(needle)){
      return { ...tx, category: r.category || tx.category };
    }
  }
  return tx;
}

// Minimal CSV parser (handles quotes). Returns rows of strings.
export function parseCSV(text){
  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i=0;i<text.length;i++){
    const ch = text[i];
    const next = text[i+1];
    if (inQ){
      if (ch === '"' && next === '"'){ cell += '"'; i++; continue; }
      if (ch === '"'){ inQ = false; continue; }
      cell += ch;
    }else{
      if (ch === '"'){ inQ = true; continue; }
      if (ch === ','){ row.push(cell); cell=""; continue; }
      if (ch === '\n'){
        row.push(cell); cell="";
        // ignore blank trailing rows
        if (row.some(c => String(c).trim() !== "")) rows.push(row);
        row = [];
        continue;
      }
      if (ch === '\r') continue;
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some(c => String(c).trim() !== "")) rows.push(row);
  return rows;
}

// Parse a CSV into transactions using a best-effort heuristic mapping.
// Expected headers typically include: date, description, amount OR debit/credit.
export function csvToTransactions(csvText){
  const rows = parseCSV(csvText);
  if (!rows.length) return [];
  const headers = rows[0].map(h => String(h||"").trim().toLowerCase());
  const idx = (needle) => headers.findIndex(h => h === needle || h.includes(needle));
  const iDate = idx("date");
  const iDesc = idx("description") >= 0 ? idx("description") : idx("memo");
  const iAmt = idx("amount");
  const iDebit = idx("debit");
  const iCredit = idx("credit");

  const txs = [];
  for (let r=1;r<rows.length;r++){
    const row = rows[r];
    const rawDate = row[iDate] || "";
    const rawDesc = row[iDesc] || "";
    let amt = 0;

    if (iAmt >= 0){
      amt = Number(String(row[iAmt]).replace(/[^0-9\.-]/g,""));
    }else{
      const d = iDebit >= 0 ? Number(String(row[iDebit]).replace(/[^0-9\.-]/g,"")) : 0;
      const c = iCredit >= 0 ? Number(String(row[iCredit]).replace(/[^0-9\.-]/g,"")) : 0;
      // convention: credit positive, debit negative
      amt = (Number.isFinite(c) ? c : 0) - (Number.isFinite(d) ? d : 0);
    }

    const date = guessISODate(rawDate);
    const base = normalizeTx({ date, desc: rawDesc, amount: Number.isFinite(amt)?amt:0 });

    // type inference: positive => income, negative => expense
    const inferredType = base.amount >= 0 ? "income" : "expense";
    txs.push({ ...base, type: inferredType });
  }
  return txs;
}

function guessISODate(s){
  const str = String(s||"").trim();
  // If already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  // Common US formats: M/D/YYYY or MM/DD/YYYY
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m){
    const mm = String(m[1]).padStart(2,"0");
    const dd = String(m[2]).padStart(2,"0");
    let yy = m[3];
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm}-${dd}`;
  }
  // Fallback: today's date
  return new Date().toISOString().slice(0,10);
}

function monthKey(isoDate){
  const d = String(isoDate||"").slice(0,10);
  return d.slice(0,7); // YYYY-MM
}

export function rollupByMonth(items, { propertyId="all" } = {}){
  const buckets = new Map();
  for (const raw of (items || [])){
    const tx = normalizeTx(raw);
    if (propertyId !== "all" && tx.propertyId !== propertyId) continue;
    const mk = monthKey(tx.date);
    if (!buckets.has(mk)){
      buckets.set(mk, { month: mk, income:0, expense:0, debt:0, count:0 });
    }
    const b = buckets.get(mk);
    const amt = Number(tx.amount) || 0;
    if (tx.type === "income") b.income += amt;
    else if (tx.type === "debt") b.debt += Math.abs(amt);
    else b.expense += Math.abs(amt);
    b.count += 1;
  }
  const arr = Array.from(buckets.values()).sort((a,b)=>a.month.localeCompare(b.month));
  return arr.map(b => ({
    ...b,
    noi: b.income - b.expense,
    cashflow: b.income - b.expense - b.debt
  }));
}

export function toMonthlyCSV(months){
  const lines = ["Month,Transactions,Income,Expenses,Debt,NOI,Cash Flow"];
  for (const m of (months||[])){
    lines.push([m.month, m.count, m.income, m.expense, m.debt, m.noi, m.cashflow].join(","));
  }
  return lines.join("\n");
}
