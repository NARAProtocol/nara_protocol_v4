import React, { useCallback, useEffect, useState } from "react";
import { formatEther, formatUnits, parseEther, type Address } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  BASE_CHAIN_ID,
  DEPLOYMENT,
  engineAbi,
  erc20Abi,
  positionNftAbi,
} from "./generated/contracts";

export interface PositionNftItem {
  tokenId: bigint;
  positionId: bigint;
  owner: Address;
  account: Address;
  amount: bigint;
  createdEpoch: bigint;
  unlockEpoch: bigint;
  weight: bigint;
  claimableEth: bigint;
  claimableNara: bigint;
  tokenUri: string;
  name: string;
  description: string;
  imageSvg: string;
  attributes: Array<{ trait_type: string; value: string | number }>;
}

export interface FleetDeckLensReport {
  user: Address;
  totalLockedNara: bigint;
  totalWeight: bigint;
  weightedAverageMultiplierWad: bigint;
  formattedWeightedMultiplier: string;
  deckSynergyMultiplierWad: bigint;
  formattedDeckSynergyMultiplier: string;
  totalEffectiveMultiplierWad: bigint;
  formattedTotalEffectiveMultiplier: string;
  effectiveTotalWeight: bigint;
  synergyTierName: string;
  synergyBonusBps: number;
  activeSlotsCount: number;
  aggregateClaimableNara: bigint;
  aggregateClaimableEth: bigint;
}

const fleetDeckLensAbi = [
  {
    type: "function",
    name: "getFleetDeckSummary",
    inputs: [
      { name: "user", type: "address" },
      { name: "tokenIds", type: "uint256[]" },
    ],
    outputs: [
      {
        name: "deck",
        type: "tuple",
        components: [
          { name: "user", type: "address" },
          { name: "totalLockedNara", type: "uint256" },
          { name: "totalWeight", type: "uint256" },
          { name: "weightedAverageMultiplierWad", type: "uint256" },
          { name: "weightedAverageMultiplierBps", type: "uint16" },
          { name: "formattedWeightedMultiplier", type: "string" },
          { name: "deckSynergyMultiplierWad", type: "uint256" },
          { name: "deckSynergyMultiplierBps", type: "uint16" },
          { name: "formattedDeckSynergyMultiplier", type: "string" },
          { name: "totalEffectiveMultiplierWad", type: "uint256" },
          { name: "totalEffectiveMultiplierBps", type: "uint32" },
          { name: "formattedTotalEffectiveMultiplier", type: "string" },
          { name: "effectiveTotalWeight", type: "uint256" },
          {
            name: "synergy",
            type: "tuple",
            components: [
              { name: "synergyTier", type: "uint8" },
              { name: "synergyTierName", type: "string" },
              { name: "formationBonusBps", type: "uint16" },
              { name: "genesisAuraBonusBps", type: "uint16" },
              { name: "synergyBonusBps", type: "uint16" },
              { name: "totalSynergyBonusBps", type: "uint16" },
              { name: "synergyMultiplierWad", type: "uint256" },
              { name: "formattedSynergyMultiplier", type: "string" },
              { name: "hasGenesisAura", type: "bool" },
              { name: "activeSlotsCount", type: "uint256" },
            ],
          },
          { name: "aggregateClaimableNara", type: "uint256" },
          { name: "aggregateClaimableEth", type: "uint256" },
          { name: "aggregateClaimableGenesisEth", type: "uint256" },
          { name: "aggregateClaimableGenesisToken", type: "uint256" },
          {
            name: "positions",
            type: "tuple[]",
            components: [
              { name: "tokenId", type: "uint256" },
              { name: "positionId", type: "uint256" },
              { name: "amount", type: "uint128" },
              { name: "weight", type: "uint128" },
              { name: "multiplierWad", type: "uint256" },
              { name: "multiplierBps", type: "uint16" },
              { name: "formattedMultiplier", type: "string" },
              { name: "createdEpoch", type: "uint64" },
              { name: "activationEpoch", type: "uint64" },
              { name: "unlockEpoch", type: "uint64" },
              { name: "claimableNara", type: "uint256" },
              { name: "claimableEth", type: "uint256" },
              { name: "claimableGenesisEth", type: "uint256" },
              { name: "claimableGenesisToken", type: "uint256" },
              { name: "isGenesis", type: "bool" },
              { name: "isEternal", type: "bool" },
              { name: "isActive", type: "bool" },
            ],
          },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

function pad6(val: bigint | number): string {
  return String(val).padStart(6, "0");
}

function formatNumber(val: bigint, decimals = 18, maxDec = 2): string {
  const formatted = formatUnits(val, decimals);
  const [whole, frac] = formatted.split(".");
  if (!frac) return whole;
  return `${whole}.${frac.slice(0, maxDec)}`;
}

function formatCleanEth(val: bigint): string {
  if (!val || val === 0n) return "0.0000 ETH";
  const str = formatEther(val);
  const [whole, frac] = str.split(".");
  if (!frac) return `${whole}.0000 ETH`;
  return `${whole}.${frac.slice(0, 4)} ETH`;
}

function formatCleanNara(val: bigint): string {
  if (!val || val === 0n) return "0.00 NARA";
  return `${formatNumber(val, 18, 2)} NARA`;
}

// Progressive Disclosure: Info Circle Component (Replaces text clutter with interactive (i) circle)
function InfoCircle({ title, content }: { title?: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="info-circle-wrap"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-circle-btn"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
        aria-label="Information"
      >
        i
      </button>
      {open ? (
        <span className="info-circle-popover">
          {title ? <strong>{title}</strong> : null}
          <span>{content}</span>
        </span>
      ) : null}
    </span>
  );
}

const PRESET_HORIZONS = [
  { label: "1 Day", epochs: 96, multiplier: "1.00X", title: "96 Epochs" },
  { label: "30 Days", epochs: 2880, multiplier: "1.06X", title: "2,880 Epochs" },
  { label: "90 Days", epochs: 8760, multiplier: "1.28X", title: "8,760 Epochs" },
  { label: "180 Days", epochs: 17520, multiplier: "1.85X", title: "17,520 Epochs" },
  { label: "365 Days", epochs: 35040, multiplier: "4.00X", title: "35,040 Epochs" },
];

export interface NftTabProps {
  currentEpoch?: bigint;
  lockFeeWei?: bigint;
  unlockFeeWei?: bigint;
  naraBalance?: bigint;
  onRefreshBalances?: () => void;
}

export function NftTab(props: NftTabProps = {}) {
  const { address, isConnected } = useAccount();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [currentEpoch, setCurrentEpoch] = useState<bigint>(0n);
  const [userNfts, setUserNfts] = useState<PositionNftItem[]>([]);
  const [slottedTokenIds, setSlottedTokenIds] = useState<bigint[]>([]);
  const [deckReport, setDeckReport] = useState<FleetDeckLensReport | null>(null);
  const [naraBalance, setNaraBalance] = useState<bigint>(0n);
  const [naraAllowance, setNaraAllowance] = useState<bigint>(0n);
  const [dynamicLockFeeWei, setDynamicLockFeeWei] = useState<bigint>(props.lockFeeWei || 1000000000000n);
  const [loading, setLoading] = useState(false);
  const [showStakingModal, setShowStakingModal] = useState(false);

  // Minting form state
  const [lockAmount, setLockAmount] = useState<string>("100");
  const [selectedHorizonIdx, setSelectedHorizonIdx] = useState<number>(4);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedNft, setSelectedNft] = useState<PositionNftItem | null>(null);

  const selectedHorizon = PRESET_HORIZONS[selectedHorizonIdx];

  const updateDeckReport = useCallback(
    async (tokenIds: bigint[], currentAddress: Address) => {
      if (!client || !DEPLOYMENT.fleetDeckLens || tokenIds.length === 0) {
        setDeckReport(null);
        return;
      }
      try {
        const lensRes = await client.readContract({
          address: DEPLOYMENT.fleetDeckLens as Address,
          abi: fleetDeckLensAbi,
          functionName: "getFleetDeckSummary",
          args: [currentAddress, tokenIds.slice(0, 6)],
        });

        setDeckReport({
          user: lensRes.user,
          totalLockedNara: lensRes.totalLockedNara,
          totalWeight: lensRes.totalWeight,
          weightedAverageMultiplierWad: lensRes.weightedAverageMultiplierWad,
          formattedWeightedMultiplier: lensRes.formattedWeightedMultiplier,
          deckSynergyMultiplierWad: lensRes.deckSynergyMultiplierWad,
          formattedDeckSynergyMultiplier: lensRes.formattedDeckSynergyMultiplier,
          totalEffectiveMultiplierWad: lensRes.totalEffectiveMultiplierWad,
          formattedTotalEffectiveMultiplier: lensRes.formattedTotalEffectiveMultiplier,
          effectiveTotalWeight: lensRes.effectiveTotalWeight,
          synergyTierName: lensRes.synergy.synergyTierName,
          synergyBonusBps: lensRes.synergy.totalSynergyBonusBps,
          activeSlotsCount: Number(lensRes.synergy.activeSlotsCount),
          aggregateClaimableNara: lensRes.aggregateClaimableNara,
          aggregateClaimableEth: lensRes.aggregateClaimableEth,
        });
      } catch (err) {
        console.warn("Error updating deck summary:", err);
      }
    },
    [client]
  );

  const fetchState = useCallback(async () => {
    if (!client) return;
    try {
      setLoading(true);
      setError(null);

      // 1. Current Epoch & Engine Fees
      try {
        const [epochStateRes, engineLockFee] = await Promise.all([
          client.readContract({
            address: DEPLOYMENT.engine,
            abi: engineAbi,
            functionName: "epochState",
          }),
          client.readContract({
            address: DEPLOYMENT.engine,
            abi: engineAbi,
            functionName: "lockFeeWei",
          }),
        ]);
        const epoch = epochStateRes[0];
        setCurrentEpoch(epoch);
        if (typeof engineLockFee === "bigint") {
          setDynamicLockFeeWei(engineLockFee);
        }
      } catch (err) {
        console.warn("Could not query epoch/fee state:", err);
      }

      // 2. User data
      if (address) {
        const [bal, allowance, nextTokenId] = await Promise.all([
          client.readContract({
            address: DEPLOYMENT.nara,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [address],
          }),
          client.readContract({
            address: DEPLOYMENT.nara,
            abi: erc20Abi,
            functionName: "allowance",
            args: [address, DEPLOYMENT.positionNft],
          }),
          client.readContract({
            address: DEPLOYMENT.positionNft,
            abi: positionNftAbi,
            functionName: "nextTokenId",
          }),
        ]);

        setNaraBalance(bal);
        setNaraAllowance(allowance);

        const items: PositionNftItem[] = [];
        const ownedTokenIds: bigint[] = [];
        const total = Number(nextTokenId);

        for (let i = 1; i < total; i++) {
          const tid = BigInt(i);
          try {
            const tokenOwner = await client.readContract({
              address: DEPLOYMENT.positionNft,
              abi: positionNftAbi,
              functionName: "ownerOf",
              args: [tid],
            });

            if (tokenOwner.toLowerCase() === address.toLowerCase()) {
              ownedTokenIds.push(tid);
              const [posId, posInfo, account, uri] = await Promise.all([
                client.readContract({
                  address: DEPLOYMENT.positionNft,
                  abi: positionNftAbi,
                  functionName: "positionIdOf",
                  args: [tid],
                }),
                client.readContract({
                  address: DEPLOYMENT.positionNft,
                  abi: positionNftAbi,
                  functionName: "positionInfo",
                  args: [tid],
                }),
                client.readContract({
                  address: DEPLOYMENT.positionNft,
                  abi: positionNftAbi,
                  functionName: "accountOf",
                  args: [tid],
                }),
                client.readContract({
                  address: DEPLOYMENT.positionNft,
                  abi: positionNftAbi,
                  functionName: "tokenURI",
                  args: [tid],
                }),
              ]);

              let claimableNara = 0n;
              let claimableEth = 0n;
              if (posId > 0n) {
                try {
                  const claimableRes = await client.readContract({
                    address: DEPLOYMENT.engine,
                    abi: engineAbi,
                    functionName: "claimableRewards",
                    args: [posId],
                  });
                  claimableNara = claimableRes[0];
                  claimableEth = claimableRes[1];
                } catch {}
              }

              let name = `Position #${tid.toString()}`;
              let description = "";
              let imageSvg = "";
              let attributes: Array<{ trait_type: string; value: string | number }> = [];

              try {
                const jsonStr = atob(uri.replace("data:application/json;base64,", ""));
                const parsed = JSON.parse(jsonStr);
                name = parsed.name || name;
                description = parsed.description || "";
                imageSvg = parsed.image || "";
                attributes = parsed.attributes || [];
              } catch {}

              items.push({
                tokenId: tid,
                positionId: posId,
                owner: address,
                account,
                amount: posInfo.amount,
                createdEpoch: posInfo.createdEpoch,
                unlockEpoch: posInfo.unlockEpoch,
                weight: posInfo.weight,
                claimableEth,
                claimableNara,
                tokenUri: uri,
                name,
                description,
                imageSvg,
                attributes,
              });
            }
          } catch {}
        }

        setUserNfts(items);

        let currentSlots = slottedTokenIds.filter((id) => ownedTokenIds.includes(id));
        if (currentSlots.length === 0 && ownedTokenIds.length > 0) {
          currentSlots = ownedTokenIds.slice(0, 6);
        }
        setSlottedTokenIds(currentSlots);
        await updateDeckReport(currentSlots, address);
      }
    } catch (err) {
      console.error("Error fetching NFT state:", err);
      setError((err as Error).message || "Failed to load state");
    } finally {
      setLoading(false);
    }
  }, [client, address, slottedTokenIds, updateDeckReport]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Slot Management
  const handleEquipSlot = async (tokenId: bigint) => {
    if (slottedTokenIds.includes(tokenId)) return;
    if (slottedTokenIds.length >= 6) {
      setError("Maximum 6 active formation slots reached. Remove a card before equipping.");
      return;
    }
    const newSlots = [...slottedTokenIds, tokenId];
    setSlottedTokenIds(newSlots);
    if (address) {
      await updateDeckReport(newSlots, address);
    }
  };

  const handleUnequipSlot = async (tokenId: bigint) => {
    const newSlots = slottedTokenIds.filter((id) => id !== tokenId);
    setSlottedTokenIds(newSlots);
    if (address) {
      await updateDeckReport(newSlots, address);
    }
  };

  const handleAutoEquipTop6 = async () => {
    if (!address || userNfts.length === 0) return;
    const sorted = [...userNfts].sort((a, b) => (b.amount > a.amount ? 1 : -1));
    const top6 = sorted.slice(0, 6).map((n) => n.tokenId);
    setSlottedTokenIds(top6);
    await updateDeckReport(top6, address);
    setActionSuccess("Top 6 positions equipped to active deck.");
  };

  // Actions
  const handleApprove = async () => {
    if (!address) {
      setError("Please connect your wallet first.");
      return;
    }
    try {
      setActionBusy("approve");
      setError(null);
      setActionSuccess(null);
      const amt = parseEther(lockAmount || "0");
      if (amt === 0n) {
        setError("Please enter a valid lock amount.");
        return;
      }
      const hash = await writeContractAsync({
        address: DEPLOYMENT.nara,
        abi: erc20Abi,
        functionName: "approve",
        args: [DEPLOYMENT.positionNft, amt],
      });
      setActionSuccess(`Approval submitted: ${hash.slice(0, 10)}…`);
      await fetchState();
    } catch (err: any) {
      console.error("Approve error:", err);
      setError(err?.shortMessage || err?.message || "Approval failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleMintAndLock = async () => {
    if (!address) {
      setError("Please connect your wallet first.");
      return;
    }
    try {
      setActionBusy("mint");
      setError(null);
      setActionSuccess(null);
      const amt = parseEther(lockAmount || "0");
      const durationEpochs = BigInt(selectedHorizon.epochs);
      const feeWei = props.lockFeeWei || dynamicLockFeeWei || 1000000000000n;

      const hash = await writeContractAsync({
        address: DEPLOYMENT.positionNft,
        abi: positionNftAbi,
        functionName: "mintAndLockFor",
        args: [address, amt, durationEpochs, 0n],
        value: feeWei,
      });

      setActionSuccess(`Position created! Tx: ${hash.slice(0, 10)}…`);
      setShowStakingModal(false);
      await fetchState();
    } catch (err: any) {
      console.error("Mint error:", err);
      setError(err?.shortMessage || err?.message || "Mint and lock failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleClaim = async (tokenId: bigint) => {
    if (!address) return;
    try {
      setActionBusy(`claim-${tokenId}`);
      setError(null);
      const hash = await writeContractAsync({
        address: DEPLOYMENT.positionNft,
        abi: positionNftAbi,
        functionName: "claimRewards",
        args: [tokenId, address],
      });
      setActionSuccess(`Claim submitted: ${hash.slice(0, 10)}…`);
      await fetchState();
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Claim failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleClaimAll = async () => {
    if (!address || userNfts.length === 0) return;
    try {
      setActionBusy("claim-all");
      setError(null);
      for (const nft of userNfts) {
        if (nft.claimableEth > 0n || nft.claimableNara > 0n) {
          await writeContractAsync({
            address: DEPLOYMENT.positionNft,
            abi: positionNftAbi,
            functionName: "claimRewards",
            args: [nft.tokenId, address],
          });
        }
      }
      setActionSuccess("Distributions claimed.");
      await fetchState();
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Claim all failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleExtend = async (tokenId: bigint) => {
    if (!address) return;
    try {
      setActionBusy(`extend-${tokenId}`);
      setError(null);
      const hash = await writeContractAsync({
        address: DEPLOYMENT.positionNft,
        abi: positionNftAbi,
        functionName: "extendLock",
        args: [tokenId, 35040n],
      });
      setActionSuccess(`Duration extended: ${hash.slice(0, 10)}…`);
      await fetchState();
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Extend failed");
    } finally {
      setActionBusy(null);
    }
  };

  const handleUnlock = async (tokenId: bigint) => {
    if (!address || !client) return;
    const confirmBurn = window.confirm(
      "CONFIRM UNLOCK:\nUnlocking principal executes _burn(tokenId), permanently burning the Position NFT. Your locked principal will be returned to your wallet. Proceed?"
    );
    if (!confirmBurn) return;

    try {
      setActionBusy(`unlock-${tokenId}`);
      setError(null);
      const unlockFeeWei = await client.readContract({
        address: DEPLOYMENT.engine,
        abi: engineAbi,
        functionName: "unlockFeeWei",
      });
      const hash = await writeContractAsync({
        address: DEPLOYMENT.positionNft,
        abi: positionNftAbi,
        functionName: "unlockTo",
        args: [tokenId, address],
        value: unlockFeeWei,
      });
      setActionSuccess(`Position unlocked: ${hash.slice(0, 10)}…`);
      await fetchState();
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Unlock failed");
    } finally {
      setActionBusy(null);
    }
  };

  const parsedAmount = (() => {
    try {
      return parseEther(lockAmount || "0");
    } catch {
      return 0n;
    }
  })();

  const needsApproval = parsedAmount > 0n && naraAllowance < parsedAmount;
  const isHighConvictionTier = parsedAmount >= parseEther("100");

  const slottedItems = slottedTokenIds
    .map((id) => userNfts.find((n) => n.tokenId === id))
    .filter(Boolean) as PositionNftItem[];

  return (
    <div className="nara-subtle-vault-experience">
      {/* 1. TOP HEADER & DECK FORMATION TELEMETRY */}
      <section className="formation-deck-panel double-bezel" aria-label="Formation Deck">
        <div className="hero-inner-core">
          <div className="formation-header-bar">
            <div className="formation-title-group">
              <span className="eyebrow-tag">
                ACTIVE 6-SLOT DECK
                <InfoCircle
                  title="Formation Synergy"
                  content="Assign up to 6 positions to activate collective fleet weight synergy (up to +25%)."
                />
              </span>
              <h2 className="formation-h2">
                {deckReport ? deckReport.synergyTierName : "Solo Formation"} ({slottedItems.length}/6 Active)
              </h2>
            </div>

            <div className="formation-quick-actions">
              <button
                className="deck-util-btn"
                type="button"
                onClick={handleAutoEquipTop6}
                disabled={userNfts.length === 0}
              >
                ⚡ Auto-Equip Top 6
              </button>
              <button
                className="deck-harvest-btn"
                type="button"
                disabled={!deckReport || deckReport.aggregateClaimableEth === 0n || actionBusy !== null}
                onClick={handleClaimAll}
              >
                {actionBusy === "claim-all" ? "Claiming…" : "Claim Active Yield"}
              </button>
              <button
                className="deck-mint-new-btn"
                type="button"
                onClick={() => setShowStakingModal(true)}
              >
                + Lock Position
              </button>
            </div>
          </div>

          {/* 6 SUBTLE DECK SLOTS (Compact Bento Tiles) */}
          <div className="subtle-deck-slots-grid">
            {Array.from({ length: 6 }).map((_, slotIdx) => {
              const item = slottedItems[slotIdx];
              if (!item) {
                return (
                  <div
                    className="subtle-empty-slot-tile"
                    key={`slot-${slotIdx}`}
                    onClick={() => {
                      const el = document.getElementById("my-collection-section");
                      el?.scrollIntoView({ behavior: "smooth" });
                    }}
                  >
                    <span className="slot-num-badge">SLOT #{slotIdx + 1}</span>
                    <div className="empty-plus-icon">+</div>
                    <span className="empty-slot-hint">Assign Card</span>
                  </div>
                );
              }

              const hasClaimable = item.claimableEth > 0n || item.claimableNara > 0n;
              const svgThumb = atob(item.imageSvg.replace("data:image/svg+xml;base64,", ""));

              return (
                <div className="subtle-active-slot-tile" key={item.tokenId.toString()}>
                  <div className="slot-tile-top">
                    <span className="slot-num-badge active">SLOT #{slotIdx + 1}</span>
                    <button
                      className="slot-unequip-btn"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnequipSlot(item.tokenId);
                      }}
                      title="Unequip from slot"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="slot-tile-body" onClick={() => setSelectedNft(item)}>
                    <div className="slot-thumb-container" dangerouslySetInnerHTML={{ __html: svgThumb }} />
                    <div className="slot-meta-col">
                      <b className="slot-token-title">#{pad6(item.tokenId)}</b>
                      <span className="slot-principal-val">{formatNumber(item.amount, 18, 0)} NARA</span>
                      <span className="slot-yield-val text-gold">{formatCleanEth(item.claimableEth)}</span>
                    </div>
                  </div>

                  <div className="slot-tile-actions">
                    <button
                      className={`slot-action-btn ${hasClaimable ? "claim-ready" : ""}`}
                      type="button"
                      disabled={!hasClaimable || actionBusy !== null}
                      onClick={() => handleClaim(item.tokenId)}
                    >
                      {actionBusy === `claim-${item.tokenId}` ? "…" : hasClaimable ? "Claim" : "0 ETH"}
                    </button>
                    <button
                      className="slot-action-btn"
                      type="button"
                      disabled={actionBusy !== null}
                      onClick={() => handleExtend(item.tokenId)}
                    >
                      Extend
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Aggregate Telemetry Strip */}
          <div className="deck-telemetry-strip">
            <div className="telemetry-item">
              <span className="lbl">
                EFFECTIVE MULTIPLIER
                <InfoCircle
                  title="Quadratic Power Curve"
                  content="Calculated on-chain via m(r) = 1 + 0.5r + 2.5r² combined with deck synergy. Hard cap: 10.00X."
                />
              </span>
              <b className="val text-blue">
                {deckReport ? deckReport.formattedTotalEffectiveMultiplier : "1.00X"}
              </b>
            </div>
            <div className="telemetry-item">
              <span className="lbl">
                FLEET SYNERGY
                <InfoCircle
                  title="Synergy Bonus"
                  content="Each active deck slot grants +5% bonus multiplier up to +25% Hexa Armada."
                />
              </span>
              <b className="val">
                {deckReport ? `+${(deckReport.synergyBonusBps / 100).toFixed(1)}%` : "0.0%"}
              </b>
            </div>
            <div className="telemetry-item">
              <span className="lbl">
                TOTAL ACCRUED
                <InfoCircle
                  title="Variable Distributions"
                  content="Accrued from 15-minute epoch emissions and protocol swap fee shares."
                />
              </span>
              <b className="val text-gold">
                {deckReport ? formatCleanEth(deckReport.aggregateClaimableEth) : "0.0000 ETH"}
              </b>
            </div>
            <div className="telemetry-item">
              <span className="lbl">
                TOTAL WEIGHT
                <InfoCircle
                  title="Reward Share Denominator"
                  content="Represents this wallet's active share in the protocol emission pool."
                />
              </span>
              <b className="val">
                {deckReport ? `${formatNumber(deckReport.effectiveTotalWeight, 18, 0)} pts` : "0 pts"}
              </b>
            </div>
          </div>
        </div>
      </section>

      {/* 2. MY COLLECTION (INVENTORY OF ALL POSITION NFTs) */}
      <section className="collection-inventory-section" id="my-collection-section" aria-labelledby="collection-title">
        <div className="collection-header-row">
          <div>
            <span className="eyebrow-tag">
              INVENTORY
              <InfoCircle
                title="Bearer Positions"
                content="All self-custodied ERC-721 Position NFTs in this connected wallet."
              />
            </span>
            <h2 className="collection-section-h2" id="collection-title">
              My Collection ({userNfts.length} Cards)
            </h2>
          </div>
          <div className="collection-header-actions">
            <button className="refresh-btn" type="button" onClick={fetchState} disabled={loading}>
              {loading ? "Syncing…" : "Refresh ↻"}
            </button>
          </div>
        </div>

        {!isConnected ? (
          <div className="empty-fleet-card double-bezel">
            <p>Connect wallet to load Position NFTs.</p>
          </div>
        ) : userNfts.length === 0 ? (
          <div className="empty-collection-box double-bezel">
            <div className="empty-inner-core">
              <h4>No Position NFTs in wallet</h4>
              <button className="luxury-primary-action-btn" type="button" onClick={() => setShowStakingModal(true)}>
                + Create Lock Position
              </button>
            </div>
          </div>
        ) : (
          <div className="collection-tiles-grid">
            {userNfts.map((nft) => {
              const isSlotted = slottedTokenIds.includes(nft.tokenId);
              const slotNumber = slottedTokenIds.indexOf(nft.tokenId) + 1;
              const isMatured = currentEpoch >= nft.unlockEpoch;
              const hasClaimable = nft.claimableEth > 0n || nft.claimableNara > 0n;
              const svgContent = atob(nft.imageSvg.replace("data:image/svg+xml;base64,", ""));

              return (
                <div
                  className={`collection-compact-tile double-bezel ${isSlotted ? "slotted" : ""}`}
                  key={nft.tokenId.toString()}
                >
                  <div className="tile-inner-core">
                    <div className="tile-top-row">
                      <span className="tile-id-badge">#{pad6(nft.tokenId)}</span>
                      {isSlotted ? (
                        <span className="slotted-pill">● Slot {slotNumber}</span>
                      ) : (
                        <button
                          className="equip-btn"
                          type="button"
                          onClick={() => handleEquipSlot(nft.tokenId)}
                          disabled={slottedTokenIds.length >= 6}
                        >
                          + Equip
                        </button>
                      )}
                    </div>

                    <div className="tile-center-view" onClick={() => setSelectedNft(nft)}>
                      <div className="tile-svg-thumb" dangerouslySetInnerHTML={{ __html: svgContent }} />
                      <div className="tile-stats-col">
                        <div className="tile-stat-row">
                          <span>Principal</span>
                          <b>{formatNumber(nft.amount, 18, 0)} NARA</b>
                        </div>
                        <div className="tile-stat-row">
                          <span>Status</span>
                          <b>{isMatured ? "Matured" : `+${(nft.unlockEpoch - currentEpoch).toString()} Ep`}</b>
                        </div>
                        <div className="tile-stat-row">
                          <span>Accrued</span>
                          <b className="text-gold">{formatCleanEth(nft.claimableEth)}</b>
                        </div>
                      </div>
                    </div>

                    <div className="tile-action-footer">
                      <button
                        className={`tile-footer-btn ${hasClaimable ? "claim" : ""}`}
                        type="button"
                        disabled={!hasClaimable || actionBusy !== null}
                        onClick={() => handleClaim(nft.tokenId)}
                      >
                        {actionBusy === `claim-${nft.tokenId}` ? "…" : hasClaimable ? "Claim" : "0 ETH"}
                      </button>

                      <button
                        className="tile-footer-btn"
                        type="button"
                        disabled={actionBusy !== null}
                        onClick={() => handleExtend(nft.tokenId)}
                      >
                        Extend
                      </button>

                      {isMatured ? (
                        <button
                          className="tile-footer-btn burn"
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={() => handleUnlock(nft.tokenId)}
                        >
                          Unlock
                        </button>
                      ) : null}

                      <a
                        className="tile-opensea-link"
                        href={`https://opensea.io/assets/base/${DEPLOYMENT.positionNft}/${nft.tokenId.toString()}`}
                        target="_blank"
                        rel="noreferrer"
                        title="OpenSea"
                      >
                        ↗
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. MINT / LOCK POSITION MODAL */}
      {showStakingModal ? (
        <div className="luxury-modal-backdrop" onClick={() => setShowStakingModal(false)}>
          <div className="luxury-modal-content double-bezel staking-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-inner-core">
              <div className="modal-header-row">
                <div>
                  <span className="eyebrow-tag">
                    PROTOCOL LOCK
                    <InfoCircle
                      title="Self-Directed Interaction"
                      content="Tokens committed to NARAEngine.sol are non-withdrawable until the maturity epoch. Unlocking permanently burns the NFT."
                    />
                  </span>
                  <h3 style={{ margin: "6px 0 0" }}>Create Position Lock</h3>
                </div>
                <button className="close-modal-btn" type="button" onClick={() => setShowStakingModal(false)}>✕</button>
              </div>

              <div className="staking-interactive-grid" style={{ marginTop: "16px" }}>
                <div className="staking-controls-col">
                  <label className="input-field-label">
                    <span>
                      LOCK PRINCIPAL (NARA)
                      <InfoCircle
                        title="Top-Tier Rarity Odds"
                        content="Locks of 100+ NARA give a 25X higher chance to roll Damascus (top-tier 39%) and 24K Gold (9%) cards vs standard 1.5% Damascus."
                      />
                    </span>
                    {isHighConvictionTier ? <span className="tier-qual-badge">✨ 100+ NARA: Boosted Top Odds</span> : null}
                  </label>

                  <div className="input-box-wrapper">
                    <input
                      className="luxury-nara-input"
                      type="text"
                      placeholder="100.0"
                      value={lockAmount}
                      onChange={(e) => setLockAmount(e.target.value)}
                    />
                    <div className="quick-pill-row">
                      <button type="button" onClick={() => setLockAmount("10")}>10</button>
                      <button type="button" onClick={() => setLockAmount("50")}>50</button>
                      <button type="button" onClick={() => setLockAmount("100")}>100 ✨</button>
                      <button type="button" onClick={() => setLockAmount(formatUnits(naraBalance, 18))}>MAX</button>
                    </div>
                  </div>

                  <label className="input-field-label" style={{ marginTop: "16px" }}>
                    <span>
                      LOCK HORIZON
                      <InfoCircle
                        title="Quadratic Duration Multiplier"
                        content="Locking longer increases your emission share from 1.00X (1 Day) up to 4.00X (365 Days)."
                      />
                    </span>
                  </label>

                  <div className="horizon-chips-grid">
                    {PRESET_HORIZONS.map((h, idx) => (
                      <button
                        key={h.label}
                        type="button"
                        className={`horizon-chip ${selectedHorizonIdx === idx ? "selected" : ""}`}
                        onClick={() => setSelectedHorizonIdx(idx)}
                      >
                        <span className="horizon-title">{h.title}</span>
                        <b className="horizon-days">{h.label}</b>
                        <span className="horizon-multiplier">{h.multiplier}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="staking-preview-col">
                  <div className="preview-receipt-card">
                    <span className="receipt-title">SPECIFICATIONS</span>
                    <div className="receipt-row">
                      <span>Duration</span>
                      <b>{selectedHorizon.label}</b>
                    </div>
                    <div className="receipt-row">
                      <span>Multiplier Weight</span>
                      <b className="text-blue">{selectedHorizon.multiplier}</b>
                    </div>
                    <div className="receipt-row">
                      <span>
                        Rarity Roll Odds
                        <InfoCircle
                          title="Card Rarity Probability"
                          content={
                            isHighConvictionTier
                              ? "Top-Tier Active: 39% Damascus, 9% Gold, 35% Emerald, 17% Titanium."
                              : "Standard: 1.5% Damascus, 4% Gold, 18% Emerald, 76.5% Titanium. Lock 100+ NARA for top-tier boost."
                          }
                        />
                      </span>
                      <b style={{ color: isHighConvictionTier ? "#ffd700" : "#c9d1d9" }}>
                        {isHighConvictionTier ? "Top Boost (39% Damascus)" : "Standard (1.5% Damascus)"}
                      </b>
                    </div>
                    <div className="receipt-divider" />
                    <div className="receipt-row total">
                      <span>
                        Protocol Lock Fee
                        <InfoCircle
                          title="Engine Execution Fee"
                          content="Fixed protocol execution fee required by NARAEngine.sol (0.000001 ETH)."
                        />
                      </span>
                      <span>0.000001 ETH</span>
                    </div>
                  </div>

                  {!isConnected ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", marginTop: "16px" }}>
                      <span style={{ fontSize: "11px", color: "#8b949e", fontFamily: "var(--mono)" }}>Connect wallet to create lock</span>
                      <ConnectButton />
                    </div>
                  ) : needsApproval ? (
                    <button
                      className="luxury-primary-action-btn"
                      type="button"
                      disabled={actionBusy !== null || parsedAmount === 0n}
                      onClick={handleApprove}
                    >
                      {actionBusy === "approve" ? "Approving in Wallet…" : "Approve NARA ➔"}
                    </button>
                  ) : (
                    <button
                      className="luxury-primary-action-btn"
                      type="button"
                      disabled={actionBusy !== null || parsedAmount === 0n}
                      onClick={handleMintAndLock}
                    >
                      {actionBusy === "mint" ? "Confirming in Wallet…" : "Confirm Lock ➔"}
                    </button>
                  )}
                </div>
              </div>

              {actionSuccess ? <div className="toast-success">{actionSuccess}</div> : null}
              {error ? <div className="toast-error">{error}</div> : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* 4. METADATA INSPECTION MODAL */}
      {selectedNft ? (
        <div className="luxury-modal-backdrop" onClick={() => setSelectedNft(null)}>
          <div className="luxury-modal-content double-bezel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-inner-core">
              <div className="modal-header-row">
                <h3>{selectedNft.name}</h3>
                <button className="close-modal-btn" type="button" onClick={() => setSelectedNft(null)}>✕</button>
              </div>

              <div className="modal-split-layout">
                <div
                  className="modal-svg-container"
                  dangerouslySetInnerHTML={{ __html: atob(selectedNft.imageSvg.replace("data:image/svg+xml;base64,", "")) }}
                />

                <div className="modal-traits-col">
                  <span className="traits-header">ATTRIBUTES</span>
                  <div className="traits-badges-grid">
                    {selectedNft.attributes.map((attr, idx) => (
                      <div className="trait-badge-card" key={idx}>
                        <span className="trait-type">{attr.trait_type}</span>
                        <b className="trait-val">{attr.value.toString()}</b>
                      </div>
                    ))}
                  </div>

                  <div className="modal-links-row">
                    <a
                      className="external-link-btn"
                      href={`https://basescan.org/address/${selectedNft.account}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Vault ↗
                    </a>
                    <a
                      className="external-link-btn opensea"
                      href={`https://opensea.io/assets/base/${DEPLOYMENT.positionNft}/${selectedNft.tokenId.toString()}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      OpenSea ↗
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
