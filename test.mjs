import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { auditMtdReadiness, evaluateMtdMandation, getMtdQuarters, parseGbpPence } from './index.mjs';

test('parseGbpPence sums combined qualifying income without floating-point drift', () => {
  assert.equal(parseGbpPence('£49,999.99') + parseGbpPence('£0.02'), 5_000_001n);
});

test('evaluateMtdMandation distinguishes strictly over £50k, £30k, £20k and exact threshold edge', () => {
  assert.equal(
    evaluateMtdMandation({ selfEmploymentGrossGbp: '50000.00' }).wave,
    'APRIL_2027',
  );
  assert.equal(
    evaluateMtdMandation({ selfEmploymentGrossGbp: '50000.01' }).wave,
    'APRIL_2026',
  );
  assert.equal(
    evaluateMtdMandation({ selfEmploymentGrossGbp: '22500', ukPropertyGrossGbp: '12000' }).wave,
    'APRIL_2027',
  );
  assert.equal(
    evaluateMtdMandation({ selfEmploymentGrossGbp: '21000' }).wave,
    'APRIL_2028',
  );
  assert.equal(
    evaluateMtdMandation({ selfEmploymentGrossGbp: '19500' }).wave,
    'BELOW_CURRENT_THRESHOLDS',
  );
});

test('getMtdQuarters aligns HMRC standard and calendar quarters with statutory deadlines', () => {
  const standard = getMtdQuarters(2026, false);
  assert.equal(standard[0].periodStart, '2026-04-06');
  assert.equal(standard[0].filingDeadline, '2026-08-07');
  assert.equal(standard[3].periodEnd, '2027-04-05');
  assert.equal(standard[3].filingDeadline, '2027-05-07');

  const calendar = getMtdQuarters(2026, true);
  assert.equal(calendar[0].periodStart, '2026-04-01');
  assert.equal(calendar[0].periodEnd, '2026-06-30');
  assert.equal(calendar[3].periodEnd, '2027-03-31');
  assert.equal(calendar[3].filingDeadline, '2027-05-07');
});

test('auditMtdReadiness flags CIS net turnover trap, missing calendar election, and manual copy breaks', () => {
  const res = auditMtdReadiness({
    selfEmploymentGrossGbp: '51000.00',
    cisDeductionsNetted: true,
    usesCalendarQuarters: true,
    hasCalendarElection: false,
    manualCopyPasteBetweenBooks: true,
  });
  assert.equal(res.ready, false);
  assert.equal(res.issueCount, 3);
  assert.deepEqual(
    res.issues.map((i) => i.rule),
    ['cis_net_turnover_trap', 'un-elected_calendar_quarters', 'broken_digital_links'],
  );
});

test('CLI --demo exits with code 2 when issues are detected and outputs valid JSON', () => {
  let stdout = '';
  let exitCode = 0;
  try {
    stdout = execFileSync(process.execPath, ['./index.mjs', '--demo'], { encoding: 'utf8' });
  } catch (err) {
    stdout = err.stdout;
    exitCode = err.status;
  }
  assert.equal(exitCode, 2);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.mandation.wave, 'APRIL_2026');
  assert.equal(parsed.ready, false);
});
