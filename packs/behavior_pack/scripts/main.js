// @ts-check
import { Block, EquipmentSlot, GameMode, ItemStack, Player, system, world } from "@minecraft/server";
import { sanitizeName } from "./lib/names.js";
import { GRAY, GREEN, RED, YELLOW, raw, t } from "./lang.js";
import { registerCommands } from "./commands.js";
import * as manager from "./manager.js";
import * as menu from "./menu.js";
import { getConfig, getStore, isOperator } from "./state.js";

/**
 * @typedef {import("./lib/store.js").Waypoint} Waypoint
 */

system.beforeEvents.startup.subscribe(registerCommands);

// Loads store and config early: the before events below may only read, not load.
world.afterEvents.worldLoad.subscribe(() => {
	getConfig();
	const count = getStore().getAll().length;
	console.log(`[WayPoints] Loaded ${count} waypoints`);
});

// ---- Using the waypoint block -------------------------------------------------------------

/**
 * What a click on a block means, decided in the read-only before event:
 * "pass" leaves it to the game, "hint" too but shows how to create a waypoint,
 * "handle" cancels the click and handles it a tick later.
 *
 * @param {Player} player
 * @param {Block} block
 * @param {ItemStack | undefined} item
 * @returns {"pass" | "hint" | "handle"}
 */
function classify(player, block, item) {
	if (!manager.isWaypointBlock(block) || player.getGameMode() === GameMode.Spectator) {
		return "pass";
	}
	// Keep the vanilla behaviour: lodestone compasses must still be bindable.
	if (item?.typeId === "minecraft:compass") {
		return "pass";
	}
	if (item?.typeId === "minecraft:name_tag") {
		return "handle";
	}
	const existing = getStore().getAt(block.dimension.id, block);
	if (!existing) {
		if (!getConfig().requireNameTag && !item && player.isSneaking) {
			return "handle";
		}
		return item ? "pass" : "hint";
	}
	// Sneaking with a block lets players build against the waypoint as usual.
	if (player.isSneaking && item) {
		return "pass";
	}
	return "handle";
}

world.beforeEvents.playerInteractWithBlock.subscribe(event => {
	const { player, block, itemStack } = event;
	const result = classify(player, block, itemStack);
	if (result === "pass") {
		return;
	}
	if (result === "handle") {
		// Also the repeated events while the button is held, or a held block would be placed.
		event.cancel = true;
	}
	if (!event.isFirstEvent) {
		return;
	}
	system.run(() => {
		if (!player.isValid || !block.isValid) {
			return;
		}
		if (result === "hint") {
			player.onScreenDisplay.setActionBar(raw(GRAY, t("hint_create")));
		} else {
			onUseBlock(player, block);
		}
	});
});

/**
 * @param {Player} player
 * @param {Block} block
 */
function onUseBlock(player, block) {
	if (!manager.isWaypointBlock(block)) {
		return;
	}
	const slot = player.getComponent("minecraft:equippable")?.getEquipmentSlot(EquipmentSlot.Mainhand);
	const held = slot?.getItem();
	const store = getStore();
	const existing = store.getAt(block.dimension.id, block);

	if (held?.typeId === "minecraft:name_tag") {
		useNameTag(player, block, held, existing, slot);
		return;
	}
	if (!existing) {
		if (!getConfig().requireNameTag && !held && player.isSneaking) {
			tryCreate(player, block, `${block.x} ${block.y} ${block.z}`, undefined);
		}
		return;
	}

	if (store.activate(player.id, existing)) {
		player.sendMessage(raw(GREEN, t("activated", existing.name)));
		manager.playSound(block.dimension, "random.levelup", block.center());
	}
	// The label may have been killed (e.g. "/kill @e"); this puts it back.
	manager.updateLabel(existing);
	menu.open(player, existing);
}

/**
 * @param {Player} player
 * @param {Block} block
 * @param {ItemStack} nameTag
 * @param {Waypoint | undefined} existing
 * @param {import("@minecraft/server").ContainerSlot | undefined} slot
 */
function useNameTag(player, block, nameTag, existing, slot) {
	const name = sanitizeName(nameTag.nameTag ?? "");
	if (name === "") {
		player.onScreenDisplay.setActionBar(raw(RED, t("name_tag_unnamed")));
		return;
	}
	if (existing) {
		if (!manager.canManage(player, existing)) {
			player.onScreenDisplay.setActionBar(raw(RED, t("not_owner")));
			return;
		}
		manager.rename(existing, name);
		consumeOne(player, slot);
		player.sendMessage(raw(GREEN, t("renamed", name)));
		return;
	}
	tryCreate(player, block, name, slot);
}

/**
 * @param {Player} player
 * @param {Block} block
 * @param {string} name
 * @param {import("@minecraft/server").ContainerSlot | undefined} nameTagSlot
 */
function tryCreate(player, block, name, nameTagSlot) {
	const config = getConfig();
	const operator = isOperator(player);
	if (config.creationRequiresOp && !operator) {
		player.onScreenDisplay.setActionBar(raw(RED, t("no_permission_create")));
		return;
	}
	if (config.maxWaypointsPerPlayer > 0 && !operator
		&& getStore().countOwnedBy(player.id) >= config.maxWaypointsPerPlayer) {
		player.onScreenDisplay.setActionBar(raw(RED, t("limit_reached", config.maxWaypointsPerPlayer)));
		return;
	}
	manager.create(player, block, name);
	consumeOne(player, nameTagSlot);
	player.sendMessage(raw(GREEN, t("created", name)));
}

/**
 * Like vanilla: creative players keep the item.
 *
 * @param {Player} player
 * @param {import("@minecraft/server").ContainerSlot | undefined} slot
 */
function consumeOne(player, slot) {
	if (!slot || player.getGameMode() === GameMode.Creative || !slot.hasItem()) {
		return;
	}
	if (slot.amount > 1) {
		slot.amount -= 1;
	} else {
		slot.setItem(undefined);
	}
}

// ---- Breaking and explosions --------------------------------------------------------------

world.beforeEvents.playerBreakBlock.subscribe(event => {
	const { player, block } = event;
	if (!manager.isWaypointBlock(block)) {
		return;
	}
	const waypoint = getStore().getAt(block.dimension.id, block);
	if (waypoint && !manager.canManage(player, waypoint)) {
		event.cancel = true;
		system.run(() => player.onScreenDisplay.setActionBar(raw(RED, t("not_owner"))));
	}
});

world.afterEvents.playerBreakBlock.subscribe(event => {
	const { player, block, brokenBlockPermutation } = event;
	if (brokenBlockPermutation.type.id !== getConfig().waypointBlock) {
		return;
	}
	const waypoint = getStore().getAt(block.dimension.id, block);
	if (waypoint) {
		manager.remove(waypoint);
		player.sendMessage(raw(YELLOW, t("removed", waypoint.name)));
	}
});

// Protected waypoints survive explosions; otherwise they are cleaned up on the next teleport.
world.beforeEvents.explosion.subscribe(event => {
	if (!getConfig().protectWaypoints) {
		return;
	}
	const store = getStore();
	const blocks = event.getImpactedBlocks();
	const kept = blocks.filter(block => !(manager.isWaypointBlock(block) && store.getAt(block.dimension.id, block)));
	if (kept.length !== blocks.length) {
		event.setImpactedBlocks(kept);
	}
});

// ---- Labels -------------------------------------------------------------------------------

world.afterEvents.entityLoad.subscribe(({ entity }) => {
	if (entity.isValid && entity.typeId === manager.LABEL_TYPE) {
		manager.checkLabel(entity);
	}
});
