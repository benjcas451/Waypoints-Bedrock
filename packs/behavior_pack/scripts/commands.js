// @ts-check
import { CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, Player, system } from "@minecraft/server";
import { sanitizeName } from "./lib/names.js";
import { ACTIVATION, GLOBAL, isGlobal } from "./lib/store.js";
import { GOLD, GRAY, GREEN, RED, raw, t } from "./lang.js";
import * as manager from "./manager.js";
import * as menu from "./menu.js";
import { openSettings } from "./settings.js";
import { getStore, isOperator, mayUseMenuCommand } from "./state.js";

/**
 * @typedef {import("@minecraft/server").CustomCommandOrigin} CustomCommandOrigin
 * @typedef {import("@minecraft/server").CustomCommandResult} CustomCommandResult
 * @typedef {import("./lib/store.js").Waypoint} Waypoint
 */

const ACTION_ENUM = "waypoints:action";
const ACTIONS = ["list", "menu", "tp", "public", "private", "rename", "remove", "settings"];
/** Actions that only operators may use. */
const OPERATOR_ACTIONS = new Set(["tp", "public", "private", "rename", "remove", "settings"]);

/** @param {import("@minecraft/server").StartupEvent} event */
export function registerCommands(event) {
	const registry = event.customCommandRegistry;
	registry.registerEnum(ACTION_ENUM, ACTIONS);
	for (const name of ["waypoints:waypoints", "waypoints:wp"]) {
		registry.registerCommand({
			name,
			description: "WayPoints: list, menu, tp, public, private, rename, remove, settings",
			permissionLevel: CommandPermissionLevel.Any,
			cheatsRequired: false,
			mandatoryParameters: [{ name: ACTION_ENUM, type: CustomCommandParamType.Enum }],
			optionalParameters: [
				{ name: "name", type: CustomCommandParamType.String },
				{ name: "newName", type: CustomCommandParamType.String },
			],
		}, run);
	}
}

/**
 * Commands run in read-only mode; everything that changes the world happens a tick later.
 *
 * @param {CustomCommandOrigin} origin
 * @param {string} action
 * @param {string} [name]
 * @param {string} [newName]
 * @returns {CustomCommandResult}
 */
function run(origin, action, name, newName) {
	const source = origin.sourceEntity ?? origin.initiator;
	const player = source instanceof Player ? source : undefined;

	if (player && OPERATOR_ACTIONS.has(action) && !isOperator(player)) {
		return failure(player, t("no_permission"), "Operators only.");
	}
	if (player && action === "menu" && !mayUseMenuCommand(player)) {
		return failure(player, t("no_permission"), "Operators only.");
	}
	if (!player && (action === "menu" || action === "tp" || action === "settings")) {
		return { status: CustomCommandStatus.Failure, message: "This command can only be used by players." };
	}

	if (action === "list") {
		return list(player);
	}
	if (action === "menu" && player) {
		system.run(() => menu.open(player, undefined));
		return { status: CustomCommandStatus.Success };
	}
	if (action === "settings" && player) {
		system.run(() => openSettings(player));
		return { status: CustomCommandStatus.Success };
	}

	const waypoint = name ? getStore().findByName(name.trim()) : undefined;
	if (!waypoint) {
		return failure(player, t("unknown_waypoint", name ?? ""), `Unknown waypoint "${name ?? ""}".`);
	}

	switch (action) {
		case "tp":
			if (player) {
				system.run(() => manager.teleport(player, waypoint, true));
			}
			break;
		case "public":
		case "private":
			system.run(() => {
				const visibility = action === "public" ? GLOBAL : ACTIVATION;
				manager.setVisibility(waypoint, visibility);
				reply(player, raw(GREEN, t(visibility === GLOBAL ? "visibility_global" : "visibility_activation", waypoint.name)));
			});
			break;
		case "rename": {
			const sanitized = sanitizeName(newName ?? "");
			if (sanitized === "") {
				return failure(player, t("rename_invalid"), "The name must not be empty.");
			}
			system.run(() => {
				manager.rename(waypoint, sanitized);
				reply(player, raw(GREEN, t("renamed", sanitized)));
			});
			break;
		}
		case "remove":
			system.run(() => {
				manager.remove(waypoint);
				reply(player, raw(GREEN, t("removed", waypoint.name)));
			});
			break;
	}
	return { status: CustomCommandStatus.Success, message: player ? undefined : `${action}: ${waypoint.name}` };
}

/**
 * Operators (and the server console) see all waypoints, players the ones they know.
 *
 * @param {Player | undefined} player
 * @returns {CustomCommandResult}
 */
function list(player) {
	const store = getStore();
	const waypoints = !player || isOperator(player)
		? store.getAll().sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
		: store.getKnown(player.id);
	/** @param {Waypoint} it */
	const position = it => `${it.dimension.replace(/^minecraft:/, "")} ${it.x} ${it.y} ${it.z}`;
	if (!player) {
		const lines = waypoints.map(it => ` - ${it.name} (${isGlobal(it) ? "global" : "activation"}) ${position(it)}`);
		return { status: CustomCommandStatus.Success, message: [`Waypoints (${waypoints.length})`, ...lines].join("\n") };
	}
	system.run(() => {
		player.sendMessage(raw(GOLD, t("menu_title"), ` (${waypoints.length})`));
		for (const it of waypoints) {
			player.sendMessage(raw(GRAY, " - ", isGlobal(it) ? "§6" : "§b", it.name, `§8  ${position(it)}`));
		}
	});
	return { status: CustomCommandStatus.Success };
}

/**
 * @param {Player | undefined} player
 * @param {import("@minecraft/server").RawMessage} message
 */
function reply(player, message) {
	if (player?.isValid) {
		player.sendMessage(message);
	}
}

/**
 * @param {Player | undefined} player
 * @param {import("@minecraft/server").RawMessage} message for players, in their language
 * @param {string} consoleMessage for the server console
 * @returns {CustomCommandResult}
 */
function failure(player, message, consoleMessage) {
	if (player) {
		system.run(() => reply(player, raw(RED, message)));
		return { status: CustomCommandStatus.Failure };
	}
	return { status: CustomCommandStatus.Failure, message: consoleMessage };
}
