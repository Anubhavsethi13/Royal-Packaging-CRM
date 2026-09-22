# Phase 1 Design System Prompt

Build the visual foundation exactly around the Royal Packaging CRM specification.

## Design philosophy

**Precision logistics control room**

The application should feel like premium operational software rather than a generic SaaS dashboard.

## Typography

Use:

- IBM Plex Sans — primary UI
- DM Serif Display — brand-level/display headings
- IBM Plex Mono — operational/tabular numerals

## Light theme

Create tokens corresponding to:

```css
background: #f4f1eb;
foreground: #1d2330;
surface: #ece8df;
sidebar: #20283a;
card: #faf8f3;
primary: #3448a8;
secondary: #e2ddd3;
accent: #d9dfef;
muted: #e8e4db;
success: #28765a;
error: #b3443d;
warning: #9b6b1c;
info: #3c6f9e;
border: #d8d3c8;
```

## Dark theme

```css
background: #141822;
foreground: #eef0f4;
surface: #1c2230;
sidebar: #0f141f;
card: #1b2130;
primary: #8391e4;
secondary: #29303f;
accent: #30395e;
muted: #252c39;
border: #343c4b;
```

## Spacing

Support the documented spacing scale:

- 0.25rem
- 0.5rem
- 0.75rem
- 1rem
- 1.5rem
- 2rem
- 3rem
- 4rem
- 5rem

## Radii

Support:

- 6px
- 10px
- 14px
- 18px
- 999px

## Animation

Use restrained transitions around:

- 120ms
- 180ms
- 300ms

Avoid decorative animation.

## Responsive behavior

Establish breakpoints suitable for:

- desktop
- tablet
- mobile

Future warehouse UI must support:

- minimum 48px touch targets
- full-width mobile actions
- simplified mobile data surfaces
- one-column mobile layout

## Component principles

Components should be:

- accessible
- keyboard usable
- composable
- consistently spaced
- theme-aware
- responsive

Do not create one-off styling for every page when a reusable component can express the pattern.
