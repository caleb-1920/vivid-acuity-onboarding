import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import ClientOnboarding from '../ClientOnboarding'

const sampleConfig = {
  clientId: 'test-id-123',
  status: 'pending',
  clientName: 'Test Client',
  businessName: 'Test Biz',
  businessLocation: 'Testville, TS',
  clientEmail: 'client@test.com',
  ownerName: 'Caleb Hingos',
  companyName: 'Vivid Acuity, LLC',
  config: {
    proposalCards: [
      { icon: '🎨', title: 'Logo Card', items: ['Logo item 1', 'Logo item 2'] },
      { icon: '💻', title: 'Web Card', items: ['Web item'] },
    ],
    contractSections: [
      { title: '1. Parties', content: 'Test parties.' },
      { title: '2. Scope', content: 'Test scope.' },
    ],
    pricingLineItems: [
      { label: 'Setup Fee', amount: 100 },
      { label: 'Logo', amount: 200 },
    ],
    projectTotal: 300,
    maintenancePlans: [
      { value: 'none', label: 'None', sub: '', shortLabel: 'No Maintenance', displayPrice: '$0', dueToday: 300, detail: '', followUp: '', coverage: '' },
    ],
    satisfactionGuaranteeMonths: 3,
    revisionsIncluded: 2,
    revisionHourlyRate: 75,
    monthlyMaintenanceStart: 'May 1, 2026',
    annualMaintenanceEnd: 'May 1, 2027',
    monthlyStartIso: '2026-05-01T00:00:00-07:00',
  },
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

afterEach(() => {
  cleanup()
  delete globalThis.fetch
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('ClientOnboarding', () => {
  it('shows the loading state while the config request is pending', () => {
    globalThis.fetch = vi.fn(() => new Promise(() => {})) // never resolves
    render(<ClientOnboarding clientId="abc" />)
    expect(screen.getByText('Loading your onboarding')).toBeInTheDocument()
  })

  it('shows an error when the API returns 404', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: 'Client not found.' }, 404))
    render(<ClientOnboarding clientId="missing" />)
    await waitFor(() => {
      expect(screen.getByText('Client not found.')).toBeInTheDocument()
    })
    expect(screen.getByText('We could not load this onboarding link')).toBeInTheDocument()
  })

  it('renders the proposal step with dynamic content from the loaded config', async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse(sampleConfig))
    render(<ClientOnboarding clientId="test-id-123" />)

    expect(await screen.findByText('Logo Card')).toBeInTheDocument()
    expect(screen.getByText('Web Card')).toBeInTheDocument()
    expect(screen.getByText('Logo item 1')).toBeInTheDocument()
    expect(screen.getByText('Setup Fee')).toBeInTheDocument()
    // Investment table total row
    expect(screen.getByText('$300')).toBeInTheDocument()
    // Header includes the dynamic client + business string
    expect(screen.getByText(/Test Client \/ Test Biz/)).toBeInTheDocument()
  })

  it('shows an error when no clientId is provided', async () => {
    render(<ClientOnboarding clientId="" />)
    await waitFor(() => {
      expect(screen.getByText('No client identifier provided.')).toBeInTheDocument()
    })
  })
})
