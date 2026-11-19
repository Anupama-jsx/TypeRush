export const baseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://localhost:7244').replace(/\/+$/, '')

export function requireToken() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const session = JSON.parse(storage.getItem('typerush.auth'))
      if (session?.accessToken && new Date(session.expiresAtUtc) > new Date()) return session.accessToken
    } catch { /* Ignore invalid saved sessions. */ }
  }
  expireSession()
  throw new Error('Your session has expired. Please log in again.')
}

function expireSession() {
  localStorage.removeItem('typerush.auth')
  sessionStorage.removeItem('typerush.auth')
  window.dispatchEvent(new Event('typerush:unauthorized'))
}

export async function apiRequest(path, { method = 'GET', body, authenticated = false, signal } = {}) {
  const headers = { Accept: 'application/json, text/plain' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (authenticated) headers.Authorization = `Bearer ${requireToken()}`
  let response
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method, headers, signal, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new Error('Unable to reach TypeRush. Check that the API is running and its HTTPS certificate is trusted.')
  }
  const text = await response.text()
  let result = text
  try { result = text ? JSON.parse(text) : null } catch { /* Plain-text errors are supported. */ }
  if (response.status === 401 && authenticated) {
    expireSession()
    throw new Error('Your session has expired. Please log in again.')
  }
  if (!response.ok) {
    const validation = result?.errors && Object.values(result.errors).flat().join(' ')
    throw new Error(validation || result?.message || result?.detail || result?.title ||
      (typeof result === 'string' && result) || `Request failed (${response.status}). Please try again.`)
  }
  return result
}
