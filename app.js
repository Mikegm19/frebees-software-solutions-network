/**
 * =========================================================
 * FREEBEE — SMART INVOICING, OPay/BANK PDF OCR & TAX LEDGER
 * =========================================================
 * Upgraded with:
 * 1. Business Onboarding & LocalStorage saving
 * 2. First-load "How It Works" Walkthrough Guide & rich empty states
 * 3. Mozilla PDF.js + Tesseract.js OCR fallback for OPay image PDFs
 * 4. Escrow "Under Construction" notice under the Escrow Toggle
 * 5. FIRS TaxPro Max CSV Spreadsheet generator
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const STORAGE_KEYS = {
  PROFILE: "freebee_company_profile_v1",
  CONTRACTS: "freebee_contracts_v1",
  GUIDE_HIDDEN: "freebee_hide_guide_v1"
};

let companyProfile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE)) || null;
let contracts = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTRACTS)) || [];
let guideHidden = localStorage.getItem(STORAGE_KEYS.GUIDE_HIDDEN) === "true";

function formatNGN(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });
}

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
window.switchView = function(viewKey) {
  document.querySelectorAll(".view-section").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const targetSection = document.getElementById(`view-${viewKey}`);
  if (targetSection) targetSection.classList.remove("hidden");

  const activeNav = document.querySelector(`.nav-item[data-view="${viewKey}"]`);
  if (activeNav) activeNav.classList.add("active");

  const titles = {
    dashboard: ["Business Overview", "See your sales, invoices, and monthly tax numbers at a glance."],
    create: ["Add Sale or Upload Receipt", "Scan an OPay or bank PDF receipt from your device or log a new customer invoice."],
    escrow: ["Your Invoices & Deals", "Track all your logged sales and pending customer invoices."],
    tax: ["Your FIRS Tax Records", "Download your clean spreadsheet ready for FIRS TaxPro Max."]
  };

  if (titles[viewKey]) {
    document.getElementById("viewHeaderTitle").innerText = titles[viewKey][0];
    document.getElementById("viewHeaderSub").innerText = titles[viewKey][1];
  }

  renderAllViews();
};

/* =========================================================
   3. UPGRADED OPay & BANK PDF SCANNER (PDF.JS + OCR FALLBACK)
   ========================================================= */
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const titleEl = document.getElementById("pdfUploadTitle");
  const subEl = document.getElementById("pdfUploadSub");
  const banner = document.getElementById("pdfStatusBanner");

  titleEl.innerText = `Scanning "${file.name}"...`;
  subEl.innerText = "Step 1: Reading digital text layer...";
  banner.classList.add("hidden");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let rawText = "";

    // STAGE 1: Extract digital text sorted top-to-bottom, left-to-right
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();

      const sortedItems = content.items.slice().sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 4) return yDiff;
        return a.transform[4] - b.transform[4];
      });

      let lastY = null;
      for (const item of sortedItems) {
        const currentY = item.transform[5];
        if (lastY !== null && Math.abs(currentY - lastY) > 6) {
          rawText += "\n";
        } else if (lastY !== null) {
          rawText += " ";
        }
        rawText += item.str;
        lastY = currentY;
      }
      rawText += "\n";
    }

    // STAGE 2: If OPay exported an image-based PDF, run OCR on the canvas image!
    let usedOcr = false;
    if (rawText.replace(/\s+/g, "").length < 20 && window.Tesseract) {
      usedOcr = true;
      titleEl.innerText = `OPay Image PDF Detected — Running Smart OCR...`;
      subEl.innerText = "Reading receipt image (takes about 3 to 5 seconds)...";

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      await page.render({ canvasContext: ctx, viewport }).promise;

      const ocrResult = await Tesseract.recognize(canvas, "eng");
      rawText = ocrResult.data.text || "";
    }

    ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
      document.getElementById(id).classList.remove("needs-manual-review");
    });

    const parsed = extractNigerianReceiptData(rawText, file.name);

    const amountInput = document.getElementById("contractAmount");
    const nameInput = document.getElementById("counterpartyName");
    const tinInput = document.getElementById("counterpartyTin");
    const titleInput = document.getElementById("contractTitle");

    if (parsed.amount) {
      amountInput.value = parsed.amount;
    } else {
      amountInput.value = "";
      amountInput.classList.add("needs-manual-review");
    }

    if (parsed.party) {
      nameInput.value = parsed.party;
    } else {
      nameInput.value = "";
      nameInput.classList.add("needs-manual-review");
    }

    titleInput.value = parsed.description;

    if (!tinInput.value) {
      tinInput.classList.add("needs-manual-review");
    }

    document.getElementById("alreadyPaidToggle").checked = true;
    document.getElementById("enableEscrowToggle").checked = false;

    const cleanFileName = file.name.replace(/\.pdf$/i, "").slice(0, 32);
    titleEl.innerText = `✓ Scanned: ${cleanFileName}.pdf ${usedOcr ? "(via Image OCR)" : ""}`;
    subEl.innerText = "Tap here anytime to scan a different PDF receipt.";

    const safePreviewText = rawText.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;") || "(No readable text found)";
    banner.classList.remove("hidden");
    banner.innerHTML = `
      <div>
        <strong>Receipt Processed!</strong> ${parsed.amount ? `Found Amount: <strong>${formatNGN(parsed.amount)}</strong>.` : "Could not auto-detect the amount."}
        Please check any <span style="color:#fbbf24;font-weight:700;">yellow-highlighted boxes</span> below.
      </div>
      <details style="margin-top:8px; font-size:0.75rem; color:#94a3b8; cursor:pointer;">
        <summary>🔍 View raw text extracted from this PDF</summary>
        <pre style="margin-top:6px; padding:8px; background:rgba(0,0,0,0.5); border-radius:6px; white-space:pre-wrap; color:#cbd5e1; max-height:140px; overflow-y:auto;">${safePreviewText}</pre>
      </details>
    `;

    updateContractTelemetry();
  } catch (err) {
    console.error("PDF scan error:", err);
    titleEl.innerText = "Could not scan this PDF";
    subEl.innerText = "Please type the details below or try another receipt.";
  }
}

function extractNigerianReceiptData(text, fileName) {
  const cleanText = text.replace(/\r/g, "");

  let foundAmount = null;
  const explicitAmountRegex = /(?:₦|NGN|Naira|Amount|Total|Paid)\s*[:\-]?\s*[₦N]?\s*([\d,]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,}(?:\.\d{2})?)/i;
  const explicitMatch = cleanText.match(explicitAmountRegex);

  if (explicitMatch && explicitMatch[1]) {
    const val = parseFloat(explicitMatch[1].replace(/,/g, ""));
    if (val >= 50 && val < 10000000000) foundAmount = val;
  }

  if (!foundAmount) {
    const decimalMatches = [...cleanText.matchAll(/\b(\d{1,3}(?:,\d{3})+\.\d{2}|\d{3,}\.\d{2})\b/g)];
    for (const m of decimalMatches) {
      const val = parseFloat(m[1].replace(/,/g, ""));
      if (val >= 50 && val < 10000000000) {
        foundAmount = val;
        break;
      }
    }
  }

  let foundParty = "";
  const partyPatterns = [
    /(?:Sender\s*Details|Recipient\s*Details|Sender\s*Name|Beneficiary\s*Name|Customer\s*Name|From|Sent\s*By|Paid\s*By)\s*[:\-]?\s*\n?\s*([A-Z][A-Za-z\s.&\-]{3,38})/i,
    /(?:Sender|Recipient|Beneficiary|Customer)\s*[:\-]\s*([A-Za-z0-9\s.&\-]{3,38})/i
  ];

  for (const pattern of partyPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      foundParty = match[1].split(/\n|\||OPay|Moniepoint|GTBank|Zenith|Access|UBA|First\s*Bank|\d{4,}/i)[0].trim();
      if (foundParty.length >= 3) break;
    }
  }

  let foundDesc = "";
  const descMatch = cleanText.match(/(?:Remark|Remarks|Narration|Description|Purpose|Payment\s*Type)\s*[:\-]?\s*([A-Za-z0-9\s\/\-.,]{3,45})/i);
  if (descMatch && descMatch[1]) {
    foundDesc = descMatch[1].split("\n")[0].trim();
  }

  const txNoMatch = cleanText.match(/(?:Transaction\s*No\.?|Session\s*ID|Reference|Ref\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9]{8,35})/i);
  const txRef = txNoMatch ? ` (Ref: ${txNoMatch[1]})` : "";

  const isOpay = /OPay/i.test(cleanText);
  const cleanName = fileName.replace(/\.pdf$/i, "").slice(0, 28);

  if (!foundDesc || foundDesc.length < 3) {
    foundDesc = `${isOpay ? "OPay Transfer Receipt" : "Bank Receipt"}${txRef || ` - ${cleanName}`}`;
  } else if (txRef && !foundDesc.includes("Ref:")) {
    foundDesc = `${foundDesc}${txRef}`;
  }

  return {
    amount: foundAmount,
    party: foundParty,
    description: foundDesc
  };
}

/* =========================================================
   4. LIVE PAYMENT SUMMARY & ESCROW "UNDER CONSTRUCTION" HANDLER
   ========================================================= */
function updateContractTelemetry() {
  const base = parseFloat(document.getElementById("contractAmount").value) || 0;
  const taxType = document.getElementById("contractTaxType").value;
  const alreadyPaid = document.getElementById("alreadyPaidToggle").checked;
  const applyTaxes = document.getElementById("applyTaxesToggle").checked;
  const escrowToggle = document.getElementById("enableEscrowToggle");
  const submitBtn = document.getElementById("submitContractBtn");

  const drawer = document.getElementById("escrowFunctionsDrawer");
  if (escrowToggle.checked) {
    drawer.classList.remove("hidden");
  } else {
    drawer.classList.add("hidden");
  }

  if (alreadyPaid) {
    submitBtn.innerText = "Save Receipt to Tax Records \u2192";
  } else {
    submitBtn.innerText = "Create Customer Invoice \u2192";
  }

  const vat = applyTaxes ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = applyTaxes ? Math.round(base * whtRate) : 0;
  const netPayable = base + vat - wht;

  document.getElementById("prevBaseVal").innerText = formatNGN(base);
  document.getElementById("prevVatVal").innerText = `+ ${formatNGN(vat)}`;
  document.getElementById("prevWhtVal").innerText = `- ${formatNGN(wht)} (${whtRate * 100}%)`;
  document.getElementById("prevNetPayable").innerText = formatNGN(netPayable);

  const modeTitle = document.getElementById("previewModeTitle");
  const modeDesc = document.getElementById("previewModeDesc");

  if (escrowToggle.checked) {
    modeTitle.innerText = "🚧 ESCROW UNDER CONSTRUCTION";
    modeTitle.style.color = "#fbbf24";
    modeDesc.innerText = "Escrow holding is currently under construction. This entry will be saved as a standard invoice or tax record.";
  } else if (alreadyPaid) {
    modeTitle.innerText = "✓ DIRECT TAX RECORD LOG";
    modeTitle.style.color = "#34d399";
    modeDesc.innerText = "Saves straight to your FIRS Tax Records as a completed sale.";
  } else {
    modeTitle.innerText = "PENDING CUSTOMER INVOICE";
    modeTitle.style.color = "#38bdf8";
    modeDesc.innerText = "Creates an invoice you can mark as paid once the customer sends your money.";
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

  const vat = applyTaxes ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = applyTaxes ? Math.round(base * whtRate) : 0;

  const newContract = {
    id: "DEAL-" + Math.floor(100000 + Math.random() * 900000),
    createdAt: new Date().toISOString().split("T")[0],
    counterparty,
    counterpartyTin,
    title,
    base,
    vat,
    wht,
    payable: base + vat - wht,
    status: alreadyPaid ? "SETTLED" : "AWAITING_DEPOSIT"
  };

  contracts.unshift(newContract);
  saveState();

  e.target.reset();
  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    document.getElementById(id).classList.remove("needs-manual-review");
  });
  document.getElementById("pdfStatusBanner").classList.add("hidden");
  document.getElementById("pdfUploadTitle").innerText = "Tap here to choose a PDF receipt from your device";
  document.getElementById("pdfUploadSub").innerText = "Works with OPay, Moniepoint, GTBank, Zenith, Access, and Kuda PDFs";
  document.getElementById("applyTaxesToggle").checked = true;
  document.getElementById("alreadyPaidToggle").checked = true;
  document.getElementById("enableEscrowToggle").checked = false;

  updateContractTelemetry();
  switchView(alreadyPaid ? "tax" : "escrow");
}

/* =========================================================
   6. RENDER DASHBOARD, WALKTHROUGH & EMPTY STATES
   ========================================================= */
function renderAllViews() {
  let pendingSum = 0;
  let pendingCount = 0;
  let settledRevenue = 0;
  let settledCount = 0;
  let settledVat = 0;
  let settledWht = 0;

  contracts.forEach(c => {
    if (c.status !== "SETTLED") {
      pendingSum += c.payable;
      pendingCount++;
    } else {
      settledRevenue += c.base;
      settledVat += c.vat;
      settledWht += c.wht;
      settledCount++;
    }
  });

  const walkthroughEl = document.getElementById("walkthroughBanner");
  if (contracts.length === 0 && !guideHidden) {
    walkthroughEl.classList.remove("hidden");
  } else if (guideHidden) {
    walkthroughEl.classList.add("hidden");
  }

  document.getElementById("kpiEscrowLocked").innerText = formatNGN(pendingSum);
  document.getElementById("kpiEscrowCountLabel").innerText = pendingCount === 0
    ? "No unpaid invoices"
    : `${pendingCount} unpaid invoice(s)`;

  document.getElementById("kpiGrossRevenue").innerText = formatNGN(settledRevenue);
  document.getElementById("kpiRevenueFoot").innerText = settledCount === 0
    ? "Log a sale or PDF to start"
    : `Across ${settledCount} completed sale(s)`;

  document.getElementById("kpiVatLiability").innerText = formatNGN(settledVat);
  document.getElementById("kpiWhtCredits").innerText = formatNGN(settledWht);
  document.getElementById("navEscrowCount").innerText = pendingCount;

  document.getElementById("profLimitRatio").innerText = `${formatNGN(settledRevenue)} / ₦100,000,000`;
  const pct = Math.min(100, (settledRevenue / 100000000) * 100);
  document.getElementById("profTurnoverBar").style.width = `${pct}%`;

  const recentHost = document.getElementById("dashboardRecentList");
  if (contracts.length === 0) {
    recentHost.innerHTML = `
      <div class="empty-box">
        <h4>Your ledger is currently at ₦0</h4>
        <p>Start by uploading a digital PDF bank receipt (OPay, Moniepoint, GTBank, etc.) or logging your first sale manually. We'll calculate your VAT and WHT automatically.</p>
        <button type="button" class="btn-silver-primary" onclick="switchView('create')">+ Upload Receipt or Add Sale</button>
      </div>
    `;
  } else {
    recentHost.innerHTML = contracts.slice(0, 4).map(c => buildContractCardHTML(c)).join("");
  }

  const vaultHost = document.getElementById("escrowVaultList");
  if (contracts.length === 0) {
    vaultHost.innerHTML = `
      <div class="empty-box">
        <h4>No invoices or sales logged yet</h4>
        <p>When you create an invoice or log a receipt on the <strong>Add Sale / PDF</strong> page, it will appear here so you can track its payment status.</p>
        <button type="button" class="btn-outline-sm" onclick="switchView('create')">+ Create Your First Entry</button>
      </div>
    `;
  } else {
    vaultHost.innerHTML = contracts.map(c => buildContractCardHTML(c)).join("");
  }

  const taxBody = document.getElementById("taxLedgerTableBody");
  const settledList = contracts.filter(c => c.status === "SETTLED");
  if (settledList.length === 0) {
    taxBody.innerHTML = `
      <tr>
        <td colspan="7" class="empty-box">
          <h4>No completed tax records yet</h4>
          <p>Log a paid receipt or mark an invoice as paid to populate your FIRS TaxPro Max schedule.</p>
        </td>
      </tr>
    `;
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
  const isSettled = c.status === "SETTLED";
  const pillClass = isSettled ? "status-settled" : "status-awaiting";
  const pillLabel = isSettled ? "✓ Paid & Tax Logged" : "⏳ Unpaid Invoice";

  return `
    <div class="vault-item">
      <div class="vault-meta">
        <h4>${c.title}</h4>
        <div class="vault-sub">
          ${c.counterparty} • <span class="mono">${c.id}</span> • ${c.createdAt}
        </div>
      </div>
      <div class="vault-actions">
        <div class="mono" style="font-weight:700; font-size:0.98rem;">${formatNGN(c.payable)}</div>
        <span class="status-pill ${pillClass}">${pillLabel}</span>
        <button type="button" class="btn-outline-sm" onclick="openContractModal('${c.id}')">View Details &rarr;</button>
      </div>
    </div>
  `;
}

/* =========================================================
   7. DEAL DETAILS MODAL
   ========================================================= */
function closeContractModal() {
  document.getElementById("escrowModal").classList.add("hidden");
}

window.openContractModal = function(contractId) {
  const c = contracts.find(item => item.id === contractId);
  if (!c) return;

  document.getElementById("modalContractId").innerText = `${c.id} • Date: ${c.createdAt}`;
  document.getElementById("modalContractTitle").innerText = c.title;

  const body = document.getElementById("modalDynamicBody");

  if (c.status !== "SETTLED") {
    body.innerHTML = `
      <p class="text-muted">This invoice for <strong>${c.counterparty}</strong> is currently marked as unpaid. Once the customer pays into your bank account (${companyProfile.bank} • ${companyProfile.account}), click below to move it into your FIRS Tax Records.</p>
      <div class="va-terminal">
        <div class="text-muted" style="font-size:0.75rem;">INVOICE BREAKDOWN</div>
        <div class="mono" style="font-size:1.35rem; font-weight:800; margin:6px 0;">${formatNGN(c.payable)}</div>
        <div class="text-muted mono" style="font-size:0.76rem;">Base: ${formatNGN(c.base)} | VAT: ${formatNGN(c.vat)} | WHT: ${formatNGN(c.wht)}</div>
      </div>
      <button type="button" class="btn-silver-primary full-width" onclick="markInvoicePaid('${c.id}')">
        ✓ Mark Invoice as Paid & Add to Tax Records &rarr;
      </button>
    `;
  } else {
    body.innerHTML = `
      <div class="va-terminal" style="border-color:rgba(16,185,129,0.4);">
        <div style="color:#34d399; font-weight:700; margin-bottom:6px;">✓ PAID & RECORDED IN TAX LEDGER</div>
        <p class="text-muted" style="font-size:0.82rem;">Customer: <strong>${c.counterparty}</strong> (${c.counterpartyTin})</p>
        <p class="text-muted mono" style="font-size:0.8rem; margin-top:8px;">Sale Price: ${formatNGN(c.base)} | VAT: ${formatNGN(c.vat)} | WHT Credit: ${formatNGN(c.wht)}</p>
      </div>
    `;
  }

  document.getElementById("escrowModal").classList.remove("hidden");
};

window.markInvoicePaid = function(id) {
  const c = contracts.find(item => item.id === id);
  if (c) {
    c.status = "SETTLED";
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
   9. SET UP ALL BUTTON LISTENERS WHEN PAGE LOADS
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
    if (confirm("Edit your business details? Your saved deals will still stay safe.")) {
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
      companyProfile = null;
      initApp();
    }
  });

  document.getElementById("dismissWalkthroughBtn").addEventListener("click", () => {
    guideHidden = true;
    localStorage.setItem(STORAGE_KEYS.GUIDE_HIDDEN, "true");
    document.getElementById("walkthroughBanner").classList.add("hidden");
  });

  document.getElementById("showGuideAgainBtn").addEventListener("click", () => {
    guideHidden = false;
    localStorage.setItem(STORAGE_KEYS.GUIDE_HIDDEN, "false");
    document.getElementById("walkthroughBanner").classList.remove("hidden");
  });

  document.getElementById("walkthroughStartBtn").addEventListener("click", () => switchView("create"));

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });

  document.getElementById("dashNewContractBtn").addEventListener("click", () => switchView("create"));
  document.getElementById("vaultAddSaleBtn").addEventListener("click", () => switchView("create"));

  document.getElementById("pdfFileInput").addEventListener("change", handlePdfUpload);

  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    document.getElementById(id).addEventListener("input", (e) => {
      e.target.classList.remove("needs-manual-review");
    });
  });

  ["contractAmount", "contractTaxType", "alreadyPaidToggle", "applyTaxesToggle", "enableEscrowToggle"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("input", updateContractTelemetry);
      el.addEventListener("change", updateContractTelemetry);
    }
  });

  document.getElementById("contractForm").addEventListener("submit", handleContractSubmit);
  document.getElementById("downloadTaxCsvBtn").addEventListener("click", exportTaxCsv);

  document.getElementById("closeModalTopBtn").addEventListener("click", closeContractModal);
  document.getElementById("closeModalBottomBtn").addEventListener("click", closeContractModal);
  document.getElementById("escrowModal").addEventListener("click", (e) => {
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
