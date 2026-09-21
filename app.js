const APP_VERSION = "v8";

const MONTHS = [
  { id: 0, label: "Year" },
  { id: 1, label: "Jan" },
  { id: 2, label: "Feb" },
  { id: 3, label: "Mar" },
  { id: 4, label: "Apr" },
  { id: 5, label: "May" },
  { id: 6, label: "Jun" },
  { id: 7, label: "Jul" },
  { id: 8, label: "Aug" },
  { id: 9, label: "Sep" },
  { id: 10, label: "Oct" },
  { id: 11, label: "Nov" },
  { id: 12, label: "Dec" },
];

const YARDS = [
  { id: "cpi", name: "CPI-U", hint: "Official urban basket" },
  { id: "pce", name: "PCE", hint: "Fed’s preferred" },
  { id: "chained_cpi", name: "Chained CPI", hint: "Substitution built in" },
  { id: "gdp_deflator", name: "GDP deflator", hint: "All output, not just households" },
  { id: "wage_hourly", name: "Hourly wage", hint: "Production worker pay" },
  { id: "gdp_per_capita", name: "GDP per capita", hint: "Average output per person" },
  { id: "gdp", name: "Share of GDP", hint: "How big vs the whole economy" },
  { id: "gold", name: "Gold", hint: "Official par, then COMEX", unit: "oz" },
  { id: "silver_spot", name: "Silver", hint: "Spot ounce", unit: "oz" },
  { id: "m2", name: "M2", hint: "Broad money" },
  { id: "m1", name: "M1", hint: "Narrow money" },
  { id: "base", name: "Monetary base", hint: "Fed’s balance-sheet dollars" },
  { id: "mzm", name: "MZM", hint: "Money at zero maturity" },
  { id: "dxy", name: "Broad dollar", hint: "Dollar vs other currencies" },
  { id: "bitcoin", name: "Bitcoin", hint: "Priced in BTC", unit: "BTC" },
];

const ITEMS = [
  { id: "custom", name: "Custom $", typed: true, kind: "commodity" },
  { id: "milk", name: "Milk", unit: "/gal", series: "milk", kind: "commodity" },
  { id: "eggs", name: "Eggs", unit: "/doz", series: "eggs", kind: "commodity" },
  { id: "bread", name: "White bread", unit: "/lb", series: "bread", kind: "commodity" },
  { id: "coffee", name: "Coffee", unit: "/lb", series: "coffee", kind: "commodity" },
  { id: "gasoline", name: "Gasoline", unit: "/gal", series: "gasoline", kind: "commodity" },
  { id: "electricity", name: "Electricity", series: "electricity", kind: "commodity" },
  { id: "wti", name: "WTI oil", unit: "/bbl", series: "wti", kind: "commodity" },
  { id: "gold", name: "Gold", unit: "/oz", series: "gold", kind: "commodity" },
  { id: "silver_spot", name: "Silver", unit: "/oz", series: "silver_spot", kind: "commodity" },
  { id: "bitcoin", name: "Bitcoin", series: "bitcoin", kind: "asset" },
  { id: "wage_hourly", name: "Hourly wage", series: "wage_hourly", kind: "income" },
  { id: "rent", name: "Rent index", series: "rent", kind: "commodity" },
  { id: "homes_cs", name: "Home price CS", series: "homes_cs", kind: "asset" },
  { id: "homes_fhfa", name: "Home price FHFA", series: "homes_fhfa", kind: "asset" },
  { id: "college", name: "College tuition", series: "college", kind: "commodity" },
  { id: "medical", name: "Medical care", series: "medical", kind: "commodity" },
  { id: "used_cars", name: "Used cars", series: "used_cars", kind: "commodity" },
  { id: "nasdaq", name: "NASDAQ", series: "nasdaq", kind: "asset" },
  { id: "stocks", name: "S&P 500", series: "stocks", kind: "asset" },
];

const state = {
  thenYear: 2000,
  thenMonth: 0,
  nowYear: 2025,
  nowMonth: 0,
  item: "custom",
  yard: "cpi",
  amount: 1,
  data: null,
};

function $(id) {
  return document.getElementById(id);
}

function seriesOf(id) {
  return state.data && state.data.series && state.data.series[id];
}

function atYear(ser, year) {
  if (!ser || !ser.years) return null;
  const i = ser.years.indexOf(year);
  if (i < 0) return null;
  const v = ser.annual[i];
  return v == null ? null : v;
}

function atMonth(ser, year, month) {
  if (!ser) return null;
  if (!month) return atYear(ser, year);
  const row = ser.monthly && ser.monthly[String(year)];
  if (!row) return atYear(ser, year);
  const v = row[month - 1];
  return v == null ? atYear(ser, year) : v;
}

function scale(yardId, y0, m0, y1, m1) {
  const ser = seriesOf(yardId);
  const a = atMonth(ser, y0, m0);
  const b = atMonth(ser, y1, m1);
  if (a == null || b == null || a === 0) return null;
  return b / a;
}

function money(n, digits) {
  if (n == null || !isFinite(n)) return "—";
  const d = digits != null ? digits : Math.abs(n) >= 1000 ? 0 : Math.abs(n) >= 100 ? 1 : 2;
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
  return (n < 0 ? "-$" : "$") + s;
}

function pct(n) {
  if (n == null || !isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + n.toFixed(0) + "%";
}

function itemMeta() {
  return ITEMS.find((x) => x.id === state.item) || ITEMS[0];
}

function yardMeta() {
  return YARDS.find((x) => x.id === state.yard) || YARDS[0];
}

function thenAmount() {
  const it = itemMeta();
  if (it.typed) return state.amount;
  return atMonth(seriesOf(it.series || it.id), state.thenYear, state.thenMonth);
}

function nowActual() {
  const it = itemMeta();
  if (it.typed) return null;
  return atMonth(seriesOf(it.series || it.id), state.nowYear, state.nowMonth);
}

function whenLabel(year, month) {
  if (!month) return String(year);
  return MONTHS[month].label + " " + year;
}

function compute() {
  const it = itemMeta();
  const yd = yardMeta();
  const from = thenAmount();
  const ratio = scale(yd.id, state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
  const expected = from != null && ratio != null ? from * ratio : null;
  const actual = nowActual();
  const vs =
    expected != null && actual != null && expected !== 0
      ? ((actual - expected) / expected) * 100
      : null;
  const wage0 = atMonth(seriesOf("wage_hourly"), state.thenYear, state.thenMonth);
  const wage1 = atMonth(seriesOf("wage_hourly"), state.nowYear, state.nowMonth);
  const mins0 = from != null && wage0 ? (from / wage0) * 60 : null;
  const mins1 =
    (actual != null && wage1 ? (actual / wage1) * 60 : null) ??
    (expected != null && wage1 ? (expected / wage1) * 60 : null);
  let u0 = null;
  let u1 = null;
  if (yd.unit) {
    const px0 = atMonth(seriesOf(yd.id), state.thenYear, state.thenMonth);
    const px1 = atMonth(seriesOf(yd.id), state.nowYear, state.nowMonth);
    const nowDollars = it.typed ? from : actual;
    if (from != null && px0) u0 = from / px0;
    if (nowDollars != null && px1) u1 = nowDollars / px1;
  }
  return { it, yd, from, ratio, expected, actual, vs, mins0, mins1, u0, u1 };
}

function fmtMeasure(n) {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  let d = 2;
  if (abs >= 100) d = 0;
  else if (abs >= 10) d = 1;
  else if (abs >= 1) d = 2;
  else if (abs >= 0.1) d = 3;
  else if (abs >= 0.01) d = 4;
  else if (abs >= 0.001) d = 5;
  else d = 6;
  return (
    sign +
    abs.toLocaleString("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: d,
    })
  );
}

function fmtMins(m) {
  if (m == null || !isFinite(m)) return "—";
  if (m >= 120) return (m / 60).toFixed(1) + " hr";
  return Math.round(m) + " min";
}

function renderHero(c) {
  const unit = c.it.unit || "";
  $("heroFrom").textContent = c.it.typed
    ? money(c.from)
    : (c.from == null ? "—" : money(c.from)) + unit;
  $("heroFromCap").textContent = whenLabel(state.thenYear, state.thenMonth);
  $("heroTo").textContent = money(c.expected);
  $("heroBy").textContent =
    c.yd.name + " · " + whenLabel(state.nowYear, state.nowMonth);
  const measure = $("heroMeasure");
  if (c.yd.unit) {
    measure.hidden = false;
    measure.textContent =
      fmtMeasure(c.u0) +
      " " +
      c.yd.unit +
      " then  →  " +
      fmtMeasure(c.u1) +
      " " +
      c.yd.unit +
      " now";
  } else {
    measure.hidden = true;
  }
  const check = $("heroCheck");
  if (c.actual != null && c.vs != null) {
    check.hidden = false;
    check.className =
      "hero-check " + (c.vs > 8 ? "is-hot" : c.vs < -8 ? "is-cool" : "");
    check.textContent =
      "Actual " +
      money(c.actual) +
      (c.it.unit || "") +
      " · " +
      pct(c.vs) +
      " vs this yardstick";
  } else {
    check.hidden = true;
  }

  const work = $("work");
  if (c.mins0 != null) {
    work.hidden = false;
    work.textContent =
      "Work time  " +
      fmtMins(c.mins0) +
      " then  →  " +
      fmtMins(c.mins1) +
      " now";
  } else {
    work.hidden = true;
  }
}

function renderFan(c) {
  const el = $("fan");
  el.innerHTML = YARDS.map((y) => {
    const r = scale(y.id, state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
    const v = c.from != null && r != null ? c.from * r : null;
    const on = y.id === state.yard ? " is-on" : "";
    const miss = v == null ? " is-miss" : "";
    return (
      '<div class="fan-row' +
      on +
      '"><span class="fan-k">' +
      y.name +
      '</span><span class="fan-v' +
      miss +
      '">' +
      money(v) +
      "</span></div>"
    );
  }).join("");
}

function renderHeat(c) {
  const el = $("heat");
  const bits = [];
  for (const it of ITEMS) {
    if (it.typed) continue;
    const a0 = atMonth(seriesOf(it.series || it.id), state.thenYear, state.thenMonth);
    const a1 = atMonth(seriesOf(it.series || it.id), state.nowYear, state.nowMonth);
    if (a0 == null || a1 == null || a0 === 0) continue;
    const r = c.ratio;
    if (r == null) continue;
    const exp = a0 * r;
    const vs = ((a1 - exp) / exp) * 100;
    const hot = vs > 8 ? " is-hot" : vs < -8 ? " is-cool" : "";
    bits.push(
      '<span class="chip' +
        hot +
        '"><b>' +
        it.name +
        "</b>" +
        pct(vs) +
        "</span>"
    );
  }
  el.innerHTML = bits.join("");
}

function renderAll() {
  const c = compute();
  renderHero(c);
  renderFan(c);
  renderHeat(c);
  $("amountWrap").hidden = !itemMeta().typed;
  sizeDrums();
}

function mountDrum(el, options, selectedId, onChange) {
  const ul = document.createElement("ul");
  ul.className = "drum-list";
  options.forEach((opt) => {
    const li = document.createElement("li");
    li.dataset.id = String(opt.id);
    li.textContent = opt.label;
    li.addEventListener("click", () => {
      selectedId = opt.id;
      scrollToId(opt.id, true);
      onChange(opt.id);
    });
    ul.appendChild(li);
  });
  el.innerHTML = "";
  el.appendChild(ul);

  const rh = () => el.querySelector("li")?.getBoundingClientRect().height || 21;

  function highlight(id) {
    ul.querySelectorAll("li").forEach((li) => {
      li.classList.toggle("is-on", li.dataset.id === String(id));
    });
  }

  function indexOf(id) {
    return options.findIndex((o) => String(o.id) === String(id));
  }

  function scrollToId(id, smooth) {
    const i = indexOf(id);
    if (i < 0) return;
    const top = i * rh();
    el.scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
    highlight(id);
  }

  let lock = false;
  let timer = 0;
  el.addEventListener(
    "scroll",
    () => {
      if (lock) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const i = Math.round(el.scrollTop / rh());
        const opt = options[Math.max(0, Math.min(options.length - 1, i))];
        if (!opt) return;
        highlight(opt.id);
        if (String(opt.id) !== String(selectedId)) {
          selectedId = opt.id;
          onChange(opt.id);
        }
      }, 80);
    },
    { passive: true }
  );

  requestAnimationFrame(() => {
    lock = true;
    scrollToId(selectedId, false);
    requestAnimationFrame(() => {
      lock = false;
    });
  });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => scrollToId(selectedId, false));
  }
  window.addEventListener("resize", () => scrollToId(selectedId, false));

  return {
    set(id) {
      selectedId = id;
      lock = true;
      scrollToId(id, true);
      setTimeout(() => {
        lock = false;
      }, 280);
    },
    resnap() {
      lock = true;
      scrollToId(selectedId, false);
      requestAnimationFrame(() => {
        lock = false;
      });
    },
  };
}

function yearsList() {
  const cpi = seriesOf("cpi") || seriesOf("cpi_u");
  const maxY = cpi ? cpi.years[cpi.years.length - 1] : new Date().getFullYear();
  const minY = cpi ? cpi.years[0] : 1913;
  const out = [];
  for (let y = minY; y <= maxY; y++) out.push({ id: y, label: String(y) });
  return out;
}

const drums = [];

function boot(data) {
  state.data = data;
  const years = yearsList();
  const last = years[years.length - 1].id;
  state.nowYear = last;
  if (last >= 2000) state.thenYear = 2000;
  else state.thenYear = years[0].id;

  $("verBadge").textContent = APP_VERSION;
  document.title = "DollarValue " + APP_VERSION + " — several worths, not just CPI | Mark Maga";

  const yOpts = years;
  const mOpts = MONTHS.map((m) => ({ id: m.id, label: m.label }));
  const iOpts = ITEMS.map((it) => ({ id: it.id, label: it.name }));
  const ydOpts = YARDS.map((y) => ({ id: y.id, label: y.name }));

  drums.length = 0;
  drums.push(
    mountDrum($("drumThenYear"), yOpts, state.thenYear, (id) => {
      state.thenYear = Number(id);
      renderAll();
    })
  );
  drums.push(
    mountDrum($("drumNowYear"), yOpts, state.nowYear, (id) => {
      state.nowYear = Number(id);
      renderAll();
    })
  );
  drums.push(
    mountDrum($("drumThenMonth"), mOpts, state.thenMonth, (id) => {
      state.thenMonth = Number(id);
      renderAll();
    })
  );
  drums.push(
    mountDrum($("drumNowMonth"), mOpts, state.nowMonth, (id) => {
      state.nowMonth = Number(id);
      renderAll();
    })
  );
  drums.push(
    mountDrum($("drumItem"), iOpts, state.item, (id) => {
      state.item = String(id);
      renderAll();
    })
  );
  drums.push(
    mountDrum($("drumYard"), ydOpts, state.yard, (id) => {
      state.yard = String(id);
      renderAll();
    })
  );

  const amt = $("amount");
  amt.addEventListener("input", () => {
    const n = parseFloat(String(amt.value).replace(/[^0-9.]/g, ""));
    state.amount = isFinite(n) ? n : 0;
    renderAll();
  });
  amt.addEventListener("keydown", (e) => {
    if (e.key === "Enter") amt.blur();
  });

  lastDrumH = 0;
  pinShellViewport();
  renderAll();
}

function localHost() {
  const h = location.hostname || "";
  return h === "localhost" || h === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(h);
}

fetch("data/series.json?v=1")
  .then((r) => r.json())
  .then(boot)
  .catch((err) => {
    $("heroTo").textContent = "No data";
    $("heroBy").textContent = String(err && err.message ? err.message : err);
  });

if ("serviceWorker" in navigator && !localHost()) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

function isStandaloneDisplay() {
  const n = window.navigator;
  return (
    n.standalone === true ||
    (window.matchMedia &&
      (window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches))
  );
}

function pwaFillHeightPx() {
  const iw = window.innerWidth || 0;
  const ih = window.innerHeight || 0;
  const sw = (window.screen && window.screen.width) || 0;
  const sh = (window.screen && window.screen.height) || 0;
  const screenMax = Math.max(sw, sh);
  const screenMin = Math.min(sw, sh);
  return ih >= iw ? Math.max(ih, screenMax) : Math.max(ih, screenMin);
}

function pwaExtraBottomPx() {
  const iw = window.innerWidth || 0;
  const ih = window.innerHeight || 0;
  const sw = (window.screen && window.screen.width) || 0;
  const sh = (window.screen && window.screen.height) || 0;
  const screenMax = Math.max(sw, sh);
  if (Math.min(iw, ih) >= 600 && screenMax < ih - 10) return 20;
  return 0;
}

let lastFillKey = "";
let lastDrumH = 0;

function pinShellViewport() {
  const root = document.documentElement;
  const standalone = isStandaloneDisplay() || root.classList.contains("pwa-standalone");
  if (standalone) {
    const fillH = pwaFillHeightPx();
    const extra = pwaExtraBottomPx();
    const total = fillH + extra;
    const key = "pwa:" + fillH + "+" + extra;
    root.classList.add("pwa-standalone");
    if (key !== lastFillKey) {
      lastFillKey = key;
      root.style.setProperty("--pwa-fill-h", fillH + "px");
      root.style.setProperty("--pwa-extra-b", extra + "px");
      root.style.setProperty("--vv-top", "0px");
      root.style.setProperty("--vv-left", "0px");
      root.style.setProperty("--vv-w", (window.innerWidth || 0) + "px");
      root.style.setProperty("--vv-h", total + "px");
      root.style.height = total + "px";
      root.style.minHeight = total + "px";
    }
    sizeDrums();
    return;
  }

  root.classList.remove("pwa-standalone");
  root.style.removeProperty("--pwa-fill-h");
  root.style.removeProperty("--pwa-extra-b");
  root.style.removeProperty("height");
  root.style.removeProperty("min-height");

  const vv = window.visualViewport;
  const iw = window.innerWidth || 0;
  const ih = window.innerHeight || 0;
  let top = 0;
  let left = 0;
  let width = iw;
  let height = ih;
  if (vv && vv.height > 40 && vv.width > 40) {
    top = Math.max(0, Math.round(vv.offsetTop) || 0);
    left = Math.max(0, Math.round(vv.offsetLeft) || 0);
    width = Math.round(vv.width);
    height = Math.round(vv.height);
  }
  const key = "vv:" + top + "," + left + "," + width + "x" + height;
  if (key !== lastFillKey) {
    lastFillKey = key;
    root.style.setProperty("--vv-top", top + "px");
    root.style.setProperty("--vv-left", left + "px");
    root.style.setProperty("--vv-w", width + "px");
    root.style.setProperty("--vv-h", height + "px");
  }
  sizeDrums();
}

function sizeDrums() {
  const shell = document.querySelector(".drum-shell");
  if (!shell) return;
  const h = Math.round(shell.getBoundingClientRect().height);
  if (h < 48 || h === lastDrumH) return;
  lastDrumH = h;
  document.documentElement.style.setProperty("--drum-h", h + "px");
  drums.forEach((d) => d.resnap());
}

function onViewport() {
  pinShellViewport();
}

pinShellViewport();
window.addEventListener("resize", onViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewport);
  window.visualViewport.addEventListener("scroll", onViewport);
}
