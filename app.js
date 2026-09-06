// ---- CONFIG ----
// Published "Master" tab CSV URL from Google Sheets (File > Share > Publish to web).
// Auto-republish is enabled on the sheet, so this URL always reflects the latest data.
const MASTER_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6eArKLNuEssSerMFTV8GDYm4Ay4_-59ZFQLwrgeDyhTHRaCXE3AsNPAjTwBzJ8B_sMTe8h0GuzasK/pub?gid=1001&single=true&output=csv";

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

// ---- LOAD DATA ----
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
        { name: "Product Name", weight: 0.5 },
        { name: "Category", weight: 0.3 },
        { name: "Vendor Name", weight: 0.2 },
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
