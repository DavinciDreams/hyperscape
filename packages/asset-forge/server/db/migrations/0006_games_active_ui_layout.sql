-- Active UI layout per game.
--
-- Adds a nullable `active_ui_layout_id` column on `games` so each game can
-- point at exactly one UI layout in `ui_layouts`. When set, the game's client
-- (booted with studio context) fetches that layout and renders it as the HUD,
-- instead of the hand-coded default layout.
--
-- No foreign key: we don't want deleting a layout to be blocked by it being
-- "active" somewhere, and the client already handles missing / stale ids
-- defensively (falls back to DEFAULT_UI_LAYOUT).

ALTER TABLE "games"
  ADD COLUMN "active_ui_layout_id" text;
