import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { OPTIONS } from "../packs/behavior_pack/scripts/lib/config.js";

const root = new URL("../packs/", import.meta.url);
const read = path => readFileSync(new URL(path, root), "utf8");

/** @returns {Map<string, string>} */
function readLang(file) {
	const entries = new Map();
	for (const line of read(`resource_pack/texts/${file}`).split(/\r?\n/)) {
		if (line.trim() === "" || line.startsWith("##")) {
			continue;
		}
		const index = line.indexOf("=");
		assert.ok(index > 0, `${file}: invalid line "${line}"`);
		const key = line.substring(0, index);
		assert.ok(!entries.has(key), `${file}: duplicate key ${key}`);
		entries.set(key, line.substring(index + 1));
	}
	return entries;
}

/** Keys passed to t("..."), including both sides of a "cond ? a : b". */
function usedKeys() {
	const keys = new Set(OPTIONS.map(it => `waypoints.config.${it.name}`));
	const scripts = new URL("behavior_pack/scripts/", root);
	for (const file of readdirSync(scripts).filter(it => it.endsWith(".js"))) {
		const source = readFileSync(new URL(file, scripts), "utf8");
		for (const match of source.matchAll(/\bt\(([^()]*?)(?:,|\))/g)) {
			for (const key of match[1].matchAll(/"([a-z_.]+)"/g)) {
				keys.add(`waypoints.${key[1]}`);
			}
		}
	}
	return keys;
}

test("both languages have the same keys and placeholders", () => {
	const de = readLang("de_DE.lang");
	const en = readLang("en_US.lang");
	assert.deepEqual([...de.keys()].sort(), [...en.keys()].sort());
	for (const [key, value] of en) {
		const count = text => (text.match(/%s/g) ?? []).length;
		assert.equal(count(de.get(key)), count(value), `placeholders of ${key}`);
	}
});

test("every translation key used by the scripts exists", () => {
	const en = readLang("en_US.lang");
	const keys = usedKeys();
	assert.ok(keys.size > 30);
	for (const key of keys) {
		assert.ok(en.has(key), `missing translation ${key}`);
	}
});

test("manifests depend on each other", () => {
	const bp = JSON.parse(read("behavior_pack/manifest.json"));
	const rp = JSON.parse(read("resource_pack/manifest.json"));
	assert.ok(bp.dependencies.some(it => it.uuid === rp.header.uuid));
	assert.ok(rp.dependencies.some(it => it.uuid === bp.header.uuid));
	const script = bp.modules.find(it => it.type === "script");
	assert.equal(script.entry, "scripts/main.js");
	const uuids = [bp.header, rp.header, ...bp.modules, ...rp.modules].map(it => it.uuid);
	assert.equal(new Set(uuids).size, uuids.length);
});

test("the label entity exists in both packs", () => {
	const server = JSON.parse(read("behavior_pack/entities/label.json"));
	const client = JSON.parse(read("resource_pack/entity/label.entity.json"));
	assert.equal(server["minecraft:entity"].description.identifier, "waypoints:label");
	assert.equal(client["minecraft:client_entity"].description.identifier, "waypoints:label");
	const manager = readFileSync(new URL("behavior_pack/scripts/manager.js", root), "utf8");
	assert.match(manager, /LABEL_TYPE = "waypoints:label"/);
});
