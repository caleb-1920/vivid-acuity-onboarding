# Vivid Acuity Onboarding

Small Vite + React onboarding flow for collecting a client name, simulated proposal/agreement signatures, and payment details before triggering a notification email through a Vercel serverless function.

## Local Setup

1. Install dependencies with `npm install`.
2. Create a local `.env` file.
3. Add `RESEND_API_KEY=your_resend_api_key`.
4. Add `VITE_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key`.
5. Run the app with `npm run dev`.

## Notes

- The frontend posts onboarding data to `/api/send-email`.
- The API handler expects `RESEND_API_KEY` to be available at runtime.
- The app currently simulates payment completion with a timeout until a Stripe secret key is added on the server.
- This project currently simulates document signatures in the UI and does not provide a legal e-signature workflow.
