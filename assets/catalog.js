/* RageRun Games: asset catalog. The ONLY file to edit when an asset ships, goes on sale or changes.
   index.html reads this file and builds the featured strip, the filters and the cards from it.

   ASSET FIELDS
   slug      short id, also the image name (card-<slug>.webp) and the click-counter key (store-<slug>). Don't rename live ones.
   name      full store name (shown on hover and searched)
   short     name on the card (keep it short)
   blurb     ONE short line (about 60 characters)
   tags      exactly 2 short tags
   price     list price in USD
   sale      { price: 17.49, ends: "YYYY-MM-DD" }  pill shows "-50% · N days left", hides itself after the end date.
             Launch sales are usually 14 days: ends = launch date + 14 (Wobbly 14 Nov -> 28 Nov).
   launch    "YYYY-MM-DD"  NEW ASSETS: the publish date. Sets released + live, the 14-day sale end (leave "ends" out)
             and the featured strip for launch week. launch: null = hidden until you set the date.
   released  "YYYY-MM-DD"  sorts "Newest". NEW pill shows until 7 days after the sale ends (no sale: 21 days)
   live      "YYYY-MM-DD"  optional: the card stays hidden until this date (add a launch ahead of time)
   cat       ground | flight | balance | action    (category chips)
   creator   true = also listed under "Editors & Creators"
   id        Asset Store package number (null = links to the publisher page)
   img       image version, e.g. 5 -> card-<slug>.webp?v=5 (null = drawn icon)
   local     optional fallback image URL
   demo      web demo folder, e.g. "demos/pro-skate/" (null = no demo button)
   icon      drawn icon used when there is no image

   FEATURED: the strip under the header. A launch is featured for its first 7 days automatically.
   Otherwise the newest asset on sale; hidden when nothing is on sale. Test any date with ?today=2026-11-26. */

window.RR_CATALOG = {
  /* Optional overrides only: a launch is featured automatically for its first 7 days. */
  featured: [],

  /* TOOLS section (apps sold outside the Asset Store). track = click-counter key prefix (keep it). */
  tools: [
    { slug: "vertical-shorts-editor", name: "Vertical Shorts Editor", track: "vse",
      blurb: "Make Shorts of your game in minutes: timeline, big text, transitions, end cards and posting texts.",
      price: 12.99, platform: "runs on your PC", img: "tool-vertical-shorts-editor.webp",
      alt: "Vertical Shorts Editor: a Short of a toppling toy tower next to the editor",
      buy: "https://ragerun.itch.io/vertical-shorts-editor", buyLabel: "Buy on itch.io", page: "vertical-shorts-editor/" },
    { slug: "comedy-sound-synth", name: "Comedy Sound Synth", track: "css",
      blurb: "Cartoon sound effects you design yourself: boings, bonks, splats, layers, effects and 294 ready sounds.",
      price: 14.99, platform: "runs on your PC", img: "tool-comedy-sound-synth.webp",
      alt: "Comedy Sound Synth: the sound type list next to the title",
      buy: "https://ragerun.itch.io/comedy-sound-synth", buyLabel: "Buy on itch.io", page: "comedy-sound-synth/",
      live: "2099-01-01" /* hidden until launch: set to the launch date when the itch.io page is Public */ }
  ],

  assets: [
    { slug: "bmx-trick", name: "BMX Trick Controller: Physics BMX, Tricks & Park Builder", short: "BMX Trick Controller",
      blurb: "Physics BMX with flips, barspins, peg grinds and a Park Builder.",
      tags: ["Bike Creator", "Park Builder"], price: 24.99, sale: { price: 12.49 },
      launch: null /* set to the publish date, e.g. "2026-11-26", plus id below */, cat: "ground", creator: false, id: null, img: null, demo: "demos/bmx-trick/", icon: "bike" },

    { slug: "morph-tool-studio", name: "Morph Tool Studio: Morph Any Model Into Any Other", short: "Morph Tool Studio",
      blurb: "Morph any model into any other with 10 transitions.",
      tags: ["Morph Studio", "Prop Hunt demo"], price: 29.99, sale: { price: 14.99, ends: "2026-12-02" },
      released: "2026-11-19", cat: "action", creator: true, id: 424006, img: 1, demo: "demos/morph-tool-studio/", icon: "ball" },

    { slug: "wobbly-brawl", name: "Wobbly Brawl: Party Fighting Kit", short: "Wobbly Brawl",
      blurb: "Active-ragdoll party brawler: punch, grab and throw.",
      tags: ["Up to 8 players", "5 modes"], price: 34.99, sale: { price: 17.49, ends: "2026-11-28" },
      released: "2026-11-14", cat: "action", creator: false, id: 418486, img: 1, demo: "demos/wobbly-brawl/", icon: "ball" },

    { slug: "silly-character-kit", name: "Silly Character Kit: Googly Eyes & Wobbly Body", short: "Silly Character Kit",
      blurb: "Googly eyes, cartoon faces and wobbly bodies for any character.",
      tags: ["17 body types", "Setup Window"], price: 19.99,
      released: "2026-11-09", cat: "action", creator: true, id: 417970, img: 4, demo: "demos/silly-character-kit/", icon: "ball" },

    { slug: "abilityforge-3d", name: "AbilityForge 3D: First-Person Abilities & Throwable Weapons", short: "AbilityForge 3D",
      blurb: "40+ first-person abilities and throwables you can recall.",
      tags: ["Ability Creator", "Throwables"], price: 34.99,
      released: "2026-11-06", cat: "action", creator: true, id: 418184, img: 5, demo: "demos/abilityforge-3d/", icon: "ball" },

    { slug: "pogo-stick", name: "Pogo Stick Controller 2.0: Physics Pogo, Tricks & Party Modes", short: "Pogo Stick Controller 2.0",
      blurb: "Bouncy pogo physics, air tricks and four party modes.",
      tags: ["Game template", "4 modes"], price: 29.99,
      released: "2026-11-04", cat: "action", creator: false, id: 418050, img: 5, demo: "demos/pogo-stick/", icon: "ball" },

    { slug: "swarm-shapeshifter", name: "Swarm Shapeshifter Controller: Morphing Swarm Body & Form Creator", short: "Swarm Shapeshifter",
      blurb: "A body of thousands of leaves that morphs into 18 forms.",
      tags: ["Form Creator", "18 forms"], price: 44.99,
      released: "2026-11-01", cat: "action", creator: true, id: 422438, img: 7, demo: "demos/swarm-shapeshifter/", icon: "ball" },

    { slug: "pro-skate", name: "Pro Skate Controller: Skateboarding Physics, Tricks & Park Builder", short: "Pro Skate Controller",
      blurb: "Flick-stick skateboarding with grinds, manuals and a Park Builder.",
      tags: ["Skateboard Creator", "Park Builder"], price: 39.99,
      released: "2026-10-28", cat: "ground", creator: true, id: 419320, img: 5,
      local: "https://assetstorev1-prd-cdn.unity3d.com/key-image/1b5c9b09-05c5-4dc3-9273-8eb31ea14f81.jpg?v=1", demo: "demos/pro-skate/", icon: "skate" },

    { slug: "hybrid-vehicle", name: "Hybrid Vehicle Controller 2: Flying Car, Drone, Stunts & AI", short: "Hybrid Vehicle Controller 2",
      blurb: "A car that folds its wheels into fans and flies like a drone.",
      tags: ["AI racers", "Stunts"], price: 29.99,
      released: "2026-10-24", cat: "flight", creator: false, id: 418642, img: 5, demo: "demos/hybrid-vehicle/", icon: "flycar" },

    { slug: "drone-flight-pro", name: "Drone Flight Controller Pro: Drone Physics & Drone Creator", short: "Drone Flight Controller Pro",
      blurb: "Real multirotor physics, AI drones, turrets and missiles.",
      tags: ["Drone Creator", "Combat"], price: 34.99,
      released: "2026-10-20", cat: "flight", creator: true, id: 418284, img: 2, demo: "demos/drone-flight-pro/", icon: "drone" },

    { slug: "fold-and-fly", name: "Fold & Fly: Paper Plane Controller With Creator", short: "Fold & Fly",
      blurb: "Fold it, throw it, fly it: physics paper planes.",
      tags: ["Plane Creator", "Mobile + touch"], price: 24.99,
      released: "2026-10-16", cat: "flight", creator: true, id: 418984, img: 7,
      local: "https://assetstorev1-prd-cdn.unity3d.com/key-image/75e59232-e464-4dab-bf2d-619eb1cdfd71.jpg?v=1", demo: "demos/fold-and-fly/", icon: "plane" },

    { slug: "ball-balance", name: "Ball Balance Controller: Rolling Ball Physics & Party Game", short: "Ball Balance Controller",
      blurb: "A googly-eyed rider balancing on a giant rolling ball.",
      tags: ["11 games", "Level designer"], price: 24.99,
      released: "2026-10-12", cat: "balance", creator: false, id: 417744, img: 6,
      local: "https://assetstorev1-prd-cdn.unity3d.com/key-image/c21efb35-bd57-4121-a2bc-3e166b6ff1cd.jpg?v=1", demo: "demos/ball-balance/", icon: "ball" },

    { slug: "roller-skate", name: "Roller Skate Controller: Physics Inline Skating Kit", short: "Roller Skate Controller",
      blurb: "Inline skating with grinds, powerslides and wall rides.",
      tags: ["Skate Creator", "IK body"], price: 32.99,
      released: "2026-10-08", cat: "ground", creator: false, id: 417478, img: 7,
      local: "https://assetstorev1-prd-cdn.unity3d.com/key-image/3239068b-2bae-48f8-a6da-6804c88f33fb.png?v=1", demo: "demos/roller-skate/", icon: "skate" },

    { slug: "unicycle", name: "Unicycle Controller: Physics Balance & Party Game", short: "Unicycle Controller",
      blurb: "Keep pedalling to stay up: balance, ragdoll falls, tricks.",
      tags: ["Local multiplayer", "CPU riders"], price: 29.99,
      released: "2026-10-04", cat: "balance", creator: false, id: 418182, img: 6,
      local: "https://assetstorev1-prd-cdn.unity3d.com/key-image/cd1a4aba-d767-4f97-9ec1-b235b54b8586.jpg?v=1", demo: "demos/unicycle/", icon: "unicycle" }
  ]
};
