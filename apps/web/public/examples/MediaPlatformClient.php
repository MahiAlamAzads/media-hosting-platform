<?php

declare(strict_types=1);

final class MediaPlatformClient
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $apiKey,
    ) {}

    private function request(string $method, string $path, ?string $body = null, array $headers = []): array
    {
        $curl = curl_init(rtrim($this->baseUrl, '/') . $path);
        $allHeaders = array_merge([
            'Authorization: Bearer ' . $this->apiKey,
            'Accept: application/json',
        ], $headers);

        curl_setopt_array($curl, [
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => $allHeaders,
            CURLOPT_POSTFIELDS => $body,
            CURLOPT_TIMEOUT => 120,
        ]);

        $response = curl_exec($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        $error = curl_error($curl);
        curl_close($curl);

        if ($response === false) {
            throw new RuntimeException('HTTP transport failed: ' . $error);
        }

        $payload = json_decode($response, true);

        if ($status < 200 || $status >= 300) {
            $message = $payload['error']['message'] ?? ('HTTP ' . $status);
            $code = $payload['error']['code'] ?? 'HTTP_ERROR';
            throw new RuntimeException($code . ': ' . $message);
        }

        return is_array($payload) ? $payload : [];
    }

    public function uploadFile(
        string $filePath,
        string $contentType,
        ?string $folderId = null,
        string $visibility = 'PUBLIC',
    ): array
    {
        $size = filesize($filePath);
        if ($size === false) throw new RuntimeException('Cannot read file size.');

        $created = $this->request(
            'POST',
            '/api/v1/uploads',
            json_encode([
                'filename' => basename($filePath),
                'contentType' => $contentType,
                'sizeBytes' => $size,
                'folderId' => $folderId,
                'visibility' => $visibility,
            ], JSON_THROW_ON_ERROR),
            ['Content-Type: application/json']
        );

        $upload = $created['data'];
        $handle = fopen($filePath, 'rb');
        if ($handle === false) throw new RuntimeException('Cannot open file.');

        try {
            for ($index = 0; $index < $upload['expectedChunks']; $index++) {
                $chunk = fread($handle, $upload['chunkSizeBytes']);
                if ($chunk === false || $chunk === '') {
                    throw new RuntimeException('Could not read upload chunk.');
                }

                $this->request(
                    'PUT',
                    '/api/v1/uploads/' . rawurlencode($upload['uploadId']) . '/chunks/' . $index,
                    $chunk,
                    [
                        'Content-Type: application/octet-stream',
                        'Content-Length: ' . strlen($chunk),
                    ]
                );
            }
        } catch (Throwable $error) {
            try {
                $this->request('DELETE', '/api/v1/uploads/' . rawurlencode($upload['uploadId']));
            } catch (Throwable) {}
            throw $error;
        } finally {
            fclose($handle);
        }

        $completed = $this->request(
            'POST',
            '/api/v1/uploads/' . rawurlencode($upload['uploadId']) . '/complete',
            '{}',
            ['Content-Type: application/json']
        );

        return array_merge([
            'uploadId' => $upload['uploadId'],
            'assetId' => $upload['assetId'],
        ], $completed['data']);
    }

    public function createDeliveryUrl(string $assetId, string $disposition = 'inline'): string
    {
        $payload = $this->request(
            'POST',
            '/api/v1/media/' . rawurlencode($assetId) . '/delivery-token',
            json_encode(['disposition' => $disposition], JSON_THROW_ON_ERROR),
            ['Content-Type: application/json']
        );

        return rtrim($this->baseUrl, '/') . $payload['data']['path'];
    }

    public function setVisibility(
        string $assetId,
        string $visibility,
    ): array {
        $normalized =
            strtoupper($visibility) === 'PRIVATE'
                ? 'PRIVATE'
                : 'PUBLIC';

        $updated = $this->request(
            'PATCH',
            '/api/v1/media/' . rawurlencode($assetId),
            json_encode(
                ['visibility' => $normalized],
                JSON_THROW_ON_ERROR
            ),
            ['Content-Type: application/json']
        );

        return $updated['data'];
    }

    public function makePublic(string $assetId): string
    {
        $updated = $this->setVisibility(
            $assetId,
            'PUBLIC'
        );

        $url =
            $updated['imgUrl']
            ?? $updated['fileUrl']
            ?? null;

        if (!is_string($url) || $url === '') {
            throw new RuntimeException(
                'The asset did not return a public URL.'
            );
        }

        return $url;
    }

    public function makePrivate(string $assetId): array
    {
        return $this->setVisibility(
            $assetId,
            'PRIVATE'
        );
    }
}
