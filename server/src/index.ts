import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ZONE_ROOM } from '@aranya/shared';
import { ZoneRoom } from './rooms/ZoneRoom.ts';

const port = Number(process.env.PORT ?? 2567);

const server = new Server({ transport: new WebSocketTransport() });
// One set of channels per level: joinOrCreate(ZONE_ROOM, { level }) only matches rooms of that level.
server.define(ZONE_ROOM, ZoneRoom).filterBy(['level']);

await server.listen(port);
console.log(`[aranya] zone server listening on ws://localhost:${port}`);
