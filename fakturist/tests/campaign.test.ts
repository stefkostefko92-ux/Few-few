import assert from 'node:assert/strict';
import { test } from 'node:test';
import { campaignQuery, readCampaign, withQuery } from '../src/marketing/campaign.js';

/**
 * SPEC 93: етикетът на кампанията — само от адреса (`utm_*`) или хостът на външния сайт, от който идва
 * посетителят; нищо в браузъра. Стойностите са къси и само от безопасни знаци — иначе полето отпада.
 */
const HOST = 'fakturist.carbonstealth.eu';

test('utm_* от адреса — проверени, подрязани до празно → без поле', () => {
  assert.deepEqual(
    readCampaign(
      {
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'bezplatna-programa',
        utm_content: 'Реклама 2',
        utm_term: 'програма за фактури',
        other: 'x',
      },
      undefined,
      HOST,
    ),
    {
      source: 'google',
      medium: 'cpc',
      campaign: 'bezplatna-programa',
      content: 'Реклама 2',
      term: 'програма за фактури',
    },
  );
  // Опасни знаци, масиви, над 100 знака — отпадат; без source нищо не се записва.
  assert.deepEqual(
    readCampaign(
      {
        utm_source: 'fb',
        utm_medium: ['a', 'b'],
        utm_campaign: '<script>',
        utm_content: 'x'.repeat(101),
        utm_term: '  ',
      },
      undefined,
      HOST,
    ),
    { source: 'fb' },
  );
  assert.equal(readCampaign({ utm_medium: 'cpc' }, undefined, HOST), null);
});

test('без utm_source — хостът на външния сайт като „referral“; своят сайт и лош адрес — нищо', () => {
  assert.deepEqual(readCampaign({}, 'https://www.google.com/search?q=фактури', HOST), {
    source: 'www.google.com',
    medium: 'referral',
  });
  assert.equal(readCampaign({}, `https://${HOST}/ceni`, HOST), null);
  assert.equal(readCampaign({}, 'не-е-адрес', HOST), null);
  assert.equal(readCampaign({}, 'javascript:alert(1)', HOST), null);
  // utm печели пред Referer.
  assert.deepEqual(readCampaign({ utm_source: 'linkedin' }, 'https://www.google.com/', HOST), {
    source: 'linkedin',
  });
});

test('адресите носят езика и кампанията (кодирани)', () => {
  const campaign = { source: 'google', medium: 'cpc', campaign: 'старт 1' };
  assert.equal(
    campaignQuery(campaign),
    'utm_source=google&utm_medium=cpc&utm_campaign=%D1%81%D1%82%D0%B0%D1%80%D1%82+1',
  );
  assert.equal(withQuery('/registraciya', 'bg', null), '/registraciya');
  assert.equal(withQuery('/registraciya', 'en', null), '/registraciya?lang=en');
  assert.equal(
    withQuery('/registraciya', 'en', { source: 'google' }),
    '/registraciya?lang=en&utm_source=google',
  );
  assert.equal(withQuery('/ceni', 'bg', { source: 'fb' }), '/ceni?utm_source=fb');
});
