# AGENTS.md

## Project overview
This repository is an Instagram-like social network web application for a graduation project.

Main stack:
- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- Realtime: Socket.IO
- Media storage: local file storage

Primary goals:
- Keep the UX close to Instagram where appropriate
- Prefer safe, minimal-impact changes
- Preserve the existing project structure unless a change clearly improves maintainability
- Avoid breaking existing features

## General behavior
When working on this project, follow these rules:

1. Read the relevant files first before changing anything.
2. Trace the full flow of the feature before editing:
   - UI/component
   - hooks/state/store
   - API client
   - backend route/controller/service
   - database model if relevant
3. For bug fixes, identify the root cause first. Do not apply superficial patches unless explicitly requested.
4. Keep code changes focused on the requested task. Do not refactor unrelated areas unless necessary to complete the task safely.
5. If a requested change may affect existing behavior, preserve backward compatibility whenever possible.
6. Reuse existing utilities, components, and patterns before introducing new abstractions.
7. Prefer small, readable functions and clear naming.
8. After making changes, validate by running the most relevant checks available.

## Frontend rules
- Use TypeScript correctly. Avoid `any` unless there is no practical alternative.
- Keep components readable and split logic only when it improves maintainability.
- Match existing UI conventions and spacing unless the request is specifically about redesign.
- For new UI features, keep the style visually consistent with the current Instagram-like design.
- Do not introduce a new state library unless already present in the project.
- If changing API response usage, also update related frontend types.
- Handle loading, empty, and error states sensibly where relevant.
- Keep hover interactions, icon placement, and spacing aligned with nearby existing components.
- For popups, modals, dropdowns, and overlays, preserve current layering/z-index behavior.
- For chat and comments UI, prioritize smooth interaction and minimal layout shift.

## Backend rules
- Follow existing Express route/controller/service patterns in the repository.
- Keep controllers thin when possible; move reusable logic to services/helpers if the project already does that.
- Validate incoming data when relevant.
- Do not silently swallow errors.
- Return consistent response shapes with existing endpoints.
- When changing an endpoint, check all frontend callers and update them if necessary.
- Preserve existing auth/permission behavior unless the task explicitly requires changing it.
- Avoid introducing breaking API changes unless absolutely necessary.

## Database and model rules
- Reuse existing Mongoose conventions.
- Do not rename schema fields without updating all dependent code.
- For new fields, choose names consistent with current naming style.
- Consider migration/backward-compatibility impact before changing persisted data structures.

## Realtime / Socket.IO rules
- Check event names carefully and keep them consistent between client and server.
- Avoid duplicate listeners and memory-leak-prone patterns.
- When updating chat behavior, verify message sending, receiving, optimistic rendering, and cleanup.

## Media handling rules
- Preserve current local-upload behavior unless explicitly asked to change storage strategy.
- When adding new image/video flows, check preview state, sent state, fallback rendering, and broken file handling.
- Keep image display sizes controlled and consistent with nearby UI.

## CSS / styling rules
- Prefer editing the existing styling approach already used in the repo.
- Do not redesign unrelated screens.
- Fix layout issues with the smallest safe CSS change first.
- Ensure layouts behave reasonably across common desktop sizes.
- For message/image/comment layouts, reduce unnecessary wrappers and backgrounds if the feature calls for a cleaner UI.

## File creation rules
- Only create a new file when it clearly improves structure or is required by the task.
- Do not create duplicate helper files that overlap with existing utilities.
- When creating files, use names consistent with the project’s current naming conventions.

## Safety rules for code changes
- Never delete large sections of code unless necessary and clearly justified by the task.
- Before removing code, verify it is unused or replaced.
- Do not overwrite user-facing behavior outside the requested scope.
- If a change is risky, implement the safest version that satisfies the request.

## Validation checklist
After completing a task, do as many of these as the project supports:
- Run frontend build
- Run backend build or startup check
- Run tests if present
- Check TypeScript errors if applicable
- Check lint if configured

If a validation step fails, fix the issue if it is directly related to the change.

## Response format for each task
When reporting back after making changes, use this structure:
1. What was changed
2. Which files were modified
3. Root cause (for bug fixes)
4. Anything that still needs manual review or testing

## Task-specific preferences
For this repository, optimize for the following kinds of work:
- Add new social-network-style features
- Fix UI bugs without damaging layout
- Fix API integration issues
- Improve chat/comment/reel/profile interactions
- Keep changes production-oriented and practical for a graduation project

## What to avoid
- Do not introduce large architectural rewrites
- Do not replace the current stack
- Do not add unnecessary dependencies
- Do not change folder structure without a strong reason
- Do not make unrelated formatting-only edits across many files

## Prompting hints
When the user asks for a feature or fix, interpret requests in this order:
1. Exact bug or feature requested
2. Match current project style and behavior
3. Preserve existing functionality
4. Make the smallest complete change that works

If a request is ambiguous, prefer the most practical implementation that matches the existing app behavior.
