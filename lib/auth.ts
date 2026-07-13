import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { verifyAdminCredentials, is2faDisabled } from "./admin/verify";

/**
 * Полный конфиг Auth.js v5 для админки (PRD §2, §9.3): credentials +
 * обязательный TOTP через verifyAdminCredentials (argon2 + prisma) —
 * только Node-рантайм. Middleware использует edge-safe authConfig.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
        totp: {},
      },
      async authorize(credentials) {
        const { email, password, totp } = credentials as Record<
          string,
          string | undefined
        >;
        if (!email || !password) return null;
        if (!totp && !is2faDisabled()) return null;
        return verifyAdminCredentials(email, password, totp ?? "");
      },
    }),
  ],
});
