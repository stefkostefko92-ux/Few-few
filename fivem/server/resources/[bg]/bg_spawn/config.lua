--- bg_spawn/config.lua — параметри на onboarding-а.
Spawn = {}

--- Стартова зона за нови играчи (Legion Square — централно, ориентир).
Spawn.NewPlayerCoords = vec4(215.0, -810.0, 30.7, 340.0)

--- Стартов пакет (само удобство/старт, НЕ pay-to-win, НЕ inflation).
Spawn.StarterPack = {
    cash = 500,                 -- малко в брой, колкото за първите стъпки
    bank = 1000,                -- стартов баланс в банка
    items = {
        { name = 'phone',      count = 1 },
        { name = 'water',      count = 2 },
        { name = 'sandwich',   count = 2 },
        { name = 'id_card',    count = 1 },
    },
}

--- Стъпки на tutorial-а (показват се като ox_lib text/notify последователно).
Spawn.Tutorial = {
    'Добре дошъл в „Балкан“! 🇧🇬',
    'Натисни F1 за телефона — там са работите и картата.',
    'Иди в „Job Center“ (blip), за да започнеш първата си работа.',
    'Първите пари ги изкарваш за 5 минути — просто следвай blip-овете.',
    'Питай в Discord или извикай Ментор с /mentor, ако си изгубен.',
}
