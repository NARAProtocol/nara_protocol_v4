import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { ethers } from "ethers";
import { useConnectWallet, useSetChain } from "@web3-onboard/react";
import {
  BASE_CHAIN_ID,
  DEFAULT_BASE_RPC,
  BASE_RPC_URLS,
  GRID_ADDRESSES,
  DURATION_HORIZONS,
  erc20Abi,
  positionNftAbi,
  engineAbi,
  fleetDeckLensAbi,
  multicall3Abi,
  parseTokenUri,
  SAMPLE_POSITIONS,
  type PositionNftItem,
  type FleetDeckSummary,
} from "../lib/gridContracts";
import { onboard } from "../lib/wallet";

interface CachedNftStaticData {
  posId: ethers.BigNumber;
  name: string;
  desc: string;
  imageSvg: string;
  attrs: Array<{ trait_type: string; value: string | number }>;
}

// Global in-memory cache for immutable on-chain token metadata (name, SVG, traits, positionId)
const nftStaticCache = new Map<number, CachedNftStaticData>();

export interface GridContextType {
  // Wallet & Network
  wallet: any;
  connectedAddress?: string;
  connectedChainId: number;
  isWrongChain: boolean;
  connect: () => Promise<any>;
  disconnect: (wallet: any) => Promise<any>;
  handleSwitchToBase: () => Promise<void>;

  // Global Protocol Telemetry
  currentEpoch: number;
  epochTimestamp: number;
  countdownStr: string;
  totalGridLocked: ethers.BigNumber;
  activeTotalWeight: ethers.BigNumber;
  totalGridCapacity: number;
  occupancyPercentStr: string;
  lockFeeWei: ethers.BigNumber;
  unlockFeeWei: ethers.BigNumber;
  loading: boolean;
  fetchState: () => Promise<void>;

  // User State
  naraBalance: ethers.BigNumber;
  naraAllowance: ethers.BigNumber;
  totalUserCells: ethers.BigNumber;
  userPositions: PositionNftItem[];
  slottedTokenIds: ethers.BigNumber[];
  deckSummary: FleetDeckSummary | null;
  userPulseSharePercent: string;
  aggregateClaimableEth: ethers.BigNumber;
  aggregateClaimableNara: ethers.BigNumber;
  aggregateClaimableUsdc: ethers.BigNumber;
  hasZeroBalance: boolean;

  // Actions
  actionBusy: string | null;
  txSuccessMsg: string | null;
  setTxSuccessMsg: (msg: string | null) => void;
  errorMsg: string | null;
  setErrorMsg: (msg: string | null) => void;
  inspectModalItem: PositionNftItem | null;
  setInspectModalItem: (item: PositionNftItem | null) => void;
  mintRevealItem: PositionNftItem | null;
  setMintRevealItem: (item: PositionNftItem | null) => void;

  handleApprove: () => Promise<boolean>;
  handleCommit: (amountInput: string, horizonIdx: number) => Promise<boolean>;
  handleEquip: (tokenId: ethers.BigNumber) => Promise<boolean>;
  handleUnequip: (tokenId: ethers.BigNumber) => Promise<boolean>;
  handleAutoEquipTop6: () => Promise<boolean>;
  handleClearSlots: () => void;
  handleHarvestSingle: (tokenId: ethers.BigNumber) => Promise<boolean>;
  handleHarvestAll: () => Promise<boolean>;
  handleUnlock: (tokenId: ethers.BigNumber) => Promise<boolean>;

  // Routing
  currentRoute: string;
  navigate: (path: string) => void;
}

const GridContext = createContext<GridContextType | undefined>(undefined);

export function GridProvider({
  children,
  currentRoute,
  navigate,
}: {
  children: ReactNode;
  currentRoute: string;
  navigate: (path: string) => void;
}) {
  const [{ wallet }, connect, disconnect] = useConnectWallet();
  const [{ connectedChain }, setChain] = useSetChain();

  // Connected state
  const connectedAddress = wallet?.accounts?.[0]?.address;
  const connectedChainId = connectedChain
    ? parseInt(connectedChain.id, 16)
    : wallet?.chains?.[0]?.id
    ? parseInt(wallet.chains[0].id, 16)
    : BASE_CHAIN_ID;
  const isWrongChain = !!connectedAddress && connectedChainId !== BASE_CHAIN_ID;

  // On-chain state
  const [currentEpoch, setCurrentEpoch] = useState<number>(3111);
  const [epochTimestamp, setEpochTimestamp] = useState<number>(0);
  const [countdownStr, setCountdownStr] = useState<string>("15:00");
  const [totalGridLocked, setTotalGridLocked] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [activeTotalWeight, setActiveTotalWeight] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [naraBalance, setNaraBalance] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [naraAllowance, setNaraAllowance] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [lockFeeWei, setLockFeeWei] = useState<ethers.BigNumber>(ethers.BigNumber.from("1000000000000"));
  const [unlockFeeWei, setUnlockFeeWei] = useState<ethers.BigNumber>(ethers.BigNumber.from("1000000000000"));
  const [userPositions, setUserPositions] = useState<PositionNftItem[]>([]);
  const [slottedTokenIds, setSlottedTokenIds] = useState<ethers.BigNumber[]>([]);
  const [deckSummary, setDeckSummary] = useState<FleetDeckSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Global Modal & Feedback
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [txSuccessMsg, setTxSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspectModalItem, setInspectModalItem] = useState<PositionNftItem | null>(null);
  const [mintRevealItem, setMintRevealItem] = useState<PositionNftItem | null>(null);

  const rpcIndexRef = useRef<number>(0);
  const getProvider = useCallback(() => {
    const urls = BASE_RPC_URLS && BASE_RPC_URLS.length > 0 ? BASE_RPC_URLS : [DEFAULT_BASE_RPC];
    const rpcUrl = urls[rpcIndexRef.current % urls.length];
    return new ethers.providers.StaticJsonRpcProvider(rpcUrl, BASE_CHAIN_ID);
  }, []);

function getInjectedWalletLabel(): string {
  if (typeof window === "undefined" || !(window as any).ethereum) return "MetaMask";
  const eth = (window as any).ethereum;
  if (eth.isRabby) return "Rabby";
  if (eth.isCoinbaseWallet) return "Coinbase Wallet";
  if (eth.isBraveWallet) return "Brave Wallet";
  if (eth.isTrust) return "Trust Wallet";
  return "MetaMask";
}

  const handleConnect = useCallback(async () => {
    try {
      if (typeof window !== "undefined" && (window as any).ethereum) {
        try {
          await (window as any).ethereum.request({ method: "eth_requestAccounts" });
        } catch (injectedErr) {
          console.warn("Direct injected eth_requestAccounts notice:", injectedErr);
        }
        const label = getInjectedWalletLabel();
        try {
          const res = await connect({ autoSelect: { label, disableModals: true } });
          if (res && res.length > 0) return res;
        } catch (autoErr) {
          console.warn("autoSelect connect notice, falling back to standard:", autoErr);
        }
      }
      return await connect();
    } catch (e) {
      console.warn("Connect attempt error, retrying fallback:", e);
      try {
        return await onboard.connectWallet();
      } catch (err2) {
        console.error("Direct onboard.connectWallet failed:", err2);
        throw err2;
      }
    }
  }, [connect]);

  // Chain Switcher
  const handleSwitchToBase = useCallback(async () => {
    try {
      await setChain({ chainId: "0x2105", chainNamespace: "evm" });
    } catch (err: any) {
      setErrorMsg("Failed to switch to Base network: " + (err.message || err));
    }
  }, [setChain]);

  const fetchSeqRef = useRef<number>(0);

  // Fetch On-Chain State via Multicall3 (Maximum Batching & Dynamic/Static Query Optimization)
  const fetchState = useCallback(async () => {
    const seq = ++fetchSeqRef.current;
    const currentQueryAddress = connectedAddress;

    try {
      setLoading(true);
      setErrorMsg(null);
      const provider = getProvider();

        const multicallContract = new ethers.Contract(GRID_ADDRESSES.multicall3, multicall3Abi, provider);
        const engineIface = new ethers.utils.Interface(engineAbi);
        const erc20Iface = new ethers.utils.Interface(erc20Abi);
        const nftIface = new ethers.utils.Interface(positionNftAbi);
        const lensIface = new ethers.utils.Interface(fleetDeckLensAbi);

        // Batch 1 (Pre-query): Engine state + user balances (if connected)
        const preCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [
          { target: GRID_ADDRESSES.engine, allowFailure: true, callData: engineIface.encodeFunctionData("currentEpoch") }, // 0
          { target: GRID_ADDRESSES.engine, allowFailure: true, callData: engineIface.encodeFunctionData("lockFeeWei") }, // 1
          { target: GRID_ADDRESSES.engine, allowFailure: true, callData: engineIface.encodeFunctionData("epochState") }, // 2
          { target: GRID_ADDRESSES.engine, allowFailure: true, callData: engineIface.encodeFunctionData("unlockFeeWei") }, // 3
        ];

        let balIdx = -1;
        let allowanceIdx = -1;
        let nextIdIdx = -1;

        if (currentQueryAddress) {
          balIdx = preCalls.length;
          preCalls.push({
            target: GRID_ADDRESSES.naraToken,
            allowFailure: true,
            callData: erc20Iface.encodeFunctionData("balanceOf", [currentQueryAddress]),
          });

          allowanceIdx = preCalls.length;
          preCalls.push({
            target: GRID_ADDRESSES.naraToken,
            allowFailure: true,
            callData: erc20Iface.encodeFunctionData("allowance", [currentQueryAddress, GRID_ADDRESSES.positionNft]),
          });

          nextIdIdx = preCalls.length;
          preCalls.push({
            target: GRID_ADDRESSES.positionNft,
            allowFailure: true,
            callData: nftIface.encodeFunctionData("nextTokenId"),
          });
        }

        const callMulticall = async (calls: Array<{ target: string; allowFailure: boolean; callData: string }>) => {
          try {
            return await multicallContract.aggregate3(calls);
          } catch (err: any) {
            console.warn("Primary RPC aggregate3 issue, attempting failover:", err?.message || err);
            rpcIndexRef.current++;
            const fallbackProvider = getProvider();
            const fallbackMc = new ethers.Contract(GRID_ADDRESSES.multicall3, multicall3Abi, fallbackProvider);
            return await fallbackMc.aggregate3(calls);
          }
        };

        let preResults: Array<{ success: boolean; returnData: string }> = [];
        try {
          preResults = await callMulticall(preCalls);
        } catch (err) {
          console.warn("Multicall pre-query failed, falling back to direct calls:", err);
        }

        if (preResults.length >= 4) {
          if (preResults[0]?.success) {
            const ep = engineIface.decodeFunctionResult("currentEpoch", preResults[0].returnData)[0];
            setCurrentEpoch(ep.toNumber());
          }
          if (preResults[1]?.success) {
            const fee = engineIface.decodeFunctionResult("lockFeeWei", preResults[1].returnData)[0];
            setLockFeeWei(fee);
          }
          if (preResults[2]?.success) {
            const st = engineIface.decodeFunctionResult("epochState", preResults[2].returnData)[0];
            setEpochTimestamp(st.timestamp.toNumber());
            setTotalGridLocked(st.totalLocked);
            setActiveTotalWeight(st.activeTotalWeight);
          }
          if (preResults[3]?.success) {
            try {
              const fee = engineIface.decodeFunctionResult("unlockFeeWei", preResults[3].returnData)[0];
              setUnlockFeeWei(fee);
            } catch {}
          }
        }

        if (currentQueryAddress) {
          let bal = ethers.BigNumber.from(0);
          let allowance = ethers.BigNumber.from(0);
          let nextId = 1;

          if (balIdx >= 0 && allowanceIdx >= 0 && nextIdIdx >= 0 && preResults.length > nextIdIdx) {
            if (preResults[balIdx]?.success) {
              bal = erc20Iface.decodeFunctionResult("balanceOf", preResults[balIdx].returnData)[0];
            }
            if (preResults[allowanceIdx]?.success) {
              allowance = erc20Iface.decodeFunctionResult("allowance", preResults[allowanceIdx].returnData)[0];
            }
            if (preResults[nextIdIdx]?.success) {
              nextId = nftIface.decodeFunctionResult("nextTokenId", preResults[nextIdIdx].returnData)[0].toNumber();
            }
          } else {
            // Fallback direct calls if multicall prequery was partial
            const tokenContract = new ethers.Contract(GRID_ADDRESSES.naraToken, erc20Abi, provider);
            const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, provider);
            const [b, a, n] = await Promise.all([
              tokenContract.balanceOf(currentQueryAddress).catch(() => ethers.BigNumber.from(0)),
              tokenContract.allowance(currentQueryAddress, GRID_ADDRESSES.positionNft).catch(() => ethers.BigNumber.from(0)),
              nftContract.nextTokenId().catch(() => ethers.BigNumber.from(1)),
            ]);
            bal = b;
            allowance = a;
            nextId = n.toNumber();
          }

          setNaraBalance(bal);
          setNaraAllowance(allowance);

          const maxQuery = Math.max(0, Math.min(nextId - 1, 100));
          const tokenIds = Array.from({ length: maxQuery }, (_, i) => nextId - 1 - i);

          // Batch 2: Scan token ownership via Multicall3
          const ownerCalls = tokenIds.map((tid) => ({
            target: GRID_ADDRESSES.positionNft,
            allowFailure: true,
            callData: nftIface.encodeFunctionData("ownerOf", [tid]),
          }));

          let ownerResults: Array<{ success: boolean; returnData: string }> = [];
          try {
            ownerResults = await callMulticall(ownerCalls);
          } catch (e) {
            console.warn("Multicall owner scan failed:", e);
          }

          const myTokenIds: number[] = [];
          tokenIds.forEach((tid, idx) => {
            if (ownerResults[idx]?.success) {
              try {
                const owner = nftIface.decodeFunctionResult("ownerOf", ownerResults[idx].returnData)[0];
                if (owner && owner.toLowerCase() === currentQueryAddress.toLowerCase()) {
                  myTokenIds.push(tid);
                }
              } catch {}
            }
          });

          // Pre-determine slotted tokens to batch getFleetDeckSummary in the same multicall
          let targetSlotted: ethers.BigNumber[] = [];
          const storageKey = `nara_slotted_tokens_${currentQueryAddress.toLowerCase()}`;
          try {
            const savedJson = localStorage.getItem(storageKey);
            if (savedJson !== null) {
              const parsedIds: string[] = JSON.parse(savedJson);
              if (Array.isArray(parsedIds)) {
                targetSlotted = parsedIds
                  .map((id) => ethers.BigNumber.from(id))
                  .filter((id) => myTokenIds.some((tid) => id.eq(tid)))
                  .slice(0, 6);
              }
            }
          } catch (e) {
            console.warn("Could not read localStorage for slotted tokens:", e);
          }

          // If no saved slots in storage yet, tentatively pick up to top 6 of owned tokens
          if (targetSlotted.length === 0 && localStorage.getItem(storageKey) === null && myTokenIds.length > 0) {
            targetSlotted = myTokenIds.slice(0, 6).map((tid) => ethers.BigNumber.from(tid));
          }

          // Batch 3: Position details + rewards + deck summary in ONE single Multicall
          let foundPositions: PositionNftItem[] = [];
          if (myTokenIds.length > 0) {
            // First resolve positionId for each token (from cache or quick multicall)
            const posIdMap = new Map<number, ethers.BigNumber>();
            const uncachedPosIdTids: number[] = [];
            myTokenIds.forEach((tid) => {
              if (nftStaticCache.has(tid)) {
                posIdMap.set(tid, nftStaticCache.get(tid)!.posId);
              } else {
                uncachedPosIdTids.push(tid);
              }
            });

            if (uncachedPosIdTids.length > 0) {
              const posIdCalls = uncachedPosIdTids.map((tid) => ({
                target: GRID_ADDRESSES.positionNft,
                allowFailure: true,
                callData: nftIface.encodeFunctionData("positionIdOf", [tid]),
              }));
              try {
                const posIdResults = await multicallContract.aggregate3(posIdCalls);
                posIdResults.forEach((res: any, idx: number) => {
                  if (res?.success) {
                    try {
                      const pid = nftIface.decodeFunctionResult("positionIdOf", res.returnData)[0];
                      posIdMap.set(uncachedPosIdTids[idx], pid);
                    } catch {}
                  }
                });
              } catch (posErr) {
                console.warn("Multicall positionIdOf pre-fetch failed:", posErr);
              }
            }

            const detailCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
            const tokenCallPlan: Array<{
              tid: number;
              posId: ethers.BigNumber;
              hasStatic: boolean;
              infoIdx: number;
              rewIdx: number;
              uriIdx?: number;
            }> = [];

            myTokenIds.forEach((tid) => {
              const hasStatic = nftStaticCache.has(tid);
              const posId = posIdMap.get(tid) || ethers.BigNumber.from(tid);

              const infoIdx = detailCalls.length;
              detailCalls.push({
                target: GRID_ADDRESSES.positionNft,
                allowFailure: true,
                callData: nftIface.encodeFunctionData("positionInfo", [tid]),
              });

              const rewIdx = detailCalls.length;
              detailCalls.push({
                target: GRID_ADDRESSES.engine,
                allowFailure: true,
                callData: engineIface.encodeFunctionData("claimableRewards", [posId]), // Accurate on-chain positionId!
              });

              let uriIdx: number | undefined;

              // Only query heavy static SVG tokenURI if not cached
              if (!hasStatic) {
                uriIdx = detailCalls.length;
                detailCalls.push({
                  target: GRID_ADDRESSES.positionNft,
                  allowFailure: true,
                  callData: nftIface.encodeFunctionData("tokenURI", [tid]),
                });
              }

              tokenCallPlan.push({ tid, posId, hasStatic, infoIdx, rewIdx, uriIdx });
            });

            // Batch getFleetDeckSummary in the EXACT same Multicall3 round-trip
            let deckSummaryIdx = -1;
            if (targetSlotted.length > 0) {
              deckSummaryIdx = detailCalls.length;
              detailCalls.push({
                target: GRID_ADDRESSES.fleetDeckLens,
                allowFailure: true,
                callData: lensIface.encodeFunctionData("getFleetDeckSummary", [currentQueryAddress, targetSlotted]),
              });
            }

            let detailResults: Array<{ success: boolean; returnData: string }> = [];
            try {
              detailResults = await callMulticall(detailCalls);
            } catch (e) {
              console.warn("Multicall detail fetch failed:", e);
            }

            foundPositions = tokenCallPlan.map((plan) => {
              const { tid, posId, hasStatic, infoIdx, rewIdx, uriIdx } = plan;
              const infoRes = detailResults[infoIdx];
              const rewRes = detailResults[rewIdx];

              let posInfo: any = {
                owner: currentQueryAddress,
                amount: ethers.BigNumber.from(0),
                createdEpoch: ethers.BigNumber.from(0),
                unlockEpoch: ethers.BigNumber.from(0),
                weight: ethers.BigNumber.from(0),
              };
              if (infoRes?.success) {
                try {
                  posInfo = nftIface.decodeFunctionResult("positionInfo", infoRes.returnData)[0];
                } catch {}
              }

              let claimableNara = ethers.BigNumber.from(0);
              let claimableEth = ethers.BigNumber.from(0);
              if (rewRes?.success) {
                try {
                  const rew = engineIface.decodeFunctionResult("claimableRewards", rewRes.returnData);
                  claimableNara = rew[0] || rew.naraAmount || ethers.BigNumber.from(0);
                  claimableEth = rew[1] || rew.ethAmount || ethers.BigNumber.from(0);
                } catch (e) {
                  console.warn(`claimableRewards decode failed for posId ${posId}:`, e);
                }
              }

              let name = `Position #${tid}`;
              let desc = `Active Cell Allocation #${tid}`;
              let imageSvg = "";
              let attrs: Array<{ trait_type: string; value: string | number }> = [];

              if (hasStatic) {
                const cached = nftStaticCache.get(tid)!;
                name = cached.name;
                desc = cached.desc;
                imageSvg = cached.imageSvg;
                attrs = cached.attrs;
              } else {
                if (uriIdx !== undefined && detailResults[uriIdx]?.success) {
                  try {
                    const uri = nftIface.decodeFunctionResult("tokenURI", detailResults[uriIdx].returnData)[0];
                    const parsed = parseTokenUri(uri);
                    name = parsed.name || name;
                    desc = parsed.description || desc;
                    imageSvg = parsed.imageSvg || "";
                    attrs = parsed.attributes || [];
                  } catch {}
                }

                // Cache static immutable metadata in memory to eliminate future SVG queries
                nftStaticCache.set(tid, { posId, name, desc, imageSvg, attrs });
              }

              return {
                tokenId: ethers.BigNumber.from(tid),
                positionId: posId,
                owner: currentQueryAddress,
                account: posInfo.owner || currentQueryAddress,
                amount: posInfo.amount || ethers.BigNumber.from(0),
                createdEpoch: posInfo.createdEpoch ? posInfo.createdEpoch.toNumber() : 0,
                unlockEpoch: posInfo.unlockEpoch ? posInfo.unlockEpoch.toNumber() : 0,
                weight: posInfo.weight || ethers.BigNumber.from(0),
                claimableEth,
                claimableNara,
                claimableUsdc: ethers.BigNumber.from(0),
                tokenUri: "",
                name,
                description: desc,
                imageSvg,
                attributes: attrs,
                isSample: false,
              };
            });

            // Decode batched fleet deck summary if included in results
            if (deckSummaryIdx >= 0 && detailResults[deckSummaryIdx]?.success) {
              try {
                const rawSummary = lensIface.decodeFunctionResult("getFleetDeckSummary", detailResults[deckSummaryIdx].returnData)[0];
                const deck = rawSummary.deck || rawSummary;
                setDeckSummary({
                  user: deck.user,
                  totalLockedNara: deck.totalLockedNara,
                  totalWeight: deck.totalWeight,
                  formattedWeightedMultiplier: deck.formattedWeightedMultiplier || "1.00X",
                  formattedDeckSynergyMultiplier: deck.formattedDeckSynergyMultiplier || "1.00X",
                  formattedTotalEffectiveMultiplier: deck.formattedTotalEffectiveMultiplier || "1.00X",
                  effectiveTotalWeight: deck.effectiveTotalWeight || deck.totalWeight,
                  synergyTierName: deck.synergy?.synergyTierName || "SOLO FORMATION",
                  synergyBonusBps: deck.synergy?.totalSynergyBonusBps || 0,
                  activeSlotsCount: deck.synergy?.activeSlotsCount?.toNumber() || targetSlotted.length,
                  hasGenesisAura: deck.synergy?.hasGenesisAura || false,
                  aggregateClaimableNara: deck.aggregateClaimableNara || ethers.BigNumber.from(0),
                  aggregateClaimableEth: deck.aggregateClaimableEth || ethers.BigNumber.from(0),
                });
              } catch (deckErr) {
                console.warn("Failed to decode batched deck summary:", deckErr);
              }
            }
          }

          setUserPositions(foundPositions);

          // Save slots to localStorage if not yet stored
          if (targetSlotted.length > 0 && localStorage.getItem(storageKey) === null) {
            try {
              localStorage.setItem(storageKey, JSON.stringify(targetSlotted.map((t) => t.toString())));
            } catch {}
          }

          setSlottedTokenIds(targetSlotted);
          if (targetSlotted.length === 0) {
            setDeckSummary(null);
          }
        } else {
          // Fallback for unauthenticated preview
          if (seq === fetchSeqRef.current) {
            setUserPositions(SAMPLE_POSITIONS);
            setNaraBalance(ethers.utils.parseEther("12500"));
            setNaraAllowance(ethers.constants.MaxUint256);
          }
        }
      } catch (err: any) {
        if (seq === fetchSeqRef.current) {
          console.error("fetchState error:", err);
          setErrorMsg("Failed to synchronize with Base mainnet.");
        }
      } finally {
        if (seq === fetchSeqRef.current) {
          setLoading(false);
        }
      }
  }, [connectedAddress, getProvider]);

  // Live 1-second pulse countdown ticker
  useEffect(() => {
    const updateCountdown = () => {
      const now = Math.floor(Date.now() / 1000);
      const interval = 900; // 15 minutes
      const elapsed = epochTimestamp > 0 ? (now - epochTimestamp) % interval : now % interval;
      const remaining = Math.max(0, interval - elapsed);

      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      setCountdownStr(`${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`);
    };

    updateCountdown();
    const intervalId = setInterval(updateCountdown, 1000);
    return () => clearInterval(intervalId);
  }, [epochTimestamp]);

  // Auto-connect if wallet is already authorized in window.ethereum
  useEffect(() => {
    let isMounted = true;
    const autoConnectIfAuthorized = async () => {
      if (typeof window === "undefined" || !(window as any).ethereum) return;
      try {
        const accounts = await (window as any).ethereum.request({ method: "eth_accounts" });
        if (isMounted && accounts && accounts.length > 0 && !connectedAddress) {
          const label = getInjectedWalletLabel();
          await connect({ autoSelect: { label, disableModals: true } });
        }
      } catch (e) {
        console.warn("Auto-connect check notice:", e);
      }
    };
    autoConnectIfAuthorized();
    return () => {
      isMounted = false;
    };
  }, [connect, connectedAddress]);

  // Reactive listener for MetaMask / browser wallet account and chain changes
  useEffect(() => {
    if (typeof window === "undefined" || !(window as any).ethereum) return;
    const eth = (window as any).ethereum;
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts && accounts.length > 0) {
        fetchState();
      } else {
        disconnect(wallet ? { label: wallet.label } : { label: "MetaMask" });
      }
    };
    const handleChainChanged = () => {
      fetchState();
    };
    eth.on?.("accountsChanged", handleAccountsChanged);
    eth.on?.("chainChanged", handleChainChanged);
    return () => {
      eth.removeListener?.("accountsChanged", handleAccountsChanged);
      eth.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [fetchState, disconnect, wallet]);

  // Initial Fetch & Account Change Listener
  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Aggregate user stats
  const totalUserCells = useMemo(() => {
    return userPositions.reduce((acc, p) => acc.add(p.amount), ethers.BigNumber.from(0));
  }, [userPositions]);

  const aggregateClaimableEth = useMemo(() => {
    if (deckSummary) return deckSummary.aggregateClaimableEth;
    return userPositions.reduce((acc, p) => acc.add(p.claimableEth), ethers.BigNumber.from(0));
  }, [deckSummary, userPositions]);

  const aggregateClaimableNara = useMemo(() => {
    if (deckSummary) return deckSummary.aggregateClaimableNara;
    return userPositions.reduce((acc, p) => acc.add(p.claimableNara), ethers.BigNumber.from(0));
  }, [deckSummary, userPositions]);

  const aggregateClaimableUsdc = useMemo(() => {
    return userPositions.reduce((acc, p) => acc.add(p.claimableUsdc || ethers.BigNumber.from(0)), ethers.BigNumber.from(0));
  }, [userPositions]);

  const hasZeroBalance = useMemo(() => {
    return naraBalance.isZero();
  }, [naraBalance]);

  // Occupancy percentage of 1,000,000 max capped cells
  const totalGridCapacity = 1_000_000;
  const occupancyPercentStr = useMemo(() => {
    const lockedNum = parseFloat(ethers.utils.formatEther(totalGridLocked || 0));
    const pct = (lockedNum / totalGridCapacity) * 100;
    return pct < 0.01 && pct > 0 ? "< 0.01%" : `${pct.toFixed(2)}%`;
  }, [totalGridLocked]);

  // User's Proportional Pulse Share %
  const userPulseSharePercent = useMemo(() => {
    if (activeTotalWeight.isZero() || totalUserCells.isZero()) return "0.00%";
    const userWeight = deckSummary
      ? parseFloat(ethers.utils.formatEther(deckSummary.effectiveTotalWeight))
      : parseFloat(ethers.utils.formatEther(totalUserCells));
    const totalWeight = parseFloat(ethers.utils.formatEther(activeTotalWeight));
    if (totalWeight <= 0) return "0.00%";
    const share = (userWeight / totalWeight) * 100;
    return share < 0.01 && share > 0 ? "< 0.01%" : `${share.toFixed(2)}%`;
  }, [deckSummary, totalUserCells, activeTotalWeight]);

function isUserRejection(err: any): boolean {
  if (!err) return false;
  if (err.code === 4001 || err.code === "ACTION_REJECTED") return true;
  const msg = (err.message || err.reason || "").toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected by user") ||
    msg.includes("transaction rejected") ||
    msg.includes("cancelled") ||
    msg.includes("canceled") ||
    err?.info?.error?.code === 4001
  );
}

  // Transaction Handlers
  const handleApprove = async (): Promise<boolean> => {
    if (!wallet || !connectedAddress) {
      connect();
      return false;
    }
    try {
      setActionBusy("approve");
      setErrorMsg(null);
      setTxSuccessMsg(null);

      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const tokenContract = new ethers.Contract(GRID_ADDRESSES.naraToken, erc20Abi, signer);

      const tx = await tokenContract.approve(GRID_ADDRESSES.positionNft, ethers.constants.MaxUint256);
      setTxSuccessMsg("Approval submitted! Waiting for Base confirmation...");
      await tx.wait();
      setTxSuccessMsg("NARA approved successfully! Ready to join the Grid.");
      await fetchState();
      return true;
    } catch (err: any) {
      if (isUserRejection(err)) {
        setTxSuccessMsg("Approval cancelled.");
        return false;
      }
      console.error("Approve error:", err);
      setErrorMsg(err.reason || err.message || "Approval transaction failed.");
      return false;
    } finally {
      setActionBusy(null);
    }
  };

  const handleCommit = async (amountInput: string, horizonIdx: number): Promise<boolean> => {
    if (!wallet || !connectedAddress) {
      connect();
      return false;
    }
    const horizon = DURATION_HORIZONS[horizonIdx];
    let parsed: ethers.BigNumber;
    try {
      parsed = ethers.utils.parseEther(amountInput || "0");
    } catch {
      setErrorMsg("Invalid commitment amount.");
      return false;
    }
    if (parsed.isZero()) {
      setErrorMsg("Please enter an amount of NARA to commit.");
      return false;
    }
    try {
      setActionBusy("commit");
      setErrorMsg(null);
      setTxSuccessMsg(null);

      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);
      const tokenContract = new ethers.Contract(GRID_ADDRESSES.naraToken, erc20Abi, signer);

      // Pre-flight check: Use state allowance first, only query onchain if allowance appears insufficient
      let currentAllowance: ethers.BigNumber = naraAllowance;
      if (currentAllowance.lt(parsed)) {
        currentAllowance = await tokenContract
          .allowance(connectedAddress, GRID_ADDRESSES.positionNft)
          .catch(() => naraAllowance);
      }

      if (currentAllowance.lt(parsed)) {
        setTxSuccessMsg("Additional NARA approval required for this amount. Prompting wallet approval...");
        const approveTx = await tokenContract.approve(GRID_ADDRESSES.positionNft, ethers.constants.MaxUint256);
        setTxSuccessMsg("Approval submitted! Waiting for Base confirmation...");
        await approveTx.wait();
        currentAllowance = ethers.constants.MaxUint256;
        setNaraAllowance(ethers.constants.MaxUint256);
        setTxSuccessMsg("Approval confirmed! Now minting your Position NFT...");
      }

      // Use lockFeeWei from state if already loaded; fallback to query only if zero
      let feeWei = lockFeeWei;
      if (!feeWei || feeWei.isZero()) {
        try {
          const engineContract = new ethers.Contract(GRID_ADDRESSES.engine, engineAbi, provider);
          feeWei = await engineContract.lockFeeWei();
          setLockFeeWei(feeWei);
        } catch {
          feeWei = ethers.BigNumber.from("1000000000000");
        }
      }

      const durationEpochs = horizon.epochs;
      const tx = await nftContract.mintAndLockFor(
        connectedAddress,
        parsed,
        durationEpochs,
        0,
        { value: feeWei }
      );
      setTxSuccessMsg("Commitment broadcast! Minting your on-chain Position NFT...");
      const receipt = await tx.wait();

      // OPTIMISTIC UPDATE: deduct from local state immediately!
      setNaraBalance((prev) => (prev.gte(parsed) ? prev.sub(parsed) : ethers.constants.Zero));
      setNaraAllowance((prev) => (prev.gte(parsed) ? prev.sub(parsed) : ethers.constants.Zero));

      // Extract newly minted token ID to trigger the unboxing reveal experience
      let mintedTokenId: ethers.BigNumber | null = null;
      if (receipt && receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsedLog = nftContract.interface.parseLog(log);
            if (parsedLog.name === "PositionMinted") {
              mintedTokenId = parsedLog.args.tokenId;
              break;
            }
          } catch {}
        }
        if (!mintedTokenId) {
          for (const log of receipt.logs) {
            try {
              const parsedLog = nftContract.interface.parseLog(log);
              if (parsedLog.name === "Transfer" && parsedLog.args.to?.toLowerCase() === connectedAddress.toLowerCase()) {
                mintedTokenId = parsedLog.args.tokenId;
                break;
              }
            } catch {}
          }
        }
      }

      if (mintedTokenId) {
        try {
          const readProvider = new ethers.providers.JsonRpcProvider(DEFAULT_BASE_RPC);
          const readNft = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, readProvider);

          let uri = "";
          try {
            uri = await readNft.tokenURI(mintedTokenId);
          } catch {
            try {
              uri = await nftContract.tokenURI(mintedTokenId);
            } catch {}
          }

          const [posInfo, posId] = await Promise.all([
            readNft.positionInfo(mintedTokenId).catch(() => null),
            readNft.positionIdOf(mintedTokenId).catch(() => mintedTokenId),
          ]);
          const parsedMeta = parseTokenUri(uri);
          const newlyMinted: PositionNftItem = {
            tokenId: mintedTokenId,
            positionId: posId || mintedTokenId,
            owner: connectedAddress,
            account: posInfo?.owner || connectedAddress,
            amount: posInfo?.amount || parsed,
            createdEpoch: posInfo?.createdEpoch ? posInfo.createdEpoch.toNumber() : currentEpoch,
            unlockEpoch: posInfo?.unlockEpoch ? posInfo.unlockEpoch.toNumber() : currentEpoch + durationEpochs,
            weight: posInfo?.weight || parsed,
            claimableEth: ethers.BigNumber.from(0),
            claimableNara: ethers.BigNumber.from(0),
            claimableUsdc: ethers.BigNumber.from(0),
            tokenUri: uri,
            name: parsedMeta.name || `Position #${mintedTokenId.toString()}`,
            description: parsedMeta.description || "",
            imageSvg: parsedMeta.imageSvg || "",
            attributes: parsedMeta.attributes || [],
          };
          // Also warm the in-memory cache so subsequent views load instantly
          const tid = mintedTokenId.toNumber();
          nftStaticCache.set(tid, {
            posId: posId || mintedTokenId,
            name: newlyMinted.name,
            desc: newlyMinted.description,
            imageSvg: newlyMinted.imageSvg,
            attrs: newlyMinted.attributes,
          });
          setMintRevealItem(newlyMinted);
        } catch (e) {
          console.warn("Could not query metadata for reveal modal:", e);
        }
      }

      setTxSuccessMsg("Active cells activated! Your Position NFT is live on Base.");
      await fetchState();
      return true;
    } catch (err: any) {
      if (isUserRejection(err)) {
        setTxSuccessMsg("Commitment cancelled.");
        return false;
      }
      console.error("Commit error:", err);
      const errStr = (err?.data || err?.error?.data || err?.message || "").toString();
      if (errStr.includes("0xfb8f41b2") || errStr.includes("ERC20InsufficientAllowance") || errStr.includes("insufficient allowance")) {
        setErrorMsg("NARA allowance exhausted. Please click Step 1: Approve NARA to restore allowance.");
      } else if (errStr.includes("0x1f2a2005") || errStr.includes("IncorrectNativeFee")) {
        setErrorMsg("Network anti-spam fee mismatch. Please retry.");
      } else {
        setErrorMsg(err.reason || err.message || "Commitment transaction failed.");
      }
      return false;
    } finally {
      setActionBusy(null);
    }
  };

  const updateDeckSummary = async (tokens: ethers.BigNumber[]) => {
    if (!connectedAddress || tokens.length === 0) {
      setDeckSummary(null);
      return;
    }
    try {
      const provider = getProvider();
      const lensContract = new ethers.Contract(GRID_ADDRESSES.fleetDeckLens, fleetDeckLensAbi, provider);
      const rawSummary = await lensContract.getFleetDeckSummary(connectedAddress, tokens);
      const deck = rawSummary.deck || rawSummary;
      setDeckSummary({
        user: deck.user,
        totalLockedNara: deck.totalLockedNara,
        totalWeight: deck.totalWeight,
        formattedWeightedMultiplier: deck.formattedWeightedMultiplier || "1.00X",
        formattedDeckSynergyMultiplier: deck.formattedDeckSynergyMultiplier || "1.00X",
        formattedTotalEffectiveMultiplier: deck.formattedTotalEffectiveMultiplier || "1.00X",
        effectiveTotalWeight: deck.effectiveTotalWeight || deck.totalWeight,
        synergyTierName: deck.synergy?.synergyTierName || "SOLO FORMATION",
        synergyBonusBps: deck.synergy?.totalSynergyBonusBps || 0,
        activeSlotsCount: deck.synergy?.activeSlotsCount?.toNumber() || tokens.length,
        hasGenesisAura: deck.synergy?.hasGenesisAura || false,
        aggregateClaimableNara: deck.aggregateClaimableNara || ethers.BigNumber.from(0),
        aggregateClaimableEth: deck.aggregateClaimableEth || ethers.BigNumber.from(0),
      });
    } catch (err) {
      console.warn("updateDeckSummary failed:", err);
    }
  };

  const handleEquip = async (tokenId: ethers.BigNumber): Promise<boolean> => {
    if (!wallet || !connectedAddress) {
      connect();
      return false;
    }
    const targetPos = userPositions.find((p) => p.tokenId.eq(tokenId));
    if (targetPos?.isSample) {
      connect();
      return false;
    }
    if (slottedTokenIds.some((id) => id.eq(tokenId))) {
      setErrorMsg("Position is already equipped in your active fleet formation.");
      return false;
    }
    if (slottedTokenIds.length >= 6) {
      setErrorMsg("Fleet Deck is full (maximum 6 formation slots). Unequip a position first.");
      return false;
    }
    const updated = [...slottedTokenIds, tokenId];
    setSlottedTokenIds(updated);
    if (connectedAddress) {
      try {
        localStorage.setItem(`nara_slotted_tokens_${connectedAddress.toLowerCase()}`, JSON.stringify(updated.map((t) => t.toString())));
      } catch {}
    }
    updateDeckSummary(updated);
    setTxSuccessMsg(`Position #${tokenId.toString()} equipped to Fleet Deck.`);
    return true;
  };

  const handleUnequip = async (tokenId: ethers.BigNumber): Promise<boolean> => {
    const updated = slottedTokenIds.filter((id) => !id.eq(tokenId));
    setSlottedTokenIds(updated);
    if (connectedAddress) {
      try {
        localStorage.setItem(`nara_slotted_tokens_${connectedAddress.toLowerCase()}`, JSON.stringify(updated.map((t) => t.toString())));
      } catch {}
    }
    updateDeckSummary(updated);
    setTxSuccessMsg(`Position #${tokenId.toString()} unequipped.`);
    return true;
  };

  const handleAutoEquipTop6 = async (): Promise<boolean> => {
    if (userPositions.length === 0) {
      setErrorMsg("No Position NFTs available to equip.");
      return false;
    }
    const sorted = [...userPositions].sort((a, b) => {
      if (b.weight.gt(a.weight)) return 1;
      if (b.weight.lt(a.weight)) return -1;
      return 0;
    });
    const top6 = sorted.slice(0, 6).map((p) => p.tokenId);
    setSlottedTokenIds(top6);
    if (connectedAddress) {
      try {
        localStorage.setItem(`nara_slotted_tokens_${connectedAddress.toLowerCase()}`, JSON.stringify(top6.map((t) => t.toString())));
      } catch {}
    }
    updateDeckSummary(top6);
    setTxSuccessMsg(`Auto-equipped top ${top6.length} positions for maximum formation synergy.`);
    return true;
  };

  const handleClearSlots = () => {
    setSlottedTokenIds([]);
    setDeckSummary(null);
    if (connectedAddress) {
      try {
        localStorage.setItem(`nara_slotted_tokens_${connectedAddress.toLowerCase()}`, JSON.stringify([]));
      } catch {}
    }
    setTxSuccessMsg("Fleet Deck cleared.");
  };

  const handleHarvestSingle = async (tokenId: ethers.BigNumber): Promise<boolean> => {
    if (!wallet || !connectedAddress) {
      connect();
      return false;
    }
    const pos = userPositions.find((p) => p.tokenId.eq(tokenId));
    if (pos?.isSample) {
      setErrorMsg("This is a simulator preview position. Connect your wallet to view and harvest live positions.");
      connect();
      return false;
    }
    try {
      setActionBusy(`harvest-${tokenId.toString()}`);
      setErrorMsg(null);
      setTxSuccessMsg(`Please confirm harvest for Position #${tokenId.toString()} in your wallet...`);
      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);

      const tx = await nftContract.claimRewards(tokenId, connectedAddress);
      setTxSuccessMsg(`Harvesting position #${tokenId.toString()} on Base...`);
      await tx.wait();
      setTxSuccessMsg(`Harvested successfully! Resources sent to your wallet.`);
      await fetchState();
      return true;
    } catch (err: any) {
      if (isUserRejection(err)) {
        setTxSuccessMsg("Harvest cancelled.");
        return false;
      }
      setErrorMsg(err.reason || err.message || "Harvest failed.");
      return false;
    } finally {
      setActionBusy(null);
    }
  };

  const handleHarvestAll = async (): Promise<boolean> => {
    if (!wallet || !connectedAddress) {
      connect();
      return false;
    }
    if (userPositions.some((p) => p.isSample)) {
      setErrorMsg("Simulator preview mode active. Connect your wallet to view and harvest live positions.");
      connect();
      return false;
    }

    // Filter strictly to positions that hold meaningful claimable rewards (> 0.0001 NARA or > 0.000001 ETH)
    const minNaraThreshold = ethers.utils.parseEther("0.0001");
    const minEthThreshold = ethers.utils.parseEther("0.000001");

    const eligiblePositions = [...userPositions]
      .filter((p) => {
        const hasNara = p.claimableNara && p.claimableNara.gt(minNaraThreshold);
        const hasEth = p.claimableEth && p.claimableEth.gt(minEthThreshold);
        return hasNara || hasEth;
      })
      .sort((a, b) => {
        // Sort descending so the position with the highest reward is harvested first
        if (b.claimableNara.gt(a.claimableNara)) return 1;
        if (a.claimableNara.gt(b.claimableNara)) return -1;
        return 0;
      });

    if (eligiblePositions.length === 0) {
      setErrorMsg("No positions currently hold claimable resources above the minimum threshold.");
      return false;
    }

    try {
      setActionBusy("harvest-all");
      setErrorMsg(null);
      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);

      let successCount = 0;
      let userCancelled = false;

      for (let i = 0; i < eligiblePositions.length; i++) {
        const pos = eligiblePositions[i];
        const tid = pos.tokenId;

        try {
          setTxSuccessMsg(
            eligiblePositions.length > 1
              ? `Please confirm harvest for Position #${tid.toString()} (${i + 1} of ${eligiblePositions.length}) in wallet...`
              : `Please confirm harvest for Position #${tid.toString()} in wallet...`
          );

          const tx = await nftContract.claimRewards(tid, connectedAddress);

          setTxSuccessMsg(
            eligiblePositions.length > 1
              ? `Submitting harvest for Position #${tid.toString()} (${i + 1} of ${eligiblePositions.length})...`
              : `Submitting harvest for Position #${tid.toString()}...`
          );

          await tx.wait();
          successCount++;
        } catch (err: any) {
          if (isUserRejection(err)) {
            console.log("Harvest sequence aborted by user in wallet.");
            userCancelled = true;
            // CRITICAL: Stop loop immediately upon user cancellation! Do NOT spam next transaction!
            break;
          } else {
            console.warn(`Harvest failed for #${tid.toString()}:`, err);
            // Halt sequence if a transaction fails on-chain to protect the user
            setErrorMsg(err.reason || err.message || `Harvest failed for position #${tid.toString()}`);
            break;
          }
        }
      }

      await fetchState();

      if (userCancelled) {
        if (successCount > 0) {
          setTxSuccessMsg(`Harvest completed: ${successCount} of ${eligiblePositions.length} position(s) harvested.`);
        } else {
          setErrorMsg(null);
          setTxSuccessMsg("Harvest cancelled by user.");
        }
        return successCount > 0;
      }

      if (successCount === eligiblePositions.length) {
        setTxSuccessMsg(
          eligiblePositions.length > 1
            ? `All ${successCount} positions harvested successfully! Resources sent to your wallet.`
            : `Resources harvested successfully! Sent to your wallet.`
        );
        return true;
      }

      return successCount > 0;
    } catch (err: any) {
      if (isUserRejection(err)) {
        setTxSuccessMsg("Harvest cancelled.");
        return false;
      }
      setErrorMsg(err.reason || err.message || "Harvest all failed.");
      return false;
    } finally {
      setActionBusy(null);
    }
  };

  const handleUnlock = async (tokenId: ethers.BigNumber): Promise<boolean> => {
    if (!wallet || !connectedAddress) return false;
    try {
      setActionBusy(`unlock-${tokenId.toString()}`);
      setErrorMsg(null);
      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);

      // Use the dedicated unlockFeeWei (NOT the lock fee) — these are separate,
      // governance-timelocked engine parameters and can diverge at any time.
      let fee = unlockFeeWei;
      if (!fee || fee.isZero()) {
        try {
          const readProvider = new ethers.providers.StaticJsonRpcProvider(DEFAULT_BASE_RPC, BASE_CHAIN_ID);
          const engineContract = new ethers.Contract(GRID_ADDRESSES.engine, engineAbi, readProvider);
          fee = await engineContract.unlockFeeWei();
          setUnlockFeeWei(fee);
        } catch {
          fee = ethers.BigNumber.from("1000000000000");
        }
      }

      let tx;
      try {
        tx = await nftContract.unlockTo(tokenId, connectedAddress, { value: fee });
      } catch (e: any) {
        // Fallback to single-arg unlock if receiver overload is not present
        tx = await nftContract.unlock(tokenId, { value: fee });
      }
      setTxSuccessMsg(`Disconnecting position #${tokenId.toString()}...`);
      await tx.wait();
      setTxSuccessMsg(`Disconnected from the Grid! Principal returned to your wallet.`);
      await fetchState();
      return true;
    } catch (err: any) {
      if (isUserRejection(err)) {
        setTxSuccessMsg("Disconnect cancelled.");
        return false;
      }
      const errStr = (err?.data || err?.error?.data || err?.message || "").toString();
      if (errStr.includes("InsufficientFee") || errStr.includes("0x1f2a2005")) {
        setErrorMsg("Disconnect fee changed. Please retry to fetch the current network fee.");
      } else {
        setErrorMsg(err.reason || err.message || "Disconnect failed.");
      }
      return false;
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <GridContext.Provider
      value={{
        wallet,
        connectedAddress,
        connectedChainId,
        isWrongChain,
        connect: handleConnect,
        disconnect,
        handleSwitchToBase,
        currentEpoch,
        epochTimestamp,
        countdownStr,
        totalGridLocked,
        activeTotalWeight,
        totalGridCapacity,
        occupancyPercentStr,
        lockFeeWei,
        unlockFeeWei,
        loading,
        fetchState,
        naraBalance,
        naraAllowance,
        totalUserCells,
        userPositions,
        slottedTokenIds,
        deckSummary,
        userPulseSharePercent,
        aggregateClaimableEth,
        aggregateClaimableNara,
        aggregateClaimableUsdc,
        hasZeroBalance,
        actionBusy,
        txSuccessMsg,
        setTxSuccessMsg,
        errorMsg,
        setErrorMsg,
        inspectModalItem,
        setInspectModalItem,
        mintRevealItem,
        setMintRevealItem,
        handleApprove,
        handleCommit,
        handleEquip,
        handleUnequip,
        handleAutoEquipTop6,
        handleClearSlots,
        handleHarvestSingle,
        handleHarvestAll,
        handleUnlock,
        currentRoute,
        navigate,
      }}
    >
      {children}
    </GridContext.Provider>
  );
}

export function useGrid() {
  const ctx = useContext(GridContext);
  if (!ctx) {
    throw new Error("useGrid must be used within a GridProvider");
  }
  return ctx;
}
