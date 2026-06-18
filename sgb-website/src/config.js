import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const stripSlash = (u) => (u || '').replace(/\/+$/, '');

export const config = {
  root,
  env: process.env.NODE_ENV || 'development',
  isProd: (process.env.NODE_ENV || 'development') === 'production',
  port: parseInt(process.env.PORT || '3000', 10),
  siteUrl: stripSlash(process.env.SITE_URL || 'http://localhost:3000'),
  sessionSecret: process.env.SESSION_SECRET || 'dev_insecure_secret_change_me',
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),

  paths: {
    data: path.join(root, 'data'),
    db: path.join(root, 'data', 'sgb.db'),
    sessions: path.join(root, 'data'),
    uploads: path.join(root, 'public', 'uploads'),
    public: path.join(root, 'public'),
    views: path.join(root, 'src', 'views'),
  },

  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@sgbbg.com',
    password: process.env.ADMIN_PASSWORD || 'admin12345',
  },

  upload: {
    maxFileSize: 50 * 1024 * 1024, // 50 MB (за PDF издания на вестника)
    imageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'],
    docTypes: ['application/pdf'],
  },
};
