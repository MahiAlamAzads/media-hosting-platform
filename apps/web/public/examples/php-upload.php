<?php

declare(strict_types=1);

require __DIR__ . '/MediaPlatformClient.php';

$client = new MediaPlatformClient(
    getenv('MEDIA_PLATFORM_API_URL')
        ?: 'http://localhost:4000',
    getenv('MEDIA_PLATFORM_API_KEY')
        ?: throw new RuntimeException(
            'MEDIA_PLATFORM_API_KEY is required'
        )
);

$filePath =
    $argv[1]
    ?? throw new RuntimeException(
        'Usage: php php-upload.php ./photo.jpg image/jpeg PUBLIC'
    );

$contentType =
    $argv[2]
    ?? 'application/octet-stream';

$visibility =
    strtoupper($argv[3] ?? 'PUBLIC')
        === 'PRIVATE'
        ? 'PRIVATE'
        : 'PUBLIC';

$uploaded = $client->uploadFile(
    $filePath,
    $contentType,
    null,
    $visibility
);

print_r([
    'assetId' =>
        $uploaded['assetId'],
    'visibility' =>
        $visibility,
    'imgUrl' =>
        $uploaded['imgUrl'] ?? null,
    'fileUrl' =>
        $uploaded['fileUrl'] ?? null,
    'deliveryUrl' =>
        $visibility === 'PRIVATE'
            ? $client->createDeliveryUrl(
                $uploaded['assetId']
            )
            : null,
]);
