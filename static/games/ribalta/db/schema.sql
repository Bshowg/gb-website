-- Ribalta — schema for gianmd_ribalta
-- Run this from phpMyAdmin with the gianmd_ribalta database selected
-- (or uncomment the USE line below).
-- USE gianmd_ribalta;

CREATE TABLE scripts (
  id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,

  -- Fork lineage --------------------------------------------------------
  -- parent_id: the script this one was forked from (NULL = not a fork).
  -- root_id:   the original ancestor of the whole family (NULL = this IS
  --            an original). Denormalized on purpose: fetching an original
  --            plus every derivation is one indexed query, no recursion.
  parent_id   INT UNSIGNED    NULL,
  root_id     INT UNSIGNED    NULL,

  -- Catalog metadata (what index.json used to hold) ---------------------
  title       VARCHAR(255)    NOT NULL,
  mode        ENUM('lettura','improv') NOT NULL DEFAULT 'lettura',
  language    VARCHAR(8)      NOT NULL DEFAULT 'it',
  collection  VARCHAR(255)    NULL,       -- replaces manifest folders/series (e.g. 'mechapio')
  actors      TINYINT UNSIGNED NOT NULL DEFAULT 0,
  scenes      TINYINT UNSIGNED NOT NULL DEFAULT 0,

  -- Authorship (no login system yet: free-text nickname) ----------------
  author      VARCHAR(100)    NULL,
  fork_note   VARCHAR(255)    NULL,       -- one line: what this fork changes

  -- The script itself: the full JSON document, same shape as the files
  -- (title, language, mode, description, characters[], preparation, scenes[])
  content     JSON            NOT NULL,

  created_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_parent (parent_id),
  KEY idx_root   (root_id),
  KEY idx_mode_collection (mode, collection),

  CONSTRAINT fk_scripts_parent FOREIGN KEY (parent_id) REFERENCES scripts (id) ON DELETE RESTRICT,
  CONSTRAINT fk_scripts_root   FOREIGN KEY (root_id)   REFERENCES scripts (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
