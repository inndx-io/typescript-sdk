# AGENTS Guidelines

This repository follows these guidelines for contributions by AI agents or humans:

1. **Commit Messages**: Use [Conventional Commits](https://www.conventionalcommits.org/) format. Examples include:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `test:` for test-related changes
   - `chore:` for maintenance tasks

2. **Simplicity First**: Prefer simpler implementations over overly complex solutions. In Next.js, default to the simplest viable combination of Server Components, Server Actions, and API routes.

3. **Package Manager**: Use `pnpm` for all dependency and script management. Avoid `npm` or `yarn`.

4. **Run Tests & Checks**: Always run tests and quality checks before committing to ensure functionality and catch regressions:
   - `pnpm test` for tests
   - `pnpm lint` or `pnpm typecheck` for linting
   - `pnpm format` for formatting

5. **Uniform Structure**: Maintain a consistent project structure using the Next.js App Router (`app/` directory). Keep route groups, layouts, and components organized and predictable.

6. **Explain Why**: Add comments explaining *why* something is done if it is not obvious from the code alone. Prefer clarity over cleverness, especially in server/client boundaries.

7. **Documentation**: Update relevant documentation when making changes that affect usage or behavior. Ensure README and inline documentation remain accurate and up to date.

8. **Branch Names**: Use `_type_/_short_topic_` convention for new branches (e.g. `feat/add-auth` or `fix/navbar-layout`).

9. **Style & Formatting**:
   - Use **Biome** for linting and formatting (`biome check`, `biome format`)
   - Keep code style consistent across the project
   - Do not reformat unrelated files unless explicitly required
   - Follow existing patterns for React components, hooks, and server/client boundaries (`"use client"` usage)

10. **Next.js Best Practices**:
   - Prefer Server Components by default in the App Router
   - Use Client Components only when necessary (`"use client"`)
   - Use Server Actions where appropriate instead of excessive API routes
   - Keep data fetching close to where it is used
   - Avoid unnecessary client-side state when server rendering suffices

11. **Security**:
   - Run dependency checks using `pnpm audit`
   - Avoid introducing insecure patterns (e.g., unsafe HTML rendering, leaking secrets to the client)
   - Ensure environment variables are properly scoped (server-only vs client-exposed via `NEXT_PUBLIC_`)

12. **Dependencies**: Prefer minimal dependencies. Before adding a new package, consider:
   - Can this be done natively in Next.js/React?
   - Is the dependency well-maintained and necessary?

13. **Performance Awareness**: Be mindful of bundle size, client hydration cost, and unnecessary re-renders. Prefer server-side work when possible in the App Router architecture.

## Code Style and Conventions

These rules are non-negotiable. Each is stated, then expanded with concrete examples.

### Rule 1 — Multiline over long single-line expressions

> "Multiline expressions are favored over long single line expressions"

Break argument lists, object literals, and JSX prop blocks across multiple lines when they exceed ~80 columns or hide structure. Example:

Avoid:

    const res = await matchHostUrlPatternsAction(record.id, rows.map((r) => r.value.trim()).filter((v) => v.length > 0))

Prefer:

    const paths = rows
      .map((r) => r.value.trim())
      .filter((v) => v.length > 0)

    const res = await matchHostUrlPatternsAction(record.id, paths)

### Rule 2 — No single-use intermediate variables

> "Do not assign variables only to use them once. Just build them where you pass them in that case."

Inline values used exactly once where they are consumed.

Avoid:

    const body = { paths }
    const res = await matchHostUrlPatterns(id, body)

Prefer:

    const res = await matchHostUrlPatterns(id, { paths })

### Rule 3 — Comments are for public-API docstrings and vague logic

> "Comments are used to document public API with docstrings and explain vague logic that won't be understood at first glance with line comments. Do not write your life story with every possible thought you have in comments."

Default to no comments. Only write one when the reasoning is non-obvious.

### Rule 4 — Logical line breaks group related statements

> "Use logical line breaks between lines to group related statements instead of squishing everything together like a mallet on a cheeseburger."

Group related statements with blank lines so the reader can see the phases.

Avoid:

    export async function matchHostUrlPatternsAction(id: string, paths: string[]): Promise<MatchHostUrlPatternsResult> {
      try {
        const res = await matchHostUrlPatterns(id, { paths })
        return { ok: true, results: res.results }
      } catch (e) {
        logSdkError("matchHostUrlPatterns", e, { id, count: paths.length })
        return { error: e instanceof Error ? e.message : String(e) }
      }
    }

Prefer:

    export async function matchHostUrlPatternsAction(
      id: string,
      paths: string[],
    ): Promise<MatchHostUrlPatternsResult> {
      try {
        const res = await matchHostUrlPatterns(id, { paths })

        return { ok: true, results: res.results }
      } catch (e) {
        logSdkError("matchHostUrlPatterns", e, { id, count: paths.length })

        return { error: e instanceof Error ? e.message : String(e) }
      }
    }

### Rule 5 — Use aliases for internal imports

> "Use aliases for internal imports to avoid long relative paths and make it clear when importing from within the project vs external dependencies."

Avoid:

    import { ApiError } from '../../../http/errors'
    import { ErrorResponseSchema } from '../../../types/common/errors'

Prefer:

    import { ApiError } from '@/http/errors'
    import { ErrorResponseSchema } from '@/types/common/errors'

### Rule 6 — No reflexive type annotations

> "Inference is preferred. This means you should not write `const x: string = "hello"` when `const x = "hello"` suffices, or anything that repeats the type of the variable without adding clarity like casting with `as` when it is not needed."

Avoid:

    const res: ApiResponse = await fetch(...)

Prefer:

    const res = await fetch(...)

