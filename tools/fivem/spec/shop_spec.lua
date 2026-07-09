-- shop_spec.lua — busted unit тест с мокнати natives (Геймъра v2.1).
-- Тества чистата СЪРВЪРНА логика (валидация на покупка) без FXServer.
-- Пускане:  busted tools/fivem/spec/shop_spec.lua
-- Показва модела: стъбни natives → require/зареди логиката → assert.

-- 1) Мокни CFX natives/събития, които логиката докосва.
_G.RegisterNetEvent = function() end
_G.AddEventHandler = function() end
_G.TriggerClientEvent = function() end
local serverBalance = { [1] = 100 } -- пари по source (сървърно състояние)
local Config = { items = { water = { price = 25 } } }

-- 2) Логиката за валидиране (в реалния ресурс е в server/main.lua; тук — копие/require).
local function validatePurchase(src, item, qty)
  if type(item) ~= "string" or type(qty) ~= "number" then return false, "лоши типове" end
  if qty <= 0 or qty > 100 then return false, "невалидно количество" end
  local def = Config.items[item]
  if not def then return false, "непознат предмет" end
  local cost = def.price * qty                 -- цена от СЪРВЪРНИЯ Config, не от клиента
  if (serverBalance[src] or 0) < cost then return false, "недостатъчно пари" end
  return true, cost
end

describe("validatePurchase (server-authoritative)", function()
  it("приема валидна покупка", function()
    local ok, cost = validatePurchase(1, "water", 2)
    assert.is_true(ok); assert.are.equal(50, cost)
  end)
  it("отхвърля отрицателно количество (анти-дюпинг)", function()
    local ok = validatePurchase(1, "water", -999)
    assert.is_false(ok)
  end)
  it("отхвърля непознат предмет", function()
    assert.is_false((validatePurchase(1, "diamond", 1)))
  end)
  it("отхвърля при недостатъчно пари (баланс от сървъра)", function()
    assert.is_false((validatePurchase(1, "water", 100))) -- 2500 > 100
  end)
  it("игнорира клиентска „цена" — ползва Config", function()
    -- дори клиентът да прати цена, тя не участва: проверяваме чрез cost = Config.price*qty
    local _, cost = validatePurchase(1, "water", 1)
    assert.are.equal(25, cost)
  end)
end)
