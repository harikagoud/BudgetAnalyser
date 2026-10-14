import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { createTestDb } from './setup';
import { authenticateUser, registerUser } from '@/lib/auth/service';
import {
  changePassword,
  deleteAccount,
  InvalidPasswordError,
} from '@/lib/auth/account-management';
import { importStatement } from '@/lib/import/importStatement';
import { signToken, verifyToken } from '@/lib/auth/token';
import { upsertUserRule } from '@/lib/categorization/engine';

const CSV = ['Date,Description,Amount', '2026-03-02,STARBUCKS #1,12.00'].join('\n');

describe('account management (change password / delete account)', () => {
  let client: PrismaClient;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    process.env.AUTH_SECRET = Buffer.alloc(32, 9).toString('base64');
    const db = await createTestDb();
    client = db.client;
    cleanup = db.cleanup;
  });
  afterAll(async () => {
    await cleanup(); // drops the schema and disconnects
  });

  describe('changePassword', () => {
    it('changes the password: the new one works, the old one stops working', async () => {
      const u = await registerUser(client, { email: 'chg@example.com', password: 'old-password-1' });
      await changePassword(client, u.id, { currentPassword: 'old-password-1', newPassword: 'new-password-2' });
      expect(await authenticateUser(client, { email: 'chg@example.com', password: 'new-password-2' })).not.toBeNull();
      expect(await authenticateUser(client, { email: 'chg@example.com', password: 'old-password-1' })).toBeNull();
    });

    it('refuses when the current password is wrong, and changes nothing', async () => {
      const u = await registerUser(client, { email: 'chg2@example.com', password: 'old-password-1' });
      await expect(
        changePassword(client, u.id, { currentPassword: 'WRONG-password', newPassword: 'new-password-2' }),
      ).rejects.toBeInstanceOf(InvalidPasswordError);
      expect(await authenticateUser(client, { email: 'chg2@example.com', password: 'old-password-1' })).not.toBeNull();
    });

    it('CURRENT BEHAVIOUR (documented limitation): sessions issued before the change stay valid', async () => {
      // Tokens are stateless (no server-side session row), so a password change
      // cannot revoke them until they expire or AUTH_SECRET is rotated.
      const u = await registerUser(client, { email: 'chg3@example.com', password: 'old-password-1' });
      const oldToken = await signToken(u.id);
      await changePassword(client, u.id, { currentPassword: 'old-password-1', newPassword: 'new-password-2' });
      expect(await verifyToken(oldToken)).toEqual({ userId: u.id });
    });
  });

  describe('deleteAccount', () => {
    it('deletes the user and ALL their data, but leaves other users and global data untouched', async () => {
      const victim = await registerUser(client, { email: 'bye@example.com', password: 'bye-password-1' });
      const keeper = await registerUser(client, { email: 'stay@example.com', password: 'stay-password-1' });

      const mk = async (userId: string, name: string) => {
        const acct = await client.account.create({ data: { name, type: 'MANUAL', userId } });
        await importStatement(
          { userId, accountId: acct.id, fileName: 'x.csv', fileContent: CSV, format: 'CSV' },
          client,
        );
        const dining = await client.category.findUniqueOrThrow({ where: { name: 'Dining' } });
        await upsertUserRule('SOME SHOP', dining.id, userId, client);
        await client.userSetting.create({ data: { userId, key: 'riskTolerance', value: 'moderate' } });
        return acct.id;
      };
      const victimAcct = await mk(victim.id, 'V');
      const keeperAcct = await mk(keeper.id, 'K');

      await deleteAccount(client, victim.id, { password: 'bye-password-1' });

      expect(await client.user.findUnique({ where: { id: victim.id } })).toBeNull();
      expect(await client.account.count({ where: { userId: victim.id } })).toBe(0);
      expect(await client.transaction.count({ where: { accountId: victimAcct } })).toBe(0);
      expect(await client.importBatch.count({ where: { accountId: victimAcct } })).toBe(0);
      expect(await client.userSetting.count({ where: { userId: victim.id } })).toBe(0);
      expect(await client.merchantRule.count({ where: { userId: victim.id } })).toBe(0);

      // the other user is fully intact
      expect(await client.user.findUnique({ where: { id: keeper.id } })).not.toBeNull();
      expect(await client.transaction.count({ where: { accountId: keeperAcct } })).toBe(1);
      expect(await client.merchantRule.count({ where: { userId: keeper.id } })).toBe(1);
      // global data survives
      expect(await client.category.count()).toBeGreaterThan(0);
      expect(await client.merchantRule.count({ where: { source: 'SEED' } })).toBeGreaterThan(0);
    });

    it('refuses with the wrong password and deletes nothing', async () => {
      const u = await registerUser(client, { email: 'safe@example.com', password: 'safe-password-1' });
      await expect(deleteAccount(client, u.id, { password: 'nope-nope-nope' })).rejects.toBeInstanceOf(
        InvalidPasswordError,
      );
      expect(await client.user.findUnique({ where: { id: u.id } })).not.toBeNull();
    });
  });
});
