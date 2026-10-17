import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const port = 3217;
const origin = `http://localhost:${port}`;
const session = `easy4tutor-shared-template-${process.pid}`;
const isolatedData = mkdtempSync(path.join(tmpdir(), "easy4tutor-browser-"));
const nextCli = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const initScript = path.join(
  process.cwd(),
  "scripts",
  "fixtures",
  "shared-template-browser-init.js",
);
const agentBrowserExecutable = findAgentBrowserExecutable();
const server = spawn(process.execPath, [nextCli, "dev", "-p", String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TUTORFLOW_DATA_DIR: isolatedData,
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_ANON_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => (serverOutput += chunk.toString()));
server.stderr.on("data", (chunk) => (serverOutput += chunk.toString()));

let browserStarted = false;

function browser(args, { allowFailure = false } = {}) {
  process.stdout.write(`• ${args.slice(0, 3).join(" ")}\n`);
  const launchArgs = ["--session", session];
  if (!browserStarted) {
    launchArgs.push("--init-script", initScript);
    browserStarted = true;
  }
  const result = spawnSync(agentBrowserExecutable, [...launchArgs, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 8_000,
  });
  if (!allowFailure && result.status !== 0) {
    throw new Error(
      `agent-browser ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`,
    );
  }
  const output = `${result.stdout}\n${result.stderr}`.trim();
  if (output) process.stdout.write(`${output}\n`);
  return output;
}

function findAgentBrowserExecutable() {
  const binaryName = `agent-browser-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`;
  const local = path.join(
    process.cwd(),
    "node_modules",
    "agent-browser",
    "bin",
    binaryName,
  );
  if (existsSync(local)) return local;
  const cacheRoot =
    process.env.npm_config_cache ||
    (process.platform === "win32"
      ? path.join(process.env.LOCALAPPDATA || homedir(), "npm-cache")
      : path.join(homedir(), ".npm"));
  const npxRoot = path.join(cacheRoot, "_npx");
  if (existsSync(npxRoot)) {
    for (const entry of readdirSync(npxRoot)) {
      const candidate = path.join(
        npxRoot,
        entry,
        "node_modules",
        "agent-browser",
        "bin",
        binaryName,
      );
      if (existsSync(candidate)) return candidate;
    }
  }
  throw new Error(
    "agent-browser is required for this browser test. Install it or run it once with npx.",
  );
}

function assertBrowser(expression, message) {
  const output = browser(["eval", expression]);
  if (!/\btrue\b/i.test(output)) throw new Error(`${message}: ${output}`);
}

function stopServer() {
  if (server.exitCode !== null || !server.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
      stdio: "ignore",
    });
    return;
  }
  server.kill("SIGTERM");
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error(
        `Next.js stopped before becoming ready.\n${serverOutput}`,
      );
    try {
      const response = await fetch(`${origin}/logowanie`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Next.js did not start in time.\n${serverOutput}`);
}

try {
  await waitForServer();
  const demoResponse = await fetch(`${origin}/api/auth/demo`, {
    method: "POST",
  });
  if (!demoResponse.ok)
    throw new Error(`Demo login failed: ${await demoResponse.text()}`);
  const sessionCookie = demoResponse.headers
    .get("set-cookie")
    ?.match(/tutorflow_session=([^;]+)/)?.[1];
  if (!sessionCookie)
    throw new Error("Demo login did not return a session cookie.");
  browser(["open", origin]);
  browser([
    "cookies",
    "set",
    "tutorflow_session",
    sessionCookie,
    "--url",
    origin,
    "--httpOnly",
    "--sameSite",
    "Lax",
  ]);
  browser(["open", `${origin}/app/materialy/biblioteka`]);
  browser(["wait", "5000"]);
  browser(["snapshot", "-i", "-c"]);
  browser(["get", "text", "body"]);
  const cardName = "Podejrzyj: Rozmowa o podróżach — B1";
  browser(["find", "role", "button", "click", "--name", cardName]);
  assertBrowser(
    `(() => { const el = document.querySelector('.shared-template-preview'); if (!el) return false; const r = el.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.width > 0 && r.height > 0; })()`,
    "Preview was not visible inside the desktop viewport after clicking a card",
  );
  assertBrowser(
    `(() => { const sections = [...document.querySelectorAll('.shared-template-section-list > li')]; return sections.length === 8 && sections.every((section) => section.textContent?.includes('Pełna instrukcja dla nauczyciela i ucznia') && section.textContent?.includes('7 min')); })()`,
    "Preview did not render every stored section with full content and minutes",
  );

  browser(["press", "Escape"]);
  assertBrowser(
    `document.activeElement?.getAttribute('aria-label') === ${JSON.stringify(cardName)}`,
    "Closing the preview did not restore focus to the card",
  );
  browser(["press", "Enter"]);
  assertBrowser(
    `Boolean(document.querySelector('.shared-template-preview'))`,
    "Keyboard activation did not open the preview",
  );

  browser(["set", "viewport", "390", "844"]);
  assertBrowser(
    `(() => { const el = document.querySelector('.shared-template-preview'); const footer = document.querySelector('.shared-template-preview__footer'); if (!el || !footer) return false; const r = el.getBoundingClientRect(); const f = footer.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && f.bottom <= innerHeight && getComputedStyle(document.querySelector('.shared-template-preview__scroll')).overflowY === 'auto'; })()`,
    "Mobile preview or its actions were outside the 390×844 viewport",
  );

  browser(["press", "Escape"]);
  browser(["find", "role", "button", "click", "--name", "Zapisz na później"]);
  browser(["wait", "300"]);
  assertBrowser(
    `!document.querySelector('.shared-template-preview')`,
    "Favorite action opened the preview",
  );

  browser(["find", "role", "button", "click", "--name", cardName]);
  assertBrowser(
    `(() => { const button = [...document.querySelectorAll('.shared-template-preview button')].find((item) => item.textContent?.trim() === 'Zapisz do moich szablonów'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`,
    "The preview did not expose the save action",
  );
  browser(["wait", "1000"]);
  assertBrowser(
    `document.querySelector('a[href="/app/materialy/szablony?template=22000000-0000-4000-8000-000000000001"]')?.textContent?.includes('Otwórz szablon') === true`,
    "Successful save did not expose the exact private-template deep link",
  );
  assertBrowser(
    `(() => { const button = [...document.querySelectorAll('.shared-template-preview button')].find((item) => item.textContent?.trim() === 'Użyj w lekcji'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`,
    "The saved preview did not expose the lesson action",
  );
  browser(["wait", "1000"]);
  assertBrowser(
    `(() => { const choice = document.querySelector('.shared-template-lesson-picker__list button'); if (!(choice instanceof HTMLButtonElement) || !choice.textContent?.includes('Jan Kowalski')) return false; choice.click(); return true; })()`,
    "The real upcoming lesson was not available for selection",
  );
  assertBrowser(
    `document.querySelector('.shared-template-lesson-picker__notice')?.textContent?.includes('Nic nie zostanie zastąpione') === true`,
    "Existing lesson content did not trigger the preservation warning",
  );
  assertBrowser(
    `(() => { const button = [...document.querySelectorAll('.shared-template-lesson-picker button')].find((item) => item.textContent?.trim() === 'Dodaj do lekcji i otwórz'); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`,
    "The lesson picker did not expose the apply action",
  );
  browser(["wait", "1000"]);
  assertBrowser(
    `location.pathname === '/app/lekcje/33000000-0000-4000-8000-000000000001'`,
    "Applying the template did not open the selected lesson",
  );
  console.log(
    "Shared template browser interaction passed (desktop, 390×844, save, and apply).",
  );
} catch (error) {
  console.error("Next.js output:\n", serverOutput);
  throw error;
} finally {
  browser(["close"], { allowFailure: true });
  stopServer();
  rmSync(isolatedData, { recursive: true, force: true });
}
