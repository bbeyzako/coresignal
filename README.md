# CoreSignal

CoreSignal turns noisy public Technocore rooms into an inspectable signal feed. It detects operational topics, extracts high-signal messages, produces a deterministic report receipt, and lets the project owner sign exported reports locally with one `did:key` identity.

## Why it exists

Public agent rooms are easy to read but difficult to monitor. CoreSignal gives builders a focused view of testnet, faucet, inference, miner, validator, DID, release, and project activity without treating room messages as trusted instructions.

## Features

- Read any public Technocore room
- Count messages, writers, links, and DID-backed senders
- Surface high-signal operational messages
- Generate a SHA-256 receipt for each report
- Export reports as JSON
- Sign and verify reports locally with Ed25519
- Keep seed and private-key material off the website and Vercel

## Public identity

CoreSignal uses one project-specific DID. It is intentionally uninitialized in the source package so the project owner can generate it locally. After initialization, the public identity document is stored at [`identity/public-did.json`](identity/public-did.json). The seed and private JWK `d` value are never included in the repository.

## Local development

Requirements: Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Validate a production build:

```bash
npm run lint
npm run build
```

## Create the CoreSignal DID on Windows PowerShell

Generate the identity once, outside this repository:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\CoreSignal-Private"
npm run identity:create -- "$env:USERPROFILE\CoreSignal-Private\identity.json"
```

The command prints the new public DID, saves its private key outside the project, and updates only `identity/public-did.json` and `identity/owner-claim.json` inside the project.

## Create the owner proof

```powershell
$env:CORESIGNAL_KEY_FILE="$env:USERPROFILE\CoreSignal-Private\identity.json"
npm run sign:owner
npm run verify:owner
Remove-Item Env:CORESIGNAL_KEY_FILE
```

This creates `identity/owner-proof.json`. It contains the public key, claim, hash, and signature—never the private key. Commit the generated proof to GitHub.

## Sign an exported CoreSignal report

```powershell
$env:CORESIGNAL_KEY_FILE="C:\absolute\private\path\identity.json"
npm run sign:report -- "C:\path\to\coresignal-technocore.json"
npm run verify:report -- "C:\path\to\coresignal-technocore.signed.json"
Remove-Item Env:CORESIGNAL_KEY_FILE
```

## Publish to GitHub

Create an empty public repository named `coresignal` under `bbeyzako`, open this folder in VS Code, and run:

```powershell
git init
git add .
git commit -m "Launch CoreSignal MVP"
git branch -M main
git remote add origin https://github.com/bbeyzako/coresignal.git
git push -u origin main
```

Before `git add .`, confirm that the local key file is outside the project and run `git status`.

## Deploy on Vercel

1. In Vercel, choose **Add New → Project**.
2. Import `bbeyzako/coresignal`.
3. Keep Framework Preset as **Next.js** and Root Directory as `./`.
4. No environment variable is required for the MVP.
5. Deploy.

Each later push to `main` will create a new production deployment through the Vercel Git integration.

## Trust model

A valid DID signature proves that the same CoreSignal key signed a specific payload and that the payload was not modified afterward. It does not prove that a Technocore message is true or trustworthy.

## License

MIT
