// @ts-check
import { BlockTypes, Player } from "@minecraft/server";
import { ModalFormData } from "@minecraft/server-ui";
import { DEFAULTS, OPTIONS, normalizeConfig } from "./lib/config.js";
import { GREEN, RED, raw, t } from "./lang.js";
import * as manager from "./manager.js";
import { show } from "./menu.js";
import { getConfig, getStore, isOperator, saveConfig } from "./state.js";

/**
 * The settings form for operators ("/waypoints settings"); it replaces the config file of the
 * Paper plugin. The values are stored in the world.
 *
 * @param {Player} player
 */
export async function openSettings(player) {
	const config = getConfig();
	const form = new ModalFormData().title(t("settings_title"));
	for (const option of OPTIONS) {
		const label = t(`config.${option.name}`);
		const value = config[option.name];
		if (option.type === "boolean") {
			form.toggle(label, { defaultValue: Boolean(value) });
		} else if (option.type === "number") {
			form.slider(label, option.min, option.max, { valueStep: option.step, defaultValue: Number(value) });
		} else {
			form.textField(label, String(DEFAULTS[option.name]), { defaultValue: String(value) });
		}
	}
	form.submitButton(t("rename_save"));

	const response = await show(player, form);
	if (!response || response.canceled || !response.formValues || !player.isValid || !isOperator(player)) {
		return;
	}
	/** @type {Record<string, unknown>} */
	const values = {};
	OPTIONS.forEach((option, index) => {
		values[option.name] = response.formValues?.[index];
	});
	const newConfig = normalizeConfig(values);
	if (!BlockTypes.get(newConfig.waypointBlock)) {
		player.sendMessage(raw(RED, t("settings_unknown_block", newConfig.waypointBlock)));
		newConfig.waypointBlock = config.waypointBlock;
	}

	const labelsChanged = newConfig.showLabels !== config.showLabels;
	saveConfig(newConfig);
	if (labelsChanged) {
		// Loaded labels change right away, the others when their chunk is loaded.
		getStore().getAll().forEach(manager.updateLabel);
	}
	player.sendMessage(raw(GREEN, t("settings_saved")));
}
