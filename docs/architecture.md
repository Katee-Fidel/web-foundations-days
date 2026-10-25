# QuickNotes architecture

This document designs the real service for one million registered users; the submitted browser client uses JSONPlaceholder only to demonstrate HTTP requests.

## Requirements

Functional: authenticate users; create, list, read, update, and delete owned notes; create tags and attach/remove them; paginate and filter notes; enforce ownership on every operation. A title is required and limited to 100 characters; the body is optional and limited to 10,000 characters.

Non-functional targets: 99.9% monthly availability, p95 API response time below 300 ms at the assumed peak (excluding client network time), encrypted transport and storage, private user data, durable acknowledged writes, and horizontal app scaling. Measure these targets with monitoring and load tests. Target recovery point is zero for acknowledged writes within a regional single-node failure using synchronous standby replication; regional disaster recovery targets are RPO <= 15 minutes and RTO <= 1 hour, validated through backup/restore drills.

## Load and storage estimates

Assumptions: 1,000,000 registered users, 10% active daily = **100,000 DAU**; each active user makes 50 read requests and 5 writes daily; peak is 5 times average; one year is 365 days with no user growth. One list page counts as one read request, even though it returns up to 10 notes.

| Workload | Calculation | Estimate |
| --- | --- | --- |
| Daily reads | 100,000 × 50 | 5,000,000 |
| Average reads/s | 5,000,000 / 86,400 | **57.87** |
| Peak reads/s | average × 5 | **289.35** |
| Daily writes | 100,000 × 5 | 500,000 |
| Average writes/s | 500,000 / 86,400 | **5.79** |
| Peak writes/s | average × 5 | **28.94** |

For a conservative storage budget, treat all five daily writes as new notes, retain every note, and assume 2 KB per note including average text and row metadata. Updates/deletes normally reduce growth relative to this upper planning case. Decimal units: 1 GB = 1,000,000 KB.

- 500,000 × 365 = **182,500,000 new notes/year**.
- 182,500,000 × 2 KB = **365 GB/year of logical note data**.
- Allow 50% for indexes, tags, associations, and database overhead: **547.5 GB/year per full database copy**.
- Primary + synchronous standby + read replica: approximately **1,642.5 GB (1.64 TB)/year**, excluding backups, transaction logs, queue retention, and operational headroom.

The 2 KB figure is an average, not the maximum body size. Measure real sizes, tag use, cache hit rates, and query costs before provisioning. Reads outnumber writes 10:1, so this design is read-heavy. API request rates are not identical to database query rates because caches and multi-query operations change those numbers.

## Architecture diagram

```text
[Client] --resolve hostname--> [DNS]
   |
   +-- static HTML/CSS/JS --> [CDN] --> [Static origin]
   |
   +-- HTTPS /api/v1 --> [Managed load balancer, redundant]
                              |                 |
                         [App server A]    [App server B]
                              |                 |
                              +--------+--------+
                                       |
                      +----------------+-------------------+
                      |                |                   |
                [HA cache]      [Primary database]   [Read replica]
                 per-user        |          |          ^
                                |          +----------+ async replication
                         synchronous
                          replication
                                v
                         [Standby database]

[App servers] --commit note + outbox event--> [Primary database]
[Outbox publisher, redundant] --read outbox--> [Primary database]
             |
             v
       [Durable HA queue] --> [Worker pool] --> [Search index]
                                  |
                                  +--> [Dead-letter queue]
```

App servers use cache first, replica for eligible reads, and primary for writes or consistency-sensitive reads. All private API requests bypass CDN caching. Search indexing is asynchronous; a note's durability never depends on search or the queue being immediately available.

## Component responsibilities

- **Client:** Presents notes and communicates with the service over HTTPS.
- **DNS:** Resolves the service hostname to the appropriate CDN or load-balancer endpoint.
- **CDN:** Caches public static files near users to reduce latency and origin traffic.
- **Static origin:** Stores deployable HTML, CSS, and JavaScript assets for CDN cache misses.
- **Load balancer:** Routes API requests to healthy app servers and removes unhealthy instances.
- **App servers A and B:** Validate input, authenticate users, enforce ownership, and run API logic across multiple instances.
- **HA cache:** Stores short-lived results under user-scoped keys to reduce database reads while protecting tenant isolation.
- **Primary database:** Holds authoritative users, notes, tags, associations, and transactional outbox records.
- **Standby database:** Receives synchronous replication and can be promoted if the primary fails.
- **Read replica:** Offloads eligible reads from the primary while accepting possible replication delay.
- **Outbox publisher:** Reliably transfers committed database events into the queue without losing jobs between database commit and enqueue.
- **Durable HA queue:** Buffers background events during bursts or worker outages.
- **Worker pool:** Consumes events idempotently to update search records without delaying note creation.
- **Search index:** Supports future full-text search without repeatedly scanning the primary database.
- **Dead-letter queue:** Retains repeatedly failing events for diagnosis and replay.

## GET /notes flow

1. The client resolves DNS, loads static assets through the CDN, and sends authenticated `GET /api/v1/notes?limit=10` to the load balancer.
2. A healthy app server verifies the token, derives user ID, and validates pagination/filter parameters.
3. It checks a cache key containing the user ID, page cursor, filter, and that user's notes-version value.
4. On a cache miss, it queries owned notes in `(created_at DESC, id DESC)` order using the composite index, then caches the result briefly (for example, 30 seconds).
5. Ordinary reads may use the read replica; requests during the user's short post-write consistency window go to the primary and bypass list cache.
6. The server returns `200` with notes and nextCursor, or an empty data array, with `Cache-Control: private, no-store`; errors use the documented envelope.

## POST /notes flow

1. The client validates the title, then sends `POST /api/v1/notes` with JSON, authentication, and optionally an Idempotency-Key through the load balancer.
2. An app server authenticates the user, applies rate limits, and validates title/body fields independently of browser validation.
3. In a primary-database transaction, it creates the owned note and an outbox event; an idempotency record, when requested, commits with the write.
4. After commit, it increments the user's cache version, establishes a short shared primary-read window, and returns `201`, the note representation, and a Location header.
5. Cache failure does not undo an already committed note: bypass cache while unhealthy and let old entries expire; the creation response supplies the authoritative new note.
6. A redundant outbox publisher delivers the event to the durable queue, retrying until acknowledged.
7. A worker updates the search index using note ID and event version to ignore duplicates or older events, then acknowledges the job; repeated failures enter the dead-letter queue.

The demo client does not implement authentication, tags, PATCH, search, or this infrastructure; those belong to the proposed backend.

## Trade-offs and avoiding single points of failure

1. **Caching/replicas versus freshness:** Cache hits and replica reads reduce latency and primary load, but can return stale notes; versioned user cache keys, short TTLs, and primary reads after writes improve freshness at the cost of extra primary traffic. Replica lag is monitored; fall back to the primary when it exceeds the consistency window.
2. **SQL consistency versus horizontal write scale:** Transactions and foreign keys simplify ownership and tag integrity, but one primary bounds write throughput; the estimated 29 peak writes/s is a starting assumption to validate with load tests before considering partitioning or sharding.
3. **Background processing versus operational complexity:** A queue makes indexing resilient and keeps POST fast, but introduces eventual search consistency and duplicate delivery; an outbox, idempotent workers, retries, and a dead-letter queue make recovery explicit.
4. **Redundancy versus cost:** Multiple zones, database copies, and managed services cost more than a single server but allow the service to continue through individual instance failures.

Use managed redundant DNS and CDN, a multi-zone load balancer and static origin, at least two stateless app instances in separate zones, and shared authentication state rather than server-local sessions. Use a replicated cache with failover and allow cache bypass. The primary database has a synchronous standby in another zone with automated failover and fencing to prevent two primaries; the read replica alone is not the HA strategy. If the replica fails, route reads to the primary with rate limiting. Use a replicated durable queue, multiple publishers/workers, health checks, and autoscaling. Search downtime must not prevent core note CRUD. Store encrypted backups and transaction logs separately and test recovery; monitor errors, latency, saturation, replica lag, and queue age. These measures avoid single-machine dependencies, while a complete regional outage still requires the stated disaster-recovery process.
