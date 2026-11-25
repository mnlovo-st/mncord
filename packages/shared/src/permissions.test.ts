import { describe, expect, it } from 'vitest';
import { ALL, computePermissions, DEFAULT_EVERYONE, has, P, topPosition, type RoleLike } from './permissions.ts';

const guild = { id: 'g', ownerId: 'owner' };
const everyone: RoleLike = { id: 'g', permissions: DEFAULT_EVERYONE, position: 0, isEveryone: true };
const mod: RoleLike = { id: 'mod', permissions: P.MANAGE_MESSAGES | P.KICK_MEMBERS, position: 2, isEveryone: false };
const admin: RoleLike = { id: 'admin', permissions: P.ADMINISTRATOR, position: 5, isEveryone: false };
const muted: RoleLike = { id: 'muted', permissions: 0n, position: 1, isEveryone: false };
const roles = [everyone, mod, admin, muted];

describe('computePermissions', () => {
  it('owner has everything, even with deny overwrites', () => {
    const p = computePermissions(guild, { userId: 'owner', roleIds: [] }, roles, [{ targetId: 'g', targetType: 'role', allow: 0n, deny: P.VIEW_CHANNEL }]);
    expect(p).toBe(ALL);
  });

  it('plain member gets @everyone defaults', () => {
    const p = computePermissions(guild, { userId: 'u', roleIds: [] }, roles);
    expect(has(p, P.SEND_MESSAGES)).toBe(true);
    expect(has(p, P.MANAGE_MESSAGES)).toBe(false);
  });

  it('roles add permissions', () => {
    const p = computePermissions(guild, { userId: 'u', roleIds: ['mod'] }, roles);
    expect(has(p, P.MANAGE_MESSAGES)).toBe(true);
  });

  it('administrator bypasses overwrites', () => {
    const p = computePermissions(guild, { userId: 'u', roleIds: ['admin'] }, roles, [{ targetId: 'g', targetType: 'role', allow: 0n, deny: P.VIEW_CHANNEL }]);
    expect(p).toBe(ALL);
  });

  it('@everyone deny hides a private channel, role allow shows it again', () => {
    const ow = [
      { targetId: 'g', targetType: 'role' as const, allow: 0n, deny: P.VIEW_CHANNEL },
      { targetId: 'mod', targetType: 'role' as const, allow: P.VIEW_CHANNEL, deny: 0n },
    ];
    expect(computePermissions(guild, { userId: 'u', roleIds: [] }, roles, ow)).toBe(0n);
    expect(has(computePermissions(guild, { userId: 'u', roleIds: ['mod'] }, roles, ow), P.VIEW_CHANNEL)).toBe(true);
  });

  it('role allow beats role deny across roles, member overwrite beats both', () => {
    const ow = [
      { targetId: 'muted', targetType: 'role' as const, allow: 0n, deny: P.SEND_MESSAGES },
      { targetId: 'mod', targetType: 'role' as const, allow: P.SEND_MESSAGES, deny: 0n },
      { targetId: 'u', targetType: 'member' as const, allow: 0n, deny: P.SEND_MESSAGES },
    ];
    expect(has(computePermissions(guild, { userId: 'x', roleIds: ['muted', 'mod'] }, roles, ow), P.SEND_MESSAGES)).toBe(true);
    expect(has(computePermissions(guild, { userId: 'x', roleIds: ['muted'] }, roles, ow), P.SEND_MESSAGES)).toBe(false);
    expect(has(computePermissions(guild, { userId: 'u', roleIds: ['mod'] }, roles, ow), P.SEND_MESSAGES)).toBe(false);
  });

  it('timeout leaves only view + history', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const p = computePermissions(guild, { userId: 'u', roleIds: ['mod'], timeoutUntil: new Date('2026-01-01T01:00:00Z') }, roles, [], now);
    expect(p).toBe(P.VIEW_CHANNEL | P.READ_HISTORY);
    const later = computePermissions(guild, { userId: 'u', roleIds: ['mod'], timeoutUntil: new Date('2025-12-31T00:00:00Z') }, roles, [], now);
    expect(has(later, P.SEND_MESSAGES)).toBe(true);
  });

  it('hierarchy: top position', () => {
    expect(topPosition(guild, { userId: 'owner', roleIds: [] }, roles)).toBe(Infinity);
    expect(topPosition(guild, { userId: 'u', roleIds: ['mod', 'muted'] }, roles)).toBe(2);
  });
});
