# Day 7: SnapShare scaling plan

SnapShare lets users upload photos and browse a feed of photos from people they follow.

## 1. Assumptions and daily active users

- Registered users: 10,000,000; 10% are active each day.
- Daily active users (DAU): 10,000,000 × 0.10 = **1,000,000**.
- Each active user uploads 1 photo and views 50 feed pages per day.
- Each original photo averages 2 MB and has one 50 KB thumbnail.
- Use decimal units: 1 MB = 1,000 KB and 1 TB = 1,000,000 MB.
- A day has 86,400 seconds; a year has 365 days.
- Activity stays constant for the year, all uploads are retained, and peak traffic is 5 times average traffic.
- One feed view means one feed-page request, not one individual image request; image traffic depends on the number of photos per page and cache hits.
- Storage estimates include original photos and thumbnails, but exclude metadata, backups, replication, and other overhead.

## 2. Traffic and annual storage estimates

| Measure | Calculation | Result |
| --- | --- | --- |
| Uploads per day | 1,000,000 × 1 | 1,000,000 uploads |
| Average uploads per second | 1,000,000 ÷ 86,400 | **11.57 uploads/s** |
| Peak uploads per second | 11.574074… × 5 | **57.87 uploads/s** |
| Feed views per day | 1,000,000 × 50 | 50,000,000 feed views |
| Average feed views per second | 50,000,000 ÷ 86,400 | **578.70 views/s** |
| Peak feed views per second | 578.703703… × 5 | **2,893.52 views/s** |
| Photos uploaded per year | 1,000,000 × 365 | 365,000,000 photos |
| Original-photo storage per year | 365,000,000 × 2 MB | **730 TB** |
| Thumbnail storage per year | 365,000,000 × 0.05 MB | **18.25 TB** |
| Total new image storage per year | 365,000,000 × 2.05 MB | **748.25 TB/year** |

Daily image storage grows by 2.05 TB. These are planning estimates, not exact capacity requirements; production capacity also needs overhead and headroom.

## 3. Read-heavy design

SnapShare is **read-heavy**: it receives 50 feed-page reads for every photo upload. Actual database operations depend on the implementation, but feed browsing clearly dominates the stated workload. Cache frequently requested feed data, serve images through a CDN, and use a database read replica for read queries to reduce pressure on the primary database. App servers can scale horizontally to handle peak requests.

## 4. Where photos belong

Store photo files and thumbnails in **object storage**, not inside the database. Large binary files would increase database size, backup time, and replication traffic while competing with queries for users, follows, and feeds. Object storage handles large files and integrates with a CDN; the database stores only metadata such as photo ID, owner ID, object keys, caption, creation time, and processing status.

## 5. Architecture diagram

```text
                         +------------------+
                         | Users / clients  |
                         +------------------+
                           |              |
            API requests   |              | Image requests
                           v              v
                   +---------------+   +--------+
                   | Load balancer |   |  CDN   |
                   +---------------+   +--------+
                           |              | Cache miss: fetch image
                           v              v
                   +---------------+   +------------------+
                   | App servers   |-->| Object storage   |
                   | (multiple)    |   | originals +      |
                   +---------------+   | thumbnails       |
                     |    |    |       +------------------+
        feed cache   |    |    |                ^
                     v    |    | enqueue job    | Read original /
                 +-------+|    v                | write thumbnail
                 | Cache || +---------+    +------------------+
                 +-------+| |  Queue  |--->| Thumbnail worker |
                          | +---------+    +------------------+
             metadata     |                       |
             writes       v                       | Update status
                   +------------------+ <---------+
                   | Primary database |
                   +------------------+
                           | Replication
                           v
                   +------------------+
                   | Read replica     |
                   +------------------+
                           ^
                           | Feed reads on cache miss
                      App servers
```

Arrows show request or data-flow direction; app servers write original photo files to object storage and route database reads according to consistency needs.

## 6. What each component solves

- **CDN:** Caches photos and thumbnails near users to reduce download latency and object-storage traffic.
- **Load balancer:** Distributes incoming API requests across healthy app servers so one server does not become a bottleneck.
- **App servers:** Authenticate users, validate uploads, enforce access rules, and coordinate photo and feed requests.
- **Cache:** Keeps frequently requested feed data in memory to reduce database reads and speed up responses.
- **Primary database:** Stores authoritative user, follow, and photo metadata and accepts metadata writes.
- **Read replica:** Serves feed-related read queries to reduce the primary database's read workload.
- **Object storage:** Stores large original photo files and thumbnails durably without bloating the metadata database.
- **Queue:** Buffers thumbnail jobs so uploads do not have to wait for image processing and workers can absorb bursts.
- **Thumbnail worker:** Processes queued jobs to create thumbnails and update each photo's processing status.

## 7. Upload flow, including thumbnail creation

1. The client sends an authenticated upload request through the load balancer to an app server.
2. The app server checks the user's permission, file type, and file size, then creates a unique photo ID and object key.
3. The app server writes the original photo to object storage and confirms the write succeeded.
4. The app server records the photo's metadata in the primary database with a `processing` status and records a thumbnail job in an outbox table in the same database transaction.
5. An app-server background publisher sends the outbox job to the queue and marks it sent after confirmation, retrying failed sends so a committed photo is not left without a job.
6. The app server returns the photo ID and processing status to the client without waiting for thumbnail creation.
7. A thumbnail worker takes the job from the queue, reads the original from object storage, creates the approximately 50 KB thumbnail, and writes it to a deterministic thumbnail object key.
8. The worker updates the primary database with the thumbnail key and `ready` status, invalidates affected feed-cache entries, and acknowledges the queue job only after successful processing.
9. Feed requests fetch ready photos from cache or the read replica, using follow relationships to choose photos, and return image URLs that the client loads through the CDN.

Use the photo ID to make processing idempotent: retrying a job overwrites the same thumbnail and safely repeats the status update. Retry temporary failures and move repeatedly failing jobs to a dead-letter queue for investigation. A failed metadata transaction after file storage can leave an orphaned object, which a periodic cleanup task removes. Immediately after uploading, the user's status request can read the primary database to avoid replica lag.

## 8. Trade-offs

1. **Caching versus freshness:** Caches and a CDN make reads faster and cheaper, but users may briefly see stale data; cache invalidation, short feed-cache lifetimes, and versioned image keys improve freshness at the cost of extra work and cache misses.
2. **Read replicas versus consistency:** Replicas increase read capacity, but replication lag can delay a new photo appearing in a feed; reading the primary for the uploader's immediate status gives fresher results while adding primary load.
3. **Asynchronous thumbnails versus immediate availability:** A queue keeps uploads responsive and smooths processing bursts, but thumbnails appear later and the system must handle retries, duplicate jobs, and processing failures.
4. **Object storage versus transactional simplicity:** Keeping files outside the database scales image storage independently, but file writes and metadata writes are not one atomic transaction, so the system needs processing states and orphan cleanup.
