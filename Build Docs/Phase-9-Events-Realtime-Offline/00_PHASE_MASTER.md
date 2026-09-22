# Phase 9 Master — Business Events, Realtime & Offline

Read prior phases and decision register.

Implement durable business events with:
event_id, event_type, aggregate_type/id, actor, occurred_at, recorded_at, sequence/version, payload, correlation_id, causation_id, schema_version.

Separate durable business facts from ephemeral UI notifications.

Provide replay/reconciliation strategy and idempotent consumers.

Realtime is a delivery layer, never the source of truth.

Expose connected/reconnecting/stale/offline states.

If offline scanning is enabled, implement:
local command ID → queue → reconnect → server validation → idempotent commit → acknowledgement/rejection.

Make online-only vs queued-offline policy explicit/configurable rather than silently mixing behaviors.

Test websocket outage, reconnect, missed events, duplicate commands, out-of-order delivery and offline synchronization.
