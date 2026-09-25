# Проба (измислен вход — не е реална страница)

Начална страница на граждански портал (HTML при първо зареждане, преди каквото и да е кликване):

```html
<head>
  <script async src="https://www.googletagmanager.com/gtag/js?id=G-TEST123"></script>
  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-TEST123');</script>
  <link href="https://fonts.googleapis.com/css2?family=Roboto&display=swap" rel="stylesheet">
</head>
<body>
  <div id="cookie-banner">Този сайт използва бисквитки, за да подобри услугите си. <button>Приеми</button></div>
  <footer><a href="/poveritelnost">Поверителност</a></footer>
</body>
```

Цялата страница `/poveritelnost`:
> „Ние събираме вашите данни, за да подобрим услугите си. Данните се пазят сигурно. За въпроси: info@example.bg“
