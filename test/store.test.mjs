import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTIVATION, GLOBAL, KNOWN_PREFIX, WAYPOINT_PREFIX, WaypointStore, isOwner, parseWaypoint, randomId } from "../packs/behavior_pack/scripts/lib/store.js";

/** The world's dynamic properties, in memory. */
function memoryBackend(initial = {}) {
	const values = new Map(Object.entries(initial));
	return {
		values,
		ids: () => [...values.keys()],
		get: id => values.get(id),
		set: (id, value) => (value === undefined ? values.delete(id) : values.set(id, value)),
	};
}

function waypoint(id, name, extra = {}) {
	return { id, name, dimension: "minecraft:overworld", x: 1, y: 64, z: id.length, visibility: ACTIVATION, owner: "p1", ...extra };
}

test("waypoints survive a reload", () => {
	const backend = memoryBackend();
	const store = new WaypointStore(backend);
	store.add(waypoint("a", "Home", { ownerName: "Steve" }));
	store.add(waypoint("bb", "Mine", { visibility: GLOBAL, dimension: "minecraft:nether" }));
	store.activate("p2", store.get("a"));

	const reloaded = new WaypointStore(backend);
	assert.deepEqual(reloaded.get("a"), waypoint("a", "Home", { ownerName: "Steve" }));
	assert.equal(reloaded.get("bb").visibility, GLOBAL);
	assert.equal(reloaded.getAt("minecraft:nether", { x: 1, y: 64, z: 2 }).name, "Mine");
	assert.equal(reloaded.getAt("minecraft:overworld", { x: 1, y: 64, z: 2 }), undefined);
	assert.ok(reloaded.isActivated("p2", reloaded.get("a")));
});

test("known waypoints are activated plus global ones, sorted by name", () => {
	const store = new WaypointStore(memoryBackend());
	store.add(waypoint("a", "zoo"));
	store.add(waypoint("bb", "Beach", { visibility: GLOBAL }));
	store.add(waypoint("ccc", "attic"));
	assert.equal(store.activate("p2", store.get("a")), true);
	assert.equal(store.activate("p2", store.get("a")), false);
	assert.deepEqual(store.getKnown("p2").map(it => it.name), ["Beach", "zoo"]);
	assert.deepEqual(store.getKnown("p3").map(it => it.name), ["Beach"]);
});

test("removing a waypoint drops it from every player's activations", () => {
	const backend = memoryBackend();
	const store = new WaypointStore(backend);
	store.add(waypoint("a", "Home"));
	store.add(waypoint("bb", "Mine"));
	store.activate("p2", store.get("a"));
	store.activate("p2", store.get("bb"));
	store.activate("p3", store.get("a"));

	store.remove(store.get("a"));
	assert.equal(backend.values.has(WAYPOINT_PREFIX + "a"), false);
	assert.deepEqual(JSON.parse(backend.values.get(KNOWN_PREFIX + "p2")), ["bb"]);
	assert.equal(backend.values.has(KNOWN_PREFIX + "p3"), false);
	assert.equal(store.getAt("minecraft:overworld", { x: 1, y: 64, z: 1 }), undefined);
});

test("rename, visibility and move are saved", () => {
	const backend = memoryBackend();
	const store = new WaypointStore(backend);
	store.add(waypoint("a", "Home"));
	store.rename(store.get("a"), "House");
	store.setVisibility(store.get("a"), GLOBAL);
	store.move(store.get("a"), { x: 5, y: 70, z: -3 });

	const reloaded = new WaypointStore(backend);
	assert.equal(reloaded.get("a").name, "House");
	assert.equal(reloaded.get("a").visibility, GLOBAL);
	assert.equal(reloaded.getAt("minecraft:overworld", { x: 5, y: 70, z: -3 }).id, "a");
	assert.equal(reloaded.getAt("minecraft:overworld", { x: 1, y: 64, z: 1 }), undefined);
});

test("broken entries are skipped", () => {
	const store = new WaypointStore(memoryBackend({
		[WAYPOINT_PREFIX + "ok"]: JSON.stringify({ name: "Ok", dimension: "minecraft:overworld", x: 0, y: 1, z: 2 }),
		[WAYPOINT_PREFIX + "json"]: "{not json",
		[WAYPOINT_PREFIX + "pos"]: JSON.stringify({ name: "Pos", dimension: "minecraft:overworld", x: 0.5, y: 1, z: 2 }),
		[KNOWN_PREFIX + "p1"]: "[\"ok\", \"missing\", 3]",
		[KNOWN_PREFIX + "p2"]: "broken",
		"other:addon": 5,
	}));
	assert.deepEqual(store.getAll().map(it => it.name), ["Ok"]);
	assert.equal(store.get("ok").visibility, ACTIVATION);
	assert.deepEqual([...store.getActivated("p1")], ["ok"]);
	assert.deepEqual([...store.getActivated("p2")], []);
	assert.equal(parseWaypoint("x", 5), undefined);
});

test("find by name prefers the exact spelling", () => {
	const store = new WaypointStore(memoryBackend());
	store.add(waypoint("a", "home"));
	store.add(waypoint("bb", "Home"));
	assert.equal(store.findByName("Home").id, "bb");
	assert.equal(store.findByName("HOME").id, "a");
	assert.equal(store.findByName("Nope"), undefined);
});

test("owners and waypoints without owner", () => {
	assert.ok(isOwner(waypoint("a", "Home"), "p1"));
	assert.ok(!isOwner(waypoint("a", "Home"), "p2"));
	assert.ok(isOwner({ ...waypoint("a", "Home"), owner: undefined }, "p2"));
	const store = new WaypointStore(memoryBackend());
	store.add(waypoint("a", "Home"));
	store.add(waypoint("bb", "Mine"));
	store.add(waypoint("ccc", "Other", { owner: "p2" }));
	assert.equal(store.countOwnedBy("p1"), 2);
});

test("random ids look like UUIDs and differ", () => {
	const ids = new Set(Array.from({ length: 100 }, () => randomId()));
	assert.equal(ids.size, 100);
	for (const id of ids) {
		assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
	}
});
