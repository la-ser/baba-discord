const { randomInt } = require('node:crypto');
// Membership survives a short network outage; explicit Leave removes it immediately.
module.exports = function createParties(io, { graceMs = 45000, onEmpty = () => {} } = {}) {
  const parties = new Map();
  const snapshot = party => ({ code: party.code, public: party.public, started: party.started, hostId: party.hostId,
    members: [...party.members.values()].map(m => ({ id: m.socket.id, name: m.player.name, connected: m.connected })) });
  const publish = party => { for (const m of party.members.values()) if (m.connected) m.socket.emit('party_state', snapshot(party)); };
  const remove = (party, id) => {
    const member = party.members.get(id); clearTimeout(member?.timer); party.members.delete(id);
    if (!party.members.size) { parties.delete(party.code); queueMicrotask(() => onEmpty(`party:${party.code}:horde`)); }
    else { if (party.hostId === id) party.hostId = [...party.members.values()].find(m => m.connected)?.socket.id || party.members.keys().next().value; publish(party); }
  };
  function attach(socket, player, move) {
    let current = null;
    const identity = player.discordId || socket.id;
    const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };
    const leave = () => { if (current) { const party = current; current = null; remove(party, socket.id); socket.emit('party_state', null); } };
    const join = party => {
      leave(); current = party;
      party.members.set(socket.id, { socket, player, identity, connected: true });
      player.active = false; move('horde', `party:${party.code}:horde`); publish(party);
    };
    // A reconnect must restore the existing squad instead of creating a second slot.
    for (const party of parties.values()) {
      const previous = [...party.members.values()].find(m => m.identity === identity && !m.connected);
      if (!previous) continue;
      clearTimeout(previous.timer); party.members.delete(previous.socket.id);
      if (party.hostId === previous.socket.id) party.hostId = socket.id;
      current = party; party.members.set(socket.id, { socket, player, identity, connected: true });
      move('horde', `party:${party.code}:horde`);
      // Preserve progression; socket state and movement inputs always belong to the new connection.
      for (const key of ['xp','level','hasDash','hasDodge','zoomLevel','fireRateMult','bonusDamageMult','bonusHealth','damageMult','speedMult','character','pendingPlacements'])
        if (previous.player[key] !== undefined) player[key] = structuredClone(previous.player[key]);
      publish(party); socket.emit('party_restored', { started: party.started });
      break;
    }
    if (!current) socket.emit('party_state', null);
    socket.on('party_create', (_, ack) => {
      if (current) return reply(ack, { error: 'Leave your current party first.' });
      let code; do { code = randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, '0'); } while (parties.has(code));
      const party = { code, public: false, started: false, hostId: socket.id, members: new Map() };
      parties.set(code, party); join(party); reply(ack, { ok: true });
    });
    socket.on('party_join', (code, ack) => {
      const party = typeof code === 'string' && parties.get(code.trim().toUpperCase());
      if (party === current) return reply(ack, { ok: true });
      if (!party || party.started) return reply(ack, { error: 'Lobby unavailable. Check the code or refresh the list.' });
      if (party.members.size >= 8) return reply(ack, { error: 'This lobby is full (8/8).' });
      if ([...party.members.values()].some(m => m.identity === identity)) return reply(ack, { error: 'This player is already in the lobby in another window.' });
      join(party); reply(ack, { ok: true });
    });
    socket.on('party_list', (_, ack) => reply(ack, [...parties.values()].filter(p => p.public && !p.started && p.members.size < 8).map(snapshot)));
    socket.on('party_visibility', value => { if (current?.hostId === socket.id && !current.started) { current.public = value === true; publish(current); } });
    socket.on('party_start', (_, ack) => {
      if (!current || current.hostId !== socket.id) return reply(ack, { error: 'Only the host can start the mission.' });
      if (current.started) return reply(ack, { ok: true });
      current.started = true; publish(current);
      for (const m of current.members.values()) if (m.connected) m.socket.emit('party_started');
      reply(ack, { ok: true });
    });
    socket.on('party_leave', () => { leave(); player.active = false; move('ffa'); });
    socket.on('disconnect', reason => {
      if (!current) return;
      const party = current, member = party.members.get(socket.id);
      if (!member) return;
      if (reason === 'client namespace disconnect' || reason === 'server namespace disconnect') { leave(); return; }
      member.connected = false;
      member.timer = setTimeout(() => remove(party, socket.id), graceMs); member.timer.unref?.();
      // Give a connected player host controls immediately, while reserving the dropped player's seat.
      if (party.hostId === socket.id) party.hostId = [...party.members.values()].find(m => m.connected)?.socket.id || socket.id;
      publish(party);
    });
    return { leave, room: () => current ? `party:${current.code}:horde` : null, canActivate: () => !current || current.started };
  }
  attach.hasRoom = room => [...parties.values()].some(p => `party:${p.code}:horde` === room);
  return attach;
};
