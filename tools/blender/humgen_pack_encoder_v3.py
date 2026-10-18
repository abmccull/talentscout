"""New-batch encoder: quarantine reviewable likeness holds, never admit them.

Do not substitute into a sealed batch: its manifest pins the encoder hash.
Interface matches the existing local runner; a new manifest is required.
"""
from contextlib import closing
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
from PIL import Image


def write_image(image, target):
    if target.exists():
        raise ValueError('Refusing to overwrite an existing review/output')
    pending = target.with_suffix('.pending.webp')
    if pending.exists():
        raise ValueError('Reconcile existing pending output before retrying')
    image.save(pending, 'WEBP', quality=90, method=6)
    with Image.open(pending) as decoded:
        decoded.load()
        if decoded.size != (320, 400):
            raise ValueError('Encoded image is invalid')
    data = pending.read_bytes()
    pending.replace(target)
    return {'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data),
            'width': 320, 'height': 400}


def fingerprint(image):
    # Compare the face, excluding most hair, clothing and studio background.
    face=image.convert('L').crop((int(image.width*.28),int(image.height*.25),int(image.width*.72),int(image.height*.61)))
    pixels=list(face.resize((9,9),Image.Resampling.LANCZOS).tobytes())
    value=0
    for y in range(8):
        for x in range(8): value=(value<<1)|int(pixels[y*9+x]>pixels[y*9+x+1])
    for y in range(8):
        for x in range(8): value=(value<<1)|int(pixels[y*9+x]>pixels[(y+1)*9+x])
    return value


def encode(root,index,age):
    root=Path(root).resolve()
    if index<0 or age not in (15,18,22,27,31,35,39,45): raise ValueError('Invalid output key')
    source=root/'scratch.png'
    folder=root/'renders'/f'face-{index:06d}'
    folder.mkdir(parents=True,exist_ok=True)
    target=folder/f'age-{age}.webp'
    receipt=folder/f'age-{age}.json'
    if target.exists() or receipt.exists() or (folder/'held.json').exists():
        raise ValueError('Refusing to overwrite an existing output or hold')
    with Image.open(source) as loaded:
        loaded.load()
        if loaded.size!=(640,800): raise ValueError('Unexpected source dimensions')
        image=loaded.resize((320,400),Image.Resampling.LANCZOS).convert('RGB')
    with closing(sqlite3.connect(root/'likeness.sqlite')) as db:
        db.execute('CREATE TABLE IF NOT EXISTS faces (id INTEGER PRIMARY KEY, fingerprint TEXT NOT NULL)')
        db.execute('CREATE TABLE IF NOT EXISTS bands (id INTEGER, band INTEGER, token INTEGER, PRIMARY KEY(id,band))')
        db.execute('CREATE INDEX IF NOT EXISTS lookup ON bands(band,token)')
        fp=fingerprint(image)
        if age==22:
            clauses=' OR '.join('(band=? AND token=?)' for _ in range(16))
            params=[v for band in range(16) for v in (band,(fp>>(band*8))&255)]
            candidates=db.execute('SELECT DISTINCT faces.id,faces.fingerprint FROM faces JOIN bands USING(id) WHERE '+clauses,params)
            matches=sorted(((fp^int(old_fp,16)).bit_count(),old_index)
                           for old_index,old_fp in candidates if old_index!=index)
            if matches and matches[0][0]<=10:
                distance,old_index=matches[0]
                review=folder/'held-age-22.webp'
                image_receipt=write_image(image,review)
                result={'status':'held-lookalike','candidate':index,'similarTo':old_index,'distance':distance,
                        'fingerprint':f'{fp:032x}', 'reviewImage':review.name,
                        'reviewReceipt':image_receipt,
                        'reviewRequired':True, 'admitted':False}
                (folder/'held.json').write_text(json.dumps(result,indent=2))
                source.unlink()
                return result
        image_receipt=write_image(image,target)
        result={'status':'encoded','candidate':index,'age':age,
                **image_receipt,'fingerprint':f'{fp:032x}'}
        receipt.write_text(json.dumps(result,indent=2))
        if age==22:
            db.execute('INSERT OR REPLACE INTO faces VALUES (?,?)',(index,f'{fp:032x}'))
            db.executemany('INSERT OR REPLACE INTO bands VALUES (?,?,?)',[(index,band,(fp>>(band*8))&255) for band in range(16)])
            db.commit()
    # Only this job's scratch render is removed, after verified encoding.
    source.unlink()
    return result

if __name__=='__main__':
    print(json.dumps(encode(sys.argv[1],int(sys.argv[2]),int(sys.argv[3]))))
