# 2026-11-25. WA-27 with the real test phone; logout confirmation (WA closed)

Purpose: record what was done, who authorised it, and where it ended. Session 7, end.

## Summary
- Ran the stack with `WHATSAPP_PROVIDER=baileys` (set on the command, `.env` unchanged) and walked the user through WA-27. All steps passed; details and times in spec Decision 42.
- Three unintended "Log out WhatsApp" clicks unlinked the device right after pairing (the button replaced "Get new QR" in the same spot). With the user's choice "A", WA-24 now requires a confirmation click (spec first, then `apps/web/src/pages.tsx` and `styles.css`; Decision 41).

## Timeline

| # | What happened | Authorised by |
| --- | --- | --- |
| 1 | Started `pnpm dev` with Baileys; real QR on the connection page; opened the page in the user's browser. | User: "run it and i take to the qr scan step". |
| 2 | "Scanning but nothing happening": checked Redis, Postgres and Baileys' QR format (the `https://wa.me/settings/linked_devices#…` text is Baileys' own). Verified the page showed the live QR with a separate Playwright browser (read only). The pairing then completed. | User report. |
| 3 | Restart attempt found the session logged out by an admin click; re-paired; found a second such click. Proposed a confirmation step (A) or leaving it (B). | User: "next". |
| 4 | The user stopped my first edit (code before spec, after I had said spec first) and said "continue": spec WA-24 and Decision 41 first, then the code. Typecheck, lint, web tests pass; Vite reloaded the page. | User: "A", then "continue". |
| 5 | Restart test with an unbuffered event recorder: connected again in 2.4 s with no QR. | User: "next". |
| 6 | Network drop (user's Wi-Fi), then phone unlink, then re-pair: all as expected. | User: "next", "now check", "check", "check". |
| 7 | Docs: spec status (WA closed) and Decisions 41 and 42, CLAUDE.md, README, this file. Gate and one local commit. | Phase-end routine. |

## Left running
- `pnpm dev` with Baileys stays running, connected to the test number, for the user.
