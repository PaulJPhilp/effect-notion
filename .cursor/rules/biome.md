This document maps strict ESLint-style expectations to Biome rules and adds
Effect-oriented conventions using Biome's capabilities plus lightweight
custom checks via grep/CI scripts where necessary.

1) TypeScript strictness (approx ESLint + TS-ESLint strict)
- For TS 5.9, enforce the following in tsconfig.json (typechecked in CI):
  - "strict": true
  - "noUncheckedIndexedAccess": true
  - "exactOptionalPropertyTypes": true
  - "noImplicitOverride": true
  - "isolatedModules": true
- Biome rules:
  - suspicious/noExplicitAny: error          # no 'any'
  - suspicious/noFloatingPromises: error     # unhandled promises
  - typescript/useImportType: error          # prefer 'import type'
  - style/useConst: error
  - style/useBlockStatements: error
  - style/useImportType: error

2) Prefer discriminated unions over enums
- Use TS unions with a discriminant and ensure exhaustiveness.
- Add code patterns checked by review, but Biome assists via:
  - style/noUselessElse: error
  - suspicious/noDuplicateCase: error
- Add compile-time exhaustiveness checks using:
  - const _exhaustiveCheck: never = value; // reviewed manually

3) Effect-only errors, no TS Error, no throw/try-catch in Effect code
- Coding standard:
  - Never `throw` or instantiate `Error`/`TypeError` in domain/effect paths.
  - Use typed Effect.fail / Effect.raise and structured error types.
  - Prefer Effect.match / matchCause and pattern matching utilities.
- Biome can’t fully detect "Effect code path", but we approximate:
  - suspicious/noUselessCatch: error (discourage blanket try/catch)
  - Add a simple CI grep step to fail on forbidden patterns in src/:
    - "throw new Error("
    - "throw new TypeError("
    - "try {"
    - "catch ("
    - "Promise.reject(new Error("
  - Allow in infrastructure startup or top-level boundaries if explicitly whitelisted.

4) No unsafe casts and improved type ergonomics
- Biome: suspicious/noExplicitAny: error
- Encourage:
  - Prefer `satisfies` over `as` where feasible.
  - Avoid double assertions like `as unknown as T`.
- Add CI grep checks:
  - " as any"
  - " as unknown as "
  - "// @ts-ignore" (blocked unless justified)
- Biome: suspicious/noExtraNonNullAssertion: error

5) Async correctness
- Biome: suspicious/noFloatingPromises: error
- Prefer Effect for async workflows; where Promise interop is needed,
  use Effect.tryPromise/tryCatch and preserve causes.

6) DRY and SOLID guardrails
- DRY: flag duplication via review and complexity:
  - complexity/noExcessiveCognitiveComplexity: error
- SOLID:
  - Single-responsibility modules: keep files/functions short and cohesive.
  - Dependency inversion: Effect Services + Layers for boundaries.
  - Interface segregation: narrow types and exported interfaces.

7) Security hygiene
- Biome:
  - suspicious/noDangerouslySetInnerHtml: error (if React present)
  - suspicious/noUnsafeOptionalChaining: error
  - suspicious/noNonoctalDecimalEscape: error
- Review policy:
  - Validate inputs with Effect Schema/Zod/Valibot at trust boundaries.
  - Never log secrets; ensure .env.example exists.

8) Testing rigor (Vitest + Bun)
- Biome:
  - suspicious/noOnlyTests: error in **/*.test.*
- Testing practices:
  - Use fakes for time/random/network; cover error and cancellation paths.
  - Avoid brittle snapshots; assert behavior.

9) Formatting and consistency (Biome)
- Enforce single quotes, 80 cols, 2 spaces, consistent JSX style.
- Run `bunx @biomejs/biome check --apply` in CI to auto-fix safe issues.

10) Suggested CI quality gate (Bun + Biome + tsc + Vitest)
- typecheck: `bun run typecheck` (tsc --noEmit)
- lint/format: `bunx @biomejs/biome check .`
- tests: `bun test`
- forbidden-patterns: simple grep step:
  - grep -R --line-number -E "throw new (Error|TypeError)|\\btry\\b|\\bcatch\\b| as any| as unknown as |@ts-ignore" src || (echo "Forbidden pattern found" && exit 1)