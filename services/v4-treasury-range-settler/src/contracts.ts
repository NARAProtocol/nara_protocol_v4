export const RANGE_MANAGER_ABI = [
  "function NARA() view returns(address)",
  "function USDC() view returns(address)",
  "function TREASURY_SAFE() view returns(address)",
  "function LIQUIDITY_VAULT() view returns(address)",
  "function POOL_MANAGER() view returns(address)",
  "function POSITION_MANAGER() view returns(address)",
  "function PERMIT2() view returns(address)",
  "function HOOK() view returns(address)",
  "function POOL_FEE() view returns(uint24)",
  "function TICK_SPACING() view returns(int24)",
  "function POOL_ID() view returns(bytes32)",
  "function DEPLOYMENT_DEADLINE() view returns(uint64)",
  "function MAX_SETTLE_BATCH() view returns(uint256)",
  "function orderCount() view returns(uint256)",
  "function activeOrderCount() view returns(uint256)",
  "function orderCreationPaused() view returns(bool)",
  "function getActiveOrderIds(uint256 offset,uint256 limit) view returns(uint256[] orderIds,uint256 nextOffset)",
  "function getOrder(uint256 orderId) view returns(uint256 tokenId,uint256 inputAmount,uint256 minimumOutputAmount,bytes32 strategyHash,uint128 liquidity,int24 tickLower,int24 tickUpper,uint64 createdBlock,uint64 creationDeadline,uint64 terminalBlock,uint8 side,uint8 status)",
  "function isSettleable(uint256 orderId) view returns(bool)",
  "function previewSettlement(uint256 orderId) view returns(bool,uint256,uint256,uint256)",
  "function currentPoolState() view returns(uint160,int24,uint128,uint24,uint24)",
  "function settle(uint256 orderId) returns(uint256 naraOut,uint256 usdcOut)",
  "function settleMany(uint256[] orderIds) returns(uint256 totalNaraOut,uint256 totalUsdcOut)",
  "function assertOperationalClean() view returns(bool)",
  "event OrderCreated(uint256 indexed orderId,uint256 indexed tokenId,bytes32 indexed strategyHash,uint8 side,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 maximumInputAmount,uint256 inputAmount,uint256 inputRefund,uint256 minimumOutputAmount,uint160 creationSqrtPriceX96,int24 creationTick,uint64 deadline)",
  "event OrderSettled(uint256 indexed orderId,uint256 indexed tokenId,bytes32 indexed strategyHash,uint256 naraOut,uint256 usdcOut,uint160 settlementSqrtPriceX96,int24 settlementTick,uint64 settledBlock)",
  "event OrderCancelled(uint256 indexed orderId,uint256 indexed tokenId,bytes32 indexed strategyHash,uint256 naraOut,uint256 usdcOut,uint64 cancelledBlock)",
  "event UnregisteredPositionQuarantined(uint256 indexed tokenId,address indexed recipient)",
] as const;

export const POOL_MANAGER_SWAP_ABI = [
  "event Swap(bytes32 indexed id,address indexed sender,int128 amount0,int128 amount1,uint160 sqrtPriceX96,uint128 liquidity,int24 tick,uint24 fee)",
] as const;

export const POSITION_MANAGER_ABI = [
  "function ownerOf(uint256 tokenId) view returns(address)",
  "function balanceOf(address owner) view returns(uint256)",
  "function getPositionLiquidity(uint256 tokenId) view returns(uint128)",
  "function poolManager() view returns(address)",
  "function permit2() view returns(address)",
] as const;

export const ERC20_ABI = [
  "function balanceOf(address account) view returns(uint256)",
  "function allowance(address owner,address spender) view returns(uint256)",
] as const;

export const PERMIT2_ABI = [
  "function allowance(address owner,address token,address spender) view returns(uint160 amount,uint48 expiration,uint48 nonce)",
] as const;

export interface RangeOrderSnapshot {
  orderId: bigint;
  tokenId: bigint;
  inputAmount: bigint;
  minimumOutputAmount: bigint;
  strategyHash: string;
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  createdBlock: bigint;
  creationDeadline: bigint;
  terminalBlock: bigint;
  side: number;
  status: number;
}

export function decodeOrder(orderId: bigint, tuple: readonly unknown[]): RangeOrderSnapshot {
  if (tuple.length !== 12) throw new Error("Unexpected RangeOrder tuple length");
  return {
    orderId,
    tokenId: BigInt(tuple[0] as bigint),
    inputAmount: BigInt(tuple[1] as bigint),
    minimumOutputAmount: BigInt(tuple[2] as bigint),
    strategyHash: String(tuple[3]).toLowerCase(),
    liquidity: BigInt(tuple[4] as bigint),
    tickLower: Number(tuple[5]),
    tickUpper: Number(tuple[6]),
    createdBlock: BigInt(tuple[7] as bigint),
    creationDeadline: BigInt(tuple[8] as bigint),
    terminalBlock: BigInt(tuple[9] as bigint),
    side: Number(tuple[10]),
    status: Number(tuple[11]),
  };
}
