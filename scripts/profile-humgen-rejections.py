"""Read-only attribution of a sealed HumGen batch's likeness holds."""
import collections
import hashlib
import json
from pathlib import Path
import sys

root, output = map(lambda value: Path(value).resolve(), sys.argv[1:3])
if output == root or root in output.parents:
    raise SystemExit("Report must be outside the source batch")
read = lambda path: json.loads(path.read_text(encoding="utf-8"))
recipes = {int(path.parent.name.split("-")[-1]): read(path)
           for path in (root / "renders").glob("face-*/recipe.json")}
holds = [read(path) for path in (root / "renders").glob("face-*/held.json")]
completed = [int(path.parent.name.split("-")[-1])
             for path in (root / "renders").glob("face-*/complete.json")]
presets = collections.defaultdict(lambda: {"attempted": 0, "completed": 0, "held": 0})
distances = collections.Counter()
same_preset = 0
missing_recipes = []
retained_review_images = 0
for recipe in recipes.values():
    presets[recipe["preset"]]["attempted"] += 1
for index in completed:
    if index in recipes:
        presets[recipes[index]["preset"]]["completed"] += 1
for hold in holds:
    index, other = hold["candidate"], hold["similarTo"]
    distances[hold["distance"]] += 1
    if index not in recipes or other not in recipes:
        missing_recipes.append([index, other])
        continue
    presets[recipes[index]["preset"]]["held"] += 1
    same_preset += recipes[index]["preset"] == recipes[other]["preset"]
    folder = root / "renders" / f"face-{index:06d}"
    retained_review_images += any(folder.glob("*.webp")) or any(folder.glob("*.png"))
report = {
    "scope": "Read-only receipt attribution. Perceptual hashes are review signals, not proof of identity; deleted held renders prevent visual adjudication.",
    "source": str(root),
    "manifestSha256": hashlib.sha256((root / "manifest.json").read_bytes()).hexdigest(),
    "recipes": len(recipes), "completedPeople": len(completed), "heldPeople": len(holds),
    "samePresetHolds": same_preset, "differentPresetHolds": len(holds) - same_preset - len(missing_recipes),
    "heldCandidatesWithReviewImages": retained_review_images,
    "missingRecipePairs": missing_recipes, "holdDistances": dict(sorted(distances.items())),
    "presets": dict(sorted(presets.items())),
}
output.parent.mkdir(parents=True, exist_ok=True)
with output.open("x", encoding="utf-8") as handle:
    json.dump(report, handle, indent=2)
print(json.dumps({key: value for key, value in report.items() if key != "presets"}, indent=2))
