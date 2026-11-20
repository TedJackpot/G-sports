// G-Sports – pictogrammes d'activités dessinés pour le site (style pictogrammes sportifs).
// Chaque activité a son pictogramme et sa couleur : aucune image ne montre une autre activité.

const L = (pts) => `<polyline points="${pts}" />`;
const H = (x, y, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" class="f"/>`;

const DRAW = {
  football: H(52, 16) + L('50,25 46,50') + L('36,38 49,30 64,36 72,31') + L('32,82 40,66 46,50 60,62 72,58') + '<circle cx="82" cy="76" r="7.5" class="f"/>',
  basketball: H(46, 20) + L('46,29 46,54') + L('34,38 46,32 58,20 64,13') + L('42,86 40,70 46,54 56,68 54,86') + '<circle cx="70" cy="9" r="6.5" class="f"/>' + L('76,28 92,28') + L('92,12 92,34') + '<path d="M78 28 l3 10 h7 l3 -10" class="t"/>',
  natation: H(26, 46) + L('34,52 72,56 88,50') + L('40,50 52,36 66,40') + '<path d="M8 70 q8 -7 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" class="t"/><path d="M8 84 q8 -7 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" class="t"/>',
  combat: H(36, 16) + L('36,25 42,50') + L('26,40 38,30 54,36') + L('36,88 38,68 42,50 64,44 88,38') + L('30,46 52,46'),
  danse: H(50, 14) + L('50,23 50,48') + L('30,8 36,18 50,28 66,22 74,10') + L('44,86 46,66 50,48 64,58 80,50'),
  musique: '<circle cx="30" cy="76" r="11" class="f"/><circle cx="72" cy="68" r="11" class="f"/>' + L('39,74 39,22 81,12 81,66') + L('39,36 81,26'),
  arts: '<path d="M50 14 c24 0 38 14 38 30 c0 12 -10 14 -18 12 c-8 -2 -12 4 -8 10 c4 8 -4 18 -16 18 c-22 0 -36 -16 -36 -36 c0 -18 16 -34 40 -34 z" class="f"/><circle cx="32" cy="40" r="5" class="b"/><circle cx="46" cy="28" r="5" class="b"/><circle cx="64" cy="30" r="5" class="b"/><circle cx="34" cy="60" r="5" class="b"/>' + L('62,90 90,58'),
  theatre: '<path d="M18 22 h40 v24 c0 16 -10 26 -20 26 s-20 -10 -20 -26 z" class="f"/><circle cx="30" cy="38" r="4" class="b"/><circle cx="46" cy="38" r="4" class="b"/><path d="M28 54 q10 8 20 0" class="bt"/>' + '<path d="M50 40 h34 v20 c0 14 -8 22 -17 22 s-17 -8 -17 -22 z" class="f o"/><circle cx="60" cy="54" r="3.5" class="b"/><circle cx="74" cy="54" r="3.5" class="b"/><path d="M60 72 q7 -6 14 0" class="bt"/>',
  robot: L('50,10 50,22') + '<circle cx="50" cy="9" r="4" class="f"/><rect x="26" y="22" width="48" height="36" rx="8" class="f"/><circle cx="40" cy="40" r="5" class="b"/><circle cx="60" cy="40" r="5" class="b"/><rect x="34" y="64" width="32" height="24" rx="5" class="f"/>' + L('26,70 14,80') + L('74,70 86,80'),
  echecs: '<path d="M32 88 h40 v-8 h-4 c-2 -14 2 -24 6 -34 c4 -12 -2 -26 -18 -30 l-6 -6 -4 10 c-8 4 -14 12 -16 20 l8 4 8 -6 c2 8 -6 18 -12 28 c-2 6 -2 12 -2 14 h-4 z" class="f"/><circle cx="48" cy="28" r="3" class="b"/>',
  livre: '<path d="M10 26 c14 -6 28 -6 40 4 v58 c-12 -10 -26 -10 -40 -4 z" class="f"/><path d="M90 26 c-14 -6 -28 -6 -40 4 v58 c12 -10 26 -10 40 -4 z" class="f o"/>',
  sciences: '<path d="M40 12 h20 M44 12 v26 l-22 40 c-3 6 1 10 7 10 h42 c6 0 10 -4 7 -10 l-22 -40 v-26" class="t"/><path d="M30 66 h40 l8 14 c2 4 0 6 -4 6 h-48 c-4 0 -6 -2 -4 -6 z" class="f"/>',
  nature: H(36, 16) + L('36,25 40,52') + L('26,40 37,30 50,40 58,30') + L('58,18 58,92') + L('30,88 34,70 40,52 50,70 52,88') + '<path d="M78 30 l14 26 h-8 l12 22 h-36 l12 -22 h-8 z" class="f o"/>',
  camp: '<path d="M10 82 l30 -54 30 54 z" class="f"/><path d="M40 82 l-8 -20 h16 z" class="b"/><path d="M78 82 c-8 0 -10 -8 -6 -14 c2 6 6 6 6 0 c0 -6 6 -10 8 -14 c4 8 8 14 4 22 c-2 4 -6 6 -12 6 z" class="f o"/>' + L('6,86 94,86'),
  gym: H(50, 72) + L('50,62 50,40') + L('38,84 50,64 62,84') + L('30,8 38,22 50,40 62,22 70,8') + L('8,90 92,90'),
  tennis: H(38, 16) + L('38,25 42,50') + L('28,40 39,30 54,26 62,18') + '<ellipse cx="70" cy="11" rx="7" ry="9" class="t"/>' + L('30,86 34,68 42,50 52,66 56,86') + '<circle cx="84" cy="30" r="4.5" class="f"/>',
  athle: H(58, 14) + L('56,23 46,48') + L('34,40 40,30 55,28 66,36 72,28') + L('56,84 60,64 46,48 34,62 18,62'),
  yoga: H(50, 16) + L('50,25 50,54') + L('22,64 32,50 50,33 68,50 78,64') + L('16,74 50,64 84,74') + L('22,82 78,82'),
  volley: H(42, 26) + L('42,35 44,60') + L('32,46 43,38 54,24 60,16') + L('34,90 38,74 44,60 54,74 52,90') + '<circle cx="68" cy="10" r="7" class="f"/>' + L('6,50 26,50'),
  velo: '<circle cx="24" cy="70" r="16" class="t"/><circle cx="76" cy="70" r="16" class="t"/>' + L('24,70 42,44 64,44 76,70') + L('42,44 50,70 64,44') + L('38,38 48,38') + H(58, 18) + L('56,26 48,42') + L('48,42 50,62'),
  bienetre: '<path d="M50 88 c-26 -16 -40 -30 -40 -48 c0 -12 9 -20 20 -20 c8 0 15 5 20 12 c5 -7 12 -12 20 -12 c11 0 20 8 20 20 c0 18 -14 32 -40 48 z" class="f"/>',
  multi: '<circle cx="34" cy="36" r="18" class="f"/><circle cx="66" cy="36" r="14" class="f o"/><circle cx="50" cy="70" r="16" class="f"/>' + L('16,36 52,36') + L('34,18 34,54'),
  defaut: '<path d="M50 10 l11 24 26 3 -19 18 5 26 -23 -13 -23 13 5 -26 -19 -18 26 -3 z" class="f"/>',
};

// Catégorie -> [pictogramme, couleur]
const COLORS = { green: '#18A058', orange: '#FF7A1A', blue: '#1668E3', red: '#E5383B', violet: '#7B4DFF', pink: '#E83E8C', turq: '#0FA3B1', sun: '#F5A300', navy: '#102C46', leaf: '#3E8E2F' };
const CAT = {
  football: ['football', 'green'], futsal: ['football', 'green'], basketball: ['basketball', 'orange'], volleyball: ['volley', 'blue'],
  handball: ['volley', 'red'], rugby: ['football', 'leaf'], 'baseball-et-softball': ['volley', 'blue'], hockey: ['football', 'blue'], 'sports-collectifs-divers': ['multi', 'green'],
  tennis: ['tennis', 'leaf'], 'tennis-de-table': ['tennis', 'red'], badminton: ['tennis', 'turq'], athletisme: ['athle', 'red'], course: ['athle', 'orange'],
  natation: ['natation', 'blue'], plongee: ['natation', 'blue'], gymnastique: ['gym', 'pink'], trampoline: ['gym', 'violet'], escalade: ['nature', 'leaf'],
  cyclisme: ['velo', 'orange'], skateboard: ['velo', 'violet'], roller: ['velo', 'pink'], 'arts-du-cirque': ['gym', 'red'],
  judo: ['combat', 'blue'], karate: ['combat', 'red'], taekwondo: ['combat', 'red'], 'boxe-educative': ['combat', 'red'], kickboxing: ['combat', 'red'],
  lutte: ['combat', 'orange'], aikido: ['combat', 'violet'], 'jiu-jitsu': ['combat', 'violet'], 'self-defense-jeunes': ['combat', 'red'],
  'natation-debutant': ['natation', 'blue'], 'natation-perfectionnement': ['natation', 'blue'], 'natation-competition': ['natation', 'blue'],
  'aquagym-jeunes': ['natation', 'turq'], 'initiation-aux-activites-nautiques': ['natation', 'turq'], 'stages-aquatiques': ['natation', 'turq'],
  chant: ['musique', 'violet'], musique: ['musique', 'violet'], piano: ['musique', 'violet'], guitare: ['musique', 'violet'], batterie: ['musique', 'violet'], percussions: ['musique', 'orange'],
  dessin: ['arts', 'pink'], peinture: ['arts', 'pink'], sculpture: ['arts', 'pink'], 'ateliers-creatifs': ['arts', 'pink'], theatre: ['theatre', 'red'], improvisation: ['theatre', 'red'],
  informatique: ['robot', 'turq'], programmation: ['robot', 'turq'], robotique: ['robot', 'turq'], echecs: ['echecs', 'navy'], sciences: ['sciences', 'turq'],
  lecture: ['livre', 'sun'], langues: ['livre', 'sun'], 'soutien-scolaire': ['livre', 'sun'], mathematiques: ['sciences', 'blue'], 'ateliers-de-decouverte': ['sciences', 'turq'], 'orientation-et-metiers': ['livre', 'navy'],
  randonnee: ['nature', 'leaf'], 'camping-encadre': ['camp', 'leaf'], 'decouverte-de-la-nature': ['nature', 'leaf'], 'camps-de-vacances': ['camp', 'orange'],
  'activites-de-plage': ['volley', 'turq'], excursions: ['nature', 'green'], 'initiation-survie-encadree': ['camp', 'leaf'], 'activites-ecologiques': ['nature', 'green'],
  'observation-de-la-faune': ['nature', 'leaf'], 'decouverte-du-patrimoine': ['livre', 'orange'],
  'yoga-enfants': ['yoga', 'violet'], relaxation: ['yoga', 'violet'], respiration: ['yoga', 'turq'], motricite: ['gym', 'sun'], coordination: ['gym', 'sun'], 'confiance-en-soi': ['bienetre', 'pink'], concentration: ['echecs', 'violet'],
};
const GROUP = {
  'sports-collectifs': ['football', 'green'], 'sports-individuels': ['athle', 'red'], 'arts-martiaux': ['combat', 'red'], danse: ['danse', 'pink'],
  aquatique: ['natation', 'blue'], arts: ['arts', 'violet'], educatif: ['robot', 'turq'], nature: ['nature', 'leaf'], 'bien-etre': ['yoga', 'sun'],
};
// Danse : catégories du groupe danse
for (const s of ['danse-classique', 'hip-hop', 'afro-dance', 'danse-contemporaine', 'ballet', 'danses-traditionnelles', 'zumba-kids', 'choregraphie', 'expression-corporelle']) CAT[s] = ['danse', 'pink'];

export function styleFor(catSlug, groupSlug) {
  const [k, c] = CAT[catSlug] || GROUP[groupSlug] || ['defaut', 'navy'];
  return { key: k, color: COLORS[c] };
}
export function picto(key, { size = 64, title = '' } = {}) {
  return `<svg class="picto" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${title}" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${DRAW[key] || DRAW.defaut}</svg>`;
}
export function pictoFor(catSlug, groupSlug, opts) { return picto(styleFor(catSlug, groupSlug).key, opts); }
export const PICTO_KEYS = Object.keys(DRAW);

// Photos fournies (et découpées) qui correspondent réellement à une famille ou une activité.
// Familles sans photo correspondante (danse, arts, éducatif, bien-être) : pictogramme uniquement.
const GROUP_PHOTOS = {
  'sports-collectifs': 'football-entrainement', 'sports-individuels': 'multisport', 'arts-martiaux': 'arts-martiaux',
  aquatique: 'natation-cours', nature: 'exploration-nature',
};
const CAT_PHOTOS = {
  football: 'football-entrainement', futsal: 'football-jonglage', basketball: 'basket-dribble',
  karate: 'arts-martiaux-2', judo: 'arts-martiaux-2', taekwondo: 'arts-martiaux', 'boxe-educative': 'arts-martiaux', kickboxing: 'arts-martiaux',
  lutte: 'arts-martiaux-2', aikido: 'arts-martiaux-2', 'jiu-jitsu': 'arts-martiaux-2', 'self-defense-jeunes': 'arts-martiaux',
  'natation-debutant': 'natation-cours', 'natation-perfectionnement': 'natation-dos', 'natation-competition': 'natation-groupe', natation: 'natation-cours',
  'stages-aquatiques': 'natation-groupe', 'aquagym-jeunes': 'natation-initiation', randonnee: 'randonnee-foret', 'camping-encadre': 'camp-nature',
  'decouverte-de-la-nature': 'exploration-nature', excursions: 'exploration-nature', 'observation-de-la-faune': 'exploration-nature', 'camps-de-vacances': 'camp-nature',
};
// Activité précise : seulement une photo de cette activité. Famille entière : photo de la famille.
export function photoFor(catSlug, groupSlug, small = true) {
  const name = catSlug ? CAT_PHOTOS[catSlug] : GROUP_PHOTOS[groupSlug];
  return name ? `/img/photos/${name}${small ? '-sm' : ''}.jpg` : null;
}
