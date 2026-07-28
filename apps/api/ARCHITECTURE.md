# API architecture

## Dependency direction

```text
Module composition root
  -> Route
    -> Controller
      -> Service
        -> Repository
        -> Validation
```

- **Route** wires HTTP handlers only.
- **Controller** is the HTTP adapter and delegates through the service boundary.
- **Service** owns use-case orchestration and must not depend on Express request/response objects.
- **Repository** owns Prisma access.
- **Validation** owns request and command validation.
- **Module** composes dependencies and exposes a mount descriptor.

## Compatibility migration

The existing production-proven router implementations are preserved byte-for-byte as `*.legacy.ts`. Class-based HTTP façades sit in front of them so route mounting, dependency composition, test placement and future development follow one architecture immediately without rewriting financial, upload, storage or authentication rules in a single risky change.

Existing domain services such as `billing.service.ts`, `payg.service.ts`, `revenue.service.ts` and `payment.service.ts` are preserved unchanged. New work should be extracted from the legacy implementation into controller/service/repository/validation incrementally.

## Composition root

All modules are mounted from:

```text
src/modules/module-registry.ts
```

`src/app.ts` no longer imports individual business routers. Raw-body webhook modules are mounted before JSON parsing.

## Tests

All tests live in `tests/`. Production source under `src/` may not contain `*.test.ts`.

```bash
pnpm test:architecture
pnpm test:unit
pnpm test:integration
pnpm test:contracts
```
