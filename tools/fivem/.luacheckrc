-- .luacheckrc — статичен анализ за FiveM/CfxLua ресурси (Геймъра v2.0).
-- Копирай в корена на ресурса (или ползвай: luacheck --config tools/fivem/.luacheckrc .)
-- CfxLua ≠ vanilla Lua 5.4 — затова декларираме CFX глобалите, иначе luacheck вдига шум.
std = "lua54"
max_line_length = 140
-- Игнорирай „unused self/arg", празни блокове в EventHandler-и и т.н.
ignore = { "212", "213", "631" }

-- Чести CitizenFX/ox/framework глобали (четими). Допълвай според ресурса.
read_globals = {
  -- Citizen / нишки / събития
  "Citizen", "CreateThread", "Wait", "SetTimeout",
  "RegisterNetEvent", "AddEventHandler", "RemoveEventHandler",
  "TriggerEvent", "TriggerServerEvent", "TriggerClientEvent",
  "RegisterCommand", "RegisterKeyMapping", "AddStateBagChangeHandler",
  -- Exports / ресурси
  "exports", "GetCurrentResourceName", "GetResourceState", "GetHashKey",
  -- State bags / entity helpers
  "Entity", "Player", "GlobalState", "NetworkGetEntityFromNetworkId",
  "GetPlayerPed", "GetPlayers", "source",
  -- Често ползвани natives (примерни — добави твоите)
  "PlayerPedId", "PlayerId", "GetEntityCoords", "SetEntityCoords",
  "CreateVehicle", "DeleteEntity", "DoesEntityExist", "RequestModel",
  "HasModelLoaded", "GetGameTimer", "vector2", "vector3", "vector4", "quat",
  -- ox / framework
  "lib", "cache", "ox", "ESX", "QBCore",
}
