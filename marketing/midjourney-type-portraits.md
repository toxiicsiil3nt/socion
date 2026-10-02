# Socion type portraits — Midjourney prompts

One series, 16 characters, same style. Midjourney only draws what it can
see, so each type is written as a specific imagined person: age, face,
expression, posture, hands, prop, and setting. Each look is built from the
type's two leading channels (Base + Creative, from `theory.js`).

## Rules that make it work

- **Don't put the type code (ILE, SEI…) in the prompt.** Midjourney writes it
  as lettering on the image. Keep codes as your own labels only.
- Every prompt ends with the same tail:
  `bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo`
- **No `--v 6.1`.** On older versions the style code maps to a different
  style (it produced 3D renders).
- If faces come out too cartoony, change `--sw 1000` to `--sw 500`.
- If the code misbehaves, use "Try style" on the style's page, or upload the
  portrait image and mark it as Style reference.
- To reuse a character in other scenes, add `--cref [that image URL]`.
- Don't use type nicknames (Napoleon, Jack London…): they pull in real
  people's likenesses. Add Socion symbols on the site, not in the image.
- Genders are a suggestion (8 men, 8 women); swap freely.

---

## Alpha

**ILE — Possibility + Structure**
```
lanky man in his thirties, wild uncombed hair sticking up, three-day stubble, one eyebrow cocked high, crooked half-grin like he just thought of something mischievous, eyes glancing off to the side, pencil tucked behind his ear, sleeves of a black sweater rolled up, holding a half-dismantled pocket watch, wall behind covered in pinned sketches and arrows, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**SEI — Comfort + Mood**
```
young woman in her late twenties, soft round face, heavy-lidded content eyes, small warm smile, loose messy bun, oversized black knit sweater pulled over her hands, cradling a steaming mug of tea, warm lamp glow, rumpled blanket behind her, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**ESE — Mood + Comfort**
```
woman in her thirties, wide bright smile, eyes crinkled with laughter, head tilted toward the viewer, dark wavy styled hair, small hoop earrings, black wrap dress, one hand raised mid-wave as if greeting a friend across a busy dinner table, string lights behind her, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**LII — Structure + Possibility**
```
thin man in his forties, sharp narrow face, round wire glasses, neatly parted hair, level expressionless gaze straight at the viewer, fingertips pressed together, black turtleneck, chalkboard behind him covered in precise geometric diagrams, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

## Beta

**EIE — Mood + Time**
```
woman in her thirties, striking sharp cheekbones, dark-lined eyes staring past the viewer with intense longing, dark lipstick, one hand pressed to her chest, black high-collared coat, single hard spotlight from the side, stage curtain in shadow behind her, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**LSI — Structure + Force**
```
broad-shouldered man in his fifties, grey buzz cut, square jaw, thin pressed lips, unblinking stern gaze, rigidly straight posture, black uniform-like jacket buttoned to the throat, hands clasped behind his back, bare wall with a perfectly straight shelf of identical binders, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**SLE — Force + Structure**
```
muscular man in his thirties, scar through one eyebrow, slicked-back hair, cocky smirk, chin lowered, eyes locked on the viewer like a challenge, leaning forward with elbows on a table, black leather jacket, curl of cigarette smoke, dim back room, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**IEI — Time + Mood**
```
slender young woman in her twenties, long loose hair drifting across her face, half-closed dreamy eyes gazing at something far away, faint wistful smile, chin resting on folded arms on a windowsill, loose black shirt, foggy town at dusk outside the window, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

## Gamma

**SEE — Force + Bonds**
```
glamorous woman in her thirties, sharp winged eyeliner, confident knowing grin, one eyebrow slightly raised, chin up, hand on her hip, sleek black blazer with squared shoulders, blurred crowd of faces turned toward her in the background, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**ILI — Time + Efficiency**
```
gaunt man in his fifties, heavy-lidded skeptical eyes, deep frown lines, one corner of his mouth turned down, chin propped on his fist, slouched, black overcoat, rain-streaked window with distant city lights behind him, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**LIE — Efficiency + Time**
```
lean wiry man in his thirties, alert focused eyes looking just past the viewer toward something ahead, faint determined smile, stubble, black shirt sleeves rolled to the elbow, wristwatch, phone in one hand and a folded map in the other, blurred busy train station behind him, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**ESI — Bonds + Force**
```
woman in her forties, strong brows, guarded steady stare, mouth set firm, arms crossed tightly, short practical dark hair, black buttoned coat, standing in a doorway as if guarding it, warm light from the room behind her, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

## Delta

**LSE — Efficiency + Comfort**
```
capable woman in her forties, hair pulled back in a tight neat bun, polite professional half-smile, attentive eyes, sleeves pushed up, holding a clipboard and pen, crisp black apron over a black shirt, spotless organized workshop with labelled drawers behind her, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**EII — Bonds + Possibility**
```
soft-featured young man in his twenties, large kind eyes looking slightly down, shy gentle smile, tousled curls, black cardigan, holding an open notebook against his chest, small candle glowing in a dark room behind him, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**IEE — Possibility + Bonds**
```
lively young woman in her twenties, freckles, sparkling curious eyes, mid-laugh, leaning toward the viewer as if sharing a secret, animated hand gesture, messy short hair with a clip, oversized black jacket covered in pins, blurred busy cafe behind her, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```

**SLI — Comfort + Efficiency**
```
stocky bearded man in his forties, relaxed half-lidded eyes, easy lopsided smile, sitting back comfortably, worn black work shirt, sanding a piece of wood with calloused hands, cozy cluttered garage workshop in warm light, bust portrait, angular mature caricature, gritty hand-drawn comic sketch, bold ink lines, desaturated slate palette --sref 4278289982 --sw 1000 --ar 2:3 --no text, letters, words, typography, logo
```
