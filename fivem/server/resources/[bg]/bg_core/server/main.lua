--- bg_core/server/main.lua
--- Cross-cutting server helper-и, ползвани от всички наши ресурси.
--- Изнесени като exports, за да няма дублиран код и да е лесно за одит.

local qbx = exports.qbx_core

--- Прати ox_lib нотификация до играч.
--- @param src number source (server id)
--- @param msg string
--- @param nType string|nil 'success'|'error'|'inform'|'warning'
local function Notify(src, msg, nType)
    TriggerClientEvent('ox_lib:notify', src, {
        title = 'Балкан',
        description = msg,
        type = nType or 'inform',
    })
end
exports('Notify', Notify)

--- Прост per-играч rate limit. Връща true, ако действието е РАЗРЕШЕНО (извън cooldown).
--- Защита срещу event spam/flood (server-authoritative пропускателна способност).
local rateBuckets = {}
--- @param src number
--- @param key string име на действието
--- @param seconds number минимален интервал между извикванията
--- @return boolean allowed
local function RateLimit(src, key, seconds)
    local now = os.time()
    local bucket = rateBuckets[src]
    if not bucket then bucket = {}; rateBuckets[src] = bucket end
    local last = bucket[key]
    if last and (now - last) < seconds then
        return false
    end
    bucket[key] = now
    return true
end
exports('RateLimit', RateLimit)

AddEventHandler('playerDropped', function()
    rateBuckets[source] = nil
end)

--- Връща citizenid на играча или nil (без да гърми, ако не е зареден).
--- @param src number
--- @return string|nil
local function GetCitizenId(src)
    local player = qbx:GetPlayer(src)
    if not player then return nil end
    return player.PlayerData.citizenid
end
exports('GetCitizenId', GetCitizenId)

--- Връща фракцията (ганг) на играча по qbx gang данните, ако съвпада с наша фракция.
--- @param src number
--- @return string|nil factionKey
local function GetPlayerFaction(src)
    local player = qbx:GetPlayer(src)
    if not player then return nil end
    local gang = player.PlayerData.gang and player.PlayerData.gang.name
    if gang and BGConfig.IsFaction(gang) then
        return gang
    end
    return nil
end
exports('GetPlayerFaction', GetPlayerFaction)

lib.print.info('[bg_core] Заредено ядро на „Балкан“ — ' ..
    ('%d фракции, %d зони'):format(
        (function() local n = 0 for _ in pairs(BGConfig.Factions) do n = n + 1 end return n end)(),
        (function() local n = 0 for _ in pairs(BGConfig.Zones) do n = n + 1 end return n end)()
    ))
