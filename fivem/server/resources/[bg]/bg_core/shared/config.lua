--- bg_core/shared/config.lua
--- Споделеният ДОГОВОР на сървъра „Балкан“.
--- Всеки наш ресурс включва този файл през `shared_scripts { '@bg_core/shared/config.lua', ... }`
--- и чете глобалната таблица `BGConfig`. Тук се дефинират фракции, зони и параметри
--- на трите заробващи loop-а (територия / икономика / репутация). Един източник на истината.

BGConfig = {}

--- Рамка (само за референция; ресурсите ползват qbx_core/ox директно).
BGConfig.Framework = 'qbx'

--- Фракции (банди), които се борят за територия и носят репутация.
--- key = вътрешен идентификатор (в DB и събития); label = за UI; color = RGB за blip/маркер.
BGConfig.Factions = {
    ballas    = { label = 'Ballas',    color = { 130, 0, 130 } },
    families  = { label = 'Families',  color = { 0, 130, 0 } },
    triads    = { label = 'Triads',    color = { 200, 160, 0 } },
    syndicate = { label = 'Syndicate', color = { 0, 90, 200 } },
}

--- Зони на влияние. Реални GTA V координати (Los Santos).
--- baseIncome = базов приход/цикъл за контролиращата фракция (икономика).
--- businessType = какъв тип бизнес процъфтява в зоната (икономика/офлайн приход).
BGConfig.Zones = {
    grove      = { label = 'Grove Street',  coords = vec3(84.0, -1959.0, 21.1),   radius = 140.0, baseIncome = 250, businessType = 'convenience' },
    vinewood   = { label = 'Vinewood',      coords = vec3(300.0, 200.0, 104.0),   radius = 160.0, baseIncome = 400, businessType = 'nightclub' },
    vespucci   = { label = 'Vespucci Beach',coords = vec3(-1223.0, -1487.0, 4.3), radius = 150.0, baseIncome = 300, businessType = 'bar' },
    mirrorpark = { label = 'Mirror Park',   coords = vec3(1148.0, -645.0, 57.0),  radius = 130.0, baseIncome = 220, businessType = 'mechanic' },
    sandy      = { label = 'Sandy Shores',  coords = vec3(1961.0, 3740.0, 32.3),  radius = 200.0, baseIncome = 180, businessType = 'hardware' },
    delperro   = { label = 'Del Perro Pier',coords = vec3(-1601.0, -1015.0, 13.0),radius = 140.0, baseIncome = 330, businessType = 'restaurant' },
}

--- LOOP A — Динамична територия (bg_territory).
BGConfig.Territory = {
    tickSeconds       = 60,   -- през колко секунди server thread преизчислява влиянието
    influencePerTick  = 2,    -- точки/цикъл за всеки жив член на фракция, стоящ в зоната
    decayPerTick      = 1,    -- разпад/цикъл на всяка фракция без присъствие в зоната
    captureThreshold  = 100,  -- точки, над които фракцията поема контрол над зоната
    maxInfluence      = 200,  -- таван на влиянието на фракция в зона
    blipRefreshMs     = 30000,-- клиентско опресняване на blip цветовете
}

--- LOOP B — Жива икономика + офлайн бизнеси (bg_economy).
BGConfig.Economy = {
    payoutIntervalMinutes = 15,   -- през колко минути cron начислява приход на бизнесите
    demandDecayPerHour    = 5,    -- търсенето се връща към базата с толкова %/час
    priceFloorPct         = 40,   -- цената не пада под 40% от базовата
    priceCeilPct          = 250,  -- и не се качва над 250%
    elasticity            = 0.6,  -- колко силно транзакциите движат цената (0–1)
    controlBonusPct       = 25,   -- бонус приход за бизнес в зона, контролирана от собствената фракция
    maxOfflineHours       = 12,   -- таван на офлайн натрупването (без вечно трупане)
    goods = {                     -- стоки с базова цена; цените плуват от offer/demand
        food     = { label = 'Храна',      base = 40 },
        fuel     = { label = 'Гориво',     base = 120 },
        parts    = { label = 'Части',      base = 350 },
        alcohol  = { label = 'Алкохол',    base = 90 },
        supplies = { label = 'Провизии',   base = 60 },
    },
}

--- LOOP C — Репутация / наследство (bg_reputation).
BGConfig.Reputation = {
    min = -1000,
    max = 1000,
    tiers = {          -- праг (>=) => етикет + отстъпка при NPC цени (%)
        { at = -1000, label = 'Враг',       discount = -25 },
        { at = -200,  label = 'Непознат',   discount = 0 },
        { at = 200,   label = 'Приятел',    discount = 8 },
        { at = 500,   label = 'Доверен',    discount = 15 },
        { at = 800,   label = 'Легенда',    discount = 25 },
    },
    dailyDecay = 2,    -- бавен разпад/ден към 0, за да не е репутацията вечна
}

-------------------------------------------------------------------------------
-- Споделени помощници (shared: викат се и от клиент, и от сървър)
-------------------------------------------------------------------------------

--- Връща id-то на зоната, съдържаща дадени координати, или nil.
--- @param coords vector3
--- @return string|nil zoneId
function BGConfig.GetZoneAt(coords)
    for id, z in pairs(BGConfig.Zones) do
        if #(coords - z.coords) <= z.radius then
            return id
        end
    end
    return nil
end

--- Връща tier таблицата (label/discount) за дадена репутационна стойност.
--- @param rep number
--- @return table tier
function BGConfig.GetRepTier(rep)
    local current = BGConfig.Reputation.tiers[1]
    for _, t in ipairs(BGConfig.Reputation.tiers) do
        if rep >= t.at then current = t end
    end
    return current
end

--- Валидна ли е фракцията?
function BGConfig.IsFaction(key)
    return key ~= nil and BGConfig.Factions[key] ~= nil
end

--- Валидна ли е зоната?
function BGConfig.IsZone(key)
    return key ~= nil and BGConfig.Zones[key] ~= nil
end
