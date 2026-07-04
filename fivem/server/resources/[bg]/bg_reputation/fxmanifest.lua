fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'bg_reputation'
author 'Carbon Stealth VCC'
description 'Балкан — LOOP C: репутация/наследство. Светът те помни (NPC цени/достъп реагират на репутацията).'
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
}
