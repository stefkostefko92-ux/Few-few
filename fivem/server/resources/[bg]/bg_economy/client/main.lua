--- bg_economy/client/main.lua
--- Клиентска част: само ВХОД и UI. Цени идват от GlobalState.bg_market (сървърна истина),
--- всяка сделка/събиране е обикновена ЗАЯВКА към сървъра — той решава.

-------------------------------------------------------------------------------
-- Пазар (ox_lib контекст меню)
-------------------------------------------------------------------------------

--- Пита за количество и праща заявка за търговия. Сървърът валидира отново.
--- @param good string
--- @param action string 'buy'|'sell'
local function promptTrade(good, action)
    local input = lib.inputDialog(action == 'buy' and 'Купуване' or 'Продаване', {
        { type = 'number', label = 'Количество', min = 1, max = 100, default = 1, required = true },
    })
    if not input then return end
    local qty = math.floor(input[1] or 0)
    if qty < 1 or qty > 100 then return end
    TriggerServerEvent('bg_economy:trade', good, qty, action)
end

--- Подменю за конкретна стока: купи / продай.
--- @param good string
--- @param def table
--- @param price number
local function openGoodMenu(good, def, price)
    lib.registerContext({
        id = 'bg_market_good',
        title = def.label,
        menu = 'bg_market',
        options = {
            {
                title = 'Купи',
                icon = 'cart-shopping',
                description = ('%d лв. / бр.'):format(price),
                onSelect = function() promptTrade(good, 'buy') end,
            },
            {
                title = 'Продай',
                icon = 'money-bill',
                description = ('%d лв. / бр.'):format(price),
                onSelect = function() promptTrade(good, 'sell') end,
            },
        },
    })
    lib.showContext('bg_market_good')
end

--- Отваря пазара с текущите цени от GlobalState.
local function openMarket()
    local market = GlobalState.bg_market or {}
    local options = {}
    for good, def in pairs(BGConfig.Economy.goods) do
        local price = market[good] or def.base
        options[#options + 1] = {
            title = def.label,
            description = ('Текуща цена: %d лв.'):format(price),
            onSelect = function() openGoodMenu(good, def, price) end,
        }
    end
    lib.registerContext({ id = 'bg_market', title = 'Пазар — Балкан', options = options })
    lib.showContext('bg_market')
end

RegisterCommand('market', function() openMarket() end, false)

-- Търговски пункт във всяка зона (ox_target сфера в центъра на зоната).
CreateThread(function()
    for id, zone in pairs(BGConfig.Zones) do
        exports.ox_target:addSphereZone({
            coords = zone.coords,
            radius = 3.0,
            debug = false,
            options = {
                {
                    name = 'bg_market_' .. id,
                    icon = 'fa-solid fa-store',
                    label = 'Пазар',
                    onSelect = openMarket,
                },
            },
        })
    end
end)

-------------------------------------------------------------------------------
-- Бизнеси (списък + събиране на приход)
-------------------------------------------------------------------------------

--- Взима бизнесите от сървъра и показва меню за събиране.
local function openBusinessMenu()
    local businesses = lib.callback.await('bg_economy:getBusinesses', false)
    if not businesses or #businesses == 0 then
        lib.notify({ title = 'Бизнеси', description = 'Нямаш регистрирани бизнеси.', type = 'inform' })
        return
    end

    local options = {}
    for _, b in ipairs(businesses) do
        local zone = BGConfig.Zones[b.zone_id]
        options[#options + 1] = {
            title = ('%s (ниво %d)'):format(zone and zone.label or b.zone_id, b.level),
            description = ('Натрупан приход: %d лв. — избери за събиране'):format(b.balance),
            onSelect = function()
                TriggerServerEvent('bg_economy:collect', b.id)
            end,
        }
    end

    lib.registerContext({ id = 'bg_business', title = 'Моите бизнеси', options = options })
    lib.showContext('bg_business')
end

RegisterCommand('business', function() openBusinessMenu() end, false)
