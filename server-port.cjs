const path = require("path");
const dotenv = require("dotenv");

function resolvePort(fileEnv = {}, processEnv = process.env) {
  const value = fileEnv.PORT ?? processEnv.PORT ?? "8080";
  if (!/^\d+$/.test(String(value)) || !Number.isInteger(Number(value)) || Number(value) < 1 || Number(value) > 65535) {
    throw new Error("Invalid PORT: set PORT in .env to an integer between 1 and 65535.");
  }
  return Number(value);
}

const fileEnv = dotenv.config({ path: path.join(__dirname, ".env"), override: false }).parsed || {};
module.exports = { PORT: resolvePort(fileEnv), resolvePort };
