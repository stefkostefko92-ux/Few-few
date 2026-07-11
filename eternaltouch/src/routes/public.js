// Eternal Touch — Public routes
import express from 'express';

const router = express.Router();

// Serialize an object for embedding inside a <script type="application/ld+json">
// block. Escapes '<' (and U+2028/U+2029) so admin-entered content containing
// "</script>" cannot break out of the script element (stored-XSS defence).
function ldSafe(str) {
  return str
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

// Helper: get all site content as a key-map for the current language
async function getSiteContent(prisma, lang) {
  try {
    const items = await prisma.siteContent.findMany();
    const map = {};
    const suffix = lang.charAt(0).toUpperCase() + lang.slice(1);
    for (const item of items) {
      // Bulgaria-first fallback: requested → BG → IT → EN
      map[item.key] = item[`value${suffix}`] || item.valueBg || item.valueIt || item.valueEn || '';
    }
    return map;
  } catch (err) {
    console.error('[getSiteContent] DB error:', err.message);
    return {};
  }
}

// Home
router.get('/', async (req, res, next) => {
  try {
    const [collections, featured, gallery, content] = await Promise.all([
      req.prisma.collection.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' }
      }).catch(e => { console.error('[home] collections:', e.message); return []; }),
      req.prisma.product.findMany({
        where: { isActive: true, isFeatured: true },
        orderBy: { order: 'asc' },
        take: 6,
        include: { collection: true }
      }).catch(e => { console.error('[home] featured:', e.message); return []; }),
      req.prisma.galleryItem.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
        take: 9
      }).catch(e => { console.error('[home] gallery:', e.message); return []; }),
      getSiteContent(req.prisma, req.lang)
    ]);

    console.log(`[home] rendered for lang=${req.lang} · collections=${collections.length} featured=${featured.length} gallery=${gallery.length} content=${Object.keys(content).length}`);

    // Build extra Schema.org graph for home: FAQPage + ItemList + AboutPage + HowTo
    const SITE = process.env.SITE_URL || 'https://eternaltouch.it';
    const faqEntities = [];
    for (let i = 1; i <= 6; i++) {
      const q = content[`faq.q${i}.q`];
      const a = content[`faq.q${i}.a`];
      if (q && a) {
        faqEntities.push({
          "@type": "Question",
          "name": q,
          "acceptedAnswer": { "@type": "Answer", "text": a }
        });
      }
    }
    const collectionItems = collections.map((col, idx) => ({
      "@type": "ListItem",
      "position": idx + 1,
      "url": `${SITE}/collections/${col.slug}`,
      "name": req.localized(col, 'name')
    }));
    const processSteps = [];
    for (let i = 1; i <= 4; i++) {
      const t = content[`process.step${i}.title`];
      const txt = content[`process.step${i}.body`];
      if (t && txt) {
        processSteps.push({
          "@type": "HowToStep",
          "position": i,
          "name": t,
          "text": txt
        });
      }
    }

    const extraGraph = [];
    if (faqEntities.length) {
      extraGraph.push({
        "@type": "FAQPage",
        "@id": `${SITE}/#faq`,
        "mainEntity": faqEntities
      });
    }
    if (collectionItems.length) {
      extraGraph.push({
        "@type": "ItemList",
        "@id": `${SITE}/#collections`,
        "name": req.t('collections.title') || "Collezioni",
        "itemListElement": collectionItems
      });
    }
    extraGraph.push({
      "@type": "AboutPage",
      "@id": `${SITE}/#about`,
      "name": req.t('nav.about') || 'Atelier',
      "description": content['about.body'] ? content['about.body'].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 600) : ''
    });
    if (processSteps.length) {
      extraGraph.push({
        "@type": "HowTo",
        "@id": `${SITE}/#process`,
        "name": content['process.title'] || 'Process',
        "description": "Our four-step process for hand-cast gypsum decorations.",
        "step": processSteps
      });
    }

    res.render('pages/home', {
      title: `Eternal Touch — ${req.t('meta.tagline')}`,
      description: req.t('meta.description'),
      collections: collections || [],
      featured: featured || [],
      gallery: gallery || [],
      content: content || {},
      activePage: 'home',
      extraSchemaGraph: ldSafe(JSON.stringify(extraGraph).slice(1, -1)) // strip outer brackets — embedded in @graph
    });
  } catch (err) {
    console.error('[home] FATAL:', err);
    next(err);
  }
});

// Collections index — redirect to home anchor (single-page-ish)
router.get('/collections', (req, res) => {
  res.redirect('/#collections');
});

// Collection detail page
router.get('/collections/:slug', async (req, res, next) => {
  try {
    const collection = await req.prisma.collection.findUnique({
      where: { slug: req.params.slug },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { order: 'asc' }
        }
      }
    });

    if (!collection || !collection.isActive) {
      return res.status(404).render('pages/404', {
        title: req.t('404.title') || '404',
        description: req.t('404.body') || '',
        activePage: '404'
      });
    }

    const content = await getSiteContent(req.prisma, req.lang);

    // Parse images JSON for each product so the view can use them directly
    const products = (collection.products || []).map(p => {
      let imageUrls = [];
      try { imageUrls = JSON.parse(p.images || '[]'); } catch (e) {}
      const images = imageUrls.map(url => ({
        url,
        thumb: url.replace('/uploads/products/', '/uploads/products/thumb-')
      }));
      return { ...p, images };
    });

    // CollectionPage Schema.org
    const SITE = process.env.SITE_URL || 'https://eternaltouch.it';
    const collectionSchema = [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
          { "@type": "ListItem", "position": 2, "name": req.localized(collection, 'name') }
        ]
      },
      {
        "@type": "CollectionPage",
        "@id": `${SITE}/collections/${collection.slug}#collection`,
        "name": req.localized(collection, 'name'),
        "description": req.localized(collection, 'description'),
        "image": SITE + (collection.coverImage || '/images/logo-full.jpg'),
        "inLanguage": req.lang,
        "isPartOf": { "@id": `${SITE}/#website` },
        "mainEntity": {
          "@type": "ItemList",
          "itemListElement": products.map((p, idx) => ({
            "@type": "ListItem",
            "position": idx + 1,
            "url": `${SITE}/collections/${collection.slug}/${p.slug}`,
            "name": req.localized(p, 'name')
          }))
        }
      }
    ];

    res.render('pages/collection', {
      title: `${req.localized(collection, 'name')} — Eternal Touch`,
      description: (req.localized(collection, 'description') || '').substring(0, 160),
      collection,
      products,
      content,
      ogImage: collection.coverImage,
      extraSchemaGraph: ldSafe(JSON.stringify(collectionSchema).slice(1, -1)),
      activePage: 'collections'
    });
  } catch (err) {
    console.error('[collection]', err);
    next(err);
  }
});

// Product detail page
router.get('/collections/:collectionSlug/:productSlug', async (req, res, next) => {
  try {
    const product = await req.prisma.product.findUnique({
      where: { slug: req.params.productSlug },
      include: { collection: true }
    });

    if (!product || !product.isActive || !product.collection || product.collection.slug !== req.params.collectionSlug) {
      return res.status(404).render('pages/404', {
        title: req.t('404.title') || '404',
        description: req.t('404.body') || '',
        activePage: '404'
      });
    }

    // Parse images — convert raw URL strings to {url, thumb} objects
    let imageUrls = [];
    try {
      imageUrls = JSON.parse(product.images || '[]');
    } catch (e) {
      imageUrls = [];
    }
    const images = imageUrls.map(url => ({
      url,
      thumb: url.replace('/uploads/products/', '/uploads/products/thumb-')
    }));

    // Find related products from same collection
    const relatedRaw = await req.prisma.product.findMany({
      where: {
        collectionId: product.collectionId,
        isActive: true,
        NOT: { id: product.id }
      },
      orderBy: { order: 'asc' },
      take: 3
    });
    const related = relatedRaw.map(p => {
      let pImgs = [];
      try { pImgs = JSON.parse(p.images || '[]'); } catch (e) {}
      return {
        ...p,
        images: pImgs.map(url => ({
          url,
          thumb: url.replace('/uploads/products/', '/uploads/products/thumb-')
        }))
      };
    });

    // Product Schema.org (BreadcrumbList + Product)
    const SITE = process.env.SITE_URL || 'https://eternaltouch.it';
    const productSchema = [
      {
        "@type": "BreadcrumbList",
        "itemListElement": [
          { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE },
          { "@type": "ListItem", "position": 2, "name": req.localized(product.collection, 'name'), "item": `${SITE}/collections/${product.collection.slug}` },
          { "@type": "ListItem", "position": 3, "name": req.localized(product, 'name') }
        ]
      },
      {
        "@type": "Product",
        "@id": `${SITE}/collections/${product.collection.slug}/${product.slug}#product`,
        "name": req.localized(product, 'name'),
        "description": req.localized(product, 'description'),
        "image": images.map(img => SITE + img.url),
        "category": req.localized(product.collection, 'name'),
        "material": product.materials || 'Ceramic gypsum',
        "brand": { "@type": "Brand", "name": "Eternal Touch" },
        "manufacturer": { "@id": `${SITE}/#organization` },
        "countryOfOrigin": { "@type": "Country", "name": "Bulgaria" },
        // Made-to-order, quote-based pricing: we advertise the offer as a
        // demand-driven quote (no fixed price). A numeric `price` is omitted on
        // purpose — an Offer with priceCurrency but no price is invalid and
        // would suppress the whole Product rich result. `priceSpecification`
        // with an unspecified value signals "contact for price".
        "offers": {
          "@type": "Offer",
          "url": `${SITE}/collections/${product.collection.slug}/${product.slug}`,
          "availability": "https://schema.org/MadeToOrder",
          "businessFunction": "https://schema.org/Sell",
          "priceSpecification": {
            "@type": "PriceSpecification",
            "priceCurrency": "EUR",
            "valueAddedTaxIncluded": true
          },
          "seller": { "@id": `${SITE}/#localbusiness` }
        }
      }
    ];

    res.render('pages/product', {
      title: `${req.localized(product, 'name')} — ${req.localized(product.collection, 'name')}`,
      description: (req.localized(product, 'description') || '').substring(0, 160),
      product,
      ogImage: product.mainImage,
      ogType: 'product',
      extraSchemaGraph: ldSafe(JSON.stringify(productSchema).slice(1, -1)),
      collection: product.collection,
      images,
      related,
      activePage: 'collections'
    });
  } catch (err) {
    console.error('[product]', err);
    next(err);
  }
});

// === Health endpoint ===
// Public liveness/readiness probe. Deliberately minimal: exposes only a boolean
// and a timestamp — never Node version, env, memory or DB row counts (those are
// reconnaissance value for an attacker). Status code drives the Docker/nginx
// healthcheck: 200 when the DB responds, 503 otherwise.
router.get('/healthz', async (req, res) => {
  let ok = true;
  try {
    await req.prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    ok = false;
    console.warn(`[healthz] DB check failed: ${err.message}`);
  }
  res.status(ok ? 200 : 503).json({ ok, timestamp: new Date().toISOString() });
});

// Set language preference (cookie override)
router.get('/lang/:code', (req, res) => {
  const code = req.params.code;
  if (['it', 'bg', 'en'].includes(code)) {
    res.cookie('lang', code, {
      maxAge: 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,          // read server-side only; not needed in JS
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production'
    });
  }
  // Open-redirect guard: only ever redirect to a same-site, relative path.
  // A caller-controlled Referer must not be able to bounce visitors off-site.
  const referer = req.headers.referer || '';
  let back = '/';
  try {
    if (referer) {
      const u = new URL(referer);
      const site = new URL(process.env.SITE_URL || 'https://eternaltouch.it');
      if (u.host === site.host) back = u.pathname + u.search + u.hash;
    }
  } catch { /* malformed Referer → stay on '/' */ }
  if (!back.startsWith('/') || back.startsWith('//')) back = '/';
  res.redirect(back);
});

// === Legal pages ===
router.get('/privacy', (req, res) => {
  res.render('pages/privacy', {
    title: `${req.t('legal.privacy.title')} — Eternal Touch`,
    description: req.t('legal.privacy.title'),
    activePage: 'legal'
  });
});

router.get('/cookies', (req, res) => {
  res.render('pages/cookies', {
    title: `${req.t('legal.cookies.title')} — Eternal Touch`,
    description: req.t('legal.cookies.title'),
    activePage: 'legal'
  });
});

router.get('/terms', (req, res) => {
  res.render('pages/terms', {
    title: `${req.t('legal.terms.title')} — Eternal Touch`,
    description: req.t('legal.terms.title'),
    activePage: 'legal'
  });
});

router.get('/legal', (req, res) => {
  res.render('pages/legal', {
    title: `${req.t('legal.imprint.title')} — Eternal Touch`,
    description: req.t('legal.imprint.title'),
    activePage: 'legal'
  });
});

export default router;
