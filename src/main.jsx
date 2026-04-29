import React from 'react'
import ReactDOM from 'react-dom/client'
import ClientOnboarding from './ClientOnboarding'
import AdminDashboard from './AdminDashboard'
import './ClientOnboarding.css'

const LEGACY_STORAGE_KEY = 'vivid-acuity-onboarding-state'

function clearLegacyStorage() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

function InvalidLink() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        textAlign: 'center',
        color: '#f5f2ee',
        background: '#0a0a0c',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: '#eb6611',
            marginBottom: 12,
          }}
        >
          Vivid Acuity
        </div>
        <h1 style={{ fontSize: 22, marginBottom: 12 }}>Invalid Link</h1>
        <p style={{ color: '#b0a898', lineHeight: 1.6, fontSize: 14 }}>
          This onboarding link is missing a client identifier or it has expired. Please use the
          personalized link your contact at Vivid Acuity sent you. If you believe this is a
          mistake, reply to that email and we will get you a fresh link right away.
        </p>
      </div>
    </div>
  )
}

function pickRoute() {
  if (typeof window === 'undefined') return { kind: 'invalid' }
  const url = new URL(window.location.href)
  const pathname = url.pathname.replace(/\/+$/, '') || '/'

  if (pathname === '/admin') return { kind: 'admin' }

  const clientId = (url.searchParams.get('client') || '').trim()
  if (clientId) return { kind: 'client', clientId }

  return { kind: 'invalid' }
}

const route = pickRoute()
clearLegacyStorage()

const root = ReactDOM.createRoot(document.getElementById('root'))

if (route.kind === 'admin') {
  root.render(
    <React.StrictMode>
      <AdminDashboard />
    </React.StrictMode>
  )
} else if (route.kind === 'client') {
  root.render(
    <React.StrictMode>
      <ClientOnboarding clientId={route.clientId} />
    </React.StrictMode>
  )
} else {
  root.render(
    <React.StrictMode>
      <InvalidLink />
    </React.StrictMode>
  )
}
