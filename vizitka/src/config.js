// Публичният базов адрес — влиза в QR кода, vCard файла и копирания линк.
export function baseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
