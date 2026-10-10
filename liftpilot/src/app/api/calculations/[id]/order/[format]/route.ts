import { orderRoute } from '@/server/order-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The draft order of the machine of a saved calculation, in Word or PDF.
export const GET = orderRoute('calc');
