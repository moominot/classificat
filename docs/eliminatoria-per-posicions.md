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
  (vegeu §3.1); si persisteix, **nombre de bingos (Scrabbles)**.
- Es juguen totes les partides: no hi ha absències ni byes per presència.
  L'única excepció és l'abandonament (§3.6).
- **Sempre per sorteig**, també a la primera fase.
- **No es pot començar** si el nombre de jugadors no és potència de 2 (§3.4).

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
| **Sorteig aleatori** dins l'etiqueta | 🟡 el Round Robin `intra_tag` ja té les rondes de Berger de cada grup: només cal triar-ne una a l'atzar (§4.3) |
| **Anada i tornada** (mateix rival a la ronda següent) | ❌ i el Suís amb «evitar revanxes» faria just el contrari |
| **Decidir l'eliminatòria** pel global | ❌ la classificació ordena per punts (victòries), no per eliminatòria |
| **Assignar etiquetes automàticament** en acabar la fase | ❌ |
| **Ordre dels grups** (`1-16` abans que `17-32`) | ✅ ordre natural pel nom de l'etiqueta |
| Classificació per grups apilats, amb colors | ✅ amb les etiquetes que parteixen la fase |
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
aleshores, aquesta eliminatòria inclosa).

**Decidit:** si també empata, el **nombre de bingos (Scrabbles)**. Detalls:

- És la mètrica `metric:bingos`, que surt de la pregunta «Bingos» del perfil
  Scrabble. El campionat l'ha de tenir: la plantilla l'ha de portar i, si
  falta, l'acció de tancar l'eliminatòria ho ha d'avisar.
- Per coherència amb la mitjana, es compten els de **tot el campionat**.
- Els bingos són enters petits, així que empaten amb molta més facilitat que
  la mitjana. Que s'arribi a aquest punt ja és molt rar, però si passa cal
  una sortida. **Decidit:** ho decideix l'admin. L'acció de tancar l'eliminatòria
  s'atura, avisa i demana qui passa.

### 3.2 Qui passa es decideix per eliminatòria, no per la classificació del grup

Temptació: ordenar el grup de 16 per diferència de punts de la fase i posar
els 8 primers a `1-8`. Funciona gairebé sempre, però no sempre: si hi ha dues
eliminatòries empatades en el global, quatre jugadors queden a diferència 0
i el desempat els pot ordenar de manera que **els dos d'una mateixa
eliminatòria passin a dalt**. La partició s'ha de fer parella a parella:
el guanyador de cada eliminatòria a la meitat alta, el perdedor a la baixa.

### 3.3 Les etiquetes com a font de veritat

Les etiquetes són editables a mà i múltiples. Això té una cara bona
(l'admin pot corregir un grup movent una etiqueta) i una de dolenta (un
canvi accidental desquadra el sorteig).

**Decidit:** no hi ha cap tipus d'etiqueta nou. Quines etiquetes són grups
ho diu la fase (les `tagIds` que ja tria per partir els jugadors) i l'ordre
surt del nom amb ordenació natural («1-8», «9-16», «17-24»…). Proposta per a
la resta:

- En partir un grup, el jugador **perd l'etiqueta antiga** i rep la nova: en
  cada moment té una sola etiqueta de grup. L'historial ja és a les partides.
- La generació avisa si algun jugador té zero o dues etiquetes de grup.

### 3.4 N que no és potència de 2

Amb 24 jugadors: 12 / 12 → 6 / 6 → **3 / 3**, i un grup de 3 no es pot
emparellar.

**Decidit:** el campionat **no es pot començar** si el nombre de jugadors
actius no és potència de 2. A més, cal que el nombre de fases sigui log₂ N:
una plantilla de 5 fases només serveix per a 32. Per això convé que les fases
es generin en començar, a partir de N (16 → 4 fases, 32 → 5, 64 → 6), en
lloc de venir fixades a la plantilla.

La comprovació es fa en generar la primera ronda de la primera fase, al
servidor: la interfície també ho mostra, però no n'hi ha prou.

### 3.5 Puntuació

Amb aquest format els punts de victòria no ordenen res: l'ordre és **grup →
resultat dins el grup**. La classificació general ha d'ordenar primer pel
grup (ordre natural del nom) i, dins del grup, per la fase en curs
(diferència, mitjana). Al final, cada grup és d'un sol jugador i l'ordre dels
grups **és** la classificació final.

### 3.6 Abandonaments

**Decidit:** els rivals de qui abandona obtenen **bye**.

Com encaixa amb el que ja hi ha:

- Abandonar = desactivar la inscripció (`entries.isActive = false`, ja
  existeix). La generació ja deixa fora els inactius.
- El grup queda senar i `bergerSchedule()` ja hi afegeix un rival fantasma
  (`__bye__`): qui li toca té bye. Com que la ronda és per sorteig, qui
  rep el bye també és a l'atzar. No cal programar res aquí.
- Qui té bye **guanya l'eliminatòria**. Qui ha abandonat va sempre a la
  meitat baixa i hi continua fins al final, de manera que els grups mantenen
  la mida.
- Si abandona entre l'anada i la tornada, la tornada és bye i l'eliminatòria
  és per al rival, faci el que faci el resultat de l'anada. L'anada jugada
  continua comptant per a la mitjana.

**Compte amb «punts segons els ajustaments».** L'únic ajustament que hi ha
és `byePoints`, que són **punts de classificació** (victòries). En aquest
format no ordenen res (§3.5), així que no tenen cap efecte. El bye tampoc no
compta per a la diferència ni per a la mitjana: està bé, perquè així la
mitjana no es distorsiona. Si es vol que el bye doni alguna cosa que compti
(p. ex. +50 de diferència; és un valor que es veu sovint a Scrabble, però no està verificat amb el reglament NASPA/WESPA), cal un ajustament
nou.

**Decidit:** el bye dona diferència de punts. Ajustament nou a la puntuació
de la fase, `byeSpread` (p. ex. 50), que suma a la mètrica `spread`. No
compta com a partida jugada, així que no altera la mitjana.

## 4. Proposta tècnica

Peces genèriques, reutilitzables fora d'aquest format:

1. ~~`tags.order` i `tags.kind`~~: descartat. Els grups són les etiquetes
   que la fase ja fa servir per partir els jugadors.
2. **Classificació per grups apilats**: un bloc per etiqueta de la fase, en
   ordre natural del nom, amb color per bloc i les posicions contínues.
   Serveix per a qualsevol fase per etiquetes.
3. **Sorteig = una ronda de Round Robin triada a l'atzar** dins de cada grup
   (Round Robin `intra_tag`, opció nova `randomDraw`). Reaprofita
   `bergerSchedule()` tal com és. Detalls:
   - Cada jugador té la mateixa probabilitat, 1/(n−1), de trobar cada rival.
     En canvi, amb l'ordre de la llista fix només són possibles n−1
     emparellaments dels molts que n'hi ha. Per evitar-ho, n'hi ha prou amb
     **barrejar la llista** abans de calcular la ronda: és una línia.
   - Implementat: es barreja la llista i es pren la primera ronda de Berger
     (barrejar i triar una ronda qualsevol dona la mateixa distribució).
   - No es desa cap llavor: el registre del sorteig són les partides
     generades. Si s'esborren i es tornen a generar, surt un sorteig nou.
4. **Anada i tornada**: `doubleRound` ja fa que la ronda r + (n−1) sigui la
   ronda r amb els seients girats. Tot i així, la tornada ha de **copiar
   l'anada** (girant els seients) en lloc de tornar a calcular Berger. Si
   algú abandona entre les dues partides, la llista canvia (queda senar, hi
   entra el fantasma) i Berger donaria parelles completament diferents. A més,
   `loadEntrants()` no té `ORDER BY`. Copiant, el que ha abandonat simplement
   es converteix en un bye.
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

Què fan avui els perfils de joc (`game_profiles`):

- N'hi ha tres de sèrie (Scrabble, Escacs, Genèric), creats en arrencar
  (`db/index.ts`). No hi ha cap pantalla per crear-ne ni per triar-ne:
  `NouCampionat` no envia `gameProfileId`, i el servidor agafa sempre
  **Scrabble**.
- Només se'n **copien les preguntes**. La puntuació, els desempats i els
  participants per partida que porta el perfil no s'usen enlloc: la primera
  fase surt de `DEFAULT_SCORING`.

Diferència amb una plantilla: el perfil diu **a què es juga** (preguntes,
puntuació); la plantilla diria **com és tot el campionat** (això mateix, més
les fases, les etiquetes i els ajustos). Una plantilla conté un perfil.

Com que els perfils gairebé no s'usen, **fusionar-los surt barat**: els tres
perfils passen a ser plantilles de sèrie sense fases, i la taula
`game_profiles` es pot retirar més endavant. Proposta:

- Taula `tournament_templates(id, name, owner_id, is_builtin, config, created_at)`.
- `config` versionat amb: preguntes, configuració del campionat
  (visibilitat, presència), **fases** (mètode, config, rondes relatives,
  puntuació, desempats) i **etiquetes** (nom, ordre, tipus).
- **«Desa com a plantilla»**: serialitza un campionat sense jugadors,
  resultats, dates ni ids. Les referències internes es tradueixen: les fases
  per posició (`carryStandingsFromPhaseIds` → índex), les etiquetes per nom;
  les exclusions entre jugadors es descarten.
- **Crear des de plantilla**: el pas invers, amb ids nous.
- Els perfils de joc actuals passen a ser plantilles de sèrie sense fases.
- En crear un campionat es tria la plantilla (avui no es pot triar res).

Per a aquest format, el nombre de fases depèn de N (log₂ N). Una plantilla
estàtica «32 jugadors» és suficient per començar; més endavant, una plantilla
pot portar un paràmetre «nombre de jugadors» que generi les fases.

## 5. Ordre de feina

1. ✅ Classificació per grups apilats amb colors, a partir de les etiquetes
   de la fase (`lib/tag-groups.ts`, `ClassificacioPerGrups`). Sense canvis a
   l'esquema.
2. ✅ Sorteig + anada i tornada (`randomDraw` al Round Robin, amb
   `doubleRound` com a tornada; formulari de Fases).
3. Tancar eliminatòria i partir grups (+ forçar partides).
4. Plantilles: desar i crear; plantilla de sèrie «Eliminatòria per posicions (32)».

Amb 1–3 ja es pot jugar el campionat configurant les fases a mà.

## 6. Decisions

Preses (2026-10-20):

- N ha de ser potència de 2; si no, no es pot començar (§3.4).
- Desempat: mitjana de punts a favor del campionat → bingos (§3.1).
- Abandonament: els rivals tenen bye i guanyen l'eliminatòria (§3.6).
- Sempre per sorteig, també a la primera fase, amb una ronda de Round Robin
  triada a l'atzar dins de cada grup (§4.3).

- Si empaten també els bingos, decideix l'admin (§3.1).
- El bye dona diferència de punts, configurable (`byeSpread`, §3.6).
- Perfils de joc i plantilles es fusionen: els perfils passen a ser
  plantilles de sèrie sense fases (§4).

Pendents:

- Valor per defecte de `byeSpread`: cal confirmar-lo amb el reglament que segueixi el campionat.
