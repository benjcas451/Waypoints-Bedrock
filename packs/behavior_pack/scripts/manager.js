// @ts-check
import { Block, Dimension, Entity, GameMode, Player, system, world } from "@minecraft/server";
import { xpCost, cooldownRemaining } from "./lib/config.js";
import { ACTIVATION, isGlobal, isOwner, randomId } from "./lib/store.js";
import { GREEN, RED, raw, t } from "./lang.js";
import { getConfig, getStore, isOperator } from "./state.js";

/**
 * @typedef {import("./lib/store.js").Waypoint} Waypoint
 * @typedef {import("@minecraft/server").Vector3} Vector3
 */

/** The invisible entity that shows the name above a waypoint (entities/label.json). */
export const LABEL_TYPE = "waypoints:label";
/** Dynamic property of a label entity: the id of its waypoint. */
export const LABEL_WAYPOINT = "waypoints:waypoint";

/** Last teleport per player id, in milliseconds. */
const lastTeleport = new Map();
/** Players waiting for the target chunk of a teleport to load. */
const teleporting = new Set();

/** @param {Block} block */
export function isWaypointBlock(block) {
	return block.typeId === getConfig().waypointBlock;
}

/**
 * @param {Player} player
 * @param {Waypoint} waypoint
 */
export function canManage(player, waypoint) {
	return !getConfig().protectWaypoints || isOwner(waypoint, player.id) || isOperator(player);
}

/**
 * Owners may switch visibility if the config allows it; operators always can.
 *
 * @param {Player} player
 * @param {Waypoint} waypoint
 */
export function canChangeVisibility(player, waypoint) {
	return isOperator(player) || (getConfig().ownersCanChangeVisibility && canManage(player, waypoint));
}

/**
 * @param {Player} player
 * @param {Waypoint} waypoint
 */
export function isInOtherDimension(player, waypoint) {
	return player.dimension.id !== waypoint.dimension;
}

/** @param {Waypoint} waypoint */
export function center(waypoint) {
	return { x: waypoint.x + 0.5, y: waypoint.y + 0.5, z: waypoint.z + 0.5 };
}

/**
 * @param {Player} player
 * @param {Waypoint} waypoint
 */
export function getXpCost(player, waypoint) {
	return xpCost(getConfig(), {
		creative: player.getGameMode() === GameMode.Creative,
		crossDimension: isInOtherDimension(player, waypoint),
	});
}

/** @param {Player} player */
function ignoresCost(player) {
	return getConfig().creativeIgnoresCost && player.getGameMode() === GameMode.Creative;
}

/**
 * @param {Player} player
 * @param {Block} block
 * @param {string} name
 */
export function create(player, block, name) {
	/** @type {Waypoint} */
	const waypoint = {
		id: randomId(),
		name,
		dimension: block.dimension.id,
		x: block.x,
		y: block.y,
		z: block.z,
		owner: player.id,
		ownerName: player.name,
		visibility: ACTIVATION,
	};
	const store = getStore();
	store.add(waypoint);
	store.activate(player.id, waypoint);
	updateLabel(waypoint);
	playSound(block.dimension, "chime.amethyst_block", block.center());
	return waypoint;
}

/**
 * @param {Waypoint} waypoint
 * @param {string} name
 */
export function rename(waypoint, name) {
	getStore().rename(waypoint, name);
	updateLabel(waypoint);
}

/**
 * @param {Waypoint} waypoint
 * @param {import("./lib/store.js").Visibility} visibility
 */
export function setVisibility(waypoint, visibility) {
	getStore().setVisibility(waypoint, visibility);
	// The label color shows the visibility.
	updateLabel(waypoint);
}

/** @param {Waypoint} waypoint */
export function remove(waypoint) {
	getStore().remove(waypoint);
	// Labels in unloaded chunks remove themselves when they are loaded again (see checkLabel).
	for (const label of findLabels(waypoint)) {
		label.remove();
	}
}

// ---- Labels -------------------------------------------------------------------------------

/** @param {Waypoint} waypoint */
function labelText(waypoint) {
	return (isGlobal(waypoint) ? "§6" : "§b") + waypoint.name;
}

/** @param {Waypoint} waypoint */
function labelLocation(waypoint) {
	return { x: waypoint.x + 0.5, y: waypoint.y + 1.05, z: waypoint.z + 0.5 };
}

/**
 * The labels of a waypoint, as far as their chunk is loaded.
 *
 * @param {Waypoint} waypoint
 * @returns {Entity[]}
 */
function findLabels(waypoint) {
	try {
		return world.getDimension(waypoint.dimension)
			.getEntities({ type: LABEL_TYPE, location: labelLocation(waypoint), maxDistance: 1.5 })
			.filter(it => {
				const id = it.getDynamicProperty(LABEL_WAYPOINT);
				return id === undefined || id === waypoint.id;
			});
	} catch {
		return [];
	}
}

/**
 * Creates, updates or removes the label of a waypoint. Does nothing while its chunk is not loaded;
 * the label is fixed when it is loaded (checkLabel) or the waypoint is used the next time.
 *
 * @param {Waypoint} waypoint
 */
export function updateLabel(waypoint) {
	const labels = findLabels(waypoint);
	if (!getConfig().showLabels) {
		labels.forEach(it => it.remove());
		return;
	}
	const [label, ...duplicates] = labels;
	duplicates.forEach(it => it.remove());
	try {
		const entity = label ?? world.getDimension(waypoint.dimension).spawnEntity(LABEL_TYPE, labelLocation(waypoint));
		entity.setDynamicProperty(LABEL_WAYPOINT, waypoint.id);
		entity.nameTag = labelText(waypoint);
	} catch {
		// Chunk not loaded.
	}
}

/**
 * Called when a label entity is loaded with its chunk: it may belong to a waypoint that was
 * renamed or removed in the meantime.
 *
 * @param {Entity} entity
 */
export function checkLabel(entity) {
	const id = entity.getDynamicProperty(LABEL_WAYPOINT);
	const waypoint = typeof id === "string" ? getStore().get(id) : undefined;
	if (!waypoint || !getConfig().showLabels || entity.dimension.id !== waypoint.dimension) {
		entity.remove();
		return;
	}
	const expected = labelLocation(waypoint);
	const { x, y, z } = entity.location;
	if (Math.abs(x - expected.x) > 1 || Math.abs(y - expected.y) > 1 || Math.abs(z - expected.z) > 1) {
		entity.remove();
		return;
	}
	const text = labelText(waypoint);
	if (entity.nameTag !== text) {
		entity.nameTag = text;
	}
}

// ---- Teleport -----------------------------------------------------------------------------

/** @param {Player} player */
export function getCooldownRemainingSeconds(player) {
	return cooldownRemaining(getConfig(), lastTeleport.get(player.id), Date.now());
}

/**
 * The block of the waypoint, or undefined if its chunk is not loaded.
 *
 * @param {Dimension} dimension
 * @param {Waypoint} waypoint
 */
function getBlock(dimension, waypoint) {
	try {
		const block = dimension.getBlock(waypoint);
		return block?.isValid ? block : undefined;
	} catch {
		return undefined;
	}
}

/**
 * Waits until the chunk of the waypoint is loaded, at most about 10 seconds.
 *
 * @param {Dimension} dimension
 * @param {Waypoint} waypoint
 * @returns {Promise<Block | undefined>}
 */
async function waitForBlock(dimension, waypoint) {
	for (let i = 0; i < 40; i++) {
		await system.waitTicks(5);
		const block = getBlock(dimension, waypoint);
		if (block) {
			return block;
		}
	}
	return undefined;
}

/**
 * Teleports the player to the waypoint, charging the configured cost.
 * <p>
 * If the target is in an unloaded chunk (another dimension, far away), the player is moved there
 * first so the game loads it. If the waypoint block turns out to be gone, the player is brought
 * back and pays nothing.
 *
 * @param {Player} player
 * @param {Waypoint} waypoint
 * @param {boolean} free skip cost, cooldown and dimension checks (used by operator commands)
 * @returns {Promise<boolean>} true if the player was teleported
 */
export async function teleport(player, waypoint, free) {
	const config = getConfig();
	if (teleporting.has(player.id)) {
		return false;
	}
	/** @type {Dimension} */
	let targetDimension;
	try {
		targetDimension = world.getDimension(waypoint.dimension);
	} catch {
		player.sendMessage(raw(RED, t("dimension_missing", waypoint.name)));
		return false;
	}

	const crossDimension = isInOtherDimension(player, waypoint);
	const cost = free ? 0 : getXpCost(player, waypoint);
	const ignoreCooldown = free || ignoresCost(player);
	if (!free) {
		if (crossDimension && !config.allowCrossDimension) {
			player.sendMessage(raw(RED, t("cross_dimension_disabled")));
			return false;
		}
		if (!ignoreCooldown) {
			const remaining = getCooldownRemainingSeconds(player);
			if (remaining > 0) {
				player.sendMessage(raw(RED, t("cooldown", remaining)));
				return false;
			}
		}
		if (player.level < cost) {
			player.sendMessage(raw(RED, t("not_enough_xp", cost)));
			return false;
		}
	}

	const from = { dimension: player.dimension, location: player.location, rotation: player.getRotation() };
	spawnParticles(from.dimension, "minecraft:portal_directional", { x: from.location.x, y: from.location.y + 1, z: from.location.z });
	playSound(from.dimension, "mob.endermen.portal", from.location);

	let block = getBlock(targetDimension, waypoint);
	let moved = false;
	if (!block) {
		teleporting.add(player.id);
		try {
			player.teleport({ x: waypoint.x + 0.5, y: waypoint.y + 1, z: waypoint.z + 0.5 }, { dimension: targetDimension });
			moved = true;
			block = await waitForBlock(targetDimension, waypoint);
		} catch {
			// Teleporting into the target failed, e.g. it is outside the world.
		} finally {
			teleporting.delete(player.id);
		}
		if (!player.isValid) {
			return false;
		}
		if (!block) {
			if (moved) {
				player.teleport(from.location, { dimension: from.dimension, rotation: from.rotation });
			}
			return false;
		}
	}

	// The block may have been destroyed by a piston, a command etc.
	if (!isWaypointBlock(block)) {
		remove(waypoint);
		if (moved) {
			player.teleport(from.location, { dimension: from.dimension, rotation: from.rotation });
		}
		player.sendMessage(raw(RED, t("waypoint_missing", waypoint.name)));
		return false;
	}

	const target = findStandingPosition(block);
	try {
		player.teleport(target, { dimension: targetDimension, facingLocation: block.center() });
	} catch {
		return false;
	}

	if (cost > 0) {
		player.addLevels(-Math.min(cost, player.level));
	}
	if (!ignoreCooldown) {
		lastTeleport.set(player.id, Date.now());
	}
	// The label may have been killed (e.g. "/kill @e"); this puts it back.
	updateLabel(waypoint);
	spawnParticles(targetDimension, "minecraft:portal_reverse_particle", { x: target.x, y: target.y + 1, z: target.z });
	playSound(targetDimension, "mob.endermen.portal", target);
	player.onScreenDisplay.setActionBar(raw(GREEN, t("teleported", waypoint.name)));
	return true;
}

/**
 * Finds a free spot next to (or on top of) the waypoint block where a player can stand.
 *
 * @param {Block} block
 * @returns {Vector3}
 */
function findStandingPosition(block) {
	const sides = [block.north(), block.east(), block.south(), block.west()];
	const candidates = [...sides, ...sides.map(it => it?.below())];
	for (const candidate of candidates) {
		if (candidate && canStandAt(candidate)) {
			return candidate.bottomCenter();
		}
	}
	return block.above()?.bottomCenter() ?? { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };
}

/** @param {Block} feet */
function canStandAt(feet) {
	try {
		const head = feet.above();
		const ground = feet.below();
		return feet.isAir && head !== undefined && head.isAir
			&& ground !== undefined && !ground.isAir && !ground.isLiquid;
	} catch {
		return false;
	}
}

/**
 * @param {Dimension} dimension
 * @param {string} effect
 * @param {Vector3} location
 */
function spawnParticles(dimension, effect, location) {
	try {
		for (let i = 0; i < 8; i++) {
			dimension.spawnParticle(effect, {
				x: location.x + (Math.random() - 0.5) * 0.8,
				y: location.y + (Math.random() - 0.5) * 1.6,
				z: location.z + (Math.random() - 0.5) * 0.8,
			});
		}
	} catch {
		// Effects are optional.
	}
}

/**
 * @param {Dimension} dimension
 * @param {string} sound
 * @param {Vector3} location
 */
export function playSound(dimension, sound, location) {
	try {
		dimension.playSound(sound, location);
	} catch {
		// Effects are optional.
	}
}
