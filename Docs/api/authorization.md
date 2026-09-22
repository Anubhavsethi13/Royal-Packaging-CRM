# Authorization Contract

Authorization is authoritative on the backend. Frontend permission checks only hide or disable UX affordances and improve navigation clarity.

`SessionResponse.user` supplies an opaque user ID, display name, email, role labels, and a list of permission codes. The current permission vocabulary is:

- Views: `view:dashboard`, `view:crm`, `view:warehouse`, `view:people`, `view:finance`, `view:security`, `view:reports`.
- Actions: `action:create`, `action:edit`, `action:delete`, `action:approve`, `action:export`, `action:correct`.

The frontend expects these states:

- `401`: clear session and navigate to sign-in or session-expired UX.
- `403`: show the unauthorized surface and do not retry automatically.
- Authenticated users may still receive a permission-denied response for a specific record or operation.

The backend must re-check permissions for every protected resource and mutation. A hidden menu item, disabled button, or route guard never grants or proves access.
