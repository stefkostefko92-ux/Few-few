fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'bg_territory'
author 'Carbon Stealth VCC'
description 'Балкан — LOOP A: динамична територия (влияние/контрол на зони от фракции)'
version '0.1.0'

shared_scripts {
    '@ox_lib/init.lua',
    '@bg_core/shared/config.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua',
}

client_scripts {
    'client/main.lua',
}

dependencies {
    'bg_core',
    'ox_lib',
    'oxmysql',
    'qbx_core',
}
