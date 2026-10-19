// @ts-check

/**
 * The settings of the add-on. Bedrock add-ons have no config file the server owner can edit,
 * so they are stored in the world (dynamic property "waypoints:config") and changed in game
 * with "/waypoints settings". Missing or invalid options fall back to the defaults below.
 * <p>
 * This module does not import @minecraft/server, so it can be tested with plain Node.
 */

export const CONFIG_PROPERTY = "waypoints:config";

/**
 * @typedef {object} Config
 * @property {boolean} ownersCanChangeVisibility Owners may switch their waypoints between "everyone" and "visitors only". Operators always can.
 * @property {string} waypointBlock Block that acts as a waypoint.
 * @property {boolean} requireNameTag Creating needs a renamed name tag (otherwise also sneak + use with an empty hand).
 * @property {boolean} creationRequiresOp Only operators may create waypoints.
 * @property {number} maxWaypointsPerPlayer Maximum number of own waypoints per player, 0 = unlimited.
 * @property {boolean} protectWaypoints Only owners and operators may break and rename waypoints; explosions leave them alone.
 * @property {boolean} showLabels Show the name above the waypoint.
 * @property {number} xpCostLevels Cost in levels within a dimension.
 * @property {number} xpCostCrossDimensionLevels Cost in levels into another dimension.
 * @property {boolean} allowCrossDimension Allow teleporting between dimensions.
 * @property {number} cooldownSeconds Seconds between two teleports.
 * @property {boolean} creativeIgnoresCost Creative mode pays nothing and has no cooldown.
 * @property {boolean} allowMenuCommand Players without the "waypoints.menu" tag may use "/waypoints menu" too.
 */

/** @type {Readonly<Config>} */
export const DEFAULTS = Object.freeze({
	ownersCanChangeVisibility: true,
	waypointBlock: "minecraft:lodestone",
	requireNameTag: true,
	creationRequiresOp: false,
	maxWaypointsPerPlayer: 0,
	protectWaypoints: true,
	showLabels: true,
	xpCostLevels: 1,
	xpCostCrossDimensionLevels: 3,
	allowCrossDimension: true,
	cooldownSeconds: 10,
	creativeIgnoresCost: true,
	allowMenuCommand: false,
});

/**
 * The options in the order of the settings form. Numbers have the range of their slider.
 *
 * @typedef {{name: keyof Config, type: "boolean"} | {name: keyof Config, type: "string"}
 *   | {name: keyof Config, type: "number", min: number, max: number, step: number}} Option
 * @type {readonly Option[]}
 */
export const OPTIONS = Object.freeze([
	{ name: "waypointBlock", type: "string" },
	{ name: "requireNameTag", type: "boolean" },
	{ name: "creationRequiresOp", type: "boolean" },
	{ name: "maxWaypointsPerPlayer", type: "number", min: 0, max: 100, step: 1 },
	{ name: "protectWaypoints", type: "boolean" },
	{ name: "ownersCanChangeVisibility", type: "boolean" },
	{ name: "showLabels", type: "boolean" },
	{ name: "xpCostLevels", type: "number", min: 0, max: 30, step: 1 },
	{ name: "xpCostCrossDimensionLevels", type: "number", min: 0, max: 30, step: 1 },
	{ name: "allowCrossDimension", type: "boolean" },
	{ name: "cooldownSeconds", type: "number", min: 0, max: 300, step: 5 },
	{ name: "creativeIgnoresCost", type: "boolean" },
	{ name: "allowMenuCommand", type: "boolean" },
]);

/**
 * "Lodestone" or "minecraft:lodestone" -> "minecraft:lodestone".
 *
 * @param {string} id
 */
export function normalizeBlockId(id) {
	const trimmed = id.trim().toLowerCase();
	return trimmed.includes(":") ? trimmed : `minecraft:${trimmed}`;
}

/**
 * Builds a complete config from stored or submitted values.
 *
 * @param {unknown} raw an object with some of the options
 * @returns {Config}
 */
export function normalizeConfig(raw) {
	/** @type {Record<string, unknown>} */
	const values = typeof raw === "object" && raw !== null ? /** @type {Record<string, unknown>} */ (raw) : {};
	/** @type {Record<string, unknown>} */
	const config = { ...DEFAULTS };
	for (const option of OPTIONS) {
		const value = values[option.name];
		if (option.type === "boolean" && typeof value === "boolean") {
			config[option.name] = value;
		} else if (option.type === "number" && typeof value === "number" && Number.isFinite(value)) {
			config[option.name] = Math.min(option.max, Math.max(option.min, Math.round(value)));
		} else if (option.type === "string" && typeof value === "string" && value.trim() !== "") {
			config[option.name] = option.name === "waypointBlock" ? normalizeBlockId(value) : value.trim();
		}
	}
	return /** @type {Config} */ (config);
}

/**
 * @param {unknown} stored the JSON string from the world, if any
 * @returns {Config}
 */
export function parseConfig(stored) {
	if (typeof stored !== "string") {
		return normalizeConfig({});
	}
	try {
		return normalizeConfig(JSON.parse(stored));
	} catch {
		return normalizeConfig({});
	}
}

/**
 * Levels a teleport costs.
 *
 * @param {Config} config
 * @param {{creative: boolean, crossDimension: boolean}} context
 */
export function xpCost(config, { creative, crossDimension }) {
	if (creative && config.creativeIgnoresCost) {
		return 0;
	}
	return Math.max(0, crossDimension ? config.xpCostCrossDimensionLevels : config.xpCostLevels);
}

/**
 * Seconds left until the next teleport, rounded up.
 *
 * @param {Config} config
 * @param {number | undefined} lastTeleport milliseconds
 * @param {number} now milliseconds
 */
export function cooldownRemaining(config, lastTeleport, now) {
	if (lastTeleport === undefined) {
		return 0;
	}
	const remaining = lastTeleport + config.cooldownSeconds * 1000 - now;
	return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}
