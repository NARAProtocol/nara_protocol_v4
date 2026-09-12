export interface TokenInfo {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
  logoURI: string;
  chainId: number;
  isImport?: boolean;
}

export const NARA_TOKEN_ADDRESS = "0xB6333F5D4cEd8dffA80F3F13697D6aA3BB3f19c1";
export const ETH_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
export const USDC_TOKEN_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const WETH_TOKEN_ADDRESS = "0x4200000000000000000000000000000000000006";
export const CBBTC_TOKEN_ADDRESS = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf";

export const BASE_CHAIN_ID = 8453;

export const NARA_BASE_TOKENS: TokenInfo[] = [
  {
    name: "NARA",
    symbol: "NARA",
    address: NARA_TOKEN_ADDRESS,
    decimals: 18,
    logoURI: "/nara-circle-256.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Ethereum",
    symbol: "ETH",
    address: ETH_TOKEN_ADDRESS,
    decimals: 18,
    logoURI: "/tokens/eth.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "USD Coin",
    symbol: "USDC",
    address: USDC_TOKEN_ADDRESS,
    decimals: 6,
    logoURI: "/tokens/usdc.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Wrapped Ether",
    symbol: "WETH",
    address: WETH_TOKEN_ADDRESS,
    decimals: 18,
    logoURI: "/tokens/weth.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Coinbase Wrapped BTC",
    symbol: "cbBTC",
    address: CBBTC_TOKEN_ADDRESS,
    decimals: 8,
    logoURI: "/tokens/cbbtc.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Aerodrome",
    symbol: "AERO",
    address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631",
    decimals: 18,
    logoURI: "/tokens/aero.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Dai Stablecoin",
    symbol: "DAI",
    address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    decimals: 18,
    logoURI: "/tokens/dai.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Degen",
    symbol: "DEGEN",
    address: "0x4ed4E862860be51a91bD929d2c80772e5002b85e",
    decimals: 18,
    logoURI: "/tokens/degen.png",
    chainId: BASE_CHAIN_ID,
  },
  {
    name: "Virtual Protocol",
    symbol: "VIRTUAL",
    address: "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b",
    decimals: 18,
    logoURI: "/tokens/virtual.png",
    chainId: BASE_CHAIN_ID,
  },
];

export const MULTI_CHAIN_TOKENS: Record<number, TokenInfo[]> = {
  8453: NARA_BASE_TOKENS,
  1: [
    {
      name: "Ethereum",
      symbol: "ETH",
      address: ETH_TOKEN_ADDRESS,
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
      chainId: 1,
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
      chainId: 1,
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      chainId: 1,
    },
    {
      name: "Wrapped Bitcoin",
      symbol: "WBTC",
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      decimals: 8,
      logoURI: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
      chainId: 1,
    },
    {
      name: "Dai Stablecoin",
      symbol: "DAI",
      address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/9956/small/Badge_Dai.png",
      chainId: 1,
    },
    {
      name: "Uniswap",
      symbol: "UNI",
      address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/12504/small/uniswap-uni.png",
      chainId: 1,
    },
  ],
  42161: [
    {
      name: "Ethereum",
      symbol: "ETH",
      address: ETH_TOKEN_ADDRESS,
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
      chainId: 42161,
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
      chainId: 42161,
    },
    {
      name: "Arbitrum",
      symbol: "ARB",
      address: "0x912CE59144191C1204E64559FE8253a0e49E6548",
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/16547/small/arbitrum.png",
      chainId: 42161,
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      chainId: 42161,
    },
    {
      name: "Wrapped BTC",
      symbol: "WBTC",
      address: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
      decimals: 8,
      logoURI: "https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png",
      chainId: 42161,
    },
  ],
  10: [
    {
      name: "Ethereum",
      symbol: "ETH",
      address: ETH_TOKEN_ADDRESS,
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
      chainId: 10,
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
      chainId: 10,
    },
    {
      name: "Optimism",
      symbol: "OP",
      address: "0x4200000000000000000000000000000000000042",
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/25244/small/Optimism.png",
      chainId: 10,
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      chainId: 10,
    },
  ],
  137: [
    {
      name: "Polygon Ecosystem Token",
      symbol: "POL",
      address: ETH_TOKEN_ADDRESS,
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/4713/small/polygon.png",
      chainId: 137,
    },
    {
      name: "USD Coin",
      symbol: "USDC",
      address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
      chainId: 137,
    },
    {
      name: "Tether USD",
      symbol: "USDT",
      address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      decimals: 6,
      logoURI: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      chainId: 137,
    },
    {
      name: "Wrapped Ether",
      symbol: "WETH",
      address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      decimals: 18,
      logoURI: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
      chainId: 137,
    },
  ],
};

export function getTokensForChain(chainId: number): TokenInfo[] {
  return MULTI_CHAIN_TOKENS[chainId] || NARA_BASE_TOKENS;
}
