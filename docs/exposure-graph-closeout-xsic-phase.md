# Exposure Graph Closeout (Current XSIC Phase)

## Status

Exposure Graph is declared **done for the current XSIC phase**.
This closeout records completion scope, Definition of Done (DoD), intentional constraints, and deferred follow-up work so the next app phase can proceed without ambiguity.

## Definition of Done (DoD) Check

- [x] Exposure Graph scope for current phase is implemented and reviewed.
- [x] Core user-facing sections are present and integrated in the current page shell.
- [x] Mobile wrapping QA fix is included for current-phase quality bar.
- [x] Intentional architectural limits are documented (bounded graph + lightweight rendering strategy).
- [x] Post-phase enhancements are explicitly separated as future work.

## Completed in This Phase

The following items are complete for the current XSIC phase:

1. **live Risk**
2. **live Exposure**
3. **presets**
4. **URL state**
5. **Overall Summary**
6. **Legend**
7. **Methods/help**
8. **mobile wrapping QA fix**

## Intentional Constraints (By Design)

The following are intentional constraints for the current phase (not defects):

- **bounded top counterparties only**
- **lightweight SVG only**
- **no heavy graph engine**
- **summary is bounded / partial-visibility aware**

These constraints were selected to keep rendering predictable, maintainable, and performant within current XSIC phase scope.

## Deferred / Later Work (Out of Current Completion)

The following are explicitly deferred to later phases:

- **richer entity labeling**
- **deeper clustering**
- **historical exposure timeline**
- **automated browser QA in a stable environment**

## Closeout Decision

- Exposure Graph is **complete for current XSIC phase**.
- Deferred items are clearly out of current Done criteria.
- Next application work may proceed with this closeout as the fixed phase boundary.
