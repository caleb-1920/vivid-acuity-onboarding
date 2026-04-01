# Vivid Acuity Onboarding

Small Vite + React onboarding flow for collecting a client name, simulated proposal/agreement signatures, and payment details before triggering a notification email through a Vercel serverless function.

## Local Setup

1. Install dependencies with `npm install`.
2. Create a local `.env` file.
3. Add `RESEND_API_KEY=your_resend_api_key`.
4. Add `STRIPE_SECRET_KEY=your_stripe_secret_key`.
5. Add `VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key`.
6. Run the app with `npm run dev`.

## Notes

- The frontend posts onboarding data to `/api/send-email`.
- The API handler expects `RESEND_API_KEY` to be available at runtime.
- Stripe Embedded Checkout sessions are created by `/api/create-checkout-session` and verified by `/api/checkout-session`.
- The monthly plan charges `$512` today, including the `$12` domain cost, and starts the recurring `$30/month` subscription on May 1, 2026.
- The annual plan charges `$812` today as a one-time payment, which includes the `$12` domain cost and `$300` annual maintenance.
- This project currently simulates document signatures in the UI and does not provide a legal e-signature workflow.
