import { useEffect, useState } from 'react'
import './AdminDashboard.css'

const ADMIN_KEY_STORAGE = 'vivid-acuity-admin-key'

function readStoredKey() {
  if (typeof window === 'undefined') return ''
  try {
    return window.sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''
  } catch {
    return ''
  }
}

function storeKey(key) {
  if (typeof window === 'undefined') return
  try {
    if (key) window.sessionStorage.setItem(ADMIN_KEY_STORAGE, key)
    else window.sessionStorage.removeItem(ADMIN_KEY_STORAGE)
  } catch {
    /* ignore */
  }
}

async function adminFetch(adminKey, path, options = {}) {
  const headers = { ...(options.headers || {}), 'x-admin-key': adminKey }
  if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  const response = await fetch(path, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const err = new Error(data?.error || `Request failed (${response.status}).`)
    err.status = response.status
    throw err
  }
  return data
}

function formatStatusPill(status) {
  if (status === 'paid') return { label: 'Paid', className: 'pill pill-paid' }
  if (status === 'pending') return { label: 'Awaiting Client', className: 'pill pill-pending' }
  if (status === 'draft') return { label: 'Draft', className: 'pill pill-draft' }
  return { label: status || 'Unknown', className: 'pill' }
}

async function approveClient(adminKey, clientId) {
  return adminFetch(adminKey, '/api/approve-client', {
    method: 'POST',
    body: JSON.stringify({ clientId }),
  })
}

function ClientList({ adminKey, refreshKey, onChanged }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clients, setClients] = useState([])
  const [pendingApprove, setPendingApprove] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')

    adminFetch(adminKey, '/api/list-clients', { method: 'GET' })
      .then((data) => {
        if (!active) return
        setClients(Array.isArray(data?.clients) ? data.clients : [])
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Failed to load clients.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [adminKey, refreshKey])

  const handleApprove = async (clientId) => {
    setPendingApprove(clientId)
    setError('')
    try {
      await approveClient(adminKey, clientId)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Failed to approve client.')
    } finally {
      setPendingApprove(null)
    }
  }

  return (
    <div className="ad-card">
      <div className="ad-card-title">Existing Clients</div>
      {loading && <div className="ad-muted">Loading...</div>}
      {error && <div className="ad-error">{error}</div>}
      {!loading && !error && clients.length === 0 && (
        <div className="ad-muted">No clients yet. Parse a transcript to create one.</div>
      )}
      {!loading && !error && clients.length > 0 && (
        <table className="ad-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Client</th>
              <th>Business</th>
              <th>Plan</th>
              <th>Paid</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.map((client) => {
              const pill = formatStatusPill(client.status)
              const isDraft = client.status === 'draft'
              return (
                <tr key={client.clientId}>
                  <td>
                    <span className={pill.className}>{pill.label}</span>
                  </td>
                  <td>
                    <div className="ad-cell-strong">{client.clientName || '-'}</div>
                    <div className="ad-cell-muted">{client.clientEmail || ''}</div>
                  </td>
                  <td>{client.businessName || '-'}</td>
                  <td>{client.planSelected || '-'}</td>
                  <td>{client.amountPaid ? `$${client.amountPaid}` : '-'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="ad-link-btn"
                        onClick={() => {
                          if (typeof navigator !== 'undefined' && navigator.clipboard) {
                            navigator.clipboard.writeText(client.onboardingUrl).catch(() => {})
                          }
                        }}
                        title={client.onboardingUrl}
                      >
                        Copy URL
                      </button>
                      <a
                        className="ad-link-btn"
                        href={client.onboardingUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {isDraft ? 'Preview' : 'Open'}
                      </a>
                      {isDraft && (
                        <button
                          type="button"
                          className="ad-link-btn"
                          style={{ background: '#eb6611', color: '#fff', borderColor: '#eb6611' }}
                          disabled={pendingApprove === client.clientId}
                          onClick={() => handleApprove(client.clientId)}
                        >
                          {pendingApprove === client.clientId ? 'Approving…' : 'Approve & Activate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TranscriptPanel({ adminKey, onParsed }) {
  const [transcript, setTranscript] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const handleFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      setTranscript(text)
    } catch (err) {
      setError(err.message || 'Failed to read file.')
    }
  }

  const handleParse = async () => {
    if (transcript.trim().length < 50) {
      setError('Transcript is too short.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const data = await adminFetch(adminKey, '/api/parse-transcript', {
        method: 'POST',
        body: JSON.stringify({ transcript }),
      })
      onParsed(data.parsed)
    } catch (err) {
      setError(err.message || 'Parse failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ad-card">
      <div className="ad-card-title">1. Upload Transcript</div>
      <p className="ad-muted">
        Paste the sales-call transcript or upload a .txt file. Claude will extract the client
        configuration into the editable form below.
      </p>
      <textarea
        className="ad-textarea"
        rows={12}
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="Paste transcript text here..."
      />
      <div className="ad-row-actions">
        <label className="ad-file-btn">
          Upload .txt
          <input
            type="file"
            accept=".txt,text/plain"
            onChange={(e) => handleFile(e.target.files?.[0])}
            style={{ display: 'none' }}
          />
        </label>
        <button
          type="button"
          className="ad-btn-primary"
          onClick={handleParse}
          disabled={busy}
        >
          {busy ? 'Parsing...' : 'Parse Transcript'}
        </button>
      </div>
      {error && <div className="ad-error">{error}</div>}
    </div>
  )
}

function ReviewAndCreate({ adminKey, parsed, onCreated, onReset }) {
  const [clientName, setClientName] = useState(parsed?.clientName || '')
  const [businessName, setBusinessName] = useState(parsed?.businessName || '')
  const [businessLocation, setBusinessLocation] = useState(parsed?.businessLocation || '')
  const [clientEmail, setClientEmail] = useState(parsed?.clientEmail || '')
  const [governingState, setGoverningState] = useState(parsed?.governingState || 'Michigan')
  const [configJson, setConfigJson] = useState(JSON.stringify(parsed?.config || {}, null, 2))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warning, setWarning] = useState('')
  const [created, setCreated] = useState(null)

  useEffect(() => {
    setClientName(parsed?.clientName || '')
    setBusinessName(parsed?.businessName || '')
    setBusinessLocation(parsed?.businessLocation || '')
    setClientEmail(parsed?.clientEmail || '')
    setGoverningState(parsed?.governingState || 'Michigan')
    setConfigJson(JSON.stringify(parsed?.config || {}, null, 2))
    setCreated(null)
    setError('')
    setWarning('')

    const iso = parsed?.config?.monthlyStartIso
    if (iso) {
      const startMs = Date.parse(iso)
      const cutoffMs = Date.now() + 48 * 60 * 60 * 1000
      if (Number.isFinite(startMs) && startMs < cutoffMs) {
        setWarning(
          `monthlyStartIso (${iso}) is less than 48 hours from now. Stripe rejects subscription trials in the past — please push it out before creating.`
        )
      }
    }
  }, [parsed])

  const handleCreate = async () => {
    setBusy(true)
    setError('')

    let parsedConfig
    try {
      parsedConfig = JSON.parse(configJson)
    } catch (err) {
      setBusy(false)
      setError(`Config JSON is invalid: ${err.message}`)
      return
    }

    try {
      const data = await adminFetch(adminKey, '/api/create-client', {
        method: 'POST',
        body: JSON.stringify({
          clientName,
          businessName,
          businessLocation,
          clientEmail,
          governingState,
          config: parsedConfig,
        }),
      })
      setCreated(data)
      onCreated?.()
    } catch (err) {
      setError(err.message || 'Failed to create client.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ad-card">
      <div className="ad-card-title">2. Review & Create</div>
      <p className="ad-muted">
        Edit any extraction errors before saving. The config JSON is the full per-client
        configuration that drives the proposal, agreement, pricing, and Stripe checkout.
      </p>

      <div className="ad-grid">
        <label className="ad-field">
          <span>Client Name</span>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} />
        </label>
        <label className="ad-field">
          <span>Business Name</span>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </label>
        <label className="ad-field">
          <span>Business Location</span>
          <input value={businessLocation} onChange={(e) => setBusinessLocation(e.target.value)} />
        </label>
        <label className="ad-field">
          <span>Client Email</span>
          <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
        </label>
        <label className="ad-field">
          <span>Governing State</span>
          <input value={governingState} onChange={(e) => setGoverningState(e.target.value)} />
        </label>
      </div>

      <label className="ad-field">
        <span>Config JSON</span>
        <textarea
          className="ad-textarea ad-mono"
          rows={20}
          value={configJson}
          onChange={(e) => setConfigJson(e.target.value)}
        />
      </label>

      {warning && <div className="ad-warning">{warning}</div>}
      {error && <div className="ad-error">{error}</div>}

      {created && (
        <div className="ad-success">
          <div className="ad-success-title">Draft created. Preview before activating.</div>
          <p className="ad-cell-muted" style={{ marginBottom: 12 }}>
            This URL is currently a <strong>draft</strong>. The client will see "not yet active"
            if they visit it now. Open the preview in this browser (your admin session lets
            you see drafts), then approve below to send it.
          </p>
          <div className="ad-success-row">
            <code>{created.onboardingUrl}</code>
            <a className="ad-btn-secondary" href={created.onboardingUrl} target="_blank" rel="noreferrer">
              Preview
            </a>
            <button
              type="button"
              className="ad-btn-secondary"
              onClick={() => navigator.clipboard?.writeText(created.onboardingUrl)}
            >
              Copy URL
            </button>
          </div>
          <div className="ad-cell-muted" style={{ marginBottom: 12 }}>Client ID: {created.clientId}</div>
          <div className="ad-row-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
            <button
              type="button"
              className="ad-btn-primary"
              disabled={busy || created.approved}
              onClick={async () => {
                setBusy(true)
                setError('')
                try {
                  await approveClient(adminKey, created.clientId)
                  setCreated({ ...created, approved: true })
                  onCreated?.()
                } catch (err) {
                  setError(err.message || 'Approve failed.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              {created.approved ? 'Activated ✓' : busy ? 'Approving…' : 'Approve & Activate'}
            </button>
          </div>
        </div>
      )}

      <div className="ad-row-actions">
        <button type="button" className="ad-btn-secondary" onClick={onReset}>
          Start Over
        </button>
        <button type="button" className="ad-btn-primary" onClick={handleCreate} disabled={busy}>
          {busy ? 'Creating...' : 'Create Onboarding URL'}
        </button>
      </div>
    </div>
  )
}

function PasswordGate({ onUnlock }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    if (!value.trim()) return
    setBusy(true)
    setError('')
    try {
      await adminFetch(value.trim(), '/api/admin-ping', { method: 'GET' })
      onUnlock(value.trim())
    } catch (err) {
      setError(err.status === 401 ? 'Wrong admin key.' : err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ad-gate">
      <form className="ad-card ad-gate-card" onSubmit={submit}>
        <div className="ad-card-title">Admin Access</div>
        <p className="ad-muted">Enter your admin password to continue.</p>
        <input
          type="password"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Password"
          className="ad-gate-input"
        />
        {error && <div className="ad-error">{error}</div>}
        <button type="submit" className="ad-btn-primary" disabled={busy}>
          {busy ? 'Checking...' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}

export default function AdminDashboard() {
  const [adminKey, setAdminKey] = useState(readStoredKey())
  const [parsed, setParsed] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  if (!adminKey) {
    return (
      <PasswordGate
        onUnlock={(key) => {
          storeKey(key)
          setAdminKey(key)
        }}
      />
    )
  }

  return (
    <div className="ad-shell">
      <header className="ad-header">
        <div>
          <div className="ad-eyebrow">Vivid Acuity</div>
          <h1>Client Onboarding Admin</h1>
        </div>
        <button
          type="button"
          className="ad-btn-secondary"
          onClick={() => {
            storeKey('')
            setAdminKey('')
          }}
        >
          Lock
        </button>
      </header>

      <TranscriptPanel adminKey={adminKey} onParsed={setParsed} />

      {parsed && (
        <ReviewAndCreate
          adminKey={adminKey}
          parsed={parsed}
          onCreated={() => setRefreshKey((value) => value + 1)}
          onReset={() => setParsed(null)}
        />
      )}

      <ClientList
        adminKey={adminKey}
        refreshKey={refreshKey}
        onChanged={() => setRefreshKey((value) => value + 1)}
      />
    </div>
  )
}
