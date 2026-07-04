--- bg_spawn/server/main.lua
--- Server-authoritative onboarding: при първо влизане дава стартовия пакет ВЕДНЪЖ
--- (гейтван от DB флаг, не от клиента) и стартира tutorial-а.

local qbx = exports.qbx_core

--- Дава стартовия пакет на играч (server-authoritative). Не вярва на клиента.
--- @param src number
--- @param citizenid string
local function grantStarterPack(src, citizenid)
    local player = qbx:GetPlayer(src)
    if not player then return end

    player.Functions.AddMoney('cash', Spawn.StarterPack.cash, 'starter-pack')
    player.Functions.AddMoney('bank', Spawn.StarterPack.bank, 'starter-pack')

    for _, item in ipairs(Spawn.StarterPack.items) do
        exports.ox_inventory:AddItem(src, item.name, item.count)
    end

    lib.print.info(('[bg_spawn] Стартов пакет -> %s (%s)'):format(GetPlayerName(src), citizenid))
end

--- Проверява DB дали играчът е нов; ако да — маркира, дава пакет, пуска tutorial.
RegisterNetEvent('bg_spawn:playerLoaded', function()
    local src = source
    if not exports.bg_core:RateLimit(src, 'spawn_loaded', 5) then return end

    local citizenid = exports.bg_core:GetCitizenId(src)
    if not citizenid then return end

    local row = MySQL.single.await(
        'SELECT tutorial_done FROM bg_onboarding WHERE citizenid = ?', { citizenid })

    if not row then
        -- Първо влизане: запиши и дай стартовия пакет.
        MySQL.insert.await(
            'INSERT INTO bg_onboarding (citizenid, tutorial_done) VALUES (?, 0)', { citizenid })
        grantStarterPack(src, citizenid)
        TriggerClientEvent('bg_spawn:startTutorial', src, Spawn.Tutorial, Spawn.NewPlayerCoords)
    elseif row.tutorial_done == 0 then
        -- Влизал е, но не е довършил tutorial-а: пусни го пак (без пакет пак).
        TriggerClientEvent('bg_spawn:startTutorial', src, Spawn.Tutorial, Spawn.NewPlayerCoords)
    end
end)

--- Клиентът съобщава, че е минал tutorial-а. Записваме флага server-side.
RegisterNetEvent('bg_spawn:tutorialDone', function()
    local src = source
    local citizenid = exports.bg_core:GetCitizenId(src)
    if not citizenid then return end
    MySQL.update.await(
        'UPDATE bg_onboarding SET tutorial_done = 1 WHERE citizenid = ?', { citizenid })
end)
