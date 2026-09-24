<?php
/**
 * Ribalta API — single endpoint, action-based.
 *
 *   GET  api.php?action=list[&mode=lettura|improv]   -> catalog rows (no content)
 *   GET  api.php?action=get&id=N                     -> full row incl. content
 *   POST api.php?action=create                       -> body {content, collection?, author?}
 *   POST api.php?action=update&id=N                  -> body {content, collection?, author?}
 *   POST api.php?action=fork&id=N                    -> body {author?, fork_note?}
 *   POST api.php?action=delete&id=N
 *
 * All responses are JSON. Mutations recompute title/mode/language/actors/scenes
 * from the content document, so the catalog columns can never drift from the script.
 */

header('Content-Type: application/json; charset=utf-8');

$config = require __DIR__ . '/config.php';

function fail($code, $msg) {
  http_response_code($code);
  echo json_encode(array('error' => $msg), JSON_UNESCAPED_UNICODE);
  exit;
}

try {
  $pdo = new PDO($config['dsn'], $config['user'], $config['pass'], array(
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ));
} catch (PDOException $e) {
  fail(500, 'Connessione al database fallita');
}

function readBody() {
  $raw = file_get_contents('php://input');
  $data = json_decode($raw, true);
  if (!is_array($data)) fail(400, 'Body JSON non valido');
  return $data;
}

function requireId() {
  if (!isset($_GET['id']) || !ctype_digit((string)$_GET['id'])) fail(400, 'Parametro id mancante o non valido');
  return (int)$_GET['id'];
}

// ---- Multiplayer "regia" helpers -------------------------------------------

function genToken() {
  return bin2hex(random_bytes(16)); // 32 hex chars
}

function genRoomCode() {
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  $code = '';
  for ($i = 0; $i < 4; $i++) $code .= $alphabet[random_int(0, strlen($alphabet) - 1)];
  return $code;
}

function requireRoom($pdo, $code) {
  $stmt = $pdo->prepare('SELECT * FROM rooms WHERE code = ?');
  $stmt->execute(array($code));
  $room = $stmt->fetch();
  if (!$room) fail(404, 'Stanza non trovata');
  return $room;
}

function roomStateOut($room) {
  return array(
    'code'      => $room['code'],
    'script_id' => $room['script_id'] === null ? null : (int)$room['script_id'],
    'view'      => $room['view'],
    'scene_idx' => (int)$room['scene_idx'],
    'beat_idx'  => (int)$room['beat_idx'],
    'rev'       => (int)$room['rev'],
  );
}

function reqStr($body, $key, $max = 255) {
  return isset($body[$key]) && $body[$key] !== '' ? mb_substr((string)$body[$key], 0, $max) : null;
}

/**
 * Validate the request body and derive the catalog columns.
 * title/language are row columns, NOT part of the stored content document:
 * they arrive as top-level body fields and are stripped from content if present.
 * Returns array(meta..., 'content' => cleaned content).
 */
function metaFromBody($body) {
  $content = isset($body['content']) ? $body['content'] : null;
  if (!is_array($content)) fail(400, 'content mancante o non valido');
  $title = isset($body['title']) ? trim((string)$body['title']) : '';
  if ($title === '' && isset($content['title'])) $title = trim((string)$content['title']);
  if ($title === '') fail(400, 'Il copione deve avere un titolo');
  $language = isset($body['language']) && $body['language'] !== '' ? (string)$body['language'] : '';
  if ($language === '' && isset($content['language'])) $language = (string)$content['language'];
  if ($language === '') $language = 'it';
  if (!isset($content['characters']) || !is_array($content['characters']) || count($content['characters']) === 0) {
    fail(400, 'characters deve essere un array non vuoto');
  }
  if (!isset($content['scenes']) || !is_array($content['scenes']) || count($content['scenes']) === 0) {
    fail(400, 'scenes deve essere un array non vuoto');
  }
  unset($content['title'], $content['language']);
  return array(
    'title'    => mb_substr($title, 0, 255),
    'mode'     => (isset($content['mode']) && $content['mode'] === 'improv') ? 'improv' : 'lettura',
    'language' => mb_substr($language, 0, 8),
    'actors'   => count($content['characters']),
    'scenes'   => count($content['scenes']),
    'content'  => $content,
  );
}

function rowOut($row, $withContent = false) {
  $out = array(
    'id'         => (int)$row['id'],
    'parent_id'  => $row['parent_id'] === null ? null : (int)$row['parent_id'],
    'root_id'    => $row['root_id'] === null ? null : (int)$row['root_id'],
    'title'      => $row['title'],
    'mode'       => $row['mode'],
    'language'   => $row['language'],
    'collection' => $row['collection'],
    'actors'     => (int)$row['actors'],
    'scenes'     => (int)$row['scenes'],
    'author'     => $row['author'],
    'fork_note'  => $row['fork_note'],
    'created_at' => $row['created_at'],
    'updated_at' => $row['updated_at'],
  );
  if ($withContent) {
    $out['content'] = json_decode($row['content'], true);
  }
  return $out;
}

$action = isset($_GET['action']) ? $_GET['action'] : '';
$method = $_SERVER['REQUEST_METHOD'];

switch ($action) {

  case 'list': {
    if ($method !== 'GET') fail(405, 'Usa GET');
    $sql = 'SELECT id, parent_id, root_id, title, mode, language, collection, actors, scenes,
                   author, fork_note, created_at, updated_at
            FROM scripts';
    $params = array();
    if (isset($_GET['mode']) && in_array($_GET['mode'], array('lettura', 'improv'), true)) {
      $sql .= ' WHERE mode = ?';
      $params[] = $_GET['mode'];
    }
    $sql .= ' ORDER BY collection IS NOT NULL, collection, title, id';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = array();
    foreach ($stmt->fetchAll() as $r) $rows[] = rowOut($r);
    echo json_encode($rows, JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'get': {
    if ($method !== 'GET') fail(405, 'Usa GET');
    $id = requireId();
    $stmt = $pdo->prepare('SELECT * FROM scripts WHERE id = ?');
    $stmt->execute(array($id));
    $row = $stmt->fetch();
    if (!$row) fail(404, 'Copione non trovato');
    echo json_encode(rowOut($row, true), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'create': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $body = readBody();
    $meta = metaFromBody($body);
    $stmt = $pdo->prepare(
      'INSERT INTO scripts (title, mode, language, collection, actors, scenes, author, content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $stmt->execute(array(
      $meta['title'], $meta['mode'], $meta['language'],
      isset($body['collection']) && $body['collection'] !== '' ? mb_substr((string)$body['collection'], 0, 255) : null,
      $meta['actors'], $meta['scenes'],
      isset($body['author']) && $body['author'] !== '' ? mb_substr((string)$body['author'], 0, 100) : null,
      json_encode($meta['content'], JSON_UNESCAPED_UNICODE),
    ));
    echo json_encode(array('id' => (int)$pdo->lastInsertId()), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'update': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $id = requireId();
    $body = readBody();
    $meta = metaFromBody($body);
    $stmt = $pdo->prepare(
      'UPDATE scripts
       SET title = ?, mode = ?, language = ?, collection = ?, actors = ?, scenes = ?, author = ?, content = ?
       WHERE id = ?');
    $stmt->execute(array(
      $meta['title'], $meta['mode'], $meta['language'],
      isset($body['collection']) && $body['collection'] !== '' ? mb_substr((string)$body['collection'], 0, 255) : null,
      $meta['actors'], $meta['scenes'],
      isset($body['author']) && $body['author'] !== '' ? mb_substr((string)$body['author'], 0, 100) : null,
      json_encode($meta['content'], JSON_UNESCAPED_UNICODE),
      $id,
    ));
    if ($stmt->rowCount() === 0) {
      // Row may exist with identical data: verify existence before declaring 404.
      $check = $pdo->prepare('SELECT id FROM scripts WHERE id = ?');
      $check->execute(array($id));
      if (!$check->fetch()) fail(404, 'Copione non trovato');
    }
    echo json_encode(array('id' => $id), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'fork': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $id = requireId();
    $body = readBody();
    $stmt = $pdo->prepare(
      'INSERT INTO scripts (parent_id, root_id, title, mode, language, collection, actors, scenes, author, fork_note, content)
       SELECT id, COALESCE(root_id, id), title, mode, language, collection, actors, scenes, ?, ?, content
       FROM scripts WHERE id = ?');
    $stmt->execute(array(
      isset($body['author']) && $body['author'] !== '' ? mb_substr((string)$body['author'], 0, 100) : null,
      isset($body['fork_note']) && $body['fork_note'] !== '' ? mb_substr((string)$body['fork_note'], 0, 255) : null,
      $id,
    ));
    if ($stmt->rowCount() === 0) fail(404, 'Copione da forkare non trovato');
    echo json_encode(array('id' => (int)$pdo->lastInsertId()), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'delete': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $id = requireId();
    try {
      $stmt = $pdo->prepare('DELETE FROM scripts WHERE id = ?');
      $stmt->execute(array($id));
    } catch (PDOException $e) {
      if ($e->getCode() === '23000') fail(409, 'Questo copione ha delle derivazioni: elimina prima i suoi fork');
      throw $e;
    }
    if ($stmt->rowCount() === 0) fail(404, 'Copione non trovato');
    echo json_encode(array('ok' => true));
    break;
  }

  case 'room_create': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $body = readBody();
    $scriptId = isset($body['script_id']) && ctype_digit((string)$body['script_id']) ? (int)$body['script_id'] : null;
    if ($scriptId === null) fail(400, 'script_id mancante');
    $hostName = reqStr($body, 'host_name', 100);
    // Dispose of stale rooms (CASCADE clears their members). No cron needed.
    $pdo->exec("DELETE FROM rooms WHERE updated_at < (NOW() - INTERVAL 12 HOUR)");
    $hostToken = genToken();
    $memberToken = genToken();
    // Retry on the (rare) join-code collision.
    $code = null;
    for ($attempt = 0; $attempt < 8; $attempt++) {
      $candidate = genRoomCode();
      try {
        $stmt = $pdo->prepare(
          'INSERT INTO rooms (code, host_token, script_id, `view`, host_name) VALUES (?, ?, ?, ?, ?)');
        $stmt->execute(array($candidate, $hostToken, $scriptId, 'lobby', $hostName));
        $code = $candidate;
        break;
      } catch (PDOException $e) {
        if ($e->getCode() !== '23000') throw $e; // not a duplicate-key: real error
      }
    }
    if ($code === null) fail(500, 'Impossibile creare la stanza, riprova');
    $m = $pdo->prepare(
      'INSERT INTO room_members (room_code, member_token, name, is_host) VALUES (?, ?, ?, 1)');
    $m->execute(array($code, $memberToken, $hostName));
    echo json_encode(array('code' => $code, 'host_token' => $hostToken, 'member_token' => $memberToken), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'room_join': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $body = readBody();
    $code = strtoupper((string)(isset($body['code']) ? $body['code'] : ''));
    $room = requireRoom($pdo, $code);
    $memberToken = genToken();
    $m = $pdo->prepare(
      'INSERT INTO room_members (room_code, member_token, name, is_host) VALUES (?, ?, ?, 0)');
    $m->execute(array($code, $memberToken, reqStr($body, 'name', 100)));
    echo json_encode(array('member_token' => $memberToken, 'state' => roomStateOut($room)), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'room_sync': {
    // Follower's single per-tick call: heartbeat + optional characters, returns room state.
    if ($method !== 'POST') fail(405, 'Usa POST');
    $body = readBody();
    $code = strtoupper((string)(isset($body['code']) ? $body['code'] : ''));
    $memberToken = (string)(isset($body['member_token']) ? $body['member_token'] : '');
    $room = requireRoom($pdo, $code);
    if (array_key_exists('characters', $body)) {
      $chars = is_array($body['characters']) ? json_encode(array_values($body['characters']), JSON_UNESCAPED_UNICODE) : null;
      $u = $pdo->prepare('UPDATE room_members SET characters = ?, last_seen = NOW() WHERE room_code = ? AND member_token = ?');
      $u->execute(array($chars, $code, $memberToken));
    } else {
      $u = $pdo->prepare('UPDATE room_members SET last_seen = NOW() WHERE room_code = ? AND member_token = ?');
      $u->execute(array($code, $memberToken));
    }
    echo json_encode(roomStateOut($room), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'room_push': {
    // Director-only: move the room to a new position/view.
    if ($method !== 'POST') fail(405, 'Usa POST');
    $body = readBody();
    $code = strtoupper((string)(isset($body['code']) ? $body['code'] : ''));
    $hostToken = (string)(isset($body['host_token']) ? $body['host_token'] : '');
    $room = requireRoom($pdo, $code);
    if (!hash_equals($room['host_token'], $hostToken)) fail(403, 'Solo il regista può guidare la scena');
    $allowed = array('lobby', 'characters', 'prep', 'playback', 'readall', 'end');
    $view = isset($body['view']) && in_array($body['view'], $allowed, true) ? $body['view'] : $room['view'];
    $sceneIdx = isset($body['scene_idx']) ? (int)$body['scene_idx'] : (int)$room['scene_idx'];
    $beatIdx = isset($body['beat_idx']) ? (int)$body['beat_idx'] : (int)$room['beat_idx'];
    $scriptId = isset($body['script_id']) && ctype_digit((string)$body['script_id']) ? (int)$body['script_id'] : $room['script_id'];
    $u = $pdo->prepare(
      'UPDATE rooms SET script_id = ?, `view` = ?, scene_idx = ?, beat_idx = ?, rev = rev + 1 WHERE code = ?');
    $u->execute(array($scriptId, $view, $sceneIdx, $beatIdx, $code));
    $pdo->prepare('UPDATE room_members SET last_seen = NOW() WHERE room_code = ? AND is_host = 1')->execute(array($code));
    $stmt = $pdo->prepare('SELECT rev FROM rooms WHERE code = ?');
    $stmt->execute(array($code));
    echo json_encode(array('rev' => (int)$stmt->fetchColumn()), JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'room_members': {
    // Director's roster: who is connected (seen in the last 12s) and which parts they cover.
    if ($method !== 'GET') fail(405, 'Usa GET');
    $code = strtoupper((string)(isset($_GET['code']) ? $_GET['code'] : ''));
    $hostToken = (string)(isset($_GET['host_token']) ? $_GET['host_token'] : '');
    $room = requireRoom($pdo, $code);
    if (!hash_equals($room['host_token'], $hostToken)) fail(403, 'Solo il regista può vedere la sala');
    $stmt = $pdo->prepare(
      'SELECT name, characters, is_host FROM room_members
       WHERE room_code = ? AND last_seen > (NOW() - INTERVAL 12 SECOND)
       ORDER BY is_host DESC, id');
    $stmt->execute(array($code));
    $out = array();
    foreach ($stmt->fetchAll() as $r) {
      $out[] = array(
        'name'       => $r['name'],
        'characters' => $r['characters'] === null ? array() : json_decode($r['characters'], true),
        'is_host'    => (int)$r['is_host'] === 1,
      );
    }
    echo json_encode($out, JSON_UNESCAPED_UNICODE);
    break;
  }

  case 'room_close': {
    if ($method !== 'POST') fail(405, 'Usa POST');
    $body = readBody();
    $code = strtoupper((string)(isset($body['code']) ? $body['code'] : ''));
    $hostToken = (string)(isset($body['host_token']) ? $body['host_token'] : '');
    $room = requireRoom($pdo, $code);
    if (!hash_equals($room['host_token'], $hostToken)) fail(403, 'Solo il regista può chiudere la stanza');
    $pdo->prepare('DELETE FROM rooms WHERE code = ?')->execute(array($code));
    echo json_encode(array('ok' => true));
    break;
  }

  default:
    fail(400, 'Azione sconosciuta');
}
