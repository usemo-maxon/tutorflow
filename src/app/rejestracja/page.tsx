import type { Metadata } from "next";
export const metadata: Metadata = { title: "Załóż konto" };
import { AuthPage } from "@/components/auth-page";
export default function RegisterPage() {
  return <AuthPage mode="register" />;
}
