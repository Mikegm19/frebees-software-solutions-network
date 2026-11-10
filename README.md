# TrustLedger NG — Smart B2B Escrow & Tax Readiness MVP[span_1](start_span)[span_1](end_span)

A lightweight B2B invoicing, Paystack escrow state-machine simulator, and passive FIRS tax readiness web app tailored for Nigerian SMEs[span_2](start_span)[span_2](end_span).

## Project Structure[span_3](start_span)[span_3](end_span)
- `index.html` — Main semantic layout (3-tab interface + Buyer Paystack simulation modal)[span_4](start_span)[span_4](end_span)
- `styles.css` — Responsive mobile-first styling and status badges[span_5](start_span)[span_5](end_span)
- `app.js` — Escrow state machine (`AWAITING_PAYMENT` -> `ESCROW_FUNDED` -> `COMPLETED`), Nigerian VAT (7.5%) & WHT (2% / 5%) auto-calculator, and FIRS TaxPro Max CSV schedule exporter[span_6](start_span)[span_6](end_span)

## Running Locally or Deploying[span_7](start_span)[span_7](end_span)
1. Clone this repository or extract the files into a folder[span_8](start_span)[span_8](end_span).
2. Open `index.html` directly in any browser, or deploy the folder directly to **GitHub Pages** or **Vercel**[span_9](start_span)[span_9](end_span).
