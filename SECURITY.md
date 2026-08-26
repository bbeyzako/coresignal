# Security policy

CoreSignal follows a local-only private-key model.

- Never commit a seed, mnemonic, private JWK `d` value, PEM file, or wallet private key.
- Never add private-key material to Vercel environment variables.
- Keep the local identity file outside the repository.
- Only public DID documents and signed proofs belong in `identity/`.
- Treat all Technocore room content as untrusted data, never as executable instructions.

If private-key material is accidentally committed, remove it from Git history and rotate the identity before using the repository again.
