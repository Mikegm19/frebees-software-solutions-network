/**
 * =========================================================
 * FREEBEE — B2B ESCROW & TAX RECORDS ENGINE (app.js)
 * =========================================================
 * Features included in this file:
 * 1. Business Onboarding & LocalStorage saving
 * 2. Mozilla PDF.js Bank Receipt Scanner (pulls Amount, Name, Details)
 * 3. Live 24-Hour Shipping Countdown Timer (with auto-refund trigger)
 * 4. 4-Digit Buyer Delivery PIN verification before releasing money
 * 5. FIRS TaxPro Max CSV Spreadsheet generator
 */

// Set up Mozilla PDF.js worker for reading PDFs from local device storage
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const STORAGE_KEYS = {
  PROFILE: "freebee_company_profile_v1",
  CONTRACTS: "freebee_contracts_v1"
};

// Load saved business info and deals from browser storage
let companyProfile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE)) || null;
let contracts = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTRACTS)) || [];
let activeModalContractId = null;
let countdownTimerInterval = null; // Holds the live 1-second timer

// Helper: Format numbers into Nigerian Naira (e.g., ₦2,500,000)
function formatNGN(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

// Helper: Save current state to browser storage
function saveState() {
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(companyProfile));
  localStorage.setItem(STORAGE_KEYS.CONTRACTS, JSON.stringify(contracts));
}

/* =========================================================
   1. BUSINESS LOGIN & PROFILE SETUP
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
   2. SCREEN NAVIGATION
   ========================================================= */
function switchView(viewKey) {
  document.querySelectorAll(".view-section").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const targetSection = document.getElementById(`view-${viewKey}`);
  if (targetSection) targetSection.classList.remove("hidden");

  const activeNav = document.querySelector(`.nav-item[data-view="${viewKey}"]`);
  if (activeNav) activeNav.classList.add("active");

  const titles = {
    dashboard: ["Business Overview", "See your active escrow payments and tax numbers at a glance."],
    create: ["Add Sale or Upload Receipt", "Scan a PDF bank receipt from your device or create a protected payment link."],
    escrow: ["Active Deals & Escrow", "Track 24-hour shipping timers, delivery waybills, and 4-digit PIN releases."],
    tax: ["Your FIRS Tax Records", "Download your clean spreadsheet ready for FIRS TaxPro Max."]
  };

  if (titles[viewKey]) {
    document.getElementById("viewHeaderTitle").innerText = titles[viewKey][0];
    document.getElementById("viewHeaderSub").innerText = titles[viewKey][1];
  }

  renderAllViews();
}

/* =========================================================
   3. MOZILLA PDF.JS RECEIPT SCANNER
   Reads digital PDFs from OPay, Moniepoint, GTBank, etc.
   ========================================================= */
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const titleEl = document.getElementById("pdfUploadTitle");
  const subEl = document.getElementById("pdfUploadSub");
  const banner = document.getElementById("pdfStatusBanner");

  titleEl.innerText = `Reading "${file.name}"...`;
  subEl.innerText = "Scanning PDF for amount and customer details...";
  banner.classList.add("hidden");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let rawText = "";

    // Loop through every page in the PDF and grab the text
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      rawText += content.items.map(item => item.str).join(" ") + "\n";
    }

    // Clear any old yellow highlight borders
    ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
      document.getElementById(id).classList.remove("needs-manual-review");
    });

    // 1. Find Amount (Looks for ₦, NGN, Amount, or Total)
    const amountRegex = /(?:₦|NGN|Amount\s*[:\-]?|Total\s*[:\-]?)\s*([\d,]+(?:\.\d{2})?)/i;
    const amountMatch = rawText.match(amountRegex);
    let foundAmount = null;
    if (amountMatch && amountMatch[1]) {
      const parsed = parseFloat(amountMatch[1].replace(/,/g, ""));
      if (parsed > 0) foundAmount = parsed;
    }

    // 2. Find Customer / Sender Name
    const partyRegex = /(?:Sender|From|Customer|Beneficiary|Payer|Account Name)\s*[:\-]?\s*([A-Za-z0-9\s.&\-]{3,35})/i;
    const partyMatch = rawText.match(partyRegex);
    const foundParty = partyMatch ? partyMatch[1].trim() : "";

    // 3. Find Description / Narration
    const descRegex = /(?:Narration|Description|Remark|Remarks|Reference|Purpose)\s*[:\-]?\s*([A-Za-z0-9\s\/\-]{3,45})/i;
    const descMatch = rawText.match(descRegex);
    const cleanFileName = file.name.replace(/\.pdf$/i, "").slice(0, 35);
    const foundDesc = descMatch ? descMatch[1].trim() : `Receipt: ${cleanFileName}`;

    const amountInput = document.getElementById("contractAmount");
    const nameInput = document.getElementById("counterpartyName");
    const tinInput = document.getElementById("counterpartyTin");
    const titleInput = document.getElementById("contractTitle");

    if (foundAmount) amountInput.value = foundAmount;
    else amountInput.classList.add("needs-manual-review");

    if (foundParty) nameInput.value = foundParty;
    else nameInput.classList.add("needs-manual-review");

    titleInput.value = foundDesc;

    // Bank receipts don't show the buyer's TIN, so highlight it in yellow for the user to type
    if (!tinInput.value) tinInput.classList.add("needs-manual-review");

    // Since this is a past receipt, turn on "Already Paid" automatically
    document.getElementById("alreadyPaidToggle").checked = true;
    document.getElementById("enableEscrowToggle").checked = false;

    titleEl.innerText = `✓ Scanned: ${cleanFileName}.pdf`;
    subEl.innerText = "Tap here anytime to pick a different PDF file.";

    banner.classList.remove("hidden");
    if (rawText.trim().length < 10) {
      banner.innerHTML = `<strong>Note:</strong> This PDF looks like a camera photo rather than a digital receipt. Please fill in the yellow-highlighted boxes below.`;
    } else {
      banner.innerHTML = `<strong>Receipt Scanned!</strong> We filled in the details we found. Please complete any <span style="color:#fbbf24;font-weight:700;">yellow-highlighted boxes</span> (like Buyer TIN/Phone).`;
    }

    updateContractTelemetry();
  } catch (err) {
    console.error("PDF scan error:", err);
    titleEl.innerText = "Could not read this PDF file";
    subEl.innerText = "Please type the details manually below or try another PDF.";
  }
}

/* =========================================================
   4. LIVE PAYMENT SUMMARY CALCULATOR
   ========================================================= */
function updateContractTelemetry() {
  const base = parseFloat(document.getElementById("contractAmount").value) || 0;
  const taxType = document.getElementById("contractTaxType").value;
  const alreadyPaid = document.getElementById("alreadyPaidToggle").checked;
  const applyTaxes = document.getElementById("applyTaxesToggle").checked;
  const escrowToggle = document.getElementById("enableEscrowToggle");
  const escrowMasterRow = document.getElementById("escrowMasterRow");
  const submitBtn = document.getElementById("submitContractBtn");

  // If the user toggled "Already Paid", hide Escrow options
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

  // Show or hide the Preceding Escrow Settings drawer
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
    modeDesc.innerText = "Saves straight to your FIRS Tax Records as a completed sale.";
  } else if (escrowEnabled) {
    const windowVal = document.getElementById("escrowWindow").value;
    modeTitle.innerText = "⛨ PAYSTACK ESCROW (24H TIMER + 4-DIGIT PIN)";
    modeTitle.style.color = "#38bdf8";
    modeDesc.innerText = `Buyer pays into Paystack Escrow. You have ${windowVal} to ship, and you'll enter the buyer's 4-digit PIN on delivery to get paid.`;
  } else {
    modeTitle.innerText = "DIRECT PAYMENT LINK";
    modeTitle.style.color = "#94a3b8";
    modeDesc.innerText = "Creates a regular payment link without an escrow hold.";
  }
}

/* =========================================================
   5. CREATE NEW DEAL OR SAVE RECEIPT
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
    inspectionWindow: escrowEnabled ? document.getElementById("escrowWindow").value : "24 Hours",
    releaseCondition: "4-Digit Buyer Delivery PIN",
    waybillNote: escrowEnabled ? (document.getElementById("escrowWaybillRef").value.trim() || "Standard Delivery") : "Direct",
    virtualAccount: "99" + Math.floor(10000000 + Math.random() * 90000000),
    waybillDispatchedId: alreadyPaid ? "RECEIPT-LOGGED" : null,
    deliveryPin: null,      // Generated when buyer pays
    dispatchDeadline: null, // Set to 24 hours from payment timestamp
    status: alreadyPaid ? "SETTLED" : "AWAITING_DEPOSIT"
  };

  contracts.unshift(newContract);
  saveState();

  // Reset form
  e.target.reset();
  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    document.getElementById(id).classList.remove("needs-manual-review");
  });
  document.getElementById("pdfStatusBanner").classList.add("hidden");
  document.getElementById("pdfUploadTitle").innerText = "Tap here to choose a PDF receipt from your device";
  document.getElementById("pdfUploadSub").innerText = "Works with OPay, Moniepoint, GTBank, Zenith, Access, and Kuda PDFs";
  document.getElementById("applyTaxesToggle").checked = true;
  document.getElementById("alreadyPaidToggle").checked = false;
  document.getElementById("enableEscrowToggle").checked = false;

  updateContractTelemetry();
  switchView(alreadyPaid ? "tax" : "escrow");
}

/* =========================================================
   6. RENDER DASHBOARD, ACTIVE DEALS & TAX RECORDS
   ========================================================= */
function renderAllViews() {
  let activeEscrowSum = 0;
  let activeEscrowCount = 0;
  let settledRevenue = 0;
  let settledVat = 0;
  let settledWht = 0;

  contracts.forEach(c => {
    if (c.status === "AWAITING_DEPOSIT" || c.status === "VAULT_LOCKED" || c.status === "DISPATCHED_INSPECTION") {
      activeEscrowSum += c.payable;
      activeEscrowCount++;
    } else if (c.status === "SETTLED") {
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
    vaultHost.innerHTML = `<div class="empty-box">No active deals yet. Create a sale on the 'Add Sale / PDF' tab to see it here.</div>`;
  } else {
    vaultHost.innerHTML = contracts.map(c => buildContractCardHTML(c)).join("");
  }

  const taxBody = document.getElementById("taxLedgerTableBody");
  const settledList = contracts.filter(c => c.status === "SETTLED");
  if (settledList.length === 0) {
    taxBody.innerHTML = `<tr><td colspan="7" class="empty-box">No completed sales yet. Upload a paid PDF receipt or finish an escrow deal to see your tax records here.</td></tr>`;
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
    AWAITING_DEPOSIT: ["status-awaiting", "1. Waiting for Payment"],
    VAULT_LOCKED: ["status-locked", "2. Paid • 24h Ship Timer"],
    DISPATCHED_INSPECTION: ["status-dispatched", "3. Shipped • Enter 4-Digit PIN"],
    SETTLED: ["status-settled", "4. Completed & Tax Logged"],
    REFUNDED: ["status-refunded", "✕ Refunded to Buyer (24h Expired)"]
  };
  const [pillClass, pillLabel] = statusMap[c.status] || statusMap.AWAITING_DEPOSIT;

  return `
    <div class="vault-item">
      <div class="vault-meta">
        <h4>${c.title}</h4>
        <div class="vault-sub">
          ${c.counterparty} • <span class="mono">${c.id}</span>
        </div>
      </div>
      <div class="vault-actions">
        <div class="mono" style="font-weight:700; font-size:0.98rem;">${formatNGN(c.payable)}</div>
        <span class="status-pill ${pillClass}">${pillLabel}</span>
        <button type="button" class="btn-outline-sm" onclick="openContractModal('${c.id}')">Manage Deal &rarr;</button>
      </div>
    </div>
  `;
}

/* =========================================================
   7. POPUP MODAL + 24H LIVE TIMER + 4-DIGIT PIN VERIFICATION
   ========================================================= */
function closeContractModal() {
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }
  activeModalContractId = null;
  document.getElementById("escrowModal").classList.add("hidden");
}

window.openContractModal = function(contractId) {
  // Clear any old running timer first
  if (countdownTimerInterval) {
    clearInterval(countdownTimerInterval);
    countdownTimerInterval = null;
  }

  activeModalContractId = contractId;
  const c = contracts.find(item => item.id === contractId);
  if (!c) return;

  document.getElementById("modalContractId").innerText = `${c.id} • Paystack Account: ${c.virtualAccount}`;
  document.getElementById("modalContractTitle").innerText = c.title;

  const stages = ["AWAITING_DEPOSIT", "VAULT_LOCKED", "DISPATCHED_INSPECTION", "SETTLED"];
  const labels = ["1. Payment", "2. 24h Ship Timer", "3. 4-Digit PIN", "4. Paid Out"];
  const currentIdx = stages.indexOf(c.status);

  document.getElementById("modalStepper").innerHTML = labels.map((lbl, idx) => {
    const cls = c.status === "REFUNDED" ? "" : (idx < currentIdx ? "done" : idx === currentIdx ? "active" : "");
    return `<div class="step-node ${cls}">${lbl}</div>`;
  }).join("");

  const body = document.getElementById("modalDynamicBody");

  // STAGE 1: WAITING FOR BUYER PAYMENT
  if (c.status === "AWAITING_DEPOSIT") {
    body.innerHTML = `
      <p class="text-muted">Share this official <strong>Paystack-Titan</strong> account number with <strong>${c.counterparty}</strong>. Their bank app will show <strong>"PAYSTACK / FREEBEE"</strong> so they know their money is protected.</p>
      <div class="va-terminal">
        <div class="text-muted" style="font-size:0.75rem;">PAYSTACK-TITAN ESCROW ACCOUNT</div>
        <div class="mono" style="font-size:1.45rem; font-weight:800; margin:6px 0;">${c.virtualAccount}</div>
        <div class="mono silver-highlight">Exact Amount: ${formatNGN(c.payable)}</div>
      </div>
      <button type="button" class="btn-silver-primary full-width" onclick="simulateBuyerPayment('${c.id}')">
        Test: Buyer Has Paid into Paystack &rarr;
      </button>
    `;
  }

  // STAGE 2: MONEY LOCKED IN ESCROW (24-HOUR SHIPPING COUNTDOWN)
  else if (c.status === "VAULT_LOCKED") {
    body.innerHTML = `
      <p class="text-muted"><strong>${formatNGN(c.payable)}</strong> is locked safely in Paystack. You must send the goods and enter the waybill number before the 24-hour timer hits zero, or Paystack automatically refunds the buyer.</p>

      <!-- Live 24-Hour Countdown Display -->
      <div class="timer-box">
        <div style="font-size:0.74rem; color:#fcd34d; font-weight:700;">⏳ TIME LEFT TO SHIP BEFORE AUTO-REFUND</div>
        <div id="liveCountdownDisplay" class="timer-digits mono">23h 59m 59s</div>
        <button type="button" class="btn-outline-sm" style="margin-top:6px; font-size:0.72rem;" onclick="simulateTimerExpiry('${c.id}')">
          Test: Fast-Forward 24h Expiry (Trigger Refund)
        </button>
      </div>

      <!-- Shows the Buyer's Secret 4-Digit PIN for Demo Testing -->
      <div class="buyer-pin-badge">
        <div>
          <strong style="color:#e0f2fe;">📱 Buyer's Secret Delivery PIN (Demo View)</strong>
          <div class="text-muted" style="font-size:0.73rem;">Paystack sent this PIN to ${c.counterparty}. You will need it on delivery.</div>
        </div>
        <span class="pin-code-display mono">${c.deliveryPin}</span>
      </div>

      <div class="input-group" style="margin-top:12px;">
        <label>Enter Waybill Number or Dispatch Rider Phone *</label>
        <input type="text" id="waybillInput" placeholder="e.g., GIG Logistics #884920 or Rider 0803...">
      </div>
      <button type="button" class="btn-silver-primary full-width" onclick="confirmWaybillDispatch('${c.id}')">
        Save Waybill & Stop Refund Timer &rarr;
      </button>
    `;

    // Start ticking the 24-hour countdown every second
    startLiveCountdown(c.id);
  }

  // STAGE 3: OUT FOR DELIVERY (SELLER ENTERS BUYER'S 4-DIGIT PIN)
  else if (c.status === "DISPATCHED_INSPECTION") {
    body.innerHTML = `
      <p class="text-muted">Waybill (<strong>${c.waybillDispatchedId}</strong>) is logged and the 24-hour refund timer is stopped. Once <strong>${c.counterparty}</strong> inspects the goods, ask them for their <strong>4-Digit Delivery PIN</strong> to unlock your money.</p>

      <!-- Reminder of the Buyer's PIN so you can test typing it in -->
      <div class="buyer-pin-badge">
        <div>
          <strong style="color:#e0f2fe;">📱 Buyer's 4-Digit PIN (For Your Testing)</strong>
          <div class="text-muted" style="font-size:0.73rem;">Type this code below to test unlocking the payout:</div>
        </div>
        <span class="pin-code-display mono">${c.deliveryPin}</span>
      </div>

      <div class="input-group" style="margin-top:14px;">
        <label>Enter Buyer's 4-Digit Delivery PIN *</label>
        <input type="text" id="pinVerifyInput" maxlength="4" class="pin-input-field mono" placeholder="••••">
        <div id="pinErrorMsg" class="error-msg hidden">❌ Wrong PIN! Ask the buyer for the exact 4-digit code.</div>
      </div>

      <button type="button" class="btn-silver-primary full-width" onclick="verifyPinAndRelease('${c.id}')">
        Verify 4-Digit PIN & Send Money to My Bank &rarr;
      </button>
    `;
  }

  // STAGE 4: COMPLETED & SETTLED
  else if (c.status === "SETTLED") {
    body.innerHTML = `
      <div class="va-terminal" style="border-color:rgba(16,185,129,0.4);">
        <div style="color:#34d399; font-weight:700; margin-bottom:6px;">✓ PIN VERIFIED — PAID TO ${companyProfile.bank.toUpperCase()}</div>
        <p class="text-muted" style="font-size:0.82rem;">Paystack has released your payout. Your Sale Price (${formatNGN(c.base)}), VAT (${formatNGN(c.vat)}), and WHT Credit (${formatNGN(c.wht)}) are now saved in your FIRS Tax Records.</p>
      </div>
    `;
  }

  // REFUNDED STATE (IF 24-HOUR TIMER EXPIRED)
  else if (c.status === "REFUNDED") {
    body.innerHTML = `
      <div class="va-terminal" style="border-color:rgba(239,68,68,0.45);">
        <div style="color:#f87171; font-weight:700; margin-bottom:6px;">✕ AUTOMATICALLY REFUNDED TO BUYER</div>
        <p class="text-muted" style="font-size:0.82rem;">No waybill was uploaded within the 24-hour shipping window, so Paystack automatically refunded <strong>${formatNGN(c.payable)}</strong> back to <strong>${c.counterparty}</strong>.</p>
      </div>
    `;
  }

  document.getElementById("escrowModal").classList.remove("hidden");
};

// Step 1 -> Step 2: Buyer pays, generate 4-digit PIN & set 24-hour deadline
window.simulateBuyerPayment = function(id) {
  const c = contracts.find(item => item.id === id);
  if (!c) return;

  c.deliveryPin = String(Math.floor(1000 + Math.random() * 9000)); // Random 4-digit PIN (e.g. 4829)
  c.dispatchDeadline = Date.now() + (24 * 60 * 60 * 1000);         // 24 hours from right now
  c.status = "VAULT_LOCKED";

  saveState();
  renderAllViews();
  openContractModal(id);
};

// Live 1-second countdown function for Stage 2
function startLiveCountdown(id) {
  function updateClock() {
    const c = contracts.find(item => item.id === id);
    const displayEl = document.getElementById("liveCountdownDisplay");
    if (!c || !displayEl || c.status !== "VAULT_LOCKED") {
      clearInterval(countdownTimerInterval);
      return;
    }

    const msLeft = (c.dispatchDeadline || 0) - Date.now();
    if (msLeft <= 0) {
      // Timer hit 00:00:00 -> Auto-refund buyer!
      clearInterval(countdownTimerInterval);
      c.status = "REFUNDED";
      saveState();
      renderAllViews();
      openContractModal(id);
      return;
    }

    const hours = Math.floor(msLeft / (1000 * 60 * 60));
    const mins = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((msLeft % (1000 * 60)) / 1000);

    displayEl.innerText = `${String(hours).padStart(2, "0")}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }

  updateClock();
  countdownTimerInterval = setInterval(updateClock, 1000);
}

// Demo button to test what happens when the 24-hour timer runs out
window.simulateTimerExpiry = function(id) {
  const c = contracts.find(item => item.id === id);
  if (!c) return;
  c.dispatchDeadline = Date.now() - 1000; // Set deadline to 1 second ago
  c.status = "REFUNDED";
  saveState();
  renderAllViews();
  openContractModal(id);
};

// Step 2 -> Step 3: Seller saves waybill and stops the 24-hour refund clock
window.confirmWaybillDispatch = function(id) {
  const wb = document.getElementById("waybillInput").value.trim();
  if (!wb) {
    alert("Please enter a waybill number or dispatch rider phone number first.");
    return;
  }
  const c = contracts.find(item => item.id === id);
  if (c) {
    c.waybillDispatchedId = wb;
    c.status = "DISPATCHED_INSPECTION";
    saveState();
    renderAllViews();
    openContractModal(id);
  }
};

// Step 3 -> Step 4: Seller types the Buyer's 4-Digit PIN to release the payout
window.verifyPinAndRelease = function(id) {
  const typedPin = document.getElementById("pinVerifyInput").value.trim();
  const errorEl = document.getElementById("pinErrorMsg");
  const c = contracts.find(item => item.id === id);
  if (!c) return;

  if (typedPin === c.deliveryPin) {
    c.status = "SETTLED";
    saveState();
    renderAllViews();
    openContractModal(id);
  } else {
    errorEl.classList.remove("hidden");
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
   9. SET UP ALL BUTTON LISTENERS WHEN PAGE LOADS
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Save Business Setup Form
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

  // Edit Business Profile Button
  document.getElementById("resetProfileBtn").addEventListener("click", () => {
    if (confirm("Edit your business details? Your saved deals will still stay safe.")) {
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
      companyProfile = null;
      initApp();
    }
  });

  // Sidebar / Bottom Bar Navigation
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });

  document.getElementById("dashNewContractBtn").addEventListener("click", () => switchView("create"));

  // PDF Receipt Upload Listener
  document.getElementById("pdfFileInput").addEventListener("change", handlePdfUpload);

  // Remove yellow highlight as soon as user types into a field
  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    document.getElementById(id).addEventListener("input", (e) => {
      e.target.classList.remove("needs-manual-review");
    });
  });

  // Live Payment Summary Listeners
  ["contractAmount", "contractTaxType", "alreadyPaidToggle", "applyTaxesToggle", "enableEscrowToggle", "escrowWindow", "escrowCondition", "escrowFeeSplit"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateContractTelemetry);
      el.addEventListener("change", updateContractTelemetry);
    }
  });

  document.getElementById("contractForm").addEventListener("submit", handleContractSubmit);
  document.getElementById("downloadTaxCsvBtn").addEventListener("click", exportTaxCsv);

  // 4 Ways to Close the Popup Modal (Top Button, Bottom Button, Clicking Outside, Pressing Escape)
  document.getElementById("closeModalTopBtn").addEventListener("click", closeContractModal);
  document.getElementById("closeModalBottomBtn").addEventListener("click", closeContractModal);
  document.getElementById("escrowModal").addEventListener("click", (e) => {
    // If user clicked the dark backdrop outside the card, close the modal
    if (e.target.id === "escrowModal") {
      closeContractModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeContractModal();
  });

  initApp();
  updateContractTelemetry();
});
