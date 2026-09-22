#!/usr/bin/env python3
"""Bake US annual + monthly series into data/series.json.

FRED key: env FRED_API_KEY, or this folder's .env, or sibling globalflows-app/.env.
Never write the key into the JSON.
"""
from __future__ import annotations

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
    ("m2", "M2SL", "M2", "money", "Fed via FRED"),
    ("m1", "M1SL", "M1", "money", "Fed via FRED"),
    ("base", "BOGMBASE", "Monetary base", "money", "Fed via FRED"),
    ("dxy", "DTWEXBGS", "Broad dollar", "numeraire", "Fed via FRED"),
    ("wti", "WTISPLC", "WTI oil", "commodity", "FRED"),
    ("wage_hourly", "AHETPI", "Production hourly wage", "income", "BLS via FRED"),
    ("stocks", "SP500", "S&P 500", "asset", "FRED"),
    ("bitcoin", "CBBTCUSD", "Bitcoin", "numeraire", "Coinbase via FRED"),
    ("milk", "APU0000702111", "Milk", "commodity", "BLS Average Price"),
    ("eggs", "APU0000708111", "Eggs", "commodity", "BLS Average Price"),
    ("coffee", "APU0000709112", "Coffee", "commodity", "BLS Average Price"),
    ("gasoline", "APU000074714", "Gasoline", "commodity", "BLS Average Price"),
    ("electricity", "APU000072610", "Electricity", "commodity", "BLS Average Price"),
    ("homes_cs", "CSUSHPINSA", "Home prices (Case-Shiller)", "asset", "S&P via FRED"),
    ("homes_fhfa", "USSTHPI", "Home prices (FHFA)", "asset", "FHFA via FRED"),
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


def bls_window(sid: str, start: int, end: int) -> list[dict]:
    body = json.dumps(
        {"seriesid": [sid], "startyear": str(start), "endyear": str(end)}
    ).encode()
    req = urllib.request.Request(
        "https://api.bls.gov/publicAPI/v2/timeseries/data/",
        data=body,
        headers={"User-Agent": UA, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, context=CTX, timeout=40) as r:
        payload = json.loads(r.read().decode())
    if payload.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(payload.get("message"))
    return payload["Results"]["series"][0]["data"]


def bls_full(sid: str, start: int = 1913, end: int | None = None) -> list[tuple[str, float]]:
    if end is None:
        end = date.today().year
    obs = []
    y = start
    while y <= end:
        chunk_end = min(y + 9, end)
        try:
            rows = bls_window(sid, y, chunk_end)
        except Exception as e:
            print("  BLS fail %s %s-%s: %s" % (sid, y, chunk_end, e))
            y = chunk_end + 1
            time.sleep(0.4)
            continue
        for row in rows:
            per = row.get("period") or ""
            if not per.startswith("M"):
                continue
            m = int(per[1:])
            try:
                v = float(row["value"])
            except (TypeError, ValueError, KeyError):
                continue
            obs.append(("%s-%02d-01" % (row["year"], m), v))
        y = chunk_end + 1
        time.sleep(0.25)
    obs.sort()
    return obs


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


def yahoo_monthly(symbol: str) -> list[tuple[str, float]]:
    url = (
        "https://query1.finance.yahoo.com/v8/finance/chart/"
        + urllib.parse.quote(symbol)
        + "?interval=1mo&range=max"
    )
    payload = json.loads(get(url).decode("utf-8"))
    r = payload["chart"]["result"][0]
    ts = r["timestamp"]
    closes = r["indicators"]["quote"][0]["close"]
    out = []
    for t, v in zip(ts, closes):
        if v is None:
            continue
        d = datetime.fromtimestamp(int(t), timezone.utc).date()
        out.append(("%04d-%02d-01" % (d.year, d.month), float(v)))
    return out


def ssa_awi() -> dict[int, float]:
    html = get("https://www.ssa.gov/oact/cola/AWI.html").decode("utf-8", "replace")
    # Year then index in table cells
    rows = re.findall(
        r"<td[^>]*>\s*(\d{4})\s*</td>\s*<td[^>]*>\s*([\d,.]+)\s*</td>",
        html,
        flags=re.I,
    )
    out = {}
    for y, v in rows:
        yi = int(y)
        if 1950 <= yi <= 2030:
            out[yi] = float(v.replace(",", ""))
    return out


def splice_gold(series: dict) -> None:
    """Official par through 1973, COMEX after. The 1974–1999 gap stays empty."""
    if "gold_official" not in series:
        return
    go = series["gold_official"]
    gs = series.get("gold_spot")
    years = list(go["years"])
    annual = list(go["annual"])
    monthly: dict = {}
    if gs:
        for y, v in zip(gs["years"], gs["annual"]):
            if y <= 1973:
                continue
            if y in years:
                annual[years.index(y)] = v
            else:
                years.append(y)
                annual.append(v)
        monthly = dict(gs.get("monthly") or {})
    series["gold"] = {
        "id": "gold",
        "name": "Gold",
        "kind": "numeraire",
        "source": "US official par to 1973, COMEX from 2000",
        "years": years,
        "annual": [round(float(v), 6) for v in annual],
        "monthly": monthly,
    }


def main() -> None:
    key = load_key()
    if not key:
        raise SystemExit("No FRED_API_KEY")
    OUT.parent.mkdir(parents=True, exist_ok=True)

    series = {}
    print("FRED…")
    for sid, fred, name, kind, source in FRED_SERIES:
        try:
            obs = fred_obs(key, fred)
            if len(obs) < 8:
                print("  skip %s (%s) n=%d" % (sid, fred, len(obs)))
                continue
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

    print("SSA Average Wage Index…")
    try:
        awi = ssa_awi()
        years = sorted(awi)
        series["wage_ssa"] = {
            "id": "wage_ssa",
            "name": "SSA wage index",
            "kind": "income",
            "source": "SSA AWI",
            "years": years,
            "annual": [awi[y] for y in years],
            "monthly": {},
        }
        print("  %s–%s n=%d" % (years[0], years[-1], len(years)))
    except Exception as e:
        print("  FAIL ssa:", e)

    # Official US gold price before the free market — public statute, not a scrape.
    gold_off = {}
    for y in range(1792, 1834):
        gold_off[y] = 19.39
    for y in range(1834, 1934):
        gold_off[y] = 20.67
    for y in range(1934, 1972):
        gold_off[y] = 35.0
    gold_off[1972] = 38.0
    gold_off[1973] = 42.22
    years = sorted(gold_off)
    series["gold_official"] = {
        "id": "gold_official",
        "name": "Gold (US official)",
        "kind": "numeraire",
        "source": "US mint / Bretton Woods parities",
        "years": years,
        "annual": [gold_off[y] for y in years],
        "monthly": {},
    }

    print("Yahoo gold / silver…")
    for sid, symbol, name in (
        ("gold_spot", "GC=F", "Gold (COMEX)"),
        ("silver_spot", "SI=F", "Silver (COMEX)"),
    ):
        try:
            packed = pack_obs(yahoo_monthly(symbol))
            series[sid] = {
                "id": sid,
                "name": name,
                "kind": "numeraire",
                "source": "Yahoo Finance %s" % symbol,
                **packed,
            }
            print("  %s %s–%s n=%d" % (sid, packed["years"][0], packed["years"][-1], len(packed["years"])))
        except Exception as e:
            print("  FAIL %s: %s" % (sid, e))

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
            print("  FAIL cpi splice:", e)

    splice_gold(series)

    payload = {
        "baked": date.today().isoformat(),
        "series": series,
    }
    OUT.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    kb = OUT.stat().st_size / 1024
    print("wrote %s (%.0f KB, %d series)" % (OUT, kb, len(series)))


if __name__ == "__main__":
    main()
