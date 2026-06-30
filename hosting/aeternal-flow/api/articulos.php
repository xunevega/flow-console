<?php
/**
 * API de gestión de artículos del blog.
 *   GET    /api/articulos.php
 *   GET    /api/articulos.php?slug=...
 *   PUT    /api/articulos.php?slug=...
 *   PATCH  /api/articulos.php?slug=...
 *   DELETE /api/articulos.php?slug=...
 *
 * Cabecera: Authorization: Bearer <BLOG_API_TOKEN> o X-Blog-Token.
 */

require __DIR__ . '/../includes/config.php';
require __DIR__ . '/../includes/db.php';

header('Content-Type: application/json; charset=utf-8');

function salir(int $code, array $data): void {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function enviado_token(): string {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $auth = $headers['Authorization'] ?? $headers['authorization'] ?? ($_SERVER['HTTP_AUTHORIZATION'] ?? '');
    if (preg_match('/Bearer\s+(.+)/i', $auth, $m)) {
        return trim($m[1]);
    }
    $headerToken = $headers['X-Blog-Token'] ?? $headers['x-blog-token'] ?? ($_SERVER['HTTP_X_BLOG_TOKEN'] ?? '');
    return is_string($headerToken) ? trim($headerToken) : '';
}

if (enviado_token() === '' || !hash_equals(api_token(), enviado_token())) {
    salir(401, ['ok' => false, 'error' => 'Token inválido o ausente.']);
}

function campo($in, $k, $def = '') {
    return isset($in[$k]) && is_string($in[$k]) ? trim($in[$k]) : $def;
}

function slugify(string $s): string {
    $s = strtolower(trim($s));
    $s = strtr($s, 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc');
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim($s, '-');
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$slug = isset($_GET['slug']) ? slugify((string)$_GET['slug']) : '';

try {
    if ($method === 'GET') {
        if ($slug !== '') {
            $stmt = db()->prepare('SELECT id, slug, title, category, cat_class, minutes, excerpt, lede, body, cta_note, cta_text, cta_href, published, image_url, created_at FROM af_articulos WHERE slug = ? LIMIT 1');
            $stmt->execute([$slug]);
            $article = $stmt->fetch();
            if (!$article) salir(404, ['ok' => false, 'error' => 'Artículo no encontrado.']);
            salir(200, ['ok' => true, 'article' => $article]);
        }
        $stmt = db()->query('SELECT id, slug, title, category, cat_class, minutes, excerpt, lede, published, image_url, created_at FROM af_articulos ORDER BY created_at DESC, id DESC LIMIT 100');
        salir(200, ['ok' => true, 'articles' => $stmt->fetchAll()]);
    }

    if ($method === 'DELETE') {
        if ($slug === '') salir(422, ['ok' => false, 'error' => 'Falta slug.']);
        $stmt = db()->prepare('DELETE FROM af_articulos WHERE slug = ?');
        $stmt->execute([$slug]);
        salir(200, ['ok' => true, 'deleted' => $stmt->rowCount(), 'slug' => $slug]);
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        if ($slug === '') salir(422, ['ok' => false, 'error' => 'Falta slug.']);
        $raw = file_get_contents('php://input');
        if (strlen($raw) > 5000000) salir(413, ['ok' => false, 'error' => 'Payload demasiado grande.']);
        $in = json_decode($raw, true);
        if (!is_array($in)) salir(400, ['ok' => false, 'error' => 'JSON no válido.']);

        $title = campo($in, 'title');
        $excerpt = campo($in, 'excerpt');
        $lede = campo($in, 'lede');
        $body = campo($in, 'body');
        if ($title === '' || $excerpt === '' || $lede === '' || $body === '') {
            salir(422, ['ok' => false, 'error' => 'Faltan campos obligatorios.']);
        }

        $category = campo($in, 'category', 'Datos');
        $cat_class = campo($in, 'cat_class', 'cat-teal');
        if (!in_array($cat_class, ['cat-teal', 'cat-amber', 'cat-blue'], true)) $cat_class = 'cat-teal';
        $minutes = isset($in['minutes']) ? max(1, min(99, (int)$in['minutes'])) : 5;
        $published = array_key_exists('published', $in) ? (int)(bool)$in['published'] : 1;
        $image_url = trim($in['image_url'] ?? '');

        $sql = 'UPDATE af_articulos SET title=?, category=?, cat_class=?, minutes=?, excerpt=?, lede=?, body=?, cta_note=?, cta_text=?, cta_href=?, published=?, image_url=? WHERE slug=?';
        db()->prepare($sql)->execute([
            $title,
            $category,
            $cat_class,
            $minutes,
            $excerpt,
            $lede,
            $body,
            campo($in, 'cta_note'),
            campo($in, 'cta_text'),
            campo($in, 'cta_href', 'contacto.php'),
            $published,
            $image_url,
            $slug,
        ]);

        salir(200, ['ok' => true, 'slug' => $slug, 'url' => 'https://aeternal-flow.es/blog.php?post=' . $slug]);
    }
} catch (PDOException $ex) {
    salir(500, ['ok' => false, 'error' => 'Error de base de datos.']);
}

salir(405, ['ok' => false, 'error' => 'Método no permitido.']);
