"use strict";
// Права и одит. Ролята се чете от базата (req.user.ruolo идва от базата в requireUser), никога от токена.

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const getRole = async (prisma, ruolo) => (await prisma.role.findUnique({ where: { id: ruolo } })) || {};

/** Middleware: пуска само роля с даденото право; req.role остава за проверките по-нататък. */
function requirePerm(prisma, perm) {
  return async (req, res, next) => {
    try {
      const role = await getRole(prisma, req.user.ruolo);
      if (!role[perm]) return res.status(403).json({ error: "Нямаш достъп" });
      req.role = role;
      next();
    } catch (err) {
      next(err);
    }
  };
}

const isSuper = (req) => req.user.ruolo === "SUPER_ADMIN";

async function addAudit(prisma, user, action, description, details = "") {
  const d = { userId: user.id, userName: user.nome, userRole: user.ruolo, action, description, details };
  await prisma.auditLog.create({ data: d });
  if (user.ruolo !== "SUPER_ADMIN") await prisma.notification.create({ data: { ...d, read: false } });
}

module.exports = { HttpError, getRole, requirePerm, isSuper, addAudit };
