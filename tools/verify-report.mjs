import { createHash, createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";

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

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: npm run verify:report -- signed-report.json");
  process.exit(1);
}

const [proof, publicIdentity] = await Promise.all([
  JSON.parse(await readFile(inputPath, "utf8")),
  JSON.parse(
    await readFile(new URL("../identity/public-did.json", import.meta.url), "utf8"),
  ),
]);
const expectedDid = publicIdentity.id;
if (!publicIdentity.initialized || !expectedDid?.startsWith("did:key:")) {
  throw new Error("CoreSignal public identity is not initialized.");
}
if (proof.schema !== "coresignal-signed-report-v1") {
  throw new Error("Unsupported CoreSignal proof schema.");
}

const derivedDid = didFromPublicJwk(proof.publicKeyJwk);
if (derivedDid !== proof.did || derivedDid !== expectedDid) {
  throw new Error("The proof DID does not match the CoreSignal public key.");
}

const canonical = JSON.stringify(proof.payload);
const hash = createHash("sha256").update(canonical).digest("hex");
if (hash !== proof.sha256) throw new Error("The report hash does not match.");

const publicKey = createPublicKey({ key: proof.publicKeyJwk, format: "jwk" });
const isValid = verify(
  null,
  Buffer.from(canonical),
  publicKey,
  Buffer.from(proof.signature, "base64url"),
);
if (!isValid) throw new Error("The report signature is invalid.");

console.log(`Valid CoreSignal proof from ${derivedDid}`);
console.log(`SHA-256 ${hash}`);
