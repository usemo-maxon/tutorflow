"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, LoaderCircle, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { authRequest, ClientApiError } from "@/lib/api-client";
import { copy } from "@/lib/copy";

const schema = z.object({
  name: z.string().optional(),
  email: z.email("Podaj poprawny adres e-mail."),
  password: z.string().min(8, "Hasło musi mieć co najmniej 8 znaków."),
});
type Values = z.infer<typeof schema>;

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState("");
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
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

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");
    try {
      const response = await authRequest(mode, values);
      if (response.requiresEmailConfirmation) {
        setConfirmationSent(true);
        return;
      }
      const returnTo = searchParams.get("returnTo");
      router.push(returnTo?.startsWith("/app/") ? returnTo : "/app/dzisiaj");
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
        disabled={isSubmitting || demoLoading}
      >
        {isSubmitting ? (
          <LoaderCircle className="spin" size={18} aria-hidden="true" />
        ) : null}
        {mode === "login" ? copy.auth.login : copy.auth.register}
        {!isSubmitting && <ArrowRight size={18} aria-hidden="true" />}
      </button>
      <div className="auth-divider">
        <span>lub</span>
      </div>
      <a
        className="button button--secondary button--full"
        href={`/api/auth/google?returnTo=${encodeURIComponent(searchParams.get("returnTo") ?? "/app/dzisiaj")}`}
      >
        Kontynuuj z Google
      </a>
      {process.env.NODE_ENV !== "production" && (
        <button
          className="button button--secondary button--full"
          type="button"
          onClick={openDemo}
          disabled={isSubmitting || demoLoading}
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
