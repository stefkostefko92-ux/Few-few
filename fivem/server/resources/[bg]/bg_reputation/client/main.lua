--- bg_reputation/client/main.lua
--- Клиентска част: командата /rep пита сървъра за собствената репутация по всички
--- фракции и я показва в ox_lib context меню. Клиентът само ИСКА и ПОКАЗВА —
--- стойностите и tier-ът идват авторитетно от сървъра.

--- Изгражда и показва менюто от данните на сървъра.
--- @param data table  -- { faction -> { rep, tier, discount } }
local function showRepMenu(data)
    local options = {}

    for faction, meta in pairs(BGConfig.Factions) do
        local info = data[faction] or { rep = 0, tier = '—', discount = 0 }
        local color = meta.color or { 255, 255, 255 }

        options[#options + 1] = {
            title = meta.label,
            description = ('Репутация: %d  •  Ниво: %s  •  Отстъпка: %d%%')
                :format(info.rep, info.tier, info.discount),
            -- Цвят на фракцията като метаданни (визуален акцент).
            metadata = {
                { label = 'Точки', value = info.rep },
                { label = 'Ниво', value = info.tier },
                { label = 'Отстъпка при NPC', value = info.discount .. '%' },
            },
            colorScheme = ('#%02x%02x%02x'):format(color[1], color[2], color[3]),
        }
    end

    lib.registerContext({
        id = 'bg_reputation_menu',
        title = 'Репутация — как те помни светът',
        options = options,
    })
    lib.showContext('bg_reputation_menu')
end

--- /rep — заявка към сървъра и показване. lib.callback.await блокира само тази нишка.
RegisterCommand('rep', function()
    local data = lib.callback.await('bg_reputation:getMine', false)
    if not data then
        lib.notify({ title = 'Репутация', description = 'Няма данни (зареден ли си?).', type = 'error' })
        return
    end
    showRepMenu(data)
end, false)

TriggerEvent('chat:addSuggestion', '/rep', 'Покажи репутацията си спрямо фракциите')
