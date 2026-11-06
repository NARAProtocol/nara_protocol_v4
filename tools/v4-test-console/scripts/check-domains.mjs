async function checkDomain(domain) {
  try {
    const res = await fetch(`https://${domain}`, { redirect: "manual" });
    console.log(`[${domain}] Status:`, res.status, "Location:", res.headers.get("location"), "Server:", res.headers.get("server"));
  } catch (err) {
    console.log(`[${domain}] Error:`, err.message);
  }
}

async function run() {
  await checkDomain("naraprotocol.io");
  await checkDomain("www.naraprotocol.io");
  await checkDomain("app.naraprotocol.io");
  await checkDomain("console.naraprotocol.io");
  await checkDomain("preview.naraprotocol.io");
}

run();
