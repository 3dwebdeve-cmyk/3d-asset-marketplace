3D Asset Marketplace - Development Security
Checklist
1. Authentication & Authorization
• Use JWT access and refresh tokens.
• Hash passwords using Django's built-in password hashing.
• Enable email verification.
• Implement password reset securely.
• Enforce role-based access control (Admin, Customer).
• Never trust frontend permissions.
• Use strong password policies.
2. API Security
• Validate all request data.
• Return proper HTTP status codes.
• Use rate limiting for login and sensitive endpoints.
• Disable debug mode in production.
• Version REST APIs.
• Never expose stack traces.
3. Database Security
• Use PostgreSQL.
• Use parameterized queries/ORM only.
• Do not store plaintext passwords or payment data.
• Back up the database regularly.
• Review migrations before applying.
4. File Upload & Download
• Allow only approved file types.
• Scan uploads if possible.
• Store files in AWS S3 or Cloudflare R2.
• Use signed, time-limited download URLs.
• Never expose storage bucket paths.
5. Payment Security
• Verify every payment server-side.
• Store Stripe secrets in environment variables.
• Generate invoices only after verified payment.
• Log transaction IDs.
6. Frontend Security
• Escape user-generated content.
• Protect against XSS.
• Validate forms client-side and server-side.
• Use HTTPS only.
7. Backend Security
• Enable CSRF protection where applicable.
• Validate permissions in every protected endpoint.
• Log authentication, payment, and admin events.
• Handle exceptions gracefully.
8. Infrastructure
• Use Cloudflare or equivalent CDN.
• Keep dependencies updated.
• Restrict server ports.
• Use Docker for deployment.
9. Monitoring
• Integrate Sentry.
• Monitor logs and server health.
• Set alerts for repeated failed logins.
10. Pre-Deployment Checklist
• DEBUG=False
• HTTPS enabled
• Secrets removed from source code
• Environment variables configured
• Database backup tested
• API endpoints tested
• Payments tested in sandbox
• Security review completed