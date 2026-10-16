export const BETA_SUPPORT_EMAIL = "support@easy4tutor.pl";

const feedbackSubject = "easy4tutor — problem lub opinia";
const feedbackBody = [
  "Obszar easy4tutor:",
  "",
  "Problem lub sugestia:",
  "",
  "Kroki do odtworzenia (opcjonalnie):",
  "",
  "Prosimy nie wpisywać imion uczniów, notatek z lekcji ani innych danych osobowych.",
].join("\n");

export const BETA_FEEDBACK_MAILTO = `mailto:${BETA_SUPPORT_EMAIL}?subject=${encodeURIComponent(feedbackSubject)}&body=${encodeURIComponent(feedbackBody)}`;
