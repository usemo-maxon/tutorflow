"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authRequest, ClientApiError } from "@/lib/api-client";
import { authAppDestination } from "@/lib/auth-redirect";
import { copy } from "@/lib/copy";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

const schema = z.object({
  name: z.string().optional(),
  email: z.email("Podaj poprawny adres e-mail."),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków."),
});
type Values = z.infer<typeof schema>;

function GoogleIcon() {
  return (
    <svg
      className="google-icon"
      viewBox="0 0 18 18"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.258h2.909c1.702-1.567 2.684-3.875 2.684-6.613Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.468-.806 5.956-2.182l-2.91-2.258c-.805.54-1.835.86-3.046.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.333A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.706A5.41 5.41 0 0 1 3.682 9c0-.592.102-1.167.281-1.706V4.96H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.04l3.007-2.334Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.582-2.582C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.96l3.007 2.334C4.672 5.165 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState(() =>
    searchParams.get("error") === "google_oauth_failed"
      ? "Logowanie przez Google nie powiodło się lub zostało anulowane. Spróbuj ponownie."
      : "",
  );
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(
      mode === "register"
        ? schema.extend({
            name: z.string().trim().min(2, "Podaj imię i nazwisko."),
          })
        : schema.extend({ password: z.string().min(1, "Podaj hasło.") }),
    ),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function openDemo() {
    setDemoLoading(true);
    setServerError("");
    try {
      await authRequest("demo");
      router.push("/app/dzisiaj");
      router.refresh();
    } catch (error) {
      setServerError(
        error instanceof ClientApiError
          ? error.data.message
          : "Nie udało się otworzyć konta demonstracyjnego.",
      );
    } finally {
      setDemoLoading(false);
    }
  }

  async function continueWithGoogle() {
    setGoogleLoading(true);
    setServerError("");

    try {
      const supabase = await createSupabaseBrowserClient();
      const next = authAppDestination(mode, searchParams.get("returnTo"));
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });

      if (error) {
        setServerError(
          "Nie udało się rozpocząć logowania przez Google. Spróbuj ponownie.",
        );
        setGoogleLoading(false);
      }
    } catch {
      setServerError(
        "Nie udało się rozpocząć logowania przez Google. Spróbuj ponownie.",
      );
      setGoogleLoading(false);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    if (googleLoading) return;
    setServerError("");
    try {
      const response = await authRequest(mode, values);
      if (response.requiresEmailConfirmation) {
        setConfirmationSent(true);
        return;
      }
      router.push(authAppDestination(mode, searchParams.get("returnTo")));
      router.refresh();
    } catch (error) {
      if (error instanceof ClientApiError) {
        Object.entries(error.data.fieldErrors ?? {}).forEach(
          ([field, message]) => setError(field as keyof Values, { message }),
        );
        setServerError(error.data.message);
      } else {
        setServerError("Brak połączenia. Sprawdź sieć i spróbuj ponownie.");
      }
    }
  });

  return (
    <form className="auth-form" onSubmit={onSubmit} noValidate>
      <button
        className="button button--secondary button--full google-auth-button"
        type="button"
        onClick={continueWithGoogle}
        disabled={isSubmitting || demoLoading || googleLoading}
        aria-busy={googleLoading}
      >
        {googleLoading ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : (
          <GoogleIcon />
        )}
        <span aria-live="polite">
          {googleLoading ? "Przekierowuję do Google…" : "Kontynuuj z Google"}
        </span>
      </button>
      <div className="auth-divider">
        <span>lub</span>
      </div>
      {mode === "register" && (
        <label className="field">
          <span>{copy.auth.name}</span>
          <input
            autoComplete="name"
            {...register("name")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? "auth-name-error" : undefined}
          />
          {errors.name && (
            <small id="auth-name-error" className="field-error">
              {errors.name.message}
            </small>
          )}
        </label>
      )}
      <label className="field">
        <span>{copy.auth.email}</span>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          {...register("email")}
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? "auth-email-error" : undefined}
        />
        {errors.email && (
          <small id="auth-email-error" className="field-error">
            {errors.email.message}
          </small>
        )}
      </label>
      <div className="field">
        <label htmlFor="auth-password">{copy.auth.password}</label>
        <input
          id="auth-password"
          type={showPassword ? "text" : "password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          {...register("password")}
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? "auth-password-error" : undefined}
        />
        <button
          className="password-toggle"
          type="button"
          aria-pressed={showPassword}
          onClick={() => setShowPassword(!showPassword)}
        >
          {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          {showPassword ? "Ukryj hasło" : "Pokaż hasło"}
        </button>
        {mode === "register" && !errors.password && (
          <small>Co najmniej 8 znaków.</small>
        )}
        {errors.password && (
          <small id="auth-password-error" className="field-error">
            {errors.password.message}
          </small>
        )}
      </div>
      {mode === "login" && (
        <Link className="auth-helper" href="/odzyskaj-haslo">
          Nie pamiętasz hasła?
        </Link>
      )}
      {serverError && (
        <div className="form-alert" role="alert">
          {serverError}
        </div>
      )}
      {confirmationSent && (
        <div className="integration-note" role="status">
          Sprawdź skrzynkę e-mail i potwierdź rejestrację, aby się zalogować.
        </div>
      )}
      <button
        className="button button--primary button--full"
        disabled={isSubmitting || demoLoading || googleLoading}
      >
        {isSubmitting ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : null}
        {mode === "login" ? copy.auth.login : copy.auth.register}
        {!isSubmitting && <ArrowRight size={18} aria-hidden="true" />}
      </button>
      {process.env.NODE_ENV !== "production" && (
        <button
          className="button button--secondary button--full"
          type="button"
          onClick={openDemo}
          disabled={isSubmitting || demoLoading || googleLoading}
        >
          {demoLoading && (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          )}
          {copy.auth.demo}
        </button>
      )}
    </form>
  );
}
