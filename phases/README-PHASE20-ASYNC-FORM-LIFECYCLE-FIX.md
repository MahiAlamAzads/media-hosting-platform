# Phase 20 — Async Form Lifecycle Runtime Fix

This patch fixes React runtime crashes such as:

```text
TypeError: can't access property "reset", event.currentTarget is null
```

## Cause

React assigns `currentTarget` only while the event handler is actively running.
After an `await`, code must not read `event.currentTarget` again. The form must
be captured before the first asynchronous boundary:

```ts
const form = event.currentTarget;
const data = new FormData(form);
await save(data);
form.reset();
```

## Fixed pages

- Root folder creation
- Child folder creation
- Password change
- API key creation
- Manual payment submission and proof flow
- Admin manual-payment account creation

## Regression guard

A new repository command scans customer and admin TypeScript sources:

```bash
pnpm audit:forms
```

The command fails when `event.currentTarget`, `e.currentTarget`, or
`ev.currentTarget` is accessed after `await` inside an async function.
It is also included in the root `pnpm verify` command.

No database migration, API contract, payment behavior, billing calculation,
media storage, or CDN delivery behavior is changed.
