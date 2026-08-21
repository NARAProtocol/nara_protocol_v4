import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const rpc = process.env.BASE_MAINNET_RPC_URL || process.env.BASE_RPC_URL || "https://mainnet.base.org";
const provider = new ethers.JsonRpcProvider(rpc);
const tokenAddr = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";

const abi = [
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)"
];

const token = new ethers.Contract(tokenAddr, abi, provider);

interface AccountTarget {
  name: string;
  address: string;
  category: string;
  description: string;
  whyHoldsSupply: string;
}

const TARGETS: AccountTarget[] = [
  {
    name: "NARARewardReserve",
    address: "0x8369CEf28128A4B24Bc5ed52aA6196D92D563F2f",
    category: "Sealed Emission Custody Contract",
    description: "Sealed time-lock vault dedicated exclusively to epoch emissions.",
    whyHoldsSupply: "Holds 650,000 NARA (65.0% of supply). It can NEVER be drained or swept by admin. Only the NARAEngine smart contract can pull tokens epoch-by-epoch for distribution to locked position holders."
  },
  {
    name: "Protocol Treasury",
    address: "0xfe3A8678A9c729438BB11718bD1391E7Ab491E8e",
    category: "Multisig Controlled Cold Treasury",
    description: "Protocol Strategic Treasury & Staging Reserve.",
    whyHoldsSupply: "Holds ~253,529 NARA (~25.35% of supply). Designated for upcoming Bond Depository capital formation (200k-250k NARA), future Category Basket liquidity, and strategic reserves."
  },
  {
    name: "Uniswap v4 PoolManager",
    address: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    category: "Uniswap v4 Core AMM Pool Contract",
    description: "Uniswap v4 singleton contract holding all pool liquidity tokens on Base.",
    whyHoldsSupply: "Holds ~88,000+ NARA in active DEX liquidity for the canonical NARA/USDC pool (PoolId 0x83edc...). Anyone trading NARA on DEX swaps against this liquidity."
  },
  {
    name: "NARAEngine",
    address: "0x98ab6406D6B548F37dEF7110961bb45A399e5aFC",
    category: "Core Locking & Yield Allocation Engine",
    description: "Heart of the protocol yield engine (manages 15-min epochs, duration multipliers up to 4x/10x, rewards).",
    whyHoldsSupply: "Holds ~5,249 NARA (0.52% of supply). Contains user-locked tokens that are actively earning yield, plus pending emission drips waiting to be claimed by stakers/lockers."
  },
  {
    name: "NARALiquidityCompounderV4",
    address: "0xfeFcc45C0454D022586eaA8a5c51BD25DCe713DF",
    category: "POL Flywheel & Remainder Bank",
    description: "Permanent Protocol-Owned Liquidity (POL) compounding manager.",
    whyHoldsSupply: "Holds full-range LP NFT #2898486 (~10.05% of pool liquidity) and temporarily banks un-matched fee remainders (e.g. ~2 NARA remainder after compounding) until matching USDC arrives."
  },
  {
    name: "NARALiquidityGrowthVault",
    address: "0xD7f7b44BF65EBa3E90fDe0642687ed22A323084D",
    category: "Dynamic Fee Accumulation Vault",
    description: "Collects dynamic hook fees (3-12% buy, 5-20% sell) from Uniswap v4 swaps.",
    whyHoldsSupply: "Holds incoming trading fee inventory between compounding cycles. Once compound() is called, inventory moves to the Compounder to mint permanent POL."
  },
  {
    name: "Production Safe Multisig",
    address: "0xd65c0e390Dc187A22c52c03816591CC736C0D755",
    category: "Governance & Operations Admin (3-of-n Safe)",
    description: "Core multisig governing timelocked parameters, owned contracts, and LP NFT #2898124.",
    whyHoldsSupply: "Holds seed LP NFT #2898124 and fractional dust from routing/reconciliation tests. Has zero active unlocked float."
  },
  {
    name: "Deployer / Launcher",
    address: "0xb8CF0274d0Fb2dB2Ba5dC58b0Ab378F3b8f35BA2",
    category: "One-Shot Immutable Factory",
    description: "One-shot atomic deployer contract.",
    whyHoldsSupply: "Holds 0 NARA. Forwarded 100% of supply to Treasury on genesis launch."
  }
];

async function main() {
  console.log("Checking NARA Token details on Base...\n");
  const [total, name, symbol, dec] = await Promise.all([
    token.totalSupply(),
    token.name(),
    token.symbol(),
    token.decimals()
  ]);

  console.log(`Token: ${name} ($${symbol})`);
  console.log(`Contract: ${tokenAddr}`);
  console.log(`Total Supply: ${ethers.formatUnits(total, dec)} ${symbol}\n`);

  console.log("=".repeat(110));
  console.log("DETAILED AUDIT OF ON-CHAIN TOKEN HOLDERS (BASESCAN 'HOLDERS' TAB EXPLANATION)");
  console.log("=".repeat(110));

  let accounted = 0n;
  for (let i = 0; i < TARGETS.length; i++) {
    const t = TARGETS[i];
    try {
      const bal = await token.balanceOf(t.address);
      const code = await provider.getCode(t.address);
      const isContract = code !== "0x";
      accounted += bal;
      const pct = (Number(bal * 1000000n / total) / 10000).toFixed(4);
      const formattedBal = parseFloat(ethers.formatUnits(bal, dec)).toLocaleString("en-US", {
        minimumFractionDigits: 4,
        maximumFractionDigits: 6
      });

      console.log(`\n[#${i + 1}] ${t.name.toUpperCase()}`);
      console.log(`    Address:     ${t.address} ${isContract ? "(📜 Smart Contract on Basescan)" : "(👤 Wallet / Safe)"}`);
      console.log(`    Role / Type: ${t.category}`);
      console.log(`    Balance:     ${formattedBal} NARA (${pct}% of Total Supply)`);
      console.log(`    Purpose:     ${t.whyHoldsSupply}`);
    } catch (e: any) {
      console.log(`Error for ${t.name}:`, e.message);
    }
  }

  console.log("\n" + "=".repeat(110));
  const poolManagerBal = await token.balanceOf("0x498581fF718922c3f8e6A244956aF099B2652b2b");
  console.log(`Total accounted across top protocol contracts & liquidity: ${ethers.formatUnits(accounted, dec)} NARA`);
  console.log("=".repeat(110));
}

main().catch(console.error);
