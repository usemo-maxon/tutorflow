import type { Metadata } from "next";
export const metadata: Metadata = { title: "Zaloguj się" };
import { AuthPage } from "@/components/auth-page";
export default function LoginPage() {
  return <AuthPage mode="login" />;
}
