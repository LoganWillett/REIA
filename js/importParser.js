import { defaultState } from "./state.js";

/**
 * Text import parser:
 * - Accepts JSON exports (single-property)
 * - Accepts key:value lines
 * - Accepts messy paragraphs (keyword + number hunting)
 *
 * Returns:
 *  { patch, mapped:[{field,value,raw,type}], unmapped:[rawLine], notes:[...] }
 */

const KEYMAP = [
  // property / acquisition
  { keys: ["purchaseprice","price","pp","asking","ask","listprice","saleprice"], field: "purchasePrice" },
  { keys: ["closingcosts","closing"], field: "closingCosts" },
  { keys: ["rehab","rehabcosts","repairs"], field: "rehabCosts" },
  { keys: ["arv","afterrepairvalue","appraisal","value"], field: "afterRepairValue" },
  { keys: ["address","location"], field: "address", type:"text" },
  { keys: ["name","propertyname","title"], field: "propertyName", type:"text" },
  { keys: ["units","doors"], field: "units" },

  // financing
  { keys: ["down","downpayment","downpaymentpct","dp"], field: "downPaymentPct", pct: true },
  { keys: ["rate","interestrate","apr"], field: "interestRate", pct: true },
  { keys: ["term","termyears"], field: "termYears" },
  { keys: ["points","pointspct"], field: "pointsPct", pct: true },
  { keys: ["loanfees","fees"], field: "loanFees" },
  { keys: ["loanamount","loan"], field: "loanAmount" },

  // income/expenses
  { keys: ["rent","rentmonthly","monthlyrent","grossrent"], field: "rentMonthly", moneyish: true },
  { keys: ["taxes","propertytaxes","tax"], field: "propertyTaxesAnnual", annual: true },
  { keys: ["insurance","ins"], field: "insuranceAnnual", annual: true },
  { keys: ["hoa"], field: "hoaMonthly", moneyish: true },
  { keys: ["utilities","util"], field: "utilitiesMonthly", moneyish: true },

  { keys: ["vacancy","vacancypct"], field: "vacancyPct", pct: true },
  { keys: ["management","mgmt","managementpct"], field: "managementPct", pct: true },
  { keys: ["maintenance","maint","maintenancepct"], field: "maintenancePct", pct: true },
  { keys: ["capex","capexpct"], field: "capexPct", pct: true },

  // exit
  { keys: ["holding","holdingyears","yearsheld"], field: "holdingYears" },
  { keys: ["sellingcosts","selling","sellingcostpct"], field: "sellingCostPct", pct: true },
  { keys: ["appreciation","appreciationrate"], field: "appreciationRate", pct: true },
  { keys: ["exitcap","exitcaprate"], field: "exitCapRate", pct: true },

  // coords
  { keys: ["lat","latitude"], field: "lat" },
  { keys: ["lng","lon","longitude"], field: "lng" },

  // flip
  { keys: ["resale","flipresaleprice","saleprice2"], field: "flipResalePrice" },
  { keys: ["monthsheld","flipmonthsheld"], field: "flipMonthsHeld" },
  { keys: ["holdingcostsmonthly","fliphld"], field: "flipHoldingCostsMonthly" },
  { keys: ["extrasellingcosts"], field: "flipExtraSellingCosts" },

  // brrrr
  { keys: ["refiltv","refiltvpct","ltv"], field: "brrrrRefiLtvPct", pct: true },
  { keys: ["reficosts"], field: "brrrrRefiCosts" },
  { keys: ["refirate"], field: "brrrrRefiRate", pct: true },
  { keys: ["refiterm","refitermyears"], field: "brrrrRefiTermYears" },
];

const FIELD_SPECS = Object.fromEntries(KEYMAP.map(x => [x.field, x]));

/** Normalize keys like "Purchase Price" -> "purchaseprice" */
function normKey(k){
  return (k ?? "").toString().toLowerCase().replace(/[^a-z0-9]/g,"");
}

/** Parse "$525k", "1.2m", "350,000", "6.75%" */
function parseScalarToken(raw){
  if (raw == null) return NaN;
  let s = raw.toString().trim().toLowerCase();
  if (!s) return NaN;

  // Remove common wrappers
  s = s.replace(/[\$,]/g,"").replace(/\s+/g,"");

  // Percent strip (handled by caller)
  s = s.replace(/%/g,"");

  // "525k" "1.2m"
  let mult = 1;
  if (s.endsWith("k")){
    mult = 1000;
    s = s.slice(0,-1);
  } else if (s.endsWith("m")){
    mult = 1000000;
    s = s.slice(0,-1);
  }

  const val = Number(s);
  if (!Number.isFinite(val)) return NaN;
  return val * mult;
}

function detectPeriodFlags(str){
  const s = (str ?? "").toLowerCase();
  const isMonthly = /\/mo|per\s*mo(nth)?|monthly|\bmo\b/.test(s);
  const isAnnual = /\/yr|per\s*yr|per\s*year|annual|\byr\b|\byear\b/.test(s);
  const isPct = /%|\bpercent\b/.test(s);
  return { isMonthly, isAnnual, isPct };
}

function guessPct(val, flags){
  // If "0.0675" with no % sign, assume 6.75
  if (flags.isPct) return val;
  if (val <= 1) return val * 100;
  return val;
}

function putBest(best, field, value, raw, type="number", conf=1){
  const prev = best[field];
  if (!prev || conf >= prev.conf){
    best[field] = { field, value, raw, type, conf };
  }
}

function keyValueParse(line, best){
  const m = line.match(/^([^:=-]{2,80})\s*[:=—-]\s*(.+)$/);
  if (!m) return false;

  const kRaw = m[1];
  const vRaw = m[2];
  const k = normKey(kRaw);

  const spec = KEYMAP.find(s => s.keys.includes(k));
  if (!spec) return false;

  if (spec.type === "text"){
    putBest(best, spec.field, vRaw.trim(), line, "text", 3);
    return true;
  }

  const flags = detectPeriodFlags(vRaw);
  const numMatch = vRaw.match(/-?\$?\s*\d[\d,]*(?:\.\d+)?\s*[km]?%?/i);
  if (!numMatch) return false;

  let v = parseScalarToken(numMatch[0]);
  if (!Number.isFinite(v)) return false;

  // Convert annual/monthly where necessary
  if (spec.annual){
    if (flags.isMonthly) v = v * 12;
  } else {
    // expects monthly (rent/hoa/utilities). If annual given, convert.
    if (flags.isAnnual) v = v / 12;
  }

  if (spec.pct) v = guessPct(v, flags);

  putBest(best, spec.field, v, line, "number", 3);
  return true;
}

function freeTextParse(line, best){
  const lower = line.toLowerCase();
  const flags = detectPeriodFlags(line);

  // Generic money/number token finder
  const token = lower.match(/-?\$?\s*\d[\d,]*(?:\.\d+)?\s*[km]?\s*%?/i);
  const num = token ? parseScalarToken(token[0]) : NaN;

  // Helper for money-like fields
  const addMoney = (field, conf=2, annual=false, monthly=false) => {
    if (!Number.isFinite(num)) return false;
    let v = num;

    // if caller forces annual/monthly adjustments:
    if (annual) {
      if (flags.isMonthly) v = v * 12;
    }
    if (monthly) {
      if (flags.isAnnual) v = v / 12;
    }

    const spec = FIELD_SPECS[field] || {};
    if (spec.pct) v = guessPct(v, flags);
    putBest(best, field, v, line, "number", conf);
    return true;
  };

  // Purchase price
  if (/(purchase\s*price|asking|ask\s*price|list\s*price|\bprice\b|sale\s*price)/.test(lower)){
    if (addMoney("purchasePrice", 2)) return true;
  }

  // ARV / value
  if (/\barv\b|after\s*repair|after-repair|appraisal|estimated\s*value|\bvalue\b/.test(lower)){
    if (addMoney("afterRepairValue", 2)) return true;
  }

  // Rent
  if (/\brent\b|monthly\s*rent|gross\s*rent/.test(lower)){
    // rent expects monthly; if line says annual, convert
    if (addMoney("rentMonthly", 2, false, true)) return true;
  }

  // Taxes / insurance (annual)
  if (/\btax(es)?\b|property\s*tax/.test(lower)){
    if (addMoney("propertyTaxesAnnual", 2, true, false)) return true;
  }
  if (/\binsurance\b/.test(lower)){
    if (addMoney("insuranceAnnual", 2, true, false)) return true;
  }

  // HOA / utilities (monthly)
  if (/\bhoa\b/.test(lower)){
    if (addMoney("hoaMonthly", 2, false, true)) return true;
  }
  if (/\butilit/.test(lower)){
    if (addMoney("utilitiesMonthly", 2, false, true)) return true;
  }

  // Rehab / closing costs
  if (/\brehab\b|repairs?|renovat/.test(lower)){
    if (addMoney("rehabCosts", 2)) return true;
  }
  if (/\bclosing\b/.test(lower)){
    if (addMoney("closingCosts", 2)) return true;
  }

  // Interest rate
  if (/\brate\b|interest|apr/.test(lower)){
    const rMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
    const rVal = rMatch ? Number(rMatch[1]) : (Number.isFinite(num) ? num : NaN);
    if (Number.isFinite(rVal)){
      putBest(best, "interestRate", guessPct(rVal, flags), line, "number", 2);
      return true;
    }
  }

  // Down payment
  if (/\bdown\b|down\s*payment|dp\b/.test(lower)){
    const pMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
    const pVal = pMatch ? Number(pMatch[1]) : (Number.isFinite(num) ? num : NaN);
    if (Number.isFinite(pVal)){
      putBest(best, "downPaymentPct", guessPct(pVal, flags), line, "number", 2);
      return true;
    }
  }

  // Term years
  if (/\bterm\b|\byear\s*loan\b|\byears?\b/.test(lower)){
    const tMatch = lower.match(/(\d+)\s*(?:years?|yr)/);
    const v = tMatch ? Number(tMatch[1]) : (Number.isFinite(num) ? num : NaN);
    if (Number.isFinite(v)){
      putBest(best, "termYears", v, line, "number", 2);
      return true;
    }
  }

  // Units
  if (/\bunits?\b|\bdoors?\b|duplex|triplex|fourplex/.test(lower)){
    let v = NaN;
    if (/duplex/.test(lower)) v = 2;
    if (/triplex/.test(lower)) v = 3;
    if (/fourplex/.test(lower)) v = 4;
    const uMatch = lower.match(/(\d+)\s*units?/);
    if (uMatch) v = Number(uMatch[1]);
    if (Number.isFinite(v)){
      putBest(best, "units", v, line, "number", 2);
      return true;
    }
  }

  // Address / name (simple heuristics)
  if (!best.address && /(address|\\bave\\b|\\bst\\b|\\bstreet\\b|\\brd\\b|\\broad\\b|\\bdr\\b|\\bdrive\\b)/.test(lower) && line.length <= 120){
    // Avoid false positives: must include a digit (street number) or a comma.
    if (/[0-9]/.test(line) || /,/.test(line)){
      putBest(best, "address", line.trim().replace(/^address\\s*[:=-]\\s*/i, ""), line, "text", 1);
      return true;
    }
  }

  return false;
}

export function importTextToPatch(text){
  const notes = [];
  const best = {};
  const unmapped = [];
  const mapped = [];
  const out = {};

  const t = (text ?? "").trim();
  if (!t) return { patch: {}, mapped: [], unmapped: [], notes: [] };

  // JSON path
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))){
    try{
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)){
        notes.push("Looks like an array (portfolio). Use Portfolio Import instead.");
        return { patch: {}, mapped: [], unmapped: [], notes };
      }
      const d = defaultState();
      for (const k of Object.keys(d)){
        if (k in parsed) out[k] = parsed[k];
      }
      for (const k of Object.keys(out)){
        mapped.push({ field: k, value: out[k], raw: "JSON", type: typeof out[k] === "string" ? "text" : "number" });
      }
      notes.push("Parsed JSON and mapped known fields.");
      return { patch: out, mapped, unmapped: [], notes };
    }catch{
      notes.push("Tried JSON parse but failed; treating as text.");
    }
  }

  const lines = t.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  for (const line of lines){
    // First try strict key:value lines
    const used = keyValueParse(line, best);
    if (!used){
      // Also split a long line into clauses for better matching, but keep original in unmapped if nothing matches.
      const clauses = line.split(/[;|•]+/).map(x => x.trim()).filter(Boolean);
      let any = false;

      for (const c of clauses){
        // Break further by sentence punctuation if it looks like a paragraph
        const parts = c.length > 80 ? c.split(/[.]/).map(x => x.trim()).filter(Boolean) : [c];
        for (const p of parts){
          if (freeTextParse(p, best)) any = true;
        }
      }

      if (!any) unmapped.push(line);
    }
  }

  // Build patch + mapped list
  for (const field of Object.keys(best)){
    out[field] = best[field].value;
    mapped.push({ field, value: best[field].value, raw: best[field].raw, type: best[field].type || "number" });
  }

  return { patch: out, mapped, unmapped, notes };
}
