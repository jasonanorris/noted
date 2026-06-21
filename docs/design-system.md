# Noted Design System

This document captures the MVP UI rules used by Noted. Keep new screens and controls aligned with these patterns before adding new visual styles.

## Tokens

Source of truth: `src/styles.css`.

### Color

- Primary action/accent: `--color-primary`
- Primary hover: `--color-primary-hover`
- Raised surfaces: `--color-surface-raised`
- Recessed surfaces: `--color-surface-recessed`
- Muted empty surfaces: `--color-surface-muted`
- Text: `--color-text`
- Secondary text: `--color-text-muted`
- Tertiary text: `--color-text-light`
- Success, warning, error: `--color-success`, `--color-warning`, `--color-error`
- Focus rings: `--color-focus`, `--color-focus-soft`
- Search highlights: `--color-highlight`

### Type

- Base font: `--font-family-base`
- Mono font: `--font-family-mono`
- Type scale: `--font-size-xs` through `--font-size-xxl`
- Body line height: `--line-height-body`
- Tight UI line height: `--line-height-tight`
- Supporting copy line height: `--line-height-copy`

### Spacing, Radius, Borders, Shadows

- Spacing scale: `--spacing-xs`, `--spacing-sm`, `--spacing-md`, `--spacing-lg`, `--spacing-xl`, `--spacing-xxl`
- Radius: prefer `--border-radius-md`; use `--border-radius-sm` for compact chips and `--border-radius-lg` only when a larger container truly needs it
- Borders: use `--border-subtle`, `--border-control`, `--border-input`, `--border-divider`, `--border-empty`, `--border-error`
- Shadows: use `--shadow-sm` for resting cards, `--shadow-md` for hover/focus elevation, and avoid heavy shadows in dense tool surfaces

## Layout

- Main screens use `.app-view` or `.home-screen`: max width 960px, safe-area-aware padding, and a 96px bottom allowance.
- Screen headers use `.app-view-header`; keep headings focused on route changes with `useScreenFocus`.
- Repeated content lists use CSS grid with `minmax(0, 1fr)` or card grids such as `.document-grid`.
- Mobile layout switches at `768px`; controls must maintain at least 44px touch targets.

## Components

### Buttons

- Primary commands use `.btn.btn-primary`.
- Secondary commands use `.btn.btn-secondary`.
- Destructive commands use `.btn.btn-danger` or `.text-button.is-danger` for compact row actions.
- Low-emphasis navigation/actions use `.text-button`.
- Icon-like quick actions must have explicit accessible names.

### Inputs

- Text fields, selects, and textareas use `.input`.
- Labels use `.field`; avoid placeholder-only labeling.
- Keyboard focus must remain visible through global `:focus-visible`.

### Cards And Rows

- Document cards use `.document-card`.
- Long document grids render cards through `LazyDocumentCard`, with `.document-card-skeleton` preserving layout while deferred cards load.
- Management rows use `.management-row`.
- Category rows use `.area-row`.
- Cards and rows use subtle borders, medium radius, and limited hover elevation.

### Empty, Loading, And Error States

- Empty/loading/error content uses `.document-state`.
- Error state adds `.is-error`.
- Loading indicators use `.spinner`.
- Route chunk loading uses `.route-loading-state` inside `.app-view`.
- Keep empty-state copy short: a strong title plus one supporting sentence.

### Editor

- Formatting controls live in `.format-toolbar`.
- Edit/Preview mode uses `.segmented-control` and `.segmented-button`.
- Preview output uses `.editor-preview`; render structured React nodes rather than injecting HTML.
- Editor shortcuts should mirror button actions: `Ctrl/Cmd+S` saves, `Ctrl/Cmd+Z` undoes content edits, `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` redoes content edits, `Ctrl/Cmd+B` applies bold, `Ctrl/Cmd+I` applies italic, `Ctrl/Cmd+Shift+P` toggles preview, and `Escape` returns from preview to edit mode.

## Accessibility Rules

- Every screen heading receives focus on entry.
- Every control has a visible label or explicit accessible name.
- Focus rings must not be suppressed.
- Dialog-like browser prompts are acceptable for MVP destructive actions, but copy must name the consequence.

## Test Expectations

Run these before shipping UI changes:

```bash
npm run build
CI=true npm test -- --watchAll=false
npx playwright test tests/responsive.spec.js tests/accessibility.spec.js tests/workflows.spec.js tests/offline.spec.js
```
