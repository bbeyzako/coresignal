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

function usage() {
  console.error(
    "Usage: CORESIGNAL_KEY_FILE=/local/identity.json npm run sign:report -- report.json [signed-report.json]",
  );
  process.exit(1);
}

const inputPath = process.argv[2];
const keyPath = process.env.CORESIGNAL_KEY_FILE;
if (!inputPath || !keyPath) usage();

const outputPath =
  process.argv[3] ??
  path.join(
    path.dirname(inputPath),
    `${path.basename(inputPath, path.extname(inputPath))}.signed.json`,
  );

const [report, identity, publicIdentity] = await Promise.all([
  JSON.parse(await readFile(inputPath, "utf8")),
  JSON.parse(await readFile(keyPath, "utf8")),
  JSON.parse(
    await readFile(path.join(process.cwd(), "identity", "public-did.json"), "utf8"),
  ),
]);
const expectedDid = publicIdentity.id;
if (!publicIdentity.initialized || !expectedDid?.startsWith("did:key:")) {
  throw new Error("Run npm run identity:create before signing reports.");
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
if (did !== expectedDid) {
  throw new Error(`This CoreSignal build only accepts ${expectedDid}.`);
}

const payload = report.receipt?.payload ?? report.payload ?? report;
const canonical = JSON.stringify(payload);
const hash = createHash("sha256").update(canonical).digest("hex");
const signature = sign(null, Buffer.from(canonical), privateKey).toString("base64url");
const proof = {
  schema: "coresignal-signed-report-v1",
  did,
  publicKeyJwk,
  payload,
  sha256: hash,
  signature,
  signedAt: new Date().toISOString(),
};

await writeFile(outputPath, `${JSON.stringify(proof, null, 2)}\n`, { mode: 0o600 });
console.log(`Signed with ${did}`);
console.log(`Saved ${outputPath}`);
