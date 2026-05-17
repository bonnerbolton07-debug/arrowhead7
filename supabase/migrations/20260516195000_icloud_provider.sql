-- =============================================================================
-- Arrowhead 7 — Allow iCloud as a cloud_connections provider
-- =============================================================================
-- iCloud Drive uses a "share-link" connection mode (no OAuth token) — Apple
-- doesn't expose a public OAuth API for Drive. The provider value is still
-- needed so the Vault page can light up the iCloud card as connected.

ALTER TABLE public.cloud_connections
  DROP CONSTRAINT IF EXISTS cloud_connections_provider_check;

ALTER TABLE public.cloud_connections
  ADD CONSTRAINT cloud_connections_provider_check
  CHECK (provider IN ('google_drive', 'dropbox', 'onedrive', 'box', 'icloud'));
