import { Router, type Request } from 'express';
import { prisma } from '../db.js';
import { HttpError, requireOrg } from '../auth/guards.js';
import { canAssign, MEMBER_ROLES, type MemberRole } from '../auth/roles.js';
import {
  changeMemberRole,
  InviteRoleSchema,
  inviteMember,
  MemberEmailSchema,
  MemberError,
  removeMember,
  revokeMemberInvite,
} from '../accounts/members.js';
import { kickOutbox } from '../mail/outbox.js';
import { param } from './app-shared.js';

/**
 * „Членове“ на фирмата (SPEC 45): списък, покана по имейл, отмяна, смяна на роля, махане, напускане.
 * Управлява `members.manage` (OWNER/ADMIN) само на пряк член — кантора по пълномощно не стига дотук.
 */
async function manager(req: Request) {
  const access = await requireOrg(req, 'members.manage');
  if (access.viaFirmId !== null) throw new HttpError(404);
  return { access, actor: { userId: req.principal!.user.id, role: access.role as MemberRole } };
}

function done(code: string) {
  return /^[a-zA-Z]{2,30}$/.test(code) ? code : 'invalid';
}

export function appMembersRouter(): Router {
  const router = Router();

  router.get('/app/o/:orgId/chlenove', async (req, res) => {
    const { access, actor } = await manager(req);
    const [org, members, invites] = await Promise.all([
      prisma.organization.findUniqueOrThrow({
        where: { id: access.organizationId },
        select: { id: true, legalName: true },
      }),
      prisma.membership.findMany({
        where: { organizationId: access.organizationId },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.memberInvite.findMany({
        where: {
          organizationId: access.organizationId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    res.render('app/members', {
      org,
      members,
      invites,
      actor,
      assignable: MEMBER_ROLES.filter((role) => canAssign(actor.role, role)),
      canManage: (role: MemberRole) => canAssign(actor.role, role),
      ok: typeof req.query['ok'] === 'string' ? done(req.query['ok']) : '',
      err: typeof req.query['err'] === 'string' ? done(req.query['err']) : '',
    });
  });

  router.post('/app/o/:orgId/chlenove/pokani', async (req, res) => {
    const { access, actor } = await manager(req);
    const body = req.body as Record<string, unknown>;
    const email = MemberEmailSchema.safeParse(body['email']);
    const role = InviteRoleSchema.safeParse(body['role']);
    const base = `/app/o/${access.organizationId}/chlenove`;
    if (!email.success || !role.success) return res.redirect(303, `${base}?err=invalid`);
    try {
      await inviteMember({
        organizationId: access.organizationId,
        actor,
        email: email.data,
        role: role.data,
      });
    } catch (error) {
      if (error instanceof MemberError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    kickOutbox();
    res.redirect(303, `${base}?ok=invited`);
  });

  router.post('/app/o/:orgId/chlenove/pokani/:inviteId/otmeni', async (req, res) => {
    const { access, actor } = await manager(req);
    const base = `/app/o/${access.organizationId}/chlenove`;
    try {
      await revokeMemberInvite({
        organizationId: access.organizationId,
        inviteId: param(req, 'inviteId'),
        actor,
      });
    } catch (error) {
      if (error instanceof MemberError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    res.redirect(303, `${base}?ok=revoked`);
  });

  router.post('/app/o/:orgId/chlenove/:membershipId/rolya', async (req, res) => {
    const { access, actor } = await manager(req);
    const base = `/app/o/${access.organizationId}/chlenove`;
    const role = InviteRoleSchema.safeParse((req.body as Record<string, unknown>)['role']);
    if (!role.success) return res.redirect(303, `${base}?err=invalid`);
    try {
      await changeMemberRole({
        organizationId: access.organizationId,
        membershipId: param(req, 'membershipId'),
        actor,
        role: role.data,
      });
    } catch (error) {
      if (error instanceof MemberError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    res.redirect(303, `${base}?ok=roleChanged`);
  });

  router.post('/app/o/:orgId/chlenove/:membershipId/mahni', async (req, res) => {
    const { access, actor } = await manager(req);
    const base = `/app/o/${access.organizationId}/chlenove`;
    try {
      await removeMember({
        organizationId: access.organizationId,
        membershipId: param(req, 'membershipId'),
        actor,
      });
    } catch (error) {
      if (error instanceof MemberError) return res.redirect(303, `${base}?err=${error.code}`);
      throw error;
    }
    res.redirect(303, `${base}?ok=removed`);
  });

  return router;
}
