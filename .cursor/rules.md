Cursor Project Rules
Project: 3D Asset Marketplace
Version: 1.0
Project Overview
You are assisting in the development of a production-grade international 3D Asset
Marketplace. The platform has three core modules:
1. Marketplace (Sell existing 3D Models)
2. Plugin Store (Sell digital plugins)
3. Custom Project Portal (Clients request custom 3D design work)

Before creating any new file, class, component, serializer, model, service, utility or API:
• Search the existing project.
• Reuse existing implementations whenever possible.
• Do not create duplicate functionality.
• Extend existing modules before creating new ones when appropriate.

This is a commercial production application. Never generate prototype code. Always generate production-ready implementations.
Technology Stack
Frontend
 React 
 Vite 
 TypeScript 
 Tailwind CSS
 React Router 
 TanStack Query
 Zustand
 React Hook Form
 Axios
  React Three Fiber 
 Three.js
Backend
 Python
 Django
 Django REST Framework
 Simple JWT
 Celery
 Redis
Database
 PostgreSQL
Storage
 AWS S3 or Cloudflare R2
Payments
 Stripe  PayPal  Razorpay
Deployment  Docker  Docker Compose  Gunicorn
 Nginx
 Cloudflare
Development Principles
Always:
  Build production-ready code.
  Follow the existing architecture. 
  Keep code modular.
  Reuse existing code before creating new code.
  Prefer maintainability over clever solutions. 
  Explain the implementation plan before generating code.
  Modify only the files required for the requested task. 
 Keep responses focused on the requested feature. 
Never:
  Rewrite unrelated modules.
  Introduce unnecessary dependencies.
  Change the project architecture unless explicitly requested. 
  Generate placeholder implementations. 
  Duplicate business logic. 
  Create unnecessary abstractions.
Folder Structure
Frontend code belongs only inside:
frontend/
Backend code belongs only inside:
backend/
Documentation must never be generated unless requested. 
Do not create new folders unless they fit the existing architecture. 
Django Conventions
Every feature must be its own Django app. 
Example: 
  accounts
  products
  plugins 
  custom_projects
  orders 
  payments 
  downloads 
  reviews 
  wishlist  
  analytics
Each app should contain only the files it actually needs.
 Keep views thin. 
Business logic belongs in service classes or service modules. 
Serializers perform validation. 
Models represent the database. 
Views coordinate requests and responses.
React Conventions
Always use:
  Functional Components
  TypeScript 
  Hooks 
  Reusable Components
Avoid: 
  Class Components  
  Inline styles 
  Duplicate components
Create reusable UI components whenever possible. 


Naming Conventions
React Components
PascalCase
Example:
   ProductCard
   PluginCard
   CustomProjectForm
   Variables
   camelCase
   Functions
   camelCase
   Database Tables
   snake_case
   API URLs
kebab-case
Examples
/api/products/
/api/custom-projects/
/api/plugin-store/


API Standards
Use REST APIs.  
Return JSON only. 
Use proper HTTP methods. 
GET
POST
PUT
PATCH
DELETE
Return proper HTTP status codes.
 Validate all input.
 Never trust frontend data. 


Database Rules
Use PostgreSQL.
 Use UUID primary keys.
 Every model should include: 
 created_at 
 updated_at
Store only metadata inside the database.
Large files must be stored in cloud storage. 
Never store downloadable assets inside PostgreSQL. 


Authentication
Use JWT Authentication.
Support: 
 Registration
 Login
 Refresh Tokens 
 Logout 
 Password Reset
 Email Verification
Always validate permissions on the backend. 
Never trust frontend authorization. 

Payments
Supported gateways: 
   Stripe 
   PayPal 
   Razorpay
Payment flow:
Customer
↓
Checkout
↓
Payment Gateway
↓
Backend Verification
↓
Order Created
↓
Download Permission
Never trust payment confirmation from the frontend. 
Always verify payments server-side. 

Digital Downloads
Downloads are protected resources.
 Always: 
   Verify ownership. 
   Generate signed download URLs. 
   Store download history. 
   Prevent direct access to storage. 

Custom Project Portal
Custom Projects are independent from Marketplace Orders. Workflow:
Customer
↓
Submit Request
↓
Admin Review
↓
Quote
↓
Customer Approval
↓
Payment
↓
Project Starts
↓
Delivery
↓
Download
Do not merge Custom Projects into Marketplace Orders.

Security
Always implement: 
  HTTPS
  JWT Authentication
  Input Validation
  SQL Injection Protection
  XSS Protection
  CSRF Protection (where applicable)  Role-Based Access Control  Environment Variables  Secure Password Hashing
  Secure File Upload Validation
Never expose: 
  Secret Keys 
  API Keys 
  Database Credentials
  Internal Server Paths


Performance
Always:
 Lazy-load pages. 
 Lazy-load 3D models. 
 Optimize images. 
 Use pagination. 
 Optimize database queries. 
 Avoid unnecessary API requests. 

Error Handling
Always:
  Return meaningful error messages. 
  Use proper HTTP status codes. 
  Log unexpected exceptions. 
  Avoid exposing internal implementation details. 

Git
Use Conventional Commits.
 Examples:
 feat: add product API
 feat: implement custom project portal
 fix: correct payment verification
 refactor: simplify order service
 docs: update README.

Before Writing Code
Always:
1. Understand the requested feature. 
2. Explain the implementation plan. 
3. Identify affected files. 
4. Reuse existing architecture. 
5. Generate production-ready code.


After Writing Code
Always summarize: 
 Files created
 Files modified
 Database changes  API endpoints added
 Frontend pages/components added
 Next recommended development step

Final Rule
You are acting as a senior software architect and full-stack engineer for this project. 
Every decision should prioritize:
  Simplicity
  Maintainability
  Security
  Performance  Scalability
  Code Reusability
  Production Readiness
If multiple valid solutions exist, choose the one that best aligns with the existing
project architecture and minimizes long-term maintenance.

Before generating any code:
- Inspect the existing project structure.
- Search for similar implementations.
- Reuse existing components, services, utilities, and APIs.
- Never recreate functionality that already exists.
- Extend existing modules whenever possible.

Never assume project structure.
Always inspect existing files before writing code.
If required information is missing, ask questions instead of making assumptions.

Prefer modifying existing files over creating new ones.
Only create new files when absolutely necessary.

TypeScript Rules
- Never use any.
- Prefer explicit interfaces.
- Use strict typing.
- Avoid type assertions unless necessary.
- Prefer type inference where appropriate.

- Memoize expensive computations.
- Avoid unnecessary re-renders.
- Keep components small.
- Extract business logic into hooks.
- Prefer composition over inheritance.

Frontend API Rules
- Never call Axios directly inside components.
- Create API service modules.
- Keep networking separate from UI.

Never hardcode:
- API URLs
- Secrets
- Storage URLs
- Keys
- Tokens
Always use environment variables.

Use structured logging.
Never leave console.log in production code.
Use proper logging on the backend.
Remove debug statements before completion.


Code should be testable.
Avoid tightly coupled implementations.
Keep business logic independent from framework-specific code.


List endpoints should support:
- page
- page_size
- ordering
- filtering
- searching

Allowed Uploads
- Validate MIME type.
- Validate extension.
- Validate file size.
- Scan metadata.
- Reject dangerous files.


3D Viewer Rules
- Lazy-load models.
- Dispose geometries.
- Dispose materials.
- Dispose textures.
- Use Suspense.
- Compress textures.
- Optimize rendering.
- Minimize draw calls.


State Rules

Global State

- Authentication
- User
- Cart
- Theme

Server State
Use TanStack Query.
Never duplicate server state in Zustand.


Never perform N+1 queries.
Use indexes.
Use select_related.
Use prefetch_related.
Keep migrations reversible.


Use Error Boundaries for unexpected UI failures.
Handle loading, empty, and error states consistently.

Production software should include this.
Accessibility
Use semantic HTML.
Keyboard navigation.
ARIA labels.
Proper focus handling.
Alt text for images.

Keep files focused.
Avoid components larger than 300 lines.
Extract reusable logic.
Keep functions small.

Never modify unrelated features.
Keep commits atomic.
Generate code suitable for pull requests.

Only generate documentation when explicitly requested.
Do not generate README files automatically.

Before completing:
- No TypeScript errors
- No lint errors
- No duplicate code
- No unused imports
- No dead code
- No TODOs
- No placeholders
- No console.log
- Production-ready implementation
