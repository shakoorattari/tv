// Bundle the static client and metadata endpoint into a single Sites Worker.
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {extname} from 'node:path';
const root = new URL('../dist/', import.meta.url);
const assets = {};
const types = {'.js':'text/javascript','.html':'text/html','.svg':'image/svg+xml','.css':'text/css','.json':'application/json'};
async function collect(prefix) {
  for (const entry of await readdir(new URL(prefix, root), {withFileTypes:true})) {
    const path = prefix + entry.name;
    if (entry.isDirectory()) {
      if (entry.name === 'art') await collect(path + '/');
    } else if (types[extname(path)]) {
      assets[path] = [types[extname(path)], await readFile(new URL(path, root), 'utf8')];
    }
  }
}
await collect('');
const code = await readFile(new URL('./metadata.mjs', import.meta.url), 'utf8');
await mkdir(new URL('server/',root),{recursive:true});
await writeFile(new URL('server/index.js',root),code + '\nconst assets = ' + JSON.stringify(assets) + `;
export default {
  fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\\/(?:tv\\/)?/, '');
    if (path === 'api/youtube') return metadata(url.searchParams.get('id'));
    const asset = Object.hasOwn(assets, path || 'index.html') && assets[path || 'index.html'];
    if (!asset) return new Response('Not found', {status:404});
    return new Response(asset[1], {headers:{'Content-Type':asset[0]+'; charset=UTF-8'}});
  }
};\n`);
