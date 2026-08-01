import type { ContentBundle } from './types';

/** Превод на `bg.ts`. `id`-тата са ИДЕНТИЧНИ — те са котви в URL-а. */
export const contentEn: ContentBundle = {
  keywords: [
    'FiveM rules',
    'roleplay rules',
    'RDM VDM rules',
    'metagaming powergaming',
    'New Life Rule',
    'FiveM tutorial',
    'how to play FiveM',
    'Carbon Stealth',
  ],
  rules: [
    {
      id: 'platform',
      title: 'Platform rules (Cfx.re / FiveM)',
      intro:
        'These are the platform’s rules, not a server’s. Breaking them is punished by Cfx.re — with an account ban or by taking the server down — no matter what a particular server’s rules say.',
      sources: [
        { label: 'Cfx.re terms', url: 'https://fivem.net/terms' },
        { label: 'FiveM documentation', url: 'https://docs.fivem.net/docs/' },
        { label: 'Cfx.re support', url: 'https://support.cfx.re/' },
      ],
      items: [
        {
          id: 'cheats',
          title: 'Cheats, injectors and mod menus',
          body: 'Using, distributing and advertising cheats, executors and menus is forbidden. It is the fastest way to lose your Cfx account permanently, not just access to one server.',
        },
        {
          id: 'leaks',
          title: 'Stolen and resold resources',
          body: 'Sharing someone else’s paid scripts, cars and maps (“leaks”) breaks both the platform rules and copyright. A server running on stolen resources gets taken down once the author reports it.',
          example: {
            good: 'You buy the script from its author, or use open source with a clear licence.',
            bad: 'You download a “free” copy of a paid script from a leaks Discord.',
          },
        },
        {
          id: 'ip',
          title: 'Rockstar and Take-Two intellectual property',
          body: 'You may not sell access to the game itself, advertise pirated copies, or present your server as an official Rockstar product. The trademarks may be used to identify the platform, never as the name of your own service.',
        },
        {
          id: 'monetisation',
          title: 'Server monetisation',
          body: 'The platform allows donations and selling conveniences, but not selling an advantage that breaks the game for others, nor content you do not hold the rights to. Monetisation rules change — check them before you open a shop.',
        },
        {
          id: 'server-conduct',
          title: 'What a server owner owes',
          body: 'A server needs public rules, working moderation and a way to be contacted. Failing to moderate illegal content is not neutrality — it is liability.',
        },
        {
          id: 'account',
          title: 'One account, no ban evasion',
          body: 'Creating a new Cfx account to get around a ban is forbidden. Evasion usually extends the penalty and makes it permanent.',
        },
        {
          id: 'reporting',
          title: 'How to report to the platform',
          body: 'Reports about cheats, stolen resources or abuse go through Cfx.re support, with evidence (a recording, a link, the resource name). A report without evidence almost never leads to action.',
        },
      ],
    },
    {
      id: 'rockstar',
      title: 'Game rules (Rockstar / GTA V)',
      intro:
        'FiveM is a multiplayer platform running on your own copy of GTA V. So on top of the Cfx.re rules, Rockstar’s terms for the game itself apply.',
      sources: [
        { label: 'Rockstar end user licence agreement', url: 'https://www.rockstargames.com/eula' },
        { label: 'Rockstar legal', url: 'https://www.rockstargames.com/legal' },
        { label: 'Rockstar support', url: 'https://support.rockstargames.com/' },
      ],
      items: [
        {
          id: 'legal-copy',
          title: 'A legal copy of GTA V is required',
          body: 'FiveM requires the game purchased and activated through Steam, Epic Games or the Rockstar Games Launcher. A pirated copy is not supported and not up for discussion — the client verifies ownership.',
        },
        {
          id: 'eula-mods',
          title: 'The modding policy',
          body: 'Rockstar has historically tolerated single-player modifications, as long as they are not used for an unfair advantage online, are not sold, and do not infringe their rights. That is tolerance, not a right — the policy can change.',
        },
        {
          id: 'online-separation',
          title: 'FiveM is not GTA Online',
          body: 'FiveM runs on separate servers and does not touch your GTA Online progress. Do not carry anything between the two and never use FiveM-side tools in GTA Online — there it is a violation with direct consequences for your account.',
          example: {
            good: 'You roleplay on a FiveM server, quit, and launch GTA Online separately.',
            bad: 'You load a mod menu “because it works on FiveM” while in GTA Online.',
          },
        },
        {
          id: 'account-risk',
          title: 'The risk is on your account',
          body: 'Whatever you do with your game is your responsibility. A penalty lands on the account that owns the game — not on the server you were playing on.',
        },
        {
          id: 'age',
          title: 'Age rating',
          body: 'GTA V is rated 18+ (PEGI 18 / ESRB M). Many Bulgarian RP servers also set their own minimum age — most often 16 or 18.',
        },
      ],
    },
    {
      id: 'roleplay',
      title: 'Core roleplay rules',
      intro:
        'This is the core you will meet on almost every Bulgarian roleplay server. The wording differs, the meaning does not: your character is a person with a life, not an avatar in a shooter. Every rule here is community practice — the individual server is what enforces it.',
      sources: [
        { label: 'FiveM documentation', url: 'https://docs.fivem.net/docs/' },
        { label: 'Cfx.re forum', url: 'https://forum.cfx.re/' },
      ],
      items: [
        {
          id: 'rdm',
          title: 'RDM — Random Deathmatch',
          body: 'Killing without a roleplay reason and without prior interaction. The reason has to make sense from the outside: a conflict, a threat, a robbery — not “I was bored”.',
          community: true,
          example: {
            good: 'After an argument over a debt you threaten, give a chance to pay, and only then draw.',
            bad: 'You step out of the car and shoot the first passer-by.',
          },
        },
        {
          id: 'vdm',
          title: 'VDM — Vehicle Deathmatch',
          body: 'Using a vehicle as a weapon without a roleplay reason. That includes “escaping through the crowd” and deliberately running someone over after a crash.',
          community: true,
        },
        {
          id: 'metagaming',
          title: 'Metagaming',
          body: 'Using information in-game that your character does not have — from Discord, a stream, a nametag or an out-of-character conversation.',
          community: true,
          example: {
            good: 'You learn the address because someone told your character in-game.',
            bad: 'You drive to an address you saw on someone’s stream.',
          },
        },
        {
          id: 'powergaming',
          title: 'Powergaming',
          body: 'Actions impossible for a real person, or forcing an outcome with no chance to respond. It also covers a character who feels no pain, fear or fatigue.',
          community: true,
          example: {
            good: '/me tries to knock the knife out of his hand.',
            bad: '/me knocks the knife away, breaks his arm and drops him — with no chance to react.',
          },
        },
        {
          id: 'fear-rp',
          title: 'Fear RP / Value of Life',
          body: 'Your character values their life. With a gun pointed at you, you do not run, do not draw your own, and do not act fearless — you react like a person in danger.',
          community: true,
        },
        {
          id: 'nlr',
          title: 'New Life Rule (NLR)',
          body: 'After death your character does not remember how they died, does not return to the spot, and does not seek revenge for it. Most servers also set a period during which the area is off limits.',
          community: true,
        },
        {
          id: 'combat-logging',
          title: 'Combat logging',
          body: 'Leaving the game during an active scene — a shootout, an arrest, a robbery — to avoid the consequence. Disconnecting “because of my internet” in the middle of an arrest is treated as running away.',
          community: true,
        },
        {
          id: 'ooc-ic',
          title: 'OOC / IC separation',
          body: 'Out of character and in character do not mix. Complaints, rule arguments and personal attacks have no place in voice chat during a scene — they go into a Discord ticket.',
          community: true,
        },
        {
          id: 'fail-rp',
          title: 'Fail RP',
          body: 'Behaviour that breaks the sense of a real world: jumping off roofs for no reason, driving on after a head-on crash, chatting with an officer as if nothing happened.',
          community: true,
        },
        {
          id: 'cop-baiting',
          title: 'Cop baiting',
          body: 'Provoking the police purely to trigger a chase. A crime needs a roleplay purpose, not just an adrenaline excuse.',
          community: true,
        },
        {
          id: 'robbery-limits',
          title: 'Robbery limits',
          body: 'Most servers set a minimum number of participants, forbidden areas, a cooldown between robberies, and a cap on what may be taken from a victim.',
          community: true,
        },
        {
          id: 'green-zone',
          title: 'Safe zones (green zones)',
          body: 'Violence is forbidden around hospitals, police stations and new-player areas. The zone is not a hiding place — running into it to cut a scene short is a violation too.',
          community: true,
        },
        {
          id: 'erp',
          title: 'Erotic roleplay (ERP)',
          body: 'Allowed only between adults, only with the consent of everyone involved, and only where the server permits it. The absence of an explicit “no” is not consent.',
          community: true,
        },
        {
          id: 'ck-pk',
          title: 'Character Kill and Player Kill',
          body: 'PK means the character survives and carries on with no memory of what happened. CK is the character’s final death and usually requires staff approval and the player’s consent.',
          community: true,
        },
        {
          id: 'gunplay',
          title: 'Gunfight rules',
          body: 'Weapons come after roleplay, not instead of it. Drive-by shooting without a reason, swapping weapons mid-scene to dodge damage, and returning to a scene you fled are all forbidden.',
          community: true,
        },
        {
          id: 'mic',
          title: 'Microphone and audio quality',
          body: 'You need an intelligible microphone with no background noise and no music. Playing music or sound effects into voice chat ruins the scene for everyone nearby.',
          community: true,
        },
        {
          id: 'streaming',
          title: 'Streaming',
          body: 'A stream is public, but the information in it is out of character. Using someone’s stream for an advantage is metagaming, and revealing another person’s address or personal data on air is a violation beyond the game.',
          community: true,
        },
        {
          id: 'ban-evasion',
          title: 'Ban evasion and alt accounts',
          body: 'A new account after a ban extends the penalty. Second characters or accounts are usually allowed only with explicit permission, and never to play both in the same scene.',
          community: true,
        },
        {
          id: 'toxicity',
          title: 'Toxicity and discrimination',
          body: 'Slurs based on race, gender, origin, religion or sexuality are not “my character’s personality”. Heavy themes are only touched with the participants’ prior consent.',
          community: true,
        },
        {
          id: 'advert-abuse',
          title: 'Abusing adverts and emergency calls',
          body: 'Adverts and 112/911 calls are part of the world, not a chat channel. False reports, spam and out-of-character advertising are punished.',
          community: true,
        },
      ],
    },
  ],
  tutorials: [
    {
      id: 'install',
      title: 'Installing FiveM',
      summary: 'What you need and how to get a working client in ten minutes.',
      steps: [
        {
          title: 'Buy GTA V and launch it at least once',
          body: 'You need a legal copy through Steam, Epic Games or the Rockstar Games Launcher. Run the game once up to the main menu — that creates the profile and files FiveM looks for.',
        },
        {
          title: 'Download the client from fivem.net',
          body: 'Get FiveM only from the official site, fivem.net. Any other “installer” is a risk to your account.',
        },
        {
          title: 'Install into a clean folder',
          body: 'Pick an empty folder outside Program Files (for example C:\\FiveM). Installing into the game’s own folder causes problems on update.',
        },
        {
          title: 'Allow it in your antivirus',
          body: 'FiveM downloads resources every time you join a server, which often looks suspicious to antivirus software. Add the folder as an exception if the install stops halfway.',
        },
        {
          title: 'Sign in with a Cfx.re account',
          body: 'The account keeps your favourite servers and is needed for parts of the ecosystem. One account per person — a second one after a ban is evasion.',
        },
      ],
    },
    {
      id: 'join',
      title: 'How to join a server',
      summary: 'Three ways in — from the fastest to the manual one.',
      steps: [
        {
          title: 'Through a cfx.re/join link',
          body: 'The fastest: click the server’s link here in the directory and the client opens by itself. If it does not, copy the code after /join.',
        },
        {
          title: 'Through the in-client list',
          body: 'In FiveM open “Play” and search for the server name. Star your favourites — the list is long and names repeat.',
        },
        {
          title: 'Manually through the console',
          body: 'Press F8 and type connect <address>, for example connect 1.2.3.4:30120. This works even when the server is not in the public list.',
        },
        {
          title: 'If loading gets stuck',
          body: 'The first join downloads all of the server’s resources and can take several minutes. If it always stops at the same point, clear the cache (FiveM Application Data\\data\\cache) and try again.',
        },
      ],
    },
    {
      id: 'first-minutes',
      title: 'Your first 15 minutes on an RP server',
      summary: 'How not to get banned in your first hour.',
      steps: [
        {
          title: 'Read the rules before you join',
          body: 'Every server has its own version. The differences are in the details — the NLR timer, the safe zones, the robbery rules.',
        },
        {
          title: 'Create a character, not an avatar',
          body: 'A name, an age, a job and one weakness. A character with no backstory has nothing to react with, and it shows immediately.',
        },
        {
          title: 'Learn /me and /do',
          body: '/me describes what your character does (“/me reaches into his pocket”). /do states a fact about the world or the character (“/do his hands are shaking”). Together they make possible everything the game cannot show.',
        },
        {
          title: 'Talk before you shoot',
          body: 'Almost every first-hour punishment comes from RDM or VDM. If you are not sure you have a reason — you do not.',
        },
        {
          title: 'Do not settle disputes in character',
          body: 'Think someone is breaking the rules? Finish the scene and open a Discord ticket with a recording. Arguing out loud mid-scene is a violation in itself.',
        },
      ],
    },
    {
      id: 'frameworks',
      title: 'ESX, QBCore and Qbox — what is the difference',
      summary: 'What the player feels, not what the code says.',
      steps: [
        {
          title: 'ESX',
          body: 'The oldest and most widespread framework. A huge choice of scripts and jobs; the interface is often plainer and the economy looser.',
        },
        {
          title: 'QBCore',
          body: 'More modern and better organised. The inventory, IDs and phone are usually more polished, and servers on it lean towards more serious roleplay.',
        },
        {
          title: 'Qbox',
          body: 'A fork of QBCore focused on performance. For the player it mostly feels like fewer stutters when a lot of people are online.',
        },
        {
          title: 'ox_core',
          body: 'A light modern framework from the team behind ox_lib and oxmysql. Less common, usually on servers that care about clean code and speed.',
        },
        {
          title: 'Which one is better',
          body: 'Neither. The framework decides what the menus look like, not how good the roleplay is — that comes from the community and the moderation.',
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Common problems and fixes',
      summary: 'The five that stop most people.',
      steps: [
        {
          title: 'FiveM will not start',
          body: 'Run it as administrator, make sure GTA V launches on its own, and check that your antivirus has not quarantined the client.',
        },
        {
          title: '“Couldn’t load resource”',
          body: 'A resource on the server is broken or unreachable. Clear the cache and retry; if it always fails on the same resource, the problem is on the server, not on your machine.',
        },
        {
          title: 'Kicked while loading',
          body: 'Usually a modified game folder or leftovers from another mod. FiveM wants a clean copy of GTA V — move manual mods aside.',
        },
        {
          title: 'Low frame rate',
          body: 'Lower grass and shadow quality, turn off third-party overlays and close your browser. Script-heavy servers load the CPU, not the graphics card.',
        },
        {
          title: 'You cannot hear other players',
          body: 'Check that the server’s voice module is allowed in Windows settings and that the microphone is selected inside FiveM, not only in Windows.',
        },
      ],
    },
  ],
};
