/** Hackathon-only routes (hub + neighbourhood health plan). */

export type HubRoute = { href: string; title: string; hint: string }

export type HubRouteGroup = { label: string; routes: HubRoute[]; footnote?: string }

export const HUB_ROUTE_GROUPS: HubRouteGroup[] = [
  {
    label: 'Hackathon',
    routes: [
      { href: '/nhs', title: 'Home', hint: 'Wallet + optional identity bootstrap' },
      {
        href: '/nhs/neighbourhood-insights',
        title: 'Neighbourhood health plan',
        hint: 'OpenEHR AQL + artificial HES + SNOMED + x402',
      },
      {
        href: '/nhs/hes-scale',
        title: 'HES at scale',
        hint: 'Full AE/OP/APC SQLite + FTS + x402 + Featherless',
      },
      {
        href: '/nhs/snomed-intelligence',
        title: 'SNOMED intelligence',
        hint: 'Snowstorm + SNOMED CT lookup + paid USDC terminology calls',
      },
      {
        href: '/nhs/dmd-intelligence',
        title: 'dm+d intelligence',
        hint: 'NHSBSA dm+d lookup + paid USDC enrichment and summaries',
      },
    ],
  },
]
