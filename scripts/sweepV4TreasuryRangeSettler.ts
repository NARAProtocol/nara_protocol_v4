import "dotenv/config";
import { ethers } from "ethers";
import { readFileSync } from "node:fs";
import { requiredBaseRpcUrl } from "./lib/v4LiveConfig.ts";

const MANAGER_ADDRESS = "0xd58afa5eaB20B0ED287851Cf98f359AdEd58a69C";
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

function tickToHumanUsdcPerNara(tick: number): number {
  return Math.pow(1.0001, -tick) * 1e12;
}

async function main() {
  const rpcUrl = requiredBaseRpcUrl();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const artifact = JSON.parse(readFileSync("artifacts/contracts/v4/NARATreasuryRangeManagerV1.sol/NARATreasuryRangeManagerV1.json", "utf8"));
  const iface = new ethers.Interface(artifact.abi);
  const manager = new ethers.Contract(MANAGER_ADDRESS, artifact.abi, provider);

  console.log("================================================================================");
  console.log("       NARA v4 TREASURY RANGE SETTLEMENT MONITOR & SWEEPER                     ");
  console.log("================================================================================");
  console.log("Target Manager:", MANAGER_ADDRESS);

  const [poolState, orderCount, activeOrderCount] = await Promise.all([
    manager.currentPoolState(),
    manager.orderCount(),
    manager.activeOrderCount(),
  ]);

  const currentTick = Number(poolState.tick);
  const currentPrice = tickToHumanUsdcPerNara(currentTick);

  console.log(`Current Pool Tick: ${currentTick}`);
  console.log(`Current Market Price: $${currentPrice.toFixed(4)} USDC per NARA`);
  console.log(`Total Orders: ${orderCount} | Active Orders in State: ${activeOrderCount}\n`);

  if (Number(orderCount) === 0) {
    console.log("No orders found.");
    return;
  }

  const multicallAbi = ["function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[])"];
  const multicall = new ethers.Contract(MULTICALL3_ADDRESS, multicallAbi, provider);

  const calls = [];
  for (let i = 1; i <= Number(orderCount); i++) {
    calls.push({ target: MANAGER_ADDRESS, allowFailure: false, callData: iface.encodeFunctionData("previewSettlement", [i]) });
    calls.push({ target: MANAGER_ADDRESS, allowFailure: false, callData: iface.encodeFunctionData("getOrder", [i]) });
  }

  const results = await multicall.aggregate3.staticCall(calls);

  const tableData = [];
  const settleableIds: number[] = [];

  for (let i = 0; i < Number(orderCount); i++) {
    const orderId = i + 1;
    const preview = iface.decodeFunctionResult("previewSettlement", results[i * 2].returnData);
    const order = iface.decodeFunctionResult("getOrder", results[i * 2 + 1].returnData)[0];

    const isSell = Number(order.side) === 0;
    const side = isSell ? "SELL_NARA" : "BUY_NARA";
    const tickLower = Number(order.tickLower);
    const tickUpper = Number(order.tickUpper);
    const statusNum = Number(order.status);
    const status = statusNum === 1 ? "ACTIVE" : statusNum === 2 ? "TERMINAL" : statusNum === 3 ? "CANCELLED" : "NONE";

    const priceLower = tickToHumanUsdcPerNara(tickUpper);
    const priceUpper = tickToHumanUsdcPerNara(tickLower);

    const isSettleable = Boolean(preview.settleable);
    if (isSettleable) {
      settleableIds.push(orderId);
    }

    let statusDesc = "";
    if (status === "ACTIVE") {
      if (isSell) {
        if (currentTick > tickUpper) {
          const pct = ((priceLower / currentPrice - 1) * 100).toFixed(1);
          statusDesc = `+${pct}% above spot`;
        } else if (currentTick <= tickLower) {
          statusDesc = "🔥 CROSSED (Settleable)";
        } else {
          statusDesc = "⚡ In Range (Filling)";
        }
      } else {
        if (currentTick < tickLower) {
          const pct = ((1 - priceUpper / currentPrice) * 100).toFixed(1);
          statusDesc = `-${pct}% below spot`;
        } else if (currentTick >= tickUpper) {
          statusDesc = "🔥 CROSSED (Settleable)";
        } else {
          statusDesc = "⚡ In Range (Filling)";
        }
      }
    } else {
      statusDesc = status;
    }

    tableData.push({
      "ID": orderId,
      "Side": side,
      "NFT #": order.tokenId.toString(),
      "Price Range ($USDC)": `$${priceLower.toFixed(4)} - $${priceUpper.toFixed(4)}`,
      "NARA Bal": Number(ethers.formatUnits(preview.principalNara, 18)).toFixed(2),
      "USDC Bal": Number(ethers.formatUnits(preview.principalUsdc, 6)).toFixed(2),
      "Settleable": isSettleable ? "YES" : "NO",
      "Market Position": statusDesc,
    });
  }

  console.table(tableData);

  if (settleableIds.length === 0) {
    console.log("✅ All 12 tactical ranges are active and waiting for market movements.");
    return;
  }

  console.log(`\n🚨 FOUND ${settleableIds.length} SETTLEABLE ORDER(S): [${settleableIds.join(", ")}]`);

  const settlerPk = process.env.SETTLER_PRIVATE_KEY?.trim();
  if (!settlerPk) {
    console.log("SETTLER_PRIVATE_KEY not set. Provide SETTLER_PRIVATE_KEY in .env to auto-settle.");
    return;
  }

  const signer = new ethers.Wallet(settlerPk, provider);
  const gasBal = await provider.getBalance(signer.address);
  console.log(`Settler Signer: ${signer.address} (Balance: ${ethers.formatEther(gasBal)} ETH)`);

  if (gasBal === 0n) {
    console.error("Signer has zero ETH balance for gas.");
    return;
  }

  console.log(`Submitting settleMany([${settleableIds.join(", ")}])...`);
  const managerWithSigner = manager.connect(signer) as any;
  const tx = await managerWithSigner.settleMany(settleableIds);
  console.log("Transaction sent! Hash:", tx.hash);
  const receipt = await tx.wait(2);
  console.log("Settlement Confirmed in block:", receipt.blockNumber);
  console.log("All proceeds have been routed directly to the Dedicated Treasury Safe!");
}

main().catch((err) => {
  console.error("Sweeper error:", err);
  process.exitCode = 1;
});
