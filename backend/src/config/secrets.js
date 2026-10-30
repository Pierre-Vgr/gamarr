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

export function getSecret(key) {
  return loadSecrets()[key] || process.env[key] || "";
}

export function getAllSecrets() {
  return loadSecrets();
}

export function hasSecretsFile() {
  return fs.existsSync(SECRETS_FILE);
}

export function updateSecrets(partial) {
  const updated = { ...loadSecrets(), ...partial };
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(SECRETS_FILE, JSON.stringify(updated, null, 2));
  return updated;
}
