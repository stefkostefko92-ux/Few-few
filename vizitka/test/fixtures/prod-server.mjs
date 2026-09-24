// Вдига приложението с NODE_ENV=production на случаен порт и изписва порта.
// Нужно е, защото prod-only middleware (принудителният редирект към https) се
// решава при import, значи не може да се тества от пакета, който върви с
// NODE_ENV=test. Родителят подава DATA_DIR/тайните и чете „PORT=<n>" от stdout.
process.env.NODE_ENV = 'production';

const { default: app } = await import('../../src/app.js');

const server = app.listen(0, '127.0.0.1', () => {
  process.stdout.write(`PORT=${server.address().port}\n`);
});
