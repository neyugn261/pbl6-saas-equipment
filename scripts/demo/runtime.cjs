const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const net = require("node:net");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "../..");
const names = [
  "identity",
  "organization",
  "asset",
  "service-request",
  "workorder",
  "maintenance",
  "inventory",
  "notification",
];
const prefix = (name) => name.replaceAll("-", "_").toUpperCase();
const req = (name) =>
  createRequire(
    path.join(
      root,
      "apps",
      name === "gateway" ? "api-gateway" : name + "-service",
      "package.json",
    ),
  );
const identity = req("identity");
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function run(args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`pnpm ${args.join(" ")} failed (${code})`)),
    );
  });
}
async function freePort() {
  const s = net.createServer();
  await new Promise((resolve, reject) => {
    s.once("error", reject);
    s.listen(0, "127.0.0.1", resolve);
  });
  const port = s.address().port;
  await new Promise((resolve) => s.close(resolve));
  return port;
}
function targets(env, test = false) {
  assert.ok(
    ["development", "test"].includes(env.NODE_ENV || "development"),
    "Demo tools refuse production/staging",
  );
  const urls = {};
  for (const name of names) {
    const key = prefix(name),
      raw = env[key + (test ? "_TEST_DATABASE_URL" : "_DATABASE_URL")];
    assert.ok(raw, key + " database URL is required");
    const url = new URL(raw),
      expected = key.toLowerCase() + (test ? "_test_db" : "_db");
    assert.ok(
      ["postgres:", "postgresql:"].includes(url.protocol),
      "PostgreSQL URL required",
    );
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]", "postgres"].includes(url.hostname),
      "Demo reset/seed accepts local databases only",
    );
    assert.equal(
      decodeURIComponent(url.pathname.slice(1)),
      expected,
      `Refusing unexpected database for ${name}`,
    );
    urls[name] = raw;
  }
  return urls;
}
class DemoRuntime {
  constructor(options = {}) {
    identity("dotenv").config({ path: path.join(root, ".env"), quiet: true });
    this.options = options;
    this.urls = targets(process.env, options.test);
    this.fingerprint = createHash("sha256")
      .update(JSON.stringify(this.urls))
      .digest("hex")
      .slice(0, 16);
    this.stateFile = path.join(
      root,
      ".local",
      "demo",
      this.fingerprint + ".json",
    );
    this.state = fs.existsSync(this.stateFile)
      ? JSON.parse(fs.readFileSync(this.stateFile, "utf8"))
      : {};
    this.apps = {};
    this.dbs = {};
    this.ports = {};
    const original = new URL(process.env.RABBITMQ_URL || "");
    assert.ok(
      ["localhost", "127.0.0.1", "[::1]", "rabbitmq"].includes(
        original.hostname,
      ),
      "Local RabbitMQ is required",
    );
    this.originalVhost = decodeURIComponent(original.pathname.slice(1)) || "/";
    this.vhost = "pbl6-demo-" + this.fingerprint;
    this.management =
      process.env.RABBITMQ_MANAGEMENT_URL ||
      `http://${original.hostname}:15672`;
    this.authorization =
      "Basic " +
      Buffer.from(
        decodeURIComponent(original.username) +
          ":" +
          decodeURIComponent(original.password),
      ).toString("base64");
    this.brokerUser = decodeURIComponent(original.username);
    original.pathname = "/" + this.vhost;
    this.broker = original.toString();
  }
  save() {
    fs.mkdirSync(path.dirname(this.stateFile), { recursive: true });
    fs.writeFileSync(
      this.stateFile + ".tmp",
      JSON.stringify(this.state, null, 2),
    );
    fs.renameSync(this.stateFile + ".tmp", this.stateFile);
  }
  async managementCall(method, route, body) {
    const response = await fetch(this.management + "/api" + route, {
      method,
      headers: {
        authorization: this.authorization,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    assert.ok(
      response.ok,
      `RabbitMQ management ${method} ${route}: ${response.status}`,
    );
    const raw = await response.text();
    return raw ? JSON.parse(raw) : null;
  }
  async preflight() {
    assert.ok(
      process.env.SEED_DEMO_PASSWORD?.length >= 8,
      "Set SEED_DEMO_PASSWORD (8+ characters) in .env",
    );
    assert.ok(
      process.env.JWT_ACCESS_SECRET?.length >= 32 &&
        !process.env.JWT_ACCESS_SECRET.includes("CHANGE_ME"),
      "Set JWT_ACCESS_SECRET in .env",
    );
    const { Client } = identity("pg");
    // Validate every target before touching any of them.
    for (const name of names) {
      const db = new Client({ connectionString: this.urls[name] });
      await db.connect();
      try {
        const { rows } = await db.query("SELECT current_database() AS name");
        assert.equal(rows[0].name, new URL(this.urls[name]).pathname.slice(1));
        if (this.options.reset) {
          const active = await db.query(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()",
          );
          assert.equal(
            active.rows[0].n,
            0,
            `Stop backend/test processes connected to ${name} before demo:reset`,
          );
        }
      } finally {
        await db.end();
      }
    }
    await this.managementCall("GET", "/whoami");
    for (const key of [
      "MINIO_ENDPOINT",
      "MINIO_ACCESS_KEY",
      "MINIO_SECRET_KEY",
      "MINIO_REGION",
      "MINIO_PUBLIC_ENDPOINT",
    ])
      assert.ok(process.env[key], key + " is required for demo report files");
    const minioHealth = await fetch(
      `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || "9000"}/minio/health/live`,
      { signal: AbortSignal.timeout(10000) },
    );
    assert.ok(minioHealth.ok, "Start MinIO before seeding");
    await this.managementCall(
      "PUT",
      "/vhosts/" + encodeURIComponent(this.vhost),
      {},
    );
    await this.managementCall(
      "PUT",
      "/permissions/" +
        encodeURIComponent(this.vhost) +
        "/" +
        encodeURIComponent(this.brokerUser),
      { configure: ".*", write: ".*", read: ".*" },
    );
    this.lock = new Client({ connectionString: this.urls.identity });
    await this.lock.connect();
    const locked = await this.lock.query(
      "SELECT pg_try_advisory_lock(hashtext('pbl6-demo-seed')) AS acquired",
    );
    assert.ok(locked.rows[0].acquired, "Another demo seed is already running");
  }
  async reset() {
    const { Client } = identity("pg");
    // Clear only this project's queues. No other vhost, exchange or database is reset.
    for (const vhost of [
      this.vhost,
      ...(this.options.test ? [] : [this.originalVhost]),
    ]) {
      const queues = await this.managementCall(
        "GET",
        "/queues/" + encodeURIComponent(vhost),
      );
      const own = queues.filter((q) =>
        names.some((n) => q.name.startsWith(n + "-service.")),
      );
      for (const q of own)
        assert.equal(
          q.consumers,
          0,
          `Stop the consumer of ${q.name} before resetting`,
        );
      for (const q of own)
        await this.managementCall(
          "DELETE",
          "/queues/" +
            encodeURIComponent(vhost) +
            "/" +
            encodeURIComponent(q.name) +
            "/contents",
        );
    }
    for (const name of names) {
      const db = new Client({ connectionString: this.urls[name] });
      await db.connect();
      try {
        const { rows } = await db.query(
          "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
        );
        const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
        if (rows.length)
          await db.query(
            "TRUNCATE " +
              rows.map((r) => "public." + quote(r.tablename)).join(", ") +
              " RESTART IDENTITY CASCADE",
          );
        console.log(
          "Cleared application data: " +
            new URL(this.urls[name]).pathname.slice(1),
        );
      } finally {
        await db.end();
      }
    }
    this.state = {};
    this.save();
  }
  async start() {
    for (const name of names)
      process.env[prefix(name) + "_DATABASE_URL"] = this.urls[name];
    Object.assign(process.env, {
      NODE_ENV: "development",
      RABBITMQ_URL: this.broker,
      MAINTENANCE_SCHEDULER_ENABLED: "false",
      LOGIN_RATE_LIMIT: "1000",
      WORKORDER_ATTACHMENTS_ENABLED: "true",
      WORKORDER_ATTACHMENT_WORKER_ENABLED: "false",
      LOG_LEVEL: "error",
      // This local uploader signs a fresh ticket for the internal origin; no signed URL is rewritten.
      // Normal browser/mobile runtime continues to use the user's .env public origin.
      MINIO_PUBLIC_ENDPOINT: `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || "9000"}`,
    });
    for (const name of [...names, "gateway"]) {
      this.ports[name] = await freePort();
      process.env[prefix(name) + "_SERVICE_URL"] =
        `http://127.0.0.1:${this.ports[name]}`;
    }
    const { NestFactory } = identity("@nestjs/core");
    const { configureApp } = identity("@pbl6/service-kit");
    for (const name of [...names, "gateway"]) {
      const r = req(name),
        folder = name === "gateway" ? "api-gateway" : name + "-service";
      const { AppModule } = r(
        path.join(root, "apps", folder, "dist/app.module.js"),
      );
      const app = await NestFactory.create(AppModule, {
        logger: ["error"],
        abortOnError: false,
      });
      configureApp(app);
      await app.listen(this.ports[name], "127.0.0.1");
      this.apps[name] = app;
      if (name !== "gateway")
        this.dbs[name] = app.get(
          r(path.join(root, "apps", folder, "dist/prisma/prisma.service.js"))
            .PrismaService,
        );
    }
    this.base = `http://127.0.0.1:${this.ports.gateway}`;
    this.state.date ||= new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date());
    process.env.DEMO_SEED_DATE = this.state.date;
    this.save();
  }
  async api(method, route, token, body, status = 200, headers = {}) {
    const response = await fetch(this.base + route, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: "Bearer " + token } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20000),
    }).catch((error) => {
      throw new Error(
        `${method} ${route}: connection failed (${error.cause?.code || error.name})`,
      );
    });
    const result = await response.json().catch(() => null);
    assert.ok(
      (Array.isArray(status) ? status : [status]).includes(response.status),
      `${method} ${route}: ${response.status} ${result?.code || ""} ${result?.message || ""}`,
    );
    return result;
  }
  async wait(predicate, label, ms = 30000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await pause(200);
    }
    throw new Error("Timed out: " + label);
  }
  async idle() {
    let stable = 0;
    await this.wait(
      async () => {
        const queues = await this.managementCall(
          "GET",
          "/queues/" + encodeURIComponent(this.vhost),
        );
        assert.ok(
          !queues.some((q) => q.name.endsWith(".dlq") && q.messages > 0),
          "Demo broker has failed events; inspect its DLQ before retrying",
        );
        const pending = await Promise.all(
          Object.values(this.dbs)
            .filter((db) => db.outboxEvent)
            .map((db) =>
              db.outboxEvent.count({ where: { status: "PENDING" } }),
            ),
        );
        const busy =
          pending.some((n) => n > 0) || queues.some((q) => q.messages > 0);
        stable = busy ? 0 : stable + 1;
        return stable >= 5;
      },
      "outbox and consumers to settle",
      45000,
    );
  }
  async close() {
    for (const app of Object.values(this.apps).reverse()) await app.close();
    await this.lock?.end();
  }
}
module.exports = { DemoRuntime, root, names, req, run, targets, pause };
