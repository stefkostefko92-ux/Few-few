-- event-fuzz.lua — референтен exploit-тест за сървърни събития (Геймъра v2.1).
-- Залива даден net event с НЕВАЛИДНИ параметри, за да докаже, че сървърната
-- валидация ги отхвърля (а не дюпва пари/предмети). Пускай на ТЕСТОВ сървър
-- (command), никога на прод. Това е защита-в-дълбочина към server-authoritative.
--
-- Инсталирай като ресурс/команда и пусни: /fuzz <eventName>
local payloads = {
  nil, false, 0, -1, -999999, 2^53, "", ("x"):rep(100000),
  {}, { qty = -1 }, { item = 123 }, { item = "<script>" }, { __proto = true },
  1/0, -1/0, "0 OR 1=1", "'; DROP TABLE users;--",
}

RegisterCommand("fuzz", function(source, args)
  local event = args[1]
  if not event then print("употреба: /fuzz <eventName>") return end
  print(("[fuzz] заливам „%s" с %d злонамерени payload-а…"):format(event, #payloads))
  for i, p in ipairs(payloads) do
    -- симулираме клиент, който праща боклук към сървърния хендлър
    TriggerEvent(event, p, p)        -- хендлърът ТРЯБВА да оцелее/отхвърли всеки
    Wait(50)
  end
  print("[fuzz] готово. Провери: няма ли срив, дюп, грешка в конзолата или промяна на състоянието?")
  print("[fuzz] Очаквано: всеки невалиден вход е отхвърлен с лог, без страничен ефект.")
end, true) -- restricted (само за админ/конзола)
