import type { Metadata } from "next";
import Script from "next/script";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";
import "./motion-tokens.css";
import "./redesign.css";
import "./workspace-motion.css";
import "./theme.css";
import { CookieSettings } from "@/components/cookie-settings";

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
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${manrope.variable} ${literata.variable}`}
    >
      <body>
        {children}
        <CookieSettings />
        <Script id="color-theme" strategy="beforeInteractive">
          {`try{var t=localStorage.getItem("easy4tutor-color-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light";document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}`}
        </Script>
      </body>
    </html>
  );
}
