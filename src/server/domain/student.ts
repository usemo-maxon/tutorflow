export interface DuplicateCandidate {
  id: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
}

export interface DuplicateInput {
  firstName: string;
  lastName: string;
  displayName?: string;
  email?: string;
  phone?: string;
}

const normalizeText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pl");

const normalizePhone = (value?: string | null) =>
  (value ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");

export function studentDisplayName(input: DuplicateInput): string {
  return (
    input.displayName?.trim() ||
    [input.firstName.trim(), input.lastName.trim()].filter(Boolean).join(" ")
  );
}

export function findProbableDuplicateIds(
  input: DuplicateInput,
  candidates: readonly DuplicateCandidate[],
): string[] {
  const name = normalizeText(studentDisplayName(input));
  const email = normalizeText(input.email);
  const phone = normalizePhone(input.phone);
  return candidates
    .filter((candidate) => {
      if (name && normalizeText(candidate.displayName) === name) return true;
      if (email && normalizeText(candidate.email) === email) return true;
      return Boolean(phone && normalizePhone(candidate.phone) === phone);
    })
    .map((candidate) => candidate.id);
}
