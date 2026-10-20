# Format «Champions»: lliga amb bombos + eliminatòries

> Estat: **pla**, no implementat (2026-10-20). Avalua com encaixa amb el
> sistema de fases actual i proposa l'ordre de feina.

## 1. El format de referència

Champions League des de 2024-25 (36 equips):

- **Fase de lliga**: quatre bombos per coeficient; cada equip juga 8 rivals
  diferents, 2 de cada bombo (un a casa i un fora). El sorteig fixa tot el
  calendari d'entrada. Classificació única.
- **Talls**: 1–8 passen directament a vuitens; 9–24 juguen una eliminatòria
  prèvia (9–16 contra 17–24, anada i tornada); 25–36 queden eliminats.
- **Eliminatòries**: anada i tornada fins a semifinals; final a partida única.

## 2. Adaptació a Classificat

Dues fases, no cinc:

| Fase | Mètode nou | Rondes (ex. 24 jugadors, 4 bombos, 2 per bombo) |
|------|-----------|------|
| Lliga | `league_draw` | 1–8 |
| Eliminatòries | `knockout` | 9–… segons el quadre |

L'eliminatòria prèvia **no cal que sigui una fase pròpia**: si la fase
d'eliminatòries rep els 24 primers sembrats per posició en un quadre de 32,
el sembrat estàndard dona exactament el format Champions: els caps 1–8 tenen
bye a la primera eliminatòria, 9 juga contra 24, …, 16 contra 17, i el
guanyador de 16/17 es troba l'1 a vuitens. Una sola regla de classificació
(«top N de la fase X») cobreix tot el cas.

Equivalències en el nostre domini (Scrabble, escacs, jugadors individuals):

- **Bombos** → per `rating` de la competició o per la classificació d'una
  fase anterior (com ja fa `carryStandingsFromPhaseIds`).
- **Protecció de país** → etiquetes (club): màxim de rivals amb la mateixa
  etiqueta, o prohibit. Les exclusions entre inscripcions ja existeixen.
- **Casa/fora** → `seat` (qui comença / blanques), equilibrat 50 %.

## 3. Què encaixa ja

- Fases seqüencials per rangs de rondes globals (`startRound`–`endRound`).
- Motor modular: un mètode és un fitxer a `lib/pairing/methods/` i una
  branca a `engine.ts`.
- Classificació filtrada per fase (`loadStandings({ phaseId })`).
- Registre de desempats (spread, victòries, Buchholz) vàlid per a la lliga.
- Exclusions per etiqueta i per parella d'inscripcions.

## 4. Què no encaixa (els buits reals)

### 4.1 Qui juga cada fase — *el buit principal*

Avui **totes les inscripcions actives juguen totes les fases**
(`generate/route.ts` passa `loadEntrants()` sencer al motor). L'únic tall
existent és `topN` del Rei del turó, intern al mètode.

Proposta:

- Columna `phases.entry_source` (JSON):
  `{ kind: 'all' } | { kind: 'top', fromPhaseId, n }`.
- Taula `phase_entries(phase_id, entry_id, seed)`: **instantània** dels
  classificats, creada amb una acció «Classificar i sembrar» en començar la
  fase. Es pot refer mentre la fase no tingui cap partida.
- `generate/route.ts`: si la fase té `phase_entries`, filtra els entrants.

Per què instantània i no calculada al vol: l'admin pot corregir resultats en
qualsevol moment (§15.7 de `pla-rols.md`). Si el quadre es recalculés, una
correcció a la lliga podria moure jugadors dins d'un quadre ja jugat. No
contradiu «la classificació no es desa»: el que es desa és una **decisió**
(qui s'ha classificat i amb quin cap de sèrie), no punts acumulats.

Bonus: serveix per a qualsevol «final a 8» amb Suís o Round Robin, i pot
substituir `topN` del Rei del turó.

### 4.2 Calendari sortejat d'entrada vs. aparellament ronda a ronda

Tot el motor aparella **una ronda cada vegada**. La lliga Champions necessita
el calendari sencer abans de començar (si no, les darreres rondes poden quedar
sense solució: cal que tothom acabi amb k rivals de cada bombo i cap
repetició).

Proposta: acció «Fer el sorteig» a la fase, que desa el calendari a
`config.draw = { seed, drawnAt, rounds: [[entryA, entryB], …][] }`. La
generació de cada ronda només llegeix `draw.rounds[ronda relativa]`. Es manté
intacte el cicle de vida de la ronda (esborrany, visibilitat, CSV, tancament).
Avantatge per a lligues de club de setmanes: tothom sap el calendari des del
primer dia.

### 4.3 Presència i absències

Amb calendari fix, un absent **no es pot treure de l'aparellament** (seria
desfer el sorteig). Cal decidir: o la partida es crea igual i l'admin la
resol com a no presentat (`forfeitPoints`), o queda ajornada (sense resultat)
fins que es jugui. Per a aquest mètode, la pregunta «hi seràs a la ronda
següent?» s'ha d'amagar o canviar de sentit.

> El Round Robin actual ja té aquest problema: `bergerSchedule()` es calcula
> sobre els presents, així que una absència canvia tot el calendari
> (rivals repetits o saltats). A més, `loadEntrants()` no té `ORDER BY`.

### 4.4 Eliminatòries

No existeix cap mètode d'eliminació. Cal:

- **Quadre com a funció pura**: a partir de `phase_entries.seed` i les
  partides prèvies de la fase (`previousMatches` ja porta `phaseId`, `ranks` i
  `roundNumber`), es deriva qui passa i qui toca. No cal desar el quadre.
- **Partides per eliminatòria**: `gamesPerTie` (1, 2 = anada/tornada, 3 = al
  millor de 3…) i `finalGamesPerTie`. Cada partida és una ronda; l'etapa es
  dedueix de la ronda relativa. L'UI ha de proposar `endRound`.
- **Empats**: a Scrabble i escacs n'hi ha. Ordre proposat: victòries a
  l'eliminatòria → diferència de punts acumulada (spread) → decisió de l'admin
  (partida de desempat). Una partida única empatada deixa l'eliminatòria
  «pendent de decidir» i bloqueja la ronda següent.
- **Byes** quan N no és potència de 2: als caps de sèrie, sense crear
  partida (o amb partida de bye que no puntuï).
- **Classificació**: una taula de punts no té sentit en una eliminatòria. La
  fase `knockout` ha de quedar fora de la classificació general i tenir vista
  de quadre pròpia.

### 4.5 Classificació de la lliga

- **Zones de color** (directe / eliminatòria prèvia / eliminat), deduïdes
  de l'`entry_source` de la fase següent; no cal configurar-les a part.
- **Puntuació 3-1-0**: avui no és expressable. `distributePoints()` reparteix
  les posicions empatades: amb `[3, 0]`, un empat dona 1,5, no 1. Per a
  Scrabble/escacs (1 – 0,5 – 0) no cal tocar res. Si es vol futbol pur, caldria
  un `drawPoints` opcional a `ScoringConfig`.

## 5. Algorisme del sorteig

Paràmetres: `pots` (P), `gamesPerPot` (k). Rondes = P·k (ha de ser ≤ N−1).

**Cas estructurat** (N = P·m, m parell): a nivell de bombos, cada ronda és un
emparellament de bombos (A–B, C–D) o «cada bombo amb ell mateix»; repetint
cada configuració k vegades, cada bombo s'enfronta k vegades a cada bombo.
Dins de cada bloc:

- Bombo contra bombo: k permutacions disjuntes (files d'un quadrat llatí
  aleatori) → k emparellaments perfectes sense repetició.
- Bombo contra ell mateix: k rondes de Berger sobre el bombo barrejat.

**Cas general** (N arbitrari, protecció per etiqueta): cerca amb retrocés
ronda a ronda amb comptadors «rivals que falten de cada bombo», reintents amb
llavor nova. Per a N < 100 és instantani. Els forats s'omplen amb jugadors
fantasma als bombos baixos: qui en toca un fa bye.

La llavor es desa: el sorteig és reproduïble i auditable.

## 6. Canvis d'esquema i de tipus

- `PairingMethod`: `+ 'league_draw' | 'knockout'`.
- `LeagueDrawConfig { pots, gamesPerPot, potSource: 'rating' | 'phase',
  potFromPhaseId?, clubTagIds, maxSameTagOpponents, draw? }`.
- `KnockoutConfig { gamesPerTie, finalGamesPerTie, tieBreak, bracket:
  'standard' }`.
- `phases.entry_source` (JSON) i taula `phase_entries`.
- Migració nova (`db/migrations/0008_*`), no destructiva.

## 7. Ordre de feina proposat

1. **Participants per fase** (`entry_source` + `phase_entries` + acció de
   sembrar + filtre a la generació). Útil per si sol.
2. **Mètode `league_draw`**: sorteig, desat a la fase, generació per ronda,
   formulari a Fases, comportament de presència.
3. **Zones a la classificació** de la lliga.
4. **Mètode `knockout`**: quadre pur, validació d'empats al resultat, vista de
   quadre, exclusió de la classificació general.
5. **Plantilla «Format Champions»** a Fases: crea les dues fases d'un cop amb
   rangs de rondes calculats.

Els passos 1 i 2 ja permeten jugar la lliga; el 4 és el més llarg.

## 8. Decisions pendents

- Absent en calendari fix: no presentat o ajornament?
- Empat en una eliminatòria: spread, partida extra o decisió manual?
- N arbitrari: acceptar byes amb fantasmes o exigir un N compatible?
- Quadre: sembrat estàndard (1–32, 16–17…) o sorteig per parelles com la UEFA?
- Cal la puntuació 3-1-0?
