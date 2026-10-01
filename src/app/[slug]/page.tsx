import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicTutorPage } from "@/components/public-tutor-page";
import { publicProfileDescription } from "@/lib/public-profile";
import { getPublishedTutorProfile } from "@/server/public-profile";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> { const profile = await getPublishedTutorProfile((await params).slug); if (!profile) return {}; const title = `${profile.publicName} — korepetycje${profile.subjects[0] ? ` z ${profile.subjects[0]}` : ""} | easy4tutor`; return { title, description: publicProfileDescription(profile), openGraph: { title, description: publicProfileDescription(profile), images: profile.photoUrl ? [profile.photoUrl] : [] } }; }
export default async function Page({ params }: Props) { const profile = await getPublishedTutorProfile((await params).slug); if (!profile) notFound(); return <PublicTutorPage profile={profile} />; }
