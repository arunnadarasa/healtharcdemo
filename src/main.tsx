import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './polyfills'
import './index.css'
import NhsHubApp from './NhsHubApp.tsx'
import NhsNeighbourhoodInsightsApp from './NhsNeighbourhoodInsightsApp.tsx'

const path = window.location.pathname
const isNeighbourhoodInsights = path === '/nhs/neighbourhood-insights'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isNeighbourhoodInsights ? <NhsNeighbourhoodInsightsApp /> : <NhsHubApp />}
  </StrictMode>,
)
