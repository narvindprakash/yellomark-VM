// ---- CONFIG ----
// Published "Master" tab CSV URL from Google Sheets (File > Share > Publish to web).
// Auto-republish is enabled on the sheet, so this URL always reflects the latest data.
const MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6eArKLNuEssSerMFTV8GDYm4Ay4_-59ZFQLwrgeDyhTHRaCXE3AsNPAjTwBzJ8B_sMTe8h0GuzasK/pub?gid=1001&single=true&output=csv";

// The deployed Apps Script Web App URL for the Sunday Team vendor directory
// backend (see Step 3 of the project setup). Paste it here after deploying.
const SUNDAY_TEAM_SCRIPT_URL = "PASTE_YOUR_DEPLOYED_APPS_SCRIPT_WEB_APP_URL_HERE";

// ============================================================
// ACCESS CONTROL — this is a UI-level convenience gate, not a hard
// security boundary (by design, agreed with the team). Add teammates'
// Gmail addresses below in ADMIN_EMAILS to give them BOTH the Product
// Search and Vendor Directory sections. Anyone who signs in and is NOT
// listed here — including any future employee not yet added — defaults
// to Vendor Directory access only. To give a new employee full admin
// access later, just add their email as another line in this array.
// ============================================================
const ADMIN_EMAILS = [
  "narvindprakash@gmail.com",
  "charan.sunny@gmail.com",
];

// ============================================================
// DEV MODE — while this is true, the Google Sign-In screen is skipped
// entirely and the app boots straight in as the first ADMIN_EMAILS entry.
// This exists so you and Charan can keep testing without needing the
// Google Cloud OAuth Client ID set up yet.
//
// IMPORTANT: set this to false before Ravi (or anyone else who should NOT
// automatically get admin access) starts using the real deployed site —
// at that point, real Google Sign-In needs to be active so each person's
// actual identity is checked against ADMIN_EMAILS above.
// ============================================================
const SKIP_LOGIN_FOR_TESTING = true;

let currentUser = null; // { email, name, picture }

// ---- GOOGLE SIGN-IN ----
function handleGoogleSignIn(response) {
  const payload = decodeJwtPayload(response.credential);
  currentUser = { email: payload.email, name: payload.name, picture: payload.picture };
  try { sessionStorage.setItem("ym_user", JSON.stringify(currentUser)); } catch (e) {}
  bootApp();
}

function decodeJwtPayload(token) {
  const base64Url = token.split(".")[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const jsonPayload = decodeURIComponent(
    atob(base64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
  );
  return JSON.parse(jsonPayload);
}

function isAdmin(email) {
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes((email || "").toLowerCase());
}

function bootApp() {
  document.getElementById("loginScreen").hidden = true;
  const appShell = document.getElementById("appShell");
  appShell.hidden = false;

  document.getElementById("userEmailLabel").textContent = currentUser.email;

  const admin = isAdmin(currentUser.email);
  const navProduct = document.getElementById("navProduct");
  const navVendor = document.getElementById("navVendor");

  if (admin) {
    navProduct.hidden = false;
    switchSection("product");
  } else {
    navProduct.hidden = true;
    switchSection("vendor");
  }

  navProduct.addEventListener("click", () => switchSection("product"));
  navVendor.addEventListener("click", () => switchSection("vendor"));

  document.getElementById("signOutBtn").addEventListener("click", signOut);

  // Kick off data loading for whichever sections this user can see.
  if (admin) loadProductData();
  loadVendors();
}

function switchSection(section) {
  document.getElementById("section-product").hidden = section !== "product";
  document.getElementById("section-vendor").hidden = section !== "vendor";
  document.getElementById("navProduct").classList.toggle("active", section === "product");
  document.getElementById("navVendor").classList.toggle("active", section === "vendor");
}

function signOut() {
  try { sessionStorage.removeItem("ym_user"); } catch (e) {}
  currentUser = null;
  if (window.google && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  document.getElementById("appShell").hidden = true;
  document.getElementById("loginScreen").hidden = false;
}

// Restore session on page refresh without forcing a re-login every time —
// or, while SKIP_LOGIN_FOR_TESTING is true, skip straight to admin access.
if (SKIP_LOGIN_FOR_TESTING) {
  window.addEventListener("DOMContentLoaded", function () {
    currentUser = { email: ADMIN_EMAILS[0], name: "Dev Testing" };
    bootApp();
  });
} else {
  (function restoreSession() {
    try {
      const saved = sessionStorage.getItem("ym_user");
      if (saved) {
        currentUser = JSON.parse(saved);
        window.addEventListener("DOMContentLoaded", bootApp);
      }
    } catch (e) {}
  })();
}

// ---- STATE ----
let allProducts = [];
let fuse = null;
let activeVendor = null;
let activeCategory = null;

const els = {
  statLine: document.getElementById("statLine"),
  searchInput: document.getElementById("searchInput"),
  clearBtn: document.getElementById("clearBtn"),
  vendorFilters: document.getElementById("vendorFilters"),
  categoryFilters: document.getElementById("categoryFilters"),
  sortSelect: document.getElementById("sortSelect"),
  resultsGrid: document.getElementById("resultsGrid"),
  resultsMeta: document.getElementById("resultsMeta"),
  emptyState: document.getElementById("emptyState"),
  detailOverlay: document.getElementById("detailOverlay"),
  detailPanel: document.getElementById("detailPanel"),
};

// ---- LOAD PRODUCT DATA (admin only — called from bootApp) ----
let productDataLoaded = false;
function loadProductData() {
  if (productDataLoaded) return;
  productDataLoaded = true;

  Papa.parse(MASTER_CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function (results) {
      allProducts = results.data
        .filter(r => r["Product ID"] && r["Status"] !== "Discontinued")
        .map(normalizeRow);

      fuse = new Fuse(allProducts, {
        keys: [
          { name: "name", weight: 0.5 },
          { name: "category", weight: 0.3 },
          { name: "vendor", weight: 0.2 },
        ],
        threshold: 0.35,
        ignoreLocation: true,
      });

      buildFilters();
      els.statLine.textContent = allProducts.length + " products across " + countVendors() + " vendors";
      render();
    },
    error: function (err) {
      els.statLine.textContent = "Could not load catalog data.";
      console.error(err);
    }
  });
}

function normalizeRow(r) {
  return {
    id: r["Product ID"],
    name: r["Product Name"],
    category: r["Category"],
    vendor: r["Vendor Name"],
    code: r["Vendor Product Code"],
    price: parseFloat(r["Price (MRP)"]) || 0,
    priceType: r["Price Type"],
    thumb: r["Thumbnail Image Link"],
    vendorRef: r["Vendor Sheet Reference"],
    folderLink: r["Vendor Folder Link"],
    hasVariants: (r["Has Variants"] || "").toLowerCase() === "yes",
    parentId: r["Parent Group ID"],
    status: r["Status"],
  };
}

function countVendors() {
  return new Set(allProducts.map(p => p.vendor)).size;
}

// ---- FILTERS ----
function buildFilters() {
  const vendors = [...new Set(allProducts.map(p => p.vendor))].sort();
  const categories = [...new Set(allProducts.map(p => p.category))].sort();

  vendors.forEach(v => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = v;
    chip.addEventListener("click", () => {
      activeVendor = activeVendor === v ? null : v;
      updateChipStates();
      render();
    });
    els.vendorFilters.appendChild(chip);
  });

  categories.forEach(c => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = c;
    chip.addEventListener("click", () => {
      activeCategory = activeCategory === c ? null : c;
      updateChipStates();
      render();
    });
    els.categoryFilters.appendChild(chip);
  });
}

function updateChipStates() {
  [...els.vendorFilters.querySelectorAll(".chip")].forEach(chip => {
    chip.classList.toggle("active", chip.textContent === activeVendor);
  });
  [...els.categoryFilters.querySelectorAll(".chip")].forEach(chip => {
    chip.classList.toggle("active", chip.textContent === activeCategory);
  });
}

// ---- SEARCH + RENDER ----
function getFiltered() {
  const query = els.searchInput.value.trim();
  let list = query
    ? fuse.search(query).map(r => r.item)
    : allProducts.slice();

  if (activeVendor) list = list.filter(p => p.vendor === activeVendor);
  if (activeCategory) list = list.filter(p => p.category === activeCategory);

  const sort = els.sortSelect.value;
  if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
  else if (sort === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name));

  return list;
}

function render() {
  const list = getFiltered();
  els.resultsGrid.innerHTML = "";
  els.emptyState.hidden = list.length !== 0;
  els.resultsMeta.textContent = list.length + (list.length === 1 ? " result" : " results");

  list.forEach(p => {
    const card = document.createElement("div");
    card.className = "card";
    card.addEventListener("click", () => openDetail(p));

    const thumbWrap = document.createElement("div");
    thumbWrap.className = "card-thumb";
    if (p.thumb && p.thumb.startsWith("http")) {
      const img = document.createElement("img");
      img.src = p.thumb;
      img.loading = "lazy";
      img.alt = p.name;
      img.onerror = () => { thumbWrap.classList.add("no-image"); thumbWrap.innerHTML = "No image"; };
      thumbWrap.appendChild(img);
    } else {
      thumbWrap.classList.add("no-image");
      thumbWrap.textContent = "No image";
    }

    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = `
      <div class="card-vendor">${escapeHtml(p.vendor)}</div>
      <div class="card-name">${escapeHtml(p.name)}</div>
      <div class="card-category">${escapeHtml(p.category)}</div>
      <div class="card-footer">
        <span class="card-price">₹${formatPrice(p.price)}${p.priceType === "Starting From" ? "+" : ""}</span>
        ${p.hasVariants ? '<span class="card-variants">multiple colors</span>' : ""}
      </div>
    `;

    card.appendChild(thumbWrap);
    card.appendChild(body);
    els.resultsGrid.appendChild(card);
  });
}

function formatPrice(n) {
  return n.toLocaleString("en-IN");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

// ---- DETAIL OVERLAY ----
function openDetail(p) {
  els.detailPanel.innerHTML = `
    <button class="detail-close" aria-label="Close">&times;</button>
    <div class="detail-top">
      <div class="detail-thumb">
        ${p.thumb && p.thumb.startsWith("http") ? `<img src="${p.thumb}" alt="${escapeHtml(p.name)}">` : ""}
      </div>
      <div class="detail-heading">
        <div class="detail-vendor">${escapeHtml(p.vendor)}</div>
        <h2 class="detail-name">${escapeHtml(p.name)}</h2>
        <div class="detail-price">₹${formatPrice(p.price)}${p.priceType === "Starting From" ? "+" : ""}</div>
      </div>
    </div>
    <dl class="detail-fields">
      <dt>Category</dt><dd>${escapeHtml(p.category)}</dd>
      <dt>Product ID</dt><dd>${escapeHtml(p.id)}</dd>
      ${p.code ? `<dt>Vendor Code</dt><dd>${escapeHtml(p.code)}</dd>` : ""}
      ${p.hasVariants ? `<dt>Variants</dt><dd>Multiple colors available under this product — see vendor sheet for full list.</dd>` : ""}
      ${p.folderLink && p.folderLink.startsWith("http") ? `<dt>Photos</dt><dd><a href="${p.folderLink}" target="_blank" rel="noopener">View all images on Drive →</a></dd>` : ""}
      <dt>Reference</dt><dd>${escapeHtml(p.vendorRef)}</dd>
    </dl>
  `;
  els.detailPanel.querySelector(".detail-close").addEventListener("click", closeDetail);
  els.detailOverlay.hidden = false;
}

function closeDetail() {
  els.detailOverlay.hidden = true;
}

els.detailOverlay.addEventListener("click", (e) => {
  if (e.target === els.detailOverlay) closeDetail();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDetail();
});

// ---- EVENTS ----
els.searchInput.addEventListener("input", render);
els.sortSelect.addEventListener("change", render);
els.clearBtn.addEventListener("click", () => {
  els.searchInput.value = "";
  activeVendor = null;
  activeCategory = null;
  updateChipStates();
  render();
});

// ============================================================
// VENDOR DIRECTORY (Sunday Team) — ported from the standalone app,
// talking to the same kind of Apps Script Web App backend.
// ============================================================

document.querySelectorAll(".vendor-tab").forEach(function (tab) {
  tab.addEventListener("click", function () {
    document.querySelectorAll(".vendor-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".vendor-view").forEach(v => v.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("view-" + tab.dataset.view).classList.add("active");
    if (tab.dataset.view === "directory") loadVendors();
  });
});

let selectedCategory = "";
let attachedFiles = [];
let editingId = null;

function enterEditMode(vendor) {
  editingId = vendor.id;
  document.getElementById("v-contactPerson").value = vendor.contactPerson || "";
  document.getElementById("v-company").value = vendor.company || "";
  document.getElementById("v-core").value = vendor.core || "";
  document.getElementById("v-location").value = vendor.location || "";
  document.getElementById("v-phone").value = vendor.phone || "";
  document.getElementById("v-notes").value = vendor.notes || "";
  document.querySelectorAll(".toggle-option").forEach(function (o) {
    o.classList.toggle("active", o.dataset.value === vendor.category);
  });
  selectedCategory = vendor.category || "";
  attachedFiles = [];
  renderFileList();
  vSubmitBtn.textContent = "Update vendor";
  document.getElementById("cancelEditRow").style.display = "block";
  document.querySelector('.vendor-tab[data-view="add"]').click();
}

function exitEditMode() {
  editingId = null;
  vForm.reset();
  document.querySelectorAll(".toggle-option").forEach(o => o.classList.remove("active"));
  selectedCategory = "";
  attachedFiles = [];
  renderFileList();
  vSubmitBtn.textContent = "Submit vendor";
  document.getElementById("cancelEditRow").style.display = "none";
}

document.getElementById("cancelEditLink").addEventListener("click", function (e) {
  e.preventDefault();
  exitEditMode();
});

document.querySelectorAll(".toggle-option").forEach(function (opt) {
  opt.addEventListener("click", function () {
    document.querySelectorAll(".toggle-option").forEach(o => o.classList.remove("active"));
    opt.classList.add("active");
    selectedCategory = opt.dataset.value;
  });
});

const uploadZone = document.getElementById("uploadZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");

uploadZone.addEventListener("click", () => fileInput.click());
["dragover", "dragleave", "drop"].forEach(function (evt) {
  uploadZone.addEventListener(evt, function (e) {
    e.preventDefault();
    uploadZone.classList.toggle("drag", evt === "dragover");
  });
});
uploadZone.addEventListener("drop", e => handleFiles(e.dataTransfer.files));
fileInput.addEventListener("change", function () { handleFiles(fileInput.files); fileInput.value = ""; });

function handleFiles(fileArr) {
  Array.from(fileArr).forEach(file => attachedFiles.push(file));
  renderFileList();
}

function renderFileList() {
  fileList.innerHTML = "";
  attachedFiles.forEach(function (file, idx) {
    const row = document.createElement("div");
    row.className = "file-row";
    row.innerHTML = "<span>" + escapeHtml(file.name) + "</span>";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "\u2715";
    btn.addEventListener("click", function () { attachedFiles.splice(idx, 1); renderFileList(); });
    row.appendChild(btn);
    fileList.appendChild(row);
  });
}

function fileToBase64(file) {
  return new Promise(function (resolve, reject) {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const vForm = document.getElementById("vendorForm");
const vSubmitBtn = document.getElementById("submitBtn");
const vStatus = document.getElementById("v-status");

vForm.addEventListener("submit", function (e) {
  e.preventDefault();

  if (SUNDAY_TEAM_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
    showVStatus("err", "Set SUNDAY_TEAM_SCRIPT_URL in app.js to your deployed Apps Script URL first.");
    return;
  }

  vSubmitBtn.disabled = true;
  vSubmitBtn.textContent = "Submitting…";
  showVStatus("", "");

  const payload = {
    contactPerson: document.getElementById("v-contactPerson").value,
    company: document.getElementById("v-company").value,
    category: selectedCategory,
    core: document.getElementById("v-core").value,
    location: document.getElementById("v-location").value,
    phone: document.getElementById("v-phone").value,
    notes: document.getElementById("v-notes").value
  };
  const wasEditing = !!editingId;
  if (wasEditing) {
    payload.action = "update";
    payload.id = editingId;
  }
  const filesToAttach = attachedFiles.slice();

  fetch(SUNDAY_TEAM_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).then(res => res.json().catch(() => ({ status: "success" })))
    .then(function (result) {
      if (result && result.status === "error") {
        showVStatus("err", result.message || "The sheet rejected that submission.");
        return;
      }
      const vendorId = wasEditing ? editingId : result.id;
      showVStatus("ok", wasEditing ? "Vendor updated." : "Vendor added.");
      exitEditMode();
      vendorsLoaded = false;
      try { localStorage.removeItem(V_CACHE_KEY); } catch (e) {}

      if (filesToAttach.length && vendorId) {
        attachFilesInBackground(vendorId, filesToAttach);
      }
    }).catch(function (err) {
      showVStatus("err", "Something went wrong — check your connection and try again.");
      console.error(err);
    }).finally(function () {
      vSubmitBtn.disabled = false;
      vSubmitBtn.textContent = "Submit vendor";
    });
});

function attachFilesInBackground(vendorId, files) {
  Promise.all(files.map(file =>
    fileToBase64(file).then(base64 => ({ filename: file.name, mimeType: file.type, data: base64 }))
  )).then(function (encoded) {
    return fetch(SUNDAY_TEAM_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "attach", id: vendorId, files: encoded })
    });
  }).then(res => res.json().catch(() => ({ status: "success" })))
    .then(function (result) {
      if (result && result.status === "error") {
        console.error("Background file attach failed:", result.message);
        return;
      }
      vendorsLoaded = false;
      try { localStorage.removeItem(V_CACHE_KEY); } catch (e) {}
    }).catch(err => console.error("Background file attach failed:", err));
}

function showVStatus(type, msg) {
  vStatus.className = "v-status" + (msg ? " show " + type : "");
  vStatus.textContent = msg;
}

let allVendors = [];
let vendorsLoaded = false;
const V_CACHE_KEY = "sunday_team_vendor_cache_v2";

function jsonp(url) {
  return new Promise(function (resolve, reject) {
    const cbName = "jsonp_cb_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
    const script = document.createElement("script");
    const timeout = setTimeout(function () {
      cleanup();
      reject(new Error("Request timed out"));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cbName] = function (data) { cleanup(); resolve(data); };
    script.onerror = function () { cleanup(); reject(new Error("Script load failed")); };
    script.src = url + (url.indexOf("?") > -1 ? "&" : "?") + "callback=" + cbName;
    document.body.appendChild(script);
  });
}

function loadVendors() {
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(V_CACHE_KEY) || "null"); } catch (e) {}
  if (cached && cached.length && !vendorsLoaded) {
    allVendors = cached;
    renderVendors(allVendors);
  } else if (!vendorsLoaded) {
    document.getElementById("vendorList").innerHTML = '<div class="empty">Loading vendors…</div>';
  }

  if (vendorsLoaded) return;
  if (SUNDAY_TEAM_SCRIPT_URL.indexOf("PASTE_YOUR") === 0) {
    document.getElementById("vendorList").innerHTML = '<div class="empty">Set SUNDAY_TEAM_SCRIPT_URL in app.js first.</div>';
    return;
  }

  jsonp(SUNDAY_TEAM_SCRIPT_URL + "?action=list")
    .then(function (data) {
      allVendors = data.vendors || [];
      vendorsLoaded = true;
      renderVendors(allVendors);
      try { localStorage.setItem(V_CACHE_KEY, JSON.stringify(allVendors)); } catch (e) {}
    })
    .catch(function (err) {
      if (!cached || !cached.length) {
        document.getElementById("vendorList").innerHTML = '<div class="empty">Couldn\u2019t load the directory. Try again.</div>';
      }
      console.error(err);
    });
}

function sortByCore(list) {
  return list.slice().sort(function (a, b) {
    const ca = (a.core || "").trim().toLowerCase();
    const cb = (b.core || "").trim().toLowerCase();
    if (!ca && !cb) return 0;
    if (!ca) return 1;
    if (!cb) return -1;
    return ca.localeCompare(cb);
  });
}

function renderVendors(list) {
  const container = document.getElementById("vendorList");
  list = sortByCore(list);
  if (!list.length) {
    container.innerHTML = '<div class="empty">No vendors match yet.</div>';
    return;
  }
  window.__vendorLookup = window.__vendorLookup || {};
  container.innerHTML = list.map(function (v) {
    const docCount = v.docCount || 0;
    window.__vendorLookup[v.id] = v;
    return "" +
      '<div class="vendor-card" data-id="' + escapeHtml(v.id || "") + '">' +
        '<div class="vendor-top">' +
          "<div>" +
            '<p class="vendor-name">' + escapeHtml(v.core || "Uncategorized") + "</p>" +
            '<p class="vendor-company">' + escapeHtml(v.company || "Unnamed") + (v.contactPerson ? " · " + escapeHtml(v.contactPerson) : "") + "</p>" +
          "</div>" +
          (v.category ? '<div class="vendor-badge">' + escapeHtml(v.category) + "</div>" : "") +
        "</div>" +
        '<div class="vendor-meta">' +
          (v.location ? "<span><b>Location:</b> " + escapeHtml(v.location) + "</span>" : "") +
          (v.phone ? "<span><b>Phone:</b> " + escapeHtml(v.phone) + "</span>" : "") +
        "</div>" +
        (v.notes ? '<div class="vendor-notes">' + escapeHtml(v.notes) + "</div>" : "") +
        (docCount ? '<div class="vendor-docs" id="docs-' + escapeHtml(v.id || "") + '" style="display:none;"></div>' : "") +
        '<div class="card-actions">' +
          (docCount ? '<button type="button" class="docs-btn" data-id="' + escapeHtml(v.id || "") + '" data-count="' + docCount + '">View docs (' + docCount + ")</button>" : "") +
          (v.phone ? '<a class="call-btn" href="tel:' + escapeHtml(String(v.phone).replace(/[^0-9+]/g, "")) + '">Call</a>' : "") +
          '<button type="button" class="update-btn" data-id="' + escapeHtml(v.id || "") + '">Update</button>' +
        "</div>" +
      "</div>";
  }).join("");

  container.querySelectorAll(".update-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const vendor = window.__vendorLookup[btn.dataset.id];
      if (vendor) enterEditMode(vendor);
    });
  });

  const docsCache = {};
  container.querySelectorAll(".docs-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const panel = document.getElementById("docs-" + btn.dataset.id);
      const isOpen = panel.style.display !== "none";
      if (isOpen) {
        panel.style.display = "none";
        btn.textContent = "View docs (" + btn.dataset.count + ")";
        return;
      }
      if (docsCache[btn.dataset.id]) {
        panel.innerHTML = docsCache[btn.dataset.id];
        panel.style.display = "flex";
        btn.textContent = "Hide docs (" + btn.dataset.count + ")";
        return;
      }
      btn.textContent = "Loading…";
      jsonp(SUNDAY_TEAM_SCRIPT_URL + "?action=docs&id=" + encodeURIComponent(btn.dataset.id))
        .then(function (data) {
          const links = (data.documents || []).map((url, i) =>
            '<a href="' + url + '" target="_blank" rel="noopener">File ' + (i + 1) + "</a>"
          ).join("");
          docsCache[btn.dataset.id] = links;
          panel.innerHTML = links;
          panel.style.display = "flex";
          btn.textContent = "Hide docs (" + btn.dataset.count + ")";
        })
        .catch(() => { btn.textContent = "Couldn't load — retry"; });
    });
  });
}

document.getElementById("vendorSearchInput").addEventListener("input", function (e) {
  const q = e.target.value.toLowerCase();
  const filtered = allVendors.filter(v =>
    (v.contactPerson || "").toLowerCase().includes(q) ||
    (v.company || "").toLowerCase().includes(q) ||
    (v.location || "").toLowerCase().includes(q) ||
    (v.core || "").toLowerCase().includes(q) ||
    (v.category || "").toLowerCase().includes(q) ||
    (v.notes || "").toLowerCase().includes(q) ||
    String(v.phone || "").toLowerCase().includes(q)
  );
  renderVendors(filtered);
});
