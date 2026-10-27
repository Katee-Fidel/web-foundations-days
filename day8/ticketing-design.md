# TicketHub: ticketing system design

## 1. Requirements

### Functional requirements

- Browse and search concerts, view event details, and view a seat map with prices and availability.
- Register/sign in, join a popular event's waiting room, and temporarily hold an available seat.
- Pay for an owned hold and view the resulting ticket and order status.
- Expire unpaid holds, reconcile uncertain payments, and notify buyers after confirmation.
- Prevent two buyers from holding or buying the same event seat at the same time.

Scope: reserved seating, one seat per order, one active hold per account per event, and a maximum of two purchased tickets per account per event, enforced transactionally. Group bookings, transfers, resale, and user-requested refunds are future work. An event means one dated performance; the same venue seat at another performance is different inventory. A payment captured after a lost/invalid reservation is automatically refunded rather than assigned someone else's seat.

### Non-functional requirements

- **Speed:** target p95 event browsing under 300 ms and admitted hold operations under 500 ms, excluding client network time and external payment processing; measure these under realistic contention.
- **Correctness:** no double-booked seats, no ticket issued without verified successful payment, and durable acknowledged orders; cached availability is advisory.
- **Fairness:** use a published waiting-room policy, one signed queue position per authenticated account per event, short admission leases, purchase limits, rate limits, and bot controls; queue position never guarantees a ticket.
- **Availability:** target 99.9% monthly availability, with redundant infrastructure; if authoritative inventory is unavailable, temporarily stop holds and purchases rather than risk overselling.
- **Security:** HTTPS, ownership checks on every order/ticket request, encrypted personal data, provider-hosted payment collection, verified webhooks, and no stored card numbers.
- **Resilience:** retry background work safely, reconcile payments after outages, and monitor latency, lock waits, queue age, error rates, inventory totals, and payment mismatches.

## 2. Estimates: normal day versus big sale

Given: 2,000,000 registered users; 50,000 normal daily visitors; 10 pages per visitor; 5,000 tickets sold per normal day. A popular sale attracts 200,000 attempted buyers for 20,000 seats in 10 minutes (600 seconds).

Assumptions: a day has 86,400 seconds; count one page as one logical browsing request, not every image/CSS request; normal peak is 5 times daily average. Big-sale estimates assume each buyer views 10 pages and makes at least one hold attempt; this is a planning assumption, not supplied behavior. Each order is one ticket. Failed attempts, retries, polling, webhooks, and database queries add traffic beyond successful purchases.

| Metric | Calculation | Estimate |
| --- | --- | --- |
| Normal browsing/day | 50,000 × 10 | 500,000 page requests |
| Normal average browsing/s | 500,000 / 86,400 | **5.79/s** |
| Assumed normal peak browsing/s | 5.787… × 5 | **28.94/s** |
| Normal average completed sales/s | 5,000 / 86,400 | **0.0579/s** |
| Assumed normal peak completed sales/s | 0.05787… × 5 | **0.2894/s** |
| Big-sale buyer arrivals / initial hold attempts | 200,000 / 600 | **333.33/s** averaged over 10 minutes |
| Big-sale browsing demand | 200,000 × 10 / 600 | **3,333.33/s** before admission control |
| Maximum completed sales averaged over the window | 20,000 / 600 | **33.33/s**, if all seats sell within 10 minutes |
| Demand per seat | 200,000 / 20,000 | **10 buyers per seat** |

Big-sale browsing is **576 times normal average** and **115.2 times the assumed normal peak**. The sell-out completion rate is 576 times normal average completed sales, but 333.33 attempted buyers/s is not 333.33 successful purchases/s. Only at most 10% of these buyers can obtain a seat under the one-seat assumption.

Ten-minute averages hide the opening rush. Stress-test a provisional 10× instantaneous burst: about **3,333 arrivals/hold attempts per second** and **33,333 browsing requests/s** before protection; these are assumed test targets, not measured peaks. If 200,000 waiting clients poll every five seconds, the waiting-room edge must handle **40,000 status requests/s**, independently of inventory servers. Use signed queue tokens, randomized polling intervals/backoff, and lightweight queue-status responses.

Admission initially targets **100 new shopping sessions/s** and a two-minute seat-selection lease (at most about 12,000 concurrent admitted shoppers). Ten browsing requests per admitted session means roughly 1,000 browsing requests/s in steady state, plus hold/payment traffic; restrict hold retries separately and reserve capacity for payment callbacks. Tune admission downward when lock latency rises. At this rate admitting all 200,000 people would take about 33 minutes, so many wait beyond the initial ten-minute demand window or see a sold-out notice; the system does not promise everyone immediate checkout. Existing valid holds retain their checkout window independently of the browsing lease.

Storage planning: 5,000 tickets/day × 365 = **1,825,000 tickets/year**. At an assumed 4 KB per completed order including associated ticket/payment metadata, that is **7.3 GB/year** logical transaction data (decimal units). One extra 20,000-seat sell-out adds 80 MB; with N additional such concerts, add N × 80 MB. Allowing 2× for indexes/overhead gives 14.6 GB/year for normal transaction growth per database copy, or 43.8 GB across a primary, synchronous standby, and read replica. This excludes user/event/seat inventories, abandoned holds, logs, backups, and artwork; their sizes require retention and event-count assumptions. Keep abandoned hold/payment audit records according to an explicit retention policy rather than treating them as free.

## 3. API design

Base path `/api/v1`; JSON over HTTPS. Browsing is public; holds, payment, orders, and tickets require authentication. Never accept a client-supplied user ID or final price as authority. Use Idempotency-Key for hold/payment POSTs and store the original request hash and result per user/key, rejecting a changed payload with 409.

| Method | Endpoint | Purpose | Success |
| --- | --- | --- | --- |
| GET | /events?query=...&cursor=... | Browse/search paginated events | 200 |
| GET | /events/{eventId} | Event details, sale time, and price information | 200 |
| GET | /events/{eventId}/seats | Advisory seat map with availability timestamp | 200 |
| POST | /events/{eventId}/queue-entries | Join the sale waiting room once per account | 201, or 200 for existing entry |
| GET | /queue-entries/{entryId} | Own waiting/admitted/sold-out state and admission token | 200 |
| POST | /events/{eventId}/holds | Atomically hold one seat; requires valid admission token during big sales | 201 |
| DELETE | /orders/{orderId}/hold | Cancel own unpaid HELD order and release its seat | 204 |
| POST | /orders/{orderId}/payments | Start provider checkout for the owned valid hold | 202 |
| GET | /orders/{orderId} | Read own hold, payment, confirmation, or expiry status | 200 |
| GET | /me/tickets?cursor=... | List own issued tickets | 200 |
| POST | /payments/webhook | Receive provider-signed payment events; not a browser endpoint | 200 after durable recording |

Hold request: `{"seatId": 901}`. Response: `{"orderId": 7001, "seatId": 901, "status": "HELD", "expiresAt": "2026-10-27T10:05:00Z", "amountMinor": 7500, "currency": "KES"}`. Amounts use integer minor currency units; the server snapshots the seat price.

Payment request: `{"returnUrl": "https://tickethub.example/checkout/result"}` with an allowlisted return URL. Response: `{"orderId": 7001, "status": "PAYMENT_PENDING", "checkoutUrl": "https://payment-provider.example/session/abc"}`. A return-page redirect is not proof of payment; the client reads the order until the server verifies its outcome.

Common errors: 400 invalid input; 401 missing/invalid authentication; 403 invalid admission token; 404 unknown or unowned resource; 409 seat unavailable, expired hold, or incompatible order state; 429 rate limit (Retry-After supplied); 500 unexpected failure; 503 temporary inventory/payment unavailability. Example: `{"error":{"code":"SEAT_UNAVAILABLE","message":"This seat is no longer available. Please choose another."}}`.

## 4. Data model and double-booking prevention

Use PostgreSQL as the authoritative inventory and order store. All IDs are UUID primary keys; all times are TIMESTAMPTZ in UTC. In the schema below, `?` means nullable, FK means foreign key, and UNIQUE/CHECK constraints are database-enforced.

| Table | Columns and constraints |
| --- | --- |
| users | id PK; email VARCHAR(254) UNIQUE NOT NULL; password_hash TEXT NOT NULL; created_at TIMESTAMPTZ NOT NULL |
| events | id PK; name TEXT NOT NULL; venue TEXT NOT NULL; starts_at TIMESTAMPTZ NOT NULL; sale_starts_at TIMESTAMPTZ NOT NULL; status TEXT CHECK in (DRAFT, ON_SALE, SOLD_OUT, CANCELLED) |
| seats | id PK; event_id FK events NOT NULL; section TEXT; row_label TEXT; seat_number TEXT; amount_minor BIGINT CHECK >= 0; currency CHAR(3); state TEXT CHECK in (AVAILABLE, HELD, PAYMENT_PENDING, SOLD); current_order_id? UNIQUE FK orders; hold_expires_at? TIMESTAMPTZ; UNIQUE(event_id, section, row_label, seat_number) with seat labels NOT NULL |
| orders | id PK; user_id FK users NOT NULL; seat_id FK seats NOT NULL; state TEXT CHECK in (HELD, PAYMENT_PENDING, PAID, EXPIRED, CANCELLED, REFUND_PENDING, REFUNDED); amount_minor BIGINT CHECK >= 0; currency CHAR(3); created_at TIMESTAMPTZ; expires_at TIMESTAMPTZ |
| payments | id PK; order_id UNIQUE FK orders NOT NULL; provider_payment_id? UNIQUE TEXT; idempotency_key UNIQUE TEXT NOT NULL; state TEXT CHECK in (INITIATING, PENDING, SUCCEEDED, FAILED, REFUND_PENDING, REFUNDED); updated_at TIMESTAMPTZ |
| tickets | id PK; order_id UNIQUE FK orders NOT NULL; seat_id UNIQUE FK seats NOT NULL; issued_at TIMESTAMPTZ NOT NULL; token_hash TEXT UNIQUE NOT NULL |
| queue_entries | id PK; user_id FK users; event_id FK events; sequence BIGINT; state TEXT; admitted_until? TIMESTAMPTZ; UNIQUE(user_id, event_id); UNIQUE(event_id, sequence) |
| outbox | id PK; order_id FK orders; kind TEXT; payload JSONB; published_at? TIMESTAMPTZ |
| webhook_events | provider_event_id TEXT PK; payload JSONB; processed_at? TIMESTAMPTZ |
| idempotency_requests | user_id FK users; key TEXT; request_hash TEXT; result JSONB; PRIMARY KEY(user_id, key) |

Relationships: a user has many orders and queue entries; an event has many seats and queue entries; a seat has many historical orders but at most one active order; an order has at most one payment record and ticket. A payment record tracks one provider payment object, which may support repeated checkout interactions without creating a second charge. A seat has at most one ticket because resale/reissuance is outside scope. Add the seats-to-orders FK after both tables exist to resolve the schema's circular reference.

Important additional constraints/indexes:

```sql
-- Multiple expired attempts may exist, but only one active/paid claim per seat.
CREATE UNIQUE INDEX one_live_order_per_seat ON orders (seat_id)
WHERE state IN ('HELD', 'PAYMENT_PENDING', 'PAID');

CREATE INDEX seats_by_event_state ON seats (event_id, state);
CREATE INDEX orders_by_user_created ON orders (user_id, created_at DESC);
CREATE INDEX held_orders_by_expiry ON orders (expires_at) WHERE state = 'HELD';
```

Require non-null relationship/state/price fields. Add a seat CHECK tying AVAILABLE to a null current_order_id/expiry, HELD to a non-null current_order_id and expiry, and PAYMENT_PENDING/SOLD to a non-null current_order_id. A deferred constraint trigger validates that the current order refers back to that same seat and that order/seat states agree at commit; only the booking service's restricted database role can change inventory. Foreign keys alone do not enforce that cross-table state agreement.

### Acquiring a seat: one short transaction

1. Validate authentication, sale time, admission lease, and idempotency key. Begin a primary-database transaction. Lock the user's row first to serialize their concurrent purchase-limit checks; all booking paths use the same user → seat → order lock order.
2. Lock the selected seat using `SELECT ... FOR UPDATE`. Recheck the seat and current order after obtaining the lock, using database time. Do not trust the seat map, a replica, or a cache lock.
3. If its current HELD order has expired, mark that order EXPIRED and clear the seat claim in this transaction before reusing it. PAYMENT_PENDING and SOLD seats are not eligible for time-based reuse.
4. If still unavailable, roll back and return 409. Otherwise, check account purchase/active-hold limits, insert a HELD order, set current_order_id and state HELD on the seat, and set a five-minute expiry using database time.
5. Store the idempotent result and commit, then return 201. PostgreSQL's row lock makes another buyer wait; after the first commit, that buyer observes HELD and receives 409. The partial unique index and ticket-seat uniqueness provide additional protection if application code makes a mistake.

Transactions last milliseconds, not the five-minute user hold. Expiry workers use the same locking rules, recheck ownership/state/expiry after locking, and atomically expire an unpaid order and release only its own seat. Hold expiry is evaluated on acquisition too, so delayed cleanup does not permanently strand ordinary expired holds.

### Paying safely across an external service

1. Payment start locks user, seat, and order, verifies ownership and an unexpired HELD claim, and atomically changes both order and seat to PAYMENT_PENDING while creating a payment INITIATING record and outbox command. Then commit; do not hold database locks while calling the provider.
2. Start provider checkout outside the transaction using a deterministic payment idempotency key derived from the order. Duplicate requests/worker retries reuse the same provider payment object and return the existing checkout state.
3. PAYMENT_PENDING inventory is protected from the ordinary five-minute expiry worker. Give checkout a bounded provider expiry, for example ten minutes, but treat that deadline as a reason to reconcile/cancel the provider object, not permission to release a potentially paid seat.
4. Record verified signed webhooks durably, deduplicate by provider_event_id, and process them idempotently. Reconcile out-of-order events against the provider's current state; validate provider account, order reference, amount, and currency. The browser cannot mark an order paid.
5. On verified success, lock user → seat → order, confirm the seat still points to this PAYMENT_PENDING order, then set payment SUCCEEDED, order PAID, seat SOLD, and insert the uniquely constrained ticket plus notification outbox event in one transaction.
6. If that claim is no longer valid, never take a seat from another order: record REFUND_PENDING and refund the payment idempotently. On a confirmed terminal payment failure/cancellation, release the seat and mark the order CANCELLED in one transaction.
7. A timeout alone is not a failure. Keep uncertain payments reserved while a reconciliation worker queries the provider or obtains terminal cancellation; alert on long uncertainty. This can temporarily reduce availability, but prevents selling a seat while its earlier payment may still complete.

Race example: Alice and Bob choose seat A12 from the same cached map. Alice's transaction locks it first and commits a hold; Bob's transaction then checks the locked row and returns 409. If Alice starts payment before expiry, the seat remains reserved until that payment is resolved. No process frees it solely because a timer elapsed during an uncertain payment. Database transactions, constraints, and this payment state machine together prevent double-booking.

## 5. Architecture and surviving the sale

```text
[Browser] --hostname lookup--> [Redundant DNS]
    |
    v
[CDN + WAF / bot and rate controls] <-- public assets -- [Object storage]
    |
    +--> [Replicated waiting-room service] <--> [Durable ordered queue state]
    |        signed admission token + paced release
    v
[Multi-zone load balancer]
    |                     |
[App server A]       [App server B]       (autoscale stateless instances)
    +----------+----------+
               |
     +---------+----------------------+-------------------+
     |                                |                   |
[HA cache]                   [Primary SQL database]   [Read replica]
 public metadata /              |        |                 ^
 advisory seat maps             |        +--- async -------+
                                v
                       [Synchronous standby]

[Outbox publisher pool] <-- committed events -- [Primary SQL database]
          |
          v
[Replicated job queue] --> [Worker pool] --> [Email / payment provider]
                              |                    |
                              +--> [Database]      +-- signed webhook --> [App servers]
                              +--> [Dead-letter queue]
```

- **Browser:** Provides event browsing, queue position, checkout, and ticket views without treating displayed availability as a reservation.
- **DNS:** Resolves TicketHub's hostname through redundant managed infrastructure.
- **CDN:** Serves public images and event assets near users, absorbing browsing bursts.
- **WAF/bot/rate controls:** Limits abusive traffic and automated account activity before it consumes booking capacity.
- **Object storage:** Durably stores event artwork and static assets outside the transactional database.
- **Waiting-room service:** Assigns authenticated queue positions and admits shoppers at a controlled rate.
- **Durable ordered queue state:** Preserves queue membership, ordering, and admission leases across waiting-room restarts.
- **Load balancer:** Distributes admitted requests across healthy application instances in multiple zones.
- **App servers:** Authenticate requests, enforce admission and ownership, and run the short booking transactions.
- **HA cache:** Reduces repeated event/seat-map reads while remaining dispensable for authoritative booking decisions.
- **Primary SQL database:** Serializes inventory changes and durably stores orders, payments, and issued tickets.
- **Synchronous standby:** Allows fenced failover without losing acknowledged bookings after a single primary failure.
- **Read replica:** Offloads event and historical reads while immediate order checks and inventory decisions use the primary.
- **Outbox publisher pool:** Retries delivery of committed jobs so a database commit followed by a queue outage cannot lose payment/notification work.
- **Replicated job queue:** Buffers background work durably when downstream systems slow down.
- **Worker pool:** Reconciles payments, expires eligible holds, and sends notifications with idempotent retries.
- **Payment provider:** Collects payment details and reports verifiable payment outcomes without TicketHub storing card data.
- **Email service:** Sends purchase confirmations after ticket issuance without making delivery a prerequisite for owning a ticket.
- **Dead-letter queue:** Retains repeatedly failing background work for investigation and safe replay.

### Sale operation and failure handling

Warm public event caches before opening. Queue users already present at the published opening time by a random order assigned once and durably recorded; later arrivals join FIFO. This avoids rewarding millisecond refresh races. Admission tokens bind account, event, and expiry and cannot be transferred or reused to bypass purchase limits. Account-level controls reduce abuse but do not completely defeat people with multiple accounts.

Serve waiting-room polling at the edge and keep it away from the booking database. Scale public reads and app servers, but gate write admission based on database latency and lock contention; adding app servers cannot remove seat contention. Use per-account limits, bounded request queues, short lock timeouts with retry/backoff, and 429/503 responses instead of unbounded retries. Reserve capacity for ongoing checkouts and provider callbacks. Publish SOLD_OUT only when inventory is sold; when all seats are merely held, show that seats may return rather than claiming a final sell-out.

Run two or more app servers and workers across zones; use redundant load balancing, replicated cache/queue state, durable queue jobs, and health checks. Cache failure permits slower direct reads under tighter admission limits. Queue failure delays asynchronous work while the database outbox preserves commands. Database failover must fence the old primary before promoting the synchronous standby; do not sell from an asynchronous replica during uncertainty. If durable queue ordering/admission state is unavailable, pause new admissions and preserve existing positions. Payment outages keep uncertain reservations unavailable until reconciliation. Encrypted backups and recovery drills cover larger disasters; monitor inventory invariants and audit every state transition. There is no claim of uninterrupted purchases during a complete regional/database outage.

### Critical verification scenarios

- Run 1,000 concurrent hold attempts against one seat: exactly one succeeds and all others get conflicts, with one active order.
- Race expiry with payment start: row locks permit either expiry or PAYMENT_PENDING, never release after successful payment start.
- Replay payment requests and duplicate/out-of-order webhooks: one provider payment object, one ticket, and one notification event per intended transition.
- Crash after database commit but before enqueue: the outbox republishes safely; crash after a provider call but before recording its result: the same provider key reconciles the existing payment.
- Fail over the primary during checkout, saturate admission, and lose cache/queue services: verify preserved inventory, bounded latency, durable positions, and clear retry messaging.

## 6. Trade-offs

1. **Strict correctness versus availability:** Stop booking when the authoritative database or payment outcome is uncertain, sacrificing some sales speed to avoid two owners of one seat.
2. **Waiting-room fairness versus immediate access:** Durable ordering and paced admission keep the sale usable and reduce refresh races, but many people must wait and bot controls cannot guarantee one human per account.
3. **Five-minute holds versus inventory utilization:** Holds give buyers time to pay, but abandoned reservations temporarily hide seats; expire unpaid holds promptly and reconcile pending payments before release.
4. **Cached maps versus freshness:** CDN/cache/replica reads absorb the burst, but displayed seats may already be held; timestamp maps, use short cache lifetimes, and let the primary transaction make the final decision.
5. **Single authoritative writer versus write scaling:** Row locking and SQL constraints simplify booking correctness, but a hot event can contend on inventory; admission control and per-seat locks are the first response, with event-based partitioning only after measurement.

## Technical references

PostgreSQL documents that row locks block conflicting writers/lockers until the transaction ends: [Explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html). The payment design follows provider guidance on [idempotent requests](https://docs.stripe.com/api/idempotent_requests) and [verified, duplicate-safe webhook handling](https://docs.stripe.com/webhooks); Stripe is an illustrative provider rather than a required vendor.
