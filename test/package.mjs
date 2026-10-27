import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
// SSR/build tooling may import the package without a browser. Registration is
// deferred until a browser imports it; importing must not throw in Node.
const entry = await import('@zumer/orbit-kit');
for (const name of ['gauge','donut','rings','knob','menu','instrument','clock','compass','radar','timer','status']) {
  const short = await import(`@zumer/orbit-kit/o-${name}.js`);
  const documentedLegacy = await import(`@zumer/orbit-kit/src/o-${name}.js`);
  assert.deepEqual(Object.keys(short),Object.keys(documentedLegacy));
  assert.ok(existsSync(fileURLToPath(import.meta.resolve(`@zumer/orbit-kit/o-${name}.js`))));
}
assert.equal(typeof entry.OrbitKnob,'function');
assert.equal(typeof entry.OrbitTimer,'function');
assert.equal(typeof entry.OrbitStatus,'function');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.deepEqual(pkg.files,['src']);
console.log('ESM entry, individual imports, legacy subpaths and SSR imports passed.');
