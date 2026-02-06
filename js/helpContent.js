/**
 * helpContent.js
 * Purpose:
 *   Centralized help content for the ⓘ buttons across the app.
 */

// Centralized help content for the ⓘ buttons and Help modal.
// All HTML here is trusted (authored in-app). Do not paste untrusted user text into innerHTML.

export const HELP = {
  "global.about": {
    title: "What this tool is",
    body: `
      <p>This analyzer helps you evaluate a real-estate deal using a consistent workflow:</p>
      <ol>
        <li><b>Inputs</b> → Year‑1 pro forma (income, expenses, NOI, cash flow)</li>
        <li><b>Financing</b> → payment + amortization</li>
        <li><b>Flip</b> and <b>BRRRR</b> modeling (optional)</li>
        <li><b>Sensitivity</b> + <b>Monte Carlo</b> stress tests</li>
        <li><b>Portfolio</b> snapshots for comparing deals</li>
      </ol>
      <p>Everything runs locally in your browser. The map is for context only.</p>
    `
  },

  "global.howto": {
    title: "Quick workflow (recommended)",
    body: `
      <ol>
        <li>Start in <b>Inputs</b> and fill purchase, financing, rent, and expenses.</li>
        <li>Use <b>Location</b> to pin the property on the map (optional).</li>
        <li>Review <b>Pro Forma</b> and <b>Overview</b> KPIs/health checks.</li>
        <li>If relevant, model <b>Flip</b> or <b>BRRRR</b>.</li>
        <li>Stress test in <b>Sensitivity</b> and <b>Monte Carlo</b>.</li>
        <li>Click <b>Save</b> to store a snapshot in <b>Portfolio</b>.</li>
      </ol>
    `
  },

  // Overview
  "overview.keyMetrics": {
    title: "Key Metrics",
    body: `
      <p>This is the dashboard summary of your Year‑1 assumptions. Most metrics come from the Pro Forma.</p>
      <ul>
        <li><b>NOI</b> = Effective Gross Income − Operating Expenses (before mortgage).</li>
        <li><b>Cash flow</b> = NOI − annual debt service.</li>
        <li><b>DSCR</b> = NOI ÷ debt service (coverage cushion).</li>
        <li><b>Cap rate</b> ≈ NOI ÷ purchase price (simple yield proxy).</li>
        <li><b>Cash‑on‑cash</b> = annual cash flow ÷ cash invested.</li>
      </ul>
      <p>Use these to compare deals consistently—not as “truth.” Everything depends on assumptions.</p>
    `
  },
  "overview.quickNotes": {
    title: "Quick Notes",
    body: `
      <p>Write down your sources and assumptions (rent comps, insurance quotes, tax info, repair notes).</p>
      <p>Notes autosave locally with the deal.</p>
    `
  },
  "overview.healthChecks": {
    title: "Health Checks",
    body: `
      <p>These are quick warnings based on common failure points:</p>
      <ul>
        <li>Negative cash flow</li>
        <li>Low DSCR</li>
        <li>Missing cash invested (CoC becomes meaningless)</li>
      </ul>
      <p>If something looks bad, go to <b>Sensitivity</b> and stress test rent/vacancy first.</p>
    `
  },

  // Inputs
  "inputs.property": {
    title: "Property",
    body: `
      <p>Basic identifying info for the deal (name, unit count, class, address).</p>
      <p>Units/class are primarily for context and portfolio comparisons.</p>
    `
  },
  "inputs.acquisition": {
    title: "Acquisition",
    body: `
      <p>Cash you put into the deal on day one. This drives cash invested and many returns.</p>
      <ul>
        <li><b>Purchase price</b>: contract/offer price</li>
        <li><b>Closing costs</b>: buyer costs at purchase</li>
        <li><b>Rehab</b>: up‑front renovation budget</li>
        <li><b>ARV/Appraisal</b>: used heavily for BRRRR refi math</li>
      </ul>
    `
  },
  "inputs.financing": {
    title: "Financing",
    body: `
      <p>Loan assumptions determine payment and amortization.</p>
      <ul>
        <li><b>Down %</b>: equity at purchase</li>
        <li><b>Rate</b> and <b>term</b>: payment and payoff pace</li>
        <li><b>Fees/points</b>: add to cash invested and deal friction</li>
      </ul>
      <p>If you already know exact financing, you can override the loan amount.</p>
    `
  },
  "inputs.income": {
    title: "Income",
    body: `
      <p>Enter total scheduled rent and any other income.</p>
      <p>Vacancy/credit loss is applied to rent to estimate effective income.</p>
    `
  },
  "inputs.operating": {
    title: "Operating Expenses",
    body: `
      <p>Ongoing costs required to operate the property (before debt service).</p>
      <p>Percent‑of‑rent buckets (mgmt/maintenance/capex) are quick‑model tools—adjust as you learn the deal.</p>
    `
  },
  "inputs.exit": {
    title: "Exit Assumptions",
    body: `
      <p>Used mainly for scenario testing (Sensitivity/Monte Carlo) and exit math.</p>
      <ul>
        <li><b>Holding period</b>: years until sale</li>
        <li><b>Selling costs</b>: commissions + selling friction</li>
        <li><b>Appreciation</b>: price growth assumption</li>
        <li><b>Exit cap</b>: sell valuation based on NOI ÷ cap</li>
      </ul>
    `
  },

  // Location
  "location.mapContext": {
    title: "Map Context",
    body: `
      <p>The map is for geographic context only (no weather).</p>
      <p>Use address search to drop a pin; lat/lng are saved with the deal.</p>
      <p><b>Tip:</b> If you plan to publish this publicly, follow tile and attribution requirements.</p>
    `
  },
  "location.map": {
    title: "Map",
    body: `
      <p>Drag/zoom for context. The pin is your saved property location.</p>
    `
  },

  // Pro Forma
  "proforma.table": {
    title: "Income & Expenses (Annual)",
    body: `
      <p>A Year‑1 pro forma (operating statement):</p>
      <ul>
        <li><b>GSI</b> → <b>Vacancy</b> → <b>EGI</b></li>
        <li><b>Operating Expenses</b> → <b>NOI</b></li>
        <li><b>Debt service</b> → <b>Cash flow</b></li>
      </ul>
      <p>NOI is <i>before</i> mortgage payments. Cash flow is after payment.</p>
    `
  },
  "proforma.breakdown": {
    title: "Cash Flow Breakdown",
    body: `
      <p>A compact sanity check showing the same flow: income → NOI → payment → cash flow.</p>
    `
  },

  // Amortization
  "amort.schedule": {
    title: "Amortization Schedule",
    body: `
      <p>Month‑by‑month loan payoff details: interest, principal, and remaining balance.</p>
      <p><b>Tip:</b> Early payments are interest‑heavy; principal accelerates later.</p>
    `
  },

  // Flip
  "flip.inputs": {
    title: "Flip Inputs",
    body: `
      <p>Buy → rehab → sell scenario assumptions.</p>
      <ul>
        <li><b>Resale price</b>: expected sale price</li>
        <li><b>Months held</b>: time from purchase to sale</li>
        <li><b>Holding costs</b>: monthly carry (utilities, interest, etc.)</li>
        <li><b>Extra selling costs</b>: flat costs at sale (repairs/concessions)</li>
      </ul>
    `
  },
  "flip.results": {
    title: "Flip Results",
    body: `
      <p>Outputs show net proceeds, total out‑of‑pocket, and profit/ROI.</p>
      <p><b>Tip:</b> Big swings usually come from sale price, rehab overruns, or longer hold time.</p>
    `
  },

  // BRRRR
  "brrrr.assumptions": {
    title: "Refinance Assumptions",
    body: `
      <p>Models a refinance after rehab/appraisal.</p>
      <ul>
        <li><b>Refi LTV</b>: loan as % of appraised value</li>
        <li><b>Refi costs</b>: closing costs at refi</li>
        <li><b>Refi rate/term</b>: new payment</li>
      </ul>
    `
  },
  "brrrr.results": {
    title: "BRRRR Results",
    body: `
      <p>Shows new loan amount, cash out, cash left in, and post‑refi cash flow/CoC.</p>
      <p><b>Tip:</b> “Cash left in” near zero means a clean BRRRR (but verify DSCR/payment).</p>
    `
  },

  // Sensitivity / Monte Carlo
  "sens.grid": {
    title: "Sensitivity Grid",
    body: `
      <p>Fast stress test: see how cash‑on‑cash changes when rent and vacancy vary.</p>
      <p>If small changes flip you negative, the deal is fragile.</p>
    `
  },
  "sens.results": {
    title: "Results",
    body: `
      <p>Cells represent the metric output (typically cash‑on‑cash %) for each combination of rent and vacancy.</p>
    `
  },
  "mc.settings": {
    title: "Simulation Settings",
    body: `
      <p>Monte Carlo runs many randomized futures using your ranges (growth, vacancy, appreciation, exit method).</p>
      <p>More runs = smoother stats but slower.</p>
    `
  },
  "mc.results": {
    title: "Results",
    body: `
      <p>Use percentiles to understand downside and upside (p10/p50/p90). Median is often more informative than mean.</p>
    `
  },

  // Portfolio
  "portfolio.saved": {
    title: "Saved Properties",
    body: `
      <p>Saves a local snapshot of your current deal so you can compare later.</p>
      <p><b>Load</b> restores a snapshot back into Inputs. <b>Delete</b> removes it from local storage.</p>
    `
  },
  "portfolio.summary": {
    title: "Portfolio Summary",
    body: `
      <p>Aggregates saved snapshots for a quick top‑down view.</p>
      <p>This is not a live accounting system—it's a comparison dashboard.</p>
    `
  },

  // Import
  "import.guide": {
    title: "Import Text (quick fill)",
    body: `
      <p>Paste <b>anything</b>: a one‑line deal text, a long paragraph, an MLS/listing description, a lender quote, or a key:value list. The importer hunts for keywords + numbers and maps what it can into the right fields.</p>
      <p class="hint">It's totally fine to paste a huge block. Anything unrecognized will show under “Unrecognized lines” so you know what didn’t import.</p>
      <h3>Workflow</h3>
      <ol>
        <li>Paste your text</li>
        <li>Click <b>Parse</b> to generate a field‑mapping list</li>
        <li>Edit any mapped values directly (or remove a wrong row)</li>
        <li>Click <b>Apply</b> to write the mapped values into the app</li>
      </ol>
      <h3>Best format</h3>
      <ul>
        <li>One fact per line</li>
        <li>Use <code>:</code> or <code>=</code> (example: <code>Rent: $2800/mo</code>)</li>
        <li>Add <code>/mo</code> or <code>/yr</code> when helpful</li>
      </ul>
      <h3>Common keys</h3>
      <p class="hint">
        Purchase price, closing costs, rehab, ARV/appraisal, rent, taxes, insurance, HOA, utilities,
        vacancy, mgmt, maintenance, capex, rate, term, down, selling costs, holding period, exit cap.
      </p>
      <p><b>Tip:</b> Use Preview first. If something maps wrong, edit that one line and preview again.</p>
    `
  }
};

export const IMPORT_KEYS = [
  "purchase price", "price", "closing costs", "rehab", "arv", "appraisal",
  "rent", "taxes", "insurance", "hoa", "utilities",
  "vacancy", "mgmt", "management", "maintenance", "capex",
  "rate", "apr", "term", "down", "down payment", "loan amount", "points", "loan fees",
  "holding", "holding period", "selling costs", "appreciation", "exit cap",
  "lat", "latitude", "lng", "lon", "longitude",
  "resale price", "sale price", "months held", "holding costs", "extra selling costs",
  "refi ltv", "refi costs", "refi rate", "refi term"
];

export const IMPORT_EXAMPLES = {
  rental: `Name: NW 23rd Duplex
Address: 123 NW 23rd St, Bend OR
Units: 2

Purchase Price: $525,000
Closing Costs: $9,500
Rehab: $22,000
Down Payment: 20%
Rate: 6.75%
Term: 30 years
Loan Fees: $1,200
Points: 1%

Rent: $3,600/mo
Taxes: $4,800/yr
Insurance: $1,650/yr
HOA: $0/mo
Utilities: $120/mo

Vacancy: 6%
Mgmt: 8%
Maintenance: 6%
CapEx: 5%

Holding: 7 years
Selling Costs: 7%
Appreciation: 3%
Exit Cap: 6.25%`,

  flip: `Purchase Price: $310,000
Closing Costs: $8,000
Rehab: $45,000
Down: 15%
Rate: 8.5%
Term: 30

Resale Price: $425,000
Months Held: 6
Holding Costs Monthly: $2,300
Extra Selling Costs: $4,000
Selling Costs: 7%`,

  brrrr: `Purchase Price: $290,000
Rehab: $60,000
ARV: $430,000
Down: 20%
Rate: 7.25%
Term: 30

Refi LTV: 75%
Refi Costs: $6,500
Refi Rate: 6.75%
Refi Term: 30`
};


// Added help for Transactions/Actuals
,"tx.overview": {
  title: "Transactions",
  body: `
    <p><b>Transactions</b> is your “actuals” layer: import or enter real-world income/expense items and assign them to a property.</p>
    <ul>
      <li><b>Import CSV</b>: best-effort parser for common bank exports (date/description/amount).</li>
      <li><b>Rules</b>: keyword matches on description that auto-assign a category.</li>
      <li>Everything is <b>local-first</b> (stored in your browser).</li>
    </ul>
  `
},
"tx.table": {
  title: "Transactions table",
  body: `
    <p>Use filters and search to review imported items, fix categories/types, or delete mistakes.</p>
    <p>Tip: if a rule is wrong, remove it and re-apply categorization by re-importing or editing rows.</p>
  `
},
"actuals.overview": {
  title: "Actuals",
  body: `
    <p><b>Actuals</b> rolls transactions up by month to show real Income, Expenses, NOI, and Cash Flow.</p>
    <p>This is meant to complement the underwriting tabs (Pro Forma / Monte Carlo) rather than replace them.</p>
  `
},
"actuals.kpis": {
  title: "KPIs from actuals",
  body: `
    <p>These KPIs are computed directly from monthly rollups:</p>
    <ul>
      <li><b>Average monthly cash flow</b></li>
      <li><b>Average monthly NOI</b></li>
      <li><b>Volatility</b> (how much cash flow swings month to month)</li>
    </ul>
  `
}
