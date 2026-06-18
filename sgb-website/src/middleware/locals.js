import { config } from '../config.js';
import { getAllSettings } from '../db.js';
import { Categories } from '../queries.js';
import * as helpers from '../lib/helpers.js';
import { abs } from '../lib/seo.js';

// Прави общи данни достъпни във всички изгледи
export function siteLocals(req, res, next) {
  const settings = getAllSettings();
  res.locals.site = {
    url: config.siteUrl,
    name: settings.org_name || 'Съюз на глухите в България',
    short: settings.org_short || 'СГБ',
    description: settings.site_description || 'Официален уебсайт на Съюза на глухите в България.',
    email: settings.contact_email || '',
    phone: settings.contact_phone || '',
    address: settings.contact_address || '',
    city: settings.contact_city || 'София',
    facebook: settings.social_facebook || '',
    youtube: settings.social_youtube || '',
    instagram: settings.social_instagram || '',
    newspaperName: settings.newspaper_name || 'Тишина',
  };
  res.locals.settings = settings;
  res.locals.menuTree = Categories.tree();
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();

  // Помощни функции за шаблоните
  res.locals.h = helpers;
  res.locals.formatDate = helpers.formatDate;
  res.locals.abs = abs;

  // Структура за SEO по подразбиране, която всяка страница може да допълни/презапише
  res.locals.seo = {
    title: res.locals.site.name,
    description: res.locals.site.description,
    canonical: abs(req.path),
    image: abs('/img/og-default.png'),
    type: 'website',
    robots: 'index, follow',
    jsonLd: [],
    publishedTime: null,
    modifiedTime: null,
  };
  res.locals.currentUser = res.locals.currentUser || null;
  next();
}
