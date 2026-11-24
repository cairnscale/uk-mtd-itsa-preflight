#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const WAVE_THRESHOLDS = [
  { pence: 5_000_000n, wave: 'APRIL_2026', mandationDate: '2026-04-06', thresholdGbp: 50000, baseTaxYear: '2024-25' },
  { pence: 3_000_000n, wave: 'APRIL_2027', mandationDate: '2027-04-06', thresholdGbp: 30000, baseTaxYear: '2025-26' },
  { pence: 2_000_000n, wave: 'APRIL_2028', mandationDate: '2028-04-06', thresholdGbp: 20000, baseTaxYear: '2026-27' },
];

/**
 * Parse a GBP decimal string (e.g. "£50,000.01", "30000") strictly into BigInt pence.
 */
export function parseGbpPence(raw) {
  const cleaned = String(raw ?? '').trim().replace(/[£,\s]/g, '');
  if (!cleaned) return 0n;
  const match = cleaned.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) {
    throw new RangeError(`Invalid GBP decimal amount: "${raw}"`);
  }
  const sign = match[1] === '-' ? -1n : 1n;
  const pounds = BigInt(match[2]);
  const fracRaw = (match[3] ?? '').padEnd(2, '0');
  if (fracRaw.length > 2 && /[1-9]/.test(fracRaw.slice(2))) {
    throw new RangeError(`Sub-penny precision encountered in "${raw}"`);
  }
  const pence = BigInt(fracRaw.slice(0, 2));
  return sign * (pounds * 100n + pence);
}

/**
 * Format BigInt pence back into a GBP display string (e.g. "£50,000.00").
 */
export function formatPenceGbp(pence) {
  const neg = pence < 0n ? '-' : '';
  const abs = pence < 0n ? -pence : pence;
  const pounds = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg}£${pounds}.${String(abs % 100n).padStart(2, '0')}`;
}

/**
 * Evaluate UK HMRC Making Tax Digital for Income Tax (MTD ITSA) mandation wave.
 * Qualifying income uses gross turnover before expenses from self-employment and property
 * and triggers when total qualifying income is strictly greater than the threshold.
 */
export function evaluateMtdMandation({
  selfEmploymentGrossGbp = 0,
  ukPropertyGrossGbp = 0,
  foreignPropertyGrossGbp = 0,
} = {}) {
  const selfEmploymentPence = parseGbpPence(selfEmploymentGrossGbp);
  const ukPropertyPence = parseGbpPence(ukPropertyGrossGbp);
  const foreignPropertyPence = parseGbpPence(foreignPropertyGrossGbp);

  if (selfEmploymentPence < 0n || ukPropertyPence < 0n || foreignPropertyPence < 0n) {
    throw new RangeError('Qualifying gross turnover inputs must be non-negative');
  }

  const totalPence = selfEmploymentPence + ukPropertyPence + foreignPropertyPence;
  const matched = WAVE_THRESHOLDS.find((tier) => totalPence > tier.pence);

  return {
    qualifyingIncomeGbp: formatPenceGbp(totalPence),
    selfEmploymentGrossGbp: formatPenceGbp(selfEmploymentPence),
    propertyGrossGbp: formatPenceGbp(ukPropertyPence + foreignPropertyPence),
    wave: matched ? matched.wave : 'BELOW_CURRENT_THRESHOLDS',
    mandationDate: matched ? matched.mandationDate : null,
    thresholdGbp: matched ? matched.thresholdGbp : null,
    baseTaxYear: matched ? matched.baseTaxYear : null,
  };
}

/**
 * Return the four HMRC MTD ITSA quarterly update windows and filing deadlines
 * for standard tax quarters or elected calendar quarters.
 */
export function getMtdQuarters(taxYearStart = 2026, calendarElection = false) {
  const y0 = Number(taxYearStart);
  if (!Number.isInteger(y0) || y0 < 2024 || y0 > 2100) {
    throw new RangeError(`Expected an integer UK tax year start between 2024 and 2100, got "${taxYearStart}"`);
  }
  const y1 = y0 + 1;
  if (calendarElection) {
    return [
      { quarter: 'Q1', mode: 'calendar', periodStart: `${y0}-04-01`, periodEnd: `${y0}-06-30`, filingDeadline: `${y0}-08-07` },
      { quarter: 'Q2', mode: 'calendar', periodStart: `${y0}-07-01`, periodEnd: `${y0}-09-30`, filingDeadline: `${y0}-11-07` },
      { quarter: 'Q3', mode: 'calendar', periodStart: `${y0}-10-01`, periodEnd: `${y0}-12-31`, filingDeadline: `${y1}-02-07` },
      { quarter: 'Q4', mode: 'calendar', periodStart: `${y1}-01-01`, periodEnd: `${y1}-03-31`, filingDeadline: `${y1}-05-07` },
    ];
  }
  return [
    { quarter: 'Q1', mode: 'standard', periodStart: `${y0}-04-06`, periodEnd: `${y0}-07-05`, filingDeadline: `${y0}-08-07` },
    { quarter: 'Q2', mode: 'standard', periodStart: `${y0}-07-06`, periodEnd: `${y0}-10-05`, filingDeadline: `${y0}-11-07` },
    { quarter: 'Q3', mode: 'standard', periodStart: `${y0}-10-06`, periodEnd: `${y1}-01-05`, filingDeadline: `${y1}-02-07` },
    { quarter: 'Q4', mode: 'standard', periodStart: `${y1}-01-06`, periodEnd: `${y1}-04-05`, filingDeadline: `${y1}-05-07` },
  ];
}

/**
 * Audit common HMRC MTD ITSA preparation pitfalls before software or spreadsheet submission.
 */
export function auditMtdReadiness({
  selfEmploymentGrossGbp = 0,
  ukPropertyGrossGbp = 0,
  foreignPropertyGrossGbp = 0,
  cisDeductionsNetted = false,
  usesCalendarQuarters = false,
  hasCalendarElection = false,
  manualCopyPasteBetweenBooks = false,
  taxYearStart = 2026,
} = {}) {
  const mandation = evaluateMtdMandation({ selfEmploymentGrossGbp, ukPropertyGrossGbp, foreignPropertyGrossGbp });
  const quarters = getMtdQuarters(taxYearStart, Boolean(hasCalendarElection));
  const issues = [];

  if (cisDeductionsNetted) {
    issues.push({
      rule: 'cis_net_turnover_trap',
      severity: 'high',
      message: 'Qualifying income must use gross invoice turnover before CIS tax deductions; net bank receipts understate turnover against HMRC thresholds.',
    });
  }

  if (usesCalendarQuarters && !hasCalendarElection) {
    issues.push({
      rule: 'un-elected_calendar_quarters',
      severity: 'high',
      message: 'Software or spreadsheets cut on 1 Apr–30 Jun dates require a valid HMRC calendar quarter election; default tax quarters run 6 Apr–5 Jul.',
    });
  }

  if (manualCopyPasteBetweenBooks) {
    issues.push({
      rule: 'broken_digital_links',
      severity: 'high',
      message: 'Manually retyping or copy-pasting figures between records breaks HMRC digital record-keeping links; use digital imports or formula links.',
    });
  }

  return {
    mandation,
    quarters,
    issueCount: issues.length,
    issues,
    ready: issues.length === 0,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: uk-mtd-itsa-preflight <input.json | --demo>');
    process.exit(1);
  }
  const payload = arg === '--demo'
    ? {
        selfEmploymentGrossGbp: '42500.00',
        ukPropertyGrossGbp: '9600.00',
        cisDeductionsNetted: true,
        usesCalendarQuarters: true,
        hasCalendarElection: false,
      }
    : JSON.parse(readFileSync(arg, 'utf8'));
  const report = auditMtdReadiness(payload);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 2;
}
