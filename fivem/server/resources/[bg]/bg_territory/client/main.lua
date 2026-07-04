--- bg_territory/client/main.lua
--- Клиентът само визуализира: чете собствениците от GlobalState.bg_territory (репликирано
--- от сървъра) и оцветява зоновите blip-ове по фракцията-собственик. Никаква логика/авторитет
--- тук; никакви natives всеки кадър без Wait; предпочитаме statebag handler пред polling.

local T = BGConfig.Territory

local zoneBlips = {}   -- zoneBlips[zoneId] = { radius = blip, coord = blip }
local lastOwners = {}  -- lastOwners[zoneId] = factionKey|false — за notify само при промяна

-- Неутрален цвят (ничия зона). 40 = сивкав стандартен GTA blip цвят.
local NEUTRAL_COLOUR = 40

-- Приблизителна карта RGB -> стандартен GTA blip color index. Радиус-blip-овете приемат
-- палитрен индекс, не суров RGB, затова избираме най-близкия индекс до BGConfig color.
local PALETTE = {
    { i = 1, r = 224, g = 50,  b = 50 },   -- червено
    { i = 2, r = 114, g = 204, b = 114 },  -- зелено
    { i = 3, r = 93,  g = 182, b = 229 },  -- синьо
    { i = 5, r = 240, g = 200, b = 80 },   -- жълто
    { i = 27, r = 156, g = 110, b = 175 }, -- лилаво-ish
}

--- Най-близкият blip index до даден RGB (евклидово разстояние в RGB).
--- @param rgb table {r,g,b}
--- @return number blipColourIndex
local function nearestColour(rgb)
    local cr, cg, cb = rgb[1], rgb[2], rgb[3]
    local best, bestd = PALETTE[1].i, math.huge
    for _, c in ipairs(PALETTE) do
        local dr, dg, db = cr - c.r, cg - c.g, cb - c.b
        local d = dr * dr + dg * dg + db * db
        if d < bestd then
            bestd, best = d, c.i
        end
    end
    return best
end

--- Приложи цвят към двата blip-а на зоната според собственика.
local function applyColour(zoneId, owner)
    local blips = zoneBlips[zoneId]
    if not blips then return end
    local colour = NEUTRAL_COLOUR
    if owner and BGConfig.Factions[owner] then
        colour = nearestColour(BGConfig.Factions[owner].color)
    end
    SetBlipColour(blips.radius, colour)
    SetBlipColour(blips.coord, colour)
end

--- Създай blip-овете за всички зони веднъж (радиус + точка с име).
local function createBlips()
    for zoneId, z in pairs(BGConfig.Zones) do
        local radius = AddBlipForRadius(z.coords.x, z.coords.y, z.coords.z, z.radius)
        SetBlipAlpha(radius, 128)
        SetBlipHighDetail(radius, true)

        local coord = AddBlipForCoord(z.coords.x, z.coords.y, z.coords.z)
        SetBlipSprite(coord, 84)              -- иконка тип „територия/банда“
        SetBlipAsShortRange(coord, true)
        SetBlipScale(coord, 0.85)
        BeginTextCommandSetBlipName('STRING')
        AddTextComponentSubstringPlayerName(z.label)
        EndTextCommandSetBlipName(coord)

        zoneBlips[zoneId] = { radius = radius, coord = coord }
    end
end

--- Опресни всички зони от текущото GlobalState и покажи notify при смяна на owner.
local function refreshFromState()
    local map = GlobalState.bg_territory
    for zoneId in pairs(BGConfig.Zones) do
        local owner = (map and map[zoneId]) or false
        applyColour(zoneId, owner)

        local prev = lastOwners[zoneId]
        if prev ~= nil and prev ~= owner and owner and BGConfig.Factions[owner] then
            lib.notify({
                title = 'Територия',
                description = ('%s пое „%s“'):format(BGConfig.Factions[owner].label, BGConfig.Zones[zoneId].label),
                type = 'inform',
            })
        end
        lastOwners[zoneId] = owner
    end
end

-- Създаване + първоначално оцветяване.
CreateThread(function()
    createBlips()
    refreshFromState()
end)

-- Основен път за обновяване: репликирана промяна на GlobalState.bg_territory (bag 'global').
AddStateBagChangeHandler('bg_territory', 'global', function(_bagName, _key, _value)
    refreshFromState()
end)

-- Fallback опресняване, ако statebag събитие бъде пропуснато (рядко) — с Wait, без spam.
CreateThread(function()
    while true do
        Wait(T.blipRefreshMs)
        refreshFromState()
    end
end)
