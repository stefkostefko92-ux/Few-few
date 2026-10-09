# Шрифтове

**EB Garamond** — © 2017 The EB Garamond Project Authors
(https://github.com/octaviopardo/EBGaramond12), лиценз **SIL Open Font License 1.1**
(пълният текст е в `OFL.txt`; шрифтът може свободно да се влага в документи и да се печата).

Файловете `EBG-*.ttf` са статични инстанции (Regular 400, Medium 500, Bold 700,
Italic 400, Bold Italic 700), получени с `fontTools.varLib.instancer` от променливите
`EBGaramond[wght].ttf` и `EBGaramond-Italic[wght].ttf` на Google Fonts — ReportLab не
работи с променливи шрифтове.

Вътрешните PostScript имена са уникални (`EBGaramond-Regular`, `-Medium`, `-Bold`,
`-Italic`, `-BoldItalic`) — ReportLab кешира лицата по име и иначе слива теглата.
