import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { PublicTutorPage } from "@/components/public-tutor-page";
import { publicProfileDescription } from "@/lib/public-profile";
import { getPublishedTutorProfile } from "@/server/public-profile";

type Props = { params: Promise<{ slug: string }> };
const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "https://easy4tutor.pl").replace(/\/$/, "");

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const profile = await getPublishedTutorProfile((await params).slug);
  if (!profile) return { robots: { index: false, follow: false } };
  const title = `${profile.publicName} — korepetycje${profile.subjects[0] ? ` z ${profile.subjects[0]}` : ""}`;
  const description = publicProfileDescription(profile);
  const canonical = `${siteUrl()}/${profile.canonicalSlug ?? profile.slug}`;
  return { title, description, alternates: { canonical }, robots: { index: true, follow: true }, openGraph: { type: "profile", url: canonical, siteName: "easy4tutor", locale: "pl_PL", title, description, images: profile.photoUrl ? [{ url: profile.photoUrl, alt: profile.publicName }] : [] }, twitter: { card: "summary_large_image", title, description, images: profile.photoUrl ? [profile.photoUrl] : [] } };
}

export default async function Page({ params }: Props) {
  const requestedSlug = (await params).slug;
  const profile = await getPublishedTutorProfile(requestedSlug);
  if (!profile) notFound();
  if (profile.canonicalSlug && profile.canonicalSlug !== requestedSlug) permanentRedirect(`/${profile.canonicalSlug}`);
  const structuredData = { "@context": "https://schema.org", "@type": "Person", name: profile.publicName, description: publicProfileDescription(profile), image: profile.photoUrl, url: `${siteUrl()}/${profile.slug}`, knowsAbout: [...profile.subjects, ...(profile.specializations ?? [])], sameAs: profile.contactLinks, makesOffer: profile.eventTypes.map((offer) => ({ "@type": "Offer", name: offer.name, price: (offer.priceGrosz / 100).toFixed(2), priceCurrency: offer.currency, itemOffered: { "@type": "Service", name: offer.name, description: offer.description } })) };
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><PublicTutorPage profile={profile} /></>;
}
