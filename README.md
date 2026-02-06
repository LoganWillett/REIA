# RE Investment Analyzer (Upgraded)

This build preserves the original REIA features and adds an "Actuals" layer:

## Preserved (from original)
- Import Text modal (paste messy deal summaries -> mapped fields -> apply)
- Issues indicator + jump-to-field warnings
- Inputs search + expand/collapse
- Location map (Leaflet + OpenStreetMap tiles) + end-user-triggered geocoding
- Underwriting tabs: Pro Forma, Amortization, Flip, BRRRR, Sensitivity, Monte Carlo
- Portfolio save + summary + import/export JSON

## Added (upgrade)
- Transactions tab: import CSV, manual entry, categorization rules
- Actuals tab: monthly rollups (Income/Expenses/Debt/NOI/Cash Flow) + CSV export

## Deploy
- GitHub Pages: serve the repo root (index.html at root); `.nojekyll` is included.
- Netlify: publish directory is `.` (see netlify.toml). No build step.
