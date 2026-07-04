--- bg_economy/server/main.lua
--- LOOP B — server-authoritative икономика.
--- Правило №1: клиентът ИСКА, сървърът РЕШАВА. Цена, количество, наличност и
--- собственост се четат/смятат тук — никога от payload-а на клиента.

local qbx = exports.qbx_core
local Eco = BGConfig.Economy

-- Пазар в памет (единствен източник на истина за текущите стойности).
-- prices: good -> текуща цена (цяло). demand: good -> индекс на търсене (float за плавен decay).
local prices = {}
local demand = {}

-------------------------------------------------------------------------------
-- Помощници (ценообразуване, отстъпки, фракции)
-------------------------------------------------------------------------------

--- Смята цената на стока от текущото търсене и я клампва между пода и тавана.
--- price = base * (demand/100)^elasticity, клампнато в [priceFloorPct%, priceCeilPct%].
--- @param good string
--- @return integer price
local function computePrice(good)
    local def = Eco.goods[good]
    local d = demand[good] or 100
    local raw = def.base * (d / 100) ^ Eco.elasticity
    local floor = def.base * Eco.priceFloorPct / 100
    local ceil = def.base * Eco.priceCeilPct / 100
    if raw < floor then raw = floor elseif raw > ceil then raw = ceil end
    return math.floor(raw + 0.5)
end

--- Отстъпка по репутация спрямо фракцията на играча (мека междуресурсна връзка).
--- Ако bg_reputation липсва/гърми — 0 (защитено с pcall). Може да е и отрицателна (враг).
--- @param src number
--- @return number pct
local function getDiscount(src)
    local faction = exports.bg_core:GetPlayerFaction(src)
    if not faction then return 0 end
    local ok, pct = pcall(function()
        return exports.bg_reputation:GetDiscount(src, faction)
    end)
    if ok and type(pct) == 'number' then return pct end
    return 0
end

--- Строи карта citizenid -> фракция за ОНЛАЙН играчите (за control bonus в cron-а).
--- Няма директна citizenid->фракция без зареден играч, затова офлайн собственик = без бонус.
--- @return table<string,string>
local function buildOnlineFactions()
    local map = {}
    for _, sid in ipairs(GetPlayers()) do
        local src = tonumber(sid)
        local cid = exports.bg_core:GetCitizenId(src)
        if cid then
            local f = exports.bg_core:GetPlayerFaction(src)
            if f then map[cid] = f end
        end
    end
    return map
end

--- Публикува текущите цени в GlobalState за клиента (репликира се при промяна).
local function publishMarket()
    local gs = {}
    for good, price in pairs(prices) do gs[good] = price end
    GlobalState.bg_market = gs
end

-------------------------------------------------------------------------------
-- Seed при старт
-------------------------------------------------------------------------------

--- Зарежда/сейдва bg_market от BGConfig.Economy.goods и вдига цените в памет + GlobalState.
local function seedMarket()
    for good, def in pairs(Eco.goods) do
        MySQL.insert.await(
            'INSERT IGNORE INTO bg_market (good, price, demand) VALUES (?, ?, 100)',
            { good, def.base })
    end
    local rows = MySQL.query.await('SELECT good, price, demand FROM bg_market', {})
    for _, r in ipairs(rows or {}) do
        if Eco.goods[r.good] then
            demand[r.good] = r.demand
            prices[r.good] = r.price
        end
    end
    -- Осигури стойност за всяка конфигурирана стока (при добавена нова в конфига).
    for good in pairs(Eco.goods) do
        if not demand[good] then demand[good] = 100 end
        if not prices[good] then prices[good] = computePrice(good) end
    end
    publishMarket()
    lib.print.info('[bg_economy] Пазар зареден — ' ..
        (function() local n = 0 for _ in pairs(prices) do n = n + 1 end return n end)() .. ' стоки')
end

AddEventHandler('onResourceStart', function(res)
    if res ~= GetCurrentResourceName() then return end
    seedMarket()
end)

-------------------------------------------------------------------------------
-- Търговия (server-authoritative)
-------------------------------------------------------------------------------

RegisterNetEvent('bg_economy:trade', function(good, qty, action)
    local src = source
    if not exports.bg_core:RateLimit(src, 'trade', 1) then return end

    -- Валидация на входа — не вярвай на нищо от клиента.
    if type(good) ~= 'string' or not Eco.goods[good] then return end
    if type(qty) ~= 'number' or qty ~= math.floor(qty) or qty < 1 or qty > 100 then return end
    if action ~= 'buy' and action ~= 'sell' then return end

    local player = qbx:GetPlayer(src)
    if not player then return end

    -- Цената идва от СЪРВЪРНАТА памет, не от клиента.
    local price = prices[good] or computePrice(good)

    if action == 'buy' then
        local discount = getDiscount(src)
        local total = math.max(0, math.floor(price * qty * (1 - discount / 100) + 0.5))

        if not player.Functions.RemoveMoney('bank', total, 'bg_economy:buy:' .. good) then
            exports.bg_core:Notify(src, 'Недостатъчно средства в банката.', 'error')
            return
        end
        local ok = exports.ox_inventory:AddItem(src, good, qty)
        if not ok then
            -- Инвентарът е пълен → връщаме парите (атомарност на транзакцията).
            player.Functions.AddMoney('bank', total, 'bg_economy:buy-refund')
            exports.bg_core:Notify(src, 'Няма място в инвентара.', 'error')
            return
        end
        -- Покупката вдига търсенето.
        demand[good] = math.min(500, (demand[good] or 100) + qty)
        exports.bg_core:Notify(src, ('Купи %dx %s за %d лв.'):format(qty, Eco.goods[good].label, total), 'success')
    else
        -- Продажба: наличността се чете от ox_inventory (сървърна истина).
        local have = exports.ox_inventory:Search(src, 'count', good) or 0
        if have < qty then
            exports.bg_core:Notify(src, 'Нямаш достатъчно за продажба.', 'error')
            return
        end
        if not exports.ox_inventory:RemoveItem(src, good, qty) then
            exports.bg_core:Notify(src, 'Продажбата се провали.', 'error')
            return
        end
        local total = price * qty
        player.Functions.AddMoney('bank', total, 'bg_economy:sell:' .. good)
        -- Продажбата сваля търсенето.
        demand[good] = math.max(10, (demand[good] or 100) - qty)
        exports.bg_core:Notify(src, ('Продаде %dx %s за %d лв.'):format(qty, Eco.goods[good].label, total), 'success')
    end

    -- Преизчисли и персистирай новата цена + търсене; опресни клиента.
    prices[good] = computePrice(good)
    MySQL.update('UPDATE bg_market SET price = ?, demand = ? WHERE good = ?',
        { prices[good], math.floor((demand[good] or 100) + 0.5), good })
    publishMarket()
end)

-------------------------------------------------------------------------------
-- Cron: приход на бизнеси + разпад на търсенето
-------------------------------------------------------------------------------

--- Начислява офлайн приход на всеки бизнес (таван maxOfflineHours), с control bonus,
--- ако зоната се контролира от фракцията на (онлайн) собственика. Пести DB чрез транзакция.
local function runPayout()
    local rows = MySQL.query.await(
        'SELECT id, owner, zone_id, balance, level, UNIX_TIMESTAMP(last_payout) AS last_ts FROM bg_businesses', {})
    if not rows or #rows == 0 then return end

    local now = os.time()
    local territory = GlobalState.bg_territory or {}
    local onlineFactions = buildOnlineFactions()
    local capMin = Eco.maxOfflineHours * 60
    local updates = {}

    for _, b in ipairs(rows) do
        local zone = BGConfig.Zones[b.zone_id]
        if zone then
            local elapsedMin = (now - (b.last_ts or now)) / 60
            if elapsedMin < 0 then elapsedMin = 0 end
            if elapsedMin > capMin then elapsedMin = capMin end

            local cycles = elapsedMin / Eco.payoutIntervalMinutes
            local income = zone.baseIncome * b.level * cycles

            -- Control bonus: зоната се държи от фракцията на собственика (само ако е онлайн).
            local ownerFaction = onlineFactions[b.owner]
            if ownerFaction and territory[b.zone_id] == ownerFaction then
                income = income * (1 + Eco.controlBonusPct / 100)
            end

            income = math.floor(income)
            if income > 0 then
                updates[#updates + 1] = {
                    query = 'UPDATE bg_businesses SET balance = balance + ?, last_payout = FROM_UNIXTIME(?) WHERE id = ?',
                    values = { income, now, b.id },
                }
            end
        end
    end

    if #updates > 0 then
        MySQL.transaction.await(updates)
    end
end

--- Придърпва търсенето към базата (100) с demandDecayPerHour%/час, скалирано за cron интервала.
local function decayDemand()
    local pull = Eco.demandDecayPerHour * (Eco.payoutIntervalMinutes / 60) / 100
    for good in pairs(Eco.goods) do
        local d = demand[good] or 100
        d = d + (100 - d) * pull
        demand[good] = d
        prices[good] = computePrice(good)
        MySQL.update('UPDATE bg_market SET price = ?, demand = ? WHERE good = ?',
            { prices[good], math.floor(d + 0.5), good })
    end
    publishMarket()
end

CreateThread(function()
    local intervalMs = Eco.payoutIntervalMinutes * 60000
    while true do
        Wait(intervalMs)
        runPayout()
        decayDemand()
    end
end)

-------------------------------------------------------------------------------
-- Събиране на приход (server-authoritative собственост)
-------------------------------------------------------------------------------

RegisterNetEvent('bg_economy:collect', function(businessId)
    local src = source
    if not exports.bg_core:RateLimit(src, 'collect', 2) then return end
    if type(businessId) ~= 'number' or businessId ~= math.floor(businessId) or businessId < 1 then return end

    local citizenid = exports.bg_core:GetCitizenId(src)
    if not citizenid then return end

    local row = MySQL.single.await('SELECT owner, balance FROM bg_businesses WHERE id = ?', { businessId })
    if not row or row.owner ~= citizenid then
        exports.bg_core:Notify(src, 'Това не е твой бизнес.', 'error')
        return
    end

    local amount = row.balance
    if amount <= 0 then
        exports.bg_core:Notify(src, 'Няма натрупан приход.', 'inform')
        return
    end

    -- Атомарно нулиране: нулирай САМО ако balance е още същият → без двойно събиране (race/exploit).
    local affected = MySQL.update.await(
        'UPDATE bg_businesses SET balance = 0 WHERE id = ? AND balance = ?', { businessId, amount })
    if not affected or affected == 0 then
        exports.bg_core:Notify(src, 'Опитай пак.', 'error')
        return
    end

    local player = qbx:GetPlayer(src)
    if not player then return end
    player.Functions.AddMoney('bank', amount, 'bg_economy:collect')
    exports.bg_core:Notify(src, ('Прибра %d лв. приход.'):format(amount), 'success')
end)

-- Клиентско меню /business чете списъка си оттук (server-authoritative по citizenid).
lib.callback.register('bg_economy:getBusinesses', function(src)
    local citizenid = exports.bg_core:GetCitizenId(src)
    if not citizenid then return {} end
    return MySQL.query.await(
        'SELECT id, type, zone_id, balance, level FROM bg_businesses WHERE owner = ?', { citizenid }) or {}
end)

-------------------------------------------------------------------------------
-- Публично API
-------------------------------------------------------------------------------

--- Текуща цена на стока.
--- @param good string
--- @return integer|nil
exports('GetPrice', function(good)
    return prices[good]
end)

--- Копие на целия пазар (good -> цена).
--- @return table<string,integer>
exports('GetMarket', function()
    local out = {}
    for g, p in pairs(prices) do out[g] = p end
    return out
end)
