import { chromium } from "playwright";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  
  console.log("Navigating to http://localhost:4174...");
  await page.goto("http://localhost:4174", { waitUntil: "networkidle" });
  
  // Click on the NFTs Tab in the nav
  await page.locator("nav.tabs button:has-text('NFTs')").click();
  await page.waitForTimeout(3000);
  
  const screenshotPath = "c:/Users/linas/.gemini/antigravity/brain/734e74a5-802d-4d9d-b67b-b10590ac951c/live_console_nft_tab.png";
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Saved screenshot to ${screenshotPath}`);
  
  await browser.close();
}

run().catch(console.error);
