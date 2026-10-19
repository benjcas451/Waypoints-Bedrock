// @ts-check

/**
 * All waypoints of the world plus the set of waypoints each player has activated.
 * <p>
 * Everything is kept in world dynamic properties: one property per waypoint and one per player
 * with the ids of the waypoints they activated. Keeping them apart avoids the size limit of a
 * single property, and activations of offline players can still be changed.
 * <p>
 * This module does not import @minecraft/server, so it can be tested with plain Node.
 */

export const WAYPOINT_PREFIX = "waypoints:wp:";
export const KNOWN_PREFIX = "waypoints:known:";

/** Only players who activated the waypoint by clicking it can travel there. */
export const ACTIVATION = "activation";
/** Every player can travel there without activating it first. */
export const GLOBAL = "global";

/**
 * @typedef {"activation" | "global"} Visibility
 *
 * @typedef {object} Waypoint
 * @property {string} id
 * @property {string} name
 * @property {string} dimension e.g. "minecraft:overworld"
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} [owner] the player id; waypoints without owner may be managed by everyone
 * @property {string} [ownerName] the name of the owner when the waypoint was created
 * @property {Visibility} visibility
 *
 * @typedef {object} Backend where the store keeps its data, the world's dynamic properties in game
 * @property {() => string[]} ids
 * @property {(id: string) => unknown} get
 * @property {(id: string, value: string | undefined) => void} set
 */

/**
 * A random UUID. The script engine has no crypto API; the ids only have to be unique in one world.
 *
 * @param {() => number} [random]
 */
export function randomId(random = Math.random) {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
		const r = Math.floor(random() * 16);
		return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
	});
}

/** @param {Waypoint} waypoint */
export function isGlobal(waypoint) {
	return waypoint.visibility === GLOBAL;
}

/**
 * @param {Waypoint} waypoint
 * @param {string} player
 */
export function isOwner(waypoint, player) {
	return waypoint.owner === undefined || waypoint.owner === player;
}

/**
 * @param {string} dimension
 * @param {number} x
 * @param {number} y
 * @param {number} z
 */
function positionKey(dimension, x, y, z) {
	return `${dimension}|${x}|${y}|${z}`;
}

/**
 * Reads one stored waypoint. Broken entries are skipped instead of breaking the whole store.
 *
 * @param {string} id
 * @param {unknown} value
 * @returns {Waypoint | undefined}
 */
export function parseWaypoint(id, value) {
	if (typeof value !== "string") {
		return undefined;
	}
	let data;
	try {
		data = JSON.parse(value);
	} catch {
		return undefined;
	}
	if (typeof data !== "object" || data === null || typeof data.name !== "string" || typeof data.dimension !== "string"
		|| ![data.x, data.y, data.z].every(Number.isInteger)) {
		return undefined;
	}
	/** @type {Waypoint} */
	const waypoint = {
		id,
		name: data.name,
		dimension: data.dimension,
		x: data.x,
		y: data.y,
		z: data.z,
		visibility: data.visibility === GLOBAL ? GLOBAL : ACTIVATION,
	};
	if (typeof data.owner === "string") {
		waypoint.owner = data.owner;
	}
	if (typeof data.ownerName === "string") {
		waypoint.ownerName = data.ownerName;
	}
	return waypoint;
}

/** @param {Waypoint} waypoint */
function serializeWaypoint(waypoint) {
	const { id, ...data } = waypoint;
	return JSON.stringify(data);
}

export class WaypointStore {
	/** @param {Backend} backend */
	constructor(backend) {
		this.backend = backend;
		/** @type {Map<string, Waypoint>} */
		this.waypoints = new Map();
		/** @type {Map<string, Waypoint>} */
		this.byPosition = new Map();
		/** @type {Map<string, Set<string>>} loaded on first use */
		this.activations = new Map();

		for (const key of backend.ids()) {
			if (!key.startsWith(WAYPOINT_PREFIX)) {
				continue;
			}
			const waypoint = parseWaypoint(key.substring(WAYPOINT_PREFIX.length), backend.get(key));
			if (waypoint) {
				this.waypoints.set(waypoint.id, waypoint);
				this.byPosition.set(positionKey(waypoint.dimension, waypoint.x, waypoint.y, waypoint.z), waypoint);
			}
		}
	}

	/** @returns {Waypoint[]} */
	getAll() {
		return [...this.waypoints.values()];
	}

	/** @param {string} id */
	get(id) {
		return this.waypoints.get(id);
	}

	/**
	 * @param {string} dimension
	 * @param {{x: number, y: number, z: number}} pos
	 */
	getAt(dimension, pos) {
		return this.byPosition.get(positionKey(dimension, pos.x, pos.y, pos.z));
	}

	/**
	 * Exact name first, then ignoring case.
	 *
	 * @param {string} name
	 */
	findByName(name) {
		const all = this.getAll();
		const lower = name.toLowerCase();
		return all.find(it => it.name === name) ?? all.find(it => it.name.toLowerCase() === lower);
	}

	/** @param {string} player */
	countOwnedBy(player) {
		return this.getAll().filter(it => it.owner === player).length;
	}

	/** @param {Waypoint} waypoint */
	add(waypoint) {
		this.waypoints.set(waypoint.id, waypoint);
		this.byPosition.set(positionKey(waypoint.dimension, waypoint.x, waypoint.y, waypoint.z), waypoint);
		this.save(waypoint);
	}

	/** @param {Waypoint} waypoint */
	remove(waypoint) {
		this.waypoints.delete(waypoint.id);
		const key = positionKey(waypoint.dimension, waypoint.x, waypoint.y, waypoint.z);
		if (this.byPosition.get(key)?.id === waypoint.id) {
			this.byPosition.delete(key);
		}
		this.backend.set(WAYPOINT_PREFIX + waypoint.id, undefined);
		for (const property of this.backend.ids()) {
			if (property.startsWith(KNOWN_PREFIX)) {
				const player = property.substring(KNOWN_PREFIX.length);
				const known = this.getActivated(player);
				if (known.delete(waypoint.id)) {
					this.saveActivations(player);
				}
			}
		}
	}

	/**
	 * @param {Waypoint} waypoint
	 * @param {{x: number, y: number, z: number}} pos
	 */
	move(waypoint, pos) {
		this.byPosition.delete(positionKey(waypoint.dimension, waypoint.x, waypoint.y, waypoint.z));
		waypoint.x = pos.x;
		waypoint.y = pos.y;
		waypoint.z = pos.z;
		this.byPosition.set(positionKey(waypoint.dimension, waypoint.x, waypoint.y, waypoint.z), waypoint);
		this.save(waypoint);
	}

	/**
	 * @param {Waypoint} waypoint
	 * @param {string} name
	 */
	rename(waypoint, name) {
		waypoint.name = name;
		this.save(waypoint);
	}

	/**
	 * @param {Waypoint} waypoint
	 * @param {Visibility} visibility
	 */
	setVisibility(waypoint, visibility) {
		waypoint.visibility = visibility;
		this.save(waypoint);
	}

	/**
	 * @param {string} player
	 * @param {Waypoint} waypoint
	 */
	isActivated(player, waypoint) {
		return this.getActivated(player).has(waypoint.id);
	}

	/**
	 * @param {string} player
	 * @param {Waypoint} waypoint
	 * @returns {boolean} true if the waypoint was not activated before
	 */
	activate(player, waypoint) {
		const known = this.getActivated(player);
		if (known.has(waypoint.id)) {
			return false;
		}
		known.add(waypoint.id);
		this.saveActivations(player);
		return true;
	}

	/**
	 * All waypoints the given player may travel to: activated ones plus global ones, sorted by name.
	 *
	 * @param {string} player
	 * @returns {Waypoint[]}
	 */
	getKnown(player) {
		const activated = this.getActivated(player);
		return this.getAll()
			.filter(it => isGlobal(it) || activated.has(it.id))
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
	}

	/** @param {string} player */
	getActivated(player) {
		let known = this.activations.get(player);
		if (!known) {
			known = new Set();
			const value = this.backend.get(KNOWN_PREFIX + player);
			if (typeof value === "string") {
				try {
					const ids = JSON.parse(value);
					if (Array.isArray(ids)) {
						// Waypoints removed in the meantime are dropped.
						ids.filter(id => typeof id === "string" && this.waypoints.has(id)).forEach(id => known?.add(id));
					}
				} catch {
					// A broken entry counts as "nothing activated".
				}
			}
			this.activations.set(player, known);
		}
		return known;
	}

	/** @param {Waypoint} waypoint */
	save(waypoint) {
		this.backend.set(WAYPOINT_PREFIX + waypoint.id, serializeWaypoint(waypoint));
	}

	/** @param {string} player */
	saveActivations(player) {
		const known = this.getActivated(player);
		this.backend.set(KNOWN_PREFIX + player, known.size === 0 ? undefined : JSON.stringify([...known]));
	}
}
