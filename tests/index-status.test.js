import test from 'node:test';
import assert from 'node:assert/strict';
import { describeIndex } from '../public/index-status.js';

test('a failed retry keeps the last successful time distinct from the launch snapshot', () => {
  const asOf = '2026-11-26T10:00:00Z';
  assert.equal(describeIndex({asOf,source:'snapshot',cache:'stale'},false).label,'Last successful check');
  assert.equal(describeIndex({asOf,source:'snapshot',cache:'hit'},false).label,'Dated snapshot');
});

test('bounded GitHub results expose coverage without claiming that all issues are shown', () => {
  const description = describeIndex({asOf:'2026-11-26T10:00:00Z',source:'live',partial:true},false);
  assert.equal(description.label,'Partial GitHub index');
  assert.match(description.detail,/only the issues retrieved/);
});

test('initial loading is distinct from an unavailable index', () => {
  assert.equal(describeIndex({},true).label,'Checking GitHub…');
  assert.equal(describeIndex({},false).label,'Index unavailable');
});
