import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers } from "ethers";
import { useConnectWallet, useSetChain } from "@web3-onboard/react";
import TacticalNumber from "./TacticalNumber";
import {
  ShieldCheck,
  Lightning,
  ArrowsClockwise,
  CheckCircle,
  WarningCircle,
  Plus,
  Coins,
  Cpu,
  Eye,
  X,
} from "@phosphor-icons/react";
import {
  BASE_CHAIN_ID,
  DEFAULT_BASE_RPC,
  GRID_ADDRESSES,
  DURATION_HORIZONS,
  erc20Abi,
  positionNftAbi,
  engineAbi,
  fleetDeckLensAbi,
  parseTokenUri,
  SAMPLE_POSITIONS,
  type PositionNftItem,
  type FleetDeckSummary,
} from "../lib/gridContracts";

export interface GridStationProps {
  onNavigate?: (path: string) => void;
}

// Interactive progressive disclosure popover
function InfoCircle({ text, title }: { text: string; title?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex items-center ml-1 z-20"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        className="w-3.5 h-3.5 rounded-full bg-white/10 hover:bg-cyan-400/20 text-silver hover:text-cyan-300 text-[9px] font-mono flex items-center justify-center border border-white/20 transition-colors focus:outline-none"
        aria-label="Information"
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 p-2 bg-[#080d1a] border border-cyan-500/40 text-[10px] font-mono text-slate-300 rounded shadow-[0_4px_20px_rgba(0,0,0,0.8)] z-50 pointer-events-none">
          {title && <span className="block font-bold text-cyan-400 mb-0.5">{title}</span>}
          {text}
        </span>
      )}
    </span>
  );
}

export default function GridStation({ onNavigate }: GridStationProps) {
  const [{ wallet }, connect] = useConnectWallet();
  const [{ connectedChain }, setChain] = useSetChain();

  // Connected state
  const connectedAddress = wallet?.accounts?.[0]?.address;
  const connectedChainId = connectedChain
    ? parseInt(connectedChain.id, 16)
    : wallet?.chains?.[0]?.id
    ? parseInt(wallet.chains[0].id, 16)
    : BASE_CHAIN_ID;
  const isWrongChain = !!wallet && connectedChainId !== BASE_CHAIN_ID;

  // On-chain state
  const [currentEpoch, setCurrentEpoch] = useState<number>(36055);
  const [naraBalance, setNaraBalance] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [naraAllowance, setNaraAllowance] = useState<ethers.BigNumber>(ethers.BigNumber.from(0));
  const [lockFeeWei, setLockFeeWei] = useState<ethers.BigNumber>(ethers.utils.parseEther("0.001"));
  const [userPositions, setUserPositions] = useState<PositionNftItem[]>([]);
  const [slottedTokenIds, setSlottedTokenIds] = useState<ethers.BigNumber[]>([]);
  const [deckSummary, setDeckSummary] = useState<FleetDeckSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [previewSimulation, setPreviewSimulation] = useState<boolean>(false);

  // Form Inputs
  const [lockAmountInput, setLockAmountInput] = useState<string>("100");
  const [selectedHorizonIdx, setSelectedHorizonIdx] = useState<number>(4); // Default 365 days
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [txSuccessMsg, setTxSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [inspectModalItem, setInspectModalItem] = useState<PositionNftItem | null>(null);

  const selectedHorizon = DURATION_HORIZONS[selectedHorizonIdx];

  // Helper Provider
  const getProvider = useCallback(() => {
    if (wallet?.provider) {
      return new ethers.providers.Web3Provider(wallet.provider, "any");
    }
    return new ethers.providers.JsonRpcProvider(DEFAULT_BASE_RPC);
  }, [wallet]);

  // Chain Switcher
  const handleSwitchToBase = useCallback(async () => {
    try {
      await setChain({ chainId: "0x2105", chainNamespace: "evm" });
    } catch (err: any) {
      setErrorMsg("Failed to switch to Base network: " + (err.message || err));
    }
  }, [setChain]);



  // Fetch On-Chain State
  const fetchState = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const provider = getProvider();

      // Read Engine state
      const engineContract = new ethers.Contract(GRID_ADDRESSES.engine, engineAbi, provider);
      try {
        const [ep, fee] = await Promise.all([
          engineContract.currentEpoch(),
          engineContract.lockFeeWei(),
        ]);
        setCurrentEpoch(ep.toNumber());
        if (fee) setLockFeeWei(fee);
      } catch (err) {
        console.warn("Could not query engine state:", err);
      }

      // If user connected, query balances and NFTs
      if (connectedAddress) {
        const tokenContract = new ethers.Contract(GRID_ADDRESSES.naraToken, erc20Abi, provider);
        const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, provider);

        const [bal, allowance, nextIdBn] = await Promise.all([
          tokenContract.balanceOf(connectedAddress),
          tokenContract.allowance(connectedAddress, GRID_ADDRESSES.positionNft),
          nftContract.nextTokenId().catch(() => ethers.BigNumber.from(1)),
        ]);

        setNaraBalance(bal);
        setNaraAllowance(allowance);

        const nextId = nextIdBn.toNumber();
        const items: PositionNftItem[] = [];
        const ownedIds: ethers.BigNumber[] = [];

        // Scan owned positions (capped loop for snappy responsiveness)
        const scanLimit = Math.min(nextId, 120);
        for (let i = 1; i < scanLimit; i++) {
          const tid = ethers.BigNumber.from(i);
          try {
            const owner = await nftContract.ownerOf(tid);
            if (owner.toLowerCase() === connectedAddress.toLowerCase()) {
              ownedIds.push(tid);
              const [posId, posInfo, genMeta, account, uri] = await Promise.all([
                nftContract.positionIdOf(tid).catch(() => ethers.BigNumber.from(0)),
                nftContract.positionInfo(tid).catch(() => ({
                  owner: ethers.constants.AddressZero,
                  createdEpoch: 0,
                  flags: 0,
                  amount: ethers.BigNumber.from(0),
                  weight: ethers.BigNumber.from(0),
                  activationEpoch: 0,
                  unlockEpoch: 0,
                  tokenWeight: ethers.BigNumber.from(0),
                  naraDebtRay: ethers.BigNumber.from(0),
                  ethDebtRay: ethers.BigNumber.from(0),
                })),
                nftContract.genesisMetadataOf(tid).catch(() => ({
                  isGenesis: false,
                  isEternal: false,
                  genesisMultiplierBps: 0,
                  permanentMultiplierBps: 0,
                  totalMultiplierBps: 0,
                  createdEpoch: 0,
                  rewardWeight: ethers.BigNumber.from(0),
                })),
                nftContract.accountOf(tid).catch(() => ethers.constants.AddressZero),
                nftContract.tokenURI(tid).catch(() => ""),
              ]);

              let claimableNara = ethers.BigNumber.from(0);
              let claimableEth = ethers.BigNumber.from(0);

              if (posId.gt(0)) {
                try {
                  const claimRes = await engineContract.claimableRewards(posId);
                  claimableNara = claimRes.naraAmount || claimRes[0];
                  claimableEth = claimRes.ethAmount || claimRes[1];
                } catch {}
              }

              const meta = parseTokenUri(uri);

              items.push({
                tokenId: tid,
                positionId: posId,
                owner: connectedAddress,
                account,
                amount: posInfo.amount,
                createdEpoch: Number(posInfo.createdEpoch),
                unlockEpoch: Number(posInfo.unlockEpoch),
                weight: posInfo.weight,
                claimableEth,
                claimableNara,
                tokenUri: uri,
                name: meta.name || `Position #${tid.toString()}`,
                description: meta.description,
                imageSvg: meta.imageSvg,
                attributes: meta.attributes,
                isGenesis: genMeta.isGenesis,
                isEternal: genMeta.isEternal,
              });
            }
          } catch {}
        }

        setUserPositions(items);

        // Auto-slot up to 6 positions if empty
        let activeSlotted = slottedTokenIds.filter((id) =>
          ownedIds.some((owned) => owned.eq(id))
        );
        if (activeSlotted.length === 0 && ownedIds.length > 0) {
          activeSlotted = ownedIds.slice(0, 6);
        }
        setSlottedTokenIds(activeSlotted);

        // Update Lens synergy if slotted
        if (activeSlotted.length > 0) {
          await updateLensDeck(activeSlotted, connectedAddress, provider);
        } else {
          setDeckSummary(null);
        }
      } else {
        // Unauthenticated preview
        setPreviewSimulation(true);
        setUserPositions(SAMPLE_POSITIONS);
        setSlottedTokenIds(SAMPLE_POSITIONS.map((p) => p.tokenId));
      }
    } catch (err: any) {
      console.error("fetchState error:", err);
      setErrorMsg(err.message || "Failed to sync station state.");
    } finally {
      setLoading(false);
    }
  }, [connectedAddress, getProvider]);

  // Update Fleet Deck Lens Summary
  const updateLensDeck = async (
    tokenIds: ethers.BigNumber[],
    userAddr: string,
    provider: ethers.providers.Provider
  ) => {
    if (!GRID_ADDRESSES.fleetDeckLens || tokenIds.length === 0) {
      setDeckSummary(null);
      return;
    }
    try {
      const lensContract = new ethers.Contract(
        GRID_ADDRESSES.fleetDeckLens,
        fleetDeckLensAbi,
        provider
      );
      const res = await lensContract.getFleetDeckSummary(
        userAddr,
        tokenIds.map((id) => id.toString())
      );
      const deck = res.deck || res[0];
      setDeckSummary({
        user: deck.user,
        totalLockedNara: deck.totalLockedNara,
        totalWeight: deck.totalWeight,
        formattedWeightedMultiplier: deck.formattedWeightedMultiplier,
        formattedDeckSynergyMultiplier: deck.formattedDeckSynergyMultiplier,
        formattedTotalEffectiveMultiplier: deck.formattedTotalEffectiveMultiplier,
        effectiveTotalWeight: deck.effectiveTotalWeight,
        synergyTierName: deck.synergy.synergyTierName,
        synergyBonusBps: Number(deck.synergy.totalSynergyBonusBps),
        activeSlotsCount: Number(deck.synergy.activeSlotsCount),
        hasGenesisAura: deck.synergy.hasGenesisAura,
        aggregateClaimableNara: deck.aggregateClaimableNara,
        aggregateClaimableEth: deck.aggregateClaimableEth,
      });
    } catch (err) {
      console.warn("Could not query Fleet Deck Lens:", err);
    }
  };

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Slot Management (Picks & Matches)
  const handleEquip = async (tokenId: ethers.BigNumber) => {
    if (slottedTokenIds.some((id) => id.eq(tokenId))) return;
    if (slottedTokenIds.length >= 6) {
      setErrorMsg("Maximum 6 active formation slots reached. Unequip a card first.");
      return;
    }
    const updated = [...slottedTokenIds, tokenId];
    setSlottedTokenIds(updated);
    if (connectedAddress) {
      await updateLensDeck(updated, connectedAddress, getProvider());
    }
  };

  const handleUnequip = async (tokenId: ethers.BigNumber) => {
    const updated = slottedTokenIds.filter((id) => !id.eq(tokenId));
    setSlottedTokenIds(updated);
    if (connectedAddress) {
      await updateLensDeck(updated, connectedAddress, getProvider());
    }
  };

  const handleAutoEquipTop6 = async () => {
    if (userPositions.length === 0) return;
    const sorted = [...userPositions].sort((a, b) => (b.amount.gt(a.amount) ? 1 : -1));
    const top6 = sorted.slice(0, 6).map((n) => n.tokenId);
    setSlottedTokenIds(top6);
    if (connectedAddress) {
      await updateLensDeck(top6, connectedAddress, getProvider());
    }
    setTxSuccessMsg("Top positions auto-equipped for maximum formation synergy!");
  };

  const handleClearSlots = () => {
    setSlottedTokenIds([]);
    setDeckSummary(null);
  };

  // On-Chain Actions
  const parsedLockAmount = useMemo(() => {
    try {
      if (!lockAmountInput || isNaN(Number(lockAmountInput))) return ethers.BigNumber.from(0);
      return ethers.utils.parseEther(lockAmountInput);
    } catch {
      return ethers.BigNumber.from(0);
    }
  }, [lockAmountInput]);

  const hasZeroBalance = !!wallet && naraBalance.isZero();
  const needsApproval =
    !!wallet && parsedLockAmount.gt(0) && naraAllowance.lt(parsedLockAmount);

  const handleApprove = async () => {
    if (!wallet || !connectedAddress) {
      await connect();
      return;
    }
    if (isWrongChain) {
      await handleSwitchToBase();
      return;
    }
    try {
      setActionBusy("approve");
      setErrorMsg(null);
      setTxSuccessMsg(null);

      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const tokenContract = new ethers.Contract(GRID_ADDRESSES.naraToken, erc20Abi, signer);

      const tx = await tokenContract.approve(
        GRID_ADDRESSES.positionNft,
        ethers.constants.MaxUint256
      );
      setTxSuccessMsg("Approval submitted. Waiting for confirmation on Base...");
      await tx.wait();
      setTxSuccessMsg("Approval confirmed! Now ready to commit and join the Grid.");
      await fetchState();
    } catch (err: any) {
      console.error("Approve error:", err);
      setErrorMsg(err.reason || err.message || "Approval failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleCommit = async () => {
    if (!wallet || !connectedAddress) {
      await connect();
      return;
    }
    if (isWrongChain) {
      await handleSwitchToBase();
      return;
    }
    if (parsedLockAmount.isZero()) {
      setErrorMsg("Please enter an amount of NARA to commit.");
      return;
    }
    try {
      setActionBusy("commit");
      setErrorMsg(null);
      setTxSuccessMsg(null);

      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);
      const tokenContract = new ethers.Contract(GRID_ADDRESSES.naraToken, erc20Abi, signer);

      // Pre-flight check: Verify allowance directly on-chain before sending
      let currentAllowance: ethers.BigNumber = await tokenContract
        .allowance(connectedAddress, GRID_ADDRESSES.positionNft)
        .catch(() => naraAllowance);

      if (currentAllowance.lt(parsedLockAmount)) {
        setTxSuccessMsg("Additional NARA approval required for this amount. Prompting wallet approval...");
        const approveTx = await tokenContract.approve(GRID_ADDRESSES.positionNft, ethers.constants.MaxUint256);
        setTxSuccessMsg("Approval submitted! Waiting for Base confirmation...");
        await approveTx.wait();
        currentAllowance = ethers.constants.MaxUint256;
        setTxSuccessMsg("Approval confirmed! Now minting your Position NFT...");
      }

      // Ensure fresh lockFeeWei directly from engine
      let feeWei = lockFeeWei;
      try {
        const engineContract = new ethers.Contract(GRID_ADDRESSES.engine, engineAbi, provider);
        feeWei = await engineContract.lockFeeWei();
      } catch {
        // fallback to existing feeWei
      }

      const durationEpochs = selectedHorizon.epochs;
      const tx = await nftContract.mintAndLockFor(
        connectedAddress,
        parsedLockAmount,
        durationEpochs,
        0,
        { value: feeWei }
      );
      setTxSuccessMsg("Commitment submitted! Minting your on-chain Position NFT...");
      await tx.wait();

      setTxSuccessMsg("Position created! Your active cells are now live on the Grid.");
      await fetchState();
    } catch (err: any) {
      console.error("Commit error:", err);
      const errStr = (err?.data || err?.error?.data || err?.message || "").toString();
      if (errStr.includes("0xfb8f41b2") || errStr.includes("ERC20InsufficientAllowance") || errStr.includes("insufficient allowance")) {
        setErrorMsg("NARA allowance exhausted. Please click Step 1: Approve NARA to restore allowance.");
      } else if (errStr.includes("0x1f2a2005") || errStr.includes("IncorrectNativeFee")) {
        setErrorMsg("Network anti-spam fee mismatch. Please retry.");
      } else {
        setErrorMsg(err.reason || err.message || "Commitment transaction failed.");
      }
    } finally {
      setActionBusy(null);
    }
  };

  const handleHarvestSingle = async (tokenId: ethers.BigNumber) => {
    if (!wallet || !connectedAddress) return;
    try {
      setActionBusy(`harvest-${tokenId.toString()}`);
      setErrorMsg(null);
      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);

      const tx = await nftContract.claimRewards(tokenId, connectedAddress);
      setTxSuccessMsg(`Harvesting position #${tokenId.toString()}...`);
      await tx.wait();
      setTxSuccessMsg(`Harvested successfully! Resources sent to your wallet.`);
      await fetchState();
    } catch (err: any) {
      setErrorMsg(err.reason || err.message || "Harvest failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleHarvestAll = async () => {
    if (!wallet || !connectedAddress) return;
    if (slottedTokenIds.length === 0) {
      setErrorMsg("No positions slotted in Fleet Deck to harvest.");
      return;
    }
    try {
      setActionBusy("harvest-all");
      setErrorMsg(null);
      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);

      for (const tid of slottedTokenIds) {
        try {
          const tx = await nftContract.claimRewards(tid, connectedAddress);
          await tx.wait();
        } catch (err) {
          console.warn(`Harvest failed for #${tid.toString()}:`, err);
        }
      }
      setTxSuccessMsg("All slotted positions harvested successfully!");
      await fetchState();
    } catch (err: any) {
      setErrorMsg(err.reason || err.message || "Harvest all failed.");
    } finally {
      setActionBusy(null);
    }
  };

  const handleUnlock = async (tokenId: ethers.BigNumber) => {
    if (!wallet || !connectedAddress) return;
    try {
      setActionBusy(`unlock-${tokenId.toString()}`);
      setErrorMsg(null);
      const provider = new ethers.providers.Web3Provider(wallet.provider, "any");
      const signer = provider.getSigner();
      const nftContract = new ethers.Contract(GRID_ADDRESSES.positionNft, positionNftAbi, signer);

      const tx = await nftContract.unlock(tokenId, connectedAddress, { value: lockFeeWei });
      setTxSuccessMsg(`Unlocking position #${tokenId.toString()}...`);
      await tx.wait();
      setTxSuccessMsg(`Position unlocked! Principal returned to wallet.`);
      await fetchState();
    } catch (err: any) {
      setErrorMsg(err.reason || err.message || "Unlock failed.");
    } finally {
      setActionBusy(null);
    }
  };

  // Aggregate stats
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

  // LAZY CONTROLS STATE MACHINE: Proactive Next-Action Detector
  const proactiveNextStep = useMemo(() => {
    if (!wallet) {
      return {
        title: "ACTION REQUIRED: INITIALIZE IDENTITY",
        actionText: "CONNECT WALLET",
        desc: "Connect your Web3 wallet to access your Active Cells and Fleet Deck.",
        onClick: () => connect(),
        badge: "DISCONNECTED",
        tone: "cyan",
      };
    }
    if (isWrongChain) {
      return {
        title: "NETWORK MISMATCH: BASE MAINNET REQUIRED",
        actionText: "SWITCH TO BASE",
        desc: "NARA protocol operates exclusively on Base (Chain ID: 8453).",
        onClick: () => handleSwitchToBase(),
        badge: "WRONG CHAIN",
        tone: "amber",
      };
    }
    if (hasZeroBalance) {
      return {
        title: "NEXT MOVE: ACQUIRE NARA CELLS",
        actionText: "GET $NARA VIA SWAP",
        desc: "You need $NARA in your wallet to join the Grid. Swap ETH/USDC instantly.",
        onClick: () => onNavigate?.("/swap"),
        badge: "ZERO BALANCE",
        tone: "blue",
      };
    }
    if (needsApproval) {
      return {
        title: "STEP 1 OF 2: PERMIT WRAPPER ACCESS",
        actionText: "APPROVE NARA",
        desc: "Authorize the Position NFT wrapper to commit your requested cell allocation.",
        onClick: () => handleApprove(),
        badge: "APPROVAL REQUIRED",
        tone: "cyan",
      };
    }
    if (parsedLockAmount.gt(0)) {
      const formattedInput = parseFloat(lockAmountInput || "0").toLocaleString("en-US", {
        maximumFractionDigits: 2,
      });
      return {
        title: "STEP 2 OF 2: READY TO COMMIT",
        actionText: "CONFIGURE IN PANEL 1",
        desc: `Locks ${formattedInput} NARA for ${selectedHorizon.label} (${selectedHorizon.epochs} epochs) to mint your on-chain NFT.`,
        onClick: () => {
          document.getElementById("commit-action-btn")?.scrollIntoView({ behavior: "smooth" });
        },
        badge: "STEP 2 OF 2",
        tone: "cyan",
        isReadyToCommit: true,
      };
    }
    if (aggregateClaimableEth.gt(0) || aggregateClaimableNara.gt(0)) {
      return {
        title: "RESOURCES ACCUMULATED",
        actionText: "HARVEST ALL RESOURCES",
        desc: "Ecosystem swap and pulse fees are ready to harvest to self-custody.",
        onClick: () => handleHarvestAll(),
        badge: "HARVEST READY",
        tone: "emerald",
        isReadyToCommit: false,
      };
    }
    if (userPositions.length > 0 && slottedTokenIds.length < Math.min(6, userPositions.length)) {
      return {
        title: "FORMATION UNFILLED",
        actionText: "AUTO-EQUIP BEST SYNERGY",
        desc: "Fill your 6 active Fleet Deck slots to unlock formation synergy bonuses.",
        onClick: () => handleAutoEquipTop6(),
        badge: "SYNERGY BOOST",
        tone: "blue",
        isReadyToCommit: false,
      };
    }
    return {
      title: "ALL SYSTEMS NOMINAL",
      actionText: "EXPLORE FLEET DECK",
      desc: "Your cells are actively monitoring the 15-minute network pulse.",
      onClick: () => {},
      badge: "ACTIVE",
      tone: "cyan",
      isReadyToCommit: false,
    };
  }, [
    wallet,
    isWrongChain,
    hasZeroBalance,
    needsApproval,
    parsedLockAmount,
    lockAmountInput,
    selectedHorizon,
    aggregateClaimableEth,
    aggregateClaimableNara,
    userPositions.length,
    slottedTokenIds.length,
    connect,
    handleSwitchToBase,
    handleApprove,
    handleCommit,
    handleHarvestAll,
    handleAutoEquipTop6,
    onNavigate,
  ]);

  return (
    <main className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-10 pt-8 sm:pt-12 pb-44 sm:pb-52 md:pb-60 flex flex-col gap-8 sm:gap-10 font-sans">
      {/* Station Title & Live Telemetry Header Bar */}
      <div className="space-y-4 pb-6 border-b border-white/[0.08]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/15 border border-cyan-400/30 text-cyan-300 text-[11px] font-sans font-semibold tracking-wider uppercase shadow-[0_0_12px_rgba(0,240,255,0.15)]">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              <span>SOVEREIGN GRID STATION · SECTOR 01</span>
            </div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-white uppercase font-display">
              FLEET COMMAND & ACTIVE CELLS
            </h1>
          </div>
        </div>

        {/* Quiet, Refined Telemetry Status Strip */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 sm:px-5 rounded-2xl bg-[#060a18]/95 border border-white/10 backdrop-blur-2xl shadow-xl ring-1 ring-white/5">
          {/* Secondary stats (Epoch, Pulse, Sync) */}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap text-slate-400 text-xs font-sans">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400/60 shadow-[0_0_6px_rgba(0,240,255,0.4)]" />
              <span className="text-slate-400 font-medium uppercase">EPOCH</span>
              <span className="font-bold text-white font-mono">{currentEpoch.toLocaleString("en-US")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <span className="text-slate-400 font-medium uppercase">PULSE</span>
              <span className="font-bold text-emerald-300 font-mono">15 MIN</span>
              <InfoCircle text="Every 15 minutes the Engine advances an epoch, distributing network resources to active cells." />
            </div>
            <button
              type="button"
              onClick={() => fetchState()}
              disabled={loading}
              className="p-1 px-3 rounded-lg bg-white/[0.04] hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white transition-all flex items-center gap-1.5 text-xs font-medium"
              title="Refresh Station State"
            >
              <ArrowsClockwise size={12} className={loading ? "animate-spin text-cyan-400" : ""} />
              <span>SYNC</span>
            </button>
          </div>

          {/* Headline User Balance (Elevated Primary Metric in Glass Capsule) */}
          <div className="inline-flex items-center gap-3 px-3.5 py-1.5 rounded-xl bg-[#060a18]/95 border border-cyan-500/30 shadow-[0_8px_30px_rgba(0,0,0,0.8),0_0_15px_rgba(0,240,255,0.12)] ring-1 ring-cyan-500/20">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500 shadow-[0_0_8px_#00f0ff]" />
              </span>
              <span className="text-[11px] font-sans font-semibold tracking-wider text-slate-300 uppercase select-none">
                MY ACTIVE CELLS
              </span>
            </div>
            <div className="h-4 w-[1px] bg-white/15" />
            <span className="text-base sm:text-lg font-black text-cyan-300 font-mono tracking-wide drop-shadow-[0_0_12px_rgba(0,240,255,0.65)]">
              <TacticalNumber value={totalUserCells} symbol="CELLS" noUnderline symbolClassName="text-xs text-cyan-400/80 font-semibold" />
            </span>
            <InfoCircle text="Total NARA locked across your positions. 1 NARA = 1 Active Cell on the Sovereign Grid. Hover numbers for full unrounded precision." />
          </div>
        </div>
      </div>

      {/* PROACTIVE NEXT-ACTION STEP GUIDE (Zero Dead Ends, Calm Restraint) */}
      <div className="p-4 sm:px-5 sm:py-3.5 rounded-xl bg-[#060a15]/70 border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-white/5 text-slate-300 border border-white/10 tracking-wider">
              {proactiveNextStep.badge}
            </span>
            <span className="text-xs sm:text-sm font-bold text-slate-200 tracking-wide uppercase">
              {proactiveNextStep.title}
            </span>
          </div>
          <p className="text-[11px] text-slate-400">{proactiveNextStep.desc}</p>
        </div>

        {/* Action Button: Non-competing secondary when ready to commit, or clear action when needed */}
        {(proactiveNextStep as any).isReadyToCommit ? (
          <button
            type="button"
            onClick={proactiveNextStep.onClick}
            className="self-stretch sm:self-auto shrink-0 py-2 px-4 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-cyan-300 text-xs font-semibold transition-colors flex items-center justify-center gap-1.5"
          >
            <span>↓ PROCEED TO PANEL 1 BELOW</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={proactiveNextStep.onClick}
            disabled={actionBusy !== null}
            className="self-stretch sm:self-auto shrink-0 py-2.5 px-5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white text-xs font-bold transition-colors"
          >
            {actionBusy ? "TRANSACTING..." : proactiveNextStep.actionText}
          </button>
        )}
      </div>

      {/* Notifications / Flash Alerts */}
      {txSuccessMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-xs rounded-xl flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle size={16} className="shrink-0 text-emerald-400" />
            {txSuccessMsg}
          </span>
          <button onClick={() => setTxSuccessMsg(null)} className="text-emerald-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center justify-between">
          <span className="flex items-center gap-2">
            <WarningCircle size={16} className="shrink-0 text-rose-400" />
            {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Grid Workstation (Two Columns on Desktop with Generous Breathing Room) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10">
        {/* LEFT COLUMN: MODULE 1 — JOIN THE GRID (Commit Hero) & HARVESTER */}
        <div className="lg:col-span-5 flex flex-col gap-8">
          {/* ZONE 1: JOIN THE GRID (The Single Primary Action Focal Point) */}
          <div
            id="commit-section"
            className="p-6 sm:p-7 rounded-2xl bg-[#0b1021]/90 border-t border-cyan-500/30 border-x border-b border-white/[0.08] backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.6)] space-y-6"
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h2 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Lightning size={16} className="text-cyan-400" />
                <span>1. JOIN THE GRID</span>
              </h2>
              <span className="text-[9.5px] text-slate-400 bg-white/[0.04] px-2.5 py-1 rounded-md border border-white/[0.06]">
                1 NARA = 1 ACTIVE CELL
              </span>
            </div>

            {/* Wallet Balance Strip */}
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>AVAILABLE TO COMMIT:</span>
              <span className="font-bold text-white">
                {wallet ? <TacticalNumber value={naraBalance} symbol="NARA" /> : "CONNECT WALLET"}
              </span>
            </div>

            {/* Amount Input with Lazy Presets */}
            <div className="space-y-2.5">
              <div className="relative flex items-center">
                <input
                  type="number"
                  min="1"
                  step="any"
                  value={lockAmountInput}
                  onChange={(e) => setLockAmountInput(e.target.value)}
                  placeholder="0.0"
                  className="w-full bg-[#040711] border border-white/[0.1] focus:border-cyan-400/80 rounded-xl px-4 py-3.5 text-white text-base font-bold outline-none tracking-wider font-mono pr-20 transition-colors"
                />
                <span className="absolute right-4 text-xs font-bold text-slate-400">NARA</span>
              </div>

              {/* Quick 1-Tap Lazy Presets */}
              <div className="grid grid-cols-4 gap-2">
                {["100", "500", "1000", "MAX"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      if (preset === "MAX") {
                        const num = parseFloat(ethers.utils.formatEther(naraBalance || 0));
                        setLockAmountInput(isNaN(num) ? "0.00" : num.toFixed(2));
                      } else {
                        setLockAmountInput(preset);
                      }
                    }}
                    className="px-2.5 py-2 rounded-lg bg-[#050814] hover:bg-white/10 text-slate-300 hover:text-white border border-white/[0.07] hover:border-white/20 text-[10px] font-semibold transition-all text-center"
                  >
                    {preset === "MAX" ? "MAX" : preset}
                  </button>
                ))}
              </div>
            </div>

            {/* DURATION HORIZON PICKER (5 Presets) */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1">
                  DURATION HORIZON
                  <InfoCircle text="Longer commitment horizons yield a higher participation weight multiplier (up to 4.00x) for every 15-minute pulse." />
                </span>
                <span className="text-cyan-300 font-bold">
                  {selectedHorizon.label} · {selectedHorizon.multiplier}
                </span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {DURATION_HORIZONS.map((horizon, idx) => {
                  const isSelected = idx === selectedHorizonIdx;
                  return (
                    <button
                      key={horizon.label}
                      type="button"
                      onClick={() => setSelectedHorizonIdx(idx)}
                      className={`p-2.5 rounded-xl flex flex-col items-center justify-center gap-1.5 text-center transition-all border ${
                        isSelected
                          ? "bg-cyan-950/40 border-cyan-400/60 text-white shadow-[0_0_12px_rgba(0,240,255,0.15)]"
                          : "bg-[#050814] border-white/[0.06] text-slate-400 hover:text-white hover:border-white/15"
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase">{horizon.label}</span>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                          isSelected ? "bg-cyan-400 text-black" : "bg-white/5 text-cyan-400/80"
                        }`}
                      >
                        {horizon.multiplier}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Commitment Summary Wells */}
            <div className="p-4 rounded-xl bg-[#050813]/80 border border-white/[0.05] space-y-2.5 text-[11px]">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">ACTIVE CELLS GENERATED:</span>
                <span className="text-white font-bold">
                  <TacticalNumber value={parsedLockAmount} symbol="CELLS" />
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-500/30">
                <span className="text-cyan-200 font-bold uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#00f0ff]" />
                  EFFECTIVE WEIGHT:
                </span>
                <span className="text-cyan-300 font-black text-sm sm:text-base drop-shadow-[0_0_10px_rgba(0,240,255,0.7)]">
                  <TacticalNumber
                    value={parsedLockAmount
                      .mul(Math.round(parseFloat(selectedHorizon.multiplier) * 100))
                      .div(100)}
                    symbol="WEIGHT"
                    noUnderline
                    symbolClassName="text-[10px] text-cyan-400/80 font-semibold"
                  />
                </span>
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-white/[0.04] pt-2">
                <span>ANTI-SPAM ETH FEE:</span>
                <span>
                  <TacticalNumber value={lockFeeWei} symbol="ETH" decimals={4} />
                </span>
              </div>
            </div>

            {/* Dynamic Dual-Action Lazy Button — THE UNDISPUTED PRIMARY HERO BUTTON */}
            <div id="commit-action-well" className="pt-2">
              {!wallet ? (
                <button
                  type="button"
                  onClick={() => connect()}
                  className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold"
                >
                  <span className="corner tl"></span>
                  <span className="corner tr"></span>
                  <span className="corner bl"></span>
                  <span className="corner br"></span>
                  CONNECT WALLET TO COMMIT
                </button>
              ) : isWrongChain ? (
                <button
                  type="button"
                  onClick={handleSwitchToBase}
                  className="btn-ticks w-full !py-4 text-xs sm:text-sm font-bold text-amber-300 border-amber-500/40"
                >
                  <span className="corner tl"></span>
                  <span className="corner tr"></span>
                  <span className="corner bl"></span>
                  <span className="corner br"></span>
                  SWITCH NETWORK TO BASE
                </button>
              ) : hasZeroBalance ? (
                <button
                  type="button"
                  onClick={() => onNavigate?.("/swap")}
                  className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold text-cyan-300"
                >
                  <span className="corner tl"></span>
                  <span className="corner tr"></span>
                  <span className="corner bl"></span>
                  <span className="corner br"></span>
                  ACQUIRE $NARA ON SWAP
                </button>
              ) : needsApproval ? (
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={actionBusy === "approve"}
                  className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold text-cyan-300"
                >
                  <span className="corner tl"></span>
                  <span className="corner tr"></span>
                  <span className="corner bl"></span>
                  <span className="corner br"></span>
                  {actionBusy === "approve" ? "APPROVING..." : "STEP 1: APPROVE NARA"}
                </button>
              ) : (
                <button
                  id="commit-action-btn"
                  type="button"
                  onClick={handleCommit}
                  disabled={actionBusy === "commit"}
                  className="btn-ticks primary w-full !py-4 text-xs sm:text-sm font-bold text-cyan-200 tracking-wider shadow-[0_0_20px_rgba(0,240,255,0.25)] hover:shadow-[0_0_30px_rgba(0,240,255,0.4)]"
                >
                  <span className="corner tl"></span>
                  <span className="corner tr"></span>
                  <span className="corner bl"></span>
                  <span className="corner br"></span>
                  {actionBusy === "commit" ? "COMMITTING..." : "STEP 2: COMMIT & JOIN THE GRID"}
                </button>
              )}
            </div>
          </div>

          {/* ZONE 2: ACCUMULATED RESOURCES (Harvester Vault — Receded Tone) */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#060a15]/85 border border-white/[0.06] backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
              <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <Coins size={16} className="text-emerald-400/80" />
                <span>ACCUMULATED RESOURCES</span>
              </h3>
              <span className="text-[9.5px] text-emerald-400/80 bg-emerald-950/30 px-2.5 py-0.5 rounded border border-emerald-500/20">
                READY TO HARVEST
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3.5">
              <div className="p-3.5 bg-[#03060d]/80 border border-white/[0.04] rounded-xl">
                <span className="text-[10px] text-slate-500 block mb-1">CAPTURED ETH</span>
                <span className="text-sm sm:text-base font-bold text-white">
                  <TacticalNumber value={aggregateClaimableEth} symbol="ETH" decimals={4} />
                </span>
              </div>
              <div className="p-3.5 bg-gradient-to-br from-cyan-950/30 via-[#03060d] to-[#040814] border border-cyan-500/30 rounded-xl">
                <span className="text-[10px] text-cyan-300 font-bold block mb-1">EMITTED NARA</span>
                <span className="text-sm sm:text-base font-black text-cyan-300 drop-shadow-[0_0_10px_rgba(0,240,255,0.7)]">
                  <TacticalNumber value={aggregateClaimableNara} symbol="NARA" decimals={2} noUnderline symbolClassName="text-xs text-cyan-400/80 font-semibold" />
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleHarvestAll}
              disabled={
                actionBusy !== null ||
                (aggregateClaimableEth.isZero() && aggregateClaimableNara.isZero())
              }
              className={`w-full py-3.5 px-4 rounded-xl text-xs font-bold transition-all ${
                !aggregateClaimableEth.isZero() || !aggregateClaimableNara.isZero()
                  ? "bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/40 text-emerald-300 shadow-sm"
                  : "bg-white/[0.02] border border-white/[0.05] text-slate-500 cursor-not-allowed"
              }`}
            >
              {actionBusy === "harvest-all" ? "HARVESTING..." : "HARVEST ALL TO WALLET"}
            </button>
          </div>
        </div>

        {/* RIGHT COLUMN: MODULE 2 — ACTIVE FLEET DECK ("PICKS & MATCHES") & INVENTORY */}
        <div className="lg:col-span-7 flex flex-col gap-8">
          {/* ZONE 3: ACTIVE FLEET DECK (Tactical Command Bridge) */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#080d1c]/85 border border-white/[0.06] backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Cpu size={16} className="text-blue-400/80" />
                <h3 className="text-sm font-bold tracking-wider text-white uppercase">
                  ACTIVE FLEET DECK (6 FORMATION SLOTS)
                </h3>
              </div>

              {/* Synergy Multiplier Badge */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] px-2.5 py-0.5 rounded bg-blue-950/30 border border-blue-500/20 text-blue-300 font-bold">
                  {deckSummary?.synergyTierName || "FORMATION SYNERGY"}
                </span>
                <span className="text-sm sm:text-base font-black text-cyan-300 font-mono drop-shadow-[0_0_10px_rgba(0,240,255,0.65)]">
                  {deckSummary?.formattedTotalEffectiveMultiplier || "1.00X"}
                </span>
                <InfoCircle text="Picks & Matches: Slotting up to 6 Position NFTs unlocks Formation Synergy and Genesis Aura bonuses calculated via NARAFleetDeckLens." />
              </div>
            </div>

            {/* Quick Formation Controls */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>
                SLOTS: <strong className="text-white">{slottedTokenIds.length} / 6</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAutoEquipTop6}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[10px] font-bold rounded-lg transition-colors"
                >
                  AUTO-EQUIP TOP 6
                </button>
                {slottedTokenIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearSlots}
                    className="px-3 py-1.5 bg-white/[0.02] hover:bg-white/10 border border-white/[0.06] text-slate-500 hover:text-white text-[10px] rounded-lg transition-colors"
                  >
                    CLEAR
                  </button>
                )}
              </div>
            </div>

            {/* 6 Formation Slots Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
              {[0, 1, 2, 3, 4, 5].map((slotIdx) => {
                const tokenId = slottedTokenIds[slotIdx];
                const position = tokenId
                  ? userPositions.find((p) => p.tokenId.eq(tokenId))
                  : null;

                if (position) {
                  return (
                    <div
                      key={slotIdx}
                      className="relative p-3.5 rounded-xl bg-[#0b1224]/90 border border-blue-500/25 flex flex-col justify-between h-36 group transition-colors hover:border-blue-400/40"
                    >
                      <button
                        type="button"
                        onClick={() => handleUnequip(position.tokenId)}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-white/10 flex items-center justify-center text-[10px] transition-colors"
                        title="Unequip Slot"
                      >
                        ×
                      </button>

                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-cyan-400/80 block">
                          SLOT #{slotIdx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-white truncate">{position.name}</h4>
                        <span className="text-[10px] text-slate-400 block">
                          <TacticalNumber value={position.amount} symbol="CELLS" />
                        </span>
                      </div>

                      <div className="border-t border-white/[0.06] pt-1.5 flex items-center justify-between text-[9px]">
                        <span className="text-emerald-400/90 font-bold">ACTIVE</span>
                        <button
                          type="button"
                          onClick={() => setInspectModalItem(position)}
                          className="text-slate-400 hover:text-white inline-flex items-center gap-1 transition-colors"
                        >
                          <Eye size={11} /> VIEW
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={slotIdx}
                    className="p-3.5 rounded-xl bg-[#04060e]/80 border border-dashed border-white/[0.08] flex flex-col items-center justify-center text-center h-36 gap-2 text-slate-500 hover:border-white/20 transition-colors"
                  >
                    <span className="text-[9px] font-mono text-slate-600">SLOT #{slotIdx + 1}</span>
                    <span className="w-7 h-7 rounded-full bg-white/[0.03] border border-white/[0.08] flex items-center justify-center text-slate-500">
                      <Plus size={12} />
                    </span>
                    <span className="text-[9px] uppercase tracking-wider">EMPTY SLOT</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ZONE 4: POSITION NFT INVENTORY (Catalog Archive — Receded Substrate) */}
          <div className="p-6 sm:p-7 rounded-2xl bg-[#050813]/80 border border-white/[0.05] backdrop-blur-xl shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 flex-wrap gap-2">
              <h3 className="text-sm font-bold tracking-wider text-white uppercase flex items-center gap-2">
                <ShieldCheck size={16} className="text-slate-400" />
                <span>POSITION NFT INVENTORY ({userPositions.length})</span>
              </h3>

              {previewSimulation && (
                <span className="text-[10px] px-2.5 py-0.5 bg-amber-500/10 border border-amber-400/30 text-amber-300 rounded font-bold">
                  SIMULATION PREVIEW MODE
                </span>
              )}
            </div>

            {userPositions.length === 0 ? (
              <div className="p-8 text-center rounded-xl bg-[#03050b]/60 border border-dashed border-white/[0.07] space-y-2">
                <p className="text-xs text-slate-300">No Position NFTs detected in connected wallet.</p>
                <p className="text-[11px] text-slate-500">
                  Commit NARA in panel 1 to mint your first on-chain proof-of-position NFT!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[440px] overflow-y-auto pr-1">
                {userPositions.map((item) => {
                  const isSlotted = slottedTokenIds.some((id) => id.eq(item.tokenId));
                  const isMatured = currentEpoch >= item.unlockEpoch;

                  return (
                    <div
                      key={item.tokenId.toString()}
                      className={`p-4 rounded-xl border transition-all flex flex-col justify-between gap-3.5 ${
                        isSlotted
                          ? "bg-[#080e1c]/80 border-cyan-500/30"
                          : "bg-[#070b16]/70 border-white/[0.06] hover:border-white/15"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <span className="text-[9px] font-bold text-cyan-400/80 block">
                            TOKEN #{item.tokenId.toString()} · POS #{item.positionId.toString()}
                          </span>
                          <h4 className="text-xs font-bold text-white">{item.name}</h4>
                          <span className="text-[10px] text-slate-400 block">
                            <TacticalNumber value={item.amount} symbol="Active Cells" />
                          </span>
                        </div>

                        {/* Slotted / Status Badge */}
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase border ${
                            isSlotted
                              ? "bg-cyan-950/50 text-cyan-300 border-cyan-400/30"
                              : "bg-white/[0.04] text-slate-400 border-white/[0.08]"
                          }`}
                        >
                          {isSlotted ? "SLOTTED" : "UNSLOTTED"}
                        </span>
                      </div>

                      {/* Yield Tickers */}
                      <div className="p-2.5 rounded-lg bg-[#03060d]/80 border border-white/[0.04] grid grid-cols-2 gap-2 text-[10px]">
                        <div>
                          <span className="text-slate-500 block mb-0.5">CLAIMABLE ETH</span>
                          <span className="font-bold text-white">
                            <TacticalNumber value={item.claimableEth} symbol="ETH" decimals={4} />
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block mb-0.5">CLAIMABLE NARA</span>
                          <span className="font-bold text-cyan-300">
                            <TacticalNumber value={item.claimableNara} symbol="NARA" decimals={2} />
                          </span>
                        </div>
                      </div>

                      {/* Card Action Controls */}
                      <div className="flex items-center gap-2 pt-0.5">
                        {isSlotted ? (
                          <button
                            type="button"
                            onClick={() => handleUnequip(item.tokenId)}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-rose-950/30 hover:bg-rose-950/60 border border-rose-500/20 text-rose-300 text-[10px] font-bold transition-colors text-center"
                          >
                            UNEQUIP
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleEquip(item.tokenId)}
                            disabled={slottedTokenIds.length >= 6}
                            className="flex-1 py-1.5 px-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-[10px] font-bold transition-colors text-center disabled:opacity-40"
                          >
                            EQUIP TO DECK
                          </button>
                        )}

                        {(!item.claimableEth.isZero() || !item.claimableNara.isZero()) && (
                          <button
                            type="button"
                            onClick={() => handleHarvestSingle(item.tokenId)}
                            disabled={actionBusy === `harvest-${item.tokenId.toString()}`}
                            className="py-1.5 px-2.5 rounded-lg bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold transition-colors"
                            title="Harvest accumulated resources for this position"
                          >
                            HARVEST
                          </button>
                        )}

                        {isMatured && (
                          <button
                            type="button"
                            onClick={() => handleUnlock(item.tokenId)}
                            disabled={actionBusy === `unlock-${item.tokenId.toString()}`}
                            className="py-1.5 px-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold"
                          >
                            DISCONNECT
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setInspectModalItem(item)}
                          className="p-1.5 rounded-lg bg-white/[0.03] hover:bg-white/10 border border-white/[0.08] text-slate-400 hover:text-white text-[10px] transition-colors"
                          title="Inspect Metadata & SVG Plate"
                        >
                          <Eye size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* INSPECT MODAL (Dynamic SVG & On-Chain Traits) */}
      {inspectModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="relative w-full max-w-lg rounded-2xl bg-[#090e1c] border border-white/[0.1] p-6 space-y-5 shadow-[0_20px_50px_rgba(0,0,0,0.8)] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {inspectModalItem.name}
              </h3>
              <button
                onClick={() => setInspectModalItem(null)}
                className="text-slate-400 hover:text-white p-1 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* SVG Render or Plate Artwork */}
            <div className="w-full flex items-center justify-center bg-[#040711] rounded-xl border border-white/[0.06] p-4 min-h-[220px]">
              {inspectModalItem.imageSvg ? (
                <div
                  className="w-full max-w-[280px] rounded-lg overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: inspectModalItem.imageSvg }}
                />
              ) : (
                <div className="text-center space-y-2 py-8">
                  <Cpu size={48} className="text-cyan-400/60 mx-auto" />
                  <span className="text-xs text-slate-300 block font-mono">
                    ON-CHAIN NARA POSITION PLATE
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    <TacticalNumber value={inspectModalItem.amount} symbol="NARA" /> Committed
                  </span>
                </div>
              )}
            </div>

            {/* Trait Badges */}
            {inspectModalItem.attributes.length > 0 && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                {inspectModalItem.attributes.map((attr, i) => (
                  <div key={i} className="p-2 rounded-lg bg-[#040711] border border-white/[0.05]">
                    <span className="text-[9px] text-slate-500 block uppercase">{attr.trait_type}</span>
                    <span className="text-xs font-bold text-slate-200">{attr.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectModalItem(null)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-white border border-white/10 transition-colors"
              >
                CLOSE INSPECTION
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
