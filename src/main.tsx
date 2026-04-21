import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './polyfills'
import './index.css'
import NhsHubApp from './NhsHubApp.tsx'
import NhsHesScaleApp from './NhsHesScaleApp.tsx'
import NhsNeighbourhoodInsightsApp from './NhsNeighbourhoodInsightsApp.tsx'

const path = window.location.pathname
let page: 'hub' | 'neighbourhood' | 'hesscale' = 'hub'
if (path === '/nhs/neighbourhood-insights') page = 'neighbourhood'
else if (path === '/nhs/hes-scale') page = 'hesscale'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {page === 'neighbourhood' ? (
      <NhsNeighbourhoodInsightsApp />
    ) : page === 'hesscale' ? (
      <NhsHesScaleApp />
    ) : (
      <NhsHubApp />
    )}
  </StrictMode>,
)
