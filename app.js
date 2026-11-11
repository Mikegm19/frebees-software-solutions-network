// Configure Mozilla PDF.js Worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const STORAGE_KEYS = {
  PROFILE: "freebee_company_profile_v1",
  CONTRACTS: "freebee_contracts_v1"
};

let companyProfile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE)) || null;
let contracts = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTRACTS)) || [];
let activeModalContractId = null;

function formatNGN(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

function saveState() {
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(companyProfile));
  localStorage.setItem(STORAGE_KEYS.CONTRACTS, JSON.stringify(contracts));
}

/* =========================================================
   1. BUSINESS SETUP & LOGIN
   ========================================================= */
function initApp() {
  const authGate = document.getElementById("auth-gate");
  const workspace = document.getElementById("app-workspace");

  if (!companyProfile) {
    authGate.classList.remove("hidden");
    workspace.classList.add("hidden");
  } else {
    authGate.classList.add("hidden");
    workspace.classList.remove("hidden");
    populateCompanyIdentity();
    renderAllViews();
  }
}

function populateCompanyIdentity() {
  if (!companyProfile) return;
  document.getElementById("sidebarCompanyName").innerText = companyProfile.name;
  document.getElementById("sidebarTin").innerText = `TIN: ${companyProfile.tin}`;
  document.getElementById("headerRcBadge").innerText = companyProfile.rc;

  const isExempt = companyProfile.tier === "SMALL_EXEMPT";
  document.getElementById("headerCitBadge").innerText = isExempt ? "0% CIT (Under ₦100M)" : "30% CIT (Standard)";

  document.getElementById("profLegalName").innerText = companyProfile.name;
  document.getElementById("profTin").innerText = companyProfile.tin;
  document.getElementById("profState").innerText = companyProfile.state;
  document.getElementById("profBank").innerText = `${companyProfile.bank} • ${companyProfile.account}`;
  document.getElementById("contractTaxType").value = companyProfile.sector === "services" ? "services" : "goods";
}

/* =========================================================
   2. NAVIGATION BETWEEN SCREENS
   ========================================================= */
function switchView(viewKey) {
  document.querySelectorAll(".view-section").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const targetSection = document.getElementById(`view-${viewKey}`);
  if (targetSection) targetSection.classList.remove("hidden");

  const activeNav = document.querySelector(`.nav-item[data-view="${viewKey}"]`);
  if (activeNav) activeNav.classList.add("active");

  const titles = {
    dashboard: ["Business Overview", "Track your pending escrow payments and monthly tax numbers in one place."],
    create: ["Add Sale or Upload Receipt", "Scan a PDF bank receipt from your device or create a protected payment link."],
    escrow: ["Active Deals & Escrow", "Track buyer payments, delivery waybills, and inspection releases."],
    tax: ["Your FIRS Tax Records", "Download your clean spreadsheet ready for TaxPro Max."]
  };

  if (titles[viewKey]) {
    document.getElementById("viewHeaderTitle").innerText = titles[viewKey][0];
    document.getElementById("viewHeaderSub").innerText = titles[viewKey][1];
  }

  renderAllViews();
}

/* =========================================================
   3. MOZILLA PDF.JS RECEIPT SCANNER (LOCAL DEVICE STORAGE)
   ========================================================= */
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const titleEl = document.getElementById("pdfUploadTitle");
  const subEl = document.getElementById("pdfUploadSub");
  const banner = document.getElementById("pdfStatusBanner");

  titleEl.innerText = `Scanning "${file.name}"...`;
  subEl.innerText = "Reading text from your PDF receipt...";
  banner.classList.add("hidden");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let rawText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      rawText += content.items.map(item => item.str).join(" ") + "\n";
    }

    // Clear previous amber highlights
    ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
      document.getElementById(id).classList.remove("needs-manual-review");
    });

    // 1. Extract Naira Amount (Matches ₦1,250,000.00, NGN 45,000, or Amount: 120,000)
    const amountRegex = /(?:₦|NGN|Amount\s*[:\-]?|Total\s*[:\-]?)\s*([\d,]+(?:\.\d{2})?)/i;
    const amountMatch = rawText.match(amountRegex);
    let foundAmount = null;
    if (amountMatch && amountMatch[1]) {
      const parsed = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (parsed > 0) foundAmount = parsed;
    }

    // 2. Extract Sender / Customer Name
    const partyRegex = /(?:Sender|From|Customer|Beneficiary|Payer|Account Name)\s*[:\-]?\s*([A-Za-z0-9\s.&\-]{3,35})/i;
    const partyMatch = rawText.match(partyRegex);
    const foundParty = partyMatch ? partyMatch[1].trim() : "";

    // 3. Extract Narration / Description / Remark
    const descRegex = /(?:Narration|Description|Remark|Remarks|Reference|Purpose)\s*[:\-]?\s*([A-Za-z0-9\s\/\-]{3,45})/i;
    const descMatch = rawText.match(descRegex);
    const foundDesc = descMatch ? descMatch[1].trim() : `Receipt: ${file.name.replace(/\.pdf$/i, "")}`;

    // Populate fields or highlight in Amber if missing
    const amountInput = document.getElementById("contractAmount");
    const nameInput = document.getElementById("counterpartyName");
    const tinInput = document.getElementById("counterpartyTin");
    const titleInput = document.getElementById("contractTitle");

    if (foundAmount) {
      amountInput.value = foundAmount;
    } else {
      amountInput.classList.add("needs-manual-review");
    }

    if (foundParty) {
      nameInput.value = foundParty;
    } else {
      nameInput.classList.add("needs-manual-review");
    }

    titleInput.value = foundDesc;

    // Bank receipts rarely contain the buyer's FIRS TIN, so highlight it for quick manual entry
    if (!tinInput.value) {
      tinInput.classList.add("needs-manual-review");
    }

    // Automatically switch toggle to "Already Paid (Receipt Log Only)" since it's a receipt
    document.getElementById("alreadyPaidToggle").checked = true;
    document.getElementById("enableEscrowToggle").checked = false;

    titleEl.innerText = `✓ Loaded: ${file.name}`;
    subEl.innerText = "Tap here anytime to scan a different PDF file.";

    banner.classList.remove("hidden");
    if ( rawText.trim().length < 10 ) {
      banner.innerHTML = `<strong>Note:</strong> This PDF looks like a scanned image or photo rather than a digital receipt. Please type in the highlighted yellow boxes below.`;
    } else {
      banner.innerHTML = `<strong>Receipt Scanned!</strong> We filled in what we found from the PDF. Please check the <span style="color:#fbbf24;font-weight:700;">yellow-highlighted boxes</span> (like Buyer TIN/Phone) and complete any missing info.`;
    }

    updateContractTelemetry();
  } catch (err) {
    console.error("PDF parse error:", err);
    titleEl.innerText = "Could not read this PDF file";
    subEl.innerText = "Please type the details manually below or try another digital PDF receipt.";
  }
}

/* =========================================================
   4. LIVE PAYMENT BREAKDOWN CALCULATOR
   ========================================================= */
function updateContractTelemetry() {
  const base = parseFloat(document.getElementById("contractAmount").value) || 0;
  const taxType = document.getElementById("contractTaxType").value;
  const alreadyPaid = document.getElementById("alreadyPaidToggle").checked;
  const applyTaxes = document.getElementById("applyTaxesToggle").checked;
  const escrowToggle = document.getElementById("enableEscrowToggle");
  const escrowMasterRow = document.getElementById("escrowMasterRow");
  const submitBtn = document.getElementById("submitContractBtn");

  // If sale is already paid (past receipt), disable Escrow option
  if (alreadyPaid) {
    escrowToggle.checked = false;
    escrowMasterRow.style.opacity = "0.45";
    escrowMasterRow.style.pointerEvents = "none";
    submitBtn.innerText = "Save Receipt Directly to Tax Records \u2192";
  } else {
    escrowMasterRow.style.opacity = "1";
    escrowMasterRow.style.pointerEvents = "auto";
    submitBtn.innerText = "Create Invoice & Payment Link \u2192";
  }

  const escrowEnabled = escrowToggle.checked;
  const feeSplit = document.getElementById("escrowFeeSplit").value;

  const drawer = document.getElementById("escrowFunctionsDrawer");
  if (escrowEnabled) drawer.classList.remove("hidden");
  else drawer.classList.add("hidden");

  const vat = applyTaxes ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = applyTaxes ? Math.round(base * whtRate) : 0;

  const totalEscrowFee = escrowEnabled ? Math.round(base * 0.015) : 0;
  let buyerEscrowFee = 0;
  if (escrowEnabled) {
    if (feeSplit === "50_50") buyerEscrowFee = Math.round(totalEscrowFee / 2);
    if (feeSplit === "BUYER") buyerEscrowFee = totalEscrowFee;
  }

  const netPayable = base + vat - wht + buyerEscrowFee;

  document.getElementById("prevBaseVal").innerText = formatNGN(base);
  document.getElementById("prevVatVal").innerText = `+ ${formatNGN(vat)}`;
  document.getElementById("prevWhtVal").innerText = `- ${formatNGN(wht)} (${whtRate * 100}%)`;

  const feeRow = document.getElementById("prevEscrowFeeRow");
  feeRow.style.display = escrowEnabled ? "flex" : "none";
  document.getElementById("prevEscrowFeeVal").innerText = `+ ${formatNGN(buyerEscrowFee)}`;
  document.getElementById("prevNetPayable").innerText = formatNGN(netPayable);

  const modeTitle = document.getElementById("previewModeTitle");
  const modeDesc = document.getElementById("previewModeDesc");

  if (alreadyPaid) {
    modeTitle.innerText = "✓ PAST RECEIPT LOG";
    modeTitle.style.color = "#34d399";
    modeDesc.innerText = "This transaction will be marked as Completed and added straight to your FIRS Tax Records.";
  } else if (escrowEnabled) {
    const windowVal = document.getElementById("escrowWindow").value;
    const condVal = document.getElementById("escrowCondition").value;
    modeTitle.innerText = "⛨ ESCROW PROTECTION ON";
    modeTitle.style.color = "#38bdf8";
    modeDesc.innerText = `Buyer pays into a safe virtual account. Release rule: ${condVal} (${windowVal} inspection).`;
  } else {
    modeTitle.innerText = "STANDARD INVOICE";
    modeTitle.style.color = "#94a3b8";
    modeDesc.innerText = "Creates a simple payment link without an escrow hold.";
  }
}

/* =========================================================
   5. SAVE NEW SALE OR RECEIPT
   ========================================================= */
function handleContractSubmit(e) {
  e.preventDefault();
  const counterparty = document.getElementById("counterpartyName").value.trim();
  const counterpartyTin = document.getElementById("counterpartyTin").value.trim();
  const title = document.getElementById("contractTitle").value.trim();
  const base = parseFloat(document.getElementById("contractAmount").value) || 0;
  const taxType = document.getElementById("contractTaxType").value;
  const alreadyPaid = document.getElementById("alreadyPaidToggle").checked;
  const applyTaxes = document.getElementById("applyTaxesToggle").checked;
  const escrowEnabled = document.getElementById("enableEscrowToggle").checked;

  const vat = applyTaxes ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = applyTaxes ? Math.round(base * whtRate) : 0;
  const feeSplit = document.getElementById("escrowFeeSplit").value;
  const totalEscrowFee = escrowEnabled ? Math.round(base * 0.015) : 0;
  const buyerFee = escrowEnabled ? (feeSplit === "50_50" ? Math.round(totalEscrowFee / 2) : feeSplit === "BUYER" ? totalEscrowFee : 0) : 0;

  const newContract = {
    id: "DEAL-" + Math.floor(100000 + Math.random() * 900000),
    createdAt: new Date().toISOString().split("T")[0],
    counterparty,
    counterpartyTin,
    title,
    base,
    vat,
    wht,
    buyerFee,
    payable: base + vat - wht + buyerFee,
    escrowEnabled,
    inspectionWindow: escrowEnabled ? document.getElementById("escrowWindow").value : "N/A",
    releaseCondition: escrowEnabled ? document.getElementById("escrowCondition").value : "Immediate",
    waybillNote: escrowEnabled ? (document.getElementById("escrowWaybillRef").value.trim() || "Standard Waybill") : "Direct",
    virtualAccount: "99" + Math.floor(10000000 + Math.random() * 90000000),
    waybillDispatchedId: alreadyPaid ? "RECEIPT-VERIFIED" : null,
    status: alreadyPaid ? "SETTLED" : "AWAITING_DEPOSIT"
  };

  contracts.unshift(newContract);
  saveState();

  // Reset form & UI highlights
  e.target.reset();
  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    document.getElementById(id).classList.remove("needs-manual-review");
  });
  document.getElementById("pdfStatusBanner").classList.add("hidden");
  document.getElementById("pdfUploadTitle").innerText = "Tap to choose a PDF receipt from your device";
  document.getElementById("pdfUploadSub").innerText = "Supports digital PDFs from OPay, Moniepoint, GTBank, Zenith, Kuda, etc.";
  document.getElementById("applyTaxesToggle").checked = true;
  document.getElementById("alreadyPaidToggle").checked = false;
  document.getElementById("enableEscrowToggle").checked = false;

  updateContractTelemetry();
  switchView(alreadyPaid ? "tax" : "escrow");
}

/* =========================================================
   6. RENDER ALL SCREENS
   ========================================================= */
function renderAllViews() {
  let activeEscrowSum = 0;
  let activeEscrowCount = 0;
  let settledRevenue = 0;
  let settledVat = 0;
  let settledWht = 0;

  contracts.forEach(c => {
    if (c.status !== "SETTLED") {
      activeEscrowSum += c.payable;
      activeEscrowCount++;
    } else {
      settledRevenue += c.base;
      settledVat += c.vat;
      settledWht += c.wht;
    }
  });

  document.getElementById("kpiEscrowLocked").innerText = formatNGN(activeEscrowSum);
  document.getElementById("kpiEscrowCountLabel").innerText = `${activeEscrowCount} deal(s) in progress`;
  document.getElementById("kpiGrossRevenue").innerText = formatNGN(settledRevenue);
  document.getElementById("kpiVatLiability").innerText = formatNGN(settledVat);
  document.getElementById("kpiWhtCredits").innerText = formatNGN(settledWht);
  document.getElementById("navEscrowCount").innerText = activeEscrowCount;

  document.getElementById("profLimitRatio").innerText = `${formatNGN(settledRevenue)} / ₦100,000,000`;
  const pct = Math.min(100, (settledRevenue / 100000000) * 100);
  document.getElementById("profTurnoverBar").style.width = `${pct}%`;

  const recentHost = document.getElementById("dashboardRecentList");
  if (contracts.length === 0) {
    recentHost.innerHTML = `<div class="empty-box">No deals or receipts yet. Tap <strong>+ Add Sale or Receipt</strong> to get started.</div>`;
  } else {
    recentHost.innerHTML = contracts.slice(0, 4).map(c => buildContractCardHTML(c)).join("");
  }

  const vaultHost = document.getElementById("escrowVaultList");
  if (contracts.length === 0) {
    vaultHost.innerHTML = `<div class="empty-box">No active deals yet. Create an invoice on the 'Add Sale / PDF' tab to see it here.</div>`;
  } else {
    vaultHost.innerHTML = contracts.map(c => buildContractCardHTML(c)).join("");
  }

  const taxBody = document.getElementById("taxLedgerTableBody");
  const settledList = contracts.filter(c => c.status === "SETTLED");
  if (settledList.length === 0) {
    taxBody.innerHTML = `<tr><td colspan="7" class="empty-box">No completed sales or receipts yet. Upload a paid PDF receipt or finish an escrow deal to see your tax records here.</td></tr>`;
  } else {
    taxBody.innerHTML = settledList.map(c => `
      <tr>
        <td class="mono">${c.id}</td>
        <td>${c.createdAt}</td>
        <td>${c.counterparty} <br><span class="text-muted mono" style="font-size:0.72rem;">${c.counterpartyTin}</span></td>
        <td class="mono">${formatNGN(c.base)}</td>
        <td class="mono">${formatNGN(c.vat)}</td>
        <td class="mono silver-highlight">${formatNGN(c.wht)}</td>
        <td class="mono"><strong>${formatNGN(c.payable)}</strong></td>
      </tr>
    `).join("");
  }
}

function buildContractCardHTML(c) {
  const statusMap = {
    AWAITING_DEPOSIT: ["status-awaiting", "1. Waiting for Buyer Payment"],
    VAULT_LOCKED: ["status-locked", "2. Money Safe in Escrow"],
    DISPATCHED_INSPECTION: ["status-dispatched", "3. Out for Delivery / Inspection"],
    SETTLED: ["status-settled", "4. Paid & Saved to Tax Records"]
  };
  const [pillClass, pillLabel] = statusMap[c.status];

  return `
    <div class="vault-item">
      <div class="vault-meta">
        <h4>${c.title}</h4>
        <div class="vault-sub">
          ${c.counterparty} • <span class="mono">${c.id}</span> • ${c.escrowEnabled ? `⛨ Escrow (${c.inspectionWindow})` : "Direct Sale"}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="mono" style="font-weight:700; font-size:1rem;">${formatNGN(c.payable)}</div>
        <span class="status-pill ${pillClass}">${pillLabel}</span>
        <button class="btn-outline-sm" onclick="openContractModal('${c.id}')">Manage Deal &rarr;</button>
      </div>
    </div>
  `;
}

/* =========================================================
   7. DEAL MANAGEMENT MODAL
   ========================================================= */
window.openContractModal = function(contractId) {
  activeModalContractId = contractId;
  const c = contracts.find(item => item.id === contractId);
  if (!c) return;

  document.getElementById("modalContractId").innerText = `${c.id} • Account: ${c.virtualAccount}`;
  document.getElementById("modalContractTitle").innerText = c.title;

  const stages = ["AWAITING_DEPOSIT", "VAULT_LOCKED", "DISPATCHED_INSPECTION", "SETTLED"];
  const labels = ["1. Payment", "2. In Escrow", "3. Delivery", "4. Completed"];
  const currentIdx = stages.indexOf(c.status);

  document.getElementById("modalStepper").innerHTML = labels.map((lbl, idx) => {
    const cls = idx < currentIdx ? "done" : idx === currentIdx ? "active" : "";
    return `<div class="step-node ${cls}">${lbl}</div>`;
  }).join("");

  const body = document.getElementById("modalDynamicBody");

  if (c.status === "AWAITING_DEPOSIT") {
    body.innerHTML = `
      <p class="text-muted">Send this Paystack Virtual Account number to <strong>${c.counterparty}</strong>. Once they transfer the money, it is held safely until delivery.</p>
      <div class="va-terminal">
        <div class="text-muted" style="font-size:0.75rem;">PAYSTACK ESCROW ACCOUNT</div>
        <div class="mono" style="font-size:1.5rem; font-weight:800; margin:6px 0;">${c.virtualAccount}</div>
        <div class="mono silver-highlight">Amount to Pay: ${formatNGN(c.payable)}</div>
      </div>
      <button class="btn-silver-primary full-width" onclick="transitionContract('${c.id}', 'VAULT_LOCKED')">
        Test: Mark as Paid by Buyer &rarr;
      </button>
    `;
  } else if (c.status === "VAULT_LOCKED") {
    body.innerHTML = `
      <p class="text-muted"><strong>${formatNGN(c.payable)}</strong> is now locked safely in escrow. Send the goods to the buyer and enter your waybill or rider details below.</p>
      <div class="input-group" style="margin-top:14px;">
        <label>Waybill Number or Delivery Note</label>
        <input type="text" id="waybillInput" placeholder="e.g., GIG Logistics #884920 or Rider Phone">
      </div>
      <button class="btn-silver-primary full-width" onclick="confirmWaybillDispatch('${c.id}')">
        Save Waybill & Start Buyer Inspection (${c.inspectionWindow}) &rarr;
      </button>
    `;
  } else if (c.status === "DISPATCHED_INSPECTION") {
    body.innerHTML = `
      <div class="va-terminal">
        <div class="text-muted" style="font-size:0.75rem;">GOODS IN TRANSIT / BUYER INSPECTION</div>
        <div class="mono" style="font-size:0.95rem; margin:6px 0;">Delivery Ref: ${c.waybillDispatchedId}</div>
        <div class="text-muted" style="font-size:0.78rem;">Rule: ${c.releaseCondition} (${c.inspectionWindow})</div>
      </div>
      <button class="btn-silver-primary full-width" onclick="transitionContract('${c.id}', 'SETTLED')">
        Confirm Buyer Approved Goods & Release Money &rarr;
      </button>
    `;
  } else {
    body.innerHTML = `
      <div class="va-terminal" style="border-color:rgba(16,185,129,0.4);">
        <div style="color:#34d399; font-weight:700; margin-bottom:6px;">✓ COMPLETED & PAID TO ${companyProfile.bank.toUpperCase()}</div>
        <p class="text-muted" style="font-size:0.8rem;">Sale Price (${formatNGN(c.base)}), VAT (${formatNGN(c.vat)}), and WHT Credit (${formatNGN(c.wht)}) are now saved in your FIRS Tax Records.</p>
      </div>
    `;
  }

  document.getElementById("escrowModal").classList.remove("hidden");
};

window.confirmWaybillDispatch = function(id) {
  const wb = document.getElementById("waybillInput").value.trim() || "DELIVERY-SENT";
  const c = contracts.find(item => item.id === id);
  if (c) {
    c.waybillDispatchedId = wb;
    c.status = "DISPATCHED_INSPECTION";
    saveState();
    renderAllViews();
    openContractModal(id);
  }
};

window.transitionContract = function(id, nextStatus) {
  const c = contracts.find(item => item.id === id);
  if (c) {
    c.status = nextStatus;
    saveState();
    renderAllViews();
    openContractModal(id);
  }
};

/* =========================================================
   8. DOWNLOAD FIRS TAX SPREADSHEET (.CSV)
   ========================================================= */
function exportTaxCsv() {
  const settled = contracts.filter(c => c.status === "SETTLED");
  if (settled.length === 0) {
    alert("You have no completed sales or receipts to download yet.");
    return;
  }

  let csv = "Your_TIN,Your_RC,Deal_ID,Date,Buyer_Name,Buyer_TIN_Or_Phone,Sale_Amount_NGN,VAT_7.5_NGN,WHT_Credit_NGN,Total_Received_NGN\n";
  settled.forEach(c => {
    csv += `"${companyProfile.tin}","${companyProfile.rc}","${c.id}","${c.createdAt}","${c.counterparty}","${c.counterpartyTin}",${c.base},${c.vat},${c.wht},${c.payable}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `freebee_FIRS_TaxRecords_${companyProfile.tin}.csv`;
  a.click();
}

/* =========================================================
   9. INITIALIZE LISTENERS
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("onboardingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    companyProfile = {
      name: document.getElementById("regCompanyName").value.trim(),
      rc: document.getElementById("regRcNumber").value.trim(),
      tin: document.getElementById("regTin").value.trim(),
      state: document.getElementById("regTaxState").value,
      tier: document.getElementById("regTurnoverTier").value,
      sector: document.getElementById("regSector").value,
      bank: document.getElementById("regBankName").value.trim(),
      account: document.getElementById("regAccountNum").value.trim()
    };
    saveState();
    initApp();
  });

  document.getElementById("resetProfileBtn").addEventListener("click", () => {
    if (confirm("Edit or switch your business profile? Your saved sales will still remain intact.")) {
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
      companyProfile = null;
      initApp();
    }
  });

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });

  document.getElementById("dashNewContractBtn").addEventListener("click", () => switchView("create"));

  // Local PDF File Picker Listener
  document.getElementById("pdfFileInput").addEventListener("change", handlePdfUpload);

  // Remove yellow highlight as soon as user types into a manual-review field
  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    document.getElementById(id).addEventListener("input", (e) => {
      e.target.classList.remove("needs-manual-review");
    });
  });

  // Live Payment Breakdown Listeners
  ["contractAmount", "contractTaxType", "alreadyPaidToggle", "applyTaxesToggle", "enableEscrowToggle", "escrowWindow", "escrowCondition", "escrowFeeSplit"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateContractTelemetry);
      el.addEventListener("change", updateContractTelemetry);
    }
  });

  document.getElementById("contractForm").addEventListener("submit", handleContractSubmit);
  document.getElementById("downloadTaxCsvBtn").addEventListener("click", exportTaxCsv);
  document.getElementById("closeModalBtn").addEventListener("click", () => {
    document.getElementById("escrowModal").classList.add("hidden");
  });

  initApp();
  updateContractTelemetry();
});
