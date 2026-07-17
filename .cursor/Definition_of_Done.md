# Definition of Done — 3D Asset Marketplace

A feature is done only when all applicable items below are satisfied.

## Implementation
- [ ] Feature matches the agreed requirements and PROJECT_MASTER_PLAN scope
- [ ] Existing project patterns reused (no duplicate services/APIs/components)
- [ ] Business logic lives in services; views stay thin; serializers validate input
- [ ] Production-ready code only (no placeholders, TODOs, or console.log)

## Security
- [ ] Security_Checklist.md reviewed for the feature
- [ ] Passwords hashed with Django; JWT permissions enforced server-side
- [ ] Sensitive endpoints rate-limited where applicable
- [ ] No secrets, stack traces, or internal paths exposed to clients
- [ ] Auth and admin events logged via structured security logging

## Quality
- [ ] Automated tests cover happy path and failure/edge cases
- [ ] Existing related tests still pass
- [ ] No TypeScript / lint errors in touched frontend files
- [ ] Input validated on backend (and client forms where applicable)

## Delivery
- [ ] PROJECT_STATUS.md updated (current task, completed features, daily log)
- [ ] Database migrations reviewed when schema changes
- [ ] API / frontend changes documented in the task return summary
