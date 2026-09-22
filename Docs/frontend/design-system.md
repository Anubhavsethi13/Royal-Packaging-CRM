# Design System

The UI uses the existing token layer in `frontend/src/styles/tokens.css` with a quiet operations-console palette, compact typography, visible focus states, and responsive density changes for tablet and rugged-device workflows.

Reusable controls live in `frontend/src/components/ui.tsx`: buttons, icon buttons, fields, cards, badges, status badges, page headers, metrics, tables, filters, pagination, tabs, alerts, dialogs, menus, toasts, avatars, and explicit loading, empty, and error states.

Interaction rules are consistent across screens:

- Use icons with clear labels for actions and tooltips for unfamiliar icon-only controls.
- Use badges for state, not color alone; status text remains visible.
- Keep destructive or future-mutating actions behind an explicit preview action or confirmation surface.
- Show mock/demo notices where a value or action could otherwise be mistaken for live data.
- Preserve keyboard focus, semantic headings, labels, table headers, and readable contrast.

Responsive rules are shared rather than page-specific: dashboard and detail grid children may shrink below table content, tables scroll within their wrapper, and coarse-pointer controls use a 44px minimum target.
