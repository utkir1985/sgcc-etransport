import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const dir = await mkdtemp(join(tmpdir(), 'entry-tare-'));
try {
  const output = join(dir, 'flow.mjs');
  await build({ entryPoints: [fileURLToPath(new URL('../src/shared/utils/wagonFlowTiles.ts', import.meta.url))], bundle: true, platform: 'node', format: 'esm', outfile: output });
  const { isPartyEntryFinished, buildWagonFlowMetrics } = await import(pathToFileURL(output));
  const gate = '2026-09-08T08:55:34Z';
  const party = { id: 'entry-test', arrivalNumber: 'IB-0926-003', stage: 'ToRailwayScale', arrivalDate: '2026-09-08T07:43:29Z', createdAt: '2026-09-08T07:43:29Z', entryPermitShiftApprovedAt: '2026-09-08T07:59:00Z', entryPermitPermitApprovedAt: '2026-09-08T08:45:00Z', entryPermitSecurityApprovedAt: gate };
  const imported = { wagonNumber: '74124520', status: 'Sealed', tareWeight: '21.66', tareWeighedAt: '2026-09-08T04:14:15Z', loadingStartedAt: '2026-09-08T12:30:50Z' };
  const checked = { wagonNumber: '73698763', status: 'ToRailwayScale', tareWeight: '', tareCheckedAt: '2026-09-23T11:38:30Z' };
  const sample = { ...party, wagons: [imported, checked] };
  assert.equal(isPartyEntryFinished(sample), true, 'Imported pre-gate tare with actual post-gate loading must finish entry');
  assert.ok(buildWagonFlowMetrics([sample], []).approvedAt.w5, 'Dashboard tare tile must be complete');
  const pending = { wagonNumber: '12345678', status: 'AwaitingTare', tareWeight: '' };
  assert.equal(isPartyEntryFinished({ ...sample, wagons: [imported, pending] }), false, 'One unprocessed wagon keeps entry open');
  assert.equal(buildWagonFlowMetrics([{ ...sample, wagons: [imported, pending] }], []).approvedAt.w5, null);
  assert.equal(isPartyEntryFinished({ ...sample, entryPermitSecurityApprovedAt: null }), false, 'Loading must not bypass entry approvals');
  assert.equal(isPartyEntryFinished({ ...party, wagons: [{ ...imported, loadingStartedAt: null }] }), false, 'Old 1C tare/status alone must not complete a new entry');
  assert.equal(isPartyEntryFinished({ ...party, wagons: [{ ...imported, loadingStartedAt: '2026-09-07T12:00:00Z' }] }), false, 'Old loading timestamp must not count');
  assert.equal(isPartyEntryFinished({ ...party, wagons: [{ ...pending, tareCheckedAt: '2026-09-07T12:00:00Z', tareWeighedAt: '2026-09-08T10:00:00Z' }] }), true, 'Stale check must not hide a newer valid tare');
  console.log('PASS: pre-gate 1C tare, later loading, weightless check, partial party, missing approvals, stale timestamps, dashboard completion');
} finally { await rm(dir, { recursive: true, force: true }); }
