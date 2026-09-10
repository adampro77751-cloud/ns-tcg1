import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation";

// A valid-format bcrypt hash of an unguessable value, used only as a timing
// decoy in the login flow (see authorize() below). Not a real credential.
const DUMMY_HASH =
  "$2b$12$C6UzMDM.H6dfI/f/IKcEeOgcXG/x2fV6.b1VfyKz9mgYnZDLzHzYm";

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        usernameOrEmail: { label: "Username or email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { usernameOrEmail, password } = parsed.data;

        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { username: usernameOrEmail },
              { email: usernameOrEmail.toLowerCase() },
            ],
          },
        });

        // Always run a bcrypt compare, even for a nonexistent user, against a
        // fixed dummy hash — this keeps response timing consistent so an
        // attacker can't use it to enumerate valid usernames/emails.
        const passwordValid = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_HASH,
        );
        if (!user || !passwordValid) return null;
        // Banned accounts can't establish a new session — same generic
        // rejection as a bad password, no separate "you're banned" message,
        // consistent with this flow's existing no-enumeration posture.
        if (user.bannedAt) return null;

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.username = user.username;
        token.role = user.role;
        return token;
      }
      // Re-checked on every subsequent request (not just at sign-in), so a
      // ban takes effect immediately for someone already logged in rather
      // than only blocking their next login attempt. Throwing here is what
      // invalidates the session — auth() then returns null on this and
      // every later request for this account.
      const current = await prisma.user.findUnique({
        where: { id: token.id },
        select: { bannedAt: true },
      });
      if (!current || current.bannedAt) {
        throw new Error("Account is no longer active.");
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.username = token.username;
        session.user.role = token.role;
      }
      return session;
    },
  },
});
