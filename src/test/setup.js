import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Stripe modules pull in browser globals at import time and require a key
// to load. In jsdom we never want them to actually run, so stub them out
// for every test file.
vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('@stripe/react-stripe-js/checkout', () => ({
  CheckoutElementsProvider: ({ children }) => children,
  PaymentElement: () => null,
  useCheckout: () => ({ type: 'loading' }),
}))

// jsdom returns null from canvas.getContext('2d') by default, which crashes
// the SignatureCanvas effect. Provide a no-op 2D context for any test that
// renders a canvas.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    setTransform: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    strokeStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
  }))
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,stub')
}
