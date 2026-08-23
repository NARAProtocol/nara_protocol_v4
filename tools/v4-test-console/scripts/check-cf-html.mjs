async function check() {
  const res = await fetch("https://nara-v4-console-preview.pages.dev");
  const html = await res.text();
  console.log("Status:", res.status);
  console.log("HTML length:", html.length);
  const match = html.match(/src="(\/assets\/[^"]+)"/g);
  console.log("Scripts:", match);
}

check().catch(console.error);
