// One-off script to create a login account directly in the database —
// needed because the very first admin account can't be created through the
// app itself (the "create user" page requires being logged in as an admin
// already). Run this via your hosting platform's console (e.g. Railway's
// "Console" tab), or locally if DATABASE_URL points at your database.
//
// Usage:
//   node scripts/create-user.js <username> <password> <role>
//
// Examples:
//   node scripts/create-user.js sayna "my-strong-password" admin
//   node scripts/create-user.js faezeh "another-password" admin
//
// For a "viewer" account (read-only access to one specific assessment),
// create it from the app's /users page instead — you'll need to pick which
// assessment to assign, which is much easier from the UI than this script.

const { PrismaClient } = require("@prisma/client");
const { scryptSync, randomBytes } = require("crypto");

function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function main() {
  const [username, password, role] = process.argv.slice(2);
  if (!username || !password) {
    console.error("Usage: node scripts/create-user.js <username> <password> [admin|viewer]");
    process.exit(1);
  }
  const finalRole = role === "viewer" ? "viewer" : "admin"; // defaults to admin, since that's this script's main purpose

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      console.error(`Error: username "${username}" already exists.`);
      process.exit(1);
    }
    const user = await prisma.user.create({
      data: { username, passwordHash: hashPassword(password), role: finalRole },
    });
    console.log(`Created user "${user.username}" with role "${user.role}". You can now log in with this username and the password you provided.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
