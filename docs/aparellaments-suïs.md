# Aparellaments: Sistema Suís (Dutch System)

## Fitxers principals

| Fitxer | Responsabilitat |
|--------|----------------|
| `lib/pairing/methods/swiss.ts` | Algoritme principal d'aparellament |
| `lib/pairing/standings.ts` | Càlcul de classificació i desempats |
| `lib/pairing/tiebreakers.ts` | Valors de desempat individuals |
| `lib/pairing/utils/bye.ts` | Assignació de bye |
| `lib/pairing/utils/rematch.ts` | Detecció de revanxes |
| `lib/pairing/engine.ts` | Orquestrador (tria el mètode) |
| `app/api/tournaments/[tournamentId]/rounds/[roundId]/generate/route.ts` | Endpoint que invoca el motor |

---

## Flux general

```
POST /api/.../rounds/{roundId}/generate
        │
        ├─ Carrega jugadors actius, exclou absents
        ├─ Carrega historial de rondes i resultats
        ├─ Calcula classificació actual (computeStandings)
        ├─ Construeix el conjunt de revanxes (buildRematchSet)
        └─ generatePairings(context)
                │
                ├─ 1. Assignar bye (si nombre senar de jugadors)
                ├─ 2. Ordenar per rànquing
                ├─ 3. Construir grups de puntuació
                ├─ 4. Aparellar cada grup (+ floaters)
                ├─ 5. Si falla → reintentar permetent revanxes
                ├─ 6. Si falla → fallback seqüencial
                └─ 7. Numerar taules per rànquing mitjà
```

---

## 1. Grups de puntuació

Els jugadors s'agrupen pels seus punts totals (descendent). Dins de cada grup s'ordenen per rànquing.

```
Grup A (4 pts): [R1, R2, R3, R4]
Grup B (3 pts): [R5, R6, R7]
Grup C (2 pts): [R8, R9]
...
```

## 2. Aparellament dins del grup (Dutch)

Cada grup es divideix en dues meitats:

- **S1** = meitat superior (millor rànquing)
- **S2** = meitat inferior (pitjor rànquing)

S'intenta casar `S1[0]↔S2[0]`, `S1[1]↔S2[1]`, etc.

Per trobar una combinació vàlida (sense revanxes), es generen permutacions de S2:

- Grups de ≤ 8 jugadors: **permutacions completes** (`n!`)
- Grups de > 8 jugadors: **rotacions** (`n` variacions) per eficiència

Per a cada permutació es comprova que cap parell hagi jugat ja. La primera permutació vàlida s'accepta.

Si el grup té nombre senar de jugadors, el sobrant passa al grup següent com a **floater**.

## 3. Floaters

Un jugador que no es pot aparellar dins del seu grup "flota" cap avall al grup de puntuació inferior. Pot arrossegar-ne d'altres si el grup queda descompensat.

Si al final del procés queden jugadors sense aparellar, l'algoritme ha fallat i es passa a la fase de relaxació.

## 4. Evitar revanxes

Tots els aparellaments previs es carreguen i es guarden en un `Set` amb clau canònica `"minId:maxId"`.

Cada cop que es proposa un parell, es consulta el `Set`. Si ja han jugat, aquella combinació es descarta.

**Estratègia de relaxació:**

1. **Intent 1** — revanxes prohibides (comportament normal)
2. **Intent 2** — revanxes permeses + avís: *"No s'ha pogut evitar una revanxa"*
3. **Fallback** — aparellament seqüencial sense cap restricció + avís

## 5. Bye (nombre senar de jugadors)

Quan hi ha un nombre senar de jugadors actius, un rep bye automàtic (1 punt, cap oponent).

Tres estratègies configurables per triar qui rep el bye:

| Estratègia | Descripció |
|------------|-----------|
| `lowest_ranked` | El jugador amb pitjor rànquing del darrer grup |
| `least_byes` | El del darrer grup amb menys byes prèvies |
| `random_last_group` | Aleatori del darrer grup |

Un bye es desa amb `player2Id = null` i `outcome = 'bye'`.

## 6. Numeració de taules

Un cop generats els parells, s'ordenen per **rànquing mitjà** dels dos jugadors (ascendent = millors jugadors a taules baixes). Cada parell rep un número de taula (`1`, `2`, `3`...). Els byes queden amb `tableNumber = 0`.

---

## Classificació i desempats

`computeStandings` processa les rondes en ordre i acumula per a cada jugador:

- Punts (victòria=1, empat=0,5, derrota=0, bye=1)
- Partides jugades, victòries, derrotes, empats, byes
- Diferencial (spread, per a Scrabble)
- Tots els oponents i resultats contra ells

Desempats disponibles (ordre configurable per fase):

| Codi | Nom | Descripció |
|------|-----|-----------|
| `buchholz` | Buchholz | Suma de punts dels rivals |
| `median_buchholz` | Buchholz medià | Buchholz sense el millor i el pitjor rival |
| `berger` | Sonneborn-Berger | Punts dels rivals batuts + 0,5 × empatats |
| `cumulative` | Acumulatiu | Suma de punts per ronda (premia la consistència) |
| `wins` | Victòries | Nombre de partides guanyades |
| `direct_encounter` | Encontre directe | Resultat head-to-head |
| `spread` | Diferencial | Diferència de punts totals (Scrabble) |

---

## Exemple pas a pas (ronda 3, 6 jugadors)

```
Classificació actual:
  R1: 2 pts  R2: 2 pts  R3: 2 pts
  R4: 1 pt   R5: 1 pt   R6: 1 pt

Grup A (2 pts): S1=[R1,R2]  S2=[R3]
  → R1↔R3, R2 sobra → floater

Grup B (1 pt) + floater R2: [R2,R4,R5,R6]
  S1=[R2,R4]  S2=[R5,R6]
  Permutació [R5,R6]: R2↔R5, R4↔R6 → cap revanxa → acceptat

Resultat: R1↔R3 (taula 1), R2↔R5 (taula 2), R4↔R6 (taula 3)
Taules per rànquing mitjà: (1+3)/2=2, (2+5)/2=3,5, (4+6)/2=5
```
