# Error Contract

Every non-success response should use a safe JSON body where possible:

```json
{
  "code": "VALIDATION_FAILED",
  "message": "Check the submitted fields.",
  "errors": [
    { "field": "phone", "code": "invalid_format", "message": "Enter a valid phone number." }
  ],
  "requestId": "req_opaque_value"
}
```

`errors` is the canonical field-aware list. `fieldErrors` remains accepted for compatibility with the Phase 3 client boundary. The frontend never displays stack traces, SQL errors, internal paths, tokens, or credentials.

| HTTP | Code examples | Frontend behavior |
|---|---|---|
| 400 | `BAD_REQUEST`, `INVALID_PATH` | Show recoverable request error |
| 401 | `UNAUTHENTICATED`, `SESSION_EXPIRED` | Clear session and redirect |
| 403 | `FORBIDDEN` | Unauthorized state; no retry |
| 404 | `NOT_FOUND` | Detail not-found state |
| 409 | `CONFLICT`, `STALE_VERSION` | Explain conflict and refresh/review |
| 422 | `VALIDATION_FAILED` | Map `errors[].field` to form fields |
| 429 | `RATE_LIMITED` | Show retry guidance, honor server timing |
| 5xx | `SERVER_ERROR` | Generic recovery state and request ID if safe |

The API client exposes status, code, field errors, validation issues, and a safe message through `ApiError`.
