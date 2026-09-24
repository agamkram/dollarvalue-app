#!/usr/bin/env python3
"""Bake US annual + monthly series into data/series.json.

FRED key: env FRED_API_KEY, or this folder's .env, or sibling globalflows-app/.env.
Never write the key into the JSON.
"""
from __future__ import annotations

import io
import json
import os
import re
import ssl
import statistics
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import openpyxl
import xlrd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "series.json"
CTX = ssl.create_default_context()
UA = "DollarValue/1 (markmaga.com; bake)"

FRED_SERIES = [
    ("cpi_u", "CPIAUCNS", "CPI-U", "price", "BLS via FRED"),
    ("pce", "PCEPI", "PCE", "price", "BEA via FRED"),
    ("gdp_deflator", "GDPDEF", "GDP deflator", "price", "BEA via FRED"),
    ("chained_cpi", "SUUR0000SA0", "Chained CPI", "price", "BLS via FRED"),
    ("gdp", "GDPA", "GDP", "output", "BEA via FRED"),
    ("gdp_per_capita", "A939RC0Q052SBEA", "GDP per capita", "income", "BEA via FRED"),
    ("college", "CUUR0000SEEB", "College tuition", "price", "BLS via FRED"),
    ("nasdaq", "NASDAQCOM", "NASDAQ", "asset", "FRED"),
    ("djia", "DJIA", "Dow Jones", "asset", "FRED"),
    ("m2", "M2SL", "M2", "money", "Fed via FRED"),
    ("m1", "M1SL", "M1", "money", "Fed via FRED"),
    ("base", "BOGMBASE", "Monetary base", "money", "Fed via FRED"),
    ("dxy", "DTWEXBGS", "Broad dollar", "numeraire", "Fed via FRED"),
    ("dxy_old", "TWEXBMTH", "Broad dollar (goods only)", "numeraire", "Fed via FRED"),
    ("wti", "WTISPLC", "WTI oil", "commodity", "FRED"),
    ("wheat", "PWHEAMTUSDM", "Wheat", "commodity", "IMF via FRED"),
    ("corn", "PMAIZMTUSDM", "Corn", "commodity", "IMF via FRED"),
    ("wage_hourly", "AHETPI", "Production hourly wage", "income", "BLS via FRED"),
    ("income_hh", "MEHOINUSA646N", "Median household income", "income", "Census via FRED"),
    ("spend_hh", "CXUTOTALEXPLB0101M", "Household spending", "expenditure", "BLS Consumer Expenditure Survey via FRED"),
    ("stocks", "SP500", "S&P 500", "asset", "FRED"),
    ("bitcoin", "CBBTCUSD", "Bitcoin", "numeraire", "Coinbase via FRED"),
    ("milk", "APU0000709112", "Milk", "commodity", "BLS Average Price"),
    ("eggs", "APU0000708111", "Eggs", "commodity", "BLS Average Price"),
    ("coffee", "APU0000717311", "Coffee", "commodity", "BLS Average Price"),
    ("gasoline", "APU000074714", "Gasoline", "commodity", "BLS Average Price"),
    ("electricity", "APU000072610", "Electricity", "commodity", "BLS Average Price"),
    ("homes_cs", "CSUSHPINSA", "Home prices (Case-Shiller)", "asset", "S&P via FRED"),
    ("homes_fhfa", "USSTHPI", "Home prices (FHFA)", "asset", "FHFA via FRED"),
    ("homes_msp", "MSPUS", "Median home price", "asset", "Census via FRED"),
    ("rent", "CUUR0000SEHA", "Rent of primary residence", "price", "BLS via FRED"),
    ("medical", "CUUR0000SAM2", "Medical care", "price", "BLS via FRED"),
    ("used_cars", "CUUR0000SETA02", "Used cars", "price", "BLS via FRED"),
]


def load_key() -> str:
    env = os.environ.get("FRED_API_KEY", "").strip()
    if env:
        return env
    for p in (ROOT / ".env", ROOT.parent / "globalflows-app" / ".env"):
        if not p.exists():
            continue
        for line in p.read_text().splitlines():
            if line.startswith("FRED_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"')
    return ""


def get(url: str, timeout: int = 40) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
        return r.read()


def fred_obs(key: str, sid: str) -> list[tuple[str, float]]:
    q = urllib.parse.urlencode(
        {
            "series_id": sid,
            "api_key": key,
            "file_type": "json",
            "observation_start": "1774-01-01",
        }
    )
    url = "https://api.stlouisfed.org/fred/series/observations?" + q
    payload = json.loads(get(url).decode("utf-8"))
    if "observations" not in payload:
        raise RuntimeError(payload.get("error_message", "FRED error"))
    out = []
    for o in payload["observations"]:
        v = o.get("value")
        if v in (None, "", "."):
            continue
        try:
            out.append((o["date"], float(v)))
        except ValueError:
            continue
    return out


def pack_obs(obs: list[tuple[str, float]]) -> dict:
    by_year: dict[int, list[tuple[int, float]]] = defaultdict(list)
    monthly: dict[str, list] = {}
    for d, v in obs:
        y = int(d[0:4])
        m = int(d[5:7])
        by_year[y].append((m, v))
        key = "%d" % y
        if key not in monthly:
            monthly[key] = [None] * 12
        monthly[key][m - 1] = round(v, 6)
    years = sorted(by_year)
    annual = []
    for y in years:
        vals = [v for _, v in by_year[y]]
        annual.append(round(statistics.mean(vals), 6))
    # Drop empty monthly years
    monthly = {k: v for k, v in monthly.items() if any(x is not None for x in v)}
    return collapse_annual({"years": years, "annual": annual, "monthly": monthly})


def collapse_annual(packed: dict) -> dict:
    """A yearly FRED observation is dated January 1. That is not a January print."""
    mon = packed.get("monthly") or {}
    if not mon:
        packed["monthly"] = {}
        return packed
    for row in mon.values():
        if any(v is not None for i, v in enumerate(row) if i != 0):
            return packed
    packed["monthly"] = {}
    return packed


def mpls_cpi() -> dict[int, float]:
    html = get(
        "https://www.minneapolisfed.org/about-us/monetary-policy/inflation-calculator/consumer-price-index-1800-"
    ).decode("utf-8", "replace")
    # Year cell then CPI cell. Index is 1982-84=100 in the current table
    # (1800 prints ~51 on older 1967=100 pages; we re-base later if needed).
    rows = re.findall(
        r">(\d{4})</div>\s*</td>\s*<td[^>]*>\s*<div[^>]*>\s*([\d.]+)\s*</div>",
        html,
    )
    out = {}
    for y, v in rows:
        yi = int(y)
        if 1770 <= yi <= 2030:
            out[yi] = float(v)
    return out


PINK_URL = (
    "https://thedocs.worldbank.org/en/doc/"
    "74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/"
    "CMO-Historical-Data-Monthly.xlsx"
)
SHILLER_URL = "http://www.econ.yale.edu/~shiller/data/ie_data.xls"
SP_FRED_START = "2016-09-01"
BTC_COINBASE = "2014-12-01"


def num(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        if s in ("", "…", "...", "–", "-", "NA", "n.a."):
            return None
        try:
            return float(s)
        except ValueError:
            return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:
        return None
    return f


def pink_metals() -> dict[str, list[tuple[str, float]]]:
    print("World Bank pink sheet…")
    wb = openpyxl.load_workbook(io.BytesIO(get(PINK_URL, timeout=90)), data_only=True)
    ws = wb["Monthly Prices"]
    header = None
    out = {"Gold": [], "Silver": []}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 4:
            header = [str(c).strip() if c is not None else "" for c in row]
            continue
        if header is None or i < 6 or not row or not row[0]:
            continue
        m = re.match(r"^(\d{4})M(\d{2})$", str(row[0]).strip())
        if not m:
            continue
        iso = "%s-%s-01" % (m.group(1), m.group(2))
        for name in ("Gold", "Silver"):
            v = num(row[header.index(name)])
            if v is None or v <= 0:
                continue
            out[name].append((iso, v))
    wb.close()
    for name, obs in out.items():
        if len(obs) < 24:
            raise RuntimeError("pink sheet %s n=%d" % (name, len(obs)))
        print("  %s %s–%s n=%d" % (name, obs[0][0][:7], obs[-1][0][:7], len(obs)))
    return out


def bitstamp_btc() -> list[tuple[str, float]]:
    print("Bitstamp bitcoin…")
    step = 86400
    end = int(datetime(2014, 11, 30, tzinfo=timezone.utc).timestamp())
    seen = {}
    for _ in range(8):
        url = (
            "https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=%d&limit=1000&end=%d"
            % (step, end)
        )
        payload = json.loads(get(url).decode())
        bars = (payload.get("data") or {}).get("ohlc") or []
        if not bars:
            break
        oldest = None
        for bar in bars:
            ts = int(bar["timestamp"])
            oldest = ts if oldest is None else min(oldest, ts)
            d = datetime.fromtimestamp(ts, timezone.utc).date()
            if d >= date(2014, 12, 1):
                continue
            seen[d.isoformat()] = float(bar["close"])
        if oldest is None:
            break
        if datetime.fromtimestamp(oldest, timezone.utc).date() <= date(2011, 8, 1):
            break
        nxt = oldest - step
        if nxt >= end:
            break
        end = nxt
        time.sleep(0.25)
    obs = sorted(seen.items())
    if len(obs) < 100:
        raise RuntimeError("bitstamp n=%d" % len(obs))
    print("  %s–%s n=%d" % (obs[0][0], obs[-1][0], len(obs)))
    return obs


def shiller_sp() -> list[tuple[str, float]]:
    print("Shiller S&P…")
    book = xlrd.open_workbook(file_contents=get(SHILLER_URL, timeout=90))
    sh = book.sheet_by_name("Data")
    obs = []
    for r in range(sh.nrows):
        dv = sh.cell_value(r, 0)
        pv = sh.cell_value(r, 1)
        if not isinstance(dv, float) or not isinstance(pv, (int, float)) or pv <= 0:
            continue
        year = int(dv)
        month = int(round((dv - year) * 100))
        if month < 1 or month > 12 or year < 1800 or year > 2100:
            continue
        iso = "%04d-%02d-01" % (year, month)
        if iso >= SP_FRED_START:
            continue
        obs.append((iso, float(pv)))
    if len(obs) < 100 or not obs[0][0].startswith("1871"):
        raise RuntimeError("shiller n=%d first=%s" % (len(obs), obs[:1]))
    print("  %s–%s n=%d" % (obs[0][0][:7], obs[-1][0][:7], len(obs)))
    return obs


def month_means(obs: list[tuple[str, float]]) -> list[tuple[str, float]]:
    buckets: dict[str, list[float]] = defaultdict(list)
    for d, v in obs:
        buckets[d[:7]].append(v)
    return [(k + "-01", sum(vs) / len(vs)) for k, vs in sorted(buckets.items())]


def official_gold() -> dict[int, float]:
    gold_off = {}
    for y in range(1792, 1834):
        gold_off[y] = 19.39
    for y in range(1834, 1934):
        gold_off[y] = 20.67
    for y in range(1934, 1972):
        gold_off[y] = 35.0
    gold_off[1972] = 38.0
    gold_off[1973] = 42.22
    return gold_off


def build_gold(market_obs: list[tuple[str, float]]) -> dict:
    off = official_gold()
    years = sorted(off)
    annual = [off[y] for y in years]
    packed = pack_obs([(d, v) for d, v in market_obs if d >= "1974-01-01"])
    for y, v in zip(packed["years"], packed["annual"]):
        if y <= 1973:
            continue
        years.append(y)
        annual.append(v)
    monthly = {
        k: row
        for k, row in (packed.get("monthly") or {}).items()
        if int(k) >= 1974
    }
    have = set(years)
    missing = [y for y in range(1974, years[-1] + 1) if y not in have]
    if missing:
        raise RuntimeError("gold still missing %s" % missing[:8])
    return {
        "id": "gold",
        "name": "Gold",
        "kind": "numeraire",
        "source": "US official price through 1973; World Bank monthly average from 1974",
        "years": years,
        "annual": [round(float(v), 6) for v in annual],
        "monthly": monthly,
    }


def build_silver(obs: list[tuple[str, float]]) -> dict:
    packed = pack_obs(obs)
    return {
        "id": "silver_spot",
        "name": "Silver",
        "kind": "numeraire",
        "source": "World Bank monthly average, London fix",
        **packed,
    }


def splice_bitcoin(series: dict, raw: dict, early: list[tuple[str, float]]) -> None:
    coin = [pair for pair in raw.get("bitcoin", []) if pair[0] >= BTC_COINBASE]
    if not coin:
        raise RuntimeError("no Coinbase bitcoin")
    packed = pack_obs(list(early) + coin)
    series["bitcoin"] = {
        "id": "bitcoin",
        "name": "Bitcoin",
        "kind": "numeraire",
        "source": "Bitstamp through Nov 2014, Coinbase via FRED from Dec 2014",
        "fred": "CBBTCUSD",
        **packed,
    }
    print("  bitcoin %s–%s" % (packed["years"][0], packed["years"][-1]))


def splice_sp(series: dict, raw: dict, shiller: list[tuple[str, float]]) -> None:
    fred_days = [pair for pair in raw.get("stocks", []) if pair[0] >= SP_FRED_START]
    if not fred_days:
        raise RuntimeError("no FRED SP500")
    packed = pack_obs(list(shiller) + month_means(fred_days))
    series["stocks"] = {
        "id": "stocks",
        "name": "S&P 500",
        "kind": "asset",
        "source": "Shiller composite through Aug 2016, then S&P 500 monthly average via FRED",
        "fred": "SP500",
        **packed,
    }
    print("  stocks %s–%s" % (packed["years"][0], packed["years"][-1]))


def splice_dollar(series: dict, raw: dict) -> None:
    old = raw.get("dxy_old") or []
    new = raw.get("dxy") or []
    jan_old = [v for d, v in old if d.startswith("2006-01")]
    jan_new = [v for d, v in new if d.startswith("2006-01")]
    if not jan_old or not jan_new:
        raise RuntimeError("broad dollar has no January 2006 overlap")
    scale = (sum(jan_new) / len(jan_new)) / (sum(jan_old) / len(jan_old))
    merged = [(d, v * scale) for d, v in old if d < "2006-01-01"]
    merged += [pair for pair in new if pair[0] >= "2006-01-01"]
    packed = pack_obs(merged)
    series["dxy"] = {
        "id": "dxy",
        "name": "Broad dollar",
        "kind": "numeraire",
        "source": "Fed goods-only broad index before 2006, goods and services after",
        "fred": "DTWEXBGS",
        **packed,
    }
    series.pop("dxy_old", None)
    print(
        "  dxy %s–%s scale=%.4f"
        % (packed["years"][0], packed["years"][-1], scale)
    )


def main() -> None:
    key = load_key()
    if not key:
        raise SystemExit("No FRED_API_KEY")
    OUT.parent.mkdir(parents=True, exist_ok=True)

    series = {}
    raw = {}
    print("FRED…")
    for sid, fred, name, kind, source in FRED_SERIES:
        try:
            obs = fred_obs(key, fred)
            if len(obs) < 8:
                print("  skip %s (%s) n=%d" % (sid, fred, len(obs)))
                continue
            if sid in ("bitcoin", "stocks", "dxy", "dxy_old"):
                raw[sid] = obs
            packed = pack_obs(obs)
            series[sid] = {
                "id": sid,
                "name": name,
                "kind": kind,
                "source": source,
                "fred": fred,
                **packed,
            }
            print("  %s %s–%s n=%d" % (sid, packed["years"][0], packed["years"][-1], len(packed["years"])))
        except Exception as e:
            print("  FAIL %s (%s): %s" % (sid, fred, e))
        time.sleep(0.15)

    print("Minneapolis Fed CPI 1800…")
    try:
        mpls = mpls_cpi()
        years = sorted(mpls)
        series["cpi_mpls"] = {
            "id": "cpi_mpls",
            "name": "CPI (Minneapolis Fed, 1800)",
            "kind": "price",
            "source": "Minneapolis Fed",
            "years": years,
            "annual": [mpls[y] for y in years],
            "monthly": {},
        }
        print("  %s–%s n=%d" % (years[0], years[-1], len(years)))
    except Exception as e:
        print("  FAIL mpls:", e)

    metals = pink_metals()
    series["gold"] = build_gold(metals["Gold"])
    series["silver_spot"] = build_silver(metals["Silver"])
    gspan = series["gold"]["years"]
    sspan = series["silver_spot"]["years"]
    print("  gold %s–%s" % (gspan[0], gspan[-1]))
    print("  silver %s–%s" % (sspan[0], sspan[-1]))
    splice_bitcoin(series, raw, bitstamp_btc())
    splice_sp(series, raw, shiller_sp())
    splice_dollar(series, raw)

    # One CPI yardstick: Minneapolis 1800–1912 scaled onto BLS 1913–now.
    if "cpi_u" in series and "cpi_mpls" in series:
        bls = series["cpi_u"]
        mpls_s = series["cpi_mpls"]
        try:
            i1913 = bls["years"].index(1913)
            j1913 = mpls_s["years"].index(1913)
            scale = bls["annual"][i1913] / mpls_s["annual"][j1913]
            years = [y for y in mpls_s["years"] if y < 1913] + list(bls["years"])
            annual = [mpls_s["annual"][mpls_s["years"].index(y)] * scale for y in mpls_s["years"] if y < 1913]
            annual += list(bls["annual"])
            series["cpi"] = {
                "id": "cpi",
                "name": "CPI-U",
                "kind": "price",
                "source": "Minneapolis Fed (1800–1912) + BLS (1913–)",
                "years": years,
                "annual": [round(v, 6) for v in annual],
                "monthly": dict(bls.get("monthly") or {}),
            }
            print("  spliced cpi %s–%s" % (years[0], years[-1]))
        except Exception as e:
            raise SystemExit("cpi splice failed: %s" % e)
    else:
        raise SystemExit("cpi splice missing cpi_u or cpi_mpls; series.json not written")

    for drop in ("cpi_u", "cpi_mpls", "dxy_old", "gold_official", "gold_spot", "wage_ssa"):
        series.pop(drop, None)
    need = ("cpi", "gold", "silver_spot", "bitcoin", "stocks", "dxy")
    missing = [k for k in need if k not in series]
    if missing:
        raise SystemExit("missing %s; series.json not written" % ", ".join(missing))

    payload = {
        "baked": date.today().isoformat(),
        "series": series,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print("wrote %s (%.0f KB, %d series)" % (OUT, kb, len(series)))


if __name__ == "__main__":
    main()
