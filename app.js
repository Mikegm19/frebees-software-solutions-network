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
   1. ONBOARDING & AUTHENTICATION GATE
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
  const citBadge = document.getElementById("headerCitBadge");
  citBadge.innerText = isExempt ? "0% CIT (Small Company Tier)" : "30% CIT (Standard Corporate)";

  document.getElementById("profLegalName").innerText = companyProfile.name;
  document.getElementById("profTin").innerText = companyProfile.tin;
  document.getElementById("profState").innerText = companyProfile.state;
  document.getElementById("profBank").innerText = `${companyProfile.bank} • ${companyProfile.account}`;
  document.getElementById("contractTaxType").value = companyProfile.sector === "services" ? "services" : "goods";
}

/* =========================================================
   2. NAVIGATION & VIEW ROUTER
   ========================================================= */
function switchView(viewKey) {
  document.querySelectorAll(".view-section").forEach(s => s.classList.add("hidden"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));

  const targetSection = document.getElementById(`view-${viewKey}`);
  if (targetSection) targetSection.classList.remove("hidden");

  const activeNav = document.querySelector(`.nav-item[data-view="${viewKey}"]`);
  if (activeNav) activeNav.classList.add("active");

  const titles = {
    dashboard: ["Executive Overview", "Live B2B settlement pipeline and statutory tax position"],
    create: ["Deploy B2B Contract", "Configure escrow milestones, inspection windows, and statutory tax tags"],
    escrow: ["Escrow Protection Vault", "Monitor Paystack virtual account locks, waybills, and inspection releases"],
    tax: ["FIRS TaxPro Max Ledger", "Automated output VAT and Withholding Tax credit schedule"]
  };

  if (titles[viewKey]) {
    document.getElementById("viewHeaderTitle").innerText = titles[viewKey][0];
    document.getElementById("viewHeaderSub").innerText = titles[viewKey][1];
  }

  renderAllViews();
}

/* =========================================================
   3. LIVE CONTRACT & ESCROW TELEMETRY CALCULATOR
   ========================================================= */
function updateContractTelemetry() {
  const base = parseFloat(document.getElementById("contractAmount").value) || 0;
  const taxType = document.getElementById("contractTaxType").value;
  const applyTaxes = document.getElementById("applyTaxesToggle").checked;
  const escrowEnabled = document.getElementById("enableEscrowToggle").checked;
  const feeSplit = document.getElementById("escrowFeeSplit").value;

  // Toggle preceding Escrow functions drawer
  const drawer = document.getElementById("escrowFunctionsDrawer");
  if (escrowEnabled) {
    drawer.classList.remove("hidden");
  } else {
    drawer.classList.add("hidden");
  }

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
  if (escrowEnabled) {
    const windowVal = document.getElementById("escrowWindow").value;
    const condVal = document.getElementById("escrowCondition").value;
    modeTitle.innerText = "⛨ ESCROW VAULT LOCK ACTIVE";
    modeTitle.style.color = "#38bdf8";
    modeDesc.innerText = `Paystack Virtual Account locks funds. Release rule: ${condVal} (${windowVal} inspection window).`;
  } else {
    modeTitle.innerText = "DIRECT SETTLEMENT INVOICE";
    modeTitle.style.color = "#94a3b8";
    modeDesc.innerText = "Direct payment link without escrow lock. Settled immediately upon payment.";
  }
}

/* =========================================================
   4. DEPLOY NEW CONTRACT
   ========================================================= */
function handleContractSubmit(e) {
  e.preventDefault();
  const counterparty = document.getElementById("counterpartyName").value.trim();
  const counterpartyTin = document.getElementById("counterpartyTin").value.trim();
  const title = document.getElementById("contractTitle").value.trim();
  const base = parseFloat(document.getElementById("contractAmount").value) || 0;
  const taxType = document.getElementById("contractTaxType").value;
  const applyTaxes = document.getElementById("applyTaxesToggle").checked;
  const escrowEnabled = document.getElementById("enableEscrowToggle").checked;

  const vat = applyTaxes ? Math.round(base * 0.075) : 0;
  const whtRate = taxType === "services" ? 0.05 : taxType === "goods" ? 0.02 : 0;
  const wht = applyTaxes ? Math.round(base * whtRate) : 0;
  const feeSplit = document.getElementById("escrowFeeSplit").value;
  const totalEscrowFee = escrowEnabled ? Math.round(base * 0.015) : 0;
  const buyerFee = escrowEnabled ? (feeSplit === "50_50" ? Math.round(totalEscrowFee / 2) : feeSplit === "BUYER" ? totalEscrowFee : 0) : 0;

  const newContract = {
    id: "CNT-" + Math.floor(100000 + Math.random() * 900000),
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
    waybillDispatchedId: null,
    // States: AWAITING_DEPOSIT -> VAULT_LOCKED -> DISPATCHED_INSPECTION -> SETTLED
    status: "AWAITING_DEPOSIT"
  };

  contracts.unshift(newContract);
  saveState();
  e.target.reset();
  document.getElementById("applyTaxesToggle").checked = true;
  document.getElementById("enableEscrowToggle").checked = false;
  updateContractTelemetry();
  switchView("escrow");
}

/* =========================================================
   5. RENDER ALL VIEWS (DASHBOARD, VAULT, TAX ENGINE)
   ========================================================= */
function renderAllViews() {
  // Compute KPIs
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
  document.getElementById("kpiEscrowCountLabel").innerText = `${activeEscrowCount} active contract(s)`;
  document.getElementById("kpiGrossRevenue").innerText = formatNGN(settledRevenue);
  document.getElementById("kpiVatLiability").innerText = formatNGN(settledVat);
  document.getElementById("kpiWhtCredits").innerText = formatNGN(settledWht);
  document.getElementById("navEscrowCount").innerText = activeEscrowCount;

  // Turnover Progress against ₦100M Small Company Threshold
  document.getElementById("profLimitRatio").innerText = `${formatNGN(settledRevenue)} / ₦100,000,000`;
  const pct = Math.min(100, (settledRevenue / 100000000) * 100);
  document.getElementById("profTurnoverBar").style.width = `${pct}%`;

  // Render Dashboard Recent Feed
  const recentHost = document.getElementById("dashboardRecentList");
  if (contracts.length === 0) {
    recentHost.innerHTML = `<div class="empty-box">No transactions recorded yet. Click <strong>+ New Contract</strong> to deploy your first B2B invoice or escrow vault.</div>`;
  } else {
    recentHost.innerHTML = contracts.slice(0, 4).map(c => buildContractCardHTML(c)).join("");
  }

  // Render Full Escrow Vault List
  const vaultHost = document.getElementById("escrowVaultList");
  if (contracts.length === 0) {
    vaultHost.innerHTML = `<div class="empty-box">Your Escrow Vault is empty. Create a contract to generate a dedicated Paystack Virtual Account.</div>`;
  } else {
    vaultHost.innerHTML = contracts.map(c => buildContractCardHTML(c)).join("");
  }

  // Render Tax Ledger Table (Strictly SETTLED contracts)
  const taxBody = document.getElementById("taxLedgerTableBody");
  const settledList = contracts.filter(c => c.status === "SETTLED");
  if (settledList.length === 0) {
    taxBody.innerHTML = `<tr><td colspan="7" class="empty-box">No settled contracts yet. Complete a transaction in the Escrow Vault to populate your FIRS TaxPro Max ledger.</td></tr>`;
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
    AWAITING_DEPOSIT: ["status-awaiting", "1. Awaiting Buyer Deposit"],
    VAULT_LOCKED: ["status-locked", "2. Funds Locked in Vault"],
    DISPATCHED_INSPECTION: ["status-dispatched", "3. Waybill Logged • Buyer Inspection"],
    SETTLED: ["status-settled", "4. Settled & Tax Logged"]
  };
  const [pillClass, pillLabel] = statusMap[c.status];

  return `
    <div class="vault-item">
      <div class="vault-meta">
        <h4>${c.title}</h4>
        <div class="vault-sub">
          ${c.counterparty} • <span class="mono">${c.id}</span> • ${c.escrowEnabled ? `⛨ Escrow (${c.inspectionWindow})` : "Direct Invoice"}
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="mono" style="font-weight:700; font-size:1rem;">${formatNGN(c.payable)}</div>
        <span class="status-pill ${pillClass}">${pillLabel}</span>
        <button class="btn-outline-sm" onclick="openContractModal('${c.id}')">Manage &rarr;</button>
      </div>
    </div>
  `;
}

/* =========================================================
   6. INTERACTIVE ESCROW COMMAND MODAL (4-STAGE LIFECYCLE)
   ========================================================= */
window.openContractModal = function(contractId) {
  activeModalContractId = contractId;
  const c = contracts.find(item => item.id === contractId);
  if (!c) return;

  document.getElementById("modalContractId").innerText = `${c.id} • VA: ${c.virtualAccount}`;
  document.getElementById("modalContractTitle").innerText = c.title;

  const stages = ["AWAITING_DEPOSIT", "VAULT_LOCKED", "DISPATCHED_INSPECTION", "SETTLED"];
  const labels = ["1. Deposit", "2. Vault Lock", "3. Inspection", "4. Settled"];
  const currentIdx = stages.indexOf(c.status);

  document.getElementById("modalStepper").innerHTML = labels.map((lbl, idx) => {
    const cls = idx < currentIdx ? "done" : idx === currentIdx ? "active" : "";
    return `<div class="step-node ${cls}">${lbl}</div>`;
  }).join("");

  const body = document.getElementById("modalDynamicBody");

  if (c.status === "AWAITING_DEPOSIT") {
    body.innerHTML = `
      <p class="text-muted">Share this Paystack Titan Virtual Account with <strong>${c.counterparty}</strong>. Once funded, the escrow state machine locks the principal.</p>
      <div class="va-terminal">
        <div class="text-muted" style="font-size:0.75rem;">PAYSTACK DEDICATED ESCROW ACCOUNT</div>
        <div class="mono" style="font-size:1.5rem; font-weight:800; margin:6px 0;">${c.virtualAccount}</div>
        <div class="mono silver-highlight">Payable: ${formatNGN(c.payable)}</div>
      </div>
      <button class="btn-silver-primary full-width" onclick="transitionContract('${c.id}', 'VAULT_LOCKED')">
        Simulate Paystack Webhook: Buyer Funded Account &rarr;
      </button>
    `;
  } else if (c.status === "VAULT_LOCKED") {
    body.innerHTML = `
      <p class="text-muted"><strong>${formatNGN(c.payable)}</strong> is locked in the escrow vault. Dispatch the supply and log the waybill/delivery reference to start the <strong>${c.inspectionWindow}</strong> inspection timer.</p>
      <div class="input-group" style="margin-top:14px;">
        <label>Waybill / Dispatch Reference Number</label>
        <input type="text" id="waybillInput" placeholder="e.g., GIGL-ABJ-884920 or Signed Delivery Note">
      </div>
      <button class="btn-silver-primary full-width" onclick="confirmWaybillDispatch('${c.id}')">
        Log Dispatch & Start Buyer Inspection Timer &rarr;
      </button>
    `;
  } else if (c.status === "DISPATCHED_INSPECTION") {
    body.innerHTML = `
      <div class="va-terminal">
        <div class="text-muted" style="font-size:0.75rem;">ACTIVE INSPECTION PROTOCOL</div>
        <div class="mono" style="font-size:0.95rem; margin:6px 0;">Waybill Ref: ${c.waybillDispatchedId}</div>
        <div class="text-muted" style="font-size:0.78rem;">Release Rule: ${c.releaseCondition} (${c.inspectionWindow})</div>
      </div>
      <button class="btn-silver-primary full-width" onclick="transitionContract('${c.id}', 'SETTLED')">
        Confirm Buyer Inspection Sign-Off & Release Payout &rarr;
      </button>
    `;
  } else {
    body.innerHTML = `
      <div class="va-terminal" style="border-color:rgba(16,185,129,0.4);">
        <div style="color:#34d399; font-weight:700; margin-bottom:6px;">✓ PAYOUT SETTLED TO ${companyProfile.bank.toUpperCase()}</div>
        <p class="text-muted" style="font-size:0.8rem;">Base Revenue (${formatNGN(c.base)}), Output VAT (${formatNGN(c.vat)}), and WHT Credit (${formatNGN(c.wht)}) have been permanently recorded in your FIRS Tax Ledger.</p>
      </div>
    `;
  }

  document.getElementById("escrowModal").classList.remove("hidden");
};

window.confirmWaybillDispatch = function(id) {
  const wb = document.getElementById("waybillInput").value.trim() || "WB-VERIFIED";
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
   7. EXPORT FIRS TAXPRO MAX CSV SCHEDULE
   ========================================================= */
function exportTaxCsv() {
  const settled = contracts.filter(c => c.status === "SETTLED");
  if (settled.length === 0) {
    alert("No settled contracts available to export yet.");
    return;
  }

  let csv = "Seller_TIN,Seller_RC,Contract_ID,Date,Buyer_Company,Buyer_TIN,Gross_Base_NGN,Output_VAT_7.5_NGN,WHT_Credit_NGN,Net_Settled_NGN\n";
  settled.forEach(c => {
    csv += `"${companyProfile.tin}","${companyProfile.rc}","${c.id}","${c.createdAt}","${c.counterparty}","${c.counterpartyTin}",${c.base},${c.vat},${c.wht},${c.payable}\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `freebee_FIRS_TaxSchedule_${companyProfile.tin}.csv`;
  a.click();
}

/* =========================================================
   8. EVENT LISTENERS
   ========================================================= */
document.addEventListener("DOMContentLoaded", () => {
  // Onboarding Form Submit
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

  // Switch / Reset Entity
  document.getElementById("resetProfileBtn").addEventListener("click", () => {
    if (confirm("Switch corporate entity? Your current profile will be cleared so you can onboard a new company.")) {
      localStorage.removeItem(STORAGE_KEYS.PROFILE);
      companyProfile = null;
      initApp();
    }
  });

  // Sidebar & Mobile Navigation
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => switchView(btn.getAttribute("data-view")));
  });

  document.getElementById("dashNewContractBtn").addEventListener("click", () => switchView("create"));

  // Contract Builder Live Listeners
  ["contractAmount", "contractTaxType", "applyTaxesToggle", "enableEscrowToggle", "escrowWindow", "escrowCondition", "escrowFeeSplit"].forEach(id => {
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
