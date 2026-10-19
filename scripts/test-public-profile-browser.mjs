import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const origin = "http://localhost:3218";
const isolatedData = mkdtempSync(
  path.join(tmpdir(), "easy4tutor-profile-browser-"),
);
const session = `profile-${process.pid}`;
const executableName = `agent-browser-${process.platform}-${process.arch}${process.platform === "win32" ? ".exe" : ""}`;
const cache = path.join(process.env.LOCALAPPDATA ?? "", "npm-cache", "_npx");
const executable = [
  path.join(
    process.cwd(),
    "node_modules",
    "agent-browser",
    "bin",
    executableName,
  ),
  ...readdirSync(cache).map((entry) =>
    path.join(
      cache,
      entry,
      "node_modules",
      "agent-browser",
      "bin",
      executableName,
    ),
  ),
].find(existsSync);
if (!executable)
  throw Error("Install agent-browser before running this browser regression.");
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3218"],
  {
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
    windowsHide: true,
  },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
function browser(args, optional = false) {
  const result = spawnSync(executable, ["--session", session, ...args], {
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
  });
  if (!optional && result.status !== 0)
    throw Error(`${args[0]} failed: ${result.stderr}\n${result.stdout}`);
  return result.stdout;
}
function assertBrowser(expression, label) {
  const output = browser(["eval", expression]);
  if (!/\btrue\b/.test(output)) throw Error(`${label}: ${output}`);
  console.log(`PASS: ${label}`);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (server.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(`${origin}/logowanie`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error(`Server did not start: ${logs}`);
  const login = await fetch(`${origin}/api/auth/demo`, { method: "POST" });
  const cookie = login.headers
    .get("set-cookie")
    ?.match(/tutorflow_session=([^;]+)/)?.[1];
  if (!cookie) throw Error("Local demo login failed");
  const headers = {
    cookie: `tutorflow_session=${cookie}`,
    "content-type": "application/json",
    connection: "close",
  };
  const current = await (
    await fetch(`${origin}/api/public-profile`, { headers })
  ).json();
  const input = {
    ...current,
    slug: "browser-profile",
    publicName: "Anna Browser",
    headline: "Matematyka bez stresu",
    subjects: ["Matematyka"],
    faq: [{ id: "unfinished", question: "Jak", answer: "", visible: true }],
  };
  const saved = await fetch(`${origin}/api/public-profile`, {
    method: "PUT",
    headers,
    body: JSON.stringify(input),
  });
  if (!saved.ok) throw Error(await saved.text());
  browser(["open", origin]);
  browser([
    "cookies",
    "set",
    "tutorflow_session",
    cookie,
    "--url",
    origin,
    "--httpOnly",
    "--sameSite",
    "Lax",
  ]);
  browser(["open", `${origin}/app/ustawienia/strona-publiczna`]);
  browser(["wait", "3000"]);
  assertBrowser(
    `Boolean(document.querySelector('input[value="Anna Browser"]'))`,
    "saved draft loads in editor",
  );
  browser(["find", "label", "Nagłówek", "fill", "Matematyka z planem"]);
  browser(["press", "Tab"]);
  browser(["wait", "2000"]);
  const persisted = await (
    await fetch(`${origin}/api/public-profile`, { headers })
  ).json();
  if (
    persisted.headline !== "Matematyka z planem" ||
    persisted.faq?.[0]?.question !== "Jak"
  )
    throw Error("Autosave lost edited content or unfinished FAQ");
  console.log(
    "PASS: real autosave preserves edited content and unfinished FAQ",
  );
  browser(["set", "viewport", "390", "844"]);
  browser(["focus", ".profile-studio-toolbar .profile-mobile-preview"]);
  browser(["press", "Enter"]);
  browser(["wait", "300"]);
  console.log(
    browser([
      "eval",
      `JSON.stringify({width:innerWidth,layout:document.querySelector('.public-settings-layout')?.className,buttons:[...document.querySelectorAll('.profile-mobile-preview')].map(b=>({text:b.textContent,display:getComputedStyle(b).display,width:b.getBoundingClientRect().width}))})`,
    ]),
  );
  assertBrowser(
    `(() => {const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Wróć do edycji' && b.getBoundingClientRect().width>0);return Boolean(b);})()`,
    "mobile preview exposes return control",
  );
  browser(["click", ".public-profile-preview > .profile-mobile-preview"]);
  browser(["wait", "300"]);
  assertBrowser(
    `document.querySelector('input[value="Anna Browser"]').getBoundingClientRect().width > 0`,
    "mobile returns to editable fields",
  );
  assertBrowser(
    `document.documentElement.scrollWidth <= innerWidth + 1`,
    "390px editor has no horizontal overflow",
  );
  browser([
    "find",
    "role",
    "button",
    "click",
    "--name",
    "Opublikuj profil",
    "--exact",
  ]);
  browser(["wait", "1500"]);
  const published = await fetch(`${origin}/browser-profile`);
  if (
    !published.ok ||
    !(await published.text()).includes("Matematyka z planem")
  )
    throw Error("Published page missing saved content");
  console.log("PASS: publish button creates publicly readable snapshot");
  const unpublished = await fetch(`${origin}/api/public-profile`, {
    method: "DELETE",
    headers,
  });
  if (
    !unpublished.ok ||
    (await fetch(`${origin}/browser-profile`)).status !== 404
  )
    throw Error("Unpublish did not remove public access");
  console.log("PASS: unpublish removes public page");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  browser(["close"], true);
  if (server.pid && server.exitCode === null) {
    if (process.platform === "win32")
      spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    else server.kill("SIGTERM");
  }
  const resolved = path.resolve(isolatedData);
  if (
    resolved.startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(resolved).startsWith("easy4tutor-profile-browser-")
  )
    rmSync(resolved, { recursive: true, force: true });
}
