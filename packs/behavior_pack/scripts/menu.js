// @ts-check
import { Player, system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, ModalFormData } from "@minecraft/server-ui";
import { MAX_NAME_LENGTH, sanitizeName } from "./lib/names.js";
import { ACTIVATION, GLOBAL, isGlobal } from "./lib/store.js";
import { GRAY, GREEN, RED, dimensionName, raw, t } from "./lang.js";
import * as manager from "./manager.js";
import { getConfig, getStore } from "./state.js";

/**
 * @typedef {import("./lib/store.js").Waypoint} Waypoint
 * @typedef {import("@minecraft/server").RawMessage} RawMessage
 */

/** Menus opened at a waypoint only work while the player is still standing there. */
const MAX_DISTANCE_TO_WAYPOINT = 8;

/**
 * Shows a form. While the player has the chat or another screen open (e.g. right after typing
 * "/waypoints menu") the game refuses forms, so it is tried again for a few seconds.
 *
 * @template {{canceled: boolean, cancelationReason?: FormCancelationReason}} R
 * @param {Player} player
 * @param {{show(player: Player): Promise<R>}} form
 * @returns {Promise<R | undefined>}
 */
export async function show(player, form) {
	for (let i = 0; i < 20 && player.isValid; i++) {
		const response = await form.show(player);
		if (response.cancelationReason !== FormCancelationReason.UserBusy) {
			return response;
		}
		await system.waitTicks(10);
	}
	return undefined;
}

/**
 * @param {Player} player
 * @param {Waypoint | undefined} origin
 */
function isStillAt(player, origin) {
	if (!origin) {
		return true;
	}
	const center = manager.center(origin);
	const { x, y, z } = player.location;
	return getStore().get(origin.id) === origin && !manager.isInOtherDimension(player, origin)
		&& (x - center.x) ** 2 + (y - center.y) ** 2 + (z - center.z) ** 2 <= MAX_DISTANCE_TO_WAYPOINT ** 2;
}

/**
 * The waypoint menu: one button per known waypoint, then the management buttons for the
 * waypoint the player is standing at (only for owners and operators).
 *
 * @param {Player} player
 * @param {Waypoint | undefined} origin the waypoint the menu was opened at, or undefined if opened via command
 */
export async function open(player, origin) {
	const store = getStore();
	const config = getConfig();
	const targets = store.getKnown(player.id).filter(it => it.id !== origin?.id);

	/** @type {(string | RawMessage)[]} */
	const body = [];
	if (origin) {
		body.push(GRAY, t("menu_you_are_at", origin.name), "\n");
	}
	body.push(GRAY, t("menu_levels", player.level));
	if (targets.length === 0) {
		body.push("\n\n§r", t("menu_empty"));
	}

	const form = new ActionFormData().title(t("menu_title")).body(raw(...body));
	/** @type {(() => Promise<void> | void)[]} */
	const actions = [];

	for (const target of targets) {
		const crossDimension = manager.isInOtherDimension(player, target);
		const reachable = !crossDimension || config.allowCrossDimension;
		// First line: the name. Second line: dimension, cost or why it can't be reached.
		/** @type {(string | RawMessage)[]} */
		const label = [reachable ? (isGlobal(target) ? "§6" : "§1") : "§8", target.name, "§r\n"];
		/** @type {(string | RawMessage)[]} */
		const details = [];
		if (crossDimension) {
			details.push("§5", dimensionName(target.dimension));
		}
		if (!reachable) {
			details.push(details.length ? " §8· " : "", "§4", t("menu_cross_dimension_disabled"));
		} else {
			const cost = manager.getXpCost(player, target);
			details.push(details.length ? " §8· " : "", cost > player.level ? "§4" : "§8",
				cost > 0 ? t("menu_cost_short", cost) : t("menu_free"));
		}
		form.button(raw(...label, ...details));
		actions.push(() => {
			if (!reachable) {
				player.sendMessage(raw(RED, t("cross_dimension_disabled")));
			} else if (store.getKnown(player.id).some(it => it.id === target.id)) {
				return manager.teleport(player, target, false).then(() => undefined);
			}
		});
	}

	// Management buttons always come last.
	if (origin && manager.canChangeVisibility(player, origin)) {
		const global = isGlobal(origin);
		form.button(raw(global ? "§6" : "§1", t(global ? "menu_visibility_global" : "menu_visibility_activation"),
			"§r\n§8", t(global ? "menu_visibility_hint_global" : "menu_visibility_hint_activation")));
		// The target state is fixed when the menu is built, so a repeated click changes nothing.
		const visibility = global ? ACTIVATION : GLOBAL;
		actions.push(() => {
			if (!manager.canChangeVisibility(player, origin)) {
				return;
			}
			if (origin.visibility !== visibility) {
				manager.setVisibility(origin, visibility);
				player.sendMessage(raw(GREEN, t(visibility === GLOBAL ? "visibility_global" : "visibility_activation", origin.name)));
			}
			// Show the menu again so the new state is visible right away.
			return open(player, origin);
		});
	}
	if (origin && manager.canManage(player, origin)) {
		form.button(raw("§2", t("menu_rename")));
		actions.push(() => openRename(player, origin));
	}

	if (actions.length === 0) {
		form.button(t("menu_close"));
		actions.push(() => undefined);
	}

	const response = await show(player, form);
	if (!response || response.canceled || response.selection === undefined || !player.isValid) {
		return;
	}
	if (!isStillAt(player, origin)) {
		player.sendMessage(raw(RED, t("menu_expired")));
		return;
	}
	await actions[response.selection]?.();
}

/**
 * The rename form for the waypoint the player stands at.
 *
 * @param {Player} player
 * @param {Waypoint} waypoint
 */
async function openRename(player, waypoint) {
	const form = new ModalFormData()
		.title(t("rename_title"))
		.textField(t("rename_label", MAX_NAME_LENGTH), waypoint.name, { defaultValue: waypoint.name })
		.submitButton(t("rename_save"));
	const response = await show(player, form);
	if (!response || response.canceled || !response.formValues || !player.isValid) {
		return;
	}
	if (!isStillAt(player, waypoint) || !manager.canManage(player, waypoint)) {
		player.sendMessage(raw(RED, t("menu_expired")));
		return;
	}
	const name = sanitizeName(String(response.formValues[0] ?? ""));
	if (name === "") {
		player.sendMessage(raw(RED, t("rename_invalid")));
		return;
	}
	if (name !== waypoint.name) {
		manager.rename(waypoint, name);
		player.sendMessage(raw(GREEN, t("renamed", name)));
	}
}
