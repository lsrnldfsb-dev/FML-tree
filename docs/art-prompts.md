# Monster art prompts

Everything needed to generate the 32 monsters currently in the game. Drop the
finished files into `apps/web/public/assets/monsters/` and they appear in the
game immediately — no code change, no rebuild of the engine. Any monster
without a file keeps its placeholder emoji, so you can do these in batches of
five and stop whenever you like.

Machine-readable copies of every prompt live in `tools/sprites/prompts.json`.
Run `node tools/sprites/build-prompts.mjs` to print them fully assembled, ready
to paste, or `--json` to pipe them into a generation script.

---

## 1. Before you generate anything

**Do the five-monster pilot first.** Generate Bonzumi, Pelijet, Turtlelisk,
Slickitty and Barbenin — one per element — and look at them side by side at
*small* size. Consistency across a 32-monster roster is the whole problem here,
and it is far cheaper to fix the style prefix once now than to regenerate
thirty sprites later. Only commit to the full run when those five look like
they belong to the same game.

**The sprites display small.** In the player panels they render at roughly
40 pixels. That means silhouette and colour separation matter far more than
detail — a monster that reads as a distinct shape at thumbnail size is doing
its job, and fine texture work is wasted. Generate at 512×512 anyway so there
is headroom for a larger battle view later.

**Evolved forms must read as the same creature.** Each pair below is written so
the evolved prompt refers back to its base. Generate a line's two forms in the
same session, ideally seeded from the base image if your tool supports
image-to-image, so the family resemblance survives.

---

## 2. The style prefix

Put this in front of every monster prompt, unchanged. This is what holds the
roster together.

```
Mobile game creature sprite, full body, three-quarter front view, centered.
Chunky stylised proportions with an oversized head and a bold, instantly
readable silhouette. Clean cel shading, soft rim light from the upper left,
thick unified outline, richly saturated colours. A single character only, no
scenery, no ground shadow, no text, no border.
```

## 3. The style suffix

Put this after every monster prompt, unchanged.

```
Square composition, character fully inside the frame with a small even margin.
Transparent background. If transparency is unavailable, use a completely flat
uniform pure-magenta background with no gradient, texture or shadow.
```

Pure magenta (`#FF00FF`) is the fallback because nothing in the palette uses it,
so the removal script can key it out without eating any part of a monster. Flat
white is a poor second choice — several monsters have white or cream fur.

**Negative prompt**, if your tool takes one:

```
photorealistic, 3d render, text, watermark, signature, multiple characters,
background scenery, drop shadow, frame, border, cropped limbs, blurry
```

---

## 4. The monsters

Each entry is the subject line only. Wrap it in the prefix and suffix above.
The filename column is what the game looks for.

### Fire

| # | Monster | File |
|---|---------|------|
| 001 | Bonzumi | `bonzumi.png` |

> A small round raccoon-like fire cub, russet and cream fur, dark bandit-mask
> markings across the eyes, a flame-shaped tuft at the end of its tail, a single
> ember flickering above one ear, wide curious eyes.

| # | Monster | File |
|---|---------|------|
| 002 | Bonzire | `bonzire.png` |

> The same raccoon creature grown fierce and upright: larger and heavier, a mane
> of living flame across its shoulders, scorched dark-red fur, a burning tail,
> glowing amber eyes, confident planted stance.

| # | Monster | File |
|---|---------|------|
| 011 | Pyrokun | `pyrokun.png` |

> A lean fox cub wreathed in low flame, bright orange and white fur, ember-tipped
> ears, a burning brush tail, a mischievous grin, paws braced ready to dash.

| # | Monster | File |
|---|---------|------|
| 012 | Magnooki | `magnooki.png` |

> A heavy volcanic tanuki-like beast, thick charcoal-grey hide cracked with
> glowing magma seams, a molten mane, broad shoulders, smoke curling from its
> back, standing heavy and immovable.

| # | Monster | File |
|---|---------|------|
| 019 | Timingo | `timingo.png` |

> A slender flamingo chick with soft flame-coloured plumage shading from rose to
> gold, oversized gentle eyes, a heart-shaped crest feather, both small wings
> spread in a warm welcoming gesture.

| # | Monster | File |
|---|---------|------|
| 020 | Flambagant | `flambagant.png` |

> The same flamingo grown tall and theatrical: brilliant scarlet and gold
> plumage, a long fanned tail of flame-shaped feathers, an elegant curved neck,
> one wing flourished outward like a stage dancer.

| # | Monster | File |
|---|---------|------|
| 029 | Ferobite | `ferobite.png` |

> A wiry scrappy wolf pup, ash-grey fur and ember-orange eyes, oversized jaws
> with prominent fangs, small nicks and scars in its ears, hackles raised,
> crouched low and snarling.

| # | Monster | File |
|---|---------|------|
| 030 | Fursway | `fursway.png` |

> A massive shaggy bear-wolf, soot-black fur streaked with glowing orange,
> an enormous fanged maw, heavy clawed forelimbs, reared up and roaring.

### Water

| # | Monster | File |
|---|---------|------|
| 003 | Pelijet | `pelijet.png` |

> A round pelican chick with glossy blue and white plumage, an oversized
> scooping bill brimming with water, tiny wings, pale jet-stream markings along
> its flanks, a cheerful expression.

| # | Monster | File |
|---|---------|------|
| 004 | Sephanix | `sephanix.png` |

> The same pelican evolved into a sleek storm bird: deep sapphire and silver
> plumage, long swept wings trailing water vapour, a crest of curved feathers,
> piercing pale eyes, wings spread wide.

| # | Monster | File |
|---|---------|------|
| 013 | Trashark | `trashark.png` |

> A stubby comic shark, steel-blue skin over a pale belly, an oversized toothy
> grin, small stubby fins, a battered tin can snagged on its dorsal fin, scrappy
> and pleased with itself.

| # | Monster | File |
|---|---------|------|
| 014 | Shardivore | `shardivore.png` |

> A huge armoured shark-whale, deep navy hide plated with pale ice-blue shards,
> a jagged crystalline dorsal ridge, enormous jaws, cold glowing eyes.

| # | Monster | File |
|---|---------|------|
| 023 | Nerverack | `nerverack.png` |

> A wiry deep-sea squid creature, translucent violet-blue mantle, long barbed
> tentacles, bioluminescent spots pulsing along its arms, hollow staring eyes,
> an unsettling coiled posture.

| # | Monster | File |
|---|---------|------|
| 024 | Wreckore | `wreckore.png` |

> A colossal abyssal octopus, bruised purple and black hide, thick suckered arms
> coiled around broken ship timbers, one enormous eye glowing sickly green.

### Earth

| # | Monster | File |
|---|---------|------|
| 005 | Turtlelisk | `turtlelisk.png` |

> A small round tortoise, mossy green shell sprouting one broad leaf, soft olive
> skin, sleepy contented eyes, stubby legs, tiny sprouts along the shell rim.

| # | Monster | File |
|---|---------|------|
| 006 | Karaggon | `karaggon.png` |

> The same tortoise grown into a mountain guardian: a great shell of layered
> stone plates with grass and one small tree growing on top, thick jade-green
> limbs, a dragon-like head, calm ancient eyes.

| # | Monster | File |
|---|---------|------|
| 015 | Elfini | `elfini.png` |

> A tiny woodland sprite with translucent petal wings, pale green skin, a dress
> of overlapping blush-pink flower petals, dandelion-seed hair, a gentle smile,
> hovering just off the ground.

| # | Monster | File |
|---|---------|------|
| 016 | Eidelf | `eidelf.png` |

> The same sprite grown regal: taller and elegant, a crown of open blooms, a
> flowing petal gown in rose and cream, long luminous wings, a serene
> closed-eye expression, glowing pollen motes drifting around her.

| # | Monster | File |
|---|---------|------|
| 025 | Birchee | `birchee.png` |

> A tiny sapling creature with a smooth pale birch-bark body, two broad green
> leaves for arms, a single red berry hanging from the sprout on its head, round
> dark knot-holes for eyes, a shy pose.

| # | Monster | File |
|---|---------|------|
| 026 | Birchard | `birchard.png` |

> A sturdy young birch treant, white bark trunk with dark markings, a full
> canopy of green leaves heavy with red berries, thick root feet, branching
> limbs for arms, a kindly face carved into the trunk.

| # | Monster | File |
|---|---------|------|
| 059 | Tropina | `tropina.png` |

> A cheerful little pineapple creature, golden-yellow diamond-textured body,
> spiky green crown leaves, small stubby arms hugging a tiny fruit, a bright
> grinning face.

| # | Monster | File |
|---|---------|------|
| 060 | Pinathotlada | `pinathotlada.png` |

> A grand tropical fruit guardian, a large golden pineapple body carved with
> ornate ceremonial patterns, an elaborate crown of broad green fronds and
> hanging tropical fruit, both arms raised in celebration.

### Electric

| # | Monster | File |
|---|---------|------|
| 007 | Slickitty | `slickitty.png` |

> A sleek small cat, short lemon-yellow fur with black lightning-bolt markings,
> oversized pointed ears, sparks arcing between its whiskers, bright wide eyes,
> an alert crouch.

| # | Monster | File |
|---|---------|------|
| 008 | Axelraze | `axelraze.png` |

> The same cat grown into a lithe electric predator: taller and streamlined,
> vivid yellow fur with jagged black bolts, crackling energy running along its
> spine and tail, fierce narrowed eyes, caught mid-pounce.

| # | Monster | File |
|---|---------|------|
| 017 | Winklit | `winklit.png` |

> A tiny star sprite, a round pale-gold body with four stubby points, a glowing
> white core, big sparkling eyes, small trailing sparks, floating cheerfully.

| # | Monster | File |
|---|---------|------|
| 018 | Gleamur | `gleamur.png` |

> The same star grown radiant: a larger many-pointed star creature with a
> luminous white-gold core, streaming ribbons of light, small orbiting motes, a
> serene glowing face.

| # | Monster | File |
|---|---------|------|
| 027 | Glowzard | `glowzard.png` |

> A chunky lizard, bright citrine scales over a glowing electric-blue
> underbelly, a thick tail, bulbous eyes, arcs of electricity leaping between
> the raised plates along its back.

| # | Monster | File |
|---|---------|------|
| 028 | Radiaze | `radiaze.png` |

> A large armoured reptile crackling with power, deep amber scales over black
> plating, glowing hazard-yellow energy vents along its spine and jaw, heavy
> clawed limbs, a storm of electricity around it.

### Psychic

| # | Monster | File |
|---|---------|------|
| 009 | Barbenin | `barbenin.png` |

> A small violet scorpion, smooth glossy carapace, an oversized curved tail
> tipped with a glowing pink stinger, four gleaming eyes, delicate pincers
> raised.

| # | Monster | File |
|---|---------|------|
| 010 | Scoprikon | `scoprikon.png` |

> A larger sinister scorpion, deep purple chitin shot through with luminous
> magenta veins, a long segmented tail, many glowing eyes, spindly legs, poised
> to strike.

| # | Monster | File |
|---|---------|------|
| 021 | Criminook | `criminook.png` |

> A small hunched badger-like thief, dusty mauve fur, a dark cloth mask over its
> eyes, a tiny sack slung over one shoulder, clutching a stolen berry, a sly
> grin.

| # | Monster | File |
|---|---------|------|
| 022 | Bandicrook | `bandicrook.png` |

> The same thief grown confident: a taller bandit rogue with plum-purple fur, a
> tattered violet cloak and hood, several stolen pouches on its belt, twirling a
> berry between its claws, a smug expression.

---

## 5. Optional: tile art

The board currently uses coloured rounded squares with an emoji on top, which
reads well and costs nothing. If you want painted tiles later, generate these
six at 256×256 with the same suffix:

| Tile | File | Prompt |
|------|------|--------|
| Fire | `tile-fire.png` | A glossy rounded-square game gem in molten orange-red, a flame motif embossed on its face, soft inner glow |
| Water | `tile-water.png` | A glossy rounded-square game gem in clear azure blue, a droplet motif embossed on its face, soft inner glow |
| Earth | `tile-earth.png` | A glossy rounded-square game gem in fresh leaf green, a leaf motif embossed on its face, soft inner glow |
| Electric | `tile-electric.png` | A glossy rounded-square game gem in bright amber yellow, a lightning-bolt motif embossed on its face, soft inner glow |
| Psychic | `tile-psychic.png` | A glossy rounded-square game gem in deep amethyst purple, a swirling eye motif embossed on its face, soft inner glow |
| Berry | `tile-berry.png` | A glossy rounded-square game gem in vivid raspberry pink, a paired-berry motif embossed on its face, soft inner glow |

Tile art needs a code change to wire up, unlike the monsters — tell me when you
have them and I will switch the board over.

---

## 6. Dropping the files in

1. Name each file exactly as the tables above specify, all lowercase.
2. Put them in `apps/web/public/assets/monsters/`.
3. Reload the page. That is the whole process.

Square PNGs of any size work — the game scales them. 512×512 with a transparent
background is the ideal.

If your generator could not do transparency and you have flat-magenta
backgrounds, run:

```sh
pnpm add -w -D sharp
node tools/sprites/process.mjs ~/Downloads/monsters
```

That keys out the background, trims the empty margin, squares the result up to
512×512 and writes it to the right folder with the right name. It leaves your
originals untouched.

---

## 7. What I still need from you

- **Which tool or service** you are generating with. If it has an API and you
  put the key in a `.env` file on the server — please don't paste it into chat —
  I will write a script that runs the whole roster in one go.
- **The pilot five**, before you do the other twenty-seven. Send them over and I
  will tell you honestly whether they hold together at small size.
