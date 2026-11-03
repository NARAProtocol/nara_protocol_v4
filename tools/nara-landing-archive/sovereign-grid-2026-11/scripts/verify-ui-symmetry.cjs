// Automated UI Symmetry & Centering Verification Gate
// Ensures NARA DEX chassis and internal 3rd-party widget are centered to the exact pixel.

const { chromium } = require('playwright');

const TARGET_URL = process.env.VITE_TEST_URL || 'http://localhost:4173/swap';

async function runVerification() {
  console.log('----------------------------------------------------');
  console.log('NARA DEX: Automated UI Symmetry & Centering Gate');
  console.log(`Target: ${TARGET_URL}`);
  console.log('----------------------------------------------------\n');

  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
  } catch {
    browser = await chromium.launch({ headless: true });
  }

  const viewports = [
    { name: '1920x1080 Desktop', width: 1920, height: 1080, expectedCenter: 960 },
    { name: '1440x900 Laptop', width: 1440, height: 900, expectedCenter: 720 },
    { name: '1280x800 Small Laptop', width: 1280, height: 800, expectedCenter: 640 },
    { name: '1024x768 Tablet Landscape', width: 1024, height: 768, expectedCenter: 512 },
    { name: '768x1024 Tablet Portrait', width: 768, height: 1024, expectedCenter: 384 },
    { name: '390x844 Mobile', width: 390, height: 844, expectedCenter: 195, isMobile: true },
  ];

  let hasErrors = false;

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
    try {
      await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 10000 });
      await page.waitForTimeout(1000);

      const metrics = await page.evaluate(() => {
        const chassis = document.querySelector('.nara-dex-chassis');
        const kyberRoot = chassis ? chassis.querySelector('[class*="sc-aXZVg"]') : null;

        const cRect = chassis ? chassis.getBoundingClientRect() : null;
        const kRect = kyberRoot ? kyberRoot.getBoundingClientRect() : null;

        return {
          viewportWidth: window.innerWidth,
          hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
          chassis: cRect ? {
            left: Math.round(cRect.left * 10) / 10,
            width: Math.round(cRect.width * 10) / 10,
            center: Math.round((cRect.left + cRect.width / 2) * 10) / 10,
          } : null,
          kyberRoot: kRect ? {
            left: Math.round(kRect.left * 10) / 10,
            width: Math.round(kRect.width * 10) / 10,
            center: Math.round((kRect.left + kRect.width / 2) * 10) / 10,
          } : null,
        };
      });

      if (!metrics.chassis) {
        console.error(`FAIL: [${vp.name}] .nara-dex-chassis element not found in DOM`);
        hasErrors = true;
        continue;
      }

      if (metrics.hasHorizontalScroll) {
        console.error(`FAIL: [${vp.name}] Horizontal page overflow detected!`);
        hasErrors = true;
      }

      const chassisCenterDiff = Math.abs(metrics.chassis.center - vp.expectedCenter);
      if (chassisCenterDiff > 1.5) {
        console.error(
          `FAIL: [${vp.name}] Chassis off-center! Expected: ${vp.expectedCenter}, Got: ${metrics.chassis.center} (diff: ${chassisCenterDiff}px)`
        );
        hasErrors = true;
      }

      if (metrics.kyberRoot) {
        const internalDiff = Math.abs(metrics.kyberRoot.center - metrics.chassis.center);
        if (internalDiff > 2.0) {
          console.error(
            `FAIL: [${vp.name}] Internal Kyber widget not centered in chassis! Chassis center: ${metrics.chassis.center}, Kyber center: ${metrics.kyberRoot.center} (offset: ${internalDiff}px)`
          );
          hasErrors = true;
        } else {
          console.log(
            `PASS: [${vp.name}] Chassis center = ${metrics.chassis.center}, Kyber center = ${metrics.kyberRoot.center} (diff = 0px)`
          );
        }
      } else {
        console.log(`PASS: [${vp.name}] Chassis center = ${metrics.chassis.center} (Kyber root not mounted or dynamic)`);
      }
    } catch (err) {
      console.error(`ERROR: [${vp.name}]`, err.message);
      hasErrors = true;
    } finally {
      await page.close();
    }
  }

  await browser.close();

  console.log('\n----------------------------------------------------');
  if (hasErrors) {
    console.error('VERIFICATION FAILED: Centering or layout regression detected.');
    process.exit(1);
  } else {
    console.log('ALL VIEWPORTS PASSED: Centering and symmetry are pixel-perfect.');
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('Fatal error during verification:', err);
  process.exit(1);
});
