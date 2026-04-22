/**
 * Server-side EHRbase (openEHR REST) client — credentials from env only.
 */

function getBaseUrl() {
  const u = process.env.EHRBASE_BASE_URL?.trim()
  return u || 'http://localhost:8080/ehrbase'
}

function getAuthHeader() {
  const user = process.env.EHRBASE_USER?.trim() || 'ehrbase-user'
  const pass = process.env.EHRBASE_PASSWORD?.trim() || 'SuperSecretPassword'
  const b = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64')
  return `Basic ${b}`
}

const EHRBASE_FETCH_TIMEOUT_MS = 4000

function fetchOpts(extra = {}) {
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(EHRBASE_FETCH_TIMEOUT_MS)
      : undefined
  return { ...extra, ...(signal ? { signal } : {}) }
}

/**
 * @param {string} aql
 */
export async function postAqlQuery(aql) {
  const base = getBaseUrl().replace(/\/$/, '')
  const url = `${base}/rest/openehr/v1/query/aql`
  const res = await fetch(
    url,
    fetchOpts({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({ q: aql }),
    }),
  )
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 8000) }
  }
  return { ok: res.ok, status: res.status, body: json }
}

export async function getEhrbaseHealth() {
  const base = getBaseUrl().replace(/\/$/, '')
  const paths = [`${base}/rest/status`, `${base}/rest/ehr`, `${base}/actuator/health`]
  for (const url of paths) {
    try {
      const res = await fetch(
        url,
        fetchOpts({
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: getAuthHeader() },
        }),
      )
      if (res.ok || res.status === 401) {
        return { reachable: true, url, status: res.status }
      }
    } catch (e) {
      /* try next */
    }
  }
  try {
    const res = await fetch(`${base}/rest/status`, fetchOpts({ method: 'GET' }))
    return { reachable: res.ok, url: `${base}/rest/status`, status: res.status }
  } catch (e) {
    return { reachable: false, error: String(e?.message ?? e) }
  }
}
