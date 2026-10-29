import fs from "node:fs";
import path from "node:path";
import { CONFIG_DIR } from "./paths.js";

const SECRETS_FILE = path.join(CONFIG_DIR, "secrets.json");

function loadSecrets() {
  if (!fs.existsSync(SECRETS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8"));
  } catch (err) {
    console.error(`Could not parse secrets file at ${SECRETS_FILE}: ${err.message}`);
    return {};
  }
}

const secrets = loadSecrets();

export function getSecret(key) {
  return secrets[key] || process.env[key] || "";
}
