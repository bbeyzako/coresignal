import { generateKeyPairSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
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
  const publicBytes = Buffer.from(publicKeyJwk.x, "base64url");
  const multicodec = Buffer.concat([Buffer.from([0xed, 0x01]), publicBytes]);
  return `did:key:z${encodeBase58(multicodec)}`;
}

const requestedPath = process.argv[2];
if (!requestedPath) {
  console.error(
    'Usage: npm run identity:create -- "C:\\absolute\\private\\path\\identity.json"',
  );
  process.exit(1);
}

const projectRoot = process.cwd();
const outputPath = path.resolve(requestedPath);
const relativeToProject = path.relative(projectRoot, outputPath);
const isInsideProject =
  relativeToProject === "" ||
  (!relativeToProject.startsWith("..") && !path.isAbsolute(relativeToProject));
if (isInsideProject) {
  throw new Error("The private identity file must be stored outside the project folder.");
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const publicKeyJwk = publicKey.export({ format: "jwk" });
const privateKeyJwk = privateKey.export({ format: "jwk" });
const did = didFromPublicJwk(publicKeyJwk);
const fingerprint = did.slice("did:key:".length);
const identity = {
  warning: "Do not share or commit this file. It can sign as the CoreSignal DID.",
  did,
  privateKeyJwk,
};
const publicIdentity = {
  schema: "coresignal-public-identity-v1",
  initialized: true,
  id: did,
  verificationMethod: {
    id: `${did}#${fingerprint}`,
    type: "JsonWebKey2020",
    controller: did,
    publicKeyJwk,
  },
};
const ownerClaim = {
  schema: "coresignal-owner-claim-v1",
  project: "CoreSignal",
  repository: "https://github.com/bbeyzako/coresignal",
  did,
  statement: "I control this DID and use it as the public identity of CoreSignal.",
  createdOn: new Date().toISOString().slice(0, 10),
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(identity, null, 2)}\n`, {
  flag: "wx",
  mode: 0o600,
});
await Promise.all([
  writeFile(
    path.join(projectRoot, "identity", "public-did.json"),
    `${JSON.stringify(publicIdentity, null, 2)}\n`,
  ),
  writeFile(
    path.join(projectRoot, "identity", "owner-claim.json"),
    `${JSON.stringify(ownerClaim, null, 2)}\n`,
  ),
]);

console.log(`CoreSignal DID created: ${did}`);
console.log(`Private identity saved outside the project: ${outputPath}`);
console.log("Public identity files updated. Never commit the private identity file.");
