"""Select one provider-bound campaign archive and verify its transport before staging.

This adapter does not parse game evidence or certify a campaign. Semantic JSON
admission remains the existing bounded three-read staging contract.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import struct
import sys
import tempfile
import zipfile

PROFILE_HASH = '193f139435344eb680c868385483a62dca0fca27732e206ae93ed50ef94f47e5'
ARTIFACT_NAME = 'canonical-release-soak-evidence'
CHUNK = 65536

def require(condition, message):
    if not condition:
        raise ValueError('Canonical artifact transport: ' + message)

def positive(value):
    return type(value) is int and value > 0 and value <= 9007199254740991

def timestamp(value):
    require(isinstance(value, str), 'missing timestamp')
    return datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()

def identity(info):
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns, info.st_ctime_ns)

def cross_api_identity(info):
    # CPython's Windows lstat and fstat expose different ctime semantics.
    # Compare their common identity fields when opening, then retain ALL fields
    # separately for descriptor-to-descriptor and path-to-path change checks.
    return (info.st_dev, info.st_ino, info.st_mode, info.st_nlink, info.st_size, info.st_mtime_ns)

def ordinary(path):
    path = Path(path).absolute()
    require(path.resolve(strict=True) == path, 'nonordinary input path')
    for ancestor in [*path.parents, path]:
        require(not ancestor.is_symlink(), 'symlink input path')
    return path

def read_bounded(path, maximum):
    path = ordinary(path)
    before = path.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'nonordinary input file')
    with path.open('rb') as handle:
        opened = os.fstat(handle.fileno())
        require(cross_api_identity(opened) == cross_api_identity(before) and 0 < opened.st_size <= maximum, 'input body exceeds admitted size or changed while opening')
        chunks = []
        total = 0
        while chunk := handle.read(min(CHUNK, maximum - total + 1)):
            total += len(chunk)
            require(total <= maximum, 'input expanded beyond admitted size')
            chunks.append(chunk)
        require(identity(os.fstat(handle.fileno())) == identity(opened), 'input changed during read')
    require(identity(path.lstat()) == identity(before), 'input changed after read')
    return b''.join(chunks)

def read_json(path, maximum):
    return json.loads(read_bounded(path, maximum))

def load_profile():
    raw = read_bounded(Path(__file__).with_name('release-artifact-io-profile.json'), 65536)
    require(hashlib.sha256(raw).hexdigest() == PROFILE_HASH, 'immutable canonical transport budget profile changed')
    return json.loads(raw)

def select_artifact(run, artifacts, expected_sha, source_run_id, repository):
    require(re.fullmatch(r'[a-f0-9]{40}', expected_sha) is not None and re.fullmatch(r'[1-9][0-9]*', source_run_id) is not None, 'invalid candidate/run selector')
    require(str(run.get('id')) == source_run_id and run.get('head_sha') == expected_sha, 'source run identity differs')
    require(run.get('status') == 'completed' and run.get('conclusion') == 'success'
            and run.get('event') == 'workflow_dispatch' and run.get('path') == '.github/workflows/canonical-release-soak.yml'
            and positive(run.get('run_attempt')), 'source is not a successful canonical dispatch attempt')
    repo = run.get('repository', {})
    head = run.get('head_repository', {})
    require(repo.get('full_name') == repository and positive(repo.get('id'))
            and head.get('full_name') == repository and head.get('id') == repo.get('id'), 'foreign or fork source repository')
    rows = artifacts.get('artifacts')
    require(isinstance(rows, list) and len(rows) <= 100 and artifacts.get('total_count') == len(rows), 'source artifact page is missing, over-limit, or truncated')
    selected = [row for row in rows if isinstance(row, dict) and row.get('name') == ARTIFACT_NAME]
    require(len(selected) == 1, 'exactly one canonical source artifact is required; diagnostic shards cannot substitute')
    artifact = selected[0]
    require(positive(artifact.get('id')) and artifact.get('expired') is False
            and positive(artifact.get('size_in_bytes')) and re.fullmatch(r'sha256:[a-f0-9]{64}', str(artifact.get('digest', ''))) is not None,
            'canonical artifact id/expiry/size/provider SHA256 is invalid')
    origin = artifact.get('workflow_run', {})
    require(str(origin.get('id')) == source_run_id and origin.get('head_sha') == expected_sha
            and origin.get('repository_id') == repo.get('id') and origin.get('head_repository_id') == repo.get('id'),
            'artifact belongs to a foreign run, commit, or repository')
    require(timestamp(run['run_started_at']) <= timestamp(artifact.get('created_at')) <= timestamp(run['updated_at']),
            'artifact is stale or outside the current attempt interval')
    return artifact

def outputs(path, values):
    if path is None:
        return
    with Path(path).open('a', encoding='utf-8', newline='\n') as handle:
        for key, value in values.items():
            require(re.fullmatch(r'[a-z_][a-z0-9_]*', key) is not None and '\n' not in str(value) and '\r' not in str(value), 'unsafe workflow output')
            handle.write(f'{key}={value}\n')

def admit_central_directory(handle, archive_size, profile):
    # ZipFile eagerly materializes central-directory entries in its constructor.
    # Admit count and metadata first, including count lies, before calling it.
    tail_bytes = min(archive_size, 65535 + 22)
    handle.seek(archive_size - tail_bytes)
    tail = handle.read(tail_bytes)
    marker = tail.rfind(b'PK\x05\x06')
    require(marker >= 0 and marker + 22 <= len(tail), 'missing bounded ZIP end record')
    _, disk, central_disk, disk_count, count, size, start, comment = struct.unpack('<4s4H2LH', tail[marker:marker+22])
    end_offset = archive_size - tail_bytes + marker
    require(marker + 22 + comment == len(tail) and disk == 0 and central_disk == 0, 'unsupported split archive or malformed end record')
    directory_boundary = end_offset
    legacy = (disk_count, count, size, start)
    sentinels = (65535, 65535, 0xffffffff, 0xffffffff)
    locator = b''
    if end_offset >= 20:
        handle.seek(end_offset - 20)
        locator = handle.read(20)
    has_zip64 = locator[:4] == b'PK\x06\x07'
    # Python consults a ZIP64 locator even when ordinary EOCD fields are not
    # sentinels. Admit that same physical record, never a different directory.
    if has_zip64:
        require(end_offset >= 20, 'missing ZIP64 locator')
        signature, locator_disk, zip64_offset, disk_total = struct.unpack('<4sLQL', locator)
        require(signature == b'PK\x06\x07' and locator_disk == 0 and disk_total == 1 and zip64_offset + 56 == end_offset - 20, 'unsupported ZIP64 locator or extended end record')
        handle.seek(zip64_offset)
        data = handle.read(56)
        signature, record_size, _, _, disk, central_disk, disk_count, count, size, start = struct.unpack('<4sQ2H2L4Q', data)
        require(signature == b'PK\x06\x06' and record_size == 44 and disk == 0 and central_disk == 0, 'unsupported ZIP64 end record')
        require(all(old in (sentinel, actual) for old, sentinel, actual in zip(legacy, sentinels, (disk_count, count, size, start))), 'ZIP64 counts or offsets differ from ordinary end record')
        directory_boundary = zip64_offset
    else:
        require(not any(value == sentinel for value, sentinel in zip(legacy, sentinels)), 'missing ZIP64 locator for sentinel end record')
    require(disk_count == count and 0 < count <= profile['readers']['directoryEntriesAllKinds'], 'central directory entry admission exceeded')
    require(0 < size <= profile['readers']['sourceJobsReceiptBytes'] and start + size == directory_boundary, 'central directory metadata admission exceeded or offset differs')
    handle.seek(start)
    position = start
    actual = 0
    while position < start + size:
        require(position + 46 <= start + size, 'truncated central directory header')
        header = handle.read(46)
        require(len(header) == 46, 'truncated central directory header')
        fields = struct.unpack('<4s6H3L5H2L', header)
        require(fields[0] == b'PK\x01\x02' and fields[13] == 0, 'unsupported central directory record')
        name_length, extra_length, comment_length = fields[10:13]
        actual += 1
        require(actual <= count and actual <= profile['readers']['directoryEntriesAllKinds'], 'central directory count differs before ZIP materialization')
        require(0 < name_length <= profile['representation']['maxCanonicalPathUtf8Bytes'], 'central directory path admission exceeded')
        position += 46 + name_length + extra_length + comment_length
        require(position <= start + size, 'central directory variable fields exceed admitted metadata')
        handle.seek(position)
    require(actual == count, 'central directory count differs before ZIP materialization')
    handle.seek(0)

def extract_verified(archive, artifact, destination, receipt_path, profile):
    writers = profile['writers']
    maximum = (writers['progress']['cumulativeBytesAllPhases'] + writers['workerCanonicalResult']['cumulativeBytes']
               + writers['checkpoint']['payloadBytes'] + writers['campaignSummary']['payloadBytes']
               + profile['readers']['sourceRunReceiptBytes'])
    archive = ordinary(archive)
    before = archive.lstat()
    require(stat.S_ISREG(before.st_mode) and before.st_nlink == 1 and 0 < before.st_size <= maximum + 1048576,
            'archive exceeds the original campaign payload envelope')
    require(before.st_size == artifact['size_in_bytes'], 'archive length differs from provider record')
    digest = hashlib.sha256()
    with archive.open('rb') as handle:
        opened = os.fstat(handle.fileno())
        require(cross_api_identity(opened) == cross_api_identity(before), 'archive changed while opening')
        hashed = 0
        while chunk := handle.read(CHUNK):
            hashed += len(chunk)
            require(hashed <= before.st_size, 'archive expanded during digest verification')
            digest.update(chunk)
        require(hashed == before.st_size and identity(os.fstat(handle.fileno())) == identity(opened), 'archive descriptor changed during digest verification')
    require(identity(archive.lstat()) == identity(before) and 'sha256:' + digest.hexdigest() == artifact['digest'], 'provider archive SHA256 mismatch')
    destination = Path(destination).absolute()
    receipt_path = Path(receipt_path).absolute()
    require(not destination.exists() and not destination.is_symlink() and not receipt_path.exists() and not receipt_path.is_symlink(), 'destination or receipt already exists')
    require(ordinary(destination.parent).is_dir() and ordinary(receipt_path.parent).is_dir(), 'output parent is nonordinary')
    expected_workers = {f'long-career-workers/seed-{seed:02}-run.json' for seed in range(1, 21)}
    expected_workers.add('long-career-workers/seed-01-determinism-replay.json')
    fixed = {'long-career-release-summary.json': writers['campaignSummary']['payloadBytes'],
             'canonical-soak-runner-profile.json': profile['readers']['sourceRunReceiptBytes'],
             'long-career-workers/checkpoint.json': writers['checkpoint']['payloadBytes']}
    admitted = []
    seen = set()
    progress = set()
    workers = set()
    total = 0
    with archive.open('rb') as archive_handle:
        opened = os.fstat(archive_handle.fileno())
        require(cross_api_identity(opened) == cross_api_identity(before), 'archive changed before extraction')
        admit_central_directory(archive_handle, before.st_size, profile)
        with zipfile.ZipFile(archive_handle) as bundle:
            entries = bundle.infolist()
            require(len(entries) <= profile['readers']['directoryEntriesAllKinds'], 'archive entry admission exceeded')
            for entry in entries:
                name = entry.filename
                require(name and '\\' not in name and not name.startswith('/') and all(part not in ('', '.', '..') for part in name.rstrip('/').split('/')),
                        'unsafe archive member path')
                require(len(name.encode('utf-8')) <= profile['representation']['maxCanonicalPathUtf8Bytes'] and name.casefold() not in seen, 'duplicate or excessive archive member path')
                seen.add(name.casefold())
                mode = entry.external_attr >> 16
                require(not stat.S_ISLNK(mode) and not (entry.flag_bits & 1), 'symlink or encrypted archive member')
                if entry.is_dir():
                    require(name == 'long-career-workers/' and entry.file_size == 0, 'unexpected archive directory')
                    continue
                require(stat.S_IFMT(mode) in (0, stat.S_IFREG) and entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), 'unsupported archive member type')
                if name in fixed:
                    cap = fixed[name]
                elif name in expected_workers:
                    cap = writers['workerCanonicalResult']['payloadBytes']
                    workers.add(name)
                else:
                    match = re.fullmatch(r'(long-career-workers/seed-\d{2}-(?:run|determinism-replay)\.json)\.progress-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.jsonl', name)
                    require(match is not None and match.group(1) in expected_workers and match.group(1) not in progress, 'unexpected or duplicate worker phase artifact')
                    progress.add(match.group(1))
                    cap = writers['progress']['fileBytesPerWorker']
                require(0 < entry.file_size <= cap, 'archive member exceeds its unchanged per-role payload budget')
                total += entry.file_size
                require(total <= maximum, 'archive cumulative payload budget exceeded')
                admitted.append((entry, cap))
            require(all(name in seen for name in fixed) and workers == expected_workers and progress == expected_workers,
                    'missing canonical summary, runner/checkpoint, primary worker, or fresh replay phase receipt')
            require(len(admitted) == 45, 'unexpected canonical artifact file count')
            destination.mkdir()
            records = []
            for entry, cap in admitted:
                target = destination / entry.filename
                target.parent.mkdir(parents=True, exist_ok=True)
                actual = 0
                member_hash = hashlib.sha256()
                with bundle.open(entry) as incoming, target.open('xb') as outgoing:
                    while chunk := incoming.read(CHUNK):
                        actual += len(chunk)
                        require(actual <= cap and actual <= entry.file_size, 'member expanded during extraction')
                        outgoing.write(chunk)
                        member_hash.update(chunk)
                    outgoing.flush()
                    os.fsync(outgoing.fileno())
                require(actual == entry.file_size, 'truncated archive member')
                records.append({'path': entry.filename, 'bytes': actual, 'sha256': member_hash.hexdigest()})
            require(identity(os.fstat(archive_handle.fileno())) == identity(opened), 'archive descriptor changed during extraction')
    require(identity(archive.lstat()) == identity(before), 'archive changed during extraction')
    campaign = next(row for row in records if row['path'] == 'long-career-release-summary.json')
    receipt = {'schemaVersion': 1, 'evidenceKind': 'verified-canonical-soak-artifact-transport',
               'sourceArtifact': artifact, 'archiveSha256': digest.hexdigest(), 'archiveBytes': before.st_size,
               'campaignSha256': campaign['sha256'], 'members': records, 'gameCampaignCertified': False}
    raw = (json.dumps(receipt, indent=2) + '\n').encode()
    require(len(raw) <= profile['readers']['sourceJobsReceiptBytes'], 'transport receipt exceeds metadata envelope')
    with receipt_path.open('xb') as handle:
        handle.write(raw)
        handle.flush()
        os.fsync(handle.fileno())
    require(read_bounded(receipt_path, profile['readers']['sourceJobsReceiptBytes']) == raw, 'transport receipt readback differs')
    return receipt

def main():
    parser = argparse.ArgumentParser()
    for name in ('run', 'artifacts', 'candidate-sha', 'source-run-id', 'repository'):
        parser.add_argument('--' + name, required=True)
    for name in ('destination', 'receipt', 'archive', 'outputs'):
        parser.add_argument('--' + name)
    parser.add_argument('--select-only', action='store_true')
    parser.add_argument('--archive-stdin', action='store_true')
    args = parser.parse_args()
    profile = load_profile()
    run = read_json(args.run, profile['readers']['sourceRunReceiptBytes'])
    artifacts = read_json(args.artifacts, profile['readers']['sourceJobsReceiptBytes'])
    artifact = select_artifact(run, artifacts, args.candidate_sha, args.source_run_id, args.repository)
    selected = {'artifact_id': str(artifact['id']), 'artifact_digest': artifact['digest'], 'artifact_created_at': artifact['created_at']}
    if args.select_only:
        require(not args.archive and not args.archive_stdin, 'selection cannot consume an archive')
        outputs(args.outputs, selected)
        print(json.dumps(selected))
        return
    require(args.destination and args.receipt and bool(args.archive) != args.archive_stdin, 'supply one archive source plus fresh destination and receipt')
    temporary = None
    try:
        archive = args.archive
        if args.archive_stdin:
            cap = (profile['writers']['progress']['cumulativeBytesAllPhases'] + profile['writers']['workerCanonicalResult']['cumulativeBytes']
                   + profile['writers']['checkpoint']['payloadBytes'] + profile['writers']['campaignSummary']['payloadBytes']
                   + profile['readers']['sourceRunReceiptBytes'] + 1048576)
            require(artifact['size_in_bytes'] <= cap, 'provider archive exceeds payload envelope')
            with tempfile.NamedTemporaryFile(prefix='ts-canonical-archive-', suffix='.zip', delete=False) as handle:
                temporary = handle.name
                total = 0
                while chunk := sys.stdin.buffer.read(CHUNK):
                    total += len(chunk)
                    require(total <= cap and total <= artifact['size_in_bytes'], 'download exceeds provider/payload envelope')
                    handle.write(chunk)
                handle.flush()
                os.fsync(handle.fileno())
            archive = temporary
        receipt = extract_verified(archive, artifact, args.destination, args.receipt, profile)
        selected['source_campaign_sha256'] = receipt['campaignSha256']
        outputs(args.outputs, selected)
        print(json.dumps({'status': 'Passed', 'scope': 'provider archive transport only', **selected, 'members': len(receipt['members'])}))
    finally:
        if temporary:
            Path(temporary).unlink(missing_ok=True)

if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
