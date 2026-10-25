# QuickNotes System Design

QuickNotes is a small, accessible notes client that demonstrates GET, POST, and DELETE using the JSONPlaceholder practice API. The accompanying documents propose a real authenticated notes service for one million registered users, including its REST API, relational data model, and scalable architecture.

This project lives at the root of the existing **web-foundations-days** repository by request. Earlier assignments remain in their folders, including `day7/`. The assignment's suggested repository name is `quicknotes-system-design`; this repository retains its existing name.

## Run the API client

1. Download or clone this repository.
2. Open `index.html` in a modern browser while connected to the internet. No build, API key, or package installation is required. Alternatively, serve the folder with your editor's local web server.
3. Click **Load notes** to fetch ten notes.
4. Enter a title (required, up to 100 characters), optionally enter a body, and click **Save note**.
5. Click a note's **Delete** button to send a DELETE request and remove that card after success.

The page announces loading, success, and error messages, disables action buttons during requests, and displays an empty state when no notes remain. Errors retain the current notes and unsaved draft. User content is rendered with `textContent`.

**Practice API limitation:** JSONPlaceholder simulates changes without saving them. Created notes remain in memory only; clicking Load notes replaces the collection with server fixtures, and refreshing clears local changes. Multiple creations can return ID 101; deletion removes only the clicked local object after the simulated DELETE succeeds. This is explained in `api.js`. The practice client has a fixed `userId: 1` and no real authentication; production ownership and authentication are described in the API design.

## Design documents

- [API design](docs/api-design.md): endpoint methods, paths, status codes, payloads, validation, pagination, and errors.
- [Data model](docs/data-model.md): users, notes, tags, note_tags, PostgreSQL definitions, constraints, indexes, and queries.
- [Architecture](docs/architecture.md): requirements, load estimates, components, request flows, trade-offs, and resilience.

## Verification

With Node.js installed, run:

```sh
node --check api.js
node --test tests/api.test.cjs
```

The dependency-free tests use a small DOM substitute and mocked HTTP responses to check GET loading/success/empty states, POST validation and payloads, duplicate-ID deletion, HTTP/network failures, draft preservation, and button recovery. They do not replace a real browser or live API check.

Verification on 25 October 2026: all four automated tests passed; a live API check returned GET 200 with ten notes, POST 201 with ID 101, and DELETE 200. JavaScript syntax and Git whitespace checks passed. A visual browser check remains available using the steps below.

For a browser check: load ten notes, save two notes, delete one, then delete the remaining notes to see the empty state. Try a blank/whitespace title and a 100-character title. Switch the browser's network tools to Offline and try loading, saving, and deleting; each should show an error, restore buttons, and preserve data. Restore the connection afterwards.

## What I learned

- `fetch` does not reject for HTTP error statuses, so a reusable request helper must check `response.ok`.
- A responsive API client needs explicit loading, success, error, and empty states, plus validation and disabled controls to avoid duplicate actions.
- Database foreign keys, composite ownership constraints, and transactions protect relationships that browser validation alone cannot enforce.
- Read replicas and caches reduce database load but require deliberate choices about stale data and reading after a write.
- Queues and workers move slow tasks out of requests; reliable delivery also needs an outbox, retries, and idempotent processing.

## Submission and history

Repository: [Katee-Fidel/web-foundations-days](https://github.com/Katee-Fidel/web-foundations-days).

The work is split into seven task commits: GET client, POST creation, DELETE removal, API design, data model, architecture, and README with verification checks. The Day 8 presentation is a separate deliverable.
