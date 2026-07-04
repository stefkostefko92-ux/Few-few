--- bg_reputation/server/main.lua
--- LOOP C — репутация/наследство. Сървърът е АВТОРИТЕТЪТ: клиентът никога не праща
--- суров „amount“. Печеленето/губенето на репутация става server-to-server през
--- export AddRep (викан от други наши ресурси) или през админ команда за тест.
---
--- Модел в паметта: rep[citizenid][faction] = number (държим float заради бавния
--- разпад; към DB и към exports се закръгля до цяло). Пише се лениво (dirty set),
--- flush на playerDropped и веднъж на час — за да пестим базата.

local qbx = exports.qbx_core

local rep      = {}   -- citizenid -> { faction -> number }
local dirty    = {}   -- citizenid -> { faction -> true }  (чака запис)
local srcToCid = {}   -- src (server id) -> citizenid       (за flush при напускане)

local REP = BGConfig.Reputation

-------------------------------------------------------------------------------
-- Помощници
-------------------------------------------------------------------------------

--- Закръгляне до най-близкото цяло (репутацията в DB е INT).
--- @param v number
--- @return number
local function round(v)
    return math.floor(v + 0.5)
end

--- Ограничава стойност в [min, max] на репутацията.
--- @param v number
--- @return number
local function clampRep(v)
    if v < REP.min then return REP.min end
    if v > REP.max then return REP.max end
    return v
end

--- Маркира (citizenid, faction) за отложен запис.
local function markDirty(citizenid, faction)
    local d = dirty[citizenid]
    if not d then d = {}; dirty[citizenid] = d end
    d[faction] = true
end

--- Зарежда репутацията на citizenid от DB в кеша (ако още не е). Ленива инициализация:
--- дори да сме пропуснали PlayerLoaded, първият Get/AddRep ще напълни кеша.
--- @param citizenid string
--- @return table factions  -- { faction -> number }
local function ensureLoaded(citizenid)
    local cached = rep[citizenid]
    if cached then return cached end

    local rows = MySQL.query.await(
        'SELECT faction, rep FROM bg_reputation WHERE citizenid = ?', { citizenid })

    local t = {}
    if rows then
        for _, row in ipairs(rows) do
            t[row.faction] = row.rep
        end
    end
    rep[citizenid] = t
    return t
end

--- Записва всички dirty фракции на един citizenid чрез UPSERT (batch prepare).
--- @param citizenid string
local function flushCitizen(citizenid)
    local d = dirty[citizenid]
    local cache = rep[citizenid]
    if not d or not cache then return end

    local params = {}
    for faction in pairs(d) do
        local value = cache[faction]
        if value ~= nil then
            params[#params + 1] = { citizenid, faction, round(value) }
        end
    end
    dirty[citizenid] = nil
    if #params == 0 then return end

    -- UPSERT: рефлектирай новата стойност при съществуващ ред.
    MySQL.prepare.await(
        'INSERT INTO bg_reputation (citizenid, faction, rep) VALUES (?, ?, ?) '
        .. 'ON DUPLICATE KEY UPDATE rep = VALUES(rep)', params)
end

--- Резолвва citizenid от src и запомня мапинга (за flush при drop). nil, ако не е зареден.
--- @param src number
--- @return string|nil
local function cidFromSrc(src)
    local citizenid = exports.bg_core:GetCitizenId(src)
    if citizenid then srcToCid[src] = citizenid end
    return citizenid
end

-------------------------------------------------------------------------------
-- Exports (server-authoritative). Всички приемат src (server id) и резолвват
-- citizenid ВЪТРЕ — викащият ресурс не подава суров citizenid/сума на доверие.
-------------------------------------------------------------------------------

--- Добавя (или отнема при отрицателна сума) репутация. Валидира фракция и цяла сума,
--- clamp-ва в [min,max], записва лениво и нотифицира при СМЯНА на tier.
--- Ползва се server-to-server (напр. bg_territory/bg_economy), не от суров клиентски вход.
--- @param src number source (server id)
--- @param faction string ключ на фракция
--- @param amount number цяло число (може отрицателно)
--- @return number|nil newRep  -- новата репутация или nil при отказ
local function AddRep(src, faction, amount)
    if not BGConfig.IsFaction(faction) then return nil end

    amount = tonumber(amount)
    if not amount then return nil end
    amount = math.floor(amount)          -- само цели точки
    if amount == 0 then
        -- нищо за промяна, но върни текущата стойност коректно
    end

    local citizenid = cidFromSrc(src)
    if not citizenid then return nil end

    local cache = ensureLoaded(citizenid)
    local old = cache[faction] or 0
    local oldTier = BGConfig.GetRepTier(old)

    local new = clampRep(old + amount)
    if new == old then return round(new) end

    cache[faction] = new
    markDirty(citizenid, faction)

    -- Нотифицирай само при реална смяна на ниво (не при всяка точка).
    local newTier = BGConfig.GetRepTier(new)
    if newTier.label ~= oldTier.label then
        local fLabel = BGConfig.Factions[faction].label
        if new > old then
            exports.bg_core:Notify(src,
                ('Репутация с %s: %s'):format(fLabel, newTier.label), 'success')
        else
            exports.bg_core:Notify(src,
                ('Репутация с %s падна: %s'):format(fLabel, newTier.label), 'warning')
        end
    end

    return round(new)
end
exports('AddRep', AddRep)

--- Текуща репутация на играча спрямо фракция (0, ако няма ред).
--- @param src number
--- @param faction string
--- @return number
local function GetRep(src, faction)
    if not BGConfig.IsFaction(faction) then return 0 end
    local citizenid = cidFromSrc(src)
    if not citizenid then return 0 end
    local cache = ensureLoaded(citizenid)
    return round(cache[faction] or 0)
end
exports('GetRep', GetRep)

--- Tier таблицата {at,label,discount} за текущата репутация спрямо фракция.
--- @param src number
--- @param faction string
--- @return table tier
local function GetTier(src, faction)
    return BGConfig.GetRepTier(GetRep(src, faction))
end
exports('GetTier', GetTier)

--- Отстъпката (%) от текущия tier — ползва се от bg_economy при NPC цени.
--- @param src number
--- @param faction string
--- @return number discountPct
local function GetDiscount(src, faction)
    return GetTier(src, faction).discount
end
exports('GetDiscount', GetDiscount)

-------------------------------------------------------------------------------
-- Callback за клиентската команда /rep — връща САМО репутацията на source-а.
-- source се подава от ox_lib (реалният играч) — не се вярва на клиентски аргумент.
-------------------------------------------------------------------------------

lib.callback.register('bg_reputation:getMine', function(src)
    local citizenid = cidFromSrc(src)
    local out = {}
    if not citizenid then return out end

    local cache = ensureLoaded(citizenid)
    for faction in pairs(BGConfig.Factions) do
        local value = round(cache[faction] or 0)
        local tier = BGConfig.GetRepTier(value)
        out[faction] = { rep = value, tier = tier.label, discount = tier.discount }
    end
    return out
end)

-------------------------------------------------------------------------------
-- Жизнен цикъл на играча
-------------------------------------------------------------------------------

--- Предварително зарежда кеша при влизане на играч (qbx излъчва QBCore-съвместимо
--- събитие с player обекта). Ленивото зареждане така или иначе покрива пропуски.
AddEventHandler('QBCore:Server:PlayerLoaded', function(player)
    local pd = player and player.PlayerData
    if not pd or not pd.citizenid then return end
    if pd.source then srcToCid[pd.source] = pd.citizenid end
    ensureLoaded(pd.citizenid)
end)

--- Flush + освобождаване на кеша при напускане (пише само dirty редовете).
AddEventHandler('playerDropped', function()
    local src = source
    local citizenid = srcToCid[src]
    srcToCid[src] = nil
    if not citizenid then return end
    -- Ако друг активен source ползва същия citizenid, не чисти кеша.
    for _, cid in pairs(srcToCid) do
        if cid == citizenid then
            flushCitizen(citizenid)
            return
        end
    end
    flushCitizen(citizenid)
    rep[citizenid] = nil
    dirty[citizenid] = nil
end)

-------------------------------------------------------------------------------
-- Бавен дневен разпад към 0 (репутацията не е вечна) + периодичен flush.
-- Работи веднъж на час само върху кешираните (онлайн) играчи — пести DB.
-------------------------------------------------------------------------------

CreateThread(function()
    local hourlyStep = REP.dailyDecay / 24.0   -- разпад/час
    while true do
        Wait(60 * 60 * 1000)                   -- на ~1 час

        for citizenid, factions in pairs(rep) do
            for faction, value in pairs(factions) do
                local nv = value
                if nv > 0 then
                    nv = math.max(0, nv - hourlyStep)
                elseif nv < 0 then
                    nv = math.min(0, nv + hourlyStep)
                end
                if nv ~= value then
                    factions[faction] = nv
                    markDirty(citizenid, faction)
                end
            end
            -- Периодичен flush на натрупаните промени (crash-safety, но пестеливо).
            flushCitizen(citizenid)
        end
    end
end)

-------------------------------------------------------------------------------
-- Админ вход за ТЕСТ: /setrep <playerId> <faction> <amount> (само group.admin).
-- „set“ = абсолютна стойност, но минава през AddRep (единствен авторитетен път).
-------------------------------------------------------------------------------

lib.addCommand('setrep', {
    help = 'Задай репутация на играч спрямо фракция (тест/админ)',
    params = {
        { name = 'target',  type = 'playerId', help = 'Server ID на играча' },
        { name = 'faction', type = 'string',   help = 'Ключ на фракция' },
        { name = 'amount',  type = 'number',   help = 'Целева стойност' },
    },
    restricted = 'group.admin',
}, function(source, args)
    local target = args.target
    local faction = args.faction

    if not BGConfig.IsFaction(faction) then
        exports.bg_core:Notify(source, 'Невалидна фракция: ' .. tostring(faction), 'error')
        return
    end
    if not GetPlayerName(target) then
        exports.bg_core:Notify(source, 'Няма такъв играч онлайн.', 'error')
        return
    end

    -- Абсолютна стойност чрез делта, за да мине през единствения авторитетен път.
    local current = GetRep(target, faction)
    local delta = math.floor(args.amount) - current
    local new = AddRep(target, faction, delta)

    if new then
        exports.bg_core:Notify(source,
            ('Репутация на %s спрямо %s = %d'):format(GetPlayerName(target), faction, new), 'success')
    else
        exports.bg_core:Notify(source, 'Неуспешна промяна (играчът зареден ли е?).', 'error')
    end
end)

lib.print.info('[bg_reputation] Заредено — светът помни. Разпад: '
    .. REP.dailyDecay .. '/ден към 0.')
