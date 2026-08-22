// The public swap preview exposes only the existing read-only Base RPC proxy.
// Wallet transaction submission never passes through this function.
export { onRequest } from "../../functions/base-rpc.js";
