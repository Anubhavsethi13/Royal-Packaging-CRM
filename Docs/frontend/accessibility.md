# Accessibility

Controls use native buttons, links, labels, inputs, selects, headings, and table semantics wherever possible. Icon-only controls have accessible names and tooltips. Tables expose column headers and optional captions, status remains textual rather than color-only, and focus-visible styling is preserved.

Dialogs use modal semantics, labelled descriptions, Escape handling, a focused close control, and a backdrop that closes only when the surface is clicked. Forms reset preview state when reopened, and validation remains visible in the dialog. Touch-oriented controls use larger targets on coarse pointers, and tables retain horizontal scrolling rather than clipping their content. Narrow dashboard cards explicitly allow their table wrapper to own overflow.
