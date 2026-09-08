const { test } = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { selectSetupPort } = require("../electron/setup-port.cjs");

test("an occupied legacy port is not stopped or reused; fallback binds loopback", async () => {
  const owner = net.createServer();
  await new Promise((resolve, reject) => { owner.once("error", reject); owner.listen(0, "127.0.0.1", resolve); });
  try {
    const occupied = owner.address().port;
    const selected = await selectSetupPort(occupied);
    assert.ok(selected > 0 && selected !== occupied);
    assert.equal(owner.listening, true);
    assert.equal(await selectSetupPort(selected), selected);
  } finally { await new Promise(resolve => owner.close(resolve)); }
});
