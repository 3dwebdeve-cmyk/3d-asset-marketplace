# PROJECT TESTING STANDARD

## Objective

Every completed feature, bug fix, API, UI change, database change, authentication change,
or infrastructure change MUST be fully tested before completion.

Never assume code works.

Always verify.

---

# Step 1

Run all applicable tests.

## Backend

- Unit Tests
- API Tests
- Integration Tests
- Permission Tests
- Authentication Tests
- Authorization Tests
- Database Tests
- Migration Tests

## Frontend

- Component Tests
- UI Tests
- Form Validation Tests
- Routing Tests
- State Management Tests
- Responsive Tests
- Accessibility Tests
- Browser Compatibility Tests

---

# Step 2

Regression Verification

Introduce one temporary regression.

Confirm at least one test fails.

Restore the original implementation.

Confirm every test passes.

Never skip this step.

---

# Step 3

Security Audit

Check every feature for:

- SQL Injection
- XSS
- CSRF
- SSRF
- Authentication
- Authorization
- Input Validation
- IDOR
- Path Traversal
- File Upload Validation
- File Size Validation
- MIME Validation
- Rate Limiting
- Secure Cookies
- CORS
- CSP
- Security Headers
- JWT Expiration
- Refresh Token Rotation
- Logging
- Secrets
- Sensitive Data Exposure
- Dependency Vulnerabilities

Attempt to exploit each vulnerability.

Confirm exploit fails.

---

# Step 4

API Validation

Verify

- Status Codes
- Response Schema
- Error Messages
- Validation Errors
- Pagination
- Sorting
- Filtering
- Authentication
- Authorization

---

# Step 5

Frontend Review

Verify

- No Console Errors
- No React Warnings
- Loading States
- Empty States
- Error States
- Mobile Layout
- Tablet Layout
- Desktop Layout
- Keyboard Navigation
- Accessibility
- Broken Links
- Image Loading
- Lazy Loading
- Dark Mode (if supported)

---

# Step 6

Database Review

Verify

- Queries Optimized
- No N+1 Queries
- Index Usage
- Transactions
- Constraints
- Foreign Keys
- Cascading Deletes
- Soft Deletes

---

# Step 7

Performance Review

Measure

- Endpoint Response Time
- Query Performance
- Bundle Size
- API Efficiency
- Memory Usage
- Render Performance
- Large Dataset Handling

---

# Step 8

Bug Fixing

Fix every issue discovered.

Repeat testing until

- Zero failing tests
- Zero security vulnerabilities
- Zero console errors
- Zero critical performance problems

---

# Final Report

Always produce the following report.

## Testing Summary

### Tests Executed

-

### Passed

-

### Failed

-

### Security Issues

-

### Security Fixes

-

### Performance Issues

-

### Performance Fixes

-

### Bugs Fixed

-

### Remaining Risks

-

### Overall Readiness

READY
or

NOT READY

Never mark READY if any critical issue remains.