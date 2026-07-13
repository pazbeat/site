import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe базовый конфиг Auth.js: без провайдеров и без обращений к БД,
 * поэтому пригоден для middleware (proxy.ts). Полный конфиг с Credentials
 * (argon2 + prisma) — в lib/auth.ts, только для Node-рантайма.
 */
export const authConfig = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/admin/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as "superadmin" | "manager";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
