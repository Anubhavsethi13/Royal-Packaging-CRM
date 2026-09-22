# Frontend Deployment

## Environment

Frontend variables are public and are embedded in the browser bundle. Never put database passwords, JWT secrets, private API keys, or service credentials in `VITE_*` variables.

Local preview configuration:

```env
VITE_DATA_MODE=mock
```

Production configuration:

```env
VITE_DATA_MODE=api
VITE_API_URL=https://<confirmed-backend-origin>/<confirmed-api-base>
```

The production API URL is a deployment-time value and must not be hardcoded in source. The repository provider also requires an explicit API resource configuration; endpoint paths and response decoders must be supplied only after the backend contracts are confirmed. API mode must not fall back to mock data.

## Build

From the repository root:

```bash
npm install
npm run build
```

The frontend build is produced at `dist/frontend`. Deploy the contents of that directory as static assets. Generated `dist/` output is ignored by Git and should not be committed.

## SPA fallback

This frontend uses `BrowserRouter`. Static hosting must serve `dist/frontend/index.html` for unknown application routes such as `/clients`, `/orders`, and `/employees/emp-001`. Without this rewrite, direct navigation or refresh on a client-side route returns a host-level 404.

No hosting-provider-specific rewrite file is present in this repository.

## Backend release dependencies

- The deployed frontend origin must be allowed by backend CORS.
- Use HTTPS for the frontend and use an HTTPS `VITE_API_URL` in production.
- Backend API resource paths, response envelopes, and decoders must be confirmed before enabling API repository mode.
- Authentication paths are documented as `POST /auth/login`, `GET /auth/session`, and `POST /auth/logout`, but cookie-versus-bearer transport, credential inclusion, token storage, and refresh behavior remain unresolved.
- Backend 401 and 403 behavior must match the documented frontend session and unauthorized states.

## Local production check

Run `npm run build` to verify compilation and asset generation. No additional static server dependency is included; use the deployment platform's static hosting or an already-approved static file server.
