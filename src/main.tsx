import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './polyfills'
import './index.css'
import NhsHubApp from './NhsHubApp.tsx'
import NhsHesScaleApp from './NhsHesScaleApp.tsx'
import NhsNeighbourhoodInsightsApp from './NhsNeighbourhoodInsightsApp.tsx'
import NhsSnomedIntelligenceApp from './NhsSnomedIntelligenceApp.tsx'
import NhsDmdIntelligenceApp from './NhsDmdIntelligenceApp.tsx'
import NhsUkDataMarketplaceApp from './NhsUkDataMarketplaceApp.tsx'
import NhsCdrApp from './NhsCdrApp.tsx'

const path = window.location.pathname
let page: 'hub' | 'neighbourhood' | 'hesscale' | 'snomed' | 'dmd' | 'nhsuk' | 'cdr' = 'hub'
if (path === '/nhs/neighbourhood-insights') page = 'neighbourhood'
else if (path === '/nhs/hes-scale') page = 'hesscale'
else if (path === '/nhs/snomed-intelligence') page = 'snomed'
else if (path === '/nhs/dmd-intelligence') page = 'dmd'
else if (path === '/nhs/uk-dataset-lane') page = 'nhsuk'
else if (path === '/nhs/cdr') page = 'cdr'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page === 'neighbourhood' ? (
      <NhsNeighbourhoodInsightsApp />
    ) : page === 'hesscale' ? (
      <NhsHesScaleApp />
    ) : page === 'snomed' ? (
      <NhsSnomedIntelligenceApp />
    ) : page === 'dmd' ? (
      <NhsDmdIntelligenceApp />
    ) : page === 'nhsuk' ? (
      <NhsUkDataMarketplaceApp />
    ) : page === 'cdr' ? (
      <NhsCdrApp />
    ) : (
      <NhsHubApp />
    )}
  </StrictMode>,
)
