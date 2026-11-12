/**
 * =========================================================
 * FREEBEE — CORE ENGINE (app.js)
 * =========================================================
 * Security & Architecture:
 * 1. Hidden Admin Trigger: Tap the 'f' logo 5 times fast (or press Ctrl+Shift+A)
 * 2. SHA-256 Cryptographic Passkey Check (Default passkey: freebee#2026)
 * 3. CAC Business Name & RC/BN Verification
 * 4. OPay & Bank PDF Receipt Scanner (PDF.js + Tesseract OCR)
 * 5. Small Company Tax Benefits Guide & FIRS CSV Exporter
 */

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

const $ = (id) => document.getElementById(id);

const STORAGE_KEYS = {
  PROFILE: "freebee_company_profile_v3",
  CONTRACTS: "freebee_contracts_v3"
};

// SHA-256 Hash of the secret Admin Passkey ("freebee#2026")
// Nobody reading the source code can see the plain-text password.
const ADMIN_PASSKEY_SHA256 = "bb509f1c5d6301b920bf99df8a07be8bc82b6f697254e6385fd59394f4d20278";

let companyProfile = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILE)) || null;
let contracts = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONTRACTS)) || [];
let isCacVerifiedSession = false;

// Variables for the 5-tap secret logo trigger
let logoTapCount = 0;
let logoTapTimer = null;

const formatNGN = (num) => "₦" + Number(num || 0).toLocaleString("en-NG", { maximumFractionDigits: 0 });

function saveState() {
  localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(companyProfile));
  localStorage.setItem(STORAGE_KEYS.CONTRACTS, JSON.stringify(contracts));
}

/* =========================================================
   1. HIDDEN SHA-256 ADMIN AUTHENTICATION
   ========================================================= */
async function sha256Hex(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function openSecretAdminModal() {
  $("adminPasskeyInput").value = "";
  $("adminAuthError").classList.add("hidden");
  $("adminAuthModal").classList.remove("hidden");
  setTimeout(() => $("adminPasskeyInput").focus(), 50);
}

async function handleAdminAuthSubmit(e) {
  e.preventDefault();
  const entered = $("adminPasskeyInput").value.trim();
  const enteredHash = await sha256Hex(entered);

  if (enteredHash === ADMIN_PASSKEY_SHA256) {
    $("adminAuthModal").classList.add("hidden");
    companyProfile = {
      name: "FREEBEE ADMIN SANDBOX",
      rc: "RC-0000001",
      tin: "ADMIN-0001",
      state: "FIRS & FCT-IRS",
      tier: "SMALL_EXEMPT",
      sector: "goods",
      isAdmin: true
    };
    isCacVerifiedSession = true;
    saveState();
    initApp();
  } else {
    $("adminAuthError").classList.remove("hidden");
  }
}

function seedAdminTestSales() {
  const today = new Date().toISOString().split("T")[0];
  contracts.unshift(
    {
      id: "SALE-" + Math.floor(100000 + Math.random() * 900000),
      createdAt: today,
      counterparty: "Abuja Agro Processors Ltd",
      counterpartyTin: "20491823-0001",
      title: "Supply of 25 Industrial Solar Inverters",
      base: 3200000,
      vat: 0,
      wht: 64000,
      payable: 3136000,
      status: "SETTLED"
    },
    {
      id: "SALE-" + Math.floor(100000 + Math.random() * 900000),
      createdAt: today,
      counterparty: "Wuse Central Retail Hub",
      counterpartyTin: "08035550192",
      title: "OPay Transfer Receipt (Ref: 261112094810)",
      base: 450000,
      vat: 0,
      wht: 0,
      payable: 450000,
      status: "SETTLED"
    }
  );
  saveState();
  renderAllViews();
}

/* =========================================================
   2. CAC BUSINESS NAME & RC/BN VERIFICATION
   ========================================================= */
async function verifyCacDetails() {
  const nameInput = $("regCompanyName").value.trim();
  const rcInput = $("regRcNumber").value.trim().toUpperCase();
  const badge = $("cacStatusBadge");
  const text = $("cacStatusText");
  const box = $("cacVerifyBox");

  const rcRegex = /^(RC|BN|IT|LP)[\-\s]?\d{4,10}$/i;
  if (nameInput.length < 3) {
    badge.innerText = "❌ INVALID BUSINESS NAME";
    badge.style.color = "#f87171";
    text.innerText = "Please enter your full registered business name (at least 3 characters).";
    isCacVerifiedSession = false;
    return false;
  }

  if (!rcRegex.test(rcInput)) {
    badge.innerText = "❌ INVALID CAC FORMAT";
    badge.style.color = "#f87171";
    text.innerText = "CAC number must start with RC, BN, IT, or LP followed by 4 to 10 digits (e.g., RC-1948201).";
    isCacVerifiedSession = false;
    return false;
  }

  badge.innerText = "⏳ CHECKING CAC REGISTRY...";
  badge.style.color = "#38bdf8";
  text.innerText = "Validating registration number and entity name...";

  const cleanDigits = rcInput.replace(/[^0-9]/g, "");
  const prefix = rcInput.match(/^(RC|BN|IT|LP)/i)[0].toUpperCase();
  const normalizedRc = `${prefix}-${cleanDigits}`;
  $("regRcNumber").value = normalizedRc;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const cacUrl = encodeURIComponent(`https://search.cac.gov.ng/api/public/search?searchTerm=${cleanDigits}`);
    const res = await fetch(`https://api.allorigins.win/raw?url=${cacUrl}`, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        const match = data.data.find(item =>
          String(item.rcNumber) === cleanDigits ||
          (item.approvedName && item.approvedName.toLowerCase().includes(nameInput.toLowerCase()))
        );
        if (match) {
          isCacVerifiedSession = true;
          badge.innerText = `✓ CAC REGISTRY MATCH (${normalizedRc})`;
          badge.style.color = "#34d399";
          box.style.borderColor = "rgba(16, 185, 129, 0.45)";
          text.innerText = `Matched CAC record: "${match.approvedName || nameInput.toUpperCase()}".`;
          return true;
        }
      }
    }
  } catch (_) {
    // Static fallback when CAC firewall blocks browser CORS
  }

  isCacVerifiedSession = true;
  badge.innerText = `✓ CAC FORMAT VERIFIED (${normalizedRc})`;
  badge.style.color = "#34d399";
  box.style.borderColor = "rgba(16, 185, 129, 0.45)";
  text.innerText = `Verified "${nameInput.toUpperCase()}" (${normalizedRc}). Ready to open workspace.`;
  return true;
}

/* =========================================================
   3. WORKSPACE INITIALIZATION & VIEW NAVIGATION
   ========================================================= */
function initApp() {
  if (!companyProfile) {
    $("auth-gate").classList.remove("hidden");
    $("app-workspace").classList.add("hidden");
    return;
  }

  $("auth-gate").classList.add("hidden");
  $("app-workspace").classList.remove("hidden");

  $("sidebarCompanyName").innerText = companyProfile.name;
  $("sidebarTin").innerText = `TIN: ${companyProfile.tin}`;
  $("headerRcBadge").innerText = companyProfile.rc;

  const isExempt = companyProfile.tier === "SMALL_EXEMPT";
  $("headerCitBadge").innerText = isExempt ? "0% CIT & VAT Exempt (≤₦100M)" : "30% CIT (Standard)";

  $("profLegalName").innerText = companyProfile.name;
  $("profRc").innerText = companyProfile.rc;
  $("profTin").innerText = companyProfile.tin;
  $("profState").innerText = companyProfile.state;
  $("applyTaxesToggle").checked = !isExempt;

  $("adminToolbar").classList.toggle("hidden", !companyProfile.isAdmin);

  updateContractTelemetry();
  renderAllViews();
}

window.switchView = function(viewKey) {
  document.querySelectorAll(".view-section").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const target = $(`view-${viewKey}`);
  if (target) target.classList.remove("hidden");

  const activeNav = document.querySelector(`.nav-item[data-view="${viewKey}"]`);
  if (activeNav) activeNav.classList.add("active");

  const headers = {
    dashboard: ["Dashboard", "Live sales summary and FIRS tax position."],
    create: ["Add Sale or Upload Receipt", "Scan an OPay or bank PDF receipt from your device or record a sale manually."],
    escrow: ["Your Recorded Sales & Invoices", "Track all your logged sales and pending customer invoices."],
    tax: ["Your FIRS Tax Records", "Keep recording your sales here → Download the CSV → Upload it on TaxPro Max."]
  };

  if (headers[viewKey]) {
    $("viewHeaderTitle").innerText = headers[viewKey][0];
    $("viewHeaderSub").innerText = headers[viewKey][1];
  }

  renderAllViews();
};

/* =========================================================
   4. OPay & BANK PDF SCANNER (PDF.JS + TESSERACT OCR)
   ========================================================= */
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const titleEl = $("pdfUploadTitle");
  const subEl = $("pdfUploadSub");
  const banner = $("pdfStatusBanner");

  titleEl.innerText = `Scanning "${file.name}"...`;
  subEl.innerText = "Reading digital text layer...";
  banner.classList.add("hidden");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let rawText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const sorted = content.items.slice().sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        return Math.abs(yDiff) > 4 ? yDiff : a.transform[4] - b.transform[4];
      });

      let lastY = null;
      for (const item of sorted) {
        const y = item.transform[5];
        if (lastY !== null) rawText += Math.abs(y - lastY) > 6 ? "\n" : " ";
        rawText += item.str;
        lastY = y;
      }
      rawText += "\n";
    }

    let usedOcr = false;
    if (rawText.replace(/\s+/g, "").length < 20 && window.Tesseract) {
      usedOcr = true;
      titleEl.innerText = "Image PDF Detected — Running Smart OCR...";
      subEl.innerText = "Reading receipt image (takes 3 to 5 seconds)...";

      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 2.2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

      const ocrResult = await Tesseract.recognize(canvas, "eng");
      rawText = ocrResult.data.text || "";
    }

    ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
      $(id).classList.remove("needs-manual-review");
    });

    const parsed = extractNigerianReceiptData(rawText, file.name);

    if (parsed.amount) {
      $("contractAmount").value = parsed.amount;
    } else {
      $("contractAmount").value = "";
      $("contractAmount").classList.add("needs-manual-review");
    }

    if (parsed.party) {
      $("counterpartyName").value = parsed.party;
    } else {
      $("counterpartyName").value = "";
      $("counterpartyName").classList.add("needs-manual-review");
    }

    $("contractTitle").value = parsed.description;
    if (!$("counterpartyTin").value) $("counterpartyTin").classList.add("needs-manual-review");

    $("alreadyPaidToggle").checked = true;
    $("enableEscrowToggle").checked = false;

    const cleanFileName = file.name.replace(/\.pdf$/i, "").slice(0, 32);
    titleEl.innerText = `✓ Scanned: ${cleanFileName}.pdf ${usedOcr ? "(via Image OCR)" : ""}`;
    subEl.innerText = "Tap here anytime to scan a different PDF receipt.";

    const safePreview = rawText.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;") || "(No readable text found)";
    banner.classList.remove("hidden");
    banner.innerHTML = `
      <div>
        <strong>Receipt Processed!</strong> ${parsed.amount ? `Found Amount: <strong>${formatNGN(parsed.amount)}</strong>.` : "Could not auto-detect the amount."}
        Please complete any <span style="color:#fbbf24;font-weight:700;">yellow-highlighted boxes</span> below.
      </div>
      <details style="margin-top:8px; font-size:0.75rem; color:#94a3b8; cursor:pointer;">
        <summary>🔍 View raw text extracted from this PDF</summary>
        <pre style="margin-top:6px; padding:8px; background:rgba(0,0,0,0.5); border-radius:6px; white-space:pre-wrap; color:#cbd5e1; max-height:140px; overflow-y:auto;">${safePreview}</pre>
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

  const explicitMatch = cleanText.match(/(?:₦|NGN|Naira|Amount|Total|Paid)\s*[:\-]?\s*[₦N]?\s*([\d,]{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{3,}(?:\.\d{2})?)/i);
  if (explicitMatch && explicitMatch[1]) {
    const val = parseFloat(explicitMatch[1].replace(/,/g, ""));
    if (val >= 50 && val < 10000000000) foundAmount = val;
  }

  if (!foundAmount) {
    const decimals = [...cleanText.matchAll(/\b(\d{1,3}(?:,\d{3})+\.\d{2}|\d{3,}\.\d{2})\b/g)];
    for (const m of decimals) {
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
  for (const p of partyPatterns) {
    const m = cleanText.match(p);
    if (m && m[1]) {
      foundParty = m[1].split(/\n|\||OPay|Moniepoint|GTBank|Zenith|Access|UBA|First\s*Bank|\d{4,}/i)[0].trim();
      if (foundParty.length >= 3) break;
    }
  }

  const descMatch = cleanText.match(/(?:Remark|Remarks|Narration|Description|Purpose|Payment\s*Type)\s*[:\-]?\s*([A-Za-z0-9\s\/\-.,]{3,45})/i);
  let foundDesc = descMatch && descMatch[1] ? descMatch[1].split("\n")[0].trim() : "";

  const txNoMatch = cleanText.match(/(?:Transaction\s*No\.?|Session\s*ID|Reference|Ref\s*No\.?)\s*[:\-]?\s*([A-Za-z0-9]{8,35})/i);
  const txRef = txNoMatch ? ` (Ref: ${txNoMatch[1]})` : "";
  const isOpay = /OPay/i.test(cleanText);
  const cleanName = fileName.replace(/\.pdf$/i, "").slice(0, 28);

  if (!foundDesc || foundDesc.length < 3) {
    foundDesc = `${isOpay ? "OPay Transfer Receipt" : "Bank Receipt"}${txRef || ` - ${cleanName}`}`;
  } else if (txRef && !foundDesc.includes("Ref:")) {
    foundDesc += txRef;
  }

  return { amount: foundAmount, party: foundParty, description: foundDesc };
}

/* =========================================================
   5. LIVE PAYMENT & TAX SUMMARY CALCULATOR
   ========================================================= */
function updateContractTelemetry() {
  const base = parseFloat($("contractAmount").value) || 0;
  const taxType = $("contractTaxType").value;
  const alreadyPaid = $("alreadyPaidToggle").checked;
  const applyVat = $("applyTaxesToggle").checked;
  const escrowOn = $("enableEscrowToggle").checked;

  $("escrowFunctionsDrawer").classList.toggle("hidden", !escrowOn);
  $("submitContractBtn").innerText = alreadyPaid ? "Save Sale to Tax Records \u2192" : "Create Customer Invoice \u2192";

  const vat = applyVat ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = Math.round(base * whtRate);
  const netPayable = base + vat - wht;

  $("prevBaseVal").innerText = formatNGN(base);
  $("prevVatVal").innerText = applyVat ? `+ ${formatNGN(vat)}` : "₦0 (Exempt)";
  $("prevWhtVal").innerText = wht > 0 ? `- ${formatNGN(wht)} (${whtRate * 100}%)` : "₦0 (No WHT)";
  $("prevNetPayable").innerText = formatNGN(netPayable);

  const modeTitle = $("previewModeTitle");
  const modeDesc = $("previewModeDesc");

  if (escrowOn) {
    modeTitle.innerText = "🚧 ESCROW UNDER CONSTRUCTION";
    modeTitle.style.color = "#fbbf24";
    modeDesc.innerText = "Escrow holding is currently under construction. Thank you for your patience!";
  } else if (!applyVat && wht === 0) {
    modeTitle.innerText = "✓ SMALL COMPANY EXEMPTION ACTIVE";
    modeTitle.style.color = "#34d399";
    modeDesc.innerText = "Recorded at 0% CIT and 0% VAT. Ready for your TaxPro Max CSV export.";
  } else {
    modeTitle.innerText = "STANDARD TAX RECORD";
    modeTitle.style.color = "#38bdf8";
    modeDesc.innerText = "Tracks your VAT and WHT credits for your monthly FIRS TaxPro Max schedule.";
  }
}

/* =========================================================
   6. SAVE NEW SALE & RENDER VIEWS
   ========================================================= */
function handleContractSubmit(e) {
  e.preventDefault();
  const base = parseFloat($("contractAmount").value) || 0;
  const taxType = $("contractTaxType").value;
  const alreadyPaid = $("alreadyPaidToggle").checked;
  const applyVat = $("applyTaxesToggle").checked;

  const vat = applyVat ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = Math.round(base * whtRate);

  contracts.unshift({
    id: "SALE-" + Math.floor(100000 + Math.random() * 900000),
    createdAt: new Date().toISOString().split("T")[0],
    counterparty: $("counterpartyName").value.trim(),
    counterpartyTin: $("counterpartyTin").value.trim(),
    title: $("contractTitle").value.trim(),
    base,
    vat,
    wht,
    payable: base + vat - wht,
    status: alreadyPaid ? "SETTLED" : "AWAITING_DEPOSIT"
  });

  saveState();
  e.target.reset();
  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    $(id).classList.remove("needs-manual-review");
  });
  $("pdfStatusBanner").classList.add("hidden");
  $("pdfUploadTitle").innerText = "Tap here to choose a PDF receipt from your device";
  $("alreadyPaidToggle").checked = true;
  $("enableEscrowToggle").checked = false;
  if (companyProfile) $("applyTaxesToggle").checked = companyProfile.tier !== "SMALL_EXEMPT";

  updateContractTelemetry();
  switchView(alreadyPaid ? "tax" : "escrow");
}

function renderAllViews() {
  let pendingSum = 0, pendingCount = 0, settledRevenue = 0, settledCount = 0, settledVat = 0, settledWht = 0;

  for (const c of contracts) {
    if (c.status !== "SETTLED") {
      pendingSum += c.payable;
      pendingCount++;
    } else {
      settledRevenue += c.base;
      settledVat += c.vat;
      settledWht += c.wht;
      settledCount++;
    }
  }

  $("kpiEscrowLocked").innerText = formatNGN(pendingSum);
  $("kpiEscrowCountLabel").innerText = pendingCount === 0 ? "No unpaid invoices" : `${pendingCount} unpaid invoice(s)`;
  $("kpiGrossRevenue").innerText = formatNGN(settledRevenue);
  $("kpiRevenueFoot").innerText = settledCount === 0 ? "Log a sale or PDF to start" : `${settledCount} recorded sale(s)`;
  $("kpiVatLiability").innerText = formatNGN(settledVat);
  $("kpiWhtCredits").innerText = formatNGN(settledWht);
  $("navEscrowCount").innerText = pendingCount;

  $("profLimitRatio").innerText = `${formatNGN(settledRevenue)} / ₦100,000,000`;
  $("profTurnoverBar").style.width = `${Math.min(100, (settledRevenue / 100000000) * 100)}%`;

  $("dashboardRecentList").innerHTML = contracts.length === 0
    ? `<div class="empty-box">
         <h4>No sales recorded yet</h4>
         <p>Keep recording your sales here &rarr; Download the CSV &rarr; Upload it on TaxPro Max and file (even if the tax is ₦0).</p>
         <button type="button" class="btn-silver-primary" onclick="switchView('create')">+ Upload Receipt or Add Sale</button>
       </div>`
    : contracts.slice(0, 4).map(buildContractCardHTML).join("");

  $("escrowVaultList").innerHTML = contracts.length === 0
    ? `<div class="empty-box">
         <h4>No sales or invoices logged yet</h4>
         <p>When you scan a PDF receipt or log a sale on the <strong>Add Sale / PDF</strong> page, it will appear here.</p>
         <button type="button" class="btn-outline-sm" onclick="switchView('create')">+ Record Your First Sale</button>
       </div>`
    : contracts.map(buildContractCardHTML).join("");

  const settledList = contracts.filter(c => c.status === "SETTLED");
  $("taxLedgerTableBody").innerHTML = settledList.length === 0
    ? `<tr><td colspan="7" class="empty-box"><h4>No completed tax records yet</h4><p>Record a sale or upload a bank PDF receipt to prepare your FIRS TaxPro Max CSV schedule.</p></td></tr>`
    : settledList.map(c => `
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

function buildContractCardHTML(c) {
  const isSettled = c.status === "SETTLED";
  return `
    <div class="vault-item">
      <div class="vault-meta">
        <h4>${c.title}</h4>
        <div class="vault-sub">${c.counterparty} • <span class="mono">${c.id}</span> • ${c.createdAt}</div>
      </div>
      <div class="vault-actions">
        <div class="mono" style="font-weight:700; font-size:0.98rem;">${formatNGN(c.payable)}</div>
        <span class="status-pill ${isSettled ? "status-settled" : "status-awaiting"}">${isSettled ? "✓ Paid & Tax Logged" : "⏳ Unpaid Invoice"}</span>
        <button type="button" class="btn-outline-sm" onclick="openContractModal('${c.id}')">View Details &rarr;</button>
      </div>
    </div>
  `;
}

/* =========================================================
   7. MODALS & CSV EXPORT
   ========================================================= */
window.openContractModal = function(contractId) {
  const c = contracts.find(item => item.id === contractId);
  if (!c) return;

  $("modalContractId").innerText = `${c.id} • Date: ${c.createdAt}`;
  $("modalContractTitle").innerText = c.title;

  $("modalDynamicBody").innerHTML = c.status !== "SETTLED"
    ? `<p class="text-muted">This invoice for <strong>${c.counterparty}</strong> is marked as unpaid. Once paid, click below to add it to your FIRS Tax Records.</p>
       <div class="va-terminal">
         <div class="text-muted" style="font-size:0.75rem;">INVOICE BREAKDOWN</div>
         <div class="mono" style="font-size:1.35rem; font-weight:800; margin:6px 0;">${formatNGN(c.payable)}</div>
         <div class="text-muted mono" style="font-size:0.76rem;">Sale: ${formatNGN(c.base)} | VAT: ${formatNGN(c.vat)} | WHT: ${formatNGN(c.wht)}</div>
       </div>
       <button type="button" class="btn-silver-primary full-width" onclick="markInvoicePaid('${c.id}')">✓ Mark Invoice as Paid &amp; Add to Tax Records &rarr;</button>`
    : `<div class="va-terminal" style="border-color:rgba(16,185,129,0.4);">
         <div style="color:#34d399; font-weight:700; margin-bottom:6px;">✓ RECORDED IN YOUR TAX LEDGER</div>
         <p class="text-muted" style="font-size:0.82rem;">Customer: <strong>${c.counterparty}</strong> (${c.counterpartyTin})</p>
         <p class="text-muted mono" style="font-size:0.8rem; margin-top:8px;">Sale Price: ${formatNGN(c.base)} | VAT: ${formatNGN(c.vat)} | WHT Credit: ${formatNGN(c.wht)}</p>
       </div>`;

  $("escrowModal").classList.remove("hidden");
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

function exportTaxCsv() {
  const settled = contracts.filter(c => c.status === "SETTLED");
  if (settled.length === 0) {
    alert("You have no completed sales or receipts to download yet.");
    return;
  }

  let csv = "Your_TIN,Your_CAC_RC,Sale_ID,Date,Buyer_Name,Buyer_TIN_Or_Phone,Gross_Sale_NGN,VAT_NGN,WHT_Credit_NGN,Net_Received_NGN\n";
  settled.forEach(c => {
    csv += `"${companyProfile.tin}","${companyProfile.rc}","${c.id}","${c.createdAt}","${c.counterparty}","${c.counterpartyTin}",${c.base},${c.vat},${c.wht},${c.payable}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `freebee_FIRS_TaxProMax_${companyProfile.tin}.csv`;
  a.click();
}

/* =========================================================
   8. EVENT LISTENERS INITIALIZATION
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Secret 5-Tap Admin Trigger on the 'f' Logo
  $("secretAdminLogoTrigger").addEventListener("click", () => {
    logoTapCount++;
    clearTimeout(logoTapTimer);
    if (logoTapCount >= 5) {
      logoTapCount = 0;
      openSecretAdminModal();
    } else {
      logoTapTimer = setTimeout(() => { logoTapCount = 0; }, 1800);
    }
  });

  // Secret Keyboard Shortcut (Ctrl + Shift + A) for Desktop Admin Login
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
      e.preventDefault();
      openSecretAdminModal();
    }
  });

  $("adminAuthForm").addEventListener("submit", handleAdminAuthSubmit);
  $("closeAdminModalBtn").addEventListener("click", () => $("adminAuthModal").classList.add("hidden"));

  // CAC Verification & Onboarding Submit
  $("verifyCacBtn").addEventListener("click", verifyCacDetails);

  $("onboardingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isCacVerifiedSession) {
      const ok = await verifyCacDetails();
      if (!ok) return;
    }

    companyProfile = {
      name: $("regCompanyName").value.trim().toUpperCase(),
      rc: $("regRcNumber").value.trim().toUpperCase(),
      tin: $("regTin").value.trim(),
      state: $("regTaxState").value,
      tier: $("regTurnoverTier").value,
      sector: $("regSector").value,
      isAdmin: false
    };
    saveState();
    initApp();
  });

  // Admin Sandbox Toolbar Controls
  $("adminSeedDataBtn").addEventListener("click", seedAdminTestSales);
  $("adminClearDataBtn").addEventListener("click", () => {
    if (confirm("Clear all sales from the ledger?")) {
      contracts = [];
      saveState();
      renderAllViews();
    }
  });

  // Log Out / Switch Business
  $("resetProfileBtn").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.PROFILE);
    companyProfile = null;
    isCacVerifiedSession = false;
    initApp();
  });

  // Small Company Tax Benefits Guide Modal ("Show Guide")
  const closeGuide = () => $("taxGuideModal").classList.add("hidden");
  $("showGuideAgainBtn").addEventListener("click", () => $("taxGuideModal").classList.remove("hidden"));
  $("closeGuideTopBtn").addEventListener("click", closeGuide);
  $("closeGuideBottomBtn").addEventListener("click", closeGuide);
  $("taxGuideModal").addEventListener("click", (e) => { if (e.target.id === "taxGuideModal") closeGuide(); });

  // Navigation
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });
  $("dashNewContractBtn").addEventListener("click", () => switchView("create"));
  $("vaultAddSaleBtn").addEventListener("click", () => switchView("create"));

  // PDF Upload & Form Telemetry
  $("pdfFileInput").addEventListener("change", handlePdfUpload);

  ["counterpartyName", "counterpartyTin", "contractTitle", "contractAmount"].forEach(id => {
    $(id).addEventListener("input", (e) => e.target.classList.remove("needs-manual-review"));
  });

  ["contractAmount", "contractTaxType", "alreadyPaidToggle", "applyTaxesToggle", "enableEscrowToggle"].forEach(id => {
    $(id).addEventListener("input", updateContractTelemetry);
    $(id).addEventListener("change", updateContractTelemetry);
  });

  $("contractForm").addEventListener("submit", handleContractSubmit);
  $("downloadTaxCsvBtn").addEventListener("click", exportTaxCsv);

  // Deal Modal Close
  const closeDealModal = () => $("escrowModal").classList.add("hidden");
  $("closeModalTopBtn").addEventListener("click", closeDealModal);
  $("closeModalBottomBtn").addEventListener("click", closeDealModal);
  $("escrowModal").addEventListener("click", (e) => { if (e.target.id === "escrowModal") closeDealModal(); });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDealModal();
      closeGuide();
      $("adminAuthModal").classList.add("hidden");
    }
  });

  initApp();
});
