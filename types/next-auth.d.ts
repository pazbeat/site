import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "superadmin" | "manager";
    } & DefaultSession["user"];
  }

  interface User {
    role?: "superadmin" | "manager";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
  }
}
