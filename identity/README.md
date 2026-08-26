# CoreSignal identity

This folder is designed to contain public verification material only.

- `public-did.json`: public DID and Ed25519 public key
- `owner-claim.json`: deterministic ownership claim to sign
- `owner-proof.json`: generated locally by `npm run sign:owner`

Run `npm run identity:create -- "C:\absolute\private\path\identity.json"` once before signing. The command generates a new CoreSignal identity locally and configures the two public files above.

The generated proof is safe to commit because it contains only the public key, claim, hash, signature, and signing timestamp. Never copy the local identity file into this folder.
