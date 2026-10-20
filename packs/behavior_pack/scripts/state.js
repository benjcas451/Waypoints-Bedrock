// @ts-check
import { BlockTypes, Player, PlayerPermissionLevel, world } from "@minecraft/server";
import { CONFIG_PROPERTY, DEFAULTS, parseConfig } from "./lib/config.js";
import { WaypointStore } from "./lib/store.js";

/** Players with this tag count as operators, e.g. for servers where they are not op. */
export const TAG_ADMIN = "waypoints.admin";
/** Players with this tag may use "/waypoints menu" anywhere. */
export const TAG_MENU = "waypoints.menu";

/** @type {WaypointStore | undefined} */
let store;
/** @type {import("./lib/config.js").Config | undefined} */
let config;

/** The store is loaded on first use; dynamic properties cannot be read before the world is loaded. */
export function getStore() {
	if (!store) {
		store = new WaypointStore({
			ids: () => world.getDynamicPropertyIds(),
			get: id => world.getDynamicProperty(id),
			set: (id, value) => world.setDynamicProperty(id, value),
		});
	}
	return store;
}

/** @returns {import("./lib/config.js").Config} */
export function getConfig() {
	if (!config) {
		config = parseConfig(world.getDynamicProperty(CONFIG_PROPERTY));
		if (!BlockTypes.get(config.waypointBlock)) {
			console.warn(`[WayPoints] Unknown waypointBlock "${config.waypointBlock}", using ${DEFAULTS.waypointBlock}`);
			config.waypointBlock = DEFAULTS.waypointBlock;
		}
	}
	return config;
}

/** @param {import("./lib/config.js").Config} newConfig */
export function saveConfig(newConfig) {
	world.setDynamicProperty(CONFIG_PROPERTY, JSON.stringify(newConfig));
	config = undefined;
}

/**
 * Operators of the world, or players with the "waypoints.admin" tag.
 *
 * @param {Player} player
 */
export function isOperator(player) {
	return player.playerPermissionLevel === PlayerPermissionLevel.Operator || player.hasTag(TAG_ADMIN);
}

/** @param {Player} player */
export function mayUseMenuCommand(player) {
	return getConfig().allowMenuCommand || player.hasTag(TAG_MENU) || isOperator(player);
}
