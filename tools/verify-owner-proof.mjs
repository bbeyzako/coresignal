import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const EXPECTED_REPOSITORY = "https://github.com/bbeyzako/coresignal";
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes) {
  let number = BigInt(`0x${Buffer.from(bytes).toString("hex") || "0"}`);
  let output = "";
  while (number > 0n) {
    const remainder = Number(number % 58n);
    output = alphabet[remainder] + output;
    number /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    output = `1${output}`;
  }
  return output || "1";
}

function didFromPublicJwk(publicKeyJwk) {
  if (publicKeyJwk.kty !== "OKP" || publicKeyJwk.crv !== "Ed25519" || !publicKeyJwk.x) {
    throw new Error("The proof does not contain a valid Ed25519 public JWK.");
  }
  const publicBytes = Buffer.from(publicKeyJwk.x, "base64url");
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), publicBytes]);
  return `did:key:z${encodeBase58(multicodec)}`;
}

const inputPath =
  process.argv[2] ?? path.join(process.cwd(), "identity", "owner-proof.json");
const [proof, publicIdentity] = await Promise.all([
  JSON.parse(await readFile(inputPath, "utf8")),
  JSON.parse(
    await readFile(path.join(process.cwd(), "identity", "public-did.json"), "utf8"),
  ),
]);
const expectedDid = publicIdentity.id;
if (!publicIdentity.initialized || !expectedDid?.startsWith("did:key:")) {
  throw new Error("CoreSignal public identity is not initialized.");
}
if (proof.schema !== "coresignal-owner-proof-v1") {
  throw new Error("Unsupported CoreSignal owner-proof schema.");
}

const derivedDid = didFromPublicJwk(proof.publicKeyJwk);
if (
  derivedDid !== proof.did ||
  derivedDid !== expectedDid ||
  proof.claim?.did !== expectedDid ||
  proof.claim?.repository !== EXPECTED_REPOSITORY
) {
  throw new Error("The proof identity or repository claim does not match CoreSignal.");
}

const canonical = JSON.stringify(proof.claim);
const sha256 = createHash("sha256").update(canonical).digest("hex");
if (sha256 !== proof.sha256) throw new Error("The owner-claim hash does not match.");

const publicKey = createPublicKey({ key: proof.publicKeyJwk, format: "jwk" });
const valid = verify(
  null,
  Buffer.from(canonical),
  publicKey,
  Buffer.from(proof.signature, "base64url"),
);
if (!valid) throw new Error("The owner-proof signature is invalid.");

console.log(`Valid CoreSignal owner proof from ${derivedDid}`);
console.log(`Repository ${proof.claim.repository}`);
console.log(`SHA-256 ${sha256}`);
