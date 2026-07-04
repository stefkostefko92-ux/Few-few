--- bg_spawn/client/main.lua
--- Клиентска част на onboarding-а: съобщава за зареждане и показва tutorial стъпките.

-- Съобщи на сървъра, че играчът е зареден (qbx излъчва това събитие).
AddEventHandler('QBCore:Client:OnPlayerLoaded', function()
    TriggerServerEvent('bg_spawn:playerLoaded')
end)

-- Fallback за qbx native събитие.
AddEventHandler('qbx_core:client:playerLoaded', function()
    TriggerServerEvent('bg_spawn:playerLoaded')
end)

--- Показва tutorial-а стъпка по стъпка и телепортира новия играч в стартовата зона.
RegisterNetEvent('bg_spawn:startTutorial', function(steps, spawnCoords)
    -- Телепорт до стартовата зона (лек guided spawn).
    if spawnCoords then
        local ped = cache.ped or PlayerPedId()
        SetEntityCoords(ped, spawnCoords.x, spawnCoords.y, spawnCoords.z, false, false, false, false)
        SetEntityHeading(ped, spawnCoords.w)
    end

    CreateThread(function()
        for i, text in ipairs(steps) do
            lib.notify({
                title = ('Старт (%d/%d)'):format(i, #steps),
                description = text,
                type = 'inform',
                duration = 6000,
            })
            Wait(6500)
        end
        TriggerServerEvent('bg_spawn:tutorialDone')
    end)
end)
