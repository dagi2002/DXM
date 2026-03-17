# DXM Pulse — Backend

Express.js REST API server for DXM Pulse. Serves session recordings, metrics, alerts, and users to the frontend.

---

## Running

```bash
# Development (auto-restarts on file changes via nodemon)
npm run dev

# Production
npm start
```

Server listens on **port 4000** by default. Set the `PORT` environment variable to override.

---

## API Endpoints

### Sessions

| Method | Path | Description |
|---|---|---|
| `GET` | `/sessions` | Returns all recorded sessions (summarised — no raw events in list view) |
| `GET` | `/sessions/:id` | Returns a single session including all events |
| `POST` | `/sessions` | Create or update a session recording |

#### `POST /sessions` — Request Body

```json
{
  "sessionId": "string (required)",
  "events": [
    {
      "type": "mousemove | click | scroll | navigation | hover",
      "timestamp": 12345,
      "x": 640,
      "y": 480,
      "scrollX": 0,
      "scrollY": 300,
      "button": 0,
      "target": "button#submit"
    }
  ],
  "metadata": {
    "url": "https://example.com/page",
    "userId": "user_123",
    "userAgent": "Mozilla/5.0 ...",
    "language": "en-US",
    "screen": { "width": 1440, "height": 900 }
  },
  "completed": false,
  "startedAt": "2024-07-09T14:05:00.000Z",
  "endedAt": "2024-07-09T14:32:00.000Z"
}
```

All fields except `sessionId` are optional. Calling `POST /sessions` multiple times with the same `sessionId` merges events and metadata.

#### Session Recording Response Shape (`GET /sessions` items)

```json
{
  "id": "string",
  "startedAt": "ISO 8601 timestamp",
  "endedAt": "ISO 8601 timestamp | undefined",
  "duration": 127,
  "metadata": {
    "url": "string",
    "device": "desktop | mobile | tablet",
    "browser": "Chrome | Safari | Firefox | Edge | Unknown",
    "language": "string",
    "screen": { "width": 1440, "height": 900 },
    "userAgent": "string",
    "referrer": "string | undefined",
    "timezone": "string | undefined",
    "devicePixelRatio": 2
  },
  "stats": {
    "clicks": 14,
    "scrollDepth": 820,
    "totalEvents": 312
  },
  "events": [],
  "updatedAt": "ISO 8601 timestamp",
  "completed": true
}
```

> `events` is empty in the list response and populated in `GET /sessions/:id`.

---

### User Flow

| Method | Path | Description |
|---|---|---|
| `GET` | `/userflow` | Computes page-to-page transition percentages from all session events |

#### Response Shape

```json
[
  {
    "page": "/home",
    "users": 42,
    "next": [
      { "target": "/products", "percent": 55 },
      { "target": "exit", "percent": 45 }
    ]
  }
]
```

---

### Metrics

| Method | Path | Description |
|---|---|---|
| `GET` | `/metrics` | Returns KPI metric cards from `data.json` |

#### `data.json` — Metric Entry Schema

```json
{
  "name": "string",
  "value": "number | string",
  "change": -4.1,
  "trend": "up | down | stable"
}
```

---

### Alerts

| Method | Path | Description |
|---|---|---|
| `GET` | `/alerts` | Returns alerts from `data.json` |

#### `data.json` — Alert Entry Schema

```json
{
  "id": "string",
  "type": "error | performance | frustration | conversion",
  "severity": "low | medium | high | critical",
  "title": "string",
  "description": "string",
  "timestamp": "ISO 8601 timestamp",
  "resolved": false,
  "affectedSessions": 98
}
```

---

### Users

| Method | Path | Description |
|---|---|---|
| `GET` | `/users` | Returns platform users from `data.json` |

#### `data.json` — User Entry Schema

```json
{
  "id": "string",
  "name": "string",
  "email": "string",
  "role": "admin | analyst | viewer",
  "avatar": "URL string (optional)",
  "lastLogin": "ISO 8601 timestamp"
}
```

---

## Data Files

| File | Purpose | Written by |
|---|---|---|
| `data.json` | Seed data for metrics, alerts, and users | Manually edited |
| `sessions.json` | Live session recordings from browser SDK | Server (`POST /sessions`) |

Both files are plain JSON. Do not edit `sessions.json` by hand while the server is running — concurrent writes are not safe. For production use, replace file-based storage with a proper database (SQLite or PostgreSQL recommended).

---

## Seeding Test Sessions

```bash
node seedUserFlows.js
```

Appends synthetic session data to `sessions.json`, useful for testing heatmaps and user flow with meaningful data before real traffic arrives.
