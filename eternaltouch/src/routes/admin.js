// Eternal Touch — Admin routes
import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import path from 'path';
import fs from 'fs/promises';
import slugify from 'slugify';
import { fileURLToPath } from 'url';
import { requireAdmin, generateToken } from '../middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// ---------- Multer for image upload ----------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo immagini JPEG, PNG, WEBP, GIF'));
  }
});

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Safely delete a public asset by its stored relative path (e.g. "/uploads/..").
// Guards against path traversal: the resolved target MUST live inside
// public/uploads/. Without this, a crafted `image` value like
// "../../server.js" (or any "../") would let an authenticated admin unlink
// arbitrary files on the host. Returns silently on anything outside uploads.
async function safeUnlinkPublic(relImage) {
  if (!relImage || typeof relImage !== 'string') return;
  const resolved = path.resolve(PUBLIC_DIR, '.' + (relImage.startsWith('/') ? relImage : '/' + relImage));
  if (resolved !== UPLOADS_DIR && !resolved.startsWith(UPLOADS_DIR + path.sep)) {
    console.warn(`[admin] refused to unlink outside uploads/: ${relImage}`);
    return;
  }
  await fs.unlink(resolved).catch(() => {});
}

// =====================================================================
// Helper: check if an image path is referenced by any other record.
// Prevents the bug where deleting a product image (or any image) would
// physically remove a file that's still in use elsewhere — collection
// covers, gallery items, other products, etc.
//
// Returns true if the image is still in use, false if safe to unlink.
// =====================================================================
async function isImageStillReferenced(prisma, image, excludeProductId = null) {
  // 1. Any other product that has this image in its images array, or as mainImage?
  // images is stored as JSON string of an array — search via "contains" on the JSON text.
  const productMatches = await prisma.product.findMany({
    where: {
      OR: [
        { mainImage: image },
        { images: { contains: image } } // works for both Postgres and SQLite as substring search
      ]
    },
    select: { id: true }
  });
  const otherProductHits = productMatches.filter(p => p.id !== excludeProductId);
  if (otherProductHits.length > 0) return true;

  // 2. Any collection using it as coverImage?
  const collectionHits = await prisma.collection.count({ where: { coverImage: image } });
  if (collectionHits > 0) return true;

  // 3. Any gallery item using it?
  const galleryHits = await prisma.galleryItem.count({ where: { image } });
  if (galleryHits > 0) return true;

  return false;
}

async function processImage(buffer, subdir, baseName) {
  const slug = slugify(baseName, { lower: true, strict: true }) || 'image';
  const ts = Date.now();
  const filename = `${slug}-${ts}.webp`;
  const targetDir = path.join(UPLOADS_DIR, subdir);
  await fs.mkdir(targetDir, { recursive: true });
  const fullPath = path.join(targetDir, filename);

  await sharp(buffer)
    .rotate()
    .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 })
    .toFile(fullPath);

  // Also create thumbnail
  const thumbName = `thumb-${filename}`;
  await sharp(buffer)
    .rotate()
    .resize(600, 600, { fit: 'cover' })
    .webp({ quality: 80 })
    .toFile(path.join(targetDir, thumbName));

  return `/uploads/${subdir}/${filename}`;
}

// =====================================================
// PUBLIC: login pages
// =====================================================

router.get('/login', (req, res) => {
  if (req.cookies?.adminToken) return res.redirect('/admin');
  res.render('admin/login', {
    layout: false,
    error: null,
    title: 'Admin · Eternal Touch'
  });
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await req.prisma.adminUser.findUnique({
      where: { email: (email || '').trim().toLowerCase() }
    });
    if (!user || !await bcrypt.compare(password || '', user.password)) {
      return res.render('admin/login', {
        layout: false,
        error: 'Credenziali non valide',
        title: 'Admin · Eternal Touch'
      });
    }
    await req.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    const token = generateToken(user);
    res.cookie('adminToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',   // admin cookie never rides a cross-site request → CSRF-hardened
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    res.redirect('/admin');
  } catch (err) {
    console.error(err);
    res.render('admin/login', {
      layout: false,
      error: 'Errore di sistema',
      title: 'Admin'
    });
  }
});

router.get('/logout', (req, res) => {
  res.clearCookie('adminToken');
  res.redirect('/admin/login');
});

// =====================================================
// All routes below require admin
// =====================================================
router.use(requireAdmin);

// Common locals for all admin pages
router.use(async (req, res, next) => {
  res.locals.adminUser = req.adminUser;
  res.locals.activeAdmin = req.path.split('/')[1] || 'dashboard';
  next();
});

// Dashboard
router.get('/', async (req, res, next) => {
  try {
    const [collectionsCount, productsCount, galleryCount, messagesCount, unreadCount] = await Promise.all([
      req.prisma.collection.count(),
      req.prisma.product.count(),
      req.prisma.galleryItem.count(),
      req.prisma.contactMessage.count(),
      req.prisma.contactMessage.count({ where: { isRead: false } })
    ]);

    const recentMessages = await req.prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    res.render('admin/dashboard', {
      layout: 'admin/layout',
      title: 'Dashboard · Eternal Touch Admin',
      stats: { collectionsCount, productsCount, galleryCount, messagesCount, unreadCount },
      recentMessages
    });
  } catch (err) { next(err); }
});

// =====================================================
// COLLECTIONS
// =====================================================
router.get('/collections', async (req, res, next) => {
  try {
    const collections = await req.prisma.collection.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { products: true } } }
    });
    res.render('admin/collections', {
      layout: 'admin/layout',
      title: 'Collezioni · Admin',
      collections
    });
  } catch (err) { next(err); }
});

router.get('/collections/:id/edit', async (req, res, next) => {
  try {
    const collection = await req.prisma.collection.findUnique({
      where: { id: req.params.id },
      include: { products: { orderBy: { order: 'asc' } } }
    });
    if (!collection) return res.redirect('/admin/collections');
    res.render('admin/collection-edit', {
      layout: 'admin/layout',
      title: `Редакция · ${collection.nameBg || collection.nameIt}`,
      collection,
      query: req.query
    });
  } catch (err) { next(err); }
});

router.post('/collections/:id', upload.single('coverImage'), async (req, res, next) => {
  try {
    const { nameIt, nameBg, nameEn, taglineIt, taglineBg, taglineEn,
            descriptionIt, descriptionBg, descriptionEn, isActive, order } = req.body;
    const data = {
      nameIt, nameBg, nameEn,
      taglineIt: taglineIt || null,
      taglineBg: taglineBg || null,
      taglineEn: taglineEn || null,
      descriptionIt, descriptionBg, descriptionEn,
      isActive: isActive === 'on' || isActive === 'true',
      order: parseInt(order) || 0
    };
    let oldCover = null;
    if (req.file) {
      const existing = await req.prisma.collection.findUnique({ where: { id: req.params.id } });
      // Don't delete seed images (they're shared assets)
      if (existing?.coverImage && !existing.coverImage.includes('/uploads/seed/')) {
        oldCover = existing.coverImage;
      }
      data.coverImage = await processImage(req.file.buffer, 'collections', nameEn || 'collection');
    }
    await req.prisma.collection.update({
      where: { id: req.params.id },
      data
    });
    // Clean up old cover after successful update — but only if no other record references it
    if (oldCover) {
      const stillUsed = await isImageStillReferenced(req.prisma, oldCover);
      if (!stillUsed) {
        await safeUnlinkPublic(oldCover);
        await safeUnlinkPublic(oldCover.replace('/uploads/collections/', '/uploads/collections/thumb-'));
      }
    }
    res.redirect(`/admin/collections/${req.params.id}/edit?ok=1`);
  } catch (err) { next(err); }
});

// =====================================================
// PRODUCTS
// =====================================================
router.get('/products', async (req, res, next) => {
  try {
    const products = await req.prisma.product.findMany({
      orderBy: [{ collectionId: 'asc' }, { order: 'asc' }],
      include: { collection: true }
    });
    const collections = await req.prisma.collection.findMany({ orderBy: { order: 'asc' } });
    res.render('admin/products', {
      layout: 'admin/layout',
      title: 'Продукти · Admin',
      products,
      collections
    });
  } catch (err) { next(err); }
});

router.get('/products/new', async (req, res, next) => {
  try {
    const collections = await req.prisma.collection.findMany({ orderBy: { order: 'asc' } });
    res.render('admin/product-edit', {
      layout: 'admin/layout',
      title: 'Нов продукт',
      product: null,
      collections,
      images: [],
      query: req.query
    });
  } catch (err) { next(err); }
});

router.get('/products/:id/edit', async (req, res, next) => {
  try {
    const [product, collections] = await Promise.all([
      req.prisma.product.findUnique({
        where: { id: req.params.id },
        include: { collection: true }
      }),
      req.prisma.collection.findMany({ orderBy: { order: 'asc' } })
    ]);
    if (!product) return res.redirect('/admin/products');
    let images = [];
    try { images = JSON.parse(product.images || '[]'); } catch (e) {}
    res.render('admin/product-edit', {
      layout: 'admin/layout',
      title: `Редакция · ${product.nameBg || product.nameIt}`,
      product,
      collections,
      images,
      query: req.query
    });
  } catch (err) { next(err); }
});

router.post('/products', upload.array('images', 10), async (req, res, next) => {
  try {
    const { collectionId, nameIt, nameBg, nameEn,
            shortDescIt, shortDescBg, shortDescEn,
            descriptionIt, descriptionBg, descriptionEn,
            materials, dimensions,
            metaTitleIt, metaDescIt,
            isActive, isFeatured, order } = req.body;

    const slug = slugify(nameEn || nameIt, { lower: true, strict: true }) + '-' + Date.now().toString(36);
    const newImages = [];
    if (req.files && req.files.length) {
      for (const f of req.files) {
        newImages.push(await processImage(f.buffer, 'products', nameEn || nameIt));
      }
    }

    const product = await req.prisma.product.create({
      data: {
        slug,
        collectionId,
        nameIt, nameBg, nameEn,
        shortDescIt: shortDescIt || null,
        shortDescBg: shortDescBg || null,
        shortDescEn: shortDescEn || null,
        descriptionIt, descriptionBg, descriptionEn,
        materials: materials || null,
        dimensions: dimensions || null,
        metaTitleIt: metaTitleIt || null,
        metaDescIt: metaDescIt || null,
        images: JSON.stringify(newImages),
        mainImage: newImages[0] || null,
        isActive: isActive === 'on',
        isFeatured: isFeatured === 'on',
        order: parseInt(order) || 0
      }
    });
    res.redirect(`/admin/products/${product.id}/edit?ok=1`);
  } catch (err) { next(err); }
});

router.post('/products/:id', upload.array('images', 10), async (req, res, next) => {
  try {
    const { collectionId, nameIt, nameBg, nameEn,
            shortDescIt, shortDescBg, shortDescEn,
            descriptionIt, descriptionBg, descriptionEn,
            materials, dimensions,
            metaTitleIt, metaDescIt,
            isActive, isFeatured, order } = req.body;

    const existing = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.redirect('/admin/products');

    let currentImages = [];
    try { currentImages = JSON.parse(existing.images || '[]'); } catch (e) {}

    // Append newly-uploaded images to the end
    if (req.files && req.files.length) {
      for (const f of req.files) {
        currentImages.push(await processImage(f.buffer, 'products', nameEn || nameIt));
      }
    }

    // Preserve current mainImage if it still exists, otherwise fall back to first image
    let nextMain = existing.mainImage;
    if (!currentImages.includes(nextMain)) {
      nextMain = currentImages[0] || null;
    }

    await req.prisma.product.update({
      where: { id: req.params.id },
      data: {
        collectionId,
        nameIt, nameBg, nameEn,
        shortDescIt: shortDescIt || null,
        shortDescBg: shortDescBg || null,
        shortDescEn: shortDescEn || null,
        descriptionIt, descriptionBg, descriptionEn,
        materials: materials || null,
        dimensions: dimensions || null,
        metaTitleIt: metaTitleIt || null,
        metaDescIt: metaDescIt || null,
        images: JSON.stringify(currentImages),
        mainImage: nextMain,
        isActive: isActive === 'on',
        isFeatured: isFeatured === 'on',
        order: parseInt(order) || 0
      }
    });
    res.redirect(`/admin/products/${req.params.id}/edit?ok=1`);
  } catch (err) { next(err); }
});

router.post('/products/:id/delete', async (req, res, next) => {
  try {
    // Read product first to know which images it owned
    const product = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.redirect('/admin/products');

    let images = [];
    try { images = JSON.parse(product.images || '[]'); } catch (e) {}

    // Delete DB record
    await req.prisma.product.delete({ where: { id: req.params.id } });

    // Clean up files — only if not a seed image and no other record references it
    for (const image of images) {
      if (!image || image.includes('/uploads/seed/')) continue;
      const stillUsed = await isImageStillReferenced(req.prisma, image);
      if (!stillUsed) {
        await safeUnlinkPublic(image);
        await safeUnlinkPublic(image.replace('/uploads/products/', '/uploads/products/thumb-'));
      }
    }
    res.redirect('/admin/products');
  } catch (err) { next(err); }
});

router.post('/products/:id/image-delete', async (req, res, next) => {
  try {
    const { image } = req.body;
    const product = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Not found' });
    let images = [];
    try { images = JSON.parse(product.images || '[]'); } catch (e) {}
    images = images.filter(i => i !== image);
    // If the deleted image was the main one, fall back to first remaining; otherwise keep current main
    const nextMain = product.mainImage === image ? (images[0] || null) : product.mainImage;
    await req.prisma.product.update({
      where: { id: req.params.id },
      data: {
        images: JSON.stringify(images),
        mainImage: nextMain
      }
    });

    // Only physically delete the file if no other records reference it.
    // Seed images (/uploads/seed/) are shared assets — never delete from disk.
    if (image && !image.includes('/uploads/seed/')) {
      const stillUsed = await isImageStillReferenced(req.prisma, image, req.params.id);
      if (!stillUsed) {
        await safeUnlinkPublic(image);
        await safeUnlinkPublic(image.replace('/uploads/products/', '/uploads/products/thumb-'));
      }
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Set a specific image as the main image
router.post('/products/:id/set-main', async (req, res, next) => {
  try {
    const { image } = req.body;
    const product = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Not found' });
    let images = [];
    try { images = JSON.parse(product.images || '[]'); } catch (e) {}
    if (!images.includes(image)) {
      return res.status(400).json({ error: 'Image not in product' });
    }
    // Move chosen image to position 0; mainImage tracks images[0]
    const reordered = [image, ...images.filter(i => i !== image)];
    await req.prisma.product.update({
      where: { id: req.params.id },
      data: {
        images: JSON.stringify(reordered),
        mainImage: image
      }
    });
    res.redirect(`/admin/products/${req.params.id}/edit?ok=main-set`);
  } catch (err) { next(err); }
});

// Reorder images (accepts JSON: { order: ['/uploads/products/a.webp', ...] })
router.post('/products/:id/reorder-images', async (req, res, next) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be array' });
    const product = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!product) return res.status(404).json({ error: 'Not found' });
    let existing = [];
    try { existing = JSON.parse(product.images || '[]'); } catch (e) {}
    // Validate: every item in order must exist in current images
    const invalid = order.filter(o => !existing.includes(o));
    if (invalid.length) return res.status(400).json({ error: 'Some images do not belong to this product' });
    // Allow partial reorder — keep any images not in order at the end
    const final = [...order, ...existing.filter(i => !order.includes(i))];
    await req.prisma.product.update({
      where: { id: req.params.id },
      data: {
        images: JSON.stringify(final),
        mainImage: final[0] || null
      }
    });
    res.json({ ok: true, mainImage: final[0] });
  } catch (err) { next(err); }
});

// Quick toggle: isActive
router.post('/products/:id/toggle-active', async (req, res, next) => {
  try {
    const p = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Not found' });
    const updated = await req.prisma.product.update({
      where: { id: req.params.id },
      data: { isActive: !p.isActive }
    });
    res.json({ ok: true, isActive: updated.isActive });
  } catch (err) { next(err); }
});

// Quick toggle: isFeatured
router.post('/products/:id/toggle-featured', async (req, res, next) => {
  try {
    const p = await req.prisma.product.findUnique({ where: { id: req.params.id } });
    if (!p) return res.status(404).json({ error: 'Not found' });
    const updated = await req.prisma.product.update({
      where: { id: req.params.id },
      data: { isFeatured: !p.isFeatured }
    });
    res.json({ ok: true, isFeatured: updated.isFeatured });
  } catch (err) { next(err); }
});

// =====================================================
// GALLERY
// =====================================================
router.get('/gallery', async (req, res, next) => {
  try {
    const items = await req.prisma.galleryItem.findMany({ orderBy: { order: 'asc' } });
    res.render('admin/gallery', {
      layout: 'admin/layout',
      title: 'Галерия · Admin',
      items,
      query: req.query
    });
  } catch (err) { next(err); }
});

router.post('/gallery', upload.array('images', 20), async (req, res, next) => {
  try {
    if (req.files && req.files.length) {
      for (const f of req.files) {
        const filename = await processImage(f.buffer, 'gallery', 'gallery');
        await req.prisma.galleryItem.create({
          data: {
            image: filename,
            isActive: true
          }
        });
      }
    }
    res.redirect('/admin/gallery?ok=1');
  } catch (err) { next(err); }
});

router.post('/gallery/:id/delete', async (req, res, next) => {
  try {
    const item = await req.prisma.galleryItem.findUnique({ where: { id: req.params.id } });
    // Delete the DB record first
    await req.prisma.galleryItem.delete({ where: { id: req.params.id } });
    // Then delete the file — only if no other record references it AND it's not a seed image
    if (item?.image && !item.image.includes('/uploads/seed/')) {
      const stillUsed = await isImageStillReferenced(req.prisma, item.image);
      if (!stillUsed) {
        await safeUnlinkPublic(item.image);
      }
    }
    res.redirect('/admin/gallery?ok=1');
  } catch (err) { next(err); }
});

router.post('/gallery/:id', async (req, res, next) => {
  try {
    const { titleIt, titleBg, titleEn, captionIt, captionBg, captionEn, order, isActive } = req.body;
    await req.prisma.galleryItem.update({
      where: { id: req.params.id },
      data: {
        titleIt: titleIt || null,
        titleBg: titleBg || null,
        titleEn: titleEn || null,
        captionIt: captionIt || null,
        captionBg: captionBg || null,
        captionEn: captionEn || null,
        order: parseInt(order) || 0,
        isActive: isActive === 'on'
      }
    });
    res.redirect('/admin/gallery?ok=1');
  } catch (err) { next(err); }
});

// =====================================================
// SITE CONTENT
// =====================================================
router.get('/content', async (req, res, next) => {
  try {
    const items = await req.prisma.siteContent.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] });
    const grouped = {};
    for (const item of items) {
      if (!grouped[item.group]) grouped[item.group] = [];
      grouped[item.group].push(item);
    }
    res.render('admin/content', {
      layout: 'admin/layout',
      title: 'Съдържание · Admin',
      grouped,
      query: req.query
    });
  } catch (err) { next(err); }
});

router.post('/content/:id', async (req, res, next) => {
  try {
    const { valueIt, valueBg, valueEn } = req.body;
    const updated = await req.prisma.siteContent.update({
      where: { id: req.params.id },
      data: { valueIt, valueBg, valueEn }
    });
    console.log(`[admin/content] updated ${updated.key}`);
    res.redirect('/admin/content?ok=' + encodeURIComponent(updated.key));
  } catch (err) {
    console.error('[admin/content] ERROR:', err.message);
    next(err);
  }
});

// =====================================================
// MESSAGES
// =====================================================
router.get('/messages', async (req, res, next) => {
  try {
    const messages = await req.prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.render('admin/messages', {
      layout: 'admin/layout',
      title: 'Messaggi · Admin',
      messages,
      selected: null
    });
  } catch (err) { next(err); }
});

router.get('/messages/:id', async (req, res, next) => {
  try {
    const [messages, selected] = await Promise.all([
      req.prisma.contactMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
      req.prisma.contactMessage.findUnique({ where: { id: req.params.id } })
    ]);
    if (!selected) return res.redirect('/admin/messages');
    if (!selected.isRead) {
      await req.prisma.contactMessage.update({
        where: { id: selected.id },
        data: { isRead: true }
      });
      selected.isRead = true;
    }
    res.render('admin/messages', {
      layout: 'admin/layout',
      title: `${selected.name} · Messaggi`,
      messages,
      selected
    });
  } catch (err) { next(err); }
});

router.post('/messages/:id/read', async (req, res, next) => {
  try {
    await req.prisma.contactMessage.update({
      where: { id: req.params.id },
      data: { isRead: true }
    });
    res.redirect('/admin/messages');
  } catch (err) { next(err); }
});

router.post('/messages/:id/delete', async (req, res, next) => {
  try {
    await req.prisma.contactMessage.delete({ where: { id: req.params.id } });
    res.redirect('/admin/messages');
  } catch (err) { next(err); }
});

// =====================================================
// SETTINGS — change password
// =====================================================
router.get('/settings', async (req, res, next) => {
  try {
    const user = await req.prisma.adminUser.findUnique({ where: { id: req.adminUser.id } });
    res.render('admin/settings', {
      layout: 'admin/layout',
      title: 'Impostazioni · Admin',
      user
    });
  } catch (err) { next(err); }
});

router.post('/settings/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await req.prisma.adminUser.findUnique({ where: { id: req.adminUser.id } });
    if (!user || !await bcrypt.compare(currentPassword, user.password)) {
      return res.redirect('/admin/settings?err=current');
    }
    if (!newPassword || newPassword.length < 8) {
      return res.redirect('/admin/settings?err=length');
    }
    await req.prisma.adminUser.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 12) }
    });
    res.redirect('/admin/settings?ok=password');
  } catch (err) { next(err); }
});

export default router;
