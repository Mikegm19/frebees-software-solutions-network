// Pre-loaded sample deals so you can test right away
let deals = [
  {
    id: "INV-9041",
    buyer: "Wuse Wholesale Mart",
    item: "50 Cartons of Cooking Oil",
    base: 1850000,
    vat: 0,
    wht: 0,
    payable: 1850000,
    escrow: true,
    taxIncluded: false,
    status: "ESCROW_FUNDED" // AWAITING_PAYMENT | ESCROW_FUNDED | COMPLETED
  },
  {
    id: "INV-9038",
    buyer: "Nexus Logistics Abuja",
    item: "Inventory Audit & Excel Automation Setup",
    base: 450000,
    vat: 33750,
    wht: 22500,
    payable: 461250,
    escrow: true,
    taxIncluded: true,
    status: "COMPLETED"
  }
];

let activeModalDealId = null;

function formatNaira(num) {
  return "₦" + Number(num || 0).toLocaleString("en-NG");
}

function updatePreview() {
  const base = parseFloat(document.getElementById("baseAmount").value) || 0;
  const category = document.getElementById("txCategory").value;
  const taxOn = document.getElementById("taxToggle").checked;

  const vat = taxOn ? Math.round(base * 0.075) : 0;
  const whtRate = category === "services" ? 0.05 : 0.02;
  const wht = taxOn ? Math.round(base * whtRate) : 0;
  const totalPayable = base + vat - wht;

  document.getElementById("prevBase").innerText = formatNaira(base);
  document.getElementById("vatRow").style.display = taxOn ? "flex" : "none";
  document.getElementById("whtRow").style.display = taxOn ? "flex" : "none";
  document.getElementById("whtRateLabel").innerText = (whtRate * 100) + "%";
  document.getElementById("prevVat").innerText = "+ " + formatNaira(vat);
  document.getElementById("prevWht").innerText = "- " + formatNaira(wht) + " (WHT Credit)";
  document.getElementById("prevTotal").innerText = formatNaira(totalPayable);
}

function createInvoice() {
  const buyer = document.getElementById("buyerName").value.trim() || "Walk-in B2B Buyer";
  const item = document.getElementById("itemDesc").value.trim() || "General Merchandise Supply";
  const base = parseFloat(document.getElementById("baseAmount").value) || 0;

  if (base <= 0) {
    alert("Please enter a valid price in Naira.");
    return;
  }

  const category = document.getElementById("txCategory").value;
  const escrow = document.getElementById("escrowToggle").checked;
  const taxOn = document.getElementById("taxToggle").checked;

  const vat = taxOn ? Math.round(base * 0.075) : 0;
  const whtRate = category === "services" ? 0.05 : 0.02;
  const wht = taxOn ? Math.round(base * whtRate) : 0;
  const payable = base + vat - wht;

  const newDeal = {
    id: "INV-" + Math.floor(1000 + Math.random() * 9000),
    buyer,
    item,
    base,
    vat,
    wht,
    payable,
    escrow,
    taxIncluded: taxOn,
    status: "AWAITING_PAYMENT"
  };

  deals.unshift(newDeal);
  document.getElementById("buyerName").value = "";
  document.getElementById("itemDesc").value = "";
  document.getElementById("baseAmount").value = "";
  updatePreview();
  renderAll();
  switchTab("deals");
}

function switchTab(tab) {
  document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(el => el.classList.remove("active"));

  document.getElementById("tab-" + tab).classList.remove("hidden");
  const activeBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
  if (activeBtn) activeBtn.classList.add("active");
  renderAll();
}

function renderAll() {
  document.getElementById("deal-count").innerText = deals.length;
  const list = document.getElementById("dealsList");
  list.innerHTML = "";

  deals.forEach(d => {
    let badgeClass = "pending";
    let badgeText = "Awaiting Payment";
    if (d.status === "ESCROW_FUNDED") {
      badgeClass = "escrow";
      badgeText = "🔒 Held in Escrow";
    }
    if (d.status === "COMPLETED") {
      badgeClass = "completed";
      badgeText = "✅ Settled & Logged";
    }

    const card = document.createElement("div");
    card.className = "deal-card";
    card.innerHTML = `
      <div class="deal-top">
        <div>
          <div class="deal-title">${d.item}</div>
          <div class="deal-buyer">${d.buyer} • ${d.id} ${d.taxIncluded ? "• 🧾 Tax Tagged" : ""}</div>
        </div>
        <span class="badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="deal-meta">
        <div class="deal-amount">${formatNaira(d.payable)}</div>
        <button class="btn-outline" onclick="openBuyerModal('${d.id}')">Simulate Buyer View ↗</button>
      </div>
    `;
    list.appendChild(card);
  });

  // Calculate Passive Tax Stats from COMPLETED deals
  let rev = 0, vat = 0, wht = 0;
  deals.filter(d => d.status === "COMPLETED").forEach(d => {
    rev += d.base;
    vat += d.vat;
    wht += d.wht;
  });

  document.getElementById("taxRev").innerText = formatNaira(rev);
  document.getElementById("taxVat").innerText = formatNaira(vat);
  document.getElementById("taxWht").innerText = formatNaira(wht);
  document.getElementById("turnoverLabel").innerText = `${formatNaira(rev)} / ₦100M Limit`;
  const pct = Math.min(100, Math.max(2, (rev / 100000000) * 100));
  document.getElementById("turnoverBar").style.width = pct + "%";
}

function openBuyerModal(id) {
  activeModalDealId = id;
  const d = deals.find(x => x.id === id);
  if (!d) return;

  document.getElementById("mBuyer").innerText = d.buyer;
  document.getElementById("mItem").innerText = `${d.item} (${d.id})`;
  const container = document.getElementById("modalBodyContent");

  if (d.status === "AWAITING_PAYMENT") {
    container.innerHTML = `
      <p style="font-size:0.83rem; color:var(--muted);">Transfer the exact amount below to this dedicated Paystack Virtual Account. Funds are held safely until you confirm delivery.</p>
      <div class="va-box">
        <div style="font-size:0.75rem; color:var(--muted);">Paystack-Titan Virtual Account</div>
        <div class="va-num">9940281742</div>
        <div style="font-size:0.85rem; font-weight:700; color:var(--primary);">Amount: ${formatNaira(d.payable)}</div>
      </div>
      <button class="btn-primary" onclick="advanceDealState('${d.id}', 'ESCROW_FUNDED')">⚡ Simulate Paystack Webhook (Buyer Paid)</button>
    `;
  } else if (d.status === "ESCROW_FUNDED") {
    container.innerHTML = `
      <div class="va-box" style="background:var(--blue-bg); border-color:#93c5fd;">
        <div style="font-weight:700; color:var(--blue-text); margin-bottom:4px;">🔒 ${formatNaira(d.payable)} Secured in Escrow</div>
        <div style="font-size:0.78rem; color:#1e40af;">The seller has been notified to dispatch your order. Only click below once you have inspected the goods.</div>
      </div>
      <button class="btn-primary" style="background:#15803d;" onclick="advanceDealState('${d.id}', 'COMPLETED')">📦 Confirm Goods Received (Release Payout)</button>
    `;
  } else {
    container.innerHTML = `
      <div class="va-box" style="background:var(--green-bg); border-color:#86efac;">
        <div style="font-weight:700; color:var(--green-text);">✅ Deal Completed & Settled</div>
        <div style="font-size:0.78rem; color:#166534; margin-top:4px;">Payout has been settled via Paystack Transfer API and logged to the seller's FIRS Tax Readiness ledger.</div>
      </div>
    `;
  }

  document.getElementById("buyerModal").style.display = "flex";
}

function advanceDealState(id, nextState) {
  const d = deals.find(x => x.id === id);
  if (d) {
    d.status = nextState;
    renderAll();
    openBuyerModal(id);
  }
}

function closeModal() {
  document.getElementById("buyerModal").style.display = "none";
}

function exportTaxCSV() {
  const completed = deals.filter(d => d.status === "COMPLETED");
  let csv = "Invoice_ID,Buyer,Description,Base_Revenue_NGN,VAT_7.5_NGN,WHT_Credit_NGN,Net_Settled_NGN\n";
  completed.forEach(d => {
    csv += `${d.id},"${d.buyer}","${d.item}",${d.base},${d.vat},${d.wht},${d.payable}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "FIRS_TaxProMax_Schedule.csv";
  a.click();
}

// Event Listeners Initialization
document.addEventListener("DOMContentLoaded", () => {
  // Tabs
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });

  // Live Preview Inputs
  document.getElementById("baseAmount").addEventListener("input", updatePreview);
  document.getElementById("txCategory").addEventListener("change", updatePreview);
  document.getElementById("escrowToggle").addEventListener("change", updatePreview);
  document.getElementById("taxToggle").addEventListener("change", updatePreview);

  // Buttons
  document.getElementById("createInvoiceBtn").addEventListener("click", createInvoice);
  document.getElementById("exportCsvBtn").addEventListener("click", exportTaxCSV);
  document.getElementById("closeModalBtn").addEventListener("click", closeModal);

  // Initial render
  renderAll();
});
