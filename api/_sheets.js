import crypto from 'node:crypto'

const SHEET_TAB = process.env.GOOGLE_SHEETS_TAB_NAME || 'Sheet1'
const SHEET_RANGE = `${SHEET_TAB}!A:Q`
const HEADER_RANGE = `${SHEET_TAB}!A1:Q1`

export const COLUMNS = [
  'client_id',
  'status',
  'created_at',
  'paid_at',
  'client_name',
  'business_name',
  'business_location',
  'client_email',
  'owner_name',
  'company_name',
  'plan_selected',
  'amount_paid',
  'stripe_session_id',
  'proposal_signed_at',
  'contract_signed_at',
  'onboarding_url',
  'config_json',
]

let cachedToken = null

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function getPrivateKey() {
  const raw = process.env.GOOGLE_PRIVATE_KEY
  if (!raw) throw new Error('GOOGLE_PRIVATE_KEY is not configured.')
  // Vercel often stores newlines as the literal sequence \n. Convert back to real newlines.
  return raw.replace(/\\n/g, '\n')
}

function getServiceAccountEmail() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not configured.')
  return email
}

function getSpreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SHEET_ID
  if (!id) throw new Error('GOOGLE_SHEETS_SHEET_ID is not configured.')
  return id
}

async function fetchAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const payload = {
    iss: getServiceAccountEmail(),
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const signer = crypto.createSign('RSA-SHA256')
  signer.update(signingInput)
  signer.end()
  const signature = signer.sign(getPrivateKey())
  const encodedSignature = signature
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  const assertion = `${signingInput}.${encodedSignature}`

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data?.error_description || data?.error || 'Unknown error'
    throw new Error(`Google token exchange failed: ${detail}`)
  }

  if (!data.access_token) {
    throw new Error('Google token exchange did not return an access_token.')
  }

  return {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in || 3600) - 60,
  }
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000)
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.token
  }

  cachedToken = await fetchAccessToken()
  return cachedToken.token
}

async function sheetsRequest(path, options = {}) {
  const token = await getAccessToken()
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(getSpreadsheetId())}${path}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const detail = data?.error?.message || `HTTP ${response.status}`
    throw new Error(`Google Sheets API error: ${detail}`)
  }
  return data
}

function recordToRow(record) {
  return COLUMNS.map((col) => {
    const value = record[col]
    if (value === undefined || value === null) return ''
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  })
}

function rowToRecord(row) {
  const record = {}
  COLUMNS.forEach((col, idx) => {
    record[col] = row[idx] ?? ''
  })
  if (record.config_json) {
    try {
      record.config = JSON.parse(record.config_json)
    } catch {
      record.config = null
    }
  } else {
    record.config = null
  }
  return record
}

export async function ensureHeaderRow() {
  const data = await sheetsRequest(`/values/${encodeURIComponent(HEADER_RANGE)}`)
  const existing = (data.values && data.values[0]) || []
  const matches =
    existing.length === COLUMNS.length && existing.every((value, idx) => value === COLUMNS[idx])
  if (matches) return

  await sheetsRequest(
    `/values/${encodeURIComponent(HEADER_RANGE)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ range: HEADER_RANGE, values: [COLUMNS] }),
    }
  )
}

export async function appendClientRow(record) {
  await ensureHeaderRow()
  const row = recordToRow(record)
  await sheetsRequest(
    `/values/${encodeURIComponent(SHEET_RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      body: JSON.stringify({ values: [row] }),
    }
  )
}

export async function readAllClients() {
  const data = await sheetsRequest(`/values/${encodeURIComponent(SHEET_RANGE)}`)
  const rows = data.values || []
  if (rows.length <= 1) return []
  return rows.slice(1).map(rowToRecord).filter((record) => record.client_id)
}

export async function findClientById(clientId) {
  if (!clientId) return null
  const all = await readAllClients()
  return all.find((record) => record.client_id === clientId) || null
}

export async function updateClientById(clientId, updates) {
  if (!clientId) throw new Error('clientId is required.')
  const data = await sheetsRequest(`/values/${encodeURIComponent(SHEET_RANGE)}`)
  const rows = data.values || []
  if (rows.length <= 1) throw new Error('No client rows found.')

  let rowIndex = -1
  for (let i = 1; i < rows.length; i += 1) {
    if (rows[i][0] === clientId) {
      rowIndex = i
      break
    }
  }
  if (rowIndex === -1) throw new Error(`Client ${clientId} not found in sheet.`)

  const existing = rows[rowIndex]
  const merged = { ...rowToRecord(existing), ...updates }
  if (updates.config && typeof updates.config === 'object') {
    merged.config_json = JSON.stringify(updates.config)
  }
  delete merged.config

  const newRow = recordToRow(merged)
  const sheetRowNumber = rowIndex + 1
  const targetRange = `${SHEET_TAB}!A${sheetRowNumber}:Q${sheetRowNumber}`

  await sheetsRequest(
    `/values/${encodeURIComponent(targetRange)}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({ range: targetRange, values: [newRow] }),
    }
  )

  return merged
}
