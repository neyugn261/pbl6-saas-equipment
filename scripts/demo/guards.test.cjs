const { test } = require("node:test");
const assert = require("node:assert/strict");
const { names, targets } = require("./runtime.cjs");
function env() {
  return Object.fromEntries([
    ["NODE_ENV", "development"],
    ...names.flatMap((name) => {
      const key = name.replaceAll("-", "_").toUpperCase(),
        db = key.toLowerCase();
      return [
        [
          key + "_DATABASE_URL",
          `postgresql://user:password@localhost/${db}_db`,
        ],
        [
          key + "_TEST_DATABASE_URL",
          `postgresql://user:password@localhost/${db}_test_db`,
        ],
      ];
    }),
  ]);
}
test("selects exactly eight development targets or eight dedicated test targets", () => {
  assert.equal(Object.keys(targets(env())).length, 8);
  assert.ok(
    Object.values(targets(env(), true)).every((u) =>
      new URL(u).pathname.endsWith("_test_db"),
    ),
  );
});
test("rejects production and staging before any database access", () => {
  for (const NODE_ENV of ["production", "staging"])
    assert.throws(() => targets({ ...env(), NODE_ENV }));
});
test("rejects remote database hosts and unexpected local database names", () => {
  for (const url of [
    "postgresql://user:password@remote.example/identity_db",
    "postgresql://user:password@localhost/other_db",
  ])
    assert.throws(() => targets({ ...env(), IDENTITY_DATABASE_URL: url }));
});
test("test reset refuses a development database even when it is localhost", () => {
  assert.throws(() =>
    targets(
      { ...env(), IDENTITY_TEST_DATABASE_URL: env().IDENTITY_DATABASE_URL },
      true,
    ),
  );
});
test("a missing target prevents the full operation", () => {
  assert.throws(() => targets({ ...env(), NOTIFICATION_DATABASE_URL: "" }));
});
