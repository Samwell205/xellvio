# Upgrade the landing page + sign-up form builder

Your builders already store designs as real editable pieces, so this work builds on
that instead of starting over. Nothing else in Xellvio changes.

The full brief is very large, so I've split it into stages you can approve one at a
time. I'd build stage 1 now.

## Stage 1 — the things that are missing today (build now)

**Real uploads and a media library**
- Upload images, logos and videos straight from the editor (drag a file onto a
  picture and it uploads and replaces it).
- A per-tenant media library: upload, search, rename, delete, reuse, copy link.
  Each business only ever sees its own files.
- Every picture, logo and video piece gets Upload / Library / Paste link.

**AI that changes the page you're looking at**
- Ask in plain words ("make the hero more premium", "add a phone number field",
  "fix the mobile layout") and the AI edits the current design instead of
  replacing it.
- Before/After review with Apply, Discard and Try again, plus a timestamped
  design history you can restore from.
- If you have a section or a button selected, the AI only touches that.

**Motion and depth**
- Scroll reveals (fade, fade up, slide, scale, blur, stagger), parallax and
  sticky sections, hover lift/glow/zoom, and tasteful 3D-feel hero visuals
  (gradient spheres, floating cards, mesh backgrounds) — all as settings you can
  turn down or off, lighter on phones, and switched off for anyone who asks their
  device to reduce motion.

**Safe publishing**
- Editing never touches the live page: you edit a draft and press Publish.
- Editable web address (xellvio.com/p/your-name), checked for duplicates and
  reserved words.
- Version list with preview and restore.

## Stage 2 — design quality and choice

- A much bigger template library across business, shop, services, education,
  creator, events and startup, with several looks per industry (minimal, luxury,
  futuristic, bold, playful, corporate, editorial, tech) and real scrollable
  desktop/tablet/phone previews.
- "Turn this template into a page for my agency" — AI rewrites the words and
  colours while keeping the layout.
- A brand settings screen (colours, fonts, spacing, button and card style) the AI
  designs with.
- Layers tree, copy/paste/duplicate/rename, zoom and fit to screen, keyboard
  shortcuts.

## Stage 3 — richer forms

- Many more field types, multi-column and split-screen layouts, multi-step forms
  with a progress bar, show-a-field-only-if logic, field states, and finish
  actions that add the person to a list, tag them, redirect them or start an
  automation.

## Stage 4 — your own domain

- Connect offers.yourbusiness.com, see the exact DNS record to add, verification
  and certificate status, and serve your pages on it.
- This one depends on the hosting side accepting tenant domains, so I want to
  confirm what's actually possible before promising it — I won't ship a domain
  screen that doesn't really connect anything.

## Technical notes

- Extend `src/lib/builder/schema.ts` with `animation`, `layout` (grid/flex/
  absolute/z-index), per-breakpoint styles and richer field config; the renderer
  (`BlockRenderer.tsx`) reads them so public pages and previews stay identical.
- New `media_assets` table + private-by-default storage bucket, tenant-scoped
  RLS and GRANTs, upload through a server function; 3D/heavy visuals are lazy
  loaded so pages without them stay light.
- `landing_pages` / `signup_forms` gain draft vs published snapshots plus a
  `page_versions` table; public routes read the published snapshot only.
- AI stays in `builder-ai.functions.ts`, returning block JSON patches keyed by
  component id — never markup.
