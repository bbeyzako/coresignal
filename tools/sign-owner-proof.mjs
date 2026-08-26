import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

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
    throw new Error("The key must be an Ed25519 JWK.");
  }
  const publicBytes = Buffer.from(publicKeyJwk.x, "base64url");
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), publicBytes]);
  return `did:key:z${encodeBase58(multicodec)}`;
}

const keyPath = process.env.CORESIGNAL_KEY_FILE;
if (!keyPath) {
  console.error("Set CORESIGNAL_KEY_FILE to the local identity JSON path.");
  process.exit(1);
}

const claimPath = path.join(process.cwd(), "identity", "owner-claim.json");
const outputPath = path.join(process.cwd(), "identity", "owner-proof.json");
const [claim, identity, publicIdentity] = await Promise.all([
  JSON.parse(await readFile(claimPath, "utf8")),
  JSON.parse(await readFile(keyPath, "utf8")),
  JSON.parse(
    await readFile(path.join(process.cwd(), "identity", "public-did.json"), "utf8"),
  ),
]);
const expectedDid = publicIdentity.id;
if (!publicIdentity.initialized || !expectedDid?.startsWith("did:key:")) {
  throw new Error("Run npm run identity:create before creating an owner proof.");
}
const privateKeyJwk = identity.privateKeyJwk ?? identity;
if (!privateKeyJwk.d) {
  throw new Error("The local identity file does not contain a private Ed25519 JWK.");
}

const privateKey = createPrivateKey({ key: privateKeyJwk, format: "jwk" });
const publicKeyJwk = createPublicKey(privateKey).export({ format: "jwk" });
const did = didFromPublicJwk(publicKeyJwk);
if (identity.did && identity.did !== did) {
  throw new Error("The DID stored in the identity file does not match its private key.");
}
if (did !== expectedDid || claim.did !== expectedDid) {
  throw new Error(`This CoreSignal build only accepts ${expectedDid}.`);
}

const canonical = JSON.stringify(claim);
const sha256 = createHash("sha256").update(canonical).digest("hex");
const signature = sign(null, Buffer.from(canonical), privateKey).toString("base64url");
const proof = {
  schema: "coresignal-owner-proof-v1",
  did,
  publicKeyJwk,
  claim,
  sha256,
  signature,
  signedAt: new Date().toISOString(),
};

await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`Owner proof signed with ${did}`);
console.log(`Saved ${outputPath}`);
