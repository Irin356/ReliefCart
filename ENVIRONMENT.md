# Environment variables to merge into `.env.local`

# The starter already uses PAYPAL_CLIENT_ID and PAYPAL_SECRET server-side.
PAYPAL_CLIENT_ID=YOUR_SANDBOX_CLIENT_ID
PAYPAL_SECRET=YOUR_SANDBOX_SECRET

# PayPal JavaScript SDK v6 needs the client ID in the browser.
# This is the same Sandbox client ID as PAYPAL_CLIENT_ID; never expose the secret.
NEXT_PUBLIC_PAYPAL_CLIENT_ID=YOUR_SANDBOX_CLIENT_ID
NEXT_PUBLIC_PAYPAL_ENVIRONMENT=sandbox

# Server-side AI and product data keys.
GROQ_API_KEY=YOUR_GROQ_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile
CHANNEL3_API_KEY=YOUR_CHANNEL3_API_KEY

# Supabase server-side only. Do not prefix the service-role key with NEXT_PUBLIC_.
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY

# Optional for the starter's existing AG Studio dashboard:
# AG_STUDIO=YOUR_AG_STUDIO_LICENSE_KEY
# AG_STUDIO_OPENAI_API_KEY=YOUR_OPENAI_KEY
