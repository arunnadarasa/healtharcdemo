/**
 * Optional [Snowstorm](https://github.com/IHTSDO/snowstorm) FHIR client — terminology server must be running and SNOMED CT loaded for meaningful lookups.
 */
function baseUrl() {
  return (process.env.SNOWSTORM_URL || '').trim().replace(/\/$/, '')
}

export function isSnowstormConfigured() {
  return baseUrl().length > 0
}

/**
 * @returns {Promise<object>}
 */
export async function getSnowstormStatus() {
  const base = baseUrl()
  if (!base) {
    return {
      configured: false,
      note: 'Set SNOWSTORM_URL (e.g. http://localhost:8080) when Snowstorm is running (see docker-compose.snowstorm.yml).',
      docs: 'https://github.com/IHTSDO/snowstorm',
    }
  }
  const probes = [`${base}/actuator/health`, `${base}/`]
  for (const url of probes) {
    try {
      // #region agent log
      fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
        body: JSON.stringify({
          sessionId: '8e1b23',
          runId: 'run-snowstorm-health-1',
          hypothesisId: 'H1_H2',
          location: 'server/snomed/snowstormClient.js:getSnowstormStatus:probe-start',
          message: 'Starting Snowstorm health probe',
          data: { base, probeUrl: url },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 4000)
      const res = await fetch(url, { signal: ac.signal })
      clearTimeout(t)
      let body = null
      const text = await res.text()
      try {
        body = text ? JSON.parse(text) : null
      } catch {
        body = { raw: text.slice(0, 300) }
      }
      if (res.ok || res.status === 401) {
        // #region agent log
        fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
          body: JSON.stringify({
            sessionId: '8e1b23',
            runId: 'run-snowstorm-health-1',
            hypothesisId: 'H3',
            location: 'server/snomed/snowstormClient.js:getSnowstormStatus:probe-success',
            message: 'Snowstorm health probe succeeded',
            data: { probeUrl: url, status: res.status },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        return {
          configured: true,
          reachable: true,
          url: base,
          probe: url,
          status: res.status,
          body,
        }
      }
    } catch (e) {
      // #region agent log
      fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
        body: JSON.stringify({
          sessionId: '8e1b23',
          runId: 'run-snowstorm-health-1',
          hypothesisId: 'H1_H4_H5',
          location: 'server/snomed/snowstormClient.js:getSnowstormStatus:probe-error',
          message: 'Snowstorm health probe failed',
          data: {
            probeUrl: url,
            errorName: e && e.name ? String(e.name) : null,
            errorMessage: e && e.message ? String(e.message) : String(e || ''),
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      /* try next probe */
    }
  }
  return {
    configured: true,
    reachable: false,
    url: base,
    error: 'Snowstorm did not respond to health probes. Is Docker Compose up?',
  }
}

/**
 * FHIR R4 CodeSystem $lookup for SNOMED CT (requires SNOMED content loaded in Snowstorm).
 * @param {string} conceptId - SNOMED concept id (digits only)
 */
export async function fhirLookupSnomedConcept(conceptId) {
  const base = baseUrl()
  if (!base) {
    return { ok: false, status: 503, body: { error: 'SNOWSTORM_URL not set' } }
  }
  const u = new URL(`${base}/fhir/CodeSystem/$lookup`)
  u.searchParams.set('system', 'http://snomed.info/sct')
  u.searchParams.set('code', String(conceptId))
  // #region agent log
  fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
    body: JSON.stringify({
      sessionId: '8e1b23',
      runId: 'run-snomed-system-uri-1',
      hypothesisId: 'H1_H2',
      location: 'server/snomed/snowstormClient.js:fhirLookupSnomedConcept:request',
      message: 'Sending Snowstorm FHIR lookup request',
      data: {
        base,
        conceptId: String(conceptId),
        requestUrl: u.toString(),
        params: { system: u.searchParams.get('system'), code: u.searchParams.get('code'), version: u.searchParams.get('version') },
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  const res = await fetch(u.toString(), {
    headers: {
      Accept: 'application/fhir+json',
      // Snowstorm can reject wildcard language headers (e.g. `*`) on FHIR lookup.
      'Accept-Language': 'en-GB,en;q=0.9',
    },
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 8000) }
  }
  const issue0 =
    json && typeof json === 'object' && Array.isArray(json.issue) && json.issue[0] && typeof json.issue[0] === 'object'
      ? json.issue[0]
      : null
  // #region agent log
  fetch('http://127.0.0.1:7515/ingest/648691d5-c810-40b0-9d90-0cf2caae2fc7', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '8e1b23' },
    body: JSON.stringify({
      sessionId: '8e1b23',
      runId: 'run-snomed-system-uri-1',
      hypothesisId: 'H3_H4',
      location: 'server/snomed/snowstormClient.js:fhirLookupSnomedConcept:response',
      message: 'Received Snowstorm FHIR lookup response',
      data: {
        status: res.status,
        ok: res.ok,
        issueCode: issue0 && typeof issue0.code !== 'undefined' ? String(issue0.code) : null,
        diagnostics: issue0 && typeof issue0.diagnostics === 'string' ? issue0.diagnostics : null,
        error: json && typeof json === 'object' && typeof json.error === 'string' ? json.error : null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
  return { ok: res.ok, status: res.status, body: json }
}
