import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { canonicalJson, packetId, sha256 } from "./canonical.mjs";

function atomicCreate(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const existing = fs.readFileSync(file);
    if (!existing.equals(Buffer.from(bytes))) {
      const failure = new Error(`store_corruption: immutable object differs at ${file}`);
      failure.code = "store_corruption";
      throw failure;
    }
    return "reused";
  }
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  try {
    const handle = fs.openSync(temporary, "wx");
    try {
      fs.writeFileSync(handle, bytes);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.linkSync(temporary, file);
    return "emitted";
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const existing = fs.readFileSync(file);
    if (!existing.equals(Buffer.from(bytes))) {
      const failure = new Error(`store_corruption: immutable object differs at ${file}`);
      failure.code = "store_corruption";
      throw failure;
    }
    return "reused";
  } finally {
    try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

export class ArtifactStore {
  constructor(root) { this.root = path.resolve(root); }
  paths(artifactId) {
    const hash = artifactId.replace(/^art_sha256_/, "");
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("invalid artifact ID");
    const dir = path.join(this.root, "artifacts", hash.slice(0, 2), hash.slice(2, 4));
    return { body: path.join(dir, `${artifactId}.bin`), manifest: path.join(dir, `${artifactId}.json`) };
  }
  put(bytes, metadata) {
    if (!["repository_file", "http_body", "derived_text"].includes(metadata.kind)) throw new Error("invalid artifact kind");
    if (typeof metadata.media_type !== "string" || !metadata.media_type) throw new Error("artifact media_type is required");
    if (metadata.kind === "derived_text" && (!metadata.derived_from_artifact_id || !metadata.transformation)) throw new Error("derived_text requires source artifact and transformation");
    if (metadata.kind !== "derived_text" && (metadata.derived_from_artifact_id || metadata.transformation)) throw new Error("only derived_text may have derivation metadata");
    const body = Buffer.from(bytes);
    const hash = sha256(body);
    const artifact_id = `art_sha256_${hash}`;
    const manifest = {
      artifact_id,
      kind: metadata.kind,
      media_type: metadata.media_type,
      byte_length: body.length,
      sha256: hash,
      ...(metadata.derived_from_artifact_id ? { derived_from_artifact_id: metadata.derived_from_artifact_id } : {}),
      ...(metadata.transformation ? { transformation: metadata.transformation } : {}),
    };
    const paths = this.paths(artifact_id);
    const bodyStatus = atomicCreate(paths.body, body);
    atomicCreate(paths.manifest, Buffer.from(`${canonicalJson(manifest)}\n`));
    return { ...manifest, storage_status: bodyStatus };
  }
  read(artifactId) {
    const paths = this.paths(artifactId);
    const body = fs.readFileSync(paths.body);
    const manifest = JSON.parse(fs.readFileSync(paths.manifest, "utf8"));
    const hash = sha256(body);
    if (manifest.artifact_id !== artifactId || manifest.sha256 !== hash || manifest.byte_length !== body.length || artifactId !== `art_sha256_${hash}`) {
      const error = new Error(`store_corruption: ${artifactId}`);
      error.code = "store_corruption";
      throw error;
    }
    return { bytes: body, manifest };
  }
}

export class PacketStore {
  constructor(root, validator) { this.root = path.resolve(root); this.validator = validator; }
  packetPath(id) {
    const hash = id.replace(/^scoutpkt_sha256_/, "");
    if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("invalid packet ID");
    return path.join(this.root, "packets", hash.slice(0, 2), `${id}.json`);
  }
  put(packet) {
    this.validator(packet);
    if (packet.packet_id !== packetId(packet)) throw new Error("packet_id does not match canonical packet");
    const bytes = Buffer.from(`${canonicalJson(packet)}\n`);
    return { packet_id: packet.packet_id, status: atomicCreate(this.packetPath(packet.packet_id), bytes) };
  }
  read(id) { return JSON.parse(fs.readFileSync(this.packetPath(id), "utf8")); }
}
