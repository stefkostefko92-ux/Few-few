// Generate a bcrypt hash for ADMIN_PASSWORD_HASH.
// Usage: npm run hash -- "your-strong-password"
import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw) {
  console.error('Usage: npm run hash -- "your-strong-password"');
  process.exit(1);
}
console.log(bcrypt.hashSync(pw, 12));
