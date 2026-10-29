import fs from "node:fs";

const SECRETS_FILE = process.env.SECRETS_FILE || "/run/secrets/gamarr-secrets.json";

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
