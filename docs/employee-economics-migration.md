# Employee economics save migration

The employee contract model now has a single deterministic market-band source
of truth. The migration runs after legacy employee skills are restored, because
quality is one of the visible salary inputs.

## Inputs and compatibility

Each employee's monthly band is calculated from only four player-visible values:
role, quality, experience, and the employing scout's reputation. Existing valid
salaries remain unchanged. Missing `paySatisfaction` receives a deterministic
default from the employee's current pay position.

Invalid legacy salaries—including the former £1 strategy, negative values,
non-finite values, and contracts beyond the market ceiling—are moved to the
nearest allowed contract boundary. No cash is added or removed by migration. Every repaired
wage is recorded as a zero-value `Contract normalized` entry in the existing
finance ledger, including its old and new monthly value.

The migration is idempotent: after the first normalization, loading the same
save again produces neither another contract change nor another ledger entry.

## Payroll behavior

Employee salary is paid every four weeks, matching the existing monthly finance
cycle. Payroll is itemized by employee in the transaction ledger. The remaining
non-payroll costs stay in `Monthly operating expenses`, so cash changes still
reconcile exactly to the sum of transactions.

Each monthly finance cycle has stable `referenceId` values. Reprocessing the
same season/week returns the existing record without charging payroll, operating
expenses, loan interest, stipend, or difficulty adjustments a second time.
Employee lifecycle processing separately persists its last processed season/week,
so the same weekly tick cannot change satisfaction, morale, retention, or output
twice after a save/reload or manual/batch replay.

## Design consequences

- Under-market pay is allowed down to the visible floor and saves cash, but lowers
  pay satisfaction, morale, output, retention, and resistance to poaching.
- Fair pay is the stable middle option.
- Premium pay improves retention and output within strict caps; it cannot replace
  quality, assignments, morale, or fatigue management.
- Renegotiation outside the visible contract band fails closed. Every accepted wage
  change is a zero-value audit entry, while each later wage payment is a real
  negative cash transaction.
