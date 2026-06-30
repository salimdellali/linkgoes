import { notFound, redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { db } from '@/db'
import { links, clicks } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { PostHog } from 'posthog-node'

export default async function SlugPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const [link] = await db.select().from(links).where(eq(links.slug, slug))

  if (!link) notFound()
  if (link.expiresAt && link.expiresAt < new Date()) notFound()

  const headersList = await headers()
  const referrer = headersList.get('referer') ?? undefined
  const country = headersList.get('x-vercel-ip-country') ?? undefined
  const city = headersList.get('x-vercel-ip-city') ?? undefined
  const ua = headersList.get('user-agent') ?? ''
  const device = /mobile/i.test(ua) ? 'mobile' : /tablet/i.test(ua) ? 'tablet' : 'desktop'

  await db.insert(clicks).values({ linkId: link.id, referrer, country, city, device })

  const phKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (phKey) {
    const ph = new PostHog(phKey, { host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com' })
    ph.capture({ distinctId: link.userId, event: 'link_clicked', properties: { slug, country: country ?? 'unknown' } })
    await ph.shutdown()
  }

  redirect(link.originalUrl)
}
