# Profile Apply Flow

Profile apply uses the dashboard API:

```text
POST /api/config/profile/apply
```

The response includes the active `projectRoot`, `envPath`, changed keys, before/after values, backup path, `writeVerified`, and refreshed snapshot.

The `.env` writer preserves comments, writes through a temp file, creates `.env.bak-YYYYMMDD-HHMMSS`, and verifies every requested key after write.
