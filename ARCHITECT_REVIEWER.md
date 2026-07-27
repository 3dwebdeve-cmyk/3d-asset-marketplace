# ARCHITECT_REVIEWER.md

# AI Architecture Review Standard

## Objective

Review the overall software architecture before approving any feature,
refactor, infrastructure change, or production deployment.

Review the entire system.

Never review only the modified file.

Evaluate how the change affects the project as a whole.

Never approve architecture that introduces unnecessary complexity,
tight coupling, duplicated systems, or future scalability problems.

If something cannot be verified statically, clearly mark it as requiring
runtime or infrastructure validation.

---

# Step 1 — Feature Impact Analysis

Identify

- Purpose of the change
- Problem being solved
- Scope of impact
- Business value
- Technical value

Determine

- Which modules are affected
- Which services are affected
- Which APIs are affected
- Which database tables are affected
- Which frontend pages are affected
- Which infrastructure is affected

Estimate

Low

Medium

High

Architectural Impact

---

# Step 2 — Project Structure Review

Verify folder organisation.

Review

Frontend

Backend

Database

Configuration

Infrastructure

Assets

Scripts

Testing

Documentation

Check for

Unused folders

Incorrect placement

Duplicate modules

Circular dependencies

Poor separation

Rate

Excellent

Good

Fair

Poor

---

# Step 3 — Architecture Principles

Verify

Single Responsibility Principle

Open Closed Principle

Liskov Substitution

Interface Segregation

Dependency Inversion

Loose Coupling

High Cohesion

Domain Separation

Business Logic Separation

Presentation Separation

Infrastructure Separation

Rate every principle.

---

# Step 4 — Backend Architecture Review

Review

Django Apps

REST API Design

Service Layer

Repository Pattern

Serializer Design

Permissions

Authentication

Authorization

Caching

Signals

Middleware

Exception Handling

Logging

Transactions

Background Jobs

File Storage

Cloudflare R2 Integration

Payment Flow

Database Layer

Identify

Missing abstractions

Fat views

Fat serializers

Business logic in views

Business logic in models

Code duplication

Tight coupling

---

# Step 5 — Frontend Architecture Review

Review

React Components

Component Hierarchy

Routing

Protected Routes

State Management

Context Usage

Hooks

Reusable Components

Layouts

Theme System

Forms

Validation

Three.js Viewer

File Upload Flow

Download Flow

Checkout Flow

Dashboard Architecture

Review

Component size

Prop drilling

State duplication

Rendering efficiency

Routing complexity

Reusable UI

Accessibility

---

# Step 6 — API Architecture

Review

REST conventions

Endpoint naming

Versioning

Filtering

Sorting

Pagination

Caching

Authentication

Authorization

Rate limiting

Response consistency

Error consistency

HTTP status codes

Idempotency

Request validation

Response schema

---

# Step 7 — Database Architecture

Review

Normalization

Relationships

Indexes

Foreign Keys

Cascade Rules

Soft Deletes

Audit Fields

Migration Strategy

Search Strategy

Pagination Strategy

Transactions

Concurrency

Locking

Scalability

Partitioning readiness

Future migration readiness

---

# Step 8 — Storage Architecture

Review

Cloudflare R2 usage

Object naming

Folder hierarchy

File organisation

Temporary uploads

Permanent storage

File lifecycle

Download permissions

CDN

Signed URLs

Storage cleanup

Versioning

Backup strategy

Disaster recovery

---

# Step 9 — Security Architecture

Review

Authentication flow

Authorization model

Role hierarchy

Permission inheritance

JWT lifecycle

Refresh Tokens

CSRF

CORS

Security Headers

Secrets Management

Encryption

Password Storage

Input Validation

Output Encoding

Rate Limiting

File Upload Security

IDOR

SQL Injection

XSS

SSRF

Path Traversal

Sensitive Data Exposure

Logging

Audit Trail

---

# Step 10 — Performance Architecture

Review

API latency

Database queries

Caching strategy

Frontend bundle size

Code splitting

Lazy loading

Image optimisation

Three.js optimisation

Model loading

Texture loading

Streaming

Compression

CDN usage

Memory usage

CPU usage

Network efficiency

Concurrent users

Expected bottlenecks

---

# Step 11 — Scalability Review

Estimate support for

100 users

1,000 users

10,000 users

100,000 users

Review

Database growth

Storage growth

Search performance

Caching

Background workers

Horizontal scaling

Vertical scaling

Future microservices

Queue system

Redis usage

---

# Step 12 — Maintainability Review

Review

Naming consistency

Folder consistency

Module boundaries

Configuration

Documentation

Testing

Code reuse

Technical debt

Future extensibility

Developer onboarding

Review complexity

Estimate

Easy

Moderate

Difficult

Very Difficult

---

# Step 13 — DevOps Review

Review

Environment variables

Docker

Docker Compose

CI/CD readiness

Git workflow

Migration safety

Rollback strategy

Logging

Monitoring

Health checks

Backups

Deployment safety

Release strategy

---

# Step 14 — Dependency Review

Review newly introduced dependencies.

For every dependency report

Purpose

Necessity

Maintenance status

Popularity

Security risks

Bundle impact

Alternative libraries

Remove unnecessary packages.

---

# Step 15 — Cost Review

Estimate long-term operational cost.

Review

Cloudflare R2

CDN

Database

Bandwidth

Storage

Image processing

3D model delivery

Payment gateway fees

Logging

Monitoring

Background workers

Identify unnecessary spending.

Suggest cheaper alternatives when appropriate.

---

# Step 16 — AI Architecture Review

Identify

Generated boilerplate

Duplicate AI-generated code

Placeholder implementations

Incomplete abstractions

Hallucinated APIs

Unused services

Overengineering

Underengineering

Recommend simplification where possible.

---

# Step 17 — Future Readiness

Evaluate readiness for

Marketplace expansion

Plugin marketplace

Creator dashboards

Subscriptions

Licensing

Analytics

AI features

Internationalisation

Multiple currencies

Multiple languages

Enterprise customers

Mobile application

Public API

---

# Step 18 — Architecture Scoring

Rate

Backend Architecture

__/10

Frontend Architecture

__/10

Database

__/10

API Design

__/10

Security

__/10

Performance

__/10

Scalability

__/10

Maintainability

__/10

Infrastructure

__/10

Developer Experience

__/10

Documentation

__/10

Testing

__/10

Cost Efficiency

__/10

Future Readiness

__/10

Overall

__/140

---

# Step 19 — Required Refactoring

List architecture changes in priority order.

Priority

Critical

High

Medium

Low

For each item include

Problem

Reason

Impact

Recommended Solution

Estimated Effort

---

# Step 20 — Final Architecture Report

Always produce the following report.

# Architecture Review Report

## System Summary

-

## Feature Impact

-

## Modules Affected

-

## Architecture Strengths

-

## Architecture Weaknesses

-

## Backend Issues

-

## Frontend Issues

-

## Database Issues

-

## API Issues

-

## Security Concerns

-

## Performance Concerns

-

## Scalability Concerns

-

## Infrastructure Concerns

-

## Cost Concerns

-

## Technical Debt

-

## Recommended Refactoring

-

## Future Risks

-

## Overall Architecture Score

__/140

## Production Architecture Status

READY

READY WITH RECOMMENDATIONS

NOT READY

Never mark READY if any Critical architecture issue exists.

Never claim runtime behaviour, scalability, or performance has been verified unless measurements or tests were actually executed.

Always distinguish between:

✓ Verified by execution or measurement

⚠ Predicted from architecture review

? Unable to verify without runtime or infrastructure testing