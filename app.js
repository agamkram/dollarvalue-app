const APP_VERSION = "v42";

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
  { id: "cpi", name: "CPI-U", hint: "Official urban basket" },
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
  { id: "dxy", name: "Broad dollar", series: "dxy", kind: "numeraire", dollars: false },
  { id: "homes_msp", name: "Median home", series: "homes_msp", kind: "asset" },
  { id: "homes_cs", name: "Home price CS", series: "homes_cs", kind: "index", dollars: false },
  { id: "homes_fhfa", name: "Home price FHFA", series: "homes_fhfa", kind: "index", dollars: false },
  { id: "rent", name: "Rent index", series: "rent", kind: "index", dollars: false },
  { id: "college", name: "College index", series: "college", kind: "index", dollars: false },
  { id: "medical", name: "Medical index", series: "medical", kind: "index", dollars: false },
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

function money(n, digits) {
  if (n == null || !isFinite(n)) return "—";
  const abs = Math.abs(n);
  const d =
    digits != null ? digits : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 3;
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: abs < 1 ? d : 0,
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

function spanYears() {
  function pt(y, m) {
    return y + ((m || 6) - 0.5) / 12;
  }
  return Math.abs(
    pt(state.nowYear, state.nowMonth) - pt(state.thenYear, state.thenMonth)
  );
}

function pace(vs) {
  if (vs == null || !isFinite(vs)) return null;
  const years = spanYears();
  if (years < 1) {
    return {
      text: pct(vs),
      tone: vs > 8 ? "hot" : vs < -8 ? "cool" : "",
      perYear: false,
    };
  }
  const factor = 1 + vs / 100;
  if (!(factor > 0)) {
    return { text: pct(vs), tone: vs > 0 ? "hot" : "cool", perYear: false };
  }
  const ann = (Math.pow(factor, 1 / years) - 1) * 100;
  const sign = ann > 0 ? "+" : "";
  return {
    text: sign + ann.toFixed(1) + "%/yr",
    tone: ann > 2 ? "hot" : ann < -2 ? "cool" : "",
    perYear: true,
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
      mins0: null,
      mins1: null,
      u0: null,
      u1: null,
    };
  }
  const from = thenAmount();
  const ratio = scale(yd.id, state.thenYear, state.thenMonth, state.nowYear, state.nowMonth);
  const expected = from != null && ratio != null ? from * ratio : null;
  const actual = nowActual();
  const vs =
    expected != null && actual != null && expected !== 0
      ? ((actual - expected) / expected) * 100
      : null;
  const priced = it.dollars !== false;
  const wage0 = atMonth(seriesOf("wage_hourly"), state.thenYear, state.thenMonth);
  const wage1 = atMonth(seriesOf("wage_hourly"), state.nowYear, state.nowMonth);
  const mins0 = priced && from != null && wage0 ? (from / wage0) * 60 : null;
  const mins1 = priced
    ? (actual != null && wage1 ? (actual / wage1) * 60 : null) ??
      (expected != null && wage1 ? (expected / wage1) * 60 : null)
    : null;
  let u0 = null;
  let u1 = null;
  if (yd.stick && priced) {
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

function fitHeroAmt(el, side) {
  if (!el || !side || side.classList.contains("is-empty") || !el.textContent) {
    if (el) el.style.fontSize = "";
    return;
  }
  const room = side.clientWidth - 8;
  if (room <= 0) return;
  const max = 40.8;
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
    ["heroFromSide", "heroFrom"],
    ["heroToSide", "heroTo"],
    ["heroActualSide", "heroActual"],
  ];
  for (const [sideId, amtId] of pairs) {
    fitHeroAmt($(amtId), $(sideId));
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
    c.yd.name + " · " + whenLabel(state.nowYear, state.nowMonth, seriesOf(c.yd.id))
  );

  const yardSer = seriesOf(c.yd.id);
  const m1Cross = crossesM1Break(
    state.thenYear,
    state.thenMonth,
    state.nowYear,
    state.nowMonth
  );
  const m1Note =
    (c.yd.id === "m1" || isM1(c.it)) && m1Cross ? "M1 redefined May 2020" : "";
  const dxyNote =
    c.yd.id === "dxy" && (state.thenYear < 2006 || state.nowYear < 2006)
      ? "Broad dollar is goods only before 2006"
      : "";
  const note =
    m1Note || explainGap(yardSer, c.yd.name) || explainGap(itemSer, c.it.name) || dxyNote;
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
  if (yd.id === "dxy") return "dollar";
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
  return whenLabel(year, month, ser)
    .replace(/ avg$/, "")
    .replace(/ YTD$/, ", so far")
    .replace(/ partial$/, ", a partial year");
}

function plainLine(c, note) {
  const itemSer = c.it.typed ? null : seriesOf(c.it.series || c.it.id);
  const yardSer = seriesOf(c.yd.id);
  const thenSer = c.it.typed ? yardSer : itemSer;
  const thenL = plainWhen(state.thenYear, state.thenMonth, thenSer);
  const nowL = plainWhen(state.nowYear, state.nowMonth, thenSer);
  if (c.expected == null) return note || "No comparison for these dates.";
  const exp = fmtPlain(c.expected, c.it.typed ? true : c.it.dollars);
  const y = c.yd.name;
  if (c.it.typed) {
    const amt = fmtPlain(c.from, true);
    if (c.yd.id === "cpi") {
      return amt + " in " + thenL + " buys what " + exp + " buys in " + nowL + ", on the household basket.";
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
      return amt + " in " + thenL + " is the same share of average income as " + exp + " in " + nowL + ".";
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
    if (c.yd.id === "dxy") {
      return amt + " in " + thenL + " is " + exp + " in " + nowL + " if it moved with the broad dollar. A stronger dollar makes this larger.";
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
    const extra = c.vs > 0.5 ? " The extra is stuff they bought." : c.vs < -0.5 ? " They bought less than prices alone suggest." : " Spending kept pace with prices.";
    return "Households spent " + from + " in " + thenL + ". Prices alone would make that " + exp + " in " + nowL + ". They spend " + actual + "." + extra + lagWords(c.vs);
  }
  const rose = c.actual > c.from;
  const fell = c.actual < c.from;
  const yardRose = c.ratio > 1;
  if (rose && c.vs < -0.5 && yardRose) {
    return name + " rose, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". " + y + " rose faster. Keeping up would have meant " + exp + "." + lagWords(c.vs);
  }
  if (rose && c.vs > 0.5) {
    return name + " rose, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". It beat " + y + ". Just following " + y + " would have meant " + exp + "." + lagWords(c.vs);
  }
  if (fell && c.vs < -0.5) {
    return name + " fell, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". " + y + " did better. Following it would have meant " + exp + "." + lagWords(c.vs);
  }
  if (fell && c.vs > 0.5) {
    return name + " fell, from " + from + " in " + thenL + " to " + actual + " in " + nowL + ". " + y + " fell further. Following it would have meant " + exp + "." + lagWords(c.vs);
  }
  return name + " was " + from + " in " + thenL + " and is " + actual + " in " + nowL + ". It kept pace with " + y + ", which pointed to " + exp + ".";
}

function renderHeat(c) {
  const el = $("heat");
  const bits = [];
  for (const it of ITEMS) {
    if (it.typed) continue;
    const a0 = atMonth(seriesOf(it.series || it.id), state.thenYear, state.thenMonth);
    const a1 = atMonth(seriesOf(it.series || it.id), state.nowYear, state.nowMonth);
    if (it.series === "m1" && crossesM1Break(state.thenYear, state.thenMonth, state.nowYear, state.nowMonth)) {
      continue;
    }
    if (a0 == null || a1 == null || a0 === 0) continue;
    const r = c.ratio;
    if (r == null) continue;
    const exp = a0 * r;
    const vs = ((a1 - exp) / exp) * 100;
    const step = pace(vs);
    if (!step) continue;
    const hot = step.tone === "hot" ? " is-hot" : step.tone === "cool" ? " is-cool" : "";
    bits.push(
      '<span class="chip' +
        hot +
        '"><b>' +
        it.name +
        "</b>" +
        step.text +
        "</span>"
    );
  }
  el.innerHTML = bits.join("");
  const cap = $("heatCap");
  const perYear = bits.length && pace(1) && pace(1).perYear;
  if (bits.length && c.ratio != null) {
    cap.hidden = false;
    cap.textContent = perYear
      ? "Versus " + c.yd.name + ", per year."
      : "Versus " + c.yd.name + ", over this span.";
  } else {
    cap.hidden = true;
    cap.textContent = "";
  }

  const work = $("work");
  if (c.it.dollars !== false && c.mins0 != null) {
    work.hidden = false;
    work.textContent =
      "Work time, production wage since 1964: " +
      fmtMins(c.mins0) +
      " then → " +
      fmtMins(c.mins1) +
      " now";
  } else {
    work.hidden = true;
  }
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

function renderAll() {
  const c = compute();
  renderHero(c);
  renderHeat(c);
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
  if (flickGain > 1) el.classList.add("drum-fast");

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
  el.addEventListener(
    "scroll",
    () => {
      if (lock) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (lock) return;
        const i = indexFromScroll();
        const opt = options[Math.max(0, Math.min(options.length - 1, i))];
        if (!opt) return;
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
  Object.keys(data.series || {}).forEach((id) => {
    data.series[id].freq = inferFreq(data.series[id]);
  });
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
