import { ethers } from "ethers";
import fs from "node:fs";

const dotenv = fs.readFileSync(".env", "utf8");
const rpcLine = dotenv.split("\n").find((l) => l.startsWith("BASE_MAINNET_RPC_URL=") || l.startsWith("BASE_RPC_URL="));
const rpc = rpcLine.split("=")[1].trim();
const provider = new ethers.JsonRpcProvider(rpc, 8453, { staticNetwork: true, batchMaxCount: 1 });

const NFT_ADDR = "0xCcBD8c59664958636369F8fe24B927aEBc3DF7cC";
const NFT_ABI = ["function tokenURI(uint256 tokenId) view returns (string)"];

async function main() {
  const nft = new ethers.Contract(NFT_ADDR, NFT_ABI, provider);
  const uri = await nft.tokenURI(3);
  const jsonStr = Buffer.from(uri.replace("data:application/json;base64,", ""), "base64").toString("utf8");
  const metadata = JSON.parse(jsonStr);
  const svg = Buffer.from(metadata.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
  fs.writeFileSync("token3_live.svg", svg, "utf8");
  console.log("Written token3_live.svg (Length:", svg.length, ")");
}

main().catch(console.error);
