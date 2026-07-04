fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'bg_spawn'
author 'Carbon Stealth VCC'
description 'Балкан — onboarding: стартов пакет + tutorial за новите играчи (първите 10 мин)'
version '0.1.0'

shared_scripts {
    '@ox_lib/init.lua',
    '@bg_core/shared/config.lua',
    'config.lua',
}

client_scripts {
    'client/main.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua',
}

dependencies {
    'bg_core',
    'ox_lib',
    'oxmysql',
    'qbx_core',
    'ox_inventory',
}
