<?php

/*
 * minecraft/deploy/bootstrap.php — настройката в Pelican, след уеб инсталатора.
 * install.sh и switch-flavor.sh го пускат вътре в контейнера на панела:
 *   php artisan tinker --execute="require '/tmp/pelican-bootstrap.php';"
 * Идемпотентен: всичко се създава/сменя само ако го няма. Тайни не печата.
 *
 * BOOTSTRAP_MODE=node   — нод + алокация за играта + egg-а от EGG_URL.
 *                         Вход: NODE_NAME, NODE_FQDN, NODE_MEMORY, NODE_DISK, WINGS_PORT, SFTP_PORT,
 *                         GAME_IP, GAME_PORT, GAME_ALIAS, EGG_URL. Последен ред: „NODE_ID=<n>“.
 * BOOTSTRAP_MODE=server — самият Minecraft сървър (иска работещ Wings: панелът го създава през него).
 *                         Вход: NODE_NAME, GAME_IP, GAME_PORT, EGG_URL, MC_FLAVOR, MC_NAME, MC_VERSION,
 *                         MC_BUILD, PAPER_USER_AGENT, MC_IMAGE, MC_MEMORY, MC_DISK, MC_CPU, MC_BACKUPS.
 *                         Собственик — първият потребител (админът от инсталатора). Не се стартира:
 *                         EULA на Mojang се приема от човек в конзолата при първото пускане.
 * BOOTSTRAP_MODE=info   — „SERVER_UUID=<uuid>“, „SERVER_EGG=<име>“, „SERVER_STATUS=<installed|…>“.
 *                         Вход: NODE_NAME, MC_NAME.
 * BOOTSTRAP_MODE=switch — съществуващият сървър минава на egg-а от EGG_URL (paper ⇄ vanilla) и се
 *                         преинсталира: инсталаторът на egg-а сменя само jar-а — светът, ops.json,
 *                         whitelist.json и server.properties остават. Вход: като `server`, плюс
 *                         FORCE_REINSTALL=1 — преинсталира и когато настройките вече съвпадат.
 *                         Последен ред: „SWITCH=reinstalling“ или „SWITCH=unchanged“.
 */

use App\Models\Allocation;
use App\Models\Egg;
use App\Models\Node;
use App\Models\Server;
use App\Models\ServerVariable;
use App\Models\User;
use App\Services\Eggs\Sharing\EggImporterService;
use App\Services\Servers\ReinstallServerService;
use App\Services\Servers\ServerCreationService;
use App\Services\Servers\StartupModificationService;

$env = static function (string $key): string {
    $value = getenv($key);
    if ($value === false || $value === '') {
        throw new RuntimeException("липсва $key");
    }

    return $value;
};

$importEgg = static function (string $url): Egg {
    $egg = Egg::query()->where('update_url', $url)->first();
    if ($egg !== null) {
        return $egg;
    }
    $egg = app(EggImporterService::class)->fromUrl($url);
    echo "egg '{$egg->name}' е импортиран\n";

    return $egg;
};

// Променливите на сървъра: подразбиранията на egg-а + нашите (само тези, които egg-ът познава).
$environmentFor = static function (Egg $egg) use ($env): array {
    $ours = match ($env('MC_FLAVOR')) {
        'paper' => [
            'MINECRAFT_VERSION' => $env('MC_VERSION'),
            'BUILD_NUMBER' => $env('MC_BUILD'),
            'PROJECT' => 'paper',
            'USER_AGENT' => $env('PAPER_USER_AGENT'),
            'SERVER_JARFILE' => 'server.jar',
        ],
        'vanilla' => ['VANILLA_VERSION' => $env('MC_VERSION'), 'SERVER_JARFILE' => 'server.jar'],
    };
    $environment = [];
    foreach ($egg->variables()->get() as $variable) {
        $environment[$variable->env_variable] = $ours[$variable->env_variable] ?? (string) $variable->default_value;
    }

    return $environment;
};

$description = static fn (): string => ($env('MC_FLAVOR') === 'paper' ? 'Paper' : 'Vanilla Minecraft') . " {$env('MC_VERSION')}";

$name = $env('NODE_NAME');
$mode = $env('BOOTSTRAP_MODE');

if ($mode === 'info' || $mode === 'switch') {
    $node = Node::query()->where('name', $name)->firstOrFail();
    $server = Server::query()->where('node_id', $node->id)->where('name', $env('MC_NAME'))->firstOrFail();

    if ($mode === 'info') {
        echo "SERVER_UUID={$server->uuid}\n";
        echo "SERVER_EGG={$server->egg->name}\n";
        echo 'SERVER_STATUS=' . ($server->status?->value ?? 'installed') . "\n";

        return;
    }

    $egg = $importEgg($env('EGG_URL'));
    $environment = $environmentFor($egg);
    $variableIds = $egg->variables()->pluck('id', 'env_variable');
    $current = ServerVariable::query()
        ->where('server_id', $server->id)
        ->whereIn('variable_id', $variableIds->values())
        ->pluck('variable_value', 'variable_id');
    $same = $server->egg_id === $egg->id && $server->image === $env('MC_IMAGE');
    foreach ($environment as $key => $value) {
        $same = $same && ($current[$variableIds[$key]] ?? null) === $value;
    }
    if ($same && $server->isInstalled() && getenv('FORCE_REINSTALL') !== '1') {
        echo "сървър '{$server->name}' вече е на '{$egg->name}' с тези настройки\n";
        echo "SWITCH=unchanged\n";

        return;
    }

    $server = app(StartupModificationService::class)
        ->setUserLevel(User::USER_LEVEL_ADMIN)
        ->handle($server, [
            'egg_id' => $egg->id,
            'environment' => $environment,
            'docker_image' => $env('MC_IMAGE'),
            'startup' => $egg->startup_commands['Default'] ?? reset($egg->startup_commands),
            'skip_scripts' => false,
        ]);
    // Стойностите на стария egg (напр. VANILLA_VERSION) не са нужни на новия.
    ServerVariable::query()
        ->where('server_id', $server->id)
        ->whereNotIn('variable_id', $variableIds->values())
        ->delete();
    // Описанието се сменя само ако е нашето автоматично — написаното ръчно в панела остава.
    if (preg_match('/^(Vanilla Minecraft|Paper) \d/', (string) $server->description) === 1) {
        $server->forceFill(['description' => $description()])->save();
    }
    app(ReinstallServerService::class)->handle($server);
    echo "сървър '{$server->name}' е на '{$egg->name}', преинсталира се\n";
    echo "SWITCH=reinstalling\n";

    return;
}

if ($mode === 'server') {
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
        'description' => $description(),
        'owner_id' => $owner->id,
        'node_id' => $node->id,
        'allocation_id' => $allocation->id,
        'egg_id' => $egg->id,
        'image' => $env('MC_IMAGE'),
        'startup' => $egg->startup_commands['Default'] ?? reset($egg->startup_commands),
        'environment' => $environmentFor($egg),
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

$importEgg($env('EGG_URL'));

echo "NODE_ID={$node->id}\n";
