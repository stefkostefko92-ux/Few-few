--- bg_territory/server/main.lua
--- LOOP A — Динамична територия (server-authoritative).
--- Сървърът е единственият авторитет: клиентът само ЧЕТЕ собствениците от GlobalState;
--- влиянието се трупа по реалните координати на игрите, четени тук чрез natives.
--- Никакво доверие на клиента, всичко е валидирано (IsZone/IsFaction, цели числа).

local T = BGConfig.Territory
local bgCore = exports.bg_core

-- Състояние в памет (единствен източник на истина по време на живота на ресурса).
local influence = {}       -- influence[zoneId][faction] = точки (int, 0..maxInfluence)
local owners = {}          -- owners[zoneId] = factionKey | false (ничия)
local dirtyInfluence = {}  -- множество "zoneId\1faction" — променени редове за пестелив UPSERT
local SEP = '\1'           -- разделител за ключ на dirty (зоните/фракциите нямат \1)

-------------------------------------------------------------------------------
-- Помощници
-------------------------------------------------------------------------------

--- Маркирай (zone,faction) като променено, за да го персистираме следващия tick.
local function markDirty(zoneId, faction)
    dirtyInfluence[zoneId .. SEP .. faction] = true
end

--- Добави влияние с таван; маркира dirty само при реална промяна.
local function addInfluence(zoneId, faction, amount, cap)
    local infz = influence[zoneId]
    local cur = infz[faction] or 0
    local nv = math.min(cap, cur + amount)
    if nv ~= cur then
        infz[faction] = nv
        markDirty(zoneId, faction)
    end
end

--- Публикувай собствениците в GlobalState (репликирано към всички клиенти — евтино).
--- Формат: { zoneId = factionKey | false }.
local function publishOwners()
    local map = {}
    for zoneId in pairs(BGConfig.Zones) do
        map[zoneId] = owners[zoneId] or false
    end
    GlobalState:set('bg_territory', map, true)
end

--- Нотифицирай всички игри ФИЗИЧЕСКИ в зоната при смяна на контрол.
--- Кешираме ped/coords веднъж на играч.
local function notifyZoneCapture(zoneId, faction)
    local z = BGConfig.Zones[zoneId]
    local label = BGConfig.Factions[faction].label
    local msg = ('%s пое контрол над „%s“'):format(label, z.label)
    for _, sid in ipairs(GetPlayers()) do
        local src = tonumber(sid)
        local ped = GetPlayerPed(src)
        if ped and ped ~= 0 then
            local coords = GetEntityCoords(ped)
            if #(coords - z.coords) <= z.radius then
                bgCore:Notify(src, msg, 'inform')
            end
        end
    end
end

-------------------------------------------------------------------------------
-- Персистиране (пестеливо: само променените редове)
-------------------------------------------------------------------------------

--- Batch UPSERT на промененото влияние + UPDATE на сменените собственици.
--- @param changedOwners table множество zoneId със сменен owner
local function persist(changedOwners)
    -- Влияние: подготвяме масив от параметри и пускаме едно prepare за целия batch.
    local params = {}
    for key in pairs(dirtyInfluence) do
        local zoneId, faction = key:match('^(.-)' .. SEP .. '(.+)$')
        if zoneId and faction and influence[zoneId] then
            params[#params + 1] = { zoneId, faction, influence[zoneId][faction] or 0 }
        end
    end
    if #params > 0 then
        MySQL.prepare.await(
            'INSERT INTO bg_territory_influence (zone_id, faction, points) VALUES (?, ?, ?) ' ..
            'ON DUPLICATE KEY UPDATE points = VALUES(points)',
            params
        )
    end
    dirtyInfluence = {}

    -- Собственици: по един UPDATE за сменените зони (рядко събитие).
    for zoneId in pairs(changedOwners) do
        MySQL.update.await(
            'UPDATE bg_territory SET owner = ?, updated_at = NOW() WHERE zone_id = ?',
            { owners[zoneId], zoneId }
        )
    end
end

-------------------------------------------------------------------------------
-- Основен tick
-------------------------------------------------------------------------------

local function runTick()
    -- 1) Присъствие + натрупване по реалните позиции на игрите.
    local presence = {}  -- presence[zoneId][faction] = true
    for _, sid in ipairs(GetPlayers()) do
        local src = tonumber(sid)
        local ped = GetPlayerPed(src)                 -- кеширан native
        if ped and ped ~= 0 then
            local coords = GetEntityCoords(ped)        -- кеширан native
            local zoneId = BGConfig.GetZoneAt(coords)
            if zoneId then
                local faction = bgCore:GetPlayerFaction(src)  -- четено от сървъра, не от клиента
                if faction and BGConfig.IsFaction(faction) then
                    presence[zoneId] = presence[zoneId] or {}
                    presence[zoneId][faction] = true
                    addInfluence(zoneId, faction, T.influencePerTick, T.maxInfluence)
                end
            end
        end
    end

    -- 2) Разпад на фракциите БЕЗ присъствие + определяне на нов контрол.
    local changedOwners = {}
    for zoneId in pairs(BGConfig.Zones) do
        local infz = influence[zoneId]
        local pres = presence[zoneId]

        for faction, pts in pairs(infz) do
            if not (pres and pres[faction]) then
                local nv = math.max(0, pts - T.decayPerTick)
                if nv ~= pts then
                    infz[faction] = nv
                    markDirty(zoneId, faction)
                end
            end
        end

        -- Водеща фракция в зоната.
        local leader, leadPts = nil, 0
        for faction, pts in pairs(infz) do
            if pts > leadPts then
                leader, leadPts = faction, pts
            end
        end

        -- Смяна на контрол само при праг И различен текущ собственик.
        if leader and leadPts >= T.captureThreshold and owners[zoneId] ~= leader then
            owners[zoneId] = leader
            changedOwners[zoneId] = true
            notifyZoneCapture(zoneId, leader)
            lib.print.info(('[bg_territory] „%s“ поета от %s (%d т.)'):format(
                BGConfig.Zones[zoneId].label, BGConfig.Factions[leader].label, leadPts))
        end
    end

    -- 3) Персистирай пестеливо и репликирай при смяна на собственик.
    persist(changedOwners)
    if next(changedOwners) then
        publishOwners()
    end
end

-------------------------------------------------------------------------------
-- Инициализация
-------------------------------------------------------------------------------

local function bootstrap()
    -- Гарантирай ред за всяка зона (owner NULL по подразбиране) и подготви паметта.
    for zoneId in pairs(BGConfig.Zones) do
        MySQL.prepare.await('INSERT IGNORE INTO bg_territory (zone_id, owner) VALUES (?, NULL)', { zoneId })
        influence[zoneId] = {}
        owners[zoneId] = false
    end

    -- Зареди текущите собственици.
    local trows = MySQL.query.await('SELECT zone_id, owner FROM bg_territory', {}) or {}
    for _, r in ipairs(trows) do
        if BGConfig.IsZone(r.zone_id) then
            owners[r.zone_id] = (r.owner ~= nil and BGConfig.IsFaction(r.owner)) and r.owner or false
        end
    end

    -- Зареди влиянието в памет (валидирано; цели числа, без отрицателни).
    local irows = MySQL.query.await('SELECT zone_id, faction, points FROM bg_territory_influence', {}) or {}
    for _, r in ipairs(irows) do
        if BGConfig.IsZone(r.zone_id) and BGConfig.IsFaction(r.faction) then
            local pts = math.floor(tonumber(r.points) or 0)
            influence[r.zone_id][r.faction] = math.max(0, math.min(T.maxInfluence, pts))
        end
    end

    publishOwners()

    -- Server thread: преизчисляване на всеки tickSeconds. Никакъв `while true` без Wait.
    CreateThread(function()
        while true do
            Wait(T.tickSeconds * 1000)
            runTick()
        end
    end)

    lib.print.info(('[bg_territory] Заредена територия — %d зони, tick %ds'):format(
        (function() local n = 0 for _ in pairs(BGConfig.Zones) do n = n + 1 end return n end)(),
        T.tickSeconds))
end

AddEventHandler('onResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    bootstrap()
end)

-------------------------------------------------------------------------------
-- Публично API
-------------------------------------------------------------------------------

--- Върни текущия собственик на зона (factionKey) или false (ничия) / nil (невалидна зона).
--- @param zoneId string
--- @return string|false|nil
exports('GetZoneOwner', function(zoneId)
    if not BGConfig.IsZone(zoneId) then return nil end
    return owners[zoneId] or false
end)
