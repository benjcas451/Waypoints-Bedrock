// @ts-check

/**
 * Texts come from the resource pack (texts/*.lang), so every player sees them in the language
 * of their own game. Only the keys and arguments are sent.
 */

/**
 * @typedef {import("@minecraft/server").RawMessage} RawMessage
 */

/**
 * A translated text, e.g. t("created", name) for "waypoints.created".
 *
 * @param {string} key without the "waypoints." prefix
 * @param {...(string | number)} args
 * @returns {RawMessage}
 */
export function t(key, ...args) {
	return args.length === 0
		? { translate: `waypoints.${key}` }
		: { translate: `waypoints.${key}`, with: args.map(String) };
}

/**
 * Joins plain strings (e.g. color codes) and translated parts.
 *
 * @param {...(string | RawMessage)} parts
 * @returns {RawMessage}
 */
export function raw(...parts) {
	return { rawtext: parts.map(part => (typeof part === "string" ? { text: part } : part)) };
}

/** @param {string} dimension e.g. "minecraft:the_end" */
export function dimensionName(dimension) {
	switch (dimension) {
		case "minecraft:overworld":
			return t("dimension.overworld");
		case "minecraft:nether":
			return t("dimension.nether");
		case "minecraft:the_end":
			return t("dimension.the_end");
		default:
			return { text: dimension.replace(/^minecraft:/, "") };
	}
}

export const RED = "§c";
export const GREEN = "§a";
export const YELLOW = "§e";
export const GRAY = "§7";
export const GOLD = "§6";
export const AQUA = "§b";
