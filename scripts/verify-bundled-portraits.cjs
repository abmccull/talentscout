const fs = require('node:fs/promises');
const path = require('node:path');
const {loadPortraitSources} = require('./portrait-source-loader.cjs');
async function main() {
  const repo=path.resolve(__dirname,'..'), api=loadPortraitSources(repo);
  const sources=JSON.parse(await fs.readFile(path.join(repo,'src/data/portraits/bundled-packs.json'),'utf8'));
  for(const source of sources) {
    if(!/^[a-z][a-z0-9-]+\.json$/.test(source.file)) throw new Error('Invalid source path');
    const pack=JSON.parse(await fs.readFile(path.join(repo,'src/data/portraits',source.file),'utf8'));
    const verified=await api.verifyPortraitPackFiles(pack,path.join(repo,'public'));
    console.log(`PORTRAIT_ASSETS_PASS pack=${verified.packId} people=${verified.people} images=${verified.images} bytes=${verified.bytes}`);
  }
}
main().catch(e=>{console.error(e);process.exitCode=1});
