from pathlib import Path
import hashlib, json, struct, subprocess, sys, tempfile, unittest, zipfile, warnings

PROPOSAL=Path(__file__).resolve().parents[2]
HELPER=PROPOSAL/'scripts/prepare-canonical-soak-artifact.py'
SHA='a'*40
def digest(data):return hashlib.sha256(data).hexdigest()

class CanonicalTransport(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='ts-canonical-transport-')
        self.root=Path(self.temp.name)
        self.archive=self.root/'input.zip'
        self.destination=self.root/'protected/canonical'
        self.receipt=self.root/'protected/canonical-artifact.json'
        self.receipt.parent.mkdir()
        self.run={'id':12345,'head_sha':SHA,'run_attempt':1,'path':'.github/workflows/canonical-release-soak.yml','event':'workflow_dispatch','status':'completed','conclusion':'success','run_started_at':'2026-10-18T00:00:00Z','updated_at':'2026-10-18T21:00:00Z','repository':{'full_name':'abmccull/talentscout','id':77},'head_repository':{'full_name':'abmccull/talentscout','id':77}}
        self.members={'canonical-soak-runner-profile.json':b'{}','long-career-release-summary.json':b'{"fixture":true}','long-career-workers/checkpoint.json':b'{}'}
        for index in range(1,21):
            stem=f'long-career-workers/seed-{index:02}-run.json'
            self.members[stem]=b'{}'
            self.members[stem+f'.progress-00000000-0000-4000-8000-{index:012d}.jsonl']=b'{}\n'
        stem='long-career-workers/seed-01-determinism-replay.json'
        self.members[stem]=b'{}'
        self.members[stem+'.progress-00000000-0000-4000-8000-000000000021.jsonl']=b'{}\n'
        self.write_archive()
        self.artifact={'id':67890,'name':'canonical-release-soak-evidence','expired':False,'created_at':'2026-10-18T20:30:00Z','size_in_bytes':self.archive.stat().st_size,'digest':'sha256:'+digest(self.archive.read_bytes()),'workflow_run':{'id':12345,'head_sha':SHA,'repository_id':77,'head_repository_id':77}}
        self.artifacts={'total_count':1,'artifacts':[self.artifact]}
    def tearDown(self):self.temp.cleanup()
    def write_archive(self,extra=None):
        with warnings.catch_warnings():
            warnings.simplefilter('ignore',UserWarning)
            with zipfile.ZipFile(self.archive,'w',zipfile.ZIP_DEFLATED) as z:
                for name,data in self.members.items():z.writestr(name,data)
                if extra:extra(z)
    def sync_digest(self):
        self.artifact['digest']='sha256:'+digest(self.archive.read_bytes());self.artifact['size_in_bytes']=self.archive.stat().st_size
    def invoke(self):
        (self.root/'run.json').write_text(json.dumps(self.run))
        (self.root/'artifacts.json').write_text(json.dumps(self.artifacts))
        return subprocess.run([sys.executable,str(HELPER),'--run='+str(self.root/'run.json'),'--artifacts='+str(self.root/'artifacts.json'),'--candidate-sha='+SHA,'--source-run-id=12345','--repository=abmccull/talentscout','--destination='+str(self.destination),'--receipt='+str(self.receipt),'--archive='+str(self.archive),'--outputs='+str(self.root/'outputs.txt')],capture_output=True,text=True)
    def test_valid_original_archive(self):
        result=self.invoke();self.assertEqual(result.returncode,0,result.stderr)
        receipt=json.loads(self.receipt.read_text());self.assertEqual(len(receipt['members']),45)
        self.assertEqual(receipt['campaignSha256'],digest(self.members['long-career-release-summary.json']))
        for name,data in self.members.items():self.assertEqual((self.destination/name).read_bytes(),data)
    def test_rejects_mutants(self):
        mutations={
          'expired':lambda:self.artifact.update(expired=True),'wrong-run':lambda:self.artifact['workflow_run'].update(id=8),'wrong-sha':lambda:self.artifact['workflow_run'].update(head_sha='b'*40),'fork':lambda:self.artifact['workflow_run'].update(head_repository_id=88),'missing-digest':lambda:self.artifact.pop('digest'),'wrong-digest':lambda:self.artifact.update(digest='sha256:'+'b'*64),'stale-attempt':lambda:self.artifact.update(created_at='2026-10-17T23:59:59Z'),'multiple':lambda:(self.artifacts['artifacts'].append(dict(self.artifact)),self.artifacts.update(total_count=2)),'truncated':lambda:self.artifacts.update(total_count=2),'missing-primary':lambda:self.members.pop('long-career-workers/seed-20-run.json'),'missing-replay':lambda:self.members.pop('long-career-workers/seed-01-determinism-replay.json'),'traversal':lambda:self.members.update({'../outside.json':b'bad'}),'unexpected-file':lambda:self.members.update({'unreviewed.txt':b'bad'}),'empty-worker':lambda:self.members.update({'long-career-workers/seed-20-run.json':b''}),
        }
        original_artifacts=json.loads(json.dumps(self.artifacts));original_members=dict(self.members)
        for name,mutate in mutations.items():
            with self.subTest(name=name):
                self.artifacts=json.loads(json.dumps(original_artifacts));self.artifact=self.artifacts['artifacts'][0];self.members=dict(original_members)
                mutate()
                if name in {'missing-primary','missing-replay','traversal','unexpected-file','empty-worker'}:self.write_archive();self.sync_digest()
                else:self.write_archive()
                result=self.invoke();self.assertNotEqual(result.returncode,0,name)
                self.assertFalse(self.receipt.exists(),'No receipt should be published for rejected transport')
                if self.destination.exists():
                    import shutil;shutil.rmtree(self.destination)
    def test_duplicate_member(self):
        self.write_archive(lambda z:z.writestr('long-career-release-summary.json',b'other'));self.sync_digest();self.assertNotEqual(self.invoke().returncode,0)
    def test_symlink_member(self):
        def extra(z):
            info=zipfile.ZipInfo('long-career-workers/alias.json');info.create_system=3;info.external_attr=0o120777<<16;z.writestr(info,'../target')
        self.write_archive(extra);self.sync_digest();self.assertNotEqual(self.invoke().returncode,0)
    def test_existing_destination_preserved(self):
        self.destination.mkdir();sentinel=self.destination/'keep';sentinel.write_text('old');self.assertNotEqual(self.invoke().returncode,0);self.assertEqual(sentinel.read_text(),'old')
    def test_too_many_central_entries_before_materialization(self):
        self.write_archive(lambda z:[z.writestr('extra-%04d'%i,b'x') for i in range(257)])
        self.sync_digest();result=self.invoke();self.assertNotEqual(result.returncode,0);self.assertIn('central directory entry admission',result.stderr)
    def test_central_count_lie(self):
        raw=bytearray(self.archive.read_bytes());offset=raw.rfind(b'PK\x05\x06');struct.pack_into('<HH',raw,offset+8,1,1);self.archive.write_bytes(raw)
        self.sync_digest();result=self.invoke();self.assertNotEqual(result.returncode,0);self.assertIn('central directory count',result.stderr)
    def test_local_central_name_mismatch(self):
        raw=bytearray(self.archive.read_bytes());offset=raw.find(b'canonical-soak-runner-profile.json');raw[offset]=ord('x');self.archive.write_bytes(raw)
        self.sync_digest();self.assertNotEqual(self.invoke().returncode,0);self.assertFalse(self.receipt.exists())
    def test_valid_zip64_directory(self):
        raw=bytearray(self.archive.read_bytes());offset=raw.rfind(b'PK\x05\x06');end=raw[offset:];_,_,_,count,count2,size,start,_=struct.unpack('<4s4H2LH',end)
        zip64=struct.pack('<4sQ2H2L4Q',b'PK\x06\x06',44,45,45,0,0,count,count2,size,start)
        locator=struct.pack('<4sLQL',b'PK\x06\x07',0,offset,1)
        struct.pack_into('<HHLL',end,8,65535,65535,0xffffffff,0xffffffff)
        self.archive.write_bytes(raw[:offset]+zip64+locator+end);self.sync_digest();result=self.invoke();self.assertEqual(result.returncode,0,result.stderr)
    def test_valid_zip64_without_legacy_sentinels(self):
        raw=bytearray(self.archive.read_bytes());offset=raw.rfind(b'PK\x05\x06');end=raw[offset:];_,_,_,count,count2,size,start,_=struct.unpack('<4s4H2LH',end)
        zip64=struct.pack('<4sQ2H2L4Q',b'PK\x06\x06',44,45,45,0,0,count,count2,size,start)
        locator=struct.pack('<4sLQL',b'PK\x06\x07',0,offset,1)
        self.archive.write_bytes(raw[:offset]+zip64+locator+end);self.sync_digest();result=self.invoke();self.assertEqual(result.returncode,0,result.stderr)
    def test_zip64_cannot_override_legacy_count(self):
        raw=bytearray(self.archive.read_bytes());offset=raw.rfind(b'PK\x05\x06');end=raw[offset:];_,_,_,count,count2,size,start,_=struct.unpack('<4s4H2LH',end)
        zip64=struct.pack('<4sQ2H2L4Q',b'PK\x06\x06',44,45,45,0,0,count,count2,size,start)
        locator=struct.pack('<4sLQL',b'PK\x06\x07',0,offset,1)
        struct.pack_into('<HH',end,8,1,1)
        self.archive.write_bytes(raw[:offset]+zip64+locator+end);self.sync_digest();result=self.invoke();self.assertNotEqual(result.returncode,0);self.assertIn('ZIP64 counts or offsets differ',result.stderr)

if __name__=='__main__':unittest.main(verbosity=2)
