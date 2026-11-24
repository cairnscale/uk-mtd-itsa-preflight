# @cairnscale/uk-mtd-itsa-preflight

Zero-dependency exact pence (`BigInt`) helper for **UK HMRC Making Tax Digital for Income Tax (MTD ITSA)** qualifying income thresholds (`> £50,000` April 2026, `> £30,000` April 2027, `> £20,000` April 2028), standard vs calendar quarter boundaries, and CIS gross-vs-net turnover checks.

Interactive local browser tool: [cairnscale.uk/tools/mtd-itsa-preflight/](https://cairnscale.uk/tools/mtd-itsa-preflight/)  
Official HMRC reference: [Using Making Tax Digital for Income Tax (GOV.UK)](https://www.gov.uk/guidance/using-making-tax-digital-for-income-tax)

## Usage

```js
import { auditMtdReadiness, evaluateMtdMandation, getMtdQuarters } from '@cairnscale/uk-mtd-itsa-preflight';

const report = auditMtdReadiness({
  selfEmploymentGrossGbp: '42500.00',
  ukPropertyGrossGbp: '9600.00',
  cisDeductionsNetted: false,
  usesCalendarQuarters: false,
  hasCalendarElection: false,
  manualCopyPasteBetweenBooks: false,
});

console.log(report.mandation, report.ready);
```

```sh
node index.mjs --demo
```

Built by [cairnscale](https://cairnscale.uk/services/xero-cis-reconciliation/) (MIT License).
