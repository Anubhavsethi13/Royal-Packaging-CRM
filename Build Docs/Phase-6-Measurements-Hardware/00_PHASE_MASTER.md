# Phase 6 Master — Units, Measurements & Hardware

Read prior phases and decision register.

Implement a unit/measurement model for quantity, weight and volume without assuming the business-authoritative measurement.

Preserve raw input and normalized values with source, device, actor and timestamp.

Model handling units such as pallets/skids/crates.

Create hardware adapter boundaries for:
- scanner
- scale
- printer
- RFID

Do not spread hardware-specific logic into domain services.

Support invalid/unknown/wrong/duplicate scans and offline-compatible command interfaces if offline mode is later enabled.

If direct scale integration is not confirmed, implement adapter contracts and simulated development adapters rather than pretending physical integration exists.

Add tests with mocked devices.
