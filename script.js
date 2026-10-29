/* =========================================================
   Openings Board - script.js
   Flow: load JSON -> keep it in `state` -> on any change run
   filter -> sort -> paginate -> render.
   ========================================================= */

const DATA_URL = "data/listings.json";
const PAGE_SIZE = 6;       // cards per page
const DEBOUNCE_MS = 250;   // wait this long after typing stops before searching

/* ---------- 1. State: the single source of truth ---------- */
const state = {
  all: [],            // every listing from the JSON file
  query: "",          // text typed in the search box
  domain: "all",
  level: "all",
  mode: "all",
  sort: "newest",
  page: 1,
};

/* ---------- 2. Grab the page elements once ---------- */
const els = {
  search: document.getElementById("search"),
  searchForm: document.getElementById("search-form"),
  domain: document.getElementById("filter-domain"),
  level: document.getElementById("filter-level"),
  mode: document.getElementById("filter-mode"),
  sort: document.getElementById("sort"),
  clear: document.getElementById("clear"),
  count: document.getElementById("result-count"),
  results: document.getElementById("results"),
  pagination: document.getElementById("pagination"),
};

/* ---------- 3. Small helpers ---------- */

// Debounce: returns a version of fn that only runs after `wait` ms of silence.
// Typing "python" fires 6 key events, but the search runs once.
function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Builds a DOM element safely. Using textContent (not innerHTML)
// means data from the JSON can never inject HTML or scripts.
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(child instanceof Node ? child : document.createTextNode(child));
  }
  return node;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/* ---------- 4. Loading data (asynchronous) ---------- */
async function loadListings() {
  showLoading();
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`The server answered with status ${response.status}.`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("The listings file is not a list.");

    // Pre-build one lowercase search string per listing so typing stays fast.
    state.all = data.map((item) => ({
      ...item,
      _search: [item.title, item.company, item.domain, item.summary, item.skills.join(" ")]
        .join(" ")
        .toLowerCase(),
    }));

    fillSelect(els.domain, "All domains", "domain");
    fillSelect(els.level, "All levels", "level");
    fillSelect(els.mode, "All work modes", "workMode");
    render();
  } catch (error) {
    showError(error);
  }
}

// Builds a dropdown's options from the values that exist in the data.
function fillSelect(select, allLabel, field) {
  const values = [...new Set(state.all.map((item) => item[field]))].sort();
  select.replaceChildren(
    h("option", { value: "all" }, allLabel),
    ...values.map((v) => h("option", { value: v }, v))
  );
}

/* ---------- 5. The pipeline: filter -> sort ---------- */
function getFiltered() {
  // Split the query into words. "sql intern" means BOTH words must match.
  const words = state.query.toLowerCase().split(/\s+/).filter(Boolean);

  const filtered = state.all.filter((item) =>
    words.every((word) => item._search.includes(word)) &&          // search
    (state.domain === "all" || item.domain === state.domain) &&    // AND domain
    (state.level === "all" || item.level === state.level) &&       // AND level
    (state.mode === "all" || item.workMode === state.mode)         // AND work mode
  );

  // ISO dates (2026-10-27) sort correctly as plain text.
  const sorters = {
    newest: (a, b) => b.postedOn.localeCompare(a.postedOn),
    az: (a, b) => a.title.localeCompare(b.title),
    za: (a, b) => b.title.localeCompare(a.title),
  };
  return filtered.sort(sorters[state.sort]);
}

/* ---------- 6. Rendering ---------- */
function render() {
  const filtered = getFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  state.page = Math.min(state.page, totalPages); // never stay on a page that no longer exists

  const start = (state.page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  els.count.textContent =
    filtered.length === 0
      ? "0 openings found"
      : `Showing ${start + 1}-${start + pageItems.length} of ${filtered.length} openings`;

  if (filtered.length === 0) {
    showEmpty();
    els.pagination.replaceChildren();
    return;
  }

  els.results.replaceChildren(
    h("ul", { class: "card-grid" }, ...pageItems.map(buildCard))
  );
  renderPagination(totalPages);
}

function buildCard(item) {
  const skillButtons = item.skills.map((skill) =>
    h("button", {
      type: "button",
      class: "skill",
      "aria-label": `Search for ${skill}`,
      onclick: () => {
        els.search.value = skill;
        state.query = skill;
        state.page = 1;
        render();
      },
    }, skill)
  );

  return h("li", { class: "card" },
    h("p", { class: "card-domain" }, item.domain),
    h("h2", {}, item.title),
    h("p", { class: "card-company" }, `${item.company}, ${item.location}`),
    h("ul", { class: "badges" },
      h("li", { class: "badge" }, item.level),
      h("li", { class: "badge badge-mode" }, item.workMode),
      h("li", { class: "badge" }, item.type)
    ),
    h("p", { class: "card-summary" }, item.summary),
    h("div", { class: "skills" }, ...skillButtons),
    h("p", { class: "card-footer" }, `Posted ${formatDate(item.postedOn)}`)
  );
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    els.pagination.replaceChildren();
    return;
  }
  const goTo = (page) => {
    state.page = page;
    render();
    els.results.focus({ preventScroll: true });
    els.results.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const buttons = [
    h("button", { type: "button", onclick: () => goTo(state.page - 1), ...(state.page === 1 ? { disabled: "" } : {}) }, "Previous"),
  ];
  for (let p = 1; p <= totalPages; p++) {
    buttons.push(
      h("button", {
        type: "button",
        "aria-label": `Page ${p}`,
        ...(p === state.page ? { "aria-current": "page" } : {}),
        onclick: () => goTo(p),
      }, String(p))
    );
  }
  buttons.push(
    h("button", { type: "button", onclick: () => goTo(state.page + 1), ...(state.page === totalPages ? { disabled: "" } : {}) }, "Next")
  );
  els.pagination.replaceChildren(...buttons);
}

/* ---------- 7. Loading, empty and error screens ---------- */
function showLoading() {
  els.count.textContent = "";
  els.pagination.replaceChildren();
  els.results.replaceChildren(
    h("div", { class: "state", role: "status" },
      h("div", { class: "spinner", "aria-hidden": "true" }),
      h("p", {}, "Loading openings...")
    )
  );
}

function showEmpty() {
  els.results.replaceChildren(
    h("div", { class: "state" },
      h("h2", {}, "No openings match your search"),
      h("p", {}, "Try fewer keywords, check the spelling, or remove a filter."),
      h("button", { type: "button", class: "btn", onclick: clearAll }, "Clear all filters")
    )
  );
}

function showError(error) {
  els.count.textContent = "";
  els.pagination.replaceChildren();
  els.results.replaceChildren(
    h("div", { class: "state state-error", role: "alert" },
      h("h2", {}, "The openings could not be loaded"),
      h("p", {}, "Check your internet connection and try again."),
      h("p", { class: "detail" },
        `Details: ${error.message} If you opened index.html by double-clicking it, run a local server instead (see README).`),
      h("button", { type: "button", class: "btn", onclick: loadListings }, "Try again")
    )
  );
}

/* ---------- 8. User actions ---------- */
function clearAll() {
  Object.assign(state, { query: "", domain: "all", level: "all", mode: "all", sort: "newest", page: 1 });
  els.search.value = "";
  els.domain.value = els.level.value = els.mode.value = "all";
  els.sort.value = "newest";
  render();
}

// Every change resets to page 1, then re-runs the pipeline.
function update(changes) {
  Object.assign(state, changes, { page: 1 });
  render();
}

els.search.addEventListener("input", debounce((e) => update({ query: e.target.value }), DEBOUNCE_MS));
els.searchForm.addEventListener("submit", (e) => e.preventDefault()); // Enter must not reload the page
els.domain.addEventListener("change", (e) => update({ domain: e.target.value }));
els.level.addEventListener("change", (e) => update({ level: e.target.value }));
els.mode.addEventListener("change", (e) => update({ mode: e.target.value }));
els.sort.addEventListener("change", (e) => update({ sort: e.target.value }));
els.clear.addEventListener("click", clearAll);

/* ---------- 9. Start ---------- */
loadListings();
