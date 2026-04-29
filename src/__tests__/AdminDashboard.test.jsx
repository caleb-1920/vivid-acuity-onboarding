import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminDashboard from '../AdminDashboard'

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function makeFetchRouter(routes) {
  return vi.fn(async (input, init) => {
    const url = typeof input === 'string' ? input : input.url
    const method = (init?.method || 'GET').toUpperCase()
    const key = `${method} ${url.split('?')[0]}`

    const handler = routes[key]
    if (!handler) {
      throw new Error(`Unhandled fetch in test: ${key}`)
    }
    return handler(init)
  })
}

const sampleParsed = {
  clientName: 'Parsed Client',
  businessName: 'Parsed Biz',
  businessLocation: 'Parsedville',
  clientEmail: 'parsed@test.com',
  governingState: 'Michigan',
  config: {
    proposalCards: [{ icon: '🎨', title: 'Logo', items: ['Logo item'] }],
    pricingLineItems: [{ label: 'Setup Fee', amount: 100 }],
    projectTotal: 100,
    maintenancePlans: [
      { value: 'none', label: 'None', sub: '', shortLabel: 'None', displayPrice: '$0', dueToday: 100, detail: '', followUp: '', coverage: '' },
    ],
    contractSections: [{ title: '1. Parties', content: '...' }],
    satisfactionGuaranteeMonths: 3,
    revisionsIncluded: 2,
    revisionHourlyRate: 75,
    monthlyMaintenanceStart: 'May 1, 2030',
    annualMaintenanceEnd: 'May 1, 2031',
    monthlyStartIso: '2030-05-01T00:00:00-07:00',
  },
}

beforeEach(() => {
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  delete globalThis.fetch
})

describe('AdminDashboard', () => {
  it('shows the password gate when no admin key is stored', () => {
    globalThis.fetch = vi.fn()
    render(<AdminDashboard />)
    expect(screen.getByText('Admin Access')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeInTheDocument()
  })

  it('shows "Wrong admin key" when the gate request returns 401', async () => {
    const user = userEvent.setup()
    globalThis.fetch = makeFetchRouter({
      'GET /api/list-clients': () => jsonResponse({ error: 'Unauthorized.' }, 401),
    })

    render(<AdminDashboard />)
    await user.type(screen.getByPlaceholderText('Password'), 'wrong-key')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByText('Wrong admin key.')).toBeInTheDocument()
  })

  it('unlocks and renders the main dashboard panels with client rows', async () => {
    const user = userEvent.setup()
    globalThis.fetch = makeFetchRouter({
      'GET /api/list-clients': () =>
        jsonResponse({
          clients: [
            {
              clientId: 'a-1',
              status: 'paid',
              clientName: 'Alice',
              clientEmail: 'a@x.com',
              businessName: 'Alice Biz',
              planSelected: 'monthly',
              amountPaid: '512.00',
              onboardingUrl: 'https://example.com/?client=a-1',
            },
            {
              clientId: 'b-2',
              status: 'pending',
              clientName: 'Bob',
              clientEmail: 'b@x.com',
              businessName: 'Bob Biz',
              planSelected: '',
              amountPaid: '',
              onboardingUrl: 'https://example.com/?client=b-2',
            },
          ],
        }),
    })

    render(<AdminDashboard />)
    await user.type(screen.getByPlaceholderText('Password'), 'right-key')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    expect(await screen.findByText('1. Upload Transcript')).toBeInTheDocument()
    expect(screen.getByText('Existing Clients')).toBeInTheDocument()
    expect(await screen.findByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    // "Paid" appears as both a column header (<th>Paid</th> for amount paid) and
    // the status pill for Alice — assert on the pill specifically.
    const paidPill = screen
      .getAllByText('Paid')
      .find((el) => el.classList.contains('pill-paid'))
    expect(paidPill).toBeDefined()
    expect(screen.getByText('Awaiting Client')).toBeInTheDocument()
  })

  it('lock button returns to the password gate', async () => {
    const user = userEvent.setup()
    globalThis.fetch = makeFetchRouter({
      'GET /api/list-clients': () => jsonResponse({ clients: [] }),
    })
    render(<AdminDashboard />)
    await user.type(screen.getByPlaceholderText('Password'), 'right-key')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    await screen.findByText('1. Upload Transcript')
    await user.click(screen.getByRole('button', { name: 'Lock' }))

    expect(screen.getByText('Admin Access')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
  })

  it('parses a transcript and surfaces the review panel with the parsed client name', async () => {
    const user = userEvent.setup()
    globalThis.fetch = makeFetchRouter({
      'GET /api/list-clients': () => jsonResponse({ clients: [] }),
      'POST /api/parse-transcript': () => jsonResponse({ parsed: sampleParsed }),
    })

    render(<AdminDashboard />)
    await user.type(screen.getByPlaceholderText('Password'), 'right-key')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    const textarea = await screen.findByPlaceholderText(/Paste transcript text/)
    await user.type(textarea, 'A'.repeat(120))
    await user.click(screen.getByRole('button', { name: 'Parse Transcript' }))

    expect(await screen.findByText('2. Review & Create')).toBeInTheDocument()
    // The review form pre-fills inputs with the parsed values.
    expect(screen.getByDisplayValue('Parsed Client')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Parsed Biz')).toBeInTheDocument()
  })

  it('surfaces the monthlyStartIso warning when start is less than 48h away', async () => {
    const user = userEvent.setup()
    const soon = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    const tooSoonParsed = {
      ...sampleParsed,
      config: { ...sampleParsed.config, monthlyStartIso: soon },
    }

    globalThis.fetch = makeFetchRouter({
      'GET /api/list-clients': () => jsonResponse({ clients: [] }),
      'POST /api/parse-transcript': () => jsonResponse({ parsed: tooSoonParsed }),
    })

    render(<AdminDashboard />)
    await user.type(screen.getByPlaceholderText('Password'), 'right-key')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    const textarea = await screen.findByPlaceholderText(/Paste transcript text/)
    await user.type(textarea, 'A'.repeat(120))
    await user.click(screen.getByRole('button', { name: 'Parse Transcript' }))

    expect(
      await screen.findByText(/less than 48 hours from now/i)
    ).toBeInTheDocument()
  })

  it('shows "Transcript is too short" when the textarea has < 50 characters', async () => {
    const user = userEvent.setup()
    globalThis.fetch = makeFetchRouter({
      'GET /api/list-clients': () => jsonResponse({ clients: [] }),
    })

    render(<AdminDashboard />)
    await user.type(screen.getByPlaceholderText('Password'), 'right-key')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))

    const textarea = await screen.findByPlaceholderText(/Paste transcript text/)
    await user.type(textarea, 'too short')
    await user.click(screen.getByRole('button', { name: 'Parse Transcript' }))

    expect(screen.getByText('Transcript is too short.')).toBeInTheDocument()
  })
})
