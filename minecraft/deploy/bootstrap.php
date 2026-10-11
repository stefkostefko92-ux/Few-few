<?php

/*
 * minecraft/deploy/bootstrap.php — еднократната настройка в Pelican, след уеб инсталатора.
 * install.sh го пуска вътре в контейнера на панела:
 *   php artisan tinker --execute="require '/tmp/pelican-bootstrap.php';"
 * Идемпотентен: всичко се създава само ако го няма. Тайни не печата.
 *
 * BOOTSTRAP_MODE=node   — нод + алокация за играта + egg „Vanilla Minecraft“.
 *                         Вход: NODE_NAME, NODE_FQDN, NODE_MEMORY, NODE_DISK, WINGS_PORT, SFTP_PORT,
 *                         GAME_IP, GAME_PORT, GAME_ALIAS, EGG_URL. Последен ред: „NODE_ID=<n>“.
 * BOOTSTRAP_MODE=server — самият Minecraft сървър (иска работещ Wings: панелът го създава през него).
 *                         Вход: NODE_NAME, GAME_IP, GAME_PORT, EGG_URL, MC_NAME, MC_VERSION, MC_IMAGE,
 *                         MC_MEMORY, MC_DISK, MC_CPU, MC_BACKUPS. Собственик — първият потребител
 *                         (админът от инсталатора). Не се стартира: EULA на Mojang се приема от човек
 *                         в конзолата при първото пускане.
 */

use App\Models\Allocation;
use App\Models\Egg;
use App\Models\Node;
use App\Models\Server;
use App\Models\User;
use App\Services\Eggs\Sharing\EggImporterService;
use App\Services\Servers\ServerCreationService;

$env = static function (string $key): string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        throw new RuntimeException("липсва $key");
    }

    return $value;
};

$name = $env('NODE_NAME');

if ($env('BOOTSTRAP_MODE') === 'server') {
    $node = Node::query()->where('name', $name)->firstOrFail();
    $mcName = $env('MC_NAME');
    if (Server::query()->where('node_id', $node->id)->where('name', $mcName)->exists()) {
        echo "сървър '$mcName' вече съществува\n";

        return;
    }
    $allocation = Allocation::query()
        ->where(['node_id' => $node->id, 'ip' => $env('GAME_IP'), 'port' => (int) $env('GAME_PORT')])
        ->firstOrFail();
    if ($allocation->server_id !== null) {
        throw new RuntimeException("алокация {$allocation->ip}:{$allocation->port} е заета от друг сървър");
    }
    $egg = Egg::query()->where('update_url', $env('EGG_URL'))->firstOrFail();
    $owner = User::query()->orderBy('id')->firstOrFail();

    $server = app(ServerCreationService::class)->handle([
        'name' => $mcName,
        'description' => "Vanilla Minecraft {$env('MC_VERSION')}",
        'owner_id' => $owner->id,
        'node_id' => $node->id,
        'allocation_id' => $allocation->id,
        'egg_id' => $egg->id,
        'image' => $env('MC_IMAGE'),
        'startup' => $egg->startup_commands['Default'] ?? reset($egg->startup_commands),
        'environment' => ['VANILLA_VERSION' => $env('MC_VERSION'), 'SERVER_JARFILE' => 'server.jar'],
        'memory' => (int) $env('MC_MEMORY'),
        'swap' => 0,
        'disk' => (int) $env('MC_DISK'),
        'io' => 500,
        'cpu' => (int) $env('MC_CPU'),
        'oom_killer' => false,
        'database_limit' => 0,
        'allocation_limit' => 0,
        'backup_limit' => (int) $env('MC_BACKUPS'),
        'start_on_completion' => false,
    ]);
    echo "сървър '{$server->name}' е създаден ({$server->uuid_short}), собственик {$owner->email}\n";

    return;
}

$node = Node::query()->where('name', $name)->first();
if ($node === null) {
    Artisan::call('p:node:make', [
        '--name' => $name,
        '--description' => 'Carbon Stealth VPS',
        '--fqdn' => $env('NODE_FQDN'),
        '--public' => 1,
        '--scheme' => 'https',
        '--proxy' => 1,
        '--maintenance' => 0,
        '--maxMemory' => (int) $env('NODE_MEMORY'),
        '--overallocateMemory' => 0,
        '--maxDisk' => (int) $env('NODE_DISK'),
        '--overallocateDisk' => 0,
        '--maxCpu' => 0,
        '--overallocateCpu' => 0,
        '--uploadSize' => 100,
        '--daemonListeningPort' => (int) $env('WINGS_PORT'),
        '--daemonConnectingPort' => 443,
        '--daemonSFTPPort' => (int) $env('SFTP_PORT'),
        '--daemonBase' => '/var/lib/pelican/volumes',
        '--no-interaction' => true,
    ]);
    $node = Node::query()->where('name', $name)->firstOrFail();
    echo "нод '$name' е създаден\n";
}

$allocation = Allocation::query()->firstOrCreate(
    ['node_id' => $node->id, 'ip' => $env('GAME_IP'), 'port' => (int) $env('GAME_PORT')],
    ['ip_alias' => $env('GAME_ALIAS')],
);
if ($allocation->wasRecentlyCreated) {
    echo "алокация {$allocation->ip}:{$allocation->port} ({$allocation->ip_alias}) е създадена\n";
}

$eggUrl = $env('EGG_URL');
if (!Egg::query()->where('update_url', $eggUrl)->exists()) {
    $egg = app(EggImporterService::class)->fromUrl($eggUrl);
    echo "egg '{$egg->name}' е импортиран\n";
}

echo "NODE_ID={$node->id}\n";
