import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'order-fulfillment-'));
try {
  const output = join(dir, 'fulfillment.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../src/shared/components/OrderFulfillmentStatus.tsx', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: output });
  const { isOrderFulfilled } = await import(pathToFileURL(output));
  const complete = lines => isOrderFulfilled({ lines });
  assert.equal(complete([{ wagonCount: 1, tonCount: 32700, fulfilledWagonCount: 1, fulfilledNetWeight: 32.7 }]), true);
  assert.equal(complete([{ wagonCount: 0, tonCount: 100, fulfilledNetWeight: 99.999 }]), false);
  assert.equal(complete([{ wagonCount: 0, tonCount: 100, fulfilledNetWeight: 100 }]), true);
  assert.equal(complete([{ wagonCount: 1, fulfilledWagonCount: 2 }, { wagonCount: 1, fulfilledWagonCount: 0 }]), false);
  assert.equal(complete([]), false);
  assert.equal(complete([{ wagonCount: 0, tonCount: 0 }]), false);
  console.log('PASS: wagon and ton quotas, per-line remainder, empty orders');
} finally { await rm(dir, { recursive: true, force: true }); }
