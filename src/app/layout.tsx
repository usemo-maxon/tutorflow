import type { Metadata } from "next";
import { DM_Mono, Literata, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/components/providers";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "latin-ext"],
  variable: "--font-ui",
  display: "swap",
});
const literata = Literata({
  subsets: ["latin", "latin-ext"],
  variable: "--font-display",
  display: "swap",
});
const dmMono = DM_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-data",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TutorFlow — spokojny rytm lekcji",
  description: "Lekcje, postępy i płatności w jednym spokojnym miejscu.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pl"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${literata.variable} ${dmMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
