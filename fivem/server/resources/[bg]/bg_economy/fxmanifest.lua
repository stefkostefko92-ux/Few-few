fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'bg_economy'
author 'Carbon Stealth VCC'
description 'Балкан — LOOP B: жива икономика (плаващи цени) + офлайн бизнеси (cron приход)'
version '0.1.0'

shared_scripts {
    '@ox_lib/init.lua',
    '@bg_core/shared/config.lua',
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
    'ox_target',
}
