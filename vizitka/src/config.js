// Публичният базов адрес — влиза в QR кода, vCard файла и копирания линк.
const prod = process.env.NODE_ENV === 'production';

// В продукция е ЗАДЪЛЖИТЕЛНА. Без нея базовият адрес пада на заглавието Host, което
// идва от клиента: подправен Host значи отровен QR код, отровен canonical и — най-
// лошото — линк за нулиране на парола към чужд домейн. Днес nginx го спира със
// `server_name`, но това е втора линия, не първа. Същият fail-closed модел като
// PRINT_API_SECRET.
if (prod && !process.env.PUBLIC_BASE_URL) {
  throw new Error(
    'PUBLIC_BASE_URL е задължителна в продукция (влиза в QR кода, vCard и линковете за нулиране).'
  );
}

export function baseUrl(req) {
  const configured = process.env.PUBLIC_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}
