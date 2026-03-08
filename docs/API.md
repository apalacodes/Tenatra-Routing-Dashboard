# Tenatra EV Simulation — API Contract

## Base URL
- **Local dev:** `http://localhost:3001/api`
- **Production:** `https://your-domain.com/api`

---

## REST Endpoints

### Stations

#### `GET /api/stations`
Returns all active stations from the database.

**Response**
```json
{
  "stations": [
    {
      "id": "uuid",
      "name": "Tenatra Hub Alpha",
      "latitude": 27.7172,
      "longitude": 85.3240,
      "kw_power": 150,
      "total_slots": 4,
      "occupied_slots": 1,
      "network_name": "Tenatra",
      "address": "Kathmandu, Nepal"
    }
  ]
}
```

---

#### `PATCH /api/stations/:id/slots`
Update slot occupancy for a station. Also broadcasts a WebSocket event.

**Request body**
```json
{
  "slots": [
    { "occupied": true  },
    { "occupied": false },
    { "occupied": false }
  ]
}
```

**Response** — updated station with slot array.

---

#### `POST /api/stations`
Create a new station in the database.

**Request body**
```json
{
  "name": "New Station",
  "latitude": 27.72,
  "longitude": 85.33,
  "kw_power": 100,
  "total_slots": 3,
  "network_name": "Tenatra",
  "address": "Ring Road, Kathmandu"
}
```

---

### Maps (Google Maps Proxy)

#### `GET /api/maps/route`
Get a driving route between two coordinates.

**Query params**
| Param | Required | Description |
|-------|----------|-------------|
| `origin_lat` | ✅ | Start latitude |
| `origin_lng` | ✅ | Start longitude |
| `dest_lat` | ✅ | End latitude |
| `dest_lng` | ✅ | End longitude |
| `mode` | ❌ | `driving` (default) / `walking` |

**Response**
```json
{
  "distance_meters": 3400,
  "duration_seconds": 480,
  "polyline": "encoded_string",
  "steps": [
    { "instruction": "Head north", "distance_meters": 200, "duration_seconds": 30 }
  ]
}
```

---

#### `GET /api/maps/nearby-stations`
Find EV charging stations near a coordinate via Google Places.

**Query params:** `lat`, `lng`, `radius` (meters, default 5000)

---

## WebSocket

**URL:** `ws://localhost:3001/ws`

### Server → Client messages

#### `slot_update`
Sent whenever a station's slot status changes.
```json
{
  "type": "slot_update",
  "stationDbId": "uuid",
  "slots": [
    { "occupied": true  },
    { "occupied": false },
    { "occupied": true  }
  ]
}
```

#### `connected`
Sent on successful connection.
```json
{ "type": "connected", "message": "Tenatra live slot feed active" }
```

### Client → Server messages

#### `ping`
Keep-alive ping.
```json
{ "type": "ping" }
```

---

## Database Schema

```sql
-- Stations table
CREATE TABLE stations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(100) NOT NULL,
  latitude       DOUBLE PRECISION NOT NULL,
  longitude      DOUBLE PRECISION NOT NULL,
  kw_power       INTEGER DEFAULT 50,
  total_slots    INTEGER DEFAULT 3,
  occupied_slots INTEGER DEFAULT 0,
  network_name   VARCHAR(100),
  address        TEXT,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Slot event log (for analytics / history)
CREATE TABLE slot_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id  UUID REFERENCES stations(id),
  slot_index  INTEGER,
  occupied    BOOLEAN,
  car_id      VARCHAR(50),
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Car charging sessions
CREATE TABLE car_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id  VARCHAR(100),
  battery_pct NUMERIC(5,2),
  latitude    DOUBLE PRECISION,
  longitude   DOUBLE PRECISION,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
```
