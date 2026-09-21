#!/usr/bin/env python3
"""Bump the app version everywhere at once."""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"
APP = ROOT / "app.js"
SW = ROOT / "sw.js"
CSS = ROOT / "styles.css"
ABOUT = ROOT / "about.html"

SPOTS = {
    "index asset ?v=": (INDEX, r"\?v=(\d+)", "?v={n}"),
    "index EXPECTED": (INDEX, r'var EXPECTED = "v(\d+)"', 'var EXPECTED = "v{n}"'),
    "index verBadge": (INDEX, r'id="verBadge"[^>]*>v(\d+)', 'id="verBadge" title="Build">v{n}'),
    "about asset ?v=": (ABOUT, r"\?v=(\d+)", "?v={n}"),
    "app APP_VERSION": (APP, r'const APP_VERSION = "v(\d+)"', 'const APP_VERSION = "v{n}"'),
    "sw CACHE": (SW, r'const CACHE = "dollarvalue-v(\d+)"', 'const CACHE = "dollarvalue-v{n}"'),
    "sw precache ?v=": (SW, r"\?v=(\d+)", "?v={n}"),
    "css --dv-css": (CSS, r"--dv-css:\s*(\d+)", "--dv-css: {n}"),
}


def read(p):
    return p.read_text(encoding="utf-8")


def found(text, pattern):
    return [m.group(1) for m in re.finditer(pattern, text)]


def survey():
    cache = {}
    result = {}
    for name, (path, pattern, _) in SPOTS.items():
        if not path.exists():
            result[name] = []
            continue
        if path not in cache:
            cache[path] = read(path)
        result[name] = found(cache[path], pattern)
    return result, cache


def report(survey_result):
    all_versions = set()
    problems = []
    for name, hits in survey_result.items():
        if not hits:
            problems.append("%s: no match found" % name)
            print("  %-18s MISSING" % name)
            continue
        uniq = sorted(set(hits))
        all_versions.update(uniq)
        flag = "" if len(uniq) == 1 else "  <-- inconsistent"
        print(
            "  %-18s v%s (%d spot%s)%s"
            % (name, ",v".join(uniq), len(hits), "" if len(hits) == 1 else "s", flag)
        )
        if len(uniq) > 1:
            problems.append("%s disagrees with itself: %s" % (name, uniq))
    if len(all_versions) > 1:
        problems.append("files disagree: found %s" % sorted(all_versions))
    return all_versions, problems


def main():
    args = [a for a in sys.argv[1:] if a]
    check_only = "--check" in args
    explicit = next((a for a in args if a.isdigit()), None)

    print("current:")
    result, cache = survey()
    versions, problems = report(result)

    if check_only:
        if problems:
            print("\nFAIL")
            for p in problems:
                print("  - " + p)
            sys.exit(1)
        print("\nOK — all in sync at v%s" % versions.pop())
        return

    if not versions:
        print("\nNothing found to bump. Aborting.", file=sys.stderr)
        sys.exit(1)

    new = int(explicit) if explicit else max(int(v) for v in versions) + 1

    for name, (path, pattern, template) in SPOTS.items():
        if path not in cache:
            continue
        text = cache[path]

        def sub(m, tmpl=template):
            return tmpl.format(n=new)

        cache[path] = re.sub(pattern, sub, text)

    for path, text in cache.items():
        path.write_text(text, encoding="utf-8")

    print("\nbumped to v%d:" % new)
    after, problems2 = report(survey()[0])
    if problems2:
        print("\nFAIL — files still disagree")
        for p in problems2:
            print("  - " + p)
        sys.exit(1)
    print("\nOK — all in sync at v%d." % new)


if __name__ == "__main__":
    main()
