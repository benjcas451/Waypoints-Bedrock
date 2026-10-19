// Builds dist/WayPoints-<version>.mcaddon from packs/: both packs, with the version from
// package.json written into their manifests. Opening the .mcaddon imports both packs into Minecraft.
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

const root = new URL("..", import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const match = /^(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(version);
if (!match) {
	throw new Error(`Invalid version "${version}" in package.json`);
}
// Manifests only take numbers; a pre-release suffix ("0.2.0-beta.1") is dropped there.
const numeric = match.slice(1, 4).map(Number);

const packs = [
	{ source: "packs/behavior_pack", target: "WayPoints_BP" },
	{ source: "packs/resource_pack", target: "WayPoints_RP" },
];
const ownUuids = new Set(packs.map(pack => JSON.parse(readFileSync(join(root, pack.source, "manifest.json"), "utf8")).header.uuid));

/** @param {string} dir */
function listFiles(dir) {
	return readdirSync(dir).flatMap(name => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? listFiles(path) : [path];
	}).sort();
}

/** @param {string} text */
function stampManifest(text) {
	const manifest = JSON.parse(text);
	manifest.header.version = numeric;
	for (const module of manifest.modules) {
		module.version = numeric;
	}
	for (const dependency of manifest.dependencies ?? []) {
		if (ownUuids.has(dependency.uuid)) {
			dependency.version = numeric;
		}
	}
	return JSON.stringify(manifest, null, 2) + "\n";
}

/** A minimal zip writer (deflate, no extras), enough for Minecraft. */
function zip(entries) {
	const local = [];
	const central = [];
	let offset = 0;
	// 1980-01-01 00:00, so builds of the same sources are identical.
	const time = 0;
	const date = (0 << 9) | (1 << 5) | 1;
	for (const { name, data } of entries) {
		const fileName = Buffer.from(name, "utf8");
		const compressed = deflateRawSync(data, { level: 9 });
		const crc = crc32(data);
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(0x0800, 6); // UTF-8 names
		header.writeUInt16LE(8, 8);
		header.writeUInt16LE(time, 10);
		header.writeUInt16LE(date, 12);
		header.writeUInt32LE(crc, 14);
		header.writeUInt32LE(compressed.length, 18);
		header.writeUInt32LE(data.length, 22);
		header.writeUInt16LE(fileName.length, 26);
		header.writeUInt16LE(0, 28);
		local.push(header, fileName, compressed);

		const entry = Buffer.alloc(46);
		entry.writeUInt32LE(0x02014b50, 0);
		entry.writeUInt16LE(20, 4);
		entry.writeUInt16LE(20, 6);
		entry.writeUInt16LE(0x0800, 8);
		entry.writeUInt16LE(8, 10);
		entry.writeUInt16LE(time, 12);
		entry.writeUInt16LE(date, 14);
		entry.writeUInt32LE(crc, 16);
		entry.writeUInt32LE(compressed.length, 20);
		entry.writeUInt32LE(data.length, 24);
		entry.writeUInt16LE(fileName.length, 28);
		entry.writeUInt32LE(offset, 42);
		central.push(entry, fileName);
		offset += header.length + fileName.length + compressed.length;
	}
	const centralSize = central.reduce((sum, it) => sum + it.length, 0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(entries.length, 8);
	end.writeUInt16LE(entries.length, 10);
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, ...central, end]);
}

const entries = [];
for (const pack of packs) {
	const dir = join(root, pack.source);
	for (const file of listFiles(dir)) {
		const name = `${pack.target}/${relative(dir, file).split(sep).join("/")}`;
		let data = readFileSync(file);
		if (name.endsWith("/manifest.json") && name.split("/").length === 2) {
			data = Buffer.from(stampManifest(data.toString("utf8")), "utf8");
		} else if (name.endsWith(".json")) {
			JSON.parse(data.toString("utf8")); // fail early on broken JSON
		}
		entries.push({ name, data });
	}
}

const dist = join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
const output = join(dist, `WayPoints-${version}.mcaddon`);
writeFileSync(output, zip(entries));
console.log(`Built ${relative(root, output)} (${entries.length} files)`);
