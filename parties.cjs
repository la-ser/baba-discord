const { randomInt } = require('node:crypto');
module.exports = function createParties(io) {
  const parties = new Map();
  const snapshot = party => ({ code: party.code, public: party.public, started: party.started, hostId: party.hostId, members: [...party.members.values()].map(m => ({ id: m.socket.id, name: m.name() })) });
  const publish = party => { for (const m of party.members.values()) m.socket.emit('party_state', snapshot(party)); };
  return function attach(socket, player, move) {
    let current = null;
    const leave = () => {
      if (!current) return;
      const party = current; current = null;
      party.members.delete(socket.id);
      if (!party.members.size) parties.delete(party.code);
      else { if (party.hostId === socket.id) party.hostId = party.members.keys().next().value; publish(party); }
      socket.emit('party_state', null);
    };
    const join = party => {
      leave(); current = party;
      party.members.set(socket.id, { socket, name: () => player.name });
      player.active = false;
      move('horde', `party:${party.code}:horde`);
      publish(party);
    };
    socket.on('party_create', (_, ack) => {
      if (current) return ack?.({ error: 'Leave your current party first.' });
      let code; do { code = randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, '0'); } while (parties.has(code));
      const party = { code, public: false, started: false, hostId: socket.id, members: new Map() };
      parties.set(code, party); join(party); ack?.({ ok: true });
    });
    socket.on('party_join', (code, ack) => {
      const party = typeof code === 'string' && parties.get(code.trim().toUpperCase());
      if (!party || party.started) return ack?.({ error: 'Lobby unavailable. Check the code or refresh the list.' });
      if (party.members.size >= 8) return ack?.({ error: 'This lobby is full (8/8).' });
      join(party); ack?.({ ok: true });
    });
    socket.on('party_list', (_, ack) => ack?.([...parties.values()].filter(p => p.public && !p.started && p.members.size < 8).map(snapshot)));
    socket.on('party_visibility', value => { if (current?.hostId === socket.id && !current.started) { current.public = value === true; publish(current); } });
    socket.on('party_start', (_, ack) => {
      if (!current || current.hostId !== socket.id) return ack?.({ error: 'Only the host can start the mission.' });
      if (current.started) return;
      current.started = true; publish(current);
      for (const m of current.members.values()) m.socket.emit('party_started');
      ack?.({ ok: true });
    });
    socket.on('party_leave', () => { leave(); player.active = false; move('ffa'); });
    socket.on('disconnect', leave);
    return { leave, room: () => current ? `party:${current.code}:horde` : null, canActivate: () => !current || current.started };
  };
};
