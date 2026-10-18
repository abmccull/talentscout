"""Freeze local simulation code for a diagnostic run; never modifies the source."""
import hashlib
import json
import pathlib
import shutil
import sys

source = pathlib.Path(sys.argv[1]).resolve()
target = pathlib.Path(sys.argv[2]).resolve()
if target.exists() or source == target or source in target.parents:
    raise SystemExit("Choose a new snapshot directory outside the source checkout.")
files = []
for folder in ("src", "tests", "scripts", "messages", "e2e", "public/images/portraits"):
    files.extend(p for p in (source / folder).rglob("*") if p.is_file() and not p.is_symlink())
files.extend(p for p in source.iterdir() if p.is_file() and p.suffix in (".json", ".ts", ".mjs", ".js"))
hashes = {}
target.mkdir(parents=True)
for path in sorted(set(files)):
    relative = path.relative_to(source)
    destination = target / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)
    hashes[relative.as_posix()] = hashlib.sha256(destination.read_bytes()).hexdigest()
fingerprint = hashlib.sha256(json.dumps(hashes, sort_keys=True).encode()).hexdigest()
(target / "snapshot-manifest.json").write_text(json.dumps({
    "source": str(source), "kind": "dirty-worktree-diagnostic", "fingerprint": fingerprint, "files": hashes,
}, indent=2), encoding="utf-8")
print(json.dumps({"path": str(target), "files": len(hashes), "fingerprint": fingerprint}))
