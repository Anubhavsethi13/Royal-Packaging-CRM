import assert from "node:assert/strict";
import test from "node:test";

import {
  ConfigurationError,
  loadConfig
} from "../packages/config/src/index.js";

const validEnvironment = {
  NODE_ENV: "test",
  SERVER_HOST: "127.0.0.1",
  SERVER_PORT: "3000",
  DATABASE_URL: "postgresql://royal:secret@localhost:5432/royal_packaging",
  SESSION_SECRET: "test-session-secret-with-at-least-thirty-two-characters",
  LOG_LEVEL: "info",
  LOG_FORMAT: "json"
};

test("loads validated configuration and defaults optional realtime settings", () => {
  const config = loadConfig(validEnvironment);

  assert.equal(config.NODE_ENV, "test");
  assert.equal(config.SERVER_PORT, 3000);
  assert.equal(config.FLOOT_ENDPOINT, undefined);
  assert.equal(config.FLOOT_API_KEY, undefined);
});

test("rejects missing required configuration", () => {
  const environmentWithoutDatabase = Object.fromEntries(
    Object.entries(validEnvironment).filter(([key]) => key !== "DATABASE_URL")
  );

  assert.throws(
    () => loadConfig(environmentWithoutDatabase),
    ConfigurationError
  );
});

test("rejects a partial Floot configuration", () => {
  assert.throws(
    () =>
      loadConfig({
        ...validEnvironment,
        FLOOT_ENDPOINT: "https://realtime.example.test"
      }),
    ConfigurationError
  );
});

test("supports PORT environment variable with precedence over SERVER_PORT and default", () => {
  const envWithPort = {
    ...validEnvironment,
    PORT: "8080",
    SERVER_PORT: "3000"
  };
  const config = loadConfig(envWithPort);
  assert.equal(config.SERVER_PORT, 8080);

  const envWithoutPorts: NodeJS.ProcessEnv = {
    ...validEnvironment,
    SERVER_PORT: undefined,
    PORT: undefined
  };
  const defaultConfig = loadConfig(envWithoutPorts);
  assert.equal(defaultConfig.SERVER_PORT, 3000);
});

test("supports HOST environment variable with default 0.0.0.0 for production reverse proxies", () => {
  const envWithoutHost: NodeJS.ProcessEnv = {
    ...validEnvironment,
    SERVER_HOST: undefined,
    HOST: undefined
  };
  const config = loadConfig(envWithoutHost);
  assert.equal(config.SERVER_HOST, "0.0.0.0");

  const envWithHost = {
    ...validEnvironment,
    HOST: "0.0.0.0"
  };
  const config2 = loadConfig(envWithHost);
  assert.equal(config2.SERVER_HOST, "0.0.0.0");
});

