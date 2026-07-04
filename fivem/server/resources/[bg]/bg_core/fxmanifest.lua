fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'bg_core'
author 'Carbon Stealth VCC'
description 'Балкан — споделено ядро: конфиг (фракции/зони/loop параметри) + server helper-и'
version '0.1.0'

shared_scripts {
    '@ox_lib/init.lua',
    'shared/config.lua',
}

server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua',
}

dependencies {
    'ox_lib',
    'oxmysql',
    'qbx_core',
}
