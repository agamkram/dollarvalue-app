const APP_VERSION = "v72";

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

const DEFLATORS = [
  { id: "cpi", name: "CPI", hint: "City households, all items" },
  { id: "pce", name: "PCE", hint: "Fed’s preferred" },
  { id: "chained_cpi", name: "Chained CPI", hint: "Substitution built in" },
  { id: "gdp_deflator", name: "GDP deflator", hint: "All output, not just households" },
];

/** Shared on Item and In terms of. Deflators sit only on In terms of. */
const THINGS = [
  { id: "milk", name: "Milk", unit: "/gal", series: "milk", kind: "commodity" },
  { id: "eggs", name: "Eggs", unit: "/doz", series: "eggs", kind: "commodity" },
  { id: "coffee", name: "Coffee", unit: "/lb", series: "coffee", kind: "commodity" },
  { id: "gasoline", name: "Gasoline", unit: "/gal", series: "gasoline", kind: "commodity" },
  { id: "electricity", name: "Electricity", unit: "/kWh", series: "electricity", kind: "commodity" },
  { id: "wti", name: "WTI oil", unit: "/bbl", series: "wti", kind: "commodity" },
  { id: "wheat", name: "Wheat", unit: "/mt", series: "wheat", kind: "commodity" },
  { id: "corn", name: "Corn", unit: "/mt", series: "corn", kind: "commodity" },
  { id: "gold", name: "Gold", unit: "/oz", series: "gold", kind: "commodity", stick: "oz" },
  { id: "silver_spot", name: "Silver", unit: "/oz", series: "silver_spot", kind: "commodity", stick: "oz" },
  { id: "bitcoin", name: "Bitcoin", series: "bitcoin", kind: "asset", stick: "BTC" },
  { id: "wage_hourly", name: "Hourly wage", series: "wage_hourly", kind: "income" },
  { id: "income_hh", name: "Household income", series: "income_hh", kind: "income" },
  { id: "spend_hh", name: "Household spending", series: "spend_hh", kind: "expenditure" },
  { id: "gdp_per_capita", name: "GDP per capita", series: "gdp_per_capita", kind: "income" },
  { id: "gdp", name: "GDP", series: "gdp", kind: "output", dollars: false, unit: "billion" },
  { id: "m2", name: "M2", series: "m2", kind: "money", dollars: false, unit: "billion" },
  { id: "m1", name: "M1", series: "m1", kind: "money", dollars: false, unit: "billion" },
  { id: "base", name: "Monetary base", series: "base", kind: "money", dollars: false, unit: "billion" },
  { id: "homes_msp", name: "Median home", series: "homes_msp", kind: "asset" },
  { id: "homes_cs", name: "Home price CS", series: "homes_cs", kind: "index", dollars: false },
  { id: "homes_fhfa", name: "Home price FHFA", series: "homes_fhfa", kind: "index", dollars: false },
  { id: "rent", name: "Rent index", series: "rent", kind: "index", dollars: false },
  { id: "college", name: "College index", series: "college", kind: "index", dollars: false },
  { id: "medical", name: "Medical services", series: "medical", kind: "index", dollars: false },
  { id: "used_cars", name: "Used car index", series: "used_cars", kind: "index", dollars: false },
  { id: "nasdaq", name: "NASDAQ", series: "nasdaq", kind: "index", dollars: false },
  { id: "stocks", name: "S&P 500", series: "stocks", kind: "index", dollars: false },
  { id: "djia", name: "Dow Jones", series: "djia", kind: "index", dollars: false },
];

const ITEMS = [
  { id: "custom", name: "Custom $", typed: true, kind: "commodity" },
  ...THINGS,
];

const YARDS = [...DEFLATORS, ...THINGS];

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

function paintVersion() {
  const badge = $("verBadge");
  if (!badge) return;
  const js = APP_VERSION.replace(/^v/, "");
  const html = String(window.__DV_EXPECTED || "").replace(/^v/, "");
  const css = (getComputedStyle(document.documentElement).getPropertyValue("--dv-css") || "").trim();
  let text = "v" + js;
  let stale = false;
  if (html && html !== js) {
    text += " html" + html;
    stale = true;
  }
  if (!css || css !== js) {
    text += css ? " css" + css : " css?";
    stale = true;
  }
  badge.textContent = text;
  badge.classList.toggle("is-stale", stale);
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
  if (!row) return null;
  const v = row[month - 1];
  return v == null ? null : v;
}

function inferFreq(ser) {
  const rows = ser && ser.monthly ? Object.values(ser.monthly) : [];
  const used = {};
  rows.forEach((row) => {
    row.forEach((v, i) => {
      if (v != null) used[i] = true;
    });
  });
  const months = Object.keys(used).map(Number);
  if (!months.length) return "annual";
  if (months.every((i) => i === 0 || i === 3 || i === 6 || i === 9)) return "quarterly";
  return "monthly";
}

function crossesM1Break(y0, m0, y1, m1) {
  const breakAt = 2020 * 12 + 5;
  function mark(y, m) {
    if (y === 2020 && !m) return null;
    if (!m) return y * 12 + 6;
    return y * 12 + m;
  }
  const a = mark(y0, m0);
  const b = mark(y1, m1);
  if (a == null || b == null) return true;
  return Math.min(a, b) < breakAt && Math.max(a, b) >= breakAt;
}

function scale(yardId, y0, m0, y1, m1) {
  if (yardId === "m1" && crossesM1Break(y0, m0, y1, m1)) return null;
  const ser = seriesOf(yardId);
  const a = atMonth(ser, y0, m0);
  const b = atMonth(ser, y1, m1);
  if (a == null || b == null || a === 0) return null;
  return b / a;
}

/** A price keeps its cents under $1,000, and a third digit only when it says
 *  something. So $2.80 and $159.25, but $0.90 rather than $0.900. */
function money(n, digits) {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const max = digits != null ? digits : abs >= 1000 ? 0 : abs >= 1 ? 2 : 3;
  const min = digits != null ? digits : abs >= 1000 ? 0 : 2;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: Math.min(min, max),
    maximumFractionDigits: max,
  });
  return (n < 0 ? "-$" : "$") + s;
}

function pct(n) {
  if (n == null || !isFinite(n)) return "—";
  const digits = Math.abs(n) >= 10 ? 0 : 1;
  const rounded = Number(n.toFixed(digits));
  if (rounded === 0) return "0%";
  const sign = rounded > 0 ? "+" : "";
  return sign + rounded.toFixed(digits) + "%";
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

function yearSlots(ser, year) {
  const row = ser && ser.monthly && ser.monthly[String(year)];
  if (!row || !row.some((v) => v != null)) return null;
  const idx =
    ser.freq === "quarterly"
      ? [0, 3, 6, 9]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  return idx.map((i) => row[i] != null);
}

function yearKind(ser, year) {
  const filled = yearSlots(ser, year);
  if (!filled) return "plain";
  if (filled.every(Boolean)) return "avg";
  let seenGap = false;
  let trailing = true;
  for (const ok of filled) {
    if (!ok) seenGap = true;
    else if (seenGap) trailing = false;
  }
  const last = ser.years && ser.years[ser.years.length - 1] === year;
  if (last && trailing && !filled[filled.length - 1]) return "ytd";
  return "partial";
}

function quarterName(month) {
  if (month === 1) return "Q1";
  if (month === 4) return "Q2";
  if (month === 7) return "Q3";
  if (month === 10) return "Q4";
  return "";
}

function whenLabel(year, month, ser) {
  if (!month) {
    const kind = yearKind(ser, year);
    if (kind === "ytd") return year + " YTD";
    if (kind === "partial") return year + " partial";
    if (kind === "avg") return year + " avg";
    return String(year);
  }
  if (ser && ser.freq === "quarterly") {
    const q = quarterName(month);
    if (q) return q + " " + year;
  }
  return MONTHS[month].label + " " + year;
}

function holeNote(ser, year, month, label) {
  if (!ser) return "";
  const name = label || ser.name || "Series";
  const years = ser.years || [];
  if (atYear(ser, year) == null) {
    if (!years.length) return name + " has no prints";
    if (year < years[0]) return name + " starts in " + years[0];
    if (year > years[years.length - 1]) return name + " ends in " + years[years.length - 1];
    return name + " has no " + year + " print";
  }
  if (!month || atMonth(ser, year, month) != null) return "";
  const row = ser.monthly && ser.monthly[String(year)];
  if (!row || !row.some((v) => v != null)) return name + " is annual";
  if (ser.freq === "quarterly") {
    const q = quarterName(month);
    if (q) return name + " has no " + q + " print";
    return name + " is quarterly";
  }
  return name + " has no " + MONTHS[month].label + " print";
}

function explainGap(ser, label) {
  if (!ser) return "";
  return (
    holeNote(ser, state.thenYear, state.thenMonth, label) ||
    holeNote(ser, state.nowYear, state.nowMonth, label)
  );
}

function isM1(meta) {
  return !!meta && !meta.typed && (meta.series === "m1" || meta.id === "m1");
}

function periodCenter(year, month, ser) {
  if (month) return year + (month - 0.5) / 12;
  const filled = yearSlots(ser, year);
  if (!filled) return year + 0.5;
  const idx =
    ser && ser.freq === "quarterly"
      ? [0, 3, 6, 9]
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  let sum = 0;
  let n = 0;
  filled.forEach((ok, k) => {
    if (!ok) return;
    sum += (idx[k] + 0.5) / 12;
    n += 1;
  });
  if (!n) return year + 0.5;
  return year + sum / n;
}

function spanYears(ser) {
  return Math.abs(
    periodCenter(state.nowYear, state.nowMonth, ser) -
      periodCenter(state.thenYear, state.thenMonth, ser)
  );
}

function pace(vs, ser) {
  if (vs == null || !isFinite(vs)) return null;
  const years = spanYears(ser || seriesOf(state.yard));
  if (years < 1) {
    return {
      text: pct(vs),
      tone: vs > 8 ? "hot" : vs < -8 ? "cool" : "",
      perYear: false,
      n: vs,
    };
  }
  const factor = 1 + vs / 100;
  if (!(factor > 0)) {
    return { text: pct(vs), tone: vs > 0 ? "hot" : "cool", perYear: false, n: vs };
  }
  const ann = (Math.pow(factor, 1 / years) - 1) * 100;
  const sign = ann > 0 ? "+" : "";
  return {
    text: sign + ann.toFixed(1) + "%/yr",
    tone: ann > 2 ? "hot" : ann < -2 ? "cool" : "",
    perYear: true,
    n: ann,
  };
}

/** Same annualizing as pace, over a span of our choosing. Debt and taxes
 *  print through their own last year, which is not always the year on the wheel. */
function paceOverYears(vs, years) {
  if (vs == null || !isFinite(vs) || !(years > 0)) return null;
  if (years < 1) return { text: pct(vs), tone: vs > 8 ? "hot" : vs < -8 ? "cool" : "" };
  const factor = 1 + vs / 100;
  if (!(factor > 0)) return { text: pct(vs), tone: vs > 0 ? "hot" : "cool" };
  const ann = (Math.pow(factor, 1 / years) - 1) * 100;
  const sign = ann > 0 ? "+" : "";
  return {
    text: sign + ann.toFixed(1) + "%/yr",
    tone: ann > 2 ? "hot" : ann < -2 ? "cool" : "",
  };
}

function fmtPlain(n, dollars) {
  if (n == null || !isFinite(n)) return "—";
  return dollars === false ? fmtMeasure(n) : money(n);
}

function compute() {
  const it = itemMeta();
  const yd = yardMeta();
  const broken =
    (isM1(it) || yd.id === "m1") &&
    crossesM1Break(state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
  if (broken && isM1(it)) {
    return {
      it: it,
      yd: yd,
      from: null,
      ratio: null,
      expected: null,
      actual: null,
      vs: null,
      u0: null,
      u1: null,
    };
  }
  const from = thenAmount();
  const ratio = scale(yd.series || yd.id, state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
  const expected = from != null && ratio != null ? from * ratio : null;
  const actual = nowActual();
  const vs =
    expected != null && actual != null && expected !== 0
      ? ((actual - expected) / expected) * 100
      : null;
  const priced = it.dollars !== false;
  let u0 = null;
  let u1 = null;
  if (yd.stick && priced) {
    const px0 = atMonth(seriesOf(yd.series || yd.id), state.thenYear, state.thenMonth);
    const px1 = atMonth(seriesOf(yd.series || yd.id), state.nowYear, state.nowMonth);
    const nowDollars = it.typed ? from : actual;
    if (from != null && px0) u0 = from / px0;
    if (nowDollars != null && px1) u1 = nowDollars / px1;
  }
  return { it, yd, from, ratio, expected, actual, vs, u0, u1 };
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

function setHeroUnit(id, unit) {
  const el = $(id);
  if (!unit) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = unit.replace(/^\//, "");
}

function fitHeroAmt(el, side, maxPx) {
  if (!el || !side || side.classList.contains("is-empty") || !el.textContent) {
    if (el) el.style.fontSize = "";
    return;
  }
  const room = side.clientWidth - 8;
  if (room <= 0) return;
  const max = maxPx || 40.8;
  const min = 11;
  el.style.fontSize = max + "px";
  if (el.scrollWidth <= room) return;
  let lo = min;
  let hi = max;
  while (hi - lo > 0.25) {
    const mid = (lo + hi) / 2;
    el.style.fontSize = mid + "px";
    if (el.scrollWidth <= room) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = lo + "px";
}

function fitHeroAmts() {
  const pairs = [
    ["heroFromSide", "heroFrom", 40.8],
    ["heroToSide", "heroTo", 40.8],
    ["heroActualSide", "heroActual", 40.8],
    ["wageFromSide", "wageFrom", 26],
    ["wageToSide", "wageTo", 26],
    ["wageActualSide", "wageActual", 26],
    ["debtFromSide", "debtFrom", 26],
    ["debtToSide", "debtTo", 26],
    ["debtActualSide", "debtActual", 26],
    ["taxFromSide", "taxFrom", 26],
    ["taxToSide", "taxTo", 26],
    ["taxActualSide", "taxActual", 26],
  ];
  for (const [sideId, amtId, maxPx] of pairs) {
    fitHeroAmt($(amtId), $(sideId), maxPx);
  }
}

function setHeroBay(sideId, amtId, unitId, capId, amt, unit, cap, hot) {
  const side = $(sideId);
  const amtEl = $(amtId);
  const capEl = $(capId);
  if (amt == null || amt === "") {
    side.classList.add("is-empty");
    amtEl.textContent = "";
    amtEl.style.fontSize = "";
    setHeroUnit(unitId, "");
    capEl.className = "hero-cap";
    capEl.textContent = "";
    return;
  }
  side.classList.remove("is-empty");
  amtEl.textContent = amt;
  amtEl.style.fontSize = "";
  setHeroUnit(unitId, unit || "");
  capEl.className =
    "hero-cap" + (hot === "hot" ? " is-hot" : hot === "cool" ? " is-cool" : "");
  capEl.textContent = cap || "";
}

function renderHero(c) {
  const unit = c.it.typed ? "" : c.it.unit || "";
  const itemSer = c.it.typed ? null : seriesOf(c.it.series || c.it.id);
  const showFrom = c.it.typed ? fmtPlain(c.from, c.it.dollars) : c.from == null ? "—" : fmtPlain(c.from, c.it.dollars);

  setHeroBay(
    "heroFromSide",
    "heroFrom",
    "heroFromUnit",
    "heroFromCap",
    showFrom,
    unit,
    whenLabel(state.thenYear, state.thenMonth, itemSer)
  );

  setHeroBay(
    "heroToSide",
    "heroTo",
    "heroToUnit",
    "heroBy",
    c.expected == null ? "—" : fmtPlain(c.expected, c.it.dollars),
    unit,
    c.yd.name + " · " + whenLabel(state.nowYear, state.nowMonth, seriesOf(c.yd.series || c.yd.id))
  );

  const yardSer = seriesOf(c.yd.series || c.yd.id);
  const m1Cross = crossesM1Break(
    state.thenYear,
    state.thenMonth,
    state.nowYear,
    state.nowMonth
  );
  const m1Note =
    (c.yd.id === "m1" || isM1(c.it)) && m1Cross ? "M1 redefined May 2020" : "";
  const note =
    m1Note || explainGap(yardSer, c.yd.name) || explainGap(itemSer, c.it.name);
  const measure = $("heroMeasure");
  if (note) {
    measure.hidden = false;
    measure.textContent = note;
  } else if (c.yd.stick && c.it.dollars !== false) {
    measure.hidden = false;
    measure.textContent =
      fmtMeasure(c.u0) +
      " " +
      c.yd.stick +
      " then  →  " +
      fmtMeasure(c.u1) +
      " " +
      c.yd.stick +
      " now";
  } else {
    measure.hidden = true;
  }

  if (!c.it.typed) {
    const kind = !state.nowMonth ? yearKind(itemSer, state.nowYear) : "plain";
    const paceNow = pace(c.vs);
    const prefix =
      kind === "ytd" ? "Actual YTD · " : kind === "partial" ? "Actual partial · " : "Actual · ";
    setHeroBay(
      "heroActualSide",
      "heroActual",
      "heroActualUnit",
      "heroCheck",
      c.actual == null ? "—" : fmtPlain(c.actual, c.it.dollars),
      unit,
      c.actual != null && paceNow ? prefix + paceNow.text : "Actual",
      paceNow ? paceNow.tone : ""
    );
  } else {
    setHeroBay("heroActualSide", "heroActual", "heroActualUnit", "heroCheck", null);
  }

  $("plain").textContent = plainLine(c, note);
  requestAnimationFrame(fitHeroAmts);
}

function yardRole(yd) {
  if (yd.id === "cpi") return "basket";
  if (yd.id === "pce" || yd.id === "chained_cpi" || yd.id === "gdp_deflator") return "prices";
  if (yd.id === "spend_hh") return "spending";
  if (yd.id === "income_hh") return "hhincome";
  if (yd.id === "gdp_per_capita") return "avginc";
  if (yd.id === "gdp") return "economy";
  if (yd.id === "wage_hourly") return "wage";
  if (yd.id === "m1" || yd.id === "m2" || yd.id === "base") return "money";
  if (yd.stick) return "stick";
  if (yd.id === "homes_msp") return "home";
  if (yd.dollars === false) return "index";
  return "goods";
}

function lagWords(vs) {
  const p = pace(vs);
  if (!p || (vs >= -0.5 && vs <= 0.5)) return "";
  const n = p.text.replace(/^[+-]/, "").replace("/yr", " a year");
  return vs > 0 ? " That is " + n + " faster." : " That is " + n + " slower.";
}

function plainWhen(year, month, ser) {
  const label = whenLabel(year, month, ser);
  if (label.endsWith(" avg")) return label.slice(0, -4);
  if (label.endsWith(" YTD")) return label.slice(0, -4) + " so far";
  if (label.endsWith(" partial")) return "partial " + label.slice(0, -8);
  return label;
}

function seriesPace(id) {
  const ser = seriesOf(id);
  const a = atMonth(ser, state.thenYear, state.thenMonth);
  const b = atMonth(ser, state.nowYear, state.nowMonth);
  if (a == null || b == null || a === 0) return null;
  return pace(((b - a) / a) * 100, ser);
}

/** The wage's own rate used to ride along here. It is arithmetic on this rate
 *  and the wage row's verdict, and it cost the line a second row. */
function priceRate() {
  const prices = seriesPace("cpi");
  if (!prices) return "";
  return " Prices " + prices.text + ".";
}

function personYear(id, year) {
  const ser = seriesOf(id);
  if (!ser || !ser.years || !ser.years.length || year < ser.years[0]) return null;
  const y = Math.min(year, ser.years[ser.years.length - 1]);
  const v = atYear(ser, y);
  if (v == null) return null;
  return { y: y, v: v };
}

function priceYearLabel(year, month, ser) {
  if (month) return MONTHS[month].label + " " + year;
  const kind = yearKind(ser, year);
  if (kind === "ytd") return year + " YTD";
  if (kind === "partial") return year + " partial";
  return String(year);
}

function dollarLabel(year, month) {
  const ser = seriesOf("cpi");
  const y = year == null ? state.nowYear : year;
  const m = month == null ? state.nowMonth : month;
  return (state.yard === "cpi" ? "" : "CPI, ") + priceYearLabel(y, m, ser) + " dollars";
}

function latestYear(id) {
  const ser = seriesOf(id);
  if (!ser || !ser.years || !ser.years.length) return null;
  return ser.years[ser.years.length - 1];
}

function burdenWindow(printYear, wheelYear, wheelMonth) {
  if (printYear == null) return null;
  if (printYear === wheelYear) return { y: printYear, m: wheelMonth || 0 };
  return { y: printYear, m: 0 };
}

function renderWage() {
  const row = $("wageRow");
  const note = $("wageNote");
  const hide = () => {
    if (row) row.hidden = true;
    if (note) note.hidden = true;
  };
  if (!row || state.item === "wage_hourly" || state.yard === "wage_hourly") {
    hide();
    return;
  }
  const w0 = atMonth(seriesOf("wage_hourly"), state.thenYear, state.thenMonth);
  const w1 = atMonth(seriesOf("wage_hourly"), state.nowYear, state.nowMonth);
  const ratio = scale(state.yard, state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
  if (w0 == null || w1 == null || ratio == null) {
    hide();
    return;
  }
  const ser = seriesOf("wage_hourly");
  const yardSer = seriesOf(state.yard);
  const mid =
    state.yard === "cpi"
      ? dollarLabel()
      : yardMeta().name + " · " + whenLabel(state.nowYear, state.nowMonth, yardSer);
  row.hidden = false;
  if (note) note.hidden = false;
  const wageCap = (year, month) => whenLabel(year, month, ser).replace(/ avg$/, "");
  const vs = ((w1 - w0 * ratio) / (w0 * ratio)) * 100;
  const wagePace = pace(vs, ser);
  // No name here: the first bay already says which wage this is, and the
  // repeat pushed this caption onto a second line.
  // Uncolored on purpose. Pay beating prices is not an alarm, and the hot
  // color would print good news in red.
  const nowCap =
    wageCap(state.nowYear, state.nowMonth) + (wagePace ? " · " + wagePace.text : "");
  setHeroBay("wageFromSide", "wageFrom", "wageFromUnit", "wageFromCap", money(w0), "", "Production wage · " + wageCap(state.thenYear, state.thenMonth));
  setHeroBay("wageToSide", "wageTo", "wageToUnit", "wageBy", money(w0 * ratio), "", mid);
  setHeroBay("wageActualSide", "wageActual", "wageActualUnit", "wageCheck", money(w1), "", nowCap);
}

function burdenView(seriesId) {
  const a0 = personYear(seriesId, state.thenYear);
  const a1 = personYear(seriesId, state.nowYear);
  if (!a0 || !a1) return null;
  if (a0.y === a1.y && state.thenYear === state.nowYear) return null;
  const samePrint = a0.y === a1.y;
  let ratio;
  let dollars;
  if (samePrint) {
    ratio = 1;
    dollars = dollarLabel(a1.y, 0);
  } else {
    const a = burdenWindow(a0.y, state.thenYear, state.thenMonth);
    const b = burdenWindow(a1.y, state.nowYear, state.nowMonth);
    ratio = scale("cpi", a.y, a.m, b.y, b.m);
    dollars = b ? dollarLabel(b.y, b.m) : "";
  }
  if (ratio == null) return null;
  const expected = a0.v * ratio;
  let paceText = "";
  let tone = "";
  if (!samePrint && expected !== 0) {
    const gap = ((a1.v - expected) / expected) * 100;
    const p = paceOverYears(gap, Math.abs(a1.y - a0.y));
    if (p) {
      paceText = " · " + p.text;
      tone = p.tone || "";
    }
  }
  return { a0, a1, expected, dollars, samePrint, paceText, tone };
}

function renderCounter() {
  const row = $("counter");
  const note = $("debtNote");
  const b = burdenView("debt_person");
  if (!row || !b) {
    if (row) row.hidden = true;
    if (note) note.hidden = true;
    return;
  }
  row.hidden = false;
  if (note) note.hidden = false;
  setHeroBay("debtFromSide", "debtFrom", "debtFromUnit", "debtFromCap", money(b.a0.v), "", "Debt · " + b.a0.y);
  setHeroBay("debtToSide", "debtTo", "debtToUnit", "debtBy", money(b.expected), "", b.dollars);
  setHeroBay(
    "debtActualSide",
    "debtActual",
    "debtActualUnit",
    "debtCheck",
    money(b.a1.v),
    "",
    "Debt · " + b.a1.y + b.paceText,
    b.tone
  );
}

function renderTax() {
  const row = $("taxRow");
  const note = $("taxNote");
  const b = burdenView("tax_person");
  if (!row || !b) {
    if (row) row.hidden = true;
    if (note) note.hidden = true;
    return;
  }
  row.hidden = false;
  if (note) note.hidden = false;
  setHeroBay("taxFromSide", "taxFrom", "taxFromUnit", "taxFromCap", money(b.a0.v), "", "Tax · " + b.a0.y);
  setHeroBay("taxToSide", "taxTo", "taxToUnit", "taxBy", money(b.expected), "", b.dollars);
  setHeroBay(
    "taxActualSide",
    "taxActual",
    "taxActualUnit",
    "taxCheck",
    money(b.a1.v),
    "",
    "Tax · " + b.a1.y + b.paceText,
    b.tone
  );
}

function plainLine(c, note) {
  const itemSer = c.it.typed ? null : seriesOf(c.it.series || c.it.id);
  const yardSer = seriesOf(c.yd.series || c.yd.id);
  const thenSer = c.it.typed ? yardSer : itemSer;
  const thenL = plainWhen(state.thenYear, state.thenMonth, thenSer);
  const nowL = plainWhen(state.nowYear, state.nowMonth, thenSer);
  const yardThen = plainWhen(state.thenYear, state.thenMonth, yardSer);
  const yardNow = plainWhen(state.nowYear, state.nowMonth, yardSer);
  const yardSpan =
    yardThen === thenL && yardNow === nowL ? "" : " from " + yardThen + " to " + yardNow;
  if (c.expected == null) return note || "No comparison for these dates.";
  const exp = fmtPlain(c.expected, c.it.typed ? true : c.it.dollars);
  const y = c.yd.name;
  if (c.it.typed) {
    const amt = fmtPlain(c.from, true);
    if (c.yd.id === "cpi") {
      return (
        amt +
        " in " +
        thenL +
        " buys what " +
        exp +
        " buys in " +
        nowL +
        "." +
        priceRate()
      );
    }
    if (yardRole(c.yd) === "prices") {
      return amt + " in " + thenL + " has the buying power of " + exp + " in " + nowL + ", using " + y + ".";
    }
    if (c.yd.id === "spend_hh") {
      return amt + " in " + thenL + " is the same share of a household’s spending as " + exp + " in " + nowL + ".";
    }
    if (c.yd.id === "income_hh") {
      return amt + " in " + thenL + " is the same share of a typical household’s income as " + exp + " in " + nowL + ".";
    }
    if (c.yd.id === "gdp_per_capita") {
      return amt + " in " + thenL + " is the same share of GDP per person as " + exp + " in " + nowL + ".";
    }
    if (c.yd.id === "gdp") {
      return amt + " in " + thenL + " is the same share of the whole economy as " + exp + " in " + nowL + ".";
    }
    if (c.yd.id === "wage_hourly") {
      return amt + " in " + thenL + " paid for a certain amount of work. That work pays " + exp + " in " + nowL + ".";
    }
    if (c.yd.stick) {
      return amt + " in " + thenL + " bought a certain amount of " + y.toLowerCase() + ". The same amount costs " + exp + " in " + nowL + ".";
    }
    if (yardRole(c.yd) === "money") {
      return amt + " in " + thenL + " is " + exp + " in " + nowL + " if it grew with " + y + ".";
    }
    if (c.yd.id === "homes_msp") {
      return amt + " in " + thenL + " was a slice of the median home price. That slice is " + exp + " in " + nowL + ".";
    }
    if (c.yd.dollars === false) {
      return amt + " in " + thenL + " would be " + exp + " in " + nowL + " if it had grown with " + y + ".";
    }
    return amt + " in " + thenL + " bought a certain amount of " + y.toLowerCase() + ". The same amount costs " + exp + " in " + nowL + ".";
  }
  if (c.actual == null) return note || c.it.name + " has no reading for " + nowL + ".";
  const from = fmtPlain(c.from, c.it.dollars);
  const actual = fmtPlain(c.actual, c.it.dollars);
  const name = c.it.name;
  if (c.it.id === c.yd.id) {
    return name + " is the measure, so " + from + " in " + thenL + " becomes " + actual + " in " + nowL + ".";
  }
  if (c.it.id === "spend_hh" && (c.yd.id === "cpi" || yardRole(c.yd) === "prices")) {
    const extra =
      c.vs > 0.5
        ? " Spending outpaced prices."
        : c.vs < -0.5
          ? " Spending lagged prices."
          : " Spending kept pace with prices.";
    const pricesAlone = yardSpan
      ? "Prices alone, from " + yardThen + " to " + yardNow + ", would make that " + exp + "."
      : "Prices alone would make that " + exp + " in " + nowL + ".";
    const spendVerb = state.nowYear < latestYear("spend_hh") ? "They spent " : "They spend ";
    return "Households spent " + from + " in " + thenL + ". " + pricesAlone + " " + spendVerb + actual + "." + extra + lagWords(c.vs);
  }
  const rose = c.actual > c.from;
  const fell = c.actual < c.from;
  const yardRose = c.ratio > 1;
  if (!rose && !fell && c.vs > 0.5) {
    return name + " was " + from + " in " + thenL + " and is still " + actual + " in " + nowL + ". " + y + " fell. Following it" + yardSpan + " would have meant " + exp + "." + lagWords(c.vs);
  }
  if (!rose && !fell && c.vs < -0.5) {
    return name + " was " + from + " in " + thenL + " and is still " + actual + " in " + nowL + ". " + y + " rose. Keeping up" + yardSpan + " would have meant " + exp + "." + lagWords(c.vs);
  }
  if (rose && c.vs < -0.5 && yardRose) {
    return name + " rose, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". " + y + " rose faster. Keeping up" + yardSpan + " would have meant " + exp + "." + lagWords(c.vs);
  }
  if (rose && c.vs > 0.5) {
    return name + " rose, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". It beat " + y + ". Just following " + y + yardSpan + " would have meant " + exp + "." + lagWords(c.vs);
  }
  if (fell && c.vs < -0.5) {
    return name + " fell, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". " + y + " did better. Following it" + yardSpan + " would have meant " + exp + "." + lagWords(c.vs);
  }
  if (fell && c.vs > 0.5) {
    return name + " fell, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". " + y + " fell further. Following it" + yardSpan + " would have meant " + exp + "." + lagWords(c.vs);
  }
  return name + " was " + from + " in " + thenL + " and is " + actual + " in " + nowL + ". It kept pace with " + y + yardSpan + ", which pointed to " + exp + ".";
}

function amountOptions() {
  const opts = [{ id: 1, label: "$1" }];
  for (let n = 10; n <= 5000; n += 10) {
    opts.push({ id: n, label: "$" + n.toLocaleString("en-US") });
  }
  return opts;
}

function syncAmountDial() {
  const show = !!itemMeta().typed;
  const dial = $("amountDial");
  const row = $("itemRow");
  dial.hidden = !show;
  row.classList.toggle("has-amt", show);
  if (show) {
    lastDrumH = 0;
    requestAnimationFrame(() => {
      sizeDrums();
      drums.forEach((d) => d.resnap());
    });
  }
}

function chartEnds() {
  const ay = state.thenYear;
  const am = state.thenMonth;
  const by = state.nowYear;
  const bm = state.nowMonth;
  const flip = ay * 12 + am > by * 12 + bm;
  const y0 = flip ? by : ay;
  const m0 = flip ? bm : am;
  const y1 = flip ? ay : by;
  const m1 = flip ? am : bm;
  const yearMode = !m0 && !m1;
  let t0;
  let t1;
  if (yearMode) {
    t0 = y0;
    t1 = y1;
  } else {
    t0 = y0 + ((m0 || 1) - 0.5) / 12;
    t1 = y1 + ((m1 || 12) - 0.5) / 12;
  }
  return { y0, m0, y1, m1, yearMode, t0, t1 };
}

function chartSamples(ends) {
  const times = [];
  if (ends.yearMode) {
    for (let y = ends.y0; y <= ends.y1; y++) times.push({ y: y, m: 0, t: y });
    return times;
  }
  let y = ends.y0;
  let m = ends.m0 || 1;
  const last = ends.y1 * 12 + (ends.m1 || 12);
  while (y * 12 + m <= last) {
    times.push({ y: y, m: m, t: y + (m - 0.5) / 12 });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return times;
}

function chartPoints(ser, times) {
  return times.map((tm) => {
    const v = atMonth(ser, tm.y, tm.m);
    if (!(v > 0)) return null;
    return { t: tm.t, v: v };
  });
}

let chartLines = [];

function collectChartLines() {
  const ends = chartEnds();
  if (!(ends.t1 > ends.t0)) return [];
  const times = chartSamples(ends);
  if (times.length < 2) return [];
  const metas = YARDS.map((y) => ({ id: y.series || y.id, name: y.name }));
  metas.push({ id: "debt_person", name: "Debt" }, { id: "tax_person", name: "Tax" });
  const seen = {};
  const cross = crossesM1Break(state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
  const lines = [];
  metas.forEach((meta) => {
    if (seen[meta.id]) return;
    seen[meta.id] = true;
    if (meta.id === "m1" && cross) return;
    const ser = seriesOf(meta.id);
    if (!ser) return;
    const pts = chartPoints(ser, times);
    // Index off the first real point, not the first slot. A quarterly series
    // prints in January, April, July, October; asking it for February used to
    // drop the whole line even though the window was full of its prints.
    // Still a quarter's grace only, so every line starts at 1 near the left
    // edge and a series that begins mid-window cannot run away with the scale.
    const first = pts.find(Boolean);
    if (!first || !(first.v > 0) || first.t - ends.t0 > 0.3) return;
    let n = 0;
    pts.forEach((p) => {
      if (p) n += 1;
    });
    if (n < 2) return;
    lines.push({ id: meta.id, name: meta.name, pts: pts, base: first.v });
  });
  return lines;
}

function svgEl(name, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", name);
  Object.keys(attrs).forEach((k) => el.setAttribute(k, attrs[k]));
  return el;
}

function chartLabel(id, name) {
  if (id === "wage_hourly") return "Wage";
  if (id === "used_cars") return "Used cars";
  if (id === "silver_spot") return "Silver";
  if (id === "income_hh") return "Income";
  if (id === "spend_hh") return "Spending";
  if (id === "gdp_per_capita") return "GDP / person";
  if (id === "gdp_deflator") return "Deflator";
  if (id === "chained_cpi") return "Chained CPI";
  if (id === "homes_msp") return "Home";
  if (id === "homes_cs") return "Home CS";
  if (id === "homes_fhfa") return "Home FHFA";
  if (id === "monetary" || id === "base") return "Base";
  return name;
}

function chartRole(id) {
  if (id === state.yard) return "yard";
  if (id === state.item) return "item";
  if (id === "debt_person") return "debt";
  if (id === "wage_hourly") return "wage";
  if (id === "tax_person") return "tax";
  return "";
}

function roleStroke(role) {
  if (role === "yard") return "var(--gold)";
  if (role === "item") return "var(--blue)";
  if (role === "debt") return "var(--red)";
  if (role) return "var(--text)";
  return "var(--muted)";
}

function drawChart(plot, lines) {
  const w = plot.clientWidth;
  const h = plot.clientHeight;
  if (w < 40 || h < 40) return;
  const padL = 26;
  const padR = 92;
  const padT = 8;
  const padB = 16;
  const plotW = Math.max(10, w - padL - padR);
  const plotH = Math.max(10, h - padT - padB);
  const ends = chartEnds();
  let lo = Infinity;
  let hi = -Infinity;
  lines.forEach((line) => {
    line.pts.forEach((p) => {
      if (!p) return;
      const r = p.v / line.base;
      if (r > 0) {
        lo = Math.min(lo, r);
        hi = Math.max(hi, r);
      }
    });
  });
  if (!(hi > 0) || !isFinite(lo)) return;
  if (!(hi > lo)) {
    lo = lo / 1.08;
    hi = hi * 1.08;
  }
  const logLo = Math.log(lo);
  const logHi = Math.log(hi);
  const span = logHi - logLo || 1;
  const logA = logLo - span * 0.08;
  const logB = logHi + span * 0.08;

  function xOf(t) {
    return padL + ((t - ends.t0) / (ends.t1 - ends.t0)) * plotW;
  }
  function yOf(r) {
    const u = (Math.log(r) - logA) / (logB - logA);
    return padT + (1 - u) * plotH;
  }

  const svg = svgEl("svg", {
    viewBox: "0 0 " + w + " " + h,
    width: String(w),
    height: String(h),
    role: "img",
    "aria-label": "Series indexed to 1 at the start, log scale",
  });
  svg.style.fontFamily = "IBM Plex Sans, system-ui, sans-serif";

  const ticks = [1];
  let pow = 2;
  while (pow < hi * 1.05 && ticks.length < 6) {
    ticks.push(pow);
    pow *= 2;
  }
  pow = 0.5;
  while (pow > lo * 0.95 && ticks.length < 8) {
    ticks.push(pow);
    pow /= 2;
  }
  ticks.sort((a, b) => a - b);
  ticks.forEach((tick) => {
    if (tick < Math.exp(logA) || tick > Math.exp(logB)) return;
    const y = yOf(tick);
    svg.appendChild(
      svgEl("line", {
        x1: String(padL),
        x2: String(padL + plotW),
        y1: y.toFixed(1),
        y2: y.toFixed(1),
        stroke: "var(--line)",
        "stroke-width": tick === 1 ? "1" : "0.5",
      })
    );
    const label = svgEl("text", {
      x: String(padL - 4),
      y: y.toFixed(1),
      "text-anchor": "end",
      "dominant-baseline": "middle",
      fill: "var(--muted)",
      "font-size": "9",
    });
    label.textContent = tick < 1 ? String(tick) : String(Math.round(tick));
    svg.appendChild(label);
  });

  const x0 = svgEl("text", {
    x: String(padL),
    y: String(h - 3),
    fill: "var(--muted)",
    "font-size": "9",
  });
  x0.textContent = ends.yearMode ? String(ends.y0) : whenLabel(ends.y0, ends.m0 || 1, null);
  svg.appendChild(x0);
  const x1 = svgEl("text", {
    x: String(padL + plotW),
    y: String(h - 3),
    "text-anchor": "end",
    fill: "var(--muted)",
    "font-size": "9",
  });
  x1.textContent = ends.yearMode ? String(ends.y1) : whenLabel(ends.y1, ends.m1 || 12, null);
  svg.appendChild(x1);

  const drawn = [];
  const ordered = lines.slice().sort((a, b) => {
    const rank = (id) => {
      const role = chartRole(id);
      if (role === "item") return 3;
      if (role === "yard") return 2;
      if (role) return 1;
      return 0;
    };
    return rank(a.id) - rank(b.id);
  });
  ordered.forEach((line) => {
    const role = chartRole(line.id);
    const segs = [];
    let cur = [];
    line.pts.forEach((p) => {
      if (!p) {
        if (cur.length) segs.push(cur);
        cur = [];
        return;
      }
      cur.push(p);
    });
    if (cur.length) segs.push(cur);
    const d = segs
      .filter((seg) => seg.length >= 2)
      .map((seg) =>
        seg
          .map((p, i) => {
            const cmd = i === 0 ? "M" : "L";
            return cmd + xOf(p.t).toFixed(1) + " " + yOf(p.v / line.base).toFixed(1);
          })
          .join(" ")
      )
      .join(" ");
    if (!d) return;
    const path = svgEl("path", {
      d: d,
      fill: "none",
      stroke: roleStroke(role),
      "stroke-width": role === "yard" || role === "item" || role === "debt" ? "1.8" : role ? "1.35" : "1",
      "stroke-opacity": role ? "1" : "0.4",
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
    });
    if (role === "tax") path.setAttribute("stroke-dasharray", "3 2");
    const title = svgEl("title", {});
    title.textContent = line.name;
    path.appendChild(title);
    svg.appendChild(path);
    const last = line.pts.filter(Boolean).pop();
    drawn.push({
      id: line.id,
      name: line.name,
      role: role,
      y: yOf(last.v / line.base),
      x: xOf(last.t),
      end: last.v / line.base,
    });
  });

  let labeled = drawn.filter((d) => d.role === "yard" || d.role === "debt" || d.role === "wage" || d.role === "tax" || d.role === "item");
  const byEnd = drawn.slice().sort((a, b) => b.end - a.end);
  if (byEnd.length) labeled.push(byEnd[0], byEnd[byEnd.length - 1]);
  const seenLab = {};
  labeled = labeled.filter((d) => {
    if (seenLab[d.id]) return false;
    seenLab[d.id] = true;
    return true;
  });
  labeled.sort((a, b) => a.y - b.y);
  const gap = 13;
  for (let i = 1; i < labeled.length; i++) {
    if (labeled[i].y < labeled[i - 1].y + gap) labeled[i].y = labeled[i - 1].y + gap;
  }
  if (labeled.length) {
    const top = padT;
    const bot = padT + plotH;
    if (labeled[0].y < top) {
      const shift = top - labeled[0].y;
      labeled.forEach((d) => {
        d.y += shift;
      });
    }
    const overflow = labeled[labeled.length - 1].y - bot;
    if (overflow > 0) {
      labeled.forEach((d) => {
        d.y -= overflow;
      });
    }
  }
  labeled.forEach((d) => {
    const text = svgEl("text", {
      x: String(padL + plotW + 6),
      y: d.y.toFixed(1),
      "dominant-baseline": "middle",
      fill: roleStroke(d.role),
      "font-size": "10",
    });
    text.textContent = chartLabel(d.id, d.name);
    svg.appendChild(text);
  });

  plot.replaceChildren(svg);
}

function renderChart() {
  const host = $("chart");
  const plot = $("chartPlot");
  if (!host || !plot) return;
  chartLines = collectChartLines();
  if (chartLines.length < 2) {
    host.hidden = true;
    plot.replaceChildren();
    return;
  }
  host.hidden = false;
  if (plot.clientWidth > 40 && plot.clientHeight > 40) drawChart(plot, chartLines);
  else requestAnimationFrame(() => drawChart(plot, chartLines));
}

function syncItemDrum() {
  const drum = $("drumItem");
  if (!drum) return;
  drum.classList.toggle("is-yard", state.item === state.yard);
}

function renderAll() {
  syncMonthWheels();
  syncItemDrum();
  const c = compute();
  renderHero(c);
  renderWage();
  renderCounter();
  renderTax();
  renderChart();
  syncAmountDial();
  sizeDrums();
}

function mountDrum(el, options, selectedId, onChange, conf) {
  const flickGain = (conf && conf.flickGain) || 1;
  const ul = document.createElement("ul");
  ul.className = "drum-list";
  options.forEach((opt) => {
    const li = document.createElement("li");
    li.dataset.id = String(opt.id);
    li.setAttribute("role", "option");
    li.textContent = opt.label;
    li.addEventListener("click", () => {
      if (dead.has(String(opt.id))) return;
      selectedId = opt.id;
      scrollToId(opt.id, true);
      onChange(opt.id);
    });
    ul.appendChild(li);
  });
  el.innerHTML = "";
  el.appendChild(ul);
  ul.setAttribute("role", "presentation");
  el.tabIndex = 0;
  el.setAttribute("role", "listbox");
  const dial = el.closest(".dial");
  const dialLabel = dial && dial.querySelector(".dial-label");
  if (dialLabel) {
    // Then and Now each hold two wheels. Named only for the dial, they are
    // two listboxes called "Then" with no way to tell year from month.
    const wheel = el.dataset.wheel || "";
    const kind = /Year$/.test(wheel) ? " year" : /Month$/.test(wheel) ? " month" : "";
    el.setAttribute("aria-label", dialLabel.textContent.trim() + kind);
  }
  if (flickGain > 1) el.classList.add("drum-fast");

  function highlight(id) {
    ul.querySelectorAll("li").forEach((li) => {
      const on = li.dataset.id === String(id);
      li.classList.toggle("is-on", on);
      li.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function indexOf(id) {
    return options.findIndex((o) => String(o.id) === String(id));
  }

  function scrollToId(id, smooth) {
    const i = indexOf(id);
    if (i < 0) return;
    const li = ul.children[i];
    if (!li) return;
    const top = li.offsetTop - (el.clientHeight / 2 - li.offsetHeight / 2);
    el.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    highlight(id);
  }

  function indexFromScroll() {
    const mid = el.scrollTop + el.clientHeight / 2;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < ul.children.length; i++) {
      const li = ul.children[i];
      const c = li.offsetTop + li.offsetHeight / 2;
      const d = Math.abs(c - mid);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  let lock = false;
  let timer = 0;
  let dead = new Set();

  function chooseLive(i) {
    const opt = options[i];
    if (!opt || dead.has(String(opt.id))) return;
    selectedId = opt.id;
    scrollToId(opt.id, true);
    highlight(opt.id);
    onChange(opt.id);
  }

  el.addEventListener("keydown", (e) => {
    if (el.classList.contains("is-locked")) return;
    let dir = 0;
    if (e.key === "ArrowDown") dir = 1;
    else if (e.key === "ArrowUp") dir = -1;
    else if (e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const live = [];
    for (let i = 0; i < options.length; i++) {
      if (!dead.has(String(options[i].id))) live.push(i);
    }
    if (!live.length) return;
    const cur = live.indexOf(indexOf(selectedId));
    let pick;
    if (e.key === "Home") pick = live[0];
    else if (e.key === "End") pick = live[live.length - 1];
    else {
      const at = cur < 0 ? (dir > 0 ? -1 : live.length) : cur;
      const j = at + dir;
      if (j < 0 || j >= live.length) return;
      pick = live[j];
    }
    chooseLive(pick);
  });

  function nearestLive(i) {
    const open = (n) => options[n] && !dead.has(String(options[n].id));
    if (open(i)) return i;
    for (let d = 1; d < options.length; d++) {
      if (open(i - d)) return i - d;
      if (open(i + d)) return i + d;
    }
    return 0;
  }

  el.addEventListener(
    "scroll",
    () => {
      if (lock) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (lock) return;
        const raw = indexFromScroll();
        const i = nearestLive(raw);
        const opt = options[Math.max(0, Math.min(options.length - 1, i))];
        if (!opt || dead.has(String(opt.id))) return;
        if (i !== raw) {
          lock = true;
          scrollToId(opt.id, true);
          setTimeout(() => {
            lock = false;
          }, 220);
        }
        highlight(opt.id);
        if (String(opt.id) !== String(selectedId)) {
          selectedId = opt.id;
          onChange(opt.id);
        }
        if (flickGain > 1) {
          lock = true;
          scrollToId(opt.id, true);
          setTimeout(() => {
            lock = false;
          }, 220);
        }
      }, 120);
    },
    { passive: true }
  );

  if (flickGain > 1) {
    let lastY = 0;
    let lastT = 0;
    let vel = 0;
    let dragging = false;
    let raf = 0;

    const stopCoast = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const coast = () => {
      stopCoast();
      const tick = () => {
        if (Math.abs(vel) < 0.04) {
          raf = 0;
          el.dispatchEvent(new Event("scroll"));
          return;
        }
        el.scrollTop += vel * 16;
        vel *= 0.955;
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    el.addEventListener(
      "touchstart",
      (e) => {
        stopCoast();
        dragging = true;
        lastY = e.touches[0].clientY;
        lastT = performance.now();
        vel = 0;
      },
      { passive: true }
    );

    el.addEventListener(
      "touchmove",
      (e) => {
        if (!dragging) return;
        e.preventDefault();
        const y = e.touches[0].clientY;
        const t = performance.now();
        const dy = lastY - y;
        const dt = Math.max(8, t - lastT);
        el.scrollTop += dy * flickGain;
        vel = (dy * flickGain) / dt;
        lastY = y;
        lastT = t;
      },
      { passive: false }
    );

    el.addEventListener(
      "touchend",
      () => {
        dragging = false;
        coast();
      },
      { passive: true }
    );

    el.addEventListener(
      "touchcancel",
      () => {
        dragging = false;
        coast();
      },
      { passive: true }
    );

    el.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        stopCoast();
        el.scrollTop += e.deltaY * flickGain;
      },
      { passive: false }
    );
  }

  function snapNow() {
    lock = true;
    scrollToId(selectedId, false);
    requestAnimationFrame(() => {
    scrollToId(selectedId, false);
    requestAnimationFrame(() => {
      lock = false;
    });
  });
  }

  requestAnimationFrame(snapNow);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(snapNow);
  }
  window.addEventListener("resize", snapNow);

  return {
    set(id) {
      selectedId = id;
      lock = true;
      scrollToId(id, true);
      setTimeout(() => {
        lock = false;
      }, 320);
    },
    resnap() {
      snapNow();
    },
    mark(deadIds, lockAll) {
      dead = new Set((deadIds || []).map(String));
      el.classList.toggle("is-locked", !!lockAll);
      ul.querySelectorAll("li").forEach((li) => {
        li.classList.toggle("is-dead", dead.has(li.dataset.id));
      });
    },
  };
}

/** Every year any series prints. Built from CPI alone, the wheel started in
 *  1800 and put gold back to 1792 and the wage back to 1790 out of reach. */
function yearsList() {
  const all = state.data && state.data.series ? Object.values(state.data.series) : [];
  let minY = Infinity;
  let maxY = -Infinity;
  all.forEach((ser) => {
    const ys = ser.years || [];
    if (!ys.length) return;
    minY = Math.min(minY, ys[0]);
    maxY = Math.max(maxY, ys[ys.length - 1]);
  });
  if (!isFinite(minY) || !isFinite(maxY)) {
    minY = 1913;
    maxY = new Date().getFullYear();
  }
  const out = [];
  for (let y = minY; y <= maxY; y++) out.push({ id: y, label: String(y) });
  return out;
}

const drums = [];
let thenMonthDrum = null;
let nowMonthDrum = null;

function monthHoles(ser, year) {
  const dead = [];
  if (!ser) return dead;
  for (let m = 1; m <= 12; m++) {
    if (atMonth(ser, year, m) == null) dead.push(m);
  }
  return dead;
}

function deadMonths(year) {
  const yd = yardMeta();
  const it = itemMeta();
  const dead = monthHoles(seriesOf(yd.series || yd.id), year);
  if (!it.typed) {
    monthHoles(seriesOf(it.series || it.id), year).forEach((m) => {
      if (dead.indexOf(m) < 0) dead.push(m);
    });
  }
  // Twelve dead months leaves Year as the only answer, so dim the whole wheel
  // rather than show twelve choices that do nothing.
  return { dead: dead, annual: dead.length === 12 };
}

function syncMonthWheels() {
  if (!thenMonthDrum || !nowMonthDrum) return;
  const a = deadMonths(state.thenYear);
  const b = deadMonths(state.nowYear);
  if (a.dead.indexOf(state.thenMonth) >= 0) {
    state.thenMonth = 0;
    thenMonthDrum.set(0);
  }
  if (b.dead.indexOf(state.nowMonth) >= 0) {
    state.nowMonth = 0;
    nowMonthDrum.set(0);
  }
  thenMonthDrum.mark(a.dead, a.annual);
  nowMonthDrum.mark(b.dead, b.annual);
}

function boot(data) {
  state.data = data;
  Object.keys(data.series || {}).forEach((id) => {
    data.series[id].freq = inferFreq(data.series[id]);
  });
  const years = yearsList();
  const last = years[years.length - 1].id;
  state.nowYear = last;
  if (last >= 2000) state.thenYear = 2000;
  else state.thenYear = years[0].id;

  paintVersion();

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
  thenMonthDrum = mountDrum($("drumThenMonth"), mOpts, state.thenMonth, (id) => {
    state.thenMonth = Number(id);
    renderAll();
  });
  nowMonthDrum = mountDrum($("drumNowMonth"), mOpts, state.nowMonth, (id) => {
    state.nowMonth = Number(id);
    renderAll();
  });
  drums.push(thenMonthDrum, nowMonthDrum);
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
  drums.push(
    mountDrum(
      $("drumAmount"),
      amountOptions(),
      state.amount,
      (id) => {
        state.amount = Number(id);
        renderAll();
      },
      { flickGain: 4 }
    )
  );

  lastDrumH = 0;
  pinShellViewport();
  renderAll();
  // Safari often lays out the long year lists after the first paint.
  [50, 200, 500, 1000].forEach((ms) => {
    setTimeout(() => {
      lastDrumH = 0;
      sizeDrums();
      drums.forEach((d) => d.resnap());
    }, ms);
  });
}

function localHost() {
  const h = location.hostname || "";
  return h === "localhost" || h === "127.0.0.1" || /^\d+\.\d+\.\d+\.\d+$/.test(h);
}

fetch("data/series.json?v=" + APP_VERSION.slice(1))
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
  if (h < 48 || h === lastDrumH) {
    fitHeroAmts();
    return;
  }
  lastDrumH = h;
  document.documentElement.style.setProperty("--drum-h", h + "px");
  drums.forEach((d) => d.resnap());
  fitHeroAmts();
}

function onViewport() {
  pinShellViewport();
  if (chartLines.length) requestAnimationFrame(() => drawChart($("chartPlot"), chartLines));
}

pinShellViewport();
window.addEventListener("resize", onViewport);
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", onViewport);
  window.visualViewport.addEventListener("scroll", onViewport);
}
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(fitHeroAmts);
}
paintVersion();
