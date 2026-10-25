# QuickNotes API design

This is the proposed production API, not the JSONPlaceholder practice API. Base path: `/api/v1`. Use HTTPS, JSON request/response bodies, and `Authorization: Bearer <token>` on every endpoint. The authenticated user determines ownership; clients cannot choose a different user ID. IDs are integers and timestamps are UTC ISO 8601 strings.

## Endpoints

| Method | Path | Description | Success |
| --- | --- | --- | --- |
| GET | /notes?limit=10&cursor=... | List the user's notes, newest first; optional tagId filter | 200 OK |
| POST | /notes | Create a note for the authenticated user | 201 Created |
| GET | /notes/{noteId} | Read one owned note | 200 OK |
| PATCH | /notes/{noteId} | Update title and/or body | 200 OK |
| DELETE | /notes/{noteId} | Delete an owned note and its tag links | 204 No Content |
| GET | /tags | List the user's tags | 200 OK |
| POST | /tags | Create an owned tag | 201 Created |
| PUT | /notes/{noteId}/tags/{tagId} | Attach an owned tag to an owned note, idempotently | 204 No Content |
| DELETE | /notes/{noteId}/tags/{tagId} | Remove a tag association | 204 No Content |

## Validation and listing

Trim titles; require 1–100 characters. Body is optional, defaults to an empty string, and is limited to 10,000 characters. Tag names are trimmed and contain 1–50 characters, unique per user. Reject unknown fields and malformed IDs. PATCH must contain at least one supported field. List limit defaults to 10, ranges from 1 to 100, and invalid limits/cursors return 400. Use opaque cursors encoding `(created_at, id)` for stable descending pagination; an empty result is `200` with `data: []` and `nextCursor: null`.

## Create example

`POST /api/v1/notes` with `Content-Type: application/json`:

```json
{ "title": "Day 8 presentation", "body": "Explain the cache trade-off." }
```

Response: `201 Created`, with `Location: /api/v1/notes/42`:

```json
{
  "data": {
    "id": 42,
    "userId": 7,
    "title": "Day 8 presentation",
    "body": "Explain the cache trade-off.",
    "createdAt": "2026-10-25T12:00:00Z",
    "updatedAt": "2026-10-25T12:00:00Z"
  }
}
```

## List example

Request: `GET /api/v1/notes?limit=10`, with no request body. Response: `200 OK`:

```json
{
  "data": [
    {
      "id": 42,
      "userId": 7,
      "title": "Day 8 presentation",
      "body": "Explain the cache trade-off.",
      "createdAt": "2026-10-25T12:00:00Z",
      "updatedAt": "2026-10-25T12:00:00Z"
    }
  ],
  "pagination": { "limit": 10, "nextCursor": null }
}
```

## Errors

| Status | Meaning |
| --- | --- |
| 400 Bad Request | Invalid JSON, title, body, ID, pagination, or other input |
| 401 Unauthorized | Authentication token missing, expired, or invalid |
| 403 Forbidden | Authenticated account is suspended or lacks a required permission |
| 404 Not Found | Resource does not exist or belongs to another user, avoiding ownership disclosure |
| 409 Conflict | A tag name already exists for this user |
| 429 Too Many Requests | Rate limit exceeded; Retry-After header tells the client when to retry |
| 500 Internal Server Error | Unexpected server failure; do not expose stack traces |
| 503 Service Unavailable | Temporary database/service outage; retry later |

Example `400` body; all errors use this envelope, with field details only where appropriate:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please correct the highlighted fields.",
    "details": { "title": "Title is required and must not exceed 100 characters." },
    "requestId": "req_abc123"
  }
}
```

Authorize every resource operation, including both ends of a tag association. POST accepts an optional Idempotency-Key scoped to the user so network retries need not create duplicate notes. Never automatically retry a creation without that protection. Return private API responses with `Cache-Control: private, no-store`; CDN caching is reserved for public static assets.
