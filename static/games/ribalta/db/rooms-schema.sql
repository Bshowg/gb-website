-- Ribalta — multiplayer "regia" tables (host drives, phones follow).
-- Run ONCE in phpMyAdmin with the gianmd_ribalta database selected.
-- The `scripts` table (schema.sql) must already exist: rooms.script_id references it.
-- These tables are additive; nothing in the existing single-device flow depends on them.

CREATE TABLE rooms (
  code        CHAR(4)          NOT NULL,   -- join code, unambiguous alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789
  host_token  CHAR(32)         NOT NULL,   -- secret held only by the director; required to drive/close
  script_id   INT UNSIGNED     NULL,       -- the script the room is playing
  `view`      VARCHAR(16)      NOT NULL DEFAULT 'lobby', -- lobby|characters|prep|playback|readall|end
  scene_idx   INT              NOT NULL DEFAULT 0,
  beat_idx    INT              NOT NULL DEFAULT 0,
  rev         INT UNSIGNED     NOT NULL DEFAULT 1,        -- bumped on every push; cheap change-detect for pollers
  host_name   VARCHAR(100)     NULL,
  created_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (code),
  KEY idx_updated (updated_at),
  CONSTRAINT fk_rooms_script FOREIGN KEY (script_id) REFERENCES scripts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE room_members (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  room_code    CHAR(4)         NOT NULL,
  member_token CHAR(32)        NOT NULL,   -- identifies this device (for heartbeat / rejoin)
  name         VARCHAR(100)    NULL,
  characters   JSON            NULL,       -- array of character names this device plays
  is_host      TINYINT(1)      NOT NULL DEFAULT 0,
  last_seen    TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uniq_member (room_code, member_token),
  KEY idx_room (room_code),
  CONSTRAINT fk_member_room FOREIGN KEY (room_code) REFERENCES rooms (code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
