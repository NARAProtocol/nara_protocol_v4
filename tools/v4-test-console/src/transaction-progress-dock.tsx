import { useEffect, useState } from "react";

import { elapsedLabel, type TransactionProgress } from "./transaction-progress";

const STEPS = ["Check", "Wallet", "Base", "Updated"] as const;

function headline(progress: TransactionProgress): string {
  switch (progress.stage) {
    case "checking": return "Checking before wallet";
    case "wallet": return "Waiting for your wallet";
    case "submitted": return progress.canCheck ? "Base status needs checking" : "Submitted to Base";
    case "syncing": return "Confirmed — updating the console";
    case "complete": return "Action complete";
    case "error": return "Action stopped";
  }
}

function attentionLabel(progress: TransactionProgress): string {
  switch (progress.stage) {
    case "wallet": return "Your action needed";
    case "checking":
    case "submitted":
    case "syncing": return progress.canCheck ? "Check status" : "No action needed";
    case "complete": return "Ready";
    case "error": return "Review message";
  }
}

export function TransactionProgressDock({
  progress,
  onDismiss,
  onCheckStatus,
  baseAppRecoveryUrl,
  onUseBaseAppWallet,
  baseAppWalletBusy = false,
}: {
  progress: TransactionProgress;
  onDismiss: () => void;
  onCheckStatus: () => void;
  baseAppRecoveryUrl?: string;
  onUseBaseAppWallet?: () => void;
  baseAppWalletBusy?: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const [siteCopyState, setSiteCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (progress.stage === "complete" || progress.stage === "error") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [progress.stage]);

  useEffect(() => setCopyState("idle"), [progress.diagnostic]);
  useEffect(() => setSiteCopyState("idle"), [baseAppRecoveryUrl]);

  async function copyDiagnostic() {
    if (!progress.diagnostic) return;
    try {
      await navigator.clipboard.writeText(progress.diagnostic);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function copyBaseAppUrl() {
    if (!baseAppRecoveryUrl) return;
    try {
      await navigator.clipboard.writeText(baseAppRecoveryUrl);
      setSiteCopyState("copied");
    } catch {
      setSiteCopyState("failed");
    }
  }

  const canDismiss = progress.stage === "complete" || progress.stage === "error";
  const liveRole = progress.stage === "error" ? "alert" : "status";

  return (
    <aside
      className={`transaction-progress ${progress.stage}`}
      role={liveRole}
      aria-live={progress.stage === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <div className="transaction-progress-head">
        <div className="transaction-progress-title">
          <span className="transaction-activity" aria-hidden="true" />
          <div>
            <span>{progress.action}</span>
            <strong>{headline(progress)}</strong>
          </div>
        </div>
        <div className="transaction-progress-meta">
          <span>{attentionLabel(progress)}</span>
          <time>{elapsedLabel(progress.startedAt, now)}</time>
        </div>
      </div>

      <ol className="transaction-steps" aria-label="Transaction progress">
        {STEPS.map((label, index) => {
          const complete = progress.step > index;
          const current = progress.step === index && progress.stage !== "complete";
          return (
            <li key={label} className={complete ? "complete" : current ? "current" : ""}>
              <span aria-hidden="true">{complete ? "✓" : index + 1}</span>
              <b>{label}</b>
            </li>
          );
        })}
      </ol>

      <div className="transaction-progress-foot">
        <p>{progress.detail}</p>
        <div className="transaction-progress-actions">
          {progress.hash ? (
            <a href={`https://basescan.org/tx/${progress.hash}`} target="_blank" rel="noreferrer">
              View on BaseScan ↗
            </a>
          ) : null}
          {progress.canCheck ? (
            <button type="button" onClick={onCheckStatus}>Check status</button>
          ) : null}
          {progress.stage === "error" && progress.diagnostic ? (
            <button type="button" onClick={() => void copyDiagnostic()}>
              {copyState === "copied" ? "Diagnostics copied" : copyState === "failed" ? "Copy failed" : "Copy diagnostics"}
            </button>
          ) : null}
          {progress.stage === "error" && onUseBaseAppWallet ? (
            <button type="button" disabled={baseAppWalletBusy} onClick={onUseBaseAppWallet}>
              {baseAppWalletBusy ? "Switching wallet..." : "Switch to Base app wallet"}
            </button>
          ) : null}
          {progress.stage === "error" && baseAppRecoveryUrl ? (
            <button type="button" onClick={() => void copyBaseAppUrl()}>
              {siteCopyState === "copied" ? "Site link copied" : siteCopyState === "failed" ? "Copy failed" : "Copy for Base app"}
            </button>
          ) : null}
          {canDismiss ? (
            <button type="button" onClick={onDismiss}>Dismiss</button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
