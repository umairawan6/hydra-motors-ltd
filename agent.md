# Hydra Motors — Agent working guide

Read this file and the current phase before implementing. This is a human-readable guide; AGENTS.md is the automatically discoverable entry point.

## Working rules
- Preserve the approved UI and existing functionality. Extend this repository; inspect before replacing.
- Use prd.md for scope, design system.md for visuals, technical-guide.md for architecture, project-phases.md for sequence.
- Complete one phase at a time, meeting its exit criteria before marking it complete. Do not claim cloud setup or tests occurred without evidence.
- Keep code modular and strictly typed. Validate external input. Check active user and permissions for every protected operation; enforce RLS too.
- Never expose privileged keys, customer data or restricted cost/profit values to unauthorized clients.
- Use migrations; never rerun the starter schema on an existing database. Financial issuance, numbering and payment allocation require transactional integrity and idempotency.
- Test financial rules, permission boundaries and critical workflows; avoid tests that merely copy implementation.
- Do not deploy, create paid resources or send invitations unless authorized for that action.

## Token-efficient workflow
1. Read only relevant files with targeted searches; avoid dependency folders and full logs.
2. Reuse shared types/components and existing utilities; introduce dependencies only for a clear need.
3. Make the smallest coherent change; no unrelated refactor or duplicate planning documents.
4. Run checks appropriate to the change once; repeat only after a change or failure.
5. Report changed behavior, checks and blockers briefly. Record decisions in the relevant document instead of repeating them across files.

## Definition of done
Implementation matches phase criteria; migration and RLS reviewed; relevant checks pass; no leaked secrets; responsive UI verified; phase status updated with evidence and remaining limitations.
