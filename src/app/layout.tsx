import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const manrope = localFont({
  src: "./fonts/manrope-variable.ttf",
  weight: "200 800",
  variable: "--font-ui",
  display: "swap",
});
const literata = localFont({
  src: "./fonts/literata-variable.ttf",
  weight: "200 900",
  preload: false,
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "easy4tutor — kalendarz i organizacja pracy korepetytora",
    template: "%s · easy4tutor",
  },
  applicationName: "easy4tutor",
  description:
    "Kalendarz, uczniowie, lekcje, notatki i płatności w jednym miejscu dla korepetytora.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html
      lang="pl"
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${literata.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
