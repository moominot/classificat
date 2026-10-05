# Pla: gestió d'usuaris i rols

> Document viu. S'hi van afegint requisits a mesura que es defineixen.
> **Estat: en redacció — encara no s'ha implementat res.**
>
> **Premissa (2026-09-07):** les dades i l'estructura actuals són de prova i prescindibles.
> No cal mantenir compatibilitat cap enrere ni migrar res: es pot redissenyar l'esquema
> lliurement si això fa una aplicació millor. L'usuari avisarà quan es publiqui de manera
> efectiva; a partir d'aquell moment sí que caldran migracions.

## 1. Rols definits

| Rol | Abast |
|-----|-------|
| **superadmin** | Gestió completa de l'aplicació (tots els campionats, tots els usuaris, configuració global). |
| **admin** | Gestió dels **seus** campionats (els que li pertanyen o li han assignat). |
| **user** | Només pot enviar resultats i modificar les seves preferències personals. |

## 2. Com està ara (punt de partida)

- Taula única `directors` (`id`, `username`, `passwordHash`, `name`, `isActive`, `createdAt`) — **sense columna de rol**.
- Sessió `iron-session` binària: `SessionData = { isDirector, directorId, directorName }`. O ets director o no ets res.
- **No hi ha cap vincle entre director i campionat**: qualsevol director gestiona tots els campionats.
- **L'API pràcticament no està protegida**: de 23 rutes, només `GET /api/directors` comprova sessió.
  `POST /api/directors`, `PATCH/DELETE /api/directors/[id]` i tot `/api/tournaments/**` són oberts.
  El control de rol viu només a la UI (`useIsDirector()` amaga botons).
- Preferències: només tema, desat en una **cookie de dispositiu** (`theme`), no lligat a cap usuari.
- Sembra inicial: si la taula `directors` és buida i hi ha `DIRECTOR_PASSWORD`, crea l'usuari `director`.
- Migracions: SQL imperatiu dins `db/index.ts` (CREATE TABLE IF NOT EXISTS + ALTER TABLE condicionals). No hi ha fitxers de migració versionats.

## 3. Model de dades previst

### 3.1 Taula d'usuaris
Taula `users` neta, substituint `directors` (no cal conservar-la: vegeu la premissa). Camps:

- `role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('superadmin','admin','user'))`
- Sense migració de dades: es recrea la base de dades i se sembra un `superadmin` inicial.

### 3.2 Propietat dels campionats
Cal decidir entre (o combinar):
- `tournaments.owner_id` → un admin propietari, o
- taula `tournament_admins (tournament_id, user_id)` → diversos admins per campionat.

### 3.3 Preferències personals
Passar de cookie de dispositiu a preferències per usuari (taula `user_preferences` o columna JSON a `users`), amb la cookie com a *fallback* per a visitants no autenticats.

## 4. Capa d'autorització (imprescindible)

Crear un únic punt de control a `lib/` (p. ex. `lib/authz.ts`) i fer-lo servir a **totes** les rutes:

- `getCurrentUser(req)` → `{ id, name, role } | null`
- `requireRole('superadmin' | 'admin' | 'user')`
- `requireTournamentAccess(userId, tournamentId)` → superadmin sempre; admin només els seus.
- Respostes coherents: 401 (no autenticat) vs 403 (autenticat però sense permís).

Repassar les 23 rutes una per una i assignar-hi el guard que toca. Els `GET` públics (classificació, aparellaments) es mantenen oberts de manera explícita, no per omissió.

## 5. Punts pendents de definir

- [x] **Enviament de resultats — resolt al punt 15**: sense autenticació. El jugador es tria d'un desplegable, amb "Visitant" (només lectura) per defecte.
- [ ] **Vincle `user` ↔ `player`**: un usuari es correspon amb un jugador d'un campionat? Un usuari pot jugar a diversos campionats?
- [x] **Restricció d'enviament — resolt al punt 15**: només les partides del jugador triat al desplegable.
- [ ] **Alta d'usuaris**: auto-registre, invitació de l'admin, o només els crea el superadmin?
- [ ] **Qui crea els admins**: només el superadmin, imagino — confirmar.
- [ ] **Quines "preferències personals" hi haurà** a banda del tema.
- [ ] **Bootstrap del superadmin**: com es crea el primer compte (variable d'entorn, ordre de consola, primer registre?).

## 6. Ordre de treball proposat

1. Esquema: columna `role` + propietat de campionats + migració de dades existents.
2. Sessió: substituir `isDirector` per `{ userId, name, role }` (mantenint compatibilitat en el desplegament actual).
3. `lib/authz.ts` + aplicar guards a les 23 rutes d'API. **Aquest pas tanca el forat de seguretat actual.**
4. UI: `DirectorContext` → `UserContext` amb rol; menús i botons segons rol.
5. Pantalla d'usuaris (`/directors` → `/usuaris`): el superadmin gestiona tothom, l'admin no hi entra.
6. Preferències per usuari.
7. Flux del rol `user` (login, enviament de resultats) — depèn de les decisions del punt 5.

---

## 7. Navegació i visualització (mockups ManaCup)

Referència: mockups aportats el 2026-09-07 (dashboard d'escriptori + dues pantalles de mòbil).
Principi rector: **app senzilla, clara i pensada primer per a mòbil**, sobretot per al rol `user`.

### 7.1 Problema actual: el "chrome" es menja la pantalla

Avui, dins d'un campionat, s'apilen **quatre bandes** abans del contingut:

1. Capçalera global (`app/layout.tsx`): logo + "Gestió de campionats de Scrabble" + Preferències + Usuaris + sessió — 56 px fixos i enganxats (`sticky`).
2. Breadcrumb "Campionats / *nom*" (`app/campionat/[id]/layout.tsx`).
3. `<h1>` amb el nom del campionat (dins `NavTabs.tsx`).
4. Barra de pestanyes amb *scroll* horitzontal: Jugadors · Grups · Fases · Rondes · Classificació (+ Preguntes si és director).

Al mòbil això deixa una franja útil molt petita, i repeteix el nom del campionat dues vegades (breadcrumb + h1).

### 7.2 Estructura objectiu

**Mòbil (prioritari)**
- Barra superior compacta: marca + selector de competició + notificacions. Sense subtítol descriptiu.
- **Navegació inferior fixa** de 4–5 ítems, com als mockups: Inici · Rondes · Partides · Classificació · Més.
- Desapareix la barra de pestanyes horitzontal: el que hi havia passa a la nav inferior o a "Més".
- Capçalera contextual només dins d'una secció (fletxa enrere + títol de la secció, p. ex. "← Ronda 6"), no un breadcrumb permanent.
- Contingut en targetes, com als mockups (resum ràpid, propera trobada, última partida).

**Escriptori**
- Sidebar esquerra amb la navegació (com al mockup), contingut central i, si s'escau, columna dreta d'avisos.
- Selector de competició a la barra superior.

### 7.3 Diferències per rol

| | `user` | `admin` | `superadmin` |
|---|---|---|---|
| Llista de competicions | **No** — hi accedeix per invitació directa; no apareix a la navegació | Sí, **només les seves**, via desplegable a la vista de campionat | Totes |
| Selector de competició | Ocult si només en té una; si en té més d'una, mínim | Desplegable a la capçalera de la vista de campionat | Desplegable amb totes |
| Navegació | Inici · Rondes · Partides · Classificació · Més | Igual + seccions de gestió (Jugadors, Grups, Fases, Preguntes) | Igual + administració global |
| Acció principal | Enviar resultat de la seva partida | Gestionar la competició | Gestionar app i usuaris |

- El `user` entra directament al context de la seva competició: **cap pantalla intermèdia de "tria competició"**.
- Les seccions de gestió (Jugadors, Grups, Fases, Preguntes) no ocupen lloc a la nav principal del `user`; per a l'`admin` viuen sota "Més" o una secció "Gestió".
- La ruta actual `/` (graella de campionats) passa a ser d'`admin`/`superadmin`. Per al `user`, `/` redirigeix a la seva competició.

### 7.4 Impacte al codi (per quan toqui implementar)

- `app/layout.tsx` — capçalera prima; treure el subtítol i els enllaços de text (Preferències, Usuaris) cap al menú d'usuari / "Més".
- `app/campionat/[id]/layout.tsx` — eliminar el breadcrumb; el nom del campionat passa al selector.
- `app/campionat/[id]/NavTabs.tsx` — substituir per un component de navegació dependent del rol i del dispositiu (nav inferior a mòbil, sidebar a desktop).
- Nou component: selector de competició (les competicions visibles depenen del rol → depèn del punt 3.2, propietat dels campionats).
- `app/page.tsx` — redirigir segons rol.
- El `user` necessita una vista d'inici pròpia (resum: propera partida, posició, últimes partides) que **encara no existeix**.

### 7.5 Pendents d'aquest bloc

- [ ] Confirmar els 4–5 ítems definitius de la nav inferior per a `user` i per a `admin`.
- [ ] Els mockups mostren funcionalitats que **avui no existeixen** a la base de dades: Anuncis/Notícies, Trobades (calendari, lloc, confirmació d'assistència), Estadístiques i perfil de jugador amb foto. Cal decidir si entren en aquest bloc o van a part.
- [ ] Mecanisme d'invitació directa del `user` a una competició (enllaç amb token? codi? QR ja existent?).
- [ ] Què passa si un `user` és convidat a més d'una competició.

---

## 8. Control de visibilitat en temps real (panell d'admin)

L'`admin` ha de tenir **control total, en temps real, del que veu el `user`**.

### 8.1 Punt de partida: avui no hi ha control de visibilitat

- L'únic estat que existeix és `rounds.isComplete` / `phases.isComplete`, i **és un pany d'edició, no de visibilitat**: bloqueja generar aparellaments, importar CSV i registrar resultats (`.../generate`, `.../import`, `.../result`, `.../csv`). No amaga res a ningú.
- Tot el contingut és **públic i immediat**: aparellaments, resultats i classificació es veuen tan bon punt es desen. `GET /api/tournaments/[id]/standings` no comprova sessió.
- Conseqüència: no es pot reutilitzar `isComplete` per a la visibilitat sense barrejar dos conceptes. Calen camps nous.

### 8.2 Model d'estats proposat

**Ronda** — separar *pany d'edició* i *visibilitat*:

- `status`: `draft` (només admin) → `open` (visible, s'accepten resultats) → `closed` (visible, no s'accepten resultats).
- `pairingsVisible`: si el `user` veu els aparellaments abans que la ronda s'obri.
- `resultsVisible`: si el `user` veu els resultats introduïts mentre la ronda és oberta.
- `isComplete` es manté com a pany d'edició, o s'absorbeix dins `status` (decidir en implementar; sense dades a migrar, es pot triar el disseny més net).

**Classificació** — opció per competició (i possible sobreescriptura per fase):

- `live` — es recalcula i es mostra a l'instant.
- `closed_rounds` — només compta i mostra les rondes tancades (**per defecte**).
- `hidden` — el `user` no veu classificació.

**On es desa**: columna `visibility` (JSON) a `tournaments` per als valors per defecte de la competició + columnes pròpies a `rounds` per a l'excepció puntual.

### 8.3 Aplicació al servidor, no a la UI

La visibilitat s'ha de filtrar **a l'API i al render del servidor**, no amagant components:

- `GET .../standings` respecta el mode de classificació segons el rol de qui pregunta.
- `GET` d'aparellaments/resultats filtra les rondes `draft` per a `user`.
- L'`admin` sempre ho veu tot, amb un indicador visual clar de què està publicat i què no (p. ex. una insígnia "Ocult per als jugadors").

### 8.4 Què vol dir "temps real"

Cal decidir el mecanisme; l'app és Next.js amb SQLite i render de servidor:

1. **Refresc en navegar** (el que hi ha ara) — el `user` ha de recarregar. Insuficient.
2. **Polling** cada X segons a les vistes de ronda i classificació — simple, robust, suficient per a un campionat.
3. **SSE** (`text/event-stream`) des d'una ruta d'API — actualització instantània, més codi.

Recomanació: **polling** a les vistes que ho necessiten (ronda activa i classificació) i deixar SSE per si es queda curt. Cal comptar que hi ha diverses connexions SQLite (vegeu el comentari de `busy_timeout` a `db/index.ts`).

### 8.5 Panell d'admin (PC i mòbil)

Peça de primer nivell, no una pàgina de configuració amagada. Ha de funcionar bé **des del mòbil durant la competició**.

- **Estat d'un cop d'ull**: ronda actual, quantes partides tenen resultat, què està publicat.
- **Interruptors ràpids**: obrir/tancar ronda, publicar aparellaments, publicar resultats, mode de classificació. Un toc, efecte immediat, confirmació visible.
- **Vista prèvia "com a jugador"**: veure exactament el que veu un `user` ara mateix. Evita publicar sense voler.
- Al mòbil: accessible en un toc des de qualsevol pantalla de la competició (no enterrat sota "Més").
- Al PC: pot conviure amb la sidebar com a secció pròpia.

### 8.6 Pendents d'aquest bloc

- [ ] Els valors per defecte: ronda nova neix `draft` o `open`? Classificació per defecte `closed_rounds`?
- [ ] La visibilitat es configura per competició, per fase o per ronda (o les tres, amb herència)?
- [ ] Quan una ronda és `draft`, el `user` ha de poder enviar el resultat igualment (perquè juga) o no veu res fins que s'obre?
- [ ] Un `user` veu els resultats de les altres taules en temps real, o només el seu fins que tanca la ronda?
- [ ] Cadència del polling i quines vistes l'activen.

---

## 9. Navegació adaptativa: el `user` no veu seccions buides

Al `user` només se li mostren les seccions que **tenen contingut visible per a ell**. Si un campionat no té grups, la secció Grups no existeix per a ell; igual amb fases, rondes o classificació.

### 9.1 Regla clau: "amb informació" = visible per a *aquest* usuari

No n'hi ha prou de mirar si la taula té files: cal creuar-ho amb la visibilitat del punt 8.
Exemple: hi ha 6 rondes a la base de dades però totes són `draft` → per al `user`, la secció Rondes **no apareix**.

| Secció | Condició per mostrar-la al `user` |
|---|---|
| Grups | El campionat té ≥ 1 grup **i** els jugadors hi estan repartits |
| Fases | El campionat té més d'una fase (amb una de sola, no aporta res) |
| Rondes | Hi ha ≥ 1 ronda visible per a ell (`status` ≠ `draft`) |
| Classificació | El mode de classificació no és `hidden` **i** hi ha alguna ronda que hi computi |
| Jugadors | Sempre (mínim: la llista de participants) — confirmar |
| Preguntes | Mai (és configuració d'`admin`) |

L'`admin` i el `superadmin` **sempre veuen totes les seccions**, encara que siguin buides: les necessiten precisament per omplir-les. La secció buida els mostra un estat buit amb l'acció per crear-hi contingut.

### 9.2 Com s'ha de fer

- Calcular la visibilitat **una sola vegada al layout del campionat** (`app/campionat/[id]/layout.tsx`), en una consulta agregada de comptatges, i passar-la a la navegació. Evitar una consulta per pestanya.
- **Amagar de la navegació no és protegir**: les rutes de les seccions amagades han de respondre amb `notFound()` o redirecció per al `user`, no només desaparèixer del menú.
- La navegació inferior del mòbil té places fixes (4–5). Si una secció desapareix, la resta no ha de ballar de lloc entre pantalles: definir un ordre estable i que els forats es col·lapsin de manera previsible.
- Cas límit: si al `user` només li queda una secció visible, la navegació inferior sobra — anar directament al contingut.

### 9.3 Pendents d'aquest bloc

- [ ] Confirmar la taula de condicions de 9.1, especialment Jugadors i Fases.
- [ ] Amb 0 seccions visibles (competició acabada de crear i encara sense publicar res), què veu el `user`: una pantalla d'espera del tipus "El campionat encara no ha començat"?
- [ ] Quan apareix una secció nova enmig de la competició, cal avisar el `user` d'alguna manera?

---

## 10. Conseqüències de poder redissenyar l'esquema

Amb la premissa del capçal (dades actuals prescindibles fins que l'usuari avisi de la publicació), el pla canvia d'estratègia: **un sol redisseny net de l'esquema abans de tocar la interfície**, en comptes d'anar afegint columnes a l'existent.

### 10.1 Què es pot fer bé des del principi

- `users` amb `role` de sèrie, i la relació usuari ↔ campionat ↔ jugador definida des del primer moment (no encaixada a posteriori).
- Estats de ronda i visibilitat (punt 8) modelats directament, sense arrossegar el doble sentit actual de `isComplete`.
- Entitats noves dels mockups (anuncis, trobades) previstes a l'esquema encara que s'implementin després, perquè no obliguin a un segon redisseny.
- Noms i tipus coherents (`tournaments` vs "campionat" vs "competició" — triar-ne un i mantenir-lo).

### 10.2 Deute tècnic que convé resoldre en el mateix moviment

`drizzle.config.ts` apunta a `./db/migrations`, **però aquesta carpeta no existeix**: les migracions reals són SQL imperatiu dins `db/index.ts` (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE` condicionals, transaccions de reparació de `phases` i `rounds`). Aquest patró ja ha donat problemes (dos dels últims commits són arreglar migracions).

Ara és el moment de passar a **migracions versionades de `drizzle-kit`**: `db/index.ts` es queda només amb obrir la connexió, els *pragmas* i la sembra inicial. A partir de la publicació efectiva, això deixa de ser opcional.

### 10.3 Ordre de treball revisat

El punt 6 queda substituït per:

1. **Redisseny complet de l'esquema** (usuaris + rols + propietat + estats de visibilitat) i pas a migracions de `drizzle-kit`. Base de dades de zero.
2. Sessió amb `{ userId, name, role }` i `lib/authz.ts` amb els guards a totes les rutes.
3. Filtratge de visibilitat al servidor (punt 8.3).
4. Nova navegació per rol, mòbil primer (punts 7 i 9).
5. Panell d'admin amb interruptors i vista prèvia "com a jugador" (punt 8.5).
6. Vista d'inici del `user` i flux d'invitació.
7. Preferències per usuari.
8. Entitats dels mockups (anuncis, trobades, estadístiques) — segons què es decideixi al punt 7.5.

---

## 11. Classificacions modulars i obertura a altres jocs (valoració)

### 11.1 Diagnòstic: els aparellaments són modulars, la classificació no

**`lib/pairing/` sí que ho és.** `engine.ts` és un orquestrador que fa *dispatch* per `phase.method` cap a `methods/*.ts`, i cada mètode té la seva configuració pròpia en una unió discriminada (`PhaseConfig`) desada com a JSON a `phases.config`. Afegir un sistema d'aparellament nou = afegir un fitxer a `methods/` i una branca al `switch`. Aquesta és la peça bona del projecte i el patró a replicar.

**`lib/pairing/standings.ts` no ho és.** Té les regles cablejades a dins:

- Puntuació fixa: victòria = 1, empat = 0,5, derrota = 0, bye = 1. No es pot configurar (ni tan sols un 3-1-0).
- `spread` (diferència de punts de fitxa) és un camp de primera classe de `Standing` — **és específic de l'Scrabble**.
- `TiebreakerValues` és una estructura tancada de 8 camps i `Tiebreaker` una unió tancada de 8 cadenes: afegir-ne un obliga a tocar el tipus, l'estructura, el càlcul i el comparador.
- `Standing` té columnes fixes; la taula de classificació no és configurable.

### 11.2 La meitat de la feina ja està feta i potser no ho sabíem

La taula `question_definitions` **ja és un sistema modular de captura de dades** per competició: preguntes amb `scope` (`match` | `player`), `type` (`value` | `wordvalue` | `image`), `answerType` i — clau — **`showInRanking`**.

És a dir: ja hi ha un mecanisme per dir "aquesta dada es captura i surt al rànquing". El que falta és tancar el cercle: **la classificació hauria de derivar de les respostes a les preguntes**, no d'uns camps fixos de Scrabble. Aquesta és la via natural cap a la modularitat, sense inventar cap sistema de connectors nou.

### 11.3 Disseny proposat

1. **Regles de puntuació com a configuració**, no com a codi: `{ win: 1, draw: 0.5, loss: 0, bye: 1, forfeit: 0 }` per competició (i sobreescriptura per fase). Cobreix escacs, futbol 3-1-0, lligues amb punt de bonificació, etc.
2. **Registre de desempats** en comptes d'una unió tancada. Cada desempat és un mòdul `{ key, label, higherIsBetter, compute(ctx) }` registrat en un índex, igual que `methods/` als aparellaments. Afegir-ne un = afegir un fitxer.
3. **Mètriques com a bossa oberta**: `Standing.metrics: Record<string, number>` en lloc de camps fixos. `spread`, `bingos` i `avgScore` deixen de ser especials i passen a ser mètriques derivades.
4. **Agregació declarada a la pregunta**: afegir a `question_definitions` un camp `aggregate` (`sum` | `avg` | `max` | `count` | `none`) i `usableAsTiebreaker`. Amb això, "Bingos" o "Millor jugada" es converteixen automàticament en columna de rànquing i en desempat, **sense tocar codi**.
5. **Nucli comú mínim** que tot joc comparteix: resultat ordinal (`win`/`draw`/`loss`) + puntuació numèrica opcional per banda. La resta, mètriques configurables.

Amb això, l'Scrabble deixa de ser un cas especial i passa a ser **una configuració per defecte**.

### 11.4 El límit real no és la classificació: és el model de partida

Aquí hi ha la decisió important, i s'ha de prendre **ara**:

`pairings` té `player1Id` i `player2Id`. Tot el motor assumeix **1 contra 1**. Amb el disseny de 11.3 s'obren de bat a bat els jocs 1v1 (escacs, dames, tennis taula, Magic, Go...) a cost baix. Però **no** s'obren:

- jocs de 3–4 jugadors per taula (molts jocs de taula moderns),
- competicions per equips,
- formats de marcador individual sense enfrontament (torneigs de puntuació, contrarellotges).

Per cobrir-los cal `pairings` → **`matches` + `match_participants`** (una fila per participant, amb la seva posició i puntuació). És un canvi que **avui és barat i després serà caríssim**, perquè hi pengen el motor d'aparellaments, els resultats, la classificació i la UI.

### 11.5 Valoració i recomanació

**Sí a la classificació modular.** El cost és moderat, el patró ja existeix al projecte (`methods/`), aprofita `question_definitions` en comptes de duplicar-lo, i elimina el cablejat d'Scrabble que ara mateix impedeix qualsevol altre joc. Encaixa perfectament amb el redisseny d'esquema del punt 10.

**Compte amb passar-se de genèric.** Un sistema que ho admet tot no el configura ningú. La proposta es manté ancorada a estructures que ja hi són (preguntes, fases, desempats) en comptes d'obrir un motor de regles buit.

**Sobre altres jocs, dues opcions:**

- **A — Obrir a 1v1 genèric (recomanada).** Fer 11.3 i deixar `pairings` com està. Cobreix la gran majoria de jocs de competició, cost contingut, i l'Scrabble hi queda com a perfil per defecte.
- **B — Obrir a N participants.** A + el canvi de `matches`/`match_participants`. Molta més feina i afecta el motor d'aparellaments sencer. **Només val la pena si realment es vol arribar a jocs multijugador o per equips** — però si aquesta és la intenció, s'ha de decidir abans de tocar l'esquema, no després.

### 11.6 Pendents d'aquest bloc

- [x] **Decidit: opció B** (2026-09-07) — model de N participants i equips. Vegeu el punt 12.
- [ ] Fins on ha d'arribar la configuració: es reconfigura per competició, o hi ha "perfils de joc" predefinits (Scrabble, escacs, genèric) que l'admin tria i després ajusta?
- [ ] Qui pot definir un perfil de joc nou: només el `superadmin`?
- [ ] Les columnes visibles del rànquing són configurables per l'admin, o es dedueixen de les preguntes amb `showInRanking`?

---

## 12. Opció B: partides de N participants, equips i abast de la classificació

**Decisió presa (2026-09-07): opció B.** L'aplicació ha de poder gestionar competicions més enllà de l'1 contra 1.

### 12.1 Aclariment: preguntes ≠ desempats (però s'han de connectar)

Són dues coses diferents que avui no es parlen:

| | Què és | On viu avui | Estat |
|---|---|---|---|
| **Desempats** | Criteri d'**ordenació** de la classificació | `phases.tiebreakers` (llista de claus) | Funciona, però la llista de claus possibles és tancada al codi |
| **Preguntes** | Quines **dades es capturen** de cada partida | `question_definitions` + `pairing_answers` | Es capturen i es desen, però **no s'agreguen a la classificació** |

`question_definitions.showInRanking` ja existeix a la taula, però `computeStandings()` no en fa cas: les columnes del rànquing són camps fixos d'Scrabble.

**La connexió que falta:** si cada pregunta declara com s'agrega (`sum`, `avg`, `max`, `count`), la seva agregació esdevé una **mètrica** del jugador. I aleshores un desempat és simplement *"ordena per la mètrica X"*. Resultat: "desempat per bingos" o "per millor jugada" es **configura**, no es programa. Avui, afegir un desempat obliga a tocar `types.ts`, `tiebreakers.ts`, `standings.ts` i el comparador.

### 12.2 Model de partida amb N participants

`pairings` (amb `player1Id` / `player2Id`) se substitueix per:

- **`matches`** — la partida: ronda, taula, estat, dades comunes (lloc, comentaris, hora).
- **`match_participants`** — una fila **per participant**: `matchId`, `entrantId`, `seat` (ordre a la taula), `score`, `outcome`, `rank` (posició dins la partida, per a jocs de 3–4 on no hi ha només guanyador/perdedor).

Amb això, l'1v1 és el cas particular de dues files, i no es perd res del que hi ha ara.

### 12.3 Qui competeix: sempre el jugador

Amb la decisió (b) del punt 12.4, **qui competeix és sempre un jugador**: `match_participants` apunta a `players`. No cal una capa d'abstracció genèrica 'entrant' — seria complexitat sense ús. Els equips són una capa d'**agrupació** que només alimenta la classificació:

- `teams` — equips de la competició (nom, grup, etc.).
- `team_members` — jugadors que formen cada equip.
- El motor de `lib/pairing/` continua aparellant jugadors i no ha de saber res dels equips.

Si algun dia calgués el model (a) —partides equip contra equip—, caldria tornar a obrir aquesta decisió; queda documentat que s'ha descartat conscientment.

### 12.4 Dos sentits de "classificació d'equip" — **decidit: (b)**

Aquesta distinció és important i no és òbvia:

- **(a) Equip contra equip** — la partida és entre dos equips i el resultat és de l'equip. Model: l'*entrant* és l'equip. (Futbol, lligues per equips.)
- **(b) Individual que suma per a l'equip** — es juga individualment, però els resultats s'agreguen en una classificació d'equips paral·lela. Model: l'*entrant* és el jugador, i la classificació d'equip és una **agregació** dels seus membres. (Lligues d'escacs per equips, la majoria de campionats de club.)

**Decisió (2026-09-08): opció (b).** Es juga sempre individualment; la classificació d'equips és una agregació dels resultats dels membres. Vegeu el desenvolupament al punt 12.9.

### 12.5 Abast de la classificació

La classificació passa a tenir un **abast** configurable, i la fase el declara:

- `global` — tots els participants junts.
- `group` — una classificació per grup.
- `team` — classificació d'equips, per agregació dels resultats dels membres (12.9).

Poden conviure diverses classificacions alhora en una mateixa competició (p. ex. general + per grup + per equips), cadascuna amb els seus desempats.

### 12.6 Herència en crear una fase nova

En crear una fase, ha d'**heretar** de l'anterior i deixar-ho tot modificable:

- Ordre dels desempats.
- Abast de la classificació (`global` / `group` / `team`).
- Regles de puntuació.
- Columnes visibles del rànquing.

Per defecte hereta; l'admin ajusta el que vulgui. Evita reconfigurar-ho tot a cada fase i redueix errors.

### 12.7 Configuració visual dels desempats

Els desempats s'ordenen **arrossegant-los** (*drag & drop*), no amb desplegables numerats:

- Llista vertical ordenable amb els desempats actius; els disponibles, a part, per afegir-los.
- Ha de funcionar **també amb el dit al mòbil** (no només amb ratolí): nansa d'arrossegament prou gran, o botons de pujar/baixar com a alternativa accessible.
- Mostrar en text pla la regla resultant ("1r punts, 2n spread, 3r Buchholz") perquè es vegi l'efecte sense haver-ho de deduir.
- La llista de desempats disponibles surt del **registre** del punt 11.3, i inclou les mètriques derivades de preguntes (12.1).

### 12.8 Impacte i pendents

L'opció B afecta tot el que hi ha construït: `lib/pairing/` (tipus, motor i els cinc mètodes), `standings.ts`, les rutes d'API de rondes i resultats, l'assistent de resultats i les vistes de ronda i classificació. És **el bloc de feina més gran del pla** i s'ha de fer al principi, dins del redisseny d'esquema del punt 10.

- [x] **Decidit (2026-09-08): puntuació només per posició**, sense enfrontaments creuats. Vegeu 12.10.
- [ ] Els mètodes d'aparellament actuals (suís, round robin, KOTH) assumeixen parelles: quins s'han de generalitzar a N i quins es queden en 1v1?
- [ ] Un jugador pot ser a més d'un equip dins la mateixa competició?
- [ ] Regla d'agregació per defecte de la classificació d'equips (vegeu 12.9).
- [ ] Els equips tenen grups propis, o hereten els dels jugadors?

### 12.9 Classificació d'equips per agregació

Es juga individualment i els resultats sumen per a l'equip. Detalls que cal resoldre:

**Regla d'agregació** — configurable per fase, com la resta:

- `sum` — suma de tot el que fan els membres. Injust si els equips tenen mides diferents.
- `avg` — mitjana per membre. Neutralitza la diferència de mida.
- `top_n` — només compten els N millors membres (habitual a les lligues per equips: "compten els 4 millors").

Amb `sum` com a valor per defecte i `top_n` disponible quan els equips no són iguals.

**Instantània de l'equip a la partida** — `match_participants` ha de desar **l'equip del jugador en el moment de la partida**, no només la pertinença actual a `team_members`.

Motiu: si un jugador canvia d'equip a mitja competició i la classificació es calcula amb la pertinença actual, els seus resultats antics se'n van amb ell i **es reescriu la història**. Amb la instantània, cada resultat es queda a l'equip amb què es va jugar. És una columna barata ara i un mal de cap si s'afegeix després.

**Mètriques** — les mètriques d'equip surten de la mateixa agregació que les individuals (punt 12.1): si "bingos" és una mètrica de jugador, l'equip en té la suma o la mitjana segons la regla. No cal definir-les dues vegades.

**Desempats d'equip** — el registre de desempats (11.3) s'ha de poder aplicar també a l'àmbit d'equip; alguns (Buchholz, encontre directe) tenen sentit i altres no. Cada desempat declara a quins àmbits és aplicable (`global` / `group` / `team`).

### 12.10 Puntuació per posició

A les partides de N participants, el resultat és **la posició a la taula**. No es calculen enfrontaments creuats entre els participants d'una mateixa partida.

- `match_participants.rank` és **el resultat primari** (1r, 2n, 3r...). `score` continua sent la puntuació bruta del joc (fitxes, gols, punts), i serveix per a mètriques i desempats, no per repartir punts.
- Els punts de classificació surten d'una **taula de posicions** configurable per fase: `[1r → 3, 2n → 2, 3r → 1, 4t → 0]`, o el que calgui.
- `outcome` (`win` / `draw` / `loss`) passa a ser **derivat**, no introduït: a l'1v1, posició 1 = victòria i posició empatada = empat. Es manté per compatibilitat amb les vistes i els desempats existents.

**Unificació que això permet:** l'1v1 deixa de necessitar regles pròpies. La configuració "victòria = 1, empat = 0,5, derrota = 0" del punt 11.3 no és res més que la taula de posicions `[1r → 1, 2n → 0]` amb la regla d'empat. **Un sol mecanisme** cobreix Scrabble, escacs, futbol 3-1-0 i un joc de taula de quatre jugadors.

**Empats de posició — decidit (2026-09-08): es reparteixen els punts de les posicions empatades.**

Els jugadors empatats sumen la mitjana dels punts de les posicions que ocupen. Exemple amb la taula `[3, 2, 1, 0]`: si dos comparteixen la 2a posició, es reparteixen els punts de la 2a i la 3a → `(2 + 1) / 2 = 1,5` cadascun; el següent jugador cau a la 4a posició i rep 0. Així el total repartit per partida es manté constant (6 punts) independentment dels empats.

Implicació tècnica: els punts de classificació **no són sempre enters**. El camp que els desa ha de ser de coma flotant (o enter multiplicat per 100), i les vistes han de formatar-los sense decimals quan no calguin ("3" i no "3,0").

**Conseqüència per als desempats basats en oponents** — Buchholz, Buchholz mediana i Sonneborn-Berger assumeixen **un oponent per ronda**. Amb N participants, els oponents d'una ronda són els altres N-1 de la taula. Cal decidir com es calculen (mitjana dels oponents de la taula? suma?) o bé declarar aquests desempats **no aplicables** quan la fase té partides de més de dos. Ho recull el punt 12.9: cada desempat declara on és aplicable.

---

## 13. Decisions pendents, ordenades

Estat a 2026-09-08: **26 punts oberts**. No tots pesen igual.

### 13.1 Bloquegen el redisseny d'esquema (cal decidir abans d'escriure cap taula)

| # | Decisió | Proposta per defecte |
|---|---|---|
| 1 | **Identitat del jugador** (§5) | **Resolt al punt 14**: registre silenciós de tres capes (`people` / `entries` / `accounts`). El compte és opcional; el jugador no s'ha de registrar mai. |
| 2 | **Entitats dels mockups**: Anuncis/Notícies, Trobades i Estadístiques entren ara o van a part? (§7.5) | Taules previstes a l'esquema ara, implementació després. Evita un segon redisseny. |
| 3 | **Invitació**: com arriba un `user` a una competició? (§7.5) | Taula `invitations` amb token d'un sol ús + enllaç compartible. Reaprofita el QR que ja existeix. |
| 4 | **Perfils de joc**: perfils predefinits (Scrabble, escacs, genèric) o configuració lliure per competició? (§11.6) | Perfils predefinits com a **plantilla inicial**; en crear la competició es copien i després es poden ajustar lliurement. |
| 5 | **Equips**: un jugador pot ser a més d'un equip? Els equips tenen grups propis? (§12.8) | Un sol equip per jugador i competició. Els equips no tenen grups propis. |
| 6 | **Visibilitat**: es configura per competició, per fase o per ronda? (§8.6) | Valors per defecte a la competició, sobreescriptura per ronda. La fase no hi intervé. |
| 7 | **Columnes del rànquing**: configurables a mà o deduïdes de les preguntes amb `showInRanking`? (§11.6) | Deduïdes de les preguntes, amb la possibilitat de reordenar-les i amagar-ne. |
| 8 | **Aparellaments a N**: quins mètodes es generalitzen? (§12.8) | Round robin i manual generalitzats a N. Suís, suís FIDE i KOTH es queden en 1v1 i no es poden triar en fases amb taules de més de dos. |

### 13.2 Bloquegen la implementació, però no l'esquema

- Valors per defecte de visibilitat: ronda nova `draft` o `open`; classificació `closed_rounds` (§8.6).
- Si el `user` pot enviar resultat amb la ronda en `draft` (§8.6).
- Si el `user` veu els resultats de les altres taules en temps real (§8.6).
- Els 4–5 ítems definitius de la navegació inferior, per rol (§7.5).
- Condicions de visibilitat de cada secció, especialment Jugadors i Fases (§9.3).
- Regla d'agregació per defecte de la classificació d'equips: `sum`, `avg` o `top_n` (§12.9).
- Alta d'usuaris (auto-registre, invitació, o només el `superadmin`) i bootstrap del primer `superadmin` (§5).

### 13.3 Es poden decidir sobre la marxa

- Cadència del polling i quines vistes l'activen (§8.6).
- Què veu un `user` amb 0 seccions visibles (§9.3).
- Si cal avisar quan apareix una secció nova (§9.3).
- Quines preferències personals hi haurà a banda del tema (§5).
- Qui pot definir un perfil de joc nou (§11.6).
- Confirmar que només el `superadmin` crea admins (§5).

---

## 14. Registre silenciós: persona, participació i compte

**Requisit (2026-09-08):** l'aplicació ha de servir tant per a campionats curts i oberts com per a competicions regulars de club amb membres fixos. El jugador **no s'ha de registrar mai**; l'admin el dona d'alta i el pot associar a un perfil del registre, de manera que les seves dades i el seu historial es relacionin entre competicions.

### 14.1 Tres capes, no una

Avui `players` barreja la persona (nom, telèfon, club) amb la seva participació en una competició, i `directors` barreja identitat i credencials. Se separen:

| Capa | Taula | Què és | Qui la crea |
|---|---|---|---|
| **Persona** | `people` | La identitat persistent: nom, àlies, foto, club, contacte. Viu per damunt de les competicions. | L'admin, en silenci |
| **Participació** | `entries` (avui `players`) | Una persona jugant una competició concreta: grup, equip, valoració inicial, activa o no. | L'admin, en inscriure |
| **Compte** | `accounts` | Credencials i rol. **Opcional**, com a molt un per persona. | Només en acceptar una invitació |

- Una persona sense compte és perfectament vàlida: juga, apareix a les classificacions i té historial. Simplement no pot iniciar sessió.
- El rol (`superadmin` / `admin` / `user`) viu al **compte**, no a la persona.
- L'historial creua competicions perquè penja de `people`, no d'`entries`.

### 14.2 Com queda el flux

1. L'admin crea una competició i hi inscriu jugadors. Per a cadascun, **cerca al registre** i, si la persona ja hi és (d'una competició anterior, del club), la vincula; si no, la crea al moment.
2. El jugador juga sense saber que existeix cap registre.
3. Si en algun moment ha d'entrar a l'app (enviar resultats, veure el seu perfil), l'admin li envia una **invitació**. En acceptar-la es crea el compte i s'enllaça a la persona que ja existeix.
4. Tot el seu historial hi és des del primer minut: **no cal fusionar res ni recuperar res**.

Això tanca també una qüestió que estava oberta: **no hi ha auto-registre**. Un compte neix sempre d'una invitació a una persona que ja consta al registre.

### 14.3 El cost real d'aquest model: els duplicats

Si els admins donen d'alta persones en silenci, **apareixeran duplicats** ("Joan M." creat dues vegades per dos admins diferents). És l'única contrapartida seriosa i s'ha de preveure des del principi, no quan ja n'hi hagi tres-cents:

- **Suggeriment en crear**: en escriure el nom, proposar coincidències del registre ("Ja existeix un Joan Martorell del Club X — és el mateix?").
- **Eina de fusió**: el `superadmin` (o l'admin propietari) pot fusionar dues persones; les `entries` de totes dues passen a apuntar a la resultant. **La fusió ha de ser possible sense tocar resultats**, cosa que el model de tres capes ja garanteix.
- No forçar cap identificador únic (ni DNI ni correu): trencaria el registre silenciós.

### 14.4 Qui veu el registre

Amb diversos admins compartint instal·lació, cal acotar-ho:

- El registre de persones és **compartit** (aquest és tot el sentit: reaprofitar perfils entre competicions i clubs).
- Les **dades de contacte** (telèfon, correu) només són visibles per als admins que tinguin aquella persona en alguna de les seves competicions. La cerca mostra nom i club, prou per vincular.
- La foto i l'àlies són públics dins l'app, com ja passa als mockups.

Nota: es desen dades de contacte de persones que mai no s'han registrat. Convé que l'app permeti **esborrar o anonimitzar una persona** conservant els resultats històrics (l'entrada queda com a jugador anònim), tant per higiene com per si algun dia cal atendre una petició.

### 14.5 Conseqüències per a l'esquema

- `players` es reanomena `entries` i perd `name`, `phone` i `club`, que passen a `people`.
- `rating` es queda a `entries` (valoració per a aquella competició); si convé, `people` pot tenir-ne una de global.
- `directors` desapareix; `accounts` té `person_id`, `username`, `password_hash`, `role`, `is_active`.
- `invitations` enllaça un token amb una `person_id` i, opcionalment, amb la competició d'origen.
- `match_participants` apunta a `entries` (la participació), no a `people`: els resultats pertanyen a la competició on es van jugar.

### 14.6 Permisos de l'admin sobre el registre — decidit (2026-09-08)

L'`admin` té sobre el registre les mateixes facultats que el `superadmin`:

- **Cercar dins tot el registre**, no només les persones de les seves competicions. (La restricció de 14.4 es manté: la cerca mostra nom, àlies i club; les dades de contacte només es veuen si té aquella persona en alguna competició seva.)
- **Fusionar duplicats.**
- **Enviar invitacions.**

**Salvaguarda necessària per a la fusió.** Fusionar és l'única acció d'aquestes tres que afecta dades d'altres admins: si dos perfils es fusionen malament, es barregen historials de competicions alienes. Per això:

- Abans de confirmar, mostrar **què s'arrossega**: quantes competicions, quantes partides i de quins organitzadors són les dues persones.
- Deixar **registre de qui fusiona i quan** (taula d'auditoria), i desar prou informació per **desfer-ho**: la fusió només reapunta `entries`, així que guardar-ne l'origen permet revertir-la.
- No fusionar mai en silenci ni de manera automàtica per coincidència de nom: la detecció només suggereix, la decisió sempre és d'una persona.

---

## 15. Usabilitat: mòbil primer, identitat per desplegable

### 15.1 Principis (LESS IS MORE)

Regles que s'apliquen a **totes** les pantalles, i contra les quals es revisa el que ja hi ha:

1. **Res de duplicats.** Avui el nom de la competició surt dues vegades seguides (breadcrumb + `<h1>`) i el nom del jugador es repeteix a la capçalera i a la classificació. Un cop, i prou.
2. **Res de decoratiu.** Fora subtítols explicatius que no informen ("Gestió de campionats de Scrabble" a cada pantalla), icones sense funció i comptadors que ningú mira.
3. **Mida de lletra**: 16 px de base al cos, mai per sota de 14 px per a dades. Els números de resultat, grans i llegibles a un pam.
4. **Res de solapaments**: capçalera enganxada i navegació inferior fixa mengen alçada per dalt i per baix; el contingut ha de reservar-los l'espai (i comptar amb la zona segura dels mòbils amb *notch*).
5. **Taules → targetes al mòbil.** Les taules amb *scroll* horitzontal són el pitjor patró possible en pantalla petita. Al mòbil, cada fila és una targeta; la taula es reserva per al PC.
6. **Una pantalla, una feina.** Si una pantalla necessita explicació, sobra alguna cosa.

### 15.2 Identitat per desplegable (sense registre)

Com que hi participen jugadors sense compte, **la identitat es tria, no s'autentica**:

- Un desplegable amb els jugadors de la competició. Per defecte, **"Visitant"** — només lectura, per a espectadors.
- En triar-se un jugador, l'app es personalitza: la seva propera partida, les seves pendents, la seva pàgina personal, i el botó d'enviar resultat de **les seves** partides.
- **La tria es recorda al dispositiu.** Aquest punt és el que decideix si el model és còmode o insuportable: si cada visita comença per "qui ets?", el desplegable és una barrera. Es tria un cop i el mòbil ho recorda; canviar-ho, a un toc.

**Sobre la suplantació.** Sabem que qualsevol pot triar el nom d'un altre. Amb competicions entre coneguts i bona fe, s'accepta. Dues mesures barates que ho deixen preparat i alhora útil des del primer dia:

- **Registrar la procedència de cada enviament**: qui es va declarar, des de quin dispositiu i quan. Permet a l'admin veure qui ha posat què i desfer-ho si cal, sense acusar ningú.
- **Un únic punt de resolució d'identitat** al codi — una funció `getViewer()` que retorna `{ kind: 'guest' | 'device' | 'account', entryId }`. Quan hi hagi comptes reals, només canvia aquesta funció: cap pantalla se n'assabenta. Això és el que fa que "deixar-ho preparat" no sigui una frase buida.

### 15.3 Pàgina personal del jugador

Accessible tant per al jugador triat com per a qui consulti un altre jugador:

- Resum d'estadístiques (les mètriques configurables del punt 11.3, no una llista fixa).
- Propera partida, destacada: rival, taula, hora, lloc.
- Partides **pendents** d'enviar resultat, amb accés directe al formulari.
- Historial de partides jugades.
- Posició i evolució a la classificació (si l'admin la té visible).

### 15.4 Pantalla única de l'admin

L'admin ha de poder fer-ho **tot** des del mòbil, i tenir **totes les dades de la competició en una sola pantalla ben estructurada**. És el panell del punt 8.5, concretat:

- **Capçalera d'estat**: ronda actual, X de Y resultats rebuts, què està publicat i què no.
- **Llista de taules de la ronda**, una línia per taula: participants, resultat o "pendent". Tocar-la obre el resultat per introduir-lo o corregir-lo. És la vista de treball durant la competició.
- **Interruptors a l'abast**: obrir/tancar ronda, publicar aparellaments, publicar resultats, mostrar o amagar classificació.
- **Avisos**: resultats que falten, jugadors sense aparellar, incoherències.
- **Vista prèvia "com a jugador"** (punt 8.5).
- La gestió de fons (jugadors, grups, fases, preguntes) **no** ocupa aquesta pantalla: viu a part, perquè es fa abans de començar, no durant.

Al PC, la mateixa informació es desplega en columnes; al mòbil, apilada. **La mateixa pantalla, no dues de diferents.**

### 15.5 Classificació i expectació

L'admin decideix si es mostra la classificació a cada ronda. El motiu no és tècnic sinó esportiu: **mantenir l'emoció fins al final** quan el guanyador no està decidit.

Als tres modes del punt 8.2 (`live`, `closed_rounds`, `hidden`) s'hi afegeix un quart, que és el que respon millor a aquesta necessitat:

- **`frozen_at` — classificació congelada.** Es mostra la classificació **tal com era en acabar la ronda N**, encara que se'n juguin de posteriors. El jugador veu una classificació real i completa, però no la que decideix el títol.

És millor que amagar-la del tot: amagar-la deixa el jugador a les fosques i genera preguntes a l'admin; congelar-la manté la informació i, alhora, el suspens. Canviar de mode ha de ser **un sol interruptor** al panell, amb efecte immediat.

### 15.6 Decisions (2026-09-08)

**Jugadors ja agafats: avís, mai pany.**

Els jugadors triats en un altre dispositiu es marquen com a agafats, però **no desapareixen ni es bloquegen**. El risc que assenyales és real i té una sola solució sensata: si algú es tria per error una altra persona, aquella persona no es pot quedar fora.

- Apareixen atenuats i amb una marca ("ja triat en un altre dispositiu"), **agrupats al final** de la llista.
- Continuen sent seleccionables, amb una confirmació enmig: *"Sembla que ja hi ha algú usant aquest nom en un altre dispositiu. Ets tu?"*. Qui s'ha equivocat només ha de tornar a triar-se al seu mòbil i el nom queda lliure.
- L'**admin pot alliberar qualsevol tria** des del panell. És la sortida d'emergència, sempre disponible i que no depèn de trobar el dispositiu culpable.
- La marca caduca sola per inactivitat i en acabar la competició.

Un pany dur faria que **un sol toc equivocat deixés un jugador fora sense recurs**. L'avís dona la mateixa informació útil ('compte, potser ja hi és algú') sense cap d'aquests riscos.

**Correcció de resultats.** El jugador pot corregir els resultats que ha enviat **mentre la ronda estigui oberta**. Un cop tancada, només l'admin.

Això no afegeix cap concepte nou: ja és exactament el que vol dir l'estat `open` de la ronda al punt 8.2. La mateixa regla serveix per als dos casos.

Com que els dos jugadors d'una partida poden editar-la, cal preveure que es trepitgin: preval l'última desada, i el panell de l'admin mostra **qui ha fet cada canvi i quan** (la traça de procedència de 15.2). Si hi ha discrepància entre els dos jugadors, ho resol l'admin.

**Pàgines personals públiques.** La pàgina personal de qualsevol jugador és visible per a tothom, inclòs el Visitant. Se n'exclouen les dades de contacte, que segueixen la regla de 14.4.

### 15.7 L'admin corregeix sempre, fins i tot en rondes tancades

**Decisió (2026-09-08):** l'admin pot corregir qualsevol resultat **en qualsevol moment**, encara que la ronda estigui tancada i se n'hagin jugat de posteriors. El tancament de ronda limita els jugadors, mai l'admin.

Conseqüències que això imposa al disseny:

- **La classificació no es pot desar com a dada bona.** Sempre s'ha de calcular a partir dels resultats (o, si es guarda en memòria cau, invalidar-la sencera quan canvia qualsevol resultat). `computeStandings()` ja és una funció pura, així que això surt gratis: el que **no** s'ha de fer mai és desar punts acumulats en una columna.
- **Els aparellaments ja jugats no es refan.** Si es corregeix una ronda antiga, les rondes posteriors es van generar amb la classificació d'abans. És així i està bé: es va jugar el que es va jugar. L'app recalcula la classificació, **no reescriu la història dels aparellaments**.
- **Avís explícit en corregir una ronda tancada**: "Aquesta ronda està tancada i n'hi ha 3 de posteriors. Es recalcularà la classificació; els aparellaments ja jugats no canviaran." Confirmació d'un pas més que en una ronda oberta — l'acció ha de ser possible, però no accidental.
- **Traça obligatòria**: cada correcció sobre una ronda tancada queda registrada (qui, quan, valor anterior i nou). És la que permet explicar després per què va canviar una classificació que algú ja havia vist.
- La classificació congelada (`frozen_at`, punt 15.5) també es recalcula: congelar és **fins a quina ronda** es mostra, no una fotografia desada.

---

## 16. Esquema proposat

El disseny complet de les taules és a **[esquema-proposat.md](esquema-proposat.md)** (2026-09-08).
Encara **no implementat**: `db/schema.ts` continua intacte fins que es revisi el pla sencer.
La implementació es farà en una **branca nova**.

### 12.11 `spread` amb N participants — decidit (2026-09-08)

El `spread` d'un participant és **la seva puntuació menys la mitjana dels altres participants
de la taula** (els N-1 restants), no la mitjana de la taula sencera amb ell inclòs.

El matís no és menor. Amb dos jugadors i puntuacions `a` i `b`:

- Mitjana **dels altres**: `a - b` → **és exactament l'spread d'Scrabble de tota la vida**.
- Mitjana **de la taula sencera**: `a - (a+b)/2 = (a-b)/2` → la meitat. Canviaria el significat
  de la mètrica en el cas que més s'usa, i totes les classificacions històriques.

Amb la definició triada, l'1v1 continua funcionant igual i el cas de N surt com a generalització
natural. Exemple amb quatre jugadors (450, 400, 380, 370): el primer té
`450 - (400+380+370)/3 = 450 - 383,3 = +66,7`.

Propietats que es mantenen:

- **Suma zero**: els spreads de tots els participants d'una partida sumen 0, sigui quin sigui N.
- **Decimals**: amb N > 2 el resultat rarament és enter, com passa amb els punts d'empat
  repartits (§12.10). El camp ha de ser de coma flotant i s'ha d'arrodonir només en mostrar-lo.
- **Byes**: una partida d'un sol participant no té spread; compta 0, com ara.
