// Realtime gateway protocol (JSON over WebSocket).
import type { Activity, Call, Channel, MediaSource, ReadState, Guild, Member, Message, PrivateChannel, Relationship, SelfUser, User, VoiceState } from './types.ts';

export const GATEWAY_VERSION = 1;
export const HEARTBEAT_MS = 41_000;

export type ClientFrame =
  | { op: 'identify'; token: string }
  | { op: 'resume'; token: string; sessionId: string; seq: number }
  | { op: 'heartbeat'; seq: number }
  | { op: 'voice_state'; guildId: string | null; channelId: string | null; selfMute: boolean; selfDeaf: boolean; selfVideo?: boolean; selfStream?: boolean }
  | { op: 'typing'; channelId: string }
  | { op: 'activity'; activity: Activity | null };

export interface ReadyPayload {
  sessionId: string;
  user: SelfUser;
  guilds: Guild[];
  voiceStates: VoiceState[];
  relationships: Relationship[];
  privateChannels: PrivateChannel[];
  presences: { userId: string; status: 'online' | 'idle' | 'dnd' | 'offline'; activity?: Activity | null }[];
  calls: Call[];
  readStates: ReadState[];
  heartbeatMs: number;
}

export type DispatchEvent =
  | { t: 'READY'; d: ReadyPayload }
  | { t: 'RESUMED'; d: Record<string, never> }
  | { t: 'GUILD_CREATE'; d: Guild }
  | { t: 'GUILD_DELETE'; d: { id: string } }
  | { t: 'CHANNEL_CREATE'; d: Channel }
  | { t: 'GUILD_MEMBER_ADD'; d: Member & { guildId: string } }
  | { t: 'GUILD_MEMBER_REMOVE'; d: { guildId: string; userId: string } }
  | { t: 'GUILD_MEMBER_UPDATE'; d: Member & { guildId: string } }
  | { t: 'MESSAGE_CREATE'; d: Message & { guildId: string | null } }
  | { t: 'MESSAGE_DELETE'; d: { id: string; channelId: string } }
  | { t: 'MESSAGE_UPDATE'; d: Message & { guildId: string | null } }
  | { t: 'MESSAGE_REACTION_ADD'; d: { messageId: string; channelId: string; emoji: string; userId: string } }
  | { t: 'MESSAGE_REACTION_REMOVE'; d: { messageId: string; channelId: string; emoji: string; userId: string } }
  | { t: 'READ_STATE_UPDATE'; d: ReadState }
  | { t: 'TYPING_START'; d: { channelId: string; userId: string; at: number } }
  | { t: 'VOICE_STATE_UPDATE'; d: VoiceState & { left?: boolean } }
  | { t: 'PRESENCE_UPDATE'; d: { userId: string; status: 'online' | 'idle' | 'dnd' | 'offline'; activity?: Activity | null } }
  | { t: 'VOICE_MOVE'; d: { guildId: string | null; channelId: string } }
  | { t: 'RELATIONSHIP_ADD'; d: Relationship }
  | { t: 'RELATIONSHIP_REMOVE'; d: { id: string } }
  | { t: 'PRIVATE_CHANNEL_CREATE'; d: PrivateChannel }
  | { t: 'PRIVATE_CHANNEL_UPDATE'; d: PrivateChannel }
  | { t: 'PRIVATE_CHANNEL_DELETE'; d: { id: string } }
  | { t: 'CALL_CREATE'; d: Call }
  | { t: 'CALL_UPDATE'; d: Call }
  | { t: 'CALL_DELETE'; d: { channelId: string } }
  | { t: 'USER_UPDATE'; d: User }
  | { t: 'RTC_TRACKS'; d: { channelId: string; userId: string; sources: MediaSource[] } }
  | { t: 'RTC_FORCE'; d: { channelId: string; serverMute: boolean; serverDeaf: boolean; allowed: MediaSource[] } };

export type ServerFrame =
  | ({ op: 'dispatch'; s: number } & DispatchEvent)
  | { op: 'hello'; heartbeatMs: number; v: number }
  | { op: 'heartbeat_ack' }
  | { op: 'invalid_session'; resumable: boolean }
  | { op: 'reconnect' };

/** Close codes the client acts on. */
export const CLOSE = {
  AUTH_FAILED: 4001,
  NOT_AUTHENTICATED: 4003,
  RATE_LIMITED: 4008,
  SESSION_TIMEOUT: 4009,
  INVALID_FRAME: 4002,
} as const;
