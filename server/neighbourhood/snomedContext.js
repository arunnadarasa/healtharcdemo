/**
 * SNOMED CT reference concepts for neighbourhood health + AE (artificial HES) demo.
 * Use the SNOMED International Browser to explore codes: https://browser.ihtsdotools.org/
 * Organisation tooling: https://github.com/IHTSDO
 */

const BROWSER_BASE = 'https://browser.ihtsdotools.org/?perspective=full&conceptId1='

/** @param {string} conceptId */
export function snomedBrowserUrl(conceptId) {
  return `${BROWSER_BASE}${encodeURIComponent(conceptId)}`
}

/**
 * Curated SNOMED CT (International) concepts aligned with emergency / neighbourhood care narratives.
 * Terms are indicative — verify in the browser for your edition.
 */
export const SNOMED_NEIGHBOURHOOD_AND_AE = [
  {
    conceptId: '50849002',
    term: 'Emergency department patient visit',
    useCase: 'Encounter-type context for artificial HES AE attendance aggregates.',
  },
  {
    conceptId: '4525004',
    term: 'Emergency medical care',
    useCase: 'Procedure / care pathway language for neighbourhood team handoff stories.',
  },
  {
    conceptId: '308752009',
    term: 'Discharge from emergency department',
    useCase: 'Care transition — useful when linking openEHR discharge compositions to PHM.',
  },
  {
    conceptId: '444910001',
    term: 'Attendance at accident and emergency department',
    useCase: 'UK-aligned encounter; cross-check in browser for International edition.',
  },
]

export function snomedReferencesWithUrls() {
  return SNOMED_NEIGHBOURHOOD_AND_AE.map((r) => ({
    ...r,
    browserUrl: snomedBrowserUrl(r.conceptId),
  }))
}

/**
 * @param {{ snowstorm?: object }} [opts]
 */
export function getIntegrationContext(opts = {}) {
  const snowstorm = opts.snowstorm
  return {
    openEhr: {
      summary:
        'Clinical data access via openEHR (EHRbase) AQL through the server BFF — credentials never ship to the browser.',
      bffPaths: ['/api/openehr/query/aql', '/api/openehr/health'],
    },
    payments: {
      summary: 'USDC nanopayments on Arc Testnet via HTTP 402 / x402 (Circle Gateway or thirdweb facilitator).',
      chainId: 5042002,
      currency: 'USDC',
    },
    sampleData: {
      summary:
        'Synthetic NHS artificial HES (AE/OP/APC) ingested to SQLite for LSOA aggregates — not for clinical assurance.',
      ingest: 'npm run ingest:hes',
    },
    snomedCt: {
      summary:
        'SNOMED CT codes support semantic interoperability; browse and validate concepts in the official browser.',
      browser: 'https://browser.ihtsdotools.org/',
      ihtsdoGithub: 'https://github.com/IHTSDO',
      snowstorm: {
        repo: 'https://github.com/IHTSDO/snowstorm',
        dockerCompose: 'docker compose -f docker-compose.snowstorm.yml up -d',
        env: 'SNOWSTORM_URL=http://localhost:8081',
        apiPaths: ['/api/snomed/health', '/api/snomed/lookup/:conceptId'],
        fhir: 'FHIR R4 CodeSystem $lookup against http://snomed.info/sct (requires SNOMED RF2 loaded in Snowstorm).',
        status: snowstorm ?? undefined,
      },
    },
    references: snomedReferencesWithUrls(),
  }
}
