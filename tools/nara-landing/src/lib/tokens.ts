/**
 * Swap widget token list — pins match GRID_ADDRESSES / live Base.
 */
import { GRID_ADDRESSES, BASE_CHAIN_ID as GRID_BASE_CHAIN_ID } from "./gridContracts";

export const BASE_CHAIN_ID = GRID_BASE_CHAIN_ID;

export const NARA_TOKEN_ADDRESS = GRID_ADDRESSES.naraToken;
export const USDC_TOKEN_ADDRESS = GRID_ADDRESSES.usdc;
/** Native ETH sentinel used by Kyber widget. */
export const ETH_TOKEN_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

export type TokenInfo = {
  address: string;
  chainId: number;
  decimals: number;
  symbol: string;
  name: string;
  logoURI: string;
};

export const NARA_BASE_TOKENS: TokenInfo[] = [
  {
    address: ETH_TOKEN_ADDRESS,
    chainId: BASE_CHAIN_ID,
    decimals: 18,
    symbol: "ETH",
    name: "Ether",
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png",
  },
  {
    address: USDC_TOKEN_ADDRESS,
    chainId: BASE_CHAIN_ID,
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
    logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  },
  {
    address: NARA_TOKEN_ADDRESS,
    chainId: BASE_CHAIN_ID,
    decimals: 18,
    symbol: "NARA",
    name: "NARA",
    logoURI: "/nara-token-icon.svg",
  },
];
