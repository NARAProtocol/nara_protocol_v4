# Archived: NARA landing "Sovereign Grid" React app and v4 swap (2026-11-02)

Read-only historical code. Last live commit in `tools/nara-landing`: `6c2d9e5`
(working-copy checkpoint `175b810`).

Why archived: the `/swap` and `/app` routes were wired to the RETIRED v4 stack
(hook `0x59AEf9…`, vault `0xD7f7b4…`, pool id `0x1e3058…` in `src/lib/dexRouter.ts`
and `src/lib/content.ts`). The public swap destination is now CryptoSLIP
(`https://cryptoslip.eth.limo`). The meme landing page no longer builds this code.

Do not import from here, do not redeploy it, and do not copy its addresses
anywhere. The denylist check in `tools/nara-landing/scripts/check-denylist.cjs`
fails any landing build that references them.

To inspect the app as it was: `git show 6c2d9e5:tools/nara-landing/src/App.tsx`.
