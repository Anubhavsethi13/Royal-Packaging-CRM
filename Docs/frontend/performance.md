# Frontend Performance

The Phase 5 performance gate uses the production Vite build and browser smoke timings rather than speculative optimization.

## Current Observations

- The production client bundle is approximately 481 kB before gzip and approximately 142 kB gzip in the current build.
- The app uses one frontend entry bundle. Route-level lazy loading is not yet justified by the current preview data size and should be reconsidered when real API modules and larger screens arrive.
- Mock records are repository-backed and small; list filtering is local and remains inexpensive at the current scale.
- A narrow dashboard overflow caused cards to inherit the table minimum width. The shared dashboard grid now sets `min-width: 0`, keeping overflow inside the table wrapper.

## Build Warnings

Vite/Rollup reports two dependency-generated annotation warnings from Zod and an outDir notice because `dist/frontend` is outside the frontend project root. They do not originate in project code and do not fail the build. They should be reassessed when the build output layout or Zod version changes.

## Deferred Optimization

Do not add memoization, route splitting, or new caching layers without a measured regression. The future API boundary is the natural point to introduce query caching and route-level loading states.
