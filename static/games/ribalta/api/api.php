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

  default:
    fail(400, 'Azione sconosciuta');
}
