async function checkDomain(domain) {
  try {
    const res = await fetch(`https://${domain}`, { redirect: "manual" });
    console.log(`[${domain}] Status:`, res.status, "Location:", res.headers.get("location"), "Server:", res.headers.get("server"));
  } catch (err) {
    console.log(`[${domain}] Error:`, err.message);
  }
}

async function run() {
  await checkDomain("naraprotocol.com");
  await checkDomain("www.naraprotocol.com");
  await checkDomain("app.naraprotocol.com");
  await checkDomain("console.naraprotocol.com");
  await checkDomain("preview.naraprotocol.com");
}

run();
