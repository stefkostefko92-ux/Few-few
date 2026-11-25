import { errorMessage, logger } from '../logger.js';
import { catalogShape, serverCatalogSource, shopCatalogText } from '../services/engine.js';

/**
 * Проверка с новия образ преди смяната на контейнерите (deploy.sh, `check_catalog`): с CATALOG_KEY от
 * .env шифрованият каталог се отваря и е с вярната форма. Изход 1 — новият код не би тръгнал.
 */
try {
  const shop = shopCatalogText(serverCatalogSource());
  if (shop) {
    const parsed = catalogShape.safeParse(JSON.parse(shop.text) as unknown);
    if (!parsed.success) throw new Error('каталогът е с неочаквана форма');
    logger.info(
      {
        source: shop.source,
        decors: parsed.data.decors.length,
        handles: parsed.data.handles.length,
      },
      'каталогът от магазините се отваря',
    );
  } else {
    logger.info('без каталог от магазините — основният каталог');
  }
} catch (error: unknown) {
  logger.error({ err: errorMessage(error) }, 'каталогът от магазините не се отваря');
  process.exitCode = 1;
}
