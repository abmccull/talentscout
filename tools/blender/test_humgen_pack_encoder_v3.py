import hashlib
from contextlib import closing
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image
from humgen_pack_encoder_v3 import encode


class EncoderReviewTests(unittest.TestCase):
    def test_hold_retains_verified_review_without_admitting_face_and_chooses_closest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = Image.new('RGB', (640, 800), (110, 95, 80))
            with patch('humgen_pack_encoder_v3.fingerprint', return_value=0):
                image.save(root/'scratch.png')
                accepted = encode(root, 5, 22)
                self.assertEqual(accepted['status'], 'encoded')
                # A lower ID is similar, but the exact match must win.
                with closing(sqlite3.connect(root/'likeness.sqlite')) as db:
                    db.execute('INSERT INTO faces VALUES (?,?)', (1, '1'))
                    db.executemany('INSERT INTO bands VALUES (?,?,?)',
                                   [(1, band, (1 >> (band * 8)) & 255) for band in range(16)])
                    db.commit()
                image.save(root/'scratch.png')
                held = encode(root, 8, 22)
            self.assertEqual(held['similarTo'], 5)
            self.assertEqual(held['distance'], 0)
            self.assertFalse(held['admitted'])
            self.assertTrue(held['reviewRequired'])
            folder = root/'renders/face-000008'
            review = folder/held['reviewImage']
            self.assertEqual(hashlib.sha256(review.read_bytes()).hexdigest(), held['reviewReceipt']['sha256'])
            with Image.open(review) as decoded:
                decoded.load()
                self.assertEqual(decoded.size, (320, 400))
            self.assertFalse((folder/'age-22.webp').exists())
            self.assertFalse((folder/'age-22.json').exists())
            with closing(sqlite3.connect(root/'likeness.sqlite')) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM faces WHERE id=8').fetchone()[0], 0)
            before = review.read_bytes()
            image.save(root/'scratch.png')
            with self.assertRaises(ValueError):
                encode(root, 8, 22)
            self.assertEqual(review.read_bytes(), before)
            self.assertTrue((root/'scratch.png').exists())
            self.assertEqual(json.loads((folder/'held.json').read_text()), held)

    def test_age_render_receipt_and_pending_output_are_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            image = Image.new('RGB', (640, 800), (110, 95, 80))
            image.save(root/'scratch.png')
            result = encode(root, 3, 15)
            target = root/'renders/face-000003/age-15.webp'
            self.assertEqual(hashlib.sha256(target.read_bytes()).hexdigest(), result['sha256'])
            image.save(root/'scratch.png')
            with self.assertRaises(ValueError):
                encode(root, 3, 15)
            pending = target.parent/'age-18.pending.webp'
            pending.write_bytes(b'preserve unfinished output for reconciliation')
            with self.assertRaises(ValueError):
                encode(root, 3, 18)
            self.assertEqual(pending.read_bytes(), b'preserve unfinished output for reconciliation')
            self.assertFalse((target.parent/'age-18.webp').exists())


if __name__ == '__main__':
    unittest.main()
