# QuickNotes data model

Use PostgreSQL. Each user owns many notes and many tags (one-to-many). Notes and tags have a many-to-many relationship through note_tags. All timestamps use UTC. API authentication resolves the current user; every query includes their user ID.

## Entities and SQL definitions

The following statements define every column's type, primary keys, foreign keys, defaults, and constraints. Emails are normalized to lowercase before insertion; passwords are stored only as secure password hashes.

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(254) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(100) NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
    body TEXT NOT NULL DEFAULT '' CHECK (char_length(body) <= 10000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (id, user_id)
);

CREATE TABLE tags (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name),
    UNIQUE (id, user_id)
);

CREATE TABLE note_tags (
    note_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id),
    FOREIGN KEY (note_id, user_id) REFERENCES notes(id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id, user_id) REFERENCES tags(id, user_id) ON DELETE CASCADE
);

CREATE INDEX idx_notes_user_created ON notes (user_id, created_at DESC, id DESC);
CREATE INDEX idx_note_tags_user_tag ON note_tags (user_id, tag_id, note_id);
```

The composite foreign keys in note_tags ensure a tag and note belong to the same user. Deleting a user removes their notes and tags; deleting a note or tag removes its associations. The API sets updated_at on every note update; the default only covers insertion. Tag uniqueness is case-sensitive in this initial design.

## Index reasons

`idx_notes_user_created` supports the common user-scoped, newest-first note listing and cursor pagination without sorting all notes. `idx_note_tags_user_tag` supports filtering a user's notes by tag and reverse lookups; the junction primary key already supports looking up tags by note. Primary and UNIQUE constraints also create indexes automatically.

## Example queries

Use bound parameters, never SQL string concatenation. `$1` represents the authenticated user ID.

### 1. First page of owned notes

```sql
SELECT id, title, body, created_at, updated_at
FROM notes
WHERE user_id = $1
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

For subsequent pages, add `AND (created_at, id) < ($2::timestamptz, $3::bigint)` using the decoded cursor before ORDER BY.

### 2. Create a note

```sql
INSERT INTO notes (user_id, title, body)
VALUES ($1, $2, $3)
RETURNING id, user_id, title, body, created_at, updated_at;
```

### 3. Find notes with a particular tag (JOIN)

```sql
SELECT n.id, n.title, n.body, t.name AS tag
FROM notes AS n
JOIN note_tags AS nt ON nt.note_id = n.id AND nt.user_id = n.user_id
JOIN tags AS t ON t.id = nt.tag_id AND t.user_id = nt.user_id
WHERE n.user_id = $1 AND t.id = $2
ORDER BY n.created_at DESC, n.id DESC
LIMIT 10;
```

### 4. Update an owned note

```sql
UPDATE notes
SET title = $2, body = $3, updated_at = NOW()
WHERE user_id = $1 AND id = $4
RETURNING id, title, body, updated_at;
```

### 5. Delete an owned note

```sql
DELETE FROM notes WHERE user_id = $1 AND id = $2 RETURNING id;
```

## SQL versus NoSQL

SQL fits because ownership, notes, tags, and their associations have clear relationships, and foreign keys and transactions enforce those relationships reliably. PostgreSQL provides joins, constraints, indexes, and atomic updates without duplicating tag data throughout notes. A document database could make some whole-note reads convenient and scale writes through partitioning, but cross-document relationships and consistency would require more application logic. Start with indexed SQL and replicas; partition or shard only when measured capacity requires it.

For reliable background jobs, the implementation also needs an operational outbox table, separate from these four core domain entities; its event and note write commit in the same transaction.
