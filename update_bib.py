#!/usr/bin/env python3
"""Refresh publications.bib from NASA/ADS.

Designed to be safe to run unattended: transient ADS/network errors are
retried, the output is deterministically ordered, the file is written
atomically, and an implausible drop in the number of records is treated as
an upstream glitch rather than being committed.
"""

import os
import re
import sys
import json
import tempfile

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ORCID = os.environ.get("ORCID", "0000-0001-9472-041X")
BIB_PATH = os.environ.get("BIB_PATH", "publications.bib")
# Records legitimately disappear when ADS supersedes a preprint with the
# published version, so a small shrink is normal. A large one is not.
MAX_ALLOWED_SHRINK = int(os.environ.get("MAX_ALLOWED_SHRINK", "3"))
ROWS = 2000

ENTRY_RE = re.compile(r"^@\w+\{", re.MULTILINE)
KEY_RE = re.compile(r"^@\w+\{([^,]+),")


def make_session():
    """A requests session that retries transient failures with backoff."""
    retry = Retry(
        total=5,
        connect=5,
        read=5,
        backoff_factor=2,  # 0s, 2s, 4s, 8s, 16s
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET", "POST"]),
        raise_on_status=False,
    )
    session = requests.Session()
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("https://", adapter)
    session.headers.update({"Authorization": "Bearer " + os.environ["ADS_TOKEN"]})
    return session


def notice(message):
    """Print a message and surface it in the GitHub Actions run summary."""
    print(message)
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as f:
            f.write(message + "\n")


def fetch_bibcodes(session):
    response = session.get(
        "https://api.adsabs.harvard.edu/v1/search/query",
        params={"q": f"orcid:{ORCID}", "fl": "bibcode", "rows": ROWS},
        timeout=60,
    )
    response.raise_for_status()
    payload = response.json().get("response")
    if payload is None:
        raise ValueError(f"No response body in ADS search reply: {response.text[:500]}")

    num_found = payload.get("numFound", 0)
    if num_found > ROWS:
        raise ValueError(
            f"ADS reports {num_found} records but only {ROWS} were requested; "
            "raise ROWS so the bibliography is not silently truncated."
        )

    bibcodes = [doc["bibcode"] for doc in payload["docs"]]
    if not bibcodes:
        raise ValueError(f"ADS returned no records for orcid:{ORCID}")
    return bibcodes


def fetch_bibtex(session, bibcodes):
    response = session.post(
        "https://api.adsabs.harvard.edu/v1/export/bibtex",
        data=json.dumps({"bibcode": bibcodes}),
        headers={"Content-Type": "application/json"},
        timeout=120,
    )
    response.raise_for_status()
    export = response.json().get("export")
    if not export or not export.strip():
        raise ValueError("ADS export returned an empty bibtex document")
    return export


def split_entries(bibtex):
    """Split a bibtex document into individual entries."""
    starts = [m.start() for m in ENTRY_RE.finditer(bibtex)]
    return [bibtex[a:b].strip() for a, b in zip(starts, starts[1:] + [len(bibtex)])]


def sort_key(entry):
    """Sort on the bibcode, not the raw entry text, so the entry type
    (@ARTICLE vs @PHDTHESIS) does not drive the ordering."""
    match = KEY_RE.match(entry)
    return match.group(1) if match else entry


def count_entries(path):
    try:
        with open(path) as f:
            return len(split_entries(f.read()))
    except FileNotFoundError:
        return 0


def write_atomically(path, content):
    """Write via a temp file so an interrupted run cannot truncate the bib."""
    directory = os.path.dirname(os.path.abspath(path))
    fd, tmp_path = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(content)
        os.replace(tmp_path, path)
    except BaseException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise


def main():
    session = make_session()
    bibcodes = fetch_bibcodes(session)
    entries = split_entries(fetch_bibtex(session, sorted(bibcodes, reverse=True)))

    if not entries:
        raise ValueError("Could not parse any entries out of the ADS export")

    # Sort newest first. Bibcodes are year-prefixed, so a reverse sort keeps
    # the file in a stable order and stops unrelated reshuffles from showing
    # up as diffs.
    entries.sort(key=sort_key, reverse=True)

    previous = count_entries(BIB_PATH)
    shrink = previous - len(entries)
    if shrink > MAX_ALLOWED_SHRINK:
        notice(
            f"::warning::ADS returned {len(entries)} records, down from {previous} "
            f"in {BIB_PATH} (-{shrink}). That looks like an upstream indexing "
            "glitch rather than a real change, so the file was left untouched."
        )
        return 0

    write_atomically(BIB_PATH, "\n\n".join(entries) + "\n")
    notice(f"Wrote {len(entries)} records to {BIB_PATH} (previously {previous}).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
