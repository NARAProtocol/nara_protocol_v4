# Security Policy (`SECURITY.md`)

**Canonical RFC 9116 Endpoint:** [`https://naraprotocol.io/.well-known/security.txt`](https://naraprotocol.io/.well-known/security.txt)  
**Security Contact:** `security@naraprotocol.io`  
**Privacy & GDPR Inquiries:** `privacy@naraprotocol.io` ([`https://naraprotocol.io/privacy`](https://naraprotocol.io/privacy))

---

## Reporting a Vulnerability

**Do NOT open a public GitHub issue or post in public social channels for unpatched vulnerabilities.**

Report vulnerabilities privately through either channel:

1. **Email:** `security@naraprotocol.io`
2. **GitHub Private Vulnerability Reporting:** Use this repository's **Security → Report a vulnerability** advisories tab.

Please include:
- Affected route, file path, or Cloudflare Pages Function (`/api/*`, `_middleware.js`, `src/meme/*`).
- Step-by-step reproduction or minimal Proof of Concept (`PoC`).
- Concrete impact assessment (e.g., CSP bypass, calldata manipulation on `#buyNaraModal` or `/vault`, KV auth bypass, or secret exposure).

### Target Response Timelines
- **Acknowledgment:** Within `72 hours` (`<= 24 hours` target for Critical/High issues).
- **Triage & Fix:** Critical/High security regressions are prioritized for immediate mitigation and verified Cloudflare Pages redeployment.

---

## In-Scope Assets

| Component | Scope |
| :--- | :--- |
| Static Web Portal (`index.html`, `vault.html`, `src/meme/*`) | In Scope (Highest Priority: `v4SwapEngine.js`, `buyModal.js`, `anchorSeats.js`, `erc8021.js`) |
| Cloudflare Pages Functions & Middleware (`functions/*`) | In Scope (`/api/leaderboard`, `/api/quote`, `/api/*supply*`, `_middleware.js`) |
| Security Headers & Well-Known Manifests (`public/_headers`, `public/.well-known/*`) | In Scope |
| Smart Contracts on Base Mainnet (`8453`) | See [`NARAProtocol/nara_protocol/SECURITY.md`](https://github.com/NARAProtocol/nara_protocol/blob/main/SECURITY.md) |

---

## Safe Harbor

Good-faith security research tested locally (`npm run pages:dev`) or against your own wallets without disrupting live service availability, exhausting KV/RPC quotas, or affecting other users is authorized under this policy.
