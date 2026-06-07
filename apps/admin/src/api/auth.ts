import { apiGet, apiSend } from '@/api/client';
import type { Admin } from '@/api/types';

export function fetchMe(): Promise<Admin> {
  return apiGet<Admin>('/admin/auth/me');
}

export function login(email: string, password: string): Promise<Admin> {
  return apiSend<Admin>('POST', '/admin/auth/login', { email, password });
}

export function logout(): Promise<void> {
  return apiSend<void>('POST', '/admin/auth/logout');
}
