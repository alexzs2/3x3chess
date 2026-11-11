<?php
// ============================================================================
// 🌎 SERVIDOR LEVE DE RECORDES MUNDIAIS - 3x3CHESS STUDIO (recordes.php)
// Suporta alta concorrência (viralização) usando trava atômica LOCK_EX
// ============================================================================
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

$file = __DIR__ . '/world-records.json';

// 1. Se for apenas leitura (GET), entrega os recordes atuais rapidamente
if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (file_exists($file)) {
        readfile($file);
    } else {
        echo json_encode(new stdClass());
    }
    exit;
}

// 2. Se for tentativa de gravar um Novo Recorde Mundial (POST)
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);

    $level = isset($input['level']) ? intval($input['level']) : 0;
    $timeMs = isset($input['timeMs']) ? intval($input['timeMs']) : 0;
    $clientCountry = isset($input['country']) ? strtoupper(preg_replace('/[^A-Za-z]/', '', $input['country'])) : '';

    // Valida se o nível existe (Mate em 1 até Mate em 15)
    if ($level < 1 || $level > 15) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid level']);
        exit;
    }

    // TRAVA ANTI-BOT FISIOLÓGICA:
    // Exige pelo menos 350ms no Mate em 1 + 250ms por cada lance adicional
    $minHumanPossibleMs = 350 + (($level - 1) * 250);
    if ($timeMs < $minHumanPossibleMs || $timeMs > 3600000) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Time outside human physiological bounds']);
        exit;
    }

    // Detecta o país real via Cloudflare/Hostinger se disponível, ou usa o detectado pelo fuso horário
    $serverCountry = '';
    if (!empty($_SERVER['HTTP_CF_IPCOUNTRY']) && strlen($_SERVER['HTTP_CF_IPCOUNTRY']) === 2 && $_SERVER['HTTP_CF_IPCOUNTRY'] !== 'XX') {
        $serverCountry = strtoupper($_SERVER['HTTP_CF_IPCOUNTRY']);
    }
    $finalCountry = (strlen($serverCountry) === 2) ? $serverCountry : ((strlen($clientCountry) === 2) ? $clientCountry : 'UN');

    // Abre e trava o arquivo para evitar conflito se 2 pessoas baterem recorde no mesmo milissegundo
    $fp = fopen($file, 'c+');
    if ($fp && flock($fp, LOCK_EX)) {
        $content = stream_get_contents($fp);
        $records = json_decode($content, true);
        if (!is_array($records)) {
            $records = [];
        }

        $lvlKey = strval($level);
        $currentBest = isset($records[$lvlKey]['timeMs']) ? intval($records[$lvlKey]['timeMs']) : 999999999;

        // Só substitui se o novo tempo for estritamente menor que o recorde mundial atual
        if ($timeMs < $currentBest) {
            $records[$lvlKey] = [
                'timeMs' => $timeMs,
                'country' => $finalCountry,
                'updatedAt' => gmdate('Y-m-d\TH:i:s\Z')
            ];
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode($records, JSON_PRETTY_PRINT));
            fflush($fp);
        }

        flock($fp, LOCK_UN);
        fclose($fp);

        echo json_encode([
            'status' => 'ok',
            'records' => $records
        ]);
        exit;
    } else {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Could not lock records file']);
        exit;
    }
}
?>