import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function registerUser(name: string, email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    throw new Error("E-mail já cadastrado");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email: normalizedEmail,
      passwordHash,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return user;
}

export async function validateLogin(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) return null;

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
  };
}

export async function createResetToken(email: string) {
  const normalizedEmail = normalizeEmail(email);

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  });

  if (!user) {
    // Em produção, não revelamos se o e-mail existe.
    return null;
  }

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

  // Evita acumular muitos tokens do mesmo usuário
  await prisma.passwordResetToken.deleteMany({
    where: { userId: user.id },
  });

  await prisma.passwordResetToken.create({
    data: {
      token,
      userId: user.id,
      expiresAt,
    },
  });

  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  const reset = await prisma.passwordResetToken.findUnique({
    where: { token },
    select: { token: true, userId: true, expiresAt: true },
  });

  if (!reset) {
    throw new Error("Token inválido ou expirado");
  }

  if (reset.expiresAt < new Date()) {
    await prisma.passwordResetToken.delete({
      where: { token },
    });
    throw new Error("Token expirado");
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const updatedUser = await prisma.user.update({
    where: { id: reset.userId },
    data: { passwordHash },
    select: {
      id: true,
      email: true,
    },
  });

  await prisma.passwordResetToken.delete({
    where: { token },
  });

  return updatedUser;
}

/**
 * Login social com Google (opção A: sem senha para o usuário).
 *
 * Regra:
 * - Se existir usuário com googleId -> usa ele.
 * - Senão, se existir com mesmo e-mail -> vincula googleId nesse usuário.
 * - Senão, cria um novo usuário com senha aleatória (não usada pelo app).
 */
export async function findOrCreateGoogleUser(params: {
  googleId: string;
  email: string;
  name?: string | null;
}) {
  const normalizedEmail = normalizeEmail(params.email);

  // 1) Tenta encontrar por googleId
  const byGoogleId = await prisma.user.findUnique({
    where: { googleId: params.googleId },
  });

  if (byGoogleId) {
    return {
      id: byGoogleId.id,
      name: byGoogleId.name,
      email: byGoogleId.email,
    };
  }

  // 2) Tenta encontrar por e-mail
  const byEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (byEmail) {
    // Se já existe por e-mail mas sem googleId, vincula
    if (!byEmail.googleId) {
      const updated = await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: params.googleId },
      });

      return {
        id: updated.id,
        name: updated.name,
        email: updated.email,
      };
    }

    // Já tinha algum googleId (caso raro, mas mantemos)
    return {
      id: byEmail.id,
      name: byEmail.name,
      email: byEmail.email,
    };
  }

  // 3) Não existe: cria usuário novo (senha aleatória)
  const fallbackName =
    (params.name && params.name.trim()) ||
    normalizedEmail.split("@")[0] ||
    "Usuário Google";

  const randomPasswordSource = crypto.randomBytes(32).toString("hex");
  const passwordHash = await bcrypt.hash(randomPasswordSource, 10);

  const created = await prisma.user.create({
    data: {
      name: fallbackName,
      email: normalizedEmail,
      passwordHash,
      googleId: params.googleId,
    },
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  return created;
}
