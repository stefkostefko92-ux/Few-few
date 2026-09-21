/**
 * Опашката и работникът срещу жив Redis — тестът, който липсваше.
 *
 * `piuma:publish` и `post:<id>` минаваха typecheck и всички unit тестове, защото никой не
 * инстанцираше BullMQ; работникът умираше при първия реален старт, а панелът гърмеше при
 * първото насрочване. Тук се прави точно каквото правят процесите: опашка → задачи с истинските
 * id-та → работник, който ги вижда → чистене.
 *
 * Иска жив Redis през `REDIS_URL` (в същата среда като PostgreSQL); без `DATABASE_URL` се пропуска
 * като останалите интеграционни тестове.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

const hasDatabase = Boolean(process.env.DATABASE_URL);

process.env.NODE_ENV ??= 'test';
process.env.PUBLIC_BASE_URL ??= 'https://piuma.example.com';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6379/15';
process.env.IG_APP_ID ??= '123456';
process.env.IG_APP_SECRET ??= 'app-secret';
process.env.IG_REDIRECT_URI ??= 'https://piuma.example.com/auth/instagram/callback';
process.env.TOKEN_ENC_KEY ??= 'a'.repeat(64);
process.env.DATABASE_URL ??= 'postgresql://postgres@127.0.0.1:5432/piuma_test';
process.env.LOG_LEVEL ??= 'silent';

const { Queue, Worker } = await import('bullmq');
const {
  PUBLISH_QUEUE,
  createRedis,
  enqueueAutopilot,
  enqueuePublish,
  publishJobId,
  publishQueue,
  removeScheduledJob,
  scheduleManagement,
  scheduleTokenRefresh,
} = await import('../../src/queue/publish-queue.js');

test(
  'опашка, задачи с истинските id-та и работник срещу жив Redis',
  { skip: !hasDatabase },
  async () => {
    // BullMQ НЕ затваря ioredis връзка, подадена отвън — само тези, които сам е отворил.
    // А при лошо име хвърля от конструктора СЛЕД като вече е отворил своята — без дръжка
    // за затваряне. Затова: (1) всяка връзка, която тестът може да държи, я държи той;
    // (2) името се проверява първо върху такава връзка; (3) почистването е във `finally`.
    // Иначе падаща проверка не докладва провал, а държи процеса жив и пакетът „виси“.
    const probeConnection = createRedis();
    const workerConnection = createRedis();
    let probe: InstanceType<typeof Queue> | undefined;
    let queue: ReturnType<typeof publishQueue> | undefined;
    let worker: InstanceType<typeof Worker> | undefined;
    try {
      probe = new Queue(PUBLISH_QUEUE, { connection: probeConnection });
      queue = publishQueue();
      const started = new Worker(PUBLISH_QUEUE, async (): Promise<unknown> => undefined, {
        connection: workerConnection,
        autorun: false,
      });
      worker = started;
      await queue.obliterate({ force: true });

      // Насрочване както от панела: отложена задача с идемпотентен id по поста.
      const postId = 'cmuar9hzo00007d2c5mdp30x3';
      await enqueuePublish(postId, new Date(Date.now() + 60_000));
      const job = await queue.getJob(publishJobId(postId));
      assert.ok(job, 'задачата трябва да се намира по същия id, с който е добавена');
      assert.equal(await job.getState(), 'delayed');

      // Второ насрочване на същия пост не прави втора задача (jobId = постът).
      await enqueuePublish(postId, new Date(Date.now() + 60_000));
      assert.equal((await queue.getDelayed()).length, 1);

      // Отказ от насрочване маха задачата.
      await removeScheduledJob(postId);
      assert.equal(await queue.getJob(publishJobId(postId)), undefined);

      // „Пусни цикъл сега“ и трите повтарящи се задачи на работника. Ключът на scheduler-а
      // е хеш, не подаденият jobId — затова се проверяват името и cron шаблонът.
      await enqueueAutopilot('cmuarb3cj00047d0qm1oj94gy');
      await scheduleTokenRefresh();
      await scheduleManagement();
      const schedulers = await queue.getJobSchedulers();
      assert.deepEqual(schedulers.map((s) => `${s.name} @ ${s.pattern}`).sort(), [
        'autopilot @ 0 6 * * 1',
        'refresh-tokens @ 0 3 * * *',
        'sync-insights @ 30 4 * * *',
      ]);

      // Работникът се вдига върху същото име — точно това падаше с „Queue name cannot contain :“.
      await started.waitUntilReady();
    } finally {
      await worker?.close();
      if (queue) {
        await queue.obliterate({ force: true }).catch(() => undefined);
        const queueConnection = await queue.client;
        await queue.close();
        await queueConnection.quit();
      }
      await probe?.close();
      await Promise.all([probeConnection.quit(), workerConnection.quit()]);
    }
  },
);
