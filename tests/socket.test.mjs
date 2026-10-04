// The preload round trip: GM asks, each player loads and answers, GM sees who confirmed.
import { test } from "node:test";
import assert from "node:assert/strict";

const emitted = [];
let onAck = null;
const users = Object.assign(
  [
    { id: "gm", name: "GM", active: true, isGM: true },
    { id: "u1", name: "Alice", active: true, isGM: false },
    { id: "u2", name: "Offline", active: false, isGM: false }
  ],
  { get(id) { return this.find(u => u.id === id); } }
);
globalThis.foundry = { utils: { randomID: () => `r${emitted.length}` } };
globalThis.game = {
  user: { id: "gm" },
  users,
  socket: { emit: (event, msg) => { emitted.push({ event, msg }); onAck?.(msg); }, on() {} }
};

const { broadcastPreload, onMessage } = await import("../scripts/socket.mjs");

test("GM broadcast resolves when every connected player has answered", async () => {
  onAck = msg => {
    if (msg.op === "preload") setTimeout(() => onMessage({ op: "preload-ack", id: msg.id, to: "gm", user: "u1", images: 0, sounds: 0, failed: [] }), 5);
  };
  const result = await broadcastPreload({ images: [], sounds: [] });
  assert.deepEqual(result.recipients.map(r => r.name), ["Alice"], "offline users are not waited for");
  assert.deepEqual(result.ok, ["Alice"]);
  assert.deepEqual(result.missing, []);
  assert.equal(emitted[0].event, "module.planar-theater");
  assert.equal(emitted[0].msg.op, "preload");
});

test("with nobody else connected it finishes at once", async () => {
  onAck = null;
  const only = users.splice(1);
  try {
    const result = await broadcastPreload({ images: [], sounds: [] });
    assert.deepEqual(result.recipients, []);
  } finally { users.push(...only); }
});

test("a player loads and replies when a GM asks, and ignores a non-GM", async () => {
  onAck = null;
  emitted.length = 0;
  globalThis.game.user = { id: "u1" };
  await onMessage({ op: "preload", id: "x", from: "u1", images: [], sounds: [] }); // sender is not a GM
  assert.equal(emitted.length, 0);
  await onMessage({ op: "preload", id: "x", from: "gm", images: [], sounds: [] });
  assert.equal(emitted.length, 1);
  assert.deepEqual(
    { op: emitted[0].msg.op, to: emitted[0].msg.to, user: emitted[0].msg.user },
    { op: "preload-ack", to: "gm", user: "u1" }
  );
});

test("ignores junk and acks for requests it never made", async () => {
  emitted.length = 0;
  await onMessage(null);
  await onMessage("text");
  await onMessage({ op: "preload-ack", id: "nope", to: "u1", user: "z" });
  assert.equal(emitted.length, 0);
});
