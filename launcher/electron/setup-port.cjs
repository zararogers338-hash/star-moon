const net = require("node:net");

// First-time Star Moon installs must not take the legacy bridge's 17841 port.
// This is an availability probe, not a reservation: setup still checks/binds the
// selected port transactionally and fails safely if another process wins a race.
async function selectSetupPort(preferred = 17842) {
  const probe = (port) => new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port, exclusive: true }, () => {
      const selected = server.address().port;
      server.close(error => error ? reject(error) : resolve(selected));
    });
  });
  try { return await probe(preferred); }
  catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    return probe(0);
  }
}

module.exports = { selectSetupPort };
