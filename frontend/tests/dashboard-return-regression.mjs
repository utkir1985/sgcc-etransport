import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const dir = await mkdtemp(join(tmpdir(), 'dashboard-return-'));
try {
  const output = join(dir, 'return.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../src/shared/utils/dashboardReturn.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: output });
  const { dashboardReturnTo, processRedirectTo } = await import(pathToFileURL(output));
  assert.equal(dashboardReturnTo('?from=%2Fdashboard%3Ffocus%3Dkirish', null), '/dashboard?focus=kirish');
  assert.equal(dashboardReturnTo('', { from: '/dashboard?focus=loading' }), '/dashboard?focus=loading');
  assert.equal(dashboardReturnTo('?from=%2Fdashboard', { from: '/dashboard?focus=other' }), '/dashboard');
  for (const from of ['https://example.com', '//example.com', '/dashboard-other', '/registry', '']) {
    assert.equal(dashboardReturnTo(`?from=${encodeURIComponent(from)}`, null), null);
  }
  const redirected = processRedirectTo('/empty-wagons?work=gateCheck', '?party=IB-0926-003&from=%2Fdashboard%3Ffocus%3Dkirish&work=old&stage=w4');
  const params = new URLSearchParams(redirected.split('?')[1]);
  assert.equal(params.get('party'), 'IB-0926-003');
  assert.equal(params.get('work'), 'gateCheck');
  assert.equal(params.get('stage'), 'w4');
  assert.equal(dashboardReturnTo(redirected.split('?').slice(1).join('?'), null), '/dashboard?focus=kirish');
  console.log('PASS: dashboard return URL, focus preservation, state fallback, menu behavior, process redirect context');
} finally { await rm(dir, { recursive: true, force: true }); }
