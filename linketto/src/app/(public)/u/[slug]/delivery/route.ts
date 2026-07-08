import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStripe } from '@/lib/stripe';

// Доставка на дигитален продукт: след успешен checkout Stripe връща
// купувача тук; проверяваме сесията НА ЖИВО срещу Stripe (не вярваме на
// URL параметри) и чак тогава го пращаме към тайния deliveryUrl.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id');
  const stripe = getStripe();
  if (!sessionId || !stripe) {
    return NextResponse.redirect(new URL(`/u/${slug}`, url.origin), 302);
  }

  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId);
  } catch {
    return NextResponse.redirect(new URL(`/u/${slug}`, url.origin), 302);
  }
  const productId = session.metadata?.productId;
  if (session.payment_status !== 'paid' || !productId) {
    return NextResponse.redirect(new URL(`/u/${slug}`, url.origin), 302);
  }

  const product = await prisma.product.findFirst({
    where: { id: productId, profile: { slug } },
  });
  if (!product) {
    return NextResponse.redirect(new URL(`/u/${slug}`, url.origin), 302);
  }
  return NextResponse.redirect(product.deliveryUrl, 302);
}
