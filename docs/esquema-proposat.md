# Esquema proposat

> Disseny per revisar. **No implementat**: `db/schema.ts` continua intacte.
> Es desenvoluparà en una **branca nova**, amb migracions de `drizzle-kit` i base de dades de zero.
> Recull les decisions de [pla-rols.md](pla-rols.md) (punts 3, 8, 10, 11, 12, 14 i 15).

## Convenció de noms

Codi i base de dades **en anglès**, interfície **en català**. Un sol terme per concepte:
`tournament` = competició, `entry` = participació d'una persona en una competició, `match` = partida.
Es descarta anar alternant "campionat" i "competició" a la interfície: **competició** sempre.

---

## Vista general

```
people ──┬── accounts (0..1)          identitat persistent + credencials opcionals
         └── entries ── tournaments   participació en una competició
                 │
                 ├── groups / teams
                 └── match_participants ── matches ── rounds ── phases
```

Tres capes d'identitat (punt 14): **persona** (persisteix entre competicions) → **entrada**
(participa en una) → **compte** (opcional, només si s'accepta una invitació).

---

## 1. Identitat

### `people` — la persona, persisteix entre competicions

| Columna | Tipus | Nota |
|---|---|---|
| `id` | text PK | |
| `display_name` | text NN | El que es veu a taules i classificacions |
| `full_name` | text | Opcional |
| `alias` | text | |
| `photo_url` | text | |
| `club` | text | |
| `rating` | int | Valoració global de la persona. Sembra `entries.rating` en inscriure-la |
| `phone` | text | Contacte: visibilitat restringida (§14.4) |
| `email` | text | Íd. |
| `is_anonymized` | bool NN d:0 | Esborrat tou conservant resultats (§14.4) |
| `created_by` | text → accounts.id | Qui la va crear en silenci |
| `created_at` | int NN | |

Sense identificador únic obligatori (ni DNI ni correu): trencaria el registre silenciós.

### `accounts` — credencials i rol. Opcional

| Columna | Tipus | Nota |
|---|---|---|
| `id` | text PK | |
| `person_id` | text NN → people.id | Únic: com a molt un compte per persona |
| `username` | text NN únic | |
| `password_hash` | text NN | |
| `role` | text NN | `superadmin` / `admin` / `user` |
| `is_active` | bool NN d:1 | |
| `preferences` | json NN d:`{}` | Preferències personals (tema, etc.) |
| `created_at` | int NN | |

Substitueix `directors`. El rol viu aquí, **no** a `people`.

### `invitations` — l'única via per crear un compte

| Columna | Tipus | Nota |
|---|---|---|
| `id` | text PK | |
| `token` | text NN únic | D'un sol ús |
| `person_id` | text NN → people.id | A qui es convida |
| `tournament_id` | text → tournaments.id | Competició d'origen, opcional |
| `created_by` | text NN → accounts.id | |
| `expires_at` | int | |
| `accepted_at` | int | |

No hi ha auto-registre (§14.2).

### `person_merges` — auditoria i desfer de fusions

`id`, `source_person_id`, `target_person_id`, `performed_by` → accounts.id, `performed_at`,
`undo_payload` (json: quines `entries` es van reapuntar). Salvaguarda de §14.6.

---

## 2. Competició

### `tournaments`

| Columna | Tipus | Nota |
|---|---|---|
| `id`, `name`, `slug` | text NN | `slug` únic |
| `game_profile_id` | text → game_profiles.id | Plantilla inicial (§13.1 #4) |
| `owner_id` | text NN → accounts.id | L'admin propietari |
| `status` | text NN | `draft` / `active` / `finished` |
| `visibility` | json NN | Valors per defecte de visibilitat (§8.2) |
| `created_at`, `updated_at` | int NN | |

`visibility` conté: `standings_mode` (`live` / `closed_rounds` / `frozen_at` / `hidden`),
`frozen_round` (si escau) i els defectes de `pairings_visible` i `results_visible`.

### `tournament_admins` — coadministradors

`tournament_id` + `account_id` (PK compost). El propietari no cal que hi consti.

### `groups`

`id`, `tournament_id` NN, `name`, `order`.

### `teams` — equips d'una competició (§12.9)

`id`, `tournament_id` NN, `name`, `order`.

No hi ha taula `team_members`: la pertinença viu a `entries.team_id`, perquè un jugador té
**un sol equip per competició** (§13.1 #5). Els equips no tenen grups propis.

### `entries` — la participació (avui `players`)

| Columna | Tipus | Nota |
|---|---|---|
| `id` | text PK | |
| `tournament_id` | text NN → tournaments.id | |
| `person_id` | text NN → people.id | Únic amb `tournament_id` |
| `group_id` | text → groups.id | |
| `team_id` | text → teams.id | |
| `rating` | int | Valoració per a aquesta competició |
| `is_active` | bool NN d:1 | |
| `created_at` | int NN | |

Perd `name`, `phone` i `club`: ara viuen a `people`.

---

## 3. Fases, rondes i partides

### `phases`

| Columna | Tipus | Nota |
|---|---|---|
| `id`, `tournament_id`, `order`, `name` | | `order` únic per competició |
| `method` | text NN | `swiss` / `swiss_fide` / `round_robin` / `king_of_the_hill` / `manual` |
| `config` | json NN | Configuració del mètode (la unió discriminada actual) |
| `participants_per_match` | int NN d:2 | Més de 2 només amb `round_robin` o `manual` (§13.1 #8) |
| `scoring` | json NN | Taula de punts per posició + regla d'empat (§12.10) |
| `tiebreakers` | json NN | Llista ordenada de claus del registre (§11.3) |
| `standings_scope` | json NN | Quines classificacions es publiquen: `global`, `group`, `team` |
| `team_aggregation` | text | `sum` / `avg` / `top_n` (amb `n`) (§12.9) |
| `start_round`, `end_round` | int NN | |
| `is_complete` | bool NN d:0 | |

En crear una fase, `scoring`, `tiebreakers`, `standings_scope` i `team_aggregation`
**s'hereten de la fase anterior** i es poden modificar (§12.6).

### `rounds`

| Columna | Tipus | Nota |
|---|---|---|
| `id`, `tournament_id`, `phase_id`, `number` | | `number` únic per competició |
| `status` | text NN d:`draft` | `draft` / `open` / `closed` (§8.2) |
| `pairings_visible` | bool | null = hereta de la competició |
| `results_visible` | bool | Íd. |
| `created_at` | int NN | |

`status` absorbeix l'actual `is_complete`: **pany d'edició i visibilitat, separats** i explícits.
`open` és, alhora, la condició perquè un jugador pugui corregir el seu resultat (§15.6).

### `matches` — la partida (avui `pairings`)

`id`, `round_id` NN, `table_number` NN, `location`, `comments`, `created_at`.

Les dades del resultat ja no hi són: viuen a `match_participants`.

### `match_participants` — una fila per participant

| Columna | Tipus | Nota |
|---|---|---|
| `id` | text PK | |
| `match_id` | text NN → matches.id | |
| `entry_id` | text NN → entries.id | Únic amb `match_id` |
| `seat` | int NN | Ordre a la taula. Únic amb `match_id` |
| `rank` | int | **Resultat primari**: posició a la partida (§12.10) |
| `score` | int | Puntuació bruta del joc |
| `outcome` | text | `win` / `draw` / `loss` / `bye` / `forfeit`. **Derivat** de `rank` |
| `team_id` | text → teams.id | **Instantània**: l'equip en el moment de jugar (§12.9) |

L'1v1 és el cas de dues files. El bye és una partida d'un sol participant.

### `round_absences`

`round_id` + `entry_id` (PK compost).

---

## 4. Preguntes i mètriques

### `question_definitions`

Les columnes actuals, més les que tanquen el cercle amb la classificació (§12.1):

| Columna nova | Tipus | Nota |
|---|---|---|
| `aggregate` | text | `sum` / `avg` / `max` / `count` / `none` — com es converteix en mètrica |
| `usable_as_tiebreaker` | bool NN d:0 | Si pot aparèixer al registre de desempats |

`scope` passa de `match` / `player` a `match` / `participant`, per coherència amb N participants.

### `match_answers` (avui `pairing_answers`)

`id`, `match_id` NN, `participant_id` → match_participants.id (null si la pregunta és d'àmbit
`match`), `question_id` NN, `text_value`, `number_value`, `image_url`.

Únic: (`match_id`, `question_id`, `participant_id`).

### `game_profiles` — plantilles de joc

`id`, `name`, `is_builtin`, `config` (json: preguntes per defecte, `scoring`, desempats,
mètriques). Scrabble i escacs com a perfils inicials; en crear una competició **es copien**,
no s'hi enllacen, perquè després es puguin ajustar lliurement (§13.1 #4).

---

## 5. Identitat del visitant i traça

### `entry_claims` — qui diu ser qui, per dispositiu (§15.2)

`entry_id` + `device_id` (PK compost), `claimed_at`, `last_seen_at`.

Serveix per marcar els jugadors "ja agafats". **Avís, mai pany** (§15.6): no imposa cap
restricció, i l'admin pot esborrar qualsevol fila des del panell.

### `match_revisions` — procedència i auditoria (§15.2, §15.7)

`id`, `match_id` NN, `actor_kind` (`guest` / `device` / `account`), `actor_account_id`,
`actor_entry_id`, `device_id`, `created_at`, `before` (json), `after` (json).

Cobreix alhora qui va enviar cada resultat, qui l'ha corregit i què deia abans. És el que
permet explicar una classificació que ha canviat després de tancar una ronda.

---

## 6. Contingut (previst ara, implementat després)

Segons §13.1 #2, les taules es defineixen ara per no haver de redissenyar dues vegades.

- **`announcements`** — `id`, `tournament_id`, `category`, `title`, `body`, `image_url`,
  `published_at`, `created_by`.
- **`meetups`** — `id`, `tournament_id`, `round_id` (opcional), `title`, `starts_at`,
  `location`, `description`.
- **`meetup_attendance`** — `meetup_id` + `entry_id` (PK compost), `status`
  (`confirmed` / `declined` / `pending`).

---

## 7. Què desapareix

| Avui | Passa a |
|---|---|
| `directors` | `accounts` (+ `people`) |
| `players` | `entries` (+ `people`) |
| `pairings` | `matches` + `match_participants` |
| `pairing_answers` | `match_answers` |
| `pairings.p1_score` … `p2_best_word_score` | Files de `match_participants` + `match_answers` |
| `rounds.is_complete` | `rounds.status` |
| SQL imperatiu a `db/index.ts` | Migracions versionades de `drizzle-kit` |

Les columnes específiques d'Scrabble (`p1_scrabbles`, `p1_best_word`, `spread`…) deixen
d'existir com a columnes: passen a ser **preguntes amb agregació** i mètriques derivades.

---

## 8. Punts a revisar abans d'implementar

1. ~~`spread` amb més de dos participants~~ — **resolt (2026-09-08)**: és la puntuació pròpia
   menys la **mitjana dels altres** participants de la taula. Vegeu §12.11 del pla.
2. ~~`outcome` desat o calculat~~ — **resolt (2026-09-08): desat**, derivat de `rank`.
   Condició per no acumular incoherències: **una sola funció** el calcula i **cap ruta l'escriu
   pel seu compte**. Es recalcula sempre que canvia el `rank` d'una partida, incloses les
   correccions de l'admin sobre rondes tancades (§15.7).
3. ~~`tournament_admins`~~ — **resolt (2026-09-08): des del principi.** Una competició té un
   `owner_id` i, a més, coadministradors. La comprovació "és admin d'aquesta competició" ha de
   viure en **un sol lloc** (`requireTournamentAccess()`, §4 del pla) i resoldre les dues vies:
   propietari o membre de `tournament_admins`. Afegir-ho ara evita haver de repassar després
   totes les rutes ja escrites.
4. ~~Desempats basats en oponents amb més de dos participants~~ — **resolt (2026-09-08):
   desactivats.** Buchholz, Buchholz mediana i Sonneborn-Berger **no estan disponibles** en fases
   amb `participants_per_match > 2`. Cada desempat del registre declara la seva aplicabilitat i
   l'editor de fases només ofereix els vàlids; a més, es valida en desar, perquè canviar els
   participants per partida d'una fase ja configurada no hi deixi un desempat impossible.

   Cas límit a tenir present: si la classificació general agrega fases amb `participants_per_match`
   diferents, aquests desempats tampoc no hi són aplicables — la noció d'oponent no és la mateixa
   a totes dues. En aquest cas s'han d'ometre també a escala de competició.
5. ~~Valoració global~~ — **resolt (2026-09-08): sí**, `people.rating`. Conviu amb
   `entries.rating`: la global és la de la persona, i en inscriure-la en una competició
   s'hi copia com a valor inicial, modificable per a aquella competició. Així el sembrat
   d'una competició nova ja parteix de la valoració que el jugador arrossega.

   **Pendent associat: qui l'actualitza.** Dues vies possibles, i convé decidir-ho abans de
   fer-la servir per sembrar:
   - **Manual** (proposta per començar): l'admin la fixa. Simple i previsible.
   - **Calculada** (Elo o similar a partir dels resultats): més ric, però és una valoració
     **compartida entre tots els admins** — la competició d'un modificaria el rànquing que fa
     servir un altre. Si s'hi va, cal decidir quines competicions hi computen i guardar
     l'historial de canvis.
