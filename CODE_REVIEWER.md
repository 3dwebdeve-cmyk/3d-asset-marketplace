# CODE_REVIEWER.md

# AI Code Review Standard

## Objective

Review every code change before it is considered complete.

The review must be evidence-based.

Do not guess.

Do not invent issues.

If something cannot be verified statically, clearly state that runtime verification is required.

---

# Step 1 — Understand the Change

Identify:

- Files modified
- Files created
- Files deleted
- APIs added
- Components added
- Models added
- Database changes
- Environment changes
- Dependencies added
- Configuration changes

Provide a summary of what the feature actually does.

---

# Step 2 — New Code Analysis

For every new file or function report

- Purpose
- Responsibilities
- Complexity
- Dependencies
- Public interfaces
- Possible side effects

Example

Function:
AuthenticationService.login()

Purpose:
Authenticates users.

Complexity:
Low

Dependencies:
JWT
Database
Redis

Potential Risks:
Missing rate limiting.

---

# Step 3 — Code Reuse Analysis

Identify reused code.

For every reused section specify

Existing Location

New Location

Reuse Type

- Direct reuse
- Shared utility
- Wrapper
- Duplicate
- Partial duplicate

Estimate duplicate percentage.

Flag

GOOD

OR

Needs Refactoring

Identify opportunities to move duplicated code into

- utilities
- shared hooks
- services
- middleware
- reusable components

---

# Step 4 — Architecture Review

Verify

Single Responsibility

Open Closed Principle

Dependency Injection

Loose Coupling

High Cohesion

Layer Separation

Business Logic Placement

API Design

Folder Structure

Naming Consistency

State Management

Database Design

Rate each

Excellent

Good

Fair

Poor

---

# Step 5 — Bug Detection

Statically inspect for

Null references

Undefined variables

Incorrect imports

Missing exports

Infinite loops

Race conditions

Memory leaks

Unreachable code

Dead code

Unused variables

Circular imports

Async issues

Promise handling

Transaction failures

Migration issues

Broken routes

Missing validations

Broken state updates

Incorrect dependency arrays

Incorrect event cleanup

Timezone bugs

Floating point precision

Pagination bugs

Sorting bugs

Filtering bugs

Edge cases

For each issue report

Severity

Critical

High

Medium

Low

Reason

Impact

Suggested Fix

Confidence

High

Medium

Low

---

# Step 6 — Runtime Failure Prediction

Predict failures that may occur during execution.

Examples

Application crash

500 Internal Server Error

404

401

403

Database exception

Integrity error

Constraint violation

Network timeout

Redis failure

Storage failure

Cloudflare R2 failure

S3 failure

Authentication failure

JWT failure

Frontend rendering failure

Hydration mismatch

React crash

State corruption

Infinite re-render

Browser compatibility issue

Large file upload failure

Memory exhaustion

Bundle loading failure

For each predicted runtime issue include

Likelihood

Trigger

Impact

Fix

---

# Step 7 — Performance Review

Review

Algorithm complexity

Database queries

Repeated queries

N+1 queries

Indexes

Caching opportunities

Repeated API calls

Rendering efficiency

React re-renders

Bundle size

Lazy loading

Memoization

Pagination

Search efficiency

File upload efficiency

Streaming

Memory usage

CPU usage

Network usage

For every optimisation include

Current implementation

Suggested improvement

Estimated benefit

---

# Step 8 — Security Review

Review

SQL Injection

XSS

CSRF

SSRF

Authentication

Authorization

JWT

Refresh Tokens

Secure Cookies

Rate Limiting

Secrets

Sensitive Data

IDOR

Path Traversal

Input Validation

Output Encoding

CORS

Security Headers

File Upload

MIME Validation

File Size Validation

Dependency Vulnerabilities

Logging

Privilege Escalation

Command Injection

---

# Step 9 — Maintainability

Evaluate

Readability

Consistency

Naming

Comments

Documentation

Testability

Modularity

Scalability

Reusability

Extensibility

Technical Debt

---

# Step 10 — Best Practices

Check

Error handling

Logging

Retry mechanisms

Graceful degradation

Fallbacks

Validation

Type safety

Constants

Magic numbers

Configuration

Environment variables

Feature flags

---

# Step 11 — AI Generated Code Review

Estimate

Percentage written by AI

Percentage customised

Percentage duplicated

Potential hallucinated code

Placeholder logic

Unused generated code

Incomplete implementations

Suspicious patterns

---

# Step 12 — Optimisation Score

Rate

Architecture

__/10

Backend

__/10

Frontend

__/10

Security

__/10

Performance

__/10

Maintainability

__/10

Scalability

__/10

Code Reuse

__/10

Documentation

__/10

Testing Readiness

__/10

Overall

__/100

---

# Step 13 — Review Report

Always produce this report.

# Code Review Report

## Files Reviewed

-

## New Files

-

## Modified Files

-

## Deleted Files

-

## New Code Summary

-

## Reused Code

-

## Duplicate Code

-

## Architecture Issues

-

## Bugs Found

-

## Runtime Crash Risks

-

## Security Issues

-

## Performance Issues

-

## Optimisation Suggestions

-

## Refactoring Suggestions

-

## Technical Debt

-

## Overall Code Quality

Excellent

Good

Fair

Poor

## Optimisation Score

__/100

## Production Readiness

READY

or

NOT READY

Never mark READY if a Critical issue exists.

Never claim code executes successfully unless it has actually been run.

Always distinguish between:

✓ Verified by execution

⚠ Predicted by static analysis

? Unable to verify without runtime testing