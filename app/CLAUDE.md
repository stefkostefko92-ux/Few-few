# CLAUDE.md — `app/` workspace

All new work happens **in this `app/` folder**. The sibling `zabobovdol/`
folder is an existing, separate project: treat it as **read-only reference**
— never edit, move, delete, or run builds against it.

## Work economically (applies to every session)

The point of this file is to keep sessions short and cheap.

- Do all work inside `app/`. Don't create or change files outside it.
- `zabobovdol/` is off-limits for edits. You may read it for reference only when a task explicitly needs it; otherwise don't explore it — its ~70 `prisma/seed-*.ts` scripts and large lockfile waste context.
- Trust this file instead of re-discovering the layout. Read a file only when about to change it or when you need its exact contents; don't re-read to "verify" an edit the tools already confirmed.
- Prefer Grep/Glob with a tight pattern over reading whole directories or large files; use `offset`/`limit` for big files.
- Run a build/lint/test gate once when relevant, not "just to be sure," and only the gate the change can affect.
- Replies: lead with the outcome, prose, minimal formatting. Skip preamble/postamble. No headers/bullets for simple answers.

## This workspace

(Empty so far — populate as the project takes shape, and document the stack, layout, and commands here as they're decided so future sessions don't have to rediscover them.)
