# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

Use these files when they exist:

- `CONTEXT.md` at the repo root.
- `docs/adr/` for architectural decisions that touch the area you're about to work in.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term as defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If the concept you need is not in the glossary yet, either reconsider whether you are inventing language the project does not use or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly instead of silently overriding it:

> _Contradicts ADR-0007 (event-sourced orders), but worth reopening because..._
