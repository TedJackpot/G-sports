'use strict';
// Envoi d'emails : aucun service payant n'est branché par défaut.
// Tant qu'aucun fournisseur n'est configuré, les messages sont écrits dans data/outbox.log
// (utile pour vérifier le contenu). Un fournisseur gratuit (ex. SMTP d'une offre gratuite)
// pourra être branché ici plus tard via des variables d'environnement côté serveur uniquement.
const fs = require('node:fs');
const path = require('node:path');

const OUTBOX = path.join(__dirname, '..', 'data', 'outbox.log');

async function send({ to, subject, text }) {
  if (!to) return;
  const entry = `[${new Date().toISOString()}] À: ${to}\nObjet: ${subject}\n${text}\n---\n`;
  try { fs.appendFileSync(OUTBOX, entry); } catch { /* ignore */ }
}

module.exports = { send };
