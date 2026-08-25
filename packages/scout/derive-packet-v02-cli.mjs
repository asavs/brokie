import fs from "node:fs";
import path from "node:path";
import { ArtifactStore, PacketStore } from "./store.mjs";
import { deriveTruthfulPacketV02 } from "./derive-packet-v02.mjs";
import { createPacketValidatorV02 } from "./validate-packet-v02.mjs";

const args = process.argv.slice(2), option = (name, fallback = null) => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const stateRoot = path.resolve(option("state-dir", "var/scout-v0.2")), sourcePacketId = option("packet-id");
if (!sourcePacketId) throw new Error("--packet-id is required");
const artifacts = new ArtifactStore(stateRoot), validator = createPacketValidatorV02(artifacts), store = new PacketStore(stateRoot, validator);
const source = store.read(sourcePacketId), derived = deriveTruthfulPacketV02(source);
if (!derived.repairs.length) throw new Error("packet has no supported deterministic derivation");
const stored = store.put(derived.packet), manifestPath = path.join(stateRoot, "runs", `packet-derivation-${derived.packet.packet_id}.json`);
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify({ derivation_version: "scout-packet-truthfulness@0.2.0", source_packet_id: sourcePacketId, derived_packet_id: derived.packet.packet_id, repairs: derived.repairs }, null, 2)}\n`);
console.log(JSON.stringify({ source_packet_id: sourcePacketId, packet_id: derived.packet.packet_id, packet_path: store.packetPath(derived.packet.packet_id), storage_status: stored.status, manifest_path: manifestPath, repairs: derived.repairs }, null, 2));
