# Eliminatòria per posicions amb etiquetes, i plantilles de campionat

> Estat: **pla**, no implementat (2026-10-20). Substitueix, per a l'ús real
> previst, la part d'eliminatòries de `format-champions.md`.

## 1. El format

- Tothom juga el mateix nombre de partides: no hi ha eliminats, només
  **grups de posició** que es van partint per la meitat.
- Cada eliminatòria és **anada i tornada** contra el mateix rival (a la
  tornada canvia qui comença).
- Guanya qui fa més punts sumant les dues partides (és a dir, la diferència
  de punts de l'eliminatòria és positiva).
- Empat en el global: **mitjana de punts a favor de tot el campionat**
  (vegeu §3.1), i si persisteix, una regla final fixa.
- Es juguen totes les partides: no hi ha absències ni byes per presència.

Exemple amb 32 jugadors (5 fases × 2 rondes = 10 partides cadascú):

| Fase | Rondes | Grups d'entrada | En acabar, cada grup es parteix en |
|------|--------|-----------------|------------------------------------|
| 1 | 1–2 | `1-32` | `1-16` / `17-32` |
| 2 | 3–4 | `1-16`, `17-32` | `1-8` / `9-16`, `17-24` / `25-32` |
| 3 | 5–6 | 4 grups de 8 | 8 grups de 4 |
| 4 | 7–8 | 8 grups de 4 | 16 grups de 2 |
| 5 | 9–10 | 16 grups de 2 | 32 posicions finals |

Propietat útil: dins d'un grup **ningú no s'ha enfrontat mai** (cada rival
anterior ha anat a parar al grup complementari), així que el sorteig mai no
ha d'evitar revanxes.

## 2. Què ja tenim i què no

| Peça | Estat |
|------|-------|
| Etiquetes per jugador, assignació en bloc | ✅ (`entry_tags`, `bulk-tags`) |
| Aparellar dins de cada etiqueta (`scope: 'intra_tag'`) | ✅ Suís, Rei del turó, RR |
| Mètriques `spread` i `avg_score` | ✅ |
| Filtrar la classificació per etiqueta | ✅ |
| **Sorteig aleatori** dins l'etiqueta | ❌ cap mètode no ho fa: el Rei del turó aparella 1–2, 3–4 per classificació; el Suís, per grups de punts |
| **Anada i tornada** (mateix rival a la ronda següent) | ❌ i el Suís amb «evitar revanxes» faria just el contrari |
| **Decidir l'eliminatòria** pel global | ❌ la classificació ordena per punts (victòries), no per eliminatòria |
| **Assignar etiquetes automàticament** en acabar la fase | ❌ |
| **Ordre de les etiquetes** (`1-16` abans que `17-32`) | ❌ `tags` no té `order` |
| Classificació per grups apilats, amb colors | ❌ |
| Forçar que es juguin totes les partides | ❌ parcial: `askPresence` es pot apagar, però res no impedeix avançar amb resultats pendents |
| Plantilles de campionat | ❌ només hi ha perfils de joc, que copien les preguntes |

Conclusió: les etiquetes resolen bé **on** juga cadascú i **com** es mostra,
però el que decideix el format (sorteig, anada i tornada, qui passa) és nou.
Dir que «gairebé tot» ja hi és és massa optimista; més aviat la meitat de les
peces. La part nova, però, és petita i acotada.

## 3. Punts on cal anar amb compte

### 3.1 La mitjana de punts a favor dins l'eliminatòria no desempata mai

Si el global és empat, A₁ + A₂ = B₁ + B₂, i per tant la mitjana de punts a
favor de les dues partides és **idèntica** per als dos jugadors. El desempat
ha de ser la mitjana **de tot el campionat** (totes les partides jugades fins
aleshores, aquesta eliminatòria inclosa). Encara pot empatar (és rar):
cal una regla final, p. ex. qui ha fet més punts a la tornada, el rànquing
inicial o sorteig.

### 3.2 Qui passa es decideix per eliminatòria, no per la classificació del grup

Temptació: ordenar el grup de 16 per diferència de punts de la fase i posar
els 8 primers a `1-8`. Funciona gairebé sempre, però no sempre: si hi ha dues
eliminatòries empatades en el global, quatre jugadors queden a diferència 0
i el desempat els pot ordenar de manera que **els dos d'una mateixa
eliminatòria passin a dalt**. La partició s'ha de fer parella a parella:
el guanyador de cada eliminatòria a la meitat alta, el perdedor a la baixa.

### 3.3 Les etiquetes com a font de veritat

Les etiquetes són editables a mà, múltiples i sense ordre. Això té una cara
bona (l'admin pot corregir un grup movent una etiqueta) i una de dolenta (un
canvi accidental desquadra el sorteig). Proposta:

- Les etiquetes de grup les crea el sistema i porten una marca
  (`tags.kind = 'position_group'`) i un `order`.
- En partir un grup, el jugador **perd l'etiqueta antiga** i rep la nova: en
  cada moment té una sola etiqueta de grup. L'historial ja és a les partides.
- La generació avisa si algun jugador té zero o dues etiquetes de grup.

### 3.4 N que no és potència de 2

Amb 24 jugadors: 12 / 12 → 6 / 6 → **3 / 3**, i un grup de 3 no es pot
emparellar. Opcions: exigir potència de 2, admetre byes (qui en té un puja a
la meitat alta? baixa?), o un triangular a l'última fase. Decisió pendent;
per començar, n'hi ha prou amb exigir potència de 2.

### 3.5 Puntuació

Amb aquest format els punts de victòria no ordenen res: l'ordre és **grup →
resultat dins el grup**. La classificació general ha d'ordenar primer per
l'`order` de l'etiqueta de grup i, dins del grup, per la fase en curs
(diferència, mitjana). Al final, cada grup és d'un sol jugador i l'ordre dels
grups **és** la classificació final.

## 4. Proposta tècnica

Peces genèriques, reutilitzables fora d'aquest format:

1. **`tags.order` i `tags.kind`** + migració.
2. **Classificació per grups apilats**: un bloc per etiqueta de grup, en
   ordre, amb color per bloc i la classificació interna de cada grup. Serveix
   també per a qualsevol campionat amb grups.
3. **Sorteig aleatori**: opció `pairingOrder: 'standings' | 'random'` al Rei
   del turó (`intra_tag`). Aleatori + consecutius = sorteig. La llavor es desa
   a la fase per poder-lo reproduir.
4. **Anada i tornada**: `legs: 1 | 2` a la fase. A la ronda parella de la
   fase el motor no aparella: copia la ronda anterior amb els seients
   girats. Funciona per a qualsevol mètode.
5. **Tancar eliminatòria i partir grups**: acció a la fase (o automàtica en
   tancar l'última ronda) que:
   - exigeix que **totes** les partides de la fase tinguin resultat;
   - per cada parella, suma els punts de les dues partides i aplica §3.1;
   - treu l'etiqueta de grup `a-b` i posa `a-m` al guanyador i `m+1-b` al
     perdedor (creant-les si cal);
   - posa aquestes etiquetes noves com a `tagIds` de la fase següent.
6. **Forçar partides**: en aquest format, `askPresence` desactivat, la
   generació ignora absències i no es pot generar la fase següent sense el
   pas 5.

### Plantilles de campionat

Avui `game_profiles` només **copia les preguntes** en crear el campionat (la
puntuació i els desempats del perfil no s'usen enlloc). Proposta:

- Taula `tournament_templates(id, name, owner_id, is_builtin, config, created_at)`.
- `config` versionat amb: preguntes, configuració del campionat
  (visibilitat, presència), **fases** (mètode, config, rondes relatives,
  puntuació, desempats) i **etiquetes** (nom, ordre, tipus).
- **«Desa com a plantilla»**: serialitza un campionat sense jugadors,
  resultats, dates ni ids. Les referències internes es tradueixen: les fases
  per posició (`carryStandingsFromPhaseIds` → índex), les etiquetes per nom;
  les exclusions entre jugadors es descarten.
- **Crear des de plantilla**: el pas invers, amb ids nous.
- Els perfils de joc actuals passen a ser plantilles de sèrie sense fases (o
  conviuen fins que es decideixi fusionar-los).

Per a aquest format, el nombre de fases depèn de N (log₂ N). Una plantilla
estàtica «32 jugadors» és suficient per començar; més endavant, una plantilla
pot portar un paràmetre «nombre de jugadors» que generi les fases.

## 5. Ordre de feina

1. `tags.order`/`kind` + classificació per grups apilats amb colors.
2. Sorteig aleatori + anada i tornada.
3. Tancar eliminatòria i partir grups (+ forçar partides).
4. Plantilles: desar i crear; plantilla de sèrie «Eliminatòria per posicions (32)».

Amb 1–3 ja es pot jugar el campionat configurant les fases a mà.

## 6. Decisions pendents

- Desempat final si la mitjana global també empata.
- N que no és potència de 2.
- Si un jugador abandona a mig campionat: amb quin marcador compta la partida
  no jugada (el global en depèn)?
- Primera fase: sorteig aleatori o per rànquing (1 contra 17, 2 contra 18…)?
- Plantilles i perfils de joc: fusionar-los o mantenir-los separats.
