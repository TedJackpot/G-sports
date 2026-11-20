'use strict';
// Point d'entrée Vercel : toutes les pages et l'API passent par le même gestionnaire que le serveur local.
const { handler } = require('../server/index.js');
module.exports = handler;
