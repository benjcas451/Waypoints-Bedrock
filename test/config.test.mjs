import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULTS, OPTIONS, cooldownRemaining, normalizeConfig, parseConfig, xpCost } from "../packs/behavior_pack/scripts/lib/config.js";
import { MAX_NAME_LENGTH, sanitizeName } from "../packs/behavior_pack/scripts/lib/names.js";

test("defaults match the Paper plugin", () => {
	assert.deepEqual(parseConfig(undefined), { ...DEFAULTS });
	assert.equal(DEFAULTS.waypointBlock, "minecraft:lodestone");
	assert.equal(DEFAULTS.xpCostLevels, 1);
	assert.equal(DEFAULTS.xpCostCrossDimensionLevels, 3);
	assert.equal(DEFAULTS.cooldownSeconds, 10);
	// Every option is in the settings form.
	assert.deepEqual(OPTIONS.map(it => it.name).sort(), Object.keys(DEFAULTS).sort());
});

test("invalid values fall back to the defaults, numbers are clamped", () => {
	const config = parseConfig(JSON.stringify({
		showLabels: false,
		requireNameTag: "no",
		xpCostLevels: 99,
		cooldownSeconds: -5,
		maxWaypointsPerPlayer: 2.6,
		waypointBlock: "  Crying_Obsidian ",
		unknown: 1,
	}));
	assert.equal(config.showLabels, false);
	assert.equal(config.requireNameTag, true);
	assert.equal(config.xpCostLevels, 30);
	assert.equal(config.cooldownSeconds, 0);
	assert.equal(config.maxWaypointsPerPlayer, 3);
	assert.equal(config.waypointBlock, "minecraft:crying_obsidian");
	assert.equal("unknown" in config, false);
	assert.deepEqual(parseConfig("{broken"), { ...DEFAULTS });
	assert.equal(normalizeConfig({ waypointBlock: "mod:stone" }).waypointBlock, "mod:stone");
	assert.equal(normalizeConfig({ waypointBlock: " " }).waypointBlock, DEFAULTS.waypointBlock);
});

test("teleport cost", () => {
	const config = normalizeConfig({});
	assert.equal(xpCost(config, { creative: false, crossDimension: false }), 1);
	assert.equal(xpCost(config, { creative: false, crossDimension: true }), 3);
	assert.equal(xpCost(config, { creative: true, crossDimension: true }), 0);
	assert.equal(xpCost(normalizeConfig({ creativeIgnoresCost: false }), { creative: true, crossDimension: true }), 3);
});

test("cooldown is rounded up", () => {
	const config = normalizeConfig({ cooldownSeconds: 10 });
	assert.equal(cooldownRemaining(config, undefined, 1000), 0);
	assert.equal(cooldownRemaining(config, 0, 1), 10);
	assert.equal(cooldownRemaining(config, 0, 9001), 1);
	assert.equal(cooldownRemaining(config, 0, 10000), 0);
});

test("names are cleaned up", () => {
	assert.equal(sanitizeName("  My \t  Home "), "My Home");
	assert.equal(sanitizeName("§6Gold§r Base"), "6Goldr Base");
	assert.equal(sanitizeName("a\u0000b\u009fc"), "abc");
	assert.equal(sanitizeName(""), "");
	assert.equal([...sanitizeName("ä".repeat(40))].length, MAX_NAME_LENGTH);
	assert.equal(sanitizeName("😀".repeat(40)), "😀".repeat(MAX_NAME_LENGTH));
});
