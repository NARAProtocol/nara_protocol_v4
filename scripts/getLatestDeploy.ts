import hre from "hardhat";

async function main() {
  const connection = await hre.network.connect();
  const { ethers } = connection;
  const deployer = (await ethers.getSigners())[0];
  const nonce = await ethers.provider.getTransactionCount(deployer.address);
  
  // The last tx is the LottoPool deployment. The tx before that is LockAccount deployment.
  // Unfortunately, ethers doesn't allow easy "getTransactionByNonce".
  // Let's just grab the last few txs if we can, or since it's Base, we can't easily query by account without an indexer.
  
  // But wait! If we have the Basescan API key in .env, we can just query the API.
  const api = process.env.BASESCAN_API_KEY;
  if (!api) throw new Error("No API");
  
  const res = await fetch(`https://api.basescan.org/api?module=account&action=txlist&address=${deployer.address}&startblock=0&endblock=99999999&page=1&offset=5&sort=desc&apikey=${api}`);
  const data = await res.json();
  const txs = data.result;
  
  console.log("Latest TXs:");
  for (const t of txs) {
    if (t.contractAddress) {
      console.log(`Deployed: ${t.contractAddress} in TX: ${t.hash}`);
    }
  }
}

main().catch(console.error);
