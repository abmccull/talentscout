"""Measure historical repeated-ID overhead without changing any saved identity."""
import collections
import hashlib
import json
from pathlib import Path
import re
import sys

source, output = map(Path, sys.argv[1:3])
if source.resolve() == output.resolve():
    raise SystemExit("Choose a distinct new report path")
raw = source.read_bytes()
state = json.loads(raw)["gameState"]
listings = state["finances"]["reportListings"]
mapping = {}
for listing in listings:
    match = re.search(r"_a(\d+)$", listing["id"])
    if match:
        mapping[listing["id"]] = f"listing_s{listing['listedSeason']}w{listing['listedWeek']}_a{match.group(1)}"
counts = collections.Counter(
    match.group(0) for match in re.finditer(r'listing_[^"\\]*?_s\d+w\d+_a\d+', raw.decode("utf-8"))
    if match.group(0) in mapping
)
report = {
    "scope": "Historical repeated-ID cost estimate only. No checkpoint or existing identity is changed; future career savings require replay.",
    "sourceSha256": hashlib.sha256(raw).hexdigest(), "season": state["currentSeason"],
    "listingCount": len(listings), "recognizedListingIds": len(counts), "occurrences": sum(counts.values()),
    "potentialBytesAvoidedWithShortListingIds": sum(count * (len(old.encode()) - len(mapping[old].encode())) for old, count in counts.items()),
    "sourceUnchanged": source.read_bytes() == raw,
}
with output.open("x", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2)
print(json.dumps(report))
