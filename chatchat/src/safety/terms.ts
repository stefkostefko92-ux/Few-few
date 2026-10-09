/**
 * Термините на речника (IT, EN, BG) — само данни; шаблоните и класификацията са в lexicon.ts.
 * Пишат се сгънати (малки букви, без ударения); lexicon.ts ги сгъва още веднъж като текста.
 * Само термини от терена — никакъв текст от нормите (UNI/EN са лицензирани).
 */

import { SEP, TOK, DI, near } from './patterns.js';

export const SAFETY_DEVICES: readonly string[] = [
  // IT
  String.raw`(?:catena|circuito|serie|linea)${DI}sicurezz\p{L}*`,
  String.raw`sicurezze`,
  String.raw`contatt\p{L}*${DI}(?:port[ae]|cabina|piano|serratur\p{L}*|sicurezz\p{L}*|fossa|paracadute|limitator\p{L}*|extracors\p{L}*|finecors\p{L}*|fine corsa|tenditor\p{L}*|stop|botol\p{L}*|emergenza|sovraccaric\p{L}*|fun[ei] allentat\p{L}*|allentamento fun[ei])`,
  String.raw`port[ae]${DI}(?:piano|cabina)`,
  String.raw`serratur\p{L}*|chiavistell\p{L}*`,
  String.raw`paracadute`,
  String.raw`limitator\p{L}*`,
  String.raw`extracors\p{L}*|finecors\p{L}*|fine corsa`,
  String.raw`ammortizzator\p{L}*|respingent\p{L}*`,
  String.raw`ucm|a3|movimento incontrollato`,
  String.raw`(?:controllo|monitoraggio|sorveglianza|contatt\p{L}*|micro\p{L}*)${DI}fren[oi]`,
  String.raw`(?:pulsant\p{L}*|interruttor\p{L}*|fungo)${DI}(?:stop|emergenza|arresto)`,
  String.raw`stop${DI}(?:fossa|emergenza|tetto|cabina|ispezione)|arresto di emergenza`,
  String.raw`fotocellul\p{L}*|barriera${DI}(?:fotocellul\p{L}*|luce|infrarossi)|barriera (?:fotoelettrica|ottica)|costa (?:sensibile|meccanica|mobile)`,
  String.raw`sovraccaric\p{L}*|pesacaric\p{L}*|pesatura|limitatore di carico`,
  // EN
  String.raw`safety (?:chain|circuit|string|loop|line)s?`,
  String.raw`(?:door|gate) (?:contact|switch|interlock|lock)(?:es|s)?|(?:landing|car|hall|shaft) doors?(?: (?:contact|lock|interlock|switch)(?:es|s)?)?|interlocks?|door locks?`,
  String.raw`safety gears?|safeties|progressive gear|instantaneous gear`,
  String.raw`(?:overspeed |speed )?governors?(?: (?:switch|rope|contact)(?:es|s)?)?`,
  String.raw`(?:final |ultimate |terminal )?limit switch(?:es)?|final limits?`,
  String.raw`buffers|(?:car|counterweight|pit|oil|spring|hydraulic|energy) buffer`,
  String.raw`(?:unintended|uncontrolled) car movement`,
  String.raw`brake (?:monitoring|switch|switches|contact|contacts)`,
  String.raw`(?:pit|car ?top|stop|emergency stop) (?:switch(?:es)?|button)|pit stop|emergency stop`,
  String.raw`photo ?(?:cell|eye)s?|light curtains?|safety edges?`,
  String.raw`overload(?: device| switch| contact)?|load weighing`,
  String.raw`slack rope(?: switch)?`,
  // BG
  String.raw`верига(?:та)? (?:за|на) безопасност(?:та)?|предпазн\p{L}* верига\p{L}*|защитн\p{L}* верига\p{L}*`,
  String.raw`(?:вратн\p{L}*|предпазн\p{L}*) контакт\p{L}*|контакт\p{L}* (?:на|за) (?:врат\p{L}*|кабина\p{L}*|етаж\p{L}*|ключалк\p{L}*|ловител\p{L}*|ограничител\p{L}*|приям\p{L}*|шахт\p{L}*|безопасност\p{L}*)`,
  String.raw`етажн\p{L}* врат\p{L}*|кабинн\p{L}* врат\p{L}*|врат\p{L}* на (?:етажа|кабината|шахтата)`,
  String.raw`ключалк\p{L}*|заключващ\p{L}* устройств\p{L}*`,
  String.raw`ловител\p{L}*`,
  String.raw`ограничител\p{L}*`,
  String.raw`крайн\p{L}* изключвател\p{L}*|краен изключвател\p{L}*`,
  String.raw`буфери(?:те)?|буфер(?:а|ът)? (?:на|под) (?:кабината|противотежестта)`,
  String.raw`а3`,
  String.raw`стоп бутон\p{L}*|бутон\p{L}* (?:за )?стоп|авариен стоп|аварийн\p{L}* стоп|стоп (?:в|във|на) (?:приямъка|шахтата|покрива)`,
  String.raw`фотоклетк\p{L}*|светлинн\p{L}* завес\p{L}*`,
  String.raw`претоварване|товароизмерв\p{L}*`,
  String.raw`контрол\p{L}* на спирачката`,
];

/** Места и режими: опасни, когато се работи там/в тях — само с глагол за действие. */
export const SAFETY_PLACES: readonly string[] = [
  // IT
  String.raw`fossa|testata|tetto${DI}cabina|tetto|vano(?: di)? corsa|vano ascensore|(?:manovra|modalita|modo|comando)${DI}ispezion\p{L}*`,
  String.raw`ispezion\p{L}*`,
  String.raw`fren[oi]`,
  String.raw`fun[ei]`,
  String.raw`manovra${DI}(?:emergenza|soccorso)|manovra (?:a mano|manuale)|volantino`,
  // EN
  String.raw`pit|headroom|top of (?:the )?(?:shaft|hoistway|car)|car (?:top|roof)|hoistway|lift shaft|elevator shaft|lift well`,
  String.raw`inspection (?:mode|operation|control|switch|box|station|travel|run)`,
  String.raw`brakes?(?! (?:resistor|chopper|module|unit))`,
  String.raw`(?:suspension |hoist |governor )?ropes`,
  String.raw`emergency (?:operation|rescue|electrical operation)|manual rescue`,
  // BG
  String.raw`приям\p{L}*|шахт\p{L}*|покрив\p{L}* на кабината|глава(?:та)? на шахтата`,
  String.raw`ревизи\p{L}*|инспекционен режим`,
  String.raw`спирачк\p{L}*`,
  String.raw`въже(?:та|тата|то)?|носещ\p{L}* въжета`,
  String.raw`аварийн\p{L}* (?:режим|управление)`,
];

/** Думи, които сами по себе си значат мост/байпас в този занаят. */
export const BYPASS_ALONE: readonly string[] = [
  // IT
  // глаголът е мост; съществителното „ponticello“ (и на платка) — само до обект или с „mettere/fare“
  String.raw`ponticell(?:are|ate|ando|ato|ata|ati|ate|a|iamo|arlo|arla|arli|arle|atura|ature|amento)`,
  String.raw`(?<!valvol\p{L}*${SEP}(?:di${SEP}|del${SEP})?)by[ -]?pass\p{L}*(?! (?:valve|клапан))`,
  String.raw`shunt(?:are|a|ate|ato|ata|ati|ando|iamo|arlo|arla|arli)`,
  String.raw`(?:mett|fa|fare|inser|aggiung)\p{L}* (?:un |il |dei |i |due |uno )?(?:cavallott\p{L}*|ponticell\p{L}*|ponte|ponti)`,
  String.raw`(?:un |il )?ponte (?:sul|sulla|sui|sulle|su|tra|fra)|ponticell[oi] (?:tra|fra)`,
  String.raw`manomett\p{L}*|manomission\p{L}*|manomess\p{L}*`,
  String.raw`senza (?:le |la |i |il )?(?:sicurezz\p{L}*|contatt\p{L}*${DI}(?:port[ae]|serratur\p{L}*|sicurezz\p{L}*))`,
  String.raw`cortocircuit(?:are|ate|ando|arlo|arla|arli)`,
  // EN
  String.raw`jumper(?:ed|ing)|jumper (?:wire|lead|cable|out)|jump(?:ed|ing)? out`,
  String.raw`(?:put|place|fit|install|use|add)(?: a| the| in a)? jumpers?(?: wire| lead)? (?:on|across|between|over|in)`,
  String.raw`tamper(?:ing|ed)? with`,
  String.raw`without (?:the )?(?:safet(?:y|ies)|door contacts?|interlocks?|safety (?:chain|circuit))`,
  // BG
  String.raw`(?:за)?мост(?:в|н|я|ч|и[шмт])\p{L}*`,
  String.raw`мост (?:на|между|върху|през)`,
  String.raw`байпас\p{L}*(?! клапан)`,
  String.raw`(?:дай|дайте|даваш|давам|свържи|свържете|сложи|сложете) (?:накъсо|на късо)`,
  String.raw`без (?:защити|защитите|предпазн\p{L}* верига(?:та)?|верига(?:та)? за безопасност)`,
  // DE/FR/ES — само най-очевидните; отговорите са на IT/EN/BG, но изходът на модела е недоверен
  String.raw`u(?:e)?berbr(?:u|ue)ck\p{L}*`,
  String.raw`pont(?:er|age|ez|ons)|shunter`,
  String.raw`puente(?:ar|o|a|an)\p{L}*`,
];

/** Глаголи за изключване/мостване — само с защитен обект до тях. */
export const BYPASS_VERBS: readonly string[] = [
  // IT
  String.raw`esclud\p{L}*|esclus(?:o|a|i|e|ione|ioni)|disabilit\p{L}*|disattiv\p{L}*|inibi\p{L}*|ignor\p{L}*`,
  String.raw`shunt\p{L}*|cavallott\p{L}*|ponticell\p{L}*|forz(?:are|ate|ando|ato|ata|ati|arla|arlo|arli)`,
  String.raw`stacc(?:are|ate|ando|a|ato|ata|ati|arlo|arla|arli)|scolleg(?:are|ate|ando|a|ato|ata|ati|arlo|arla|arli)`,
  // EN
  String.raw`disabl\p{L}*|defeat\p{L}*|overrid\p{L}*|inhibit\p{L}*|ignor(?:e|ing)|disconnect(?:ing)?`,
  String.raw`bridg(?:e|ed|ing)(?! rectifier)|jumpers?|jump(?:ing)?|shunt(?:ed|ing)?|shorting|short out|short-circuit|short circuit the`,
  String.raw`forc(?:e|ing) (?:the|open)`,
  // BG
  String.raw`изключ(?!вател)\p{L}*|деактивир\p{L}*|шунтир\p{L}*|игнорир\p{L}*|заобикал\p{L}*|заобиколи\p{L}*|форсир\p{L}*|разкач\p{L}*|откач\p{L}*`,
];

export const BYPASS_OBJECTS: readonly string[] = [
  ...SAFETY_DEVICES,
  // голите думи важат само до глагол за изключване
  String.raw`contatt\p{L}*|(?:le|la|una|ogni|tutte le|alcune) sicurezz\p{L}*|protezion\p{L}*|dispositiv\p{L}* di sicurezza`,
  String.raw`(?:the|a|any|all) safet(?:y|ies)|safety (?:device|function|switch|contact)s?|contacts?|protection`,
  // в този занаят голата „верига“ до глагол за мост е веригата за безопасност
  String.raw`(?:the )?chain|(?:la )?catena|верига(?:та)?`,
  String.raw`защит(?:ата|ите)|защитн\p{L}* (?:устройств\p{L}*|функци\p{L}*|контакт\p{L}*)|предпазн\p{L}* (?:устройств\p{L}*|контакт\p{L}*)`,
];

/**
 * Обект преди причастието: „contatti porta ponticellati“, „door lock bypassed“. Само жаргонът
 * за мост — „disattivato/disabled“ описва и състояния („perché la fotocellula è disattivata?“).
 */
export const BYPASS_PARTICIPLES: readonly string[] = [
  String.raw`(?:esclus|ponticellat|bypassat|shuntat|cavallottat|manomess)\p{L}*`,
  String.raw`bypassed|jumpered|jumped out|shunted|bridged`,
  String.raw`мостнат\p{L}*|шунтиран\p{L}*`,
];

/** „Задръж натиснат“ — само за контакти/ключалки, не за бутоните (ревизията е „задръж, за да вървиш“). */
export const HOLD_VERBS: readonly string[] = [
  String.raw`(?:ten(?:ere|ete|endo|go|ga|i)|mantener\p{L}*|mantien\p{L}*|blocc(?:are|ate|ando|a)|fiss(?:are|ate|a)) (?:premut\p{L}*|chius\p{L}*|schiacciat\p{L}*|bloccat\p{L}*)`,
  String.raw`hold(?:ing)?|tap(?:e|ing)(?: down| over)?|wedg(?:e|ing)`,
  String.raw`задръж\p{L}*|дръж(?:те)?|притисн\p{L}*`,
];

export const HOLD_OBJECTS: readonly string[] = [
  String.raw`contatt\p{L}*|serratur\p{L}*|finecors\p{L}*|extracors\p{L}*|microinterruttor\p{L}*|interruttor\p{L}*${DI}(?:fossa|stop|sicurezza|port[ae])`,
  String.raw`(?:door|gate|lock|limit|safety|pit|governor) (?:contact|switch)(?:es|s)?|contacts?|door locks?|interlocks?`,
  String.raw`контакт\p{L}*|ключалк\p{L}*|крайн\p{L}* изключвател\p{L}*|краен изключвател\p{L}*|микроизключвател\p{L}*`,
];

/** Молба да се движи с отворени врати. Докладът „parte con le porte aperte“ е повреда, не молба. */
export const RUN_DOORS_OPEN: readonly string[] = [
  near(
    [String.raw`fa(?:r|re|i|ccio|te)? (?:partire|muovere|viaggiare|funzionare|andare|marciare)`],
    [String.raw`con (?:le |la )?port[ae] apert\p{L}*`],
    3,
  ),
  near(
    [
      String.raw`(?:make|get|let|force)(?: it| the (?:lift|elevator|car))? (?:run|move|travel|go|start)`,
    ],
    [String.raw`with (?:the )?(?:doors?|gates?) open`],
    3,
  ),
  near(
    [String.raw`накара\p{L}*|да (?:тръгне|се движи|кара|пътува|върви)`],
    [String.raw`с отворен\p{L}* врат\p{L}*`],
    3,
  ),
];

/**
 * Глаголи и уреди за действие. Формите са ограничени нарочно: италианското 3 л. ед. ч.
 * („il quadro controlla…“), английското „checks/opens“ и българското „проверява“ описват
 * какво прави таблото — това е обяснение, не стъпка.
 */
export const ACTION_VERBS: readonly string[] = [
  // IT
  String.raw`misur(?:are|ate|ando|a|e|azione|azioni)|verific(?:are|ate|ando|a|he)|controll(?:are|ate|ando|o|i)|prov(?:are|ate|ando|a|e)|test(?:are|ate|ando)?`,
  String.raw`regol(?:are|ate|ando|a|azione|azioni)|tar(?:are|ate|ando|atura)|sostitu(?:ire|ite|isci|endo|zione)|smont(?:are|ate|ando|a|aggio)|rimont(?:are|ate|a|aggio)|install(?:are|ate|azione)`,
  String.raw`pul(?:ire|ite|isci|izia)|lubrific(?:are|ate|a|azione)|apr(?:ire|ite|i|endo)|chiud(?:ere|ete|i|endo)|sblocc(?:are|ate|a|o|ando)|riarm(?:are|ate|a|o)|ripristin(?:are|ate|a|o)|resett(?:are|ate|a)|reset`,
  String.raw`prem(?:ere|ete|i|endo)|azion(?:are|ate|a|ando)|mett(?:ere|ete|i|endo)|port(?:are|ate|ando)|commut(?:are|ate|a|azione)|inser(?:ire|ite|isci|endo)|attiv(?:are|ate|ando)|disattiv(?:are|ate|ando|a)|selezion(?:are|ate|a)`,
  String.raw`entr(?:are|ate|a)|scend(?:ere|ete|i)|sal(?:ire|ite|i)|acced(?:ere|ete|i)|lavor(?:are|ate|ando)|muov(?:ere|ete|i|endo)|spost(?:are|ate|a|ando)|tocc(?:are|ate|a)|colleg(?:are|ate|a|ando)|scolleg(?:are|ate|a|ando)|interven(?:ire|ite|endo)`,
  String.raw`modific(?:are|ate|a)|impost(?:are|ate|a)|cambi(?:are|ate|a)|ispezion(?:are|ate|a)`,
  String.raw`multimetro|tester|puntal\p{L}*|oscilloscopio|voltmetro|ohmmetro|pinza amperometrica`,
  // EN
  String.raw`measur(?:e|ing|ement)|check(?:ing)?|test(?:ing)?|verify(?:ing)?|inspect(?:ing)?|adjust(?:ing|ment)?|replac(?:e|ing|ement)|clean(?:ing)?|lubricat(?:e|ing)|remov(?:e|ing)|install(?:ing)?`,
  String.raw`open(?:ing)? (?:the|a|each|all|both)|clos(?:e|ing) (?:the|a|each|all|both)|press(?:ing)? (?:the|a)|releas(?:e|ing) (?:the|a)|reset(?:ting)? (?:the|a)|trip(?:ping)? (?:the|a)|unlock(?:ing)?`,
  String.raw`enter(?:ing)?|climb(?:ing)?|go(?:ing)? (?:into|down|onto|on)|work(?:ing)? (?:in|on|inside|under)|switch(?:ing)? (?:to|on|off|the)|turn(?:ing)? (?:the|on|off)|put(?:ting)? (?:the|it)|set(?:ting)? (?:the|to)|mov(?:e|ing) the car|connect(?:ing)?|disconnect(?:ing)?|touch(?:ing)?|prob(?:e|ing)`,
  String.raw`multimeter|tester|probes|voltmeter|clamp meter`,
  // BG
  String.raw`измер(?!ва(?:т)?(?![\p{L}]))\p{L}*|провер(?!ява(?:т)?(?![\p{L}]))\p{L}*|тест\p{L}*|регулир\p{L}*|настрой(?:те|ка|ката|ване)?|смен(?:и|ете|яне|ям)|подмен\p{L}*|почист\p{L}*|смаж\p{L}*|смазв\p{L}*|демонтир\p{L}*|монтир\p{L}*`,
  String.raw`отворете|затворете|отключ\p{L}*|натиснете|натисни|натискане|задръжте|задръж|освобод\p{L}*|нулир\p{L}*|ресетир\p{L}*|рестартир\p{L}*|взвед\p{L}*`,
  String.raw`влез\p{L}*|влиза\p{L}*|слез\p{L}*|слиза\p{L}*|качете|качи се|качва\p{L}*|работ(?:ете|и|ите|а) (?:в|във|на|върху)|премест\p{L}*|придвиж\p{L}*|движете|свърж\p{L}*|разкач\p{L}*|откач\p{L}*|пипа\p{L}*|докосн\p{L}*|превключ\p{L}*|поставете|сложете|включете`,
  String.raw`мултиметъ\p{L}*|мултиметър\p{L}*|тестер\p{L}*|волтметъ\p{L}*|волтметър\p{L}*`,
];

/** Само като указание („va verificato“), не като описание („viene verificata dal quadro“). */
export const ACTION_PARTICIPLES: readonly string[] = [
  String.raw`(?:va|vanno|da|deve essere|devono essere) (?:verificat|controllat|misurat|sostituit|regolat|tarat|smontat|pulit|testat|provat|riarmat|sbloccat)\p{L}*`,
  String.raw`(?:must|should|shall|needs? to|to) be (?:checked|measured|tested|replaced|adjusted|inspected|cleaned|reset|released)`,
  String.raw`(?:трябва да се|да се) (?:провер|измер|тест|смен|подмен|регулир|почист)\p{L}*`,
];

/** Самите операции — действие по природа, без нужда от глагол до тях. */
export const SAFETY_OPERATIONS: readonly string[] = [
  // IT
  String.raw`manovra${DI}(?:emergenza|soccorso)|manovra (?:a mano|manuale)|soccorso${DI}(?:persone|passegger\p{L}*)`,
  String.raw`(?:persone|passegger\p{L}*|utent\p{L}*) (?:intrappolat\p{L}*|bloccat\p{L}*|chius\p{L}*)|intrappolat\p{L}*`,
  String.raw`(?:recupero|evacuazione|liberazione)${DI}(?:persone|passegger\p{L}*)`,
  String.raw`(?:apertura|sblocco|rilascio)(?: manuale)?${DI}fren[oi]|leva${DI}(?:sblocco )?fren[oi]`,
  String.raw`chiave (?:di sblocco|triangolare|di emergenza)|sblocco(?: di emergenza)?${DI}port[ae]`,
  String.raw`discesa${DI}emergenza|discesa manuale|pompa a mano`,
  String.raw`lavor\p{L}* sotto tensione`,
  String.raw`(?:muov|spost|viaggi|marc)\p{L}* con (?:le |la )?port[ae] apert\p{L}*`,
  // EN
  String.raw`emergency (?:operation|rescue|electrical operation|release|lowering)|manual (?:rescue|operation|brake release|lowering)|rescue (?:operation|procedure)|passenger rescue`,
  String.raw`(?:people|passengers?|persons?) (?:trapped|stuck)|trapped (?:people|passengers?|persons?)|entrapment`,
  String.raw`brake release|hand ?wind\p{L}*|triangular key|emergency unlock\p{L}*|hand pump`,
  String.raw`live work|working live|work(?:ing)? on live`,
  // BG
  String.raw`аварийн\p{L}* (?:спасяване|отключване|ключ|спускане)|ръчн\p{L}* (?:спасяване|придвижване|задвижване|освобождаване|отваряне|спускане)|ръчна помпа`,
  String.raw`спасяване на (?:хора|пътници)|(?:заклещен|заседнал|блокирал)\p{L}* (?:хора|пътни\p{L}*|човек|лица)|освобождаване на спирачката|триъгълен ключ`,
  String.raw`работ\p{L}* под напрежение`,
];

export const CONFIG_VERBS: readonly string[] = [
  String.raw`modific\p{L}*|impost\p{L}*|cambi(?:are|ate|a|o)|vari(?:are|ate|a)|regol(?:are|ate|a)|programm\p{L}*|salv(?:are|ate|a)|scriv(?:ere|ete|i)|configur\p{L}*|abilit\p{L}*|aggiorn\p{L}*|caric(?:are|ate|a)`,
  String.raw`chang(?:e|ing)|set(?:ting)?|modif(?:y|ying)|adjust(?:ing)?|edit(?:ing)?|program(?:ming)?|configur\p{L}*|writ(?:e|ing)|sav(?:e|ing)|updat(?:e|ing)|upgrad(?:e|ing)|flash(?:ing)?|load(?:ing)?|enabl(?:e|ing)`,
  String.raw`смен\p{L}*|промен\p{L}*|настрой\p{L}*|задай\p{L}*|задаване|програмир\p{L}*|конфигурир\p{L}*|запиш\p{L}*|запис\p{L}*|обнов\p{L}*|ъпдейт\p{L}*|качи\p{L}*|актуализ\p{L}*`,
];

export const CONFIG_OBJECTS: readonly string[] = [
  String.raw`parametr\p{L}*|configurazion\p{L}*|impostazion\p{L}*|menu|password|eeprom|firmware|software`,
  String.raw`parameters?|settings?|configuration|menu|password|eeprom|firmware|software`,
  String.raw`параметъ\p{L}*|параметр\p{L}*|настройк\p{L}*|конфигурац\p{L}*|меню\p{L}*|парол\p{L}*|фърмуер\p{L}*|софтуер\p{L}*`,
];

export const CONFIG_ALONE: readonly string[] = [
  String.raw`riprogramm\p{L}*|ponticell[oi]|reset${DI}fabbrica|impostazioni${DI}fabbrica|autoapprendimento|apprendimento${DI}vano|corsa di apprendimento|autotaratura|auto-?tuning`,
  String.raw`reset${DI}(?:error\p{L}*|allarm\p{L}*|blocc\p{L}*|guast\p{L}*)|resett\p{L}* (?:gli |l'|il |i )?(?:error\p{L}*|allarm\p{L}*|blocc\p{L}*|guast\p{L}*)`,
  String.raw`reprogram\p{L}*|jumpers?|factory (?:reset|settings|defaults)|teach-?in|learn(?:ing)? (?:run|trip|travel)|shaft learning|auto-?tun\p{L}*|reset (?:the )?(?:fault|error|alarm|lockout)s?|clear (?:the )?(?:fault|error)s?`,
  String.raw`препрограмир\p{L}*|фабрични(?:те)? настройки|самообучение|обучение на шахтата|учебен ход|автонастройка|нулир\p{L}* (?:на )?(?:грешк\p{L}*|авари\p{L}*|блокировк\p{L}*)`,
];

export const DIAGNOSTIC_TERMS: readonly string[] = [
  String.raw`misur\p{L}*|verific\p{L}*|controll(?:are|ate|ando|o|i)|prov(?:are|ate|a)|test(?:are|ate|ando|ato)?|tester|multimetro|oscilloscopio|voltmetro|pinza amperometrica|osserv(?:are|ate|a)`,
  String.raw`legg(?:ere|ete|i)${SEP}(?:(?:il|i|l|lo|gli)${SEP})?(?:codic\p{L}*|error\p{L}*|display|storic\p{L}*|log|registr\p{L}*|allarm\p{L}*)|storico (?:errori|guasti|allarmi|eventi)`,
  String.raw`measur\p{L}*|verif\p{L}*|check\p{L}*|inspect\p{L}*|test(?:s|ing|ed)?|multimeter|oscilloscope|voltmeter|clamp meter|diagnos\p{L}*`,
  String.raw`read (?:the |out the )?(?:fault|error|event|code|log|display)\p{L}*|(?:fault|error|event) log`,
  String.raw`измер\p{L}*|провер\p{L}*|тест\p{L}*|мултиметъ\p{L}*|мултиметър\p{L}*|осцилоскоп\p{L}*|волтметъ\p{L}*|волтметър\p{L}*|диагност\p{L}*`,
  String.raw`прочет\p{L}* (?:кода|грешката|грешките|дисплея|дневника|историята)|дневник\p{L}* (?:на|с) грешк\p{L}*`,
];

/** Пряко управление на хардуера — извън MVP (§2.2, §11.1). „Monitoraggio da remoto“ не е команда. */
export const DIRECT_COMMAND_TERMS: readonly string[] = [
  String.raw`invi\p{L}* (?:il |un |lo |i )?comand\p{L}*|comand\p{L}* (?:da |in )remoto|comanda(?:re)? da remoto`,
  String.raw`(?:muov|spost|chiam|apr|resett|riavvi|sblocc)\p{L}*(?:${SEP}${TOK}){0,3}${SEP}da remoto|da remoto (?:muov|spost|chiam|apr|resett|riavvi|sblocc)\p{L}*`,
  String.raw`send(?:ing)? (?:a |the )?(?:remote )?commands?|remote (?:command|reset|restart|call|move|unlock)\p{L}*|remotely (?:reset|restart|move|call|open|unlock|command|send)\p{L}*`,
  String.raw`(?:reset|restart|move|call|open|unlock)\p{L}*(?:${SEP}${TOK}){0,3}${SEP}remotely`,
  String.raw`изпрат\p{L}* (?:команда|команди|командата)|изпращане на команд\p{L}*|дистанционн\p{L}* (?:команд\p{L}*|рестарт\p{L}*|нулиране|преместване|повикване|отключване)|дистанционно (?:рестартир|нулир|премест|отключ|отвор|изпрат|повик)\p{L}*`,
];
