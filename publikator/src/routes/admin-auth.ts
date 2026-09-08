import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { safeEqual } from '../crypto.js';

/** Всички управляващи маршрути искат bearer токен — authn преди всяко действие. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
  if (!token || !safeEqual(token, config().ADMIN_API_TOKEN)) {
    res.status(401).json({ error: 'Нужен е валиден администраторски токен.' });
    return;
  }
  next();
}

/** Кой одобри поста — влиза в одиторската следа. */
export function actorFrom(req: Request): string {
  return req.header('x-publikator-actor') ?? 'admin';
}
