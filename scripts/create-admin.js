'use strict';
// Crée (ou réinitialise) un compte administrateur.
// Local : node scripts/create-admin.js email@exemple.ga "MotDePasse123" "Nom affiché"
// Turso : définir TURSO_DATABASE_URL et TURSO_AUTH_TOKEN avant de lancer la commande.
const { db } = require('../server/db');
const { hashPassword } = require('../server/util');

(async () => {
  const [email, password, name = 'Administrateur G-Sports'] = process.argv.slice(2);
  if (!email || !password || password.length < 10) {
    console.error('Usage : node scripts/create-admin.js <email> <mot de passe (10 caractères min.)> [nom]');
    process.exit(1);
  }
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) {
    await db.prepare("UPDATE users SET password_hash = ?, role = 'admin', status = 'active' WHERE id = ?").run(hashPassword(password), existing.id);
    console.log(`Compte ${email} mis à jour (administrateur).`);
  } else {
    await db.prepare("INSERT INTO users (email, password_hash, role, name) VALUES (?, ?, 'admin', ?)").run(email.toLowerCase(), hashPassword(password), name);
    console.log(`Administrateur ${email} créé.`);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
