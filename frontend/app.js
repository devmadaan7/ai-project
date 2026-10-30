
const API_BASE = window.location.protocol === "file:"
  ? "http://127.0.0.1:8000"
  : window.location.origin;

const FALLBACK_API = "http://127.0.0.1:8000";

let tripType = "oneway";
let selectedOutbound = null;
let selectedReturn = null;
let travellers = 1;
let lastOutboundRoutes = [];
let lastReturnRoutes = [];
let currentSort = "balanced";

const originSelect = document.getElementById("origin");
const destSelect = document.getElementById("destination");
const preferSelect = document.getElementById("prefer");
const transportModeSelect = document.getElementById("transportMode");
const timePeriodSelect = document.getElementById("timePeriod");
const departAfterInput = document.getElementById("departAfter");
const departMatchSelect = document.getElementById("departMatch");
const maxPriceInput = document.getElementById("maxPrice");
const travellersSelect = document.getElementById("travellers");
const departDateInput = document.getElementById("departDate");
const returnDateInput = document.getElementById("returnDate");
const searchBtn = document.getElementById("searchBtn");
const swapBtn = document.getElementById("swapBtn");
const statusEl = document.getElementById("status");
const resultsHeader = document.getElementById("results-header");
const resultsTitle = document.getElementById("results-title");
const resultsCount = document.getElementById("results-count");
const outboundSection = document.getElementById("outbound-section");
const returnSection = document.getElementById("return-section");
const outboundResults = document.getElementById("outbound-results");
const returnResults = document.getElementById("return-results");
const outboundLabel = document.getElementById("outbound-label");
const returnLabel = document.getElementById("return-label");
const bookingBar = document.getElementById("booking-bar");
const selectedSummary = document.getElementById("selected-summary");
const totalPriceEl = document.getElementById("total-price");
const bookBtn = document.getElementById("bookBtn");
const bookingModal = document.getElementById("bookingModal");
const modalBody = document.getElementById("modal-body");
const closeModal = document.getElementById("closeModal");
const bookingsModal = document.getElementById("bookingsModal");
const bookingsList = document.getElementById("bookings-list");
const closeBookings = document.getElementById("closeBookings");
const myBookingsLink = document.getElementById("myBookingsLink");
const btnText = searchBtn.querySelector(".btn-text");
const btnLoader = searchBtn.querySelector(".btn-loader");

function initDates() {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 3);

  const toISO = (d) => d.toISOString().split("T")[0];

  departDateInput.min = toISO(today);
  departDateInput.value = toISO(tomorrow);
  returnDateInput.min = toISO(tomorrow);
  returnDateInput.value = toISO(dayAfter);
  returnDateInput.disabled = true;
}

initDates();

const modeTabs = [...document.querySelectorAll(".mode-tab")];

function setTransportMode(mode) {
  transportModeSelect.value = mode;
  modeTabs.forEach((tab) =>
    tab.classList.toggle("active", tab.dataset.mode === mode)
  );
}

modeTabs.forEach((tab) =>
  tab.addEventListener("click", () => setTransportMode(tab.dataset.mode))
);

transportModeSelect.addEventListener("change", () => {
  const mode = transportModeSelect.value;
  modeTabs.forEach((tab) =>
    tab.classList.toggle("active", tab.dataset.mode === mode)
  );
});

setTransportMode("flight");

departDateInput.addEventListener("change", () => {
  const dep = departDateInput.value;

  if (dep) {
    returnDateInput.min = dep;

    if (returnDateInput.value && returnDateInput.value < dep) {
      const d = new Date(dep);
      d.setDate(d.getDate() + 1);
      returnDateInput.value = d.toISOString().split("T")[0];
    }
  }
});

document.querySelectorAll(".trip-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".trip-tab").forEach((t) =>
      t.classList.remove("active")
    );

    tab.classList.add("active");
    tripType = tab.dataset.type;
    returnDateInput.disabled = tripType !== "round";
    selectedOutbound = null;
    selectedReturn = null;
    updateBookingBar();
  });
});

document.querySelectorAll(".sort-pill").forEach((pill) => {
  pill.addEventListener("click", () => {
    document.querySelectorAll(".sort-pill").forEach((p) =>
      p.classList.remove("active")
    );

    pill.classList.add("active");
    currentSort = pill.dataset.sort;
    preferSelect.value = currentSort;

    if (lastOutboundRoutes.length) searchRoutes();
  });
});

document.querySelectorAll(".popular-card").forEach((card) => {
  card.addEventListener("click", () => {
    originSelect.value = card.dataset.from;
    destSelect.value = card.dataset.to;
    searchRoutes();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.getElementById("navBookBtn")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function showStatus(msg, type = "info") {
  statusEl.innerHTML = `<div class="${type}">${msg}</div>`;
  statusEl.classList.remove("hidden");
}

function hideStatus() {
  statusEl.classList.add("hidden");
}

function setLoading(on) {
  searchBtn.disabled = on;
  btnText.classList.toggle("hidden", on);
  btnLoader.classList.toggle("hidden", !on);
}

function formatDuration(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;

  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatPrice(n) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function formatDate(iso) {
  if (!iso) return "";

  const d = new Date(iso + "T00:00:00");

  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function getTimes(route) {
  const seg = route.segments && route.segments[0];

  if (route.departure_time || route.arrival_time) {
    return {
      dep: route.departure_time || "—",
      arr: route.arrival_time || "—"
    };
  }

  if (seg && seg.meta) {
    return {
      dep: seg.meta.dep || "—",
      arr: seg.meta.arr || "—"
    };
  }

  return { dep: "—", arr: "—" };
}

async function fetchFromAPI(endpoint) {
  const bases = [...new Set([API_BASE, window.__API_BASE, FALLBACK_API].filter(Boolean))];

  for (const base of bases) {
    try {
      const response = await fetch(`${base}${endpoint}`);

      if (response.ok) {
        window.__API_BASE = base;
        return await response.json();
      }
    } catch (error) {}
  }

  return null;
}

async function fetchCities() {
  return await fetchFromAPI("/cities");
}

async function fetchStates() {
  return await fetchFromAPI("/states");
}

async function loadCities() {
  try {
    const [cities, statesData] = await Promise.all([
      fetchCities(),
      fetchStates()
    ]);

    if (!cities || !Array.isArray(cities)) {
      showStatus("Cannot load cities. Please check the backend connection.", "error");
      return;
    }

    const cityByName = new Map(
      cities.map((city) => [city.name.trim().toLowerCase(), city])
    );

    const cityByState = new Map();

    cities.forEach((city) => {
      [city.state, ...(city.states || [])]
        .filter(Boolean)
        .forEach((state) => {
          const key = state.toLowerCase();

          if (!cityByState.has(key)) {
            cityByState.set(key, city);
          }
        });
    });

    [originSelect, destSelect].forEach((select) => {
      select.innerHTML = "";

      select.add(new Option("Select a location", ""));

      const citiesGroup = document.createElement("optgroup");
      citiesGroup.label = "Cities and travel hubs";

      cities.forEach((city) => {
        const stateLabel = city.states?.length
          ? city.states.join(" / ")
          : (city.state || "India");

        citiesGroup.appendChild(
          new Option(`${city.name} — ${stateLabel}`, city.id)
        );
      });

      select.appendChild(citiesGroup);
    });

    if (statesData) {
      const stateItems = [
        ...(statesData.states || []).map((item) => ({
          ...item,
          kind: "State"
        })),
        ...(statesData.union_territories || []).map((item) => ({
          ...item,
          kind: "Union Territory"
        }))
      ];

      [originSelect, destSelect].forEach((select) => {
        const statesGroup = document.createElement("optgroup");
        statesGroup.label = "Indian states and union territories";

        stateItems.forEach((item) => {
          const capitalName = item.capital
            .split(" (")[0]
            .trim()
            .toLowerCase();

          let city = cityByName.get(capitalName);

          if (!city) {
            city = cityByState.get(item.name.toLowerCase());
          }

          if (!city && ["Haryana", "Punjab"].includes(item.name)) {
            city = cityByName.get("chandigarh");
          }

          if (!city && item.name === "Delhi") {
            city = cityByName.get("new delhi");
          }

          if (city) {
            statesGroup.appendChild(
              new Option(
                `${item.name} — ${item.kind} (Capital: ${city.name})`,
                city.id
              )
            );
          }
        });

        select.appendChild(statesGroup);
      });
    } else {
      showStatus("Cities loaded, but states could not be loaded.", "error");
    }

    originSelect.value = "chennai";
    destSelect.value = "bangalore";

    hideStatus();

  } catch (error) {
    showStatus("Unable to load locations. Please refresh the page.", "error");
  }
}

function renderRoute(route, index, direction) {
  const delay = index * 40;
  const times = getTimes(route);
  const modesHtml = route.modes
    .map((m) => `<span class="mode-badge ${m}">${m}</span>`)
    .join("");

  const segsHtml = route.segments.map((s) => {
    const extra = [
      s.meta?.name,
      s.meta?.airline,
      s.meta?.operator,
      s.meta?.train_no ? `#${s.meta.train_no}` : null,
      s.meta?.vehicle,
      s.meta?.class,
      s.meta?.type
    ].filter(Boolean).join(" · ");

    const timeStr = (s.meta?.dep && s.meta.dep !== "Flexible")
      ? ` · ${s.meta.dep} → ${s.meta.arr || ""}`
      : (s.meta?.dep === "Flexible" ? " · Flexible timing" : "");

    return `
      <div class="seg-row">
        <span class="seg-mode ${s.mode}">${s.mode}</span>
        <span class="seg-info"><strong>${s.from} → ${s.to}</strong> · ${formatDuration(s.duration_min)} · ${formatPrice(s.cost)}${timeStr}${extra ? " · " + extra : ""}</span>
      </div>`;
  }).join("");

  const isSelected =
    (direction === "outbound" && selectedOutbound === index) ||
    (direction === "return" && selectedReturn === index);

  return `
    <article class="route-card ${isSelected ? "selected" : ""}"
             style="animation-delay:${delay}ms"
             data-dir="${direction}" data-idx="${index}">
      <div class="route-main">
        <div class="route-top-line">${modesHtml}</div>
        <div class="timeline">
          <div>
            <div class="tl-time">${times.dep}</div>
            <div class="tl-city">${route.origin}</div>
          </div>
          <div class="tl-mid">
            <div class="tl-dur">${formatDuration(route.total_duration_min)}</div>
            <div class="tl-line"></div>
            <div class="tl-dur">${route.total_distance_km} km</div>
          </div>
          <div style="text-align:right">
            <div class="tl-time">${times.arr}</div>
            <div class="tl-city">${route.destination}</div>
          </div>
        </div>
        <div class="route-meta">
          <span>${route.segments.length} segment${route.segments.length > 1 ? "s" : ""}</span>
          <span>${route.modes.join(" + ")}</span>
          ${(route.pricing_factors && route.pricing_factors.length) ? `<span class="surge-tag">${route.pricing_factors[0]}</span>` : ""}
          ${route.data_status ? `<span class="data-status">${route.data_status}</span>` : ""}
        </div>
        <div class="segments-detail">${segsHtml}</div>
      </div>
      <div class="route-side">
        <div class="route-price">${formatPrice(route.total_cost)}</div>
        <div class="route-price-note">per adult</div>
        <div class="select-hint">${isSelected ? "Selected" : "Tap to select"}</div>
      </div>
    </article>`;
}

function attachCardListeners(container, direction) {
  container.querySelectorAll(".route-card").forEach((card) => {
    card.addEventListener("click", () => {
      const idx = Number(card.dataset.idx);

      if (direction === "outbound") {
        selectedOutbound = idx;
      } else {
        selectedReturn = idx;
      }

      container.querySelectorAll(".route-card").forEach((c) =>
        c.classList.remove("selected")
      );

      card.classList.add("selected");
      updateBookingBar();
    });
  });
}

function updateBookingBar() {
  travellers = Number(travellersSelect.value) || 1;

  let total = 0;
  const parts = [];

  if (selectedOutbound !== null && lastOutboundRoutes[selectedOutbound]) {
    const r = lastOutboundRoutes[selectedOutbound];
    total += r.total_cost * travellers;
    parts.push(`Outbound ${formatDate(departDateInput.value)}: ${formatPrice(r.total_cost)}`);
  }

  if (tripType === "round" && selectedReturn !== null && lastReturnRoutes[selectedReturn]) {
    const r = lastReturnRoutes[selectedReturn];
    total += r.total_cost * travellers;
    parts.push(`Return ${formatDate(returnDateInput.value)}: ${formatPrice(r.total_cost)}`);
  }

  if (parts.length === 0) {
    selectedSummary.textContent = "Select options to continue";
    totalPriceEl.textContent = "₹0";
    bookBtn.disabled = true;
    bookingBar.classList.add("hidden");
    return;
  }

  bookingBar.classList.remove("hidden");
  selectedSummary.textContent =
    parts.join("  ·  ") + (travellers > 1 ? `  × ${travellers}` : "");

  totalPriceEl.textContent = formatPrice(total);

  bookBtn.disabled = !(
    selectedOutbound !== null &&
    (tripType === "oneway" || selectedReturn !== null)
  );
}

async function searchRoutes() {
  const origin = originSelect.value;
  const destination = destSelect.value;
  const prefer = preferSelect.value;
  const departDate = departDateInput.value;
  const returnDate = returnDateInput.value;
  const base = window.__API_BASE || API_BASE;

  if (!origin || !destination) {
    showStatus("Please select origin and destination.", "error");
    return;
  }

  if (origin === destination) {
    showStatus("Origin and destination cannot be the same.", "error");
    return;
  }

  if (!departDate) {
    showStatus("Please select a departure date.", "error");
    return;
  }

  if (tripType === "round" && !returnDate) {
    showStatus("Please select a return date.", "error");
    return;
  }

  if (tripType === "round" && returnDate < departDate) {
    showStatus("Return must be on/after departure.", "error");
    return;
  }

  setLoading(true);

  const modeLabels = {
    all: "all transport",
    flight: "flights",
    train: "trains",
    bus: "buses",
    cab: "cabs",
    road: "road options"
  };

  showStatus(`Searching ${modeLabels[transportModeSelect.value] || "travel options"}…`, "loading");

  outboundResults.innerHTML = "";
  returnResults.innerHTML = "";
  outboundSection.classList.add("hidden");
  returnSection.classList.add("hidden");
  resultsHeader.classList.add("hidden");

  selectedOutbound = null;
  selectedReturn = null;
  lastReturnRoutes = [];

  updateBookingBar();

  try {
    const mode = transportModeSelect.value || "all";
    const timePeriod = timePeriodSelect.value || "any";
    const maxPrice = maxPriceInput.value.trim();

    const query = (date) => {
      const params = new URLSearchParams({
        origin,
        destination,
        prefer,
        travel_date: date || departDate,
        mode,
        time_period: timePeriod
      });

      if (departAfterInput.value) {
        params.set("depart_time", departAfterInput.value);
        params.set("depart_match", departMatchSelect.value || "after");
      }

      if (maxPrice !== "") {
        params.set("max_price", maxPrice);
      }

      return params.toString();
    };

    const outRes = await fetch(`${base}/route?${query(departDate)}`);
    const outData = await outRes.json();

    if (!outRes.ok) {
      showStatus(outData.detail || "No routes found.", "error");
      return;
    }

    lastOutboundRoutes = outData.routes || [];

    outboundResults.innerHTML = lastOutboundRoutes
      .map((r, i) => renderRoute(r, i, "outbound"))
      .join("");

    attachCardListeners(outboundResults, "outbound");

    outboundLabel.textContent = `Outbound · ${formatDate(departDate)}`;
    outboundSection.classList.remove("hidden");

    if (tripType === "round") {
      const retParams = new URLSearchParams({
        origin: destination,
        destination: origin,
        prefer,
        travel_date: returnDate,
        mode,
        time_period: timePeriod
      });

      if (departAfterInput.value) {
        retParams.set("depart_time", departAfterInput.value);
        retParams.set("depart_match", departMatchSelect.value || "after");
      }

      if (maxPrice !== "") {
        retParams.set("max_price", maxPrice);
      }

      const retRes = await fetch(`${base}/route?${retParams.toString()}`);
      const retData = await retRes.json();

      if (retRes.ok && retData.routes?.length) {
        lastReturnRoutes = retData.routes;

        returnResults.innerHTML = lastReturnRoutes
          .map((r, i) => renderRoute(r, i, "return"))
          .join("");

        attachCardListeners(returnResults, "return");

        returnLabel.textContent = `Return · ${formatDate(returnDate)}`;
        returnSection.classList.remove("hidden");
      }
    }

    hideStatus();
    resultsHeader.classList.remove("hidden");

    const oName = lastOutboundRoutes[0]?.origin || origin;
    const dName = lastOutboundRoutes[0]?.destination || destination;

    resultsTitle.textContent = tripType === "round"
      ? `${oName} ⇄ ${dName}`
      : `${oName} → ${dName}`;

    resultsCount.textContent = (tripType === "round"
      ? `${outData.count} outbound · ${lastReturnRoutes.length} return options`
      : `${outData.count} option${outData.count !== 1 ? "s" : ""} found`) +
      " · Sample schedules and prices are estimates; verify with the operator.";

    selectedOutbound = lastOutboundRoutes.length ? 0 : null;

    outboundResults.querySelector(".route-card")?.classList.add("selected");

    if (tripType === "round" && lastReturnRoutes.length) {
      selectedReturn = 0;
      returnResults.querySelector(".route-card")?.classList.add("selected");
    }

    updateBookingBar();
    resultsHeader.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch (err) {
    showStatus("Failed to fetch routes. Please check the backend.", "error");
  } finally {
    setLoading(false);
  }
}

bookBtn.addEventListener("click", () => {
  if (!bookBtn.disabled) openBookingForm();
});

function openBookingForm() {
  const out = lastOutboundRoutes[selectedOutbound];
  const ret = tripType === "round"
    ? lastReturnRoutes[selectedReturn]
    : null;

  if (!out) return;

  travellers = Number(travellersSelect.value) || 1;

  const departDate = departDateInput.value;
  const returnDate = returnDateInput.value;

  let total = out.total_cost * travellers;

  if (ret) {
    total += ret.total_cost * travellers;
  }

  modalBody.innerHTML = `
    <h2 style="font-size:1.2rem;font-weight:800;margin-bottom:0.3rem">Complete booking</h2>
    <p style="color:var(--text-muted);font-size:0.88rem;margin-bottom:1.15rem;line-height:1.55">
      <strong style="color:var(--text)">${out.origin} ${tripType === "round" ? "⇄" : "→"} ${out.destination}</strong><br>
      ${formatDate(departDate)}${tripType === "round" ? " – " + formatDate(returnDate) : ""}
      · ${travellers} adult${travellers > 1 ? "s" : ""}
      · <strong style="color:var(--primary-dark)">${formatPrice(total)}</strong>
    </p>
    <div class="form-group">
      <label>Full Name (as on ID)</label>
      <input type="text" id="paxName" placeholder="Passenger name" />
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Email</label>
        <input type="email" id="paxEmail" placeholder="you@email.com" />
      </div>
      <div class="form-group">
        <label>Mobile</label>
        <input type="tel" id="paxMobile" placeholder="10-digit number" />
      </div>
    </div>
    <div class="form-group">
      <label>Card (Demo)</label>
      <input type="text" id="paxCard" placeholder="XXXX XXXX XXXX XXXX" maxlength="19" />
    </div>
    <button class="confirm-btn" id="confirmBook">Pay ${formatPrice(total)}</button>
    <p style="font-size:0.72rem;color:var(--text-muted);text-align:center;margin-top:0.7rem">
      Demo booking only. No real payment or ticket is issued.
    </p>
  `;

  bookingModal.classList.remove("hidden");

  document.getElementById("confirmBook").addEventListener("click", () => {
    const name = document.getElementById("paxName").value.trim();
    const email = document.getElementById("paxEmail").value.trim();
    const mobile = document.getElementById("paxMobile").value.trim();

    if (!name || !email || !mobile) {
      alert("Please fill name, email and mobile.");
      return;
    }

    const pnr = "WF" + Math.random().toString(36).substring(2, 8).toUpperCase();

    const booking = {
      pnr,
      name,
      email,
      mobile,
      travellers,
      tripType,
      departDate,
      returnDate: tripType === "round" ? returnDate : null,
      outbound: out,
      return: ret,
      total,
      bookedAt: new Date().toISOString()
    };

    const existing = JSON.parse(localStorage.getItem("wayfinder_bookings") || "[]");

    existing.unshift(booking);

    localStorage.setItem("wayfinder_bookings", JSON.stringify(existing));

    modalBody.innerHTML = `
      <div class="booking-success">
        <div class="check">✅</div>
        <h2 style="font-weight:800">Booking confirmed</h2>
        <p style="color:var(--text-muted);margin-top:0.25rem;font-size:0.9rem">Your trip is reserved.</p>
        <div class="pnr">${pnr}</div>
        <p style="font-size:0.88rem;color:var(--text-secondary);line-height:1.55">
          ${out.origin} ${tripType === "round" ? "⇄" : "→"} ${out.destination}<br>
          ${formatDate(departDate)}${tripType === "round" ? " – " + formatDate(returnDate) : ""}<br>
          ${travellers} adult${travellers > 1 ? "s" : ""} · ${formatPrice(total)}
        </p>
        <p style="font-size:0.8rem;margin-top:0.85rem;color:var(--text-muted)">Sent to ${email}</p>
        <button class="confirm-btn" style="margin-top:1.25rem;background:#e0f2fe;color:#0369a1" id="doneBtn">Done</button>
      </div>
    `;

    document.getElementById("doneBtn").addEventListener("click", () => {
      bookingModal.classList.add("hidden");
    });
  });
}

closeModal.addEventListener("click", () => {
  bookingModal.classList.add("hidden");
});

bookingModal.querySelector(".modal-backdrop").addEventListener("click", () => {
  bookingModal.classList.add("hidden");
});

myBookingsLink?.addEventListener("click", (e) => {
  e.preventDefault();

  const bookings = JSON.parse(localStorage.getItem("wayfinder_bookings") || "[]");

  if (!bookings.length) {
    bookingsList.innerHTML = `
      <p style="color:var(--text-muted);text-align:center;padding:2rem 0">
        No trips yet. Book one!
      </p>`;
  } else {
    bookingsList.innerHTML = bookings.map((b) => `
      <div class="booking-item">
        <div class="pnr-label">PNR</div>
        <div class="pnr-val">${b.pnr}</div>
        <div class="route-line">
          ${b.outbound.origin} ${b.tripType === "round" ? "⇄" : "→"} ${b.outbound.destination}
        </div>
        <div class="meta">
          ${formatDate(b.departDate)}${b.returnDate ? " – " + formatDate(b.returnDate) : ""}
          · ${b.name} · ${b.travellers} adult${b.travellers > 1 ? "s" : ""} · ${formatPrice(b.total)}
        </div>
      </div>
    `).join("");
  }

  bookingsModal.classList.remove("hidden");
});

closeBookings.addEventListener("click", () => {
  bookingsModal.classList.add("hidden");
});

bookingsModal.querySelector(".modal-backdrop").addEventListener("click", () => {
  bookingsModal.classList.add("hidden");
});

swapBtn.addEventListener("click", () => {
  const t = originSelect.value;
  originSelect.value = destSelect.value;
  destSelect.value = t;
});

searchBtn.addEventListener("click", searchRoutes);

travellersSelect.addEventListener("change", updateBookingBar);

function seedDemoBookings() {
  if (localStorage.getItem("wayfinder_seeded") === "1") return;

  const demos = [
    {
      pnr: "WF8K2M9P",
      name: "Demo User",
      email: "demo@wayfinder.ai",
      mobile: "9876543210",
      travellers: 1,
      tripType: "oneway",
      departDate: "2026-10-15",
      returnDate: null,
      outbound: {
        origin: "Chennai",
        destination: "Bengaluru",
        total_cost: 625,
        total_duration_min: 330,
        modes: ["train"],
        summary: "Chennai → Bengaluru (Train)"
      },
      return: null,
      total: 625,
      bookedAt: "2026-10-10T10:30:00.000Z"
    },
    {
      pnr: "WF3N7Q1R",
      name: "Demo User",
      email: "demo@wayfinder.ai",
      mobile: "9876543210",
      travellers: 2,
      tripType: "round",
      departDate: "2026-11-05",
      returnDate: "2026-11-09",
      outbound: {
        origin: "Mumbai",
        destination: "Delhi",
        total_cost: 6500,
        total_duration_min: 130,
        modes: ["flight"],
        summary: "Mumbai → Delhi (Flight)"
      },
      return: {
        origin: "Delhi",
        destination: "Mumbai",
        total_cost: 6500,
        total_duration_min: 130,
        modes: ["flight"],
        summary: "Delhi → Mumbai (Flight)"
      },
      total: 26000,
      bookedAt: "2026-10-20T14:15:00.000Z"
    },
    {
      pnr: "WF5C4B2X",
      name: "Demo User",
      email: "demo@wayfinder.ai",
      mobile: "9876543210",
      travellers: 1,
      tripType: "oneway",
      departDate: "2026-10-22",
      returnDate: null,
      outbound: {
        origin: "Delhi",
        destination: "Jaipur",
        total_cost: 3200,
        total_duration_min: 270,
        modes: ["cab"],
        summary: "Delhi → Jaipur (Cab)"
      },
      return: null,
      total: 3200,
      bookedAt: "2026-10-21T09:00:00.000Z"
    }
  ];

  const existing = JSON.parse(localStorage.getItem("wayfinder_bookings") || "[]");

  localStorage.setItem(
    "wayfinder_bookings",
    JSON.stringify([...demos, ...existing])
  );

  localStorage.setItem("wayfinder_seeded", "1");
}

seedDemoBookings();
loadCities();
