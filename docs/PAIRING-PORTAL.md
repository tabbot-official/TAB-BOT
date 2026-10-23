# Pairing portal and other clients

The pairing portal is **not built yet**. This page describes how it, the web panel and a mobile app will use the API, so they can be built without changing the bot.

## Principle

Clients never read the bot's files or database. They call `/api/v1/` with an API key (server to server) or a short lived JWT (browser or app). The portal backend holds a `service` or `admin` key; the browser never sees it.

## Planned pairing flow

```
User enters a WhatsApp number on the portal
  -> portal backend: POST /api/v1/pairing/requests {"number": "919876543210"}
  -> API asks the WhatsApp connection service for a pairing code
  -> portal shows the code; user enters it in WhatsApp > Linked devices
  -> portal backend polls GET /api/v1/pairing/requests/{id} until status is "paired"
  -> GET /api/v1/sessions/{id} shows the new session status
```

Today `GET /pairing/capabilities` answers `supported: false` and `POST /pairing/requests` answers 501. The first version of the portal relays to the existing single paired session; true multi-session pairing needs more RAM and is a later step. When it ships, the endpoints above keep their shape.

## Status updates without polling

Register a webhook for `connection.changed` and `session.revoked`. The portal verifies the HMAC signature (see `docs/API.md`) and updates its UI.

## Panel and mobile app

- Dashboard: read `/bot/status`, `/bot/runtime`, `/sessions`.
- Owner actions (restart, logout) need an `owner` role and an explicit `confirm: true`.
- Browser clients need their origin in `API_CORS_ORIGINS`, and use a JWT from `POST /auth/token`, not the raw key.
