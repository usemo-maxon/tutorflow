import { spawn } from "node:child_process";
import path from "node:path";

const nextCli = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const dataDirectory =
  process.env.TUTORFLOW_DATA_DIR?.trim() ||
  path.join(process.cwd(), ".tutorflow", "demo");

const server = spawn(process.execPath, [nextCli, "dev", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    TUTORFLOW_DATA_DIR: dataDirectory,
    NEXT_PUBLIC_SUPABASE_URL: "",
    SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_PUBLISHABLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    SUPABASE_ANON_KEY: "",
  },
  stdio: "inherit",
});

server.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});

server.on("error", (error) => {
  console.error("Nie udało się uruchomić lokalnego trybu demo.", error);
  process.exitCode = 1;
});
