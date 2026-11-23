/* RageRun Comedy Sound Synth - the built-in Library: finished sounds, every one a recipe.
 *
 * Nothing here is an audio file: each sound is made by the engine when it's played, so the library costs no disk
 * space, sounds exactly like what you save, and any of it opens in the Sound Designer for editing.
 *  - UNITY: the 98 library sounds of the Comedy Sound Synth Unity asset (same recipes; dev\portcheck\library_check.js
 *    compares them with the asset's WAV files).
 *  - NEW: sounds for the 32 newer types (the app's own).
 *  - COMBOS: layered sounds and sounds with effects.
 * "takes" makes extra takes ("Name 2", "Name 3") with new seeds, like the Unity asset does.
 * Works in the page (window.ComedyLibrary) and in Node (require("./library.js")).
 */
(function (root) {
  "use strict";
  const S = root.ComedySynth || (typeof require === "function" ? require("./synth.js") : null);
  const X = root.ComedyFx || (typeof require === "function" ? require("./fx.js") : null);

  // folder, name, type, pitch, length, squish, bounce, bright, random, seed, tags, takes
  const UNITY = [
    ["Boing", "Small Boing", "Boing", 0.7, 0.25, 0.25, 0.5, 0.6, 0.15, 1001, "spring bounce jump small", 1],
    ["Boing", "Big Boing", "Boing", 0.12, 0.85, 0.55, 0.8, 0.35, 0.15, 1002, "spring bounce jump big", 1],
    ["Boing", "Spring Boing", "Boing", 0.45, 0.55, 0.35, 0.65, 0.55, 0.15, 1003, "spring bounce jump", 1],
    ["Boing", "Rubber Ball Boing", "Boing", 0.55, 0.3, 0.6, 0.35, 0.3, 0.2, 1004, "spring bounce jump", 3],
    ["Boing", "Door Stop Twang", "Boing", 0.3, 0.6, 0.1, 0.95, 0.85, 0.1, 1005, "spring bounce jump", 1],
    ["Boing", "Low Wobble Boing", "Boing", 0.05, 0.7, 0.3, 1.0, 0.25, 0.1, 1006, "spring bounce jump", 1],
    ["Boing", "High Boing", "Boing", 0.92, 0.35, 0.2, 0.55, 0.7, 0.1, 1007, "spring bounce jump", 1],
    ["Boing", "Trampoline Boing", "Boing", 0.25, 0.65, 0.8, 0.6, 0.4, 0.15, 1008, "spring bounce jump big", 1],
    ["Thud", "Soft Thud", "Thud", 0.35, 0.35, 0.9, 0.0, 0.15, 0.15, 2001, "impact fall", 1],
    ["Thud", "Heavy Thud", "Thud", 0.05, 0.7, 0.5, 0.05, 0.35, 0.15, 2002, "impact fall big", 1],
    ["Thud", "Body Fall", "Thud", 0.2, 0.5, 0.6, 0.1, 0.3, 0.2, 2003, "impact fall body", 3],
    ["Thud", "Wood Box Thud", "Thud", 0.55, 0.3, 0.15, 0.15, 0.8, 0.2, 2004, "impact fall wood", 3],
    ["Thud", "Cardboard Thud", "Thud", 0.6, 0.2, 0.45, 0.05, 0.55, 0.2, 2005, "impact fall box", 1],
    ["Thud", "Ground Hit", "Thud", 0.12, 0.45, 0.35, 0.0, 0.5, 0.2, 2006, "impact fall", 1],
    ["Thud", "Landing Thud", "Thud", 0.3, 0.35, 0.5, 0.2, 0.4, 0.2, 2007, "impact fall jump", 1],
    ["Thud", "Pillow Thud", "Thud", 0.4, 0.3, 1.0, 0.0, 0.05, 0.15, 2008, "impact fall soft", 1],
    ["Whoosh", "Fast Whoosh", "Whoosh", 0.6, 0.15, 0.4, 0.0, 0.65, 0.2, 3001, "air fast", 1],
    ["Whoosh", "Slow Whoosh", "Whoosh", 0.3, 0.8, 0.7, 0.0, 0.4, 0.2, 3002, "air fast slow", 1],
    ["Whoosh", "Swing Whoosh", "Whoosh", 0.5, 0.25, 0.45, 0.1, 0.6, 0.25, 3003, "air fast", 3],
    ["Whoosh", "Throw Whoosh", "Whoosh", 0.35, 0.45, 0.55, 0.0, 0.5, 0.2, 3004, "air fast throw", 1],
    ["Whoosh", "Spin Whoosh", "Whoosh", 0.5, 0.7, 0.5, 0.75, 0.5, 0.15, 3005, "air fast", 1],
    ["Whoosh", "Dash Whoosh", "Whoosh", 0.8, 0.25, 0.1, 0.0, 0.8, 0.15, 3006, "air fast", 1],
    ["Whoosh", "Fall Whoosh", "Whoosh", 0.2, 0.9, 0.6, 0.05, 0.25, 0.15, 3007, "air fast fall slow", 1],
    ["Whoosh", "Pass By Whoosh", "Whoosh", 0.45, 0.6, 0.35, 0.0, 0.9, 0.15, 3008, "air fast", 1],
    ["Squeak", "Rubber Chicken", "Squeak", 0.45, 0.6, 0.85, 0.0, 0.55, 0.2, 4001, "rubber toy funny", 1],
    ["Squeak", "Toy Squeak", "Squeak", 0.65, 0.3, 0.25, 0.0, 0.6, 0.2, 4002, "rubber toy", 3],
    ["Squeak", "Shoe Squeak", "Squeak", 0.8, 0.2, 0.55, 0.0, 0.85, 0.25, 4003, "rubber toy shoe", 1],
    ["Squeak", "Balloon Rub", "Squeak", 0.35, 0.7, 0.7, 0.65, 0.35, 0.3, 4004, "rubber toy", 1],
    ["Squeak", "Door Squeak", "Squeak", 0.25, 0.9, 0.95, 0.0, 0.3, 0.2, 4005, "rubber toy door", 1],
    ["Squeak", "Squeeze Squeak", "Squeak", 0.55, 0.45, 0.4, 0.35, 0.5, 0.2, 4006, "rubber toy", 1],
    ["Squeak", "Horn Honk", "Squeak", 0.05, 0.5, 0.6, 0.3, 1.0, 0.1, 4007, "rubber toy horn", 1],
    ["Squeak", "Tiny Squeak", "Squeak", 0.95, 0.1, 0.2, 0.0, 0.6, 0.2, 4008, "rubber toy small", 1],
    ["Yelp", "Short Yelp", "Yelp", 0.5, 0.15, 0.2, 0.0, 0.6, 0.2, 5001, "voice character", 1],
    ["Yelp", "Long Yelp", "Yelp", 0.5, 0.85, 0.35, 0.0, 0.65, 0.2, 5002, "voice character", 1],
    ["Yelp", "Ouch", "Yelp", 0.45, 0.25, 0.2, 0.0, 0.55, 0.2, 5003, "voice character hurt", 1],
    ["Yelp", "Wahoo", "Yelp", 0.55, 0.6, 0.3, 0.5, 0.7, 0.15, 5004, "voice character win jump", 1],
    ["Yelp", "Panic Yelp", "Yelp", 0.8, 0.8, 0.9, 0.3, 0.85, 0.2, 5005, "voice character panic", 1],
    ["Yelp", "Dizzy Yelp", "Yelp", 0.4, 0.9, 1.0, 1.0, 0.25, 0.2, 5006, "voice character dizzy", 1],
    ["Yelp", "Grunt", "Yelp", 0.1, 0.2, 0.4, 0.0, 0.3, 0.2, 5007, "voice character hurt", 1],
    ["Yelp", "Oof", "Yelp", 0.2, 0.3, 0.6, 0.0, 0.2, 0.15, 5008, "voice character hurt", 1],
    ["Pop", "Bubble Pop", "Pop", 0.5, 0.35, 0.75, 0.0, 0.3, 0.2, 6001, "small water", 3],
    ["Pop", "Cork Pop", "Pop", 0.3, 0.45, 0.4, 0.0, 0.7, 0.15, 6002, "small bottle", 1],
    ["Pop", "Balloon Pop", "Pop", 0.15, 0.25, 0.1, 0.0, 1.0, 0.1, 6003, "small balloon", 1],
    ["Pop", "Pluck", "Pop", 0.75, 0.15, 0.15, 0.0, 0.85, 0.1, 6004, "small ui", 1],
    ["Pop", "Cartoon Pop", "Pop", 0.45, 0.55, 0.9, 0.0, 0.5, 0.15, 6005, "small", 1],
    ["Pop", "Suction Pop", "Pop", 0.2, 0.6, 0.55, 0.0, 0.35, 0.15, 6006, "small", 1],
    ["Pop", "Gum Pop", "Pop", 0.6, 0.25, 0.6, 0.0, 0.55, 0.2, 6007, "small", 1],
    ["Pop", "Tiny Pop", "Pop", 0.95, 0.1, 0.4, 0.0, 0.6, 0.2, 6008, "small ui", 1],
    ["Splat", "Goo Splat", "Splat", 0.3, 0.6, 0.95, 0.25, 0.3, 0.2, 7001, "goo food", 1],
    ["Splat", "Pie Splat", "Splat", 0.45, 0.4, 0.55, 0.0, 0.55, 0.2, 7002, "goo food face", 3],
    ["Splat", "Wet Splat", "Splat", 0.5, 0.3, 0.5, 0.5, 0.75, 0.2, 7003, "goo food", 1],
    ["Splat", "Mud Splat", "Splat", 0.2, 0.45, 0.75, 0.0, 0.15, 0.2, 7004, "goo food mud", 1],
    ["Splat", "Slime Splat", "Splat", 0.4, 0.75, 1.0, 0.75, 0.45, 0.2, 7005, "goo food", 1],
    ["Splat", "Tomato Splat", "Splat", 0.6, 0.25, 0.45, 0.0, 0.65, 0.2, 7006, "goo food", 1],
    ["Splat", "Belly Flop", "Splat", 0.15, 0.7, 0.4, 0.5, 0.6, 0.2, 7007, "goo food water body", 1],
    ["Splat", "Squish", "Splat", 0.65, 0.15, 0.7, 0.0, 0.35, 0.2, 7008, "goo food", 1],
    ["Slide Whistle", "Slide Whistle Up", "SlideWhistle", 0.5, 0.35, 1.0, 0.0, 0.2, 0.1, 8001, "fall jump music", 1],
    ["Slide Whistle", "Slide Whistle Down", "SlideWhistle", 0.5, 0.5, 0.0, 0.05, 0.2, 0.1, 8002, "fall jump music", 1],
    ["Slide Whistle", "Slide Whistle Up Down", "SlideWhistle", 0.55, 0.5, 0.5, 0.0, 0.25, 0.1, 8003, "fall jump music", 1],
    ["Slide Whistle", "Slide Whistle Long Fall", "SlideWhistle", 0.45, 1.0, 0.0, 0.15, 0.2, 0.1, 8004, "fall jump music", 1],
    ["Slide Whistle", "Slide Whistle Rise", "SlideWhistle", 0.4, 0.8, 1.0, 0.1, 0.3, 0.1, 8005, "fall jump music", 1],
    ["Slide Whistle", "Slide Whistle Wobble", "SlideWhistle", 0.5, 0.7, 0.35, 1.0, 0.3, 0.1, 8006, "fall jump music", 1],
    ["Punch", "Punch", "Punch", 0.35, 0.4, 0.35, 0.0, 0.45, 0.2, 9001, "impact fight", 3],
    ["Punch", "Bonk", "Punch", 0.65, 0.3, 0.6, 0.0, 0.3, 0.2, 9002, "impact fight", 1],
    ["Punch", "Slap", "Punch", 0.6, 0.15, 0.15, 0.0, 0.55, 0.2, 9003, "impact fight face", 1],
    ["Punch", "Frying Pan Clang", "Punch", 0.45, 0.7, 0.05, 0.0, 1.0, 0.15, 9004, "impact fight metal", 1],
    ["Punch", "Kick", "Punch", 0.2, 0.35, 0.45, 0.0, 0.4, 0.2, 9005, "impact fight", 1],
    ["Punch", "Smack", "Punch", 0.5, 0.25, 0.2, 0.0, 0.5, 0.2, 9006, "impact fight", 1],
    ["Punch", "Poke", "Punch", 0.85, 0.1, 0.5, 0.0, 0.35, 0.2, 9007, "impact fight", 1],
    ["Punch", "Boxing Glove", "Punch", 0.3, 0.45, 0.9, 0.0, 0.25, 0.2, 9008, "impact fight", 1],
    ["Punch", "Head Bonk", "Punch", 0.7, 0.45, 0.3, 0.0, 0.75, 0.2, 9009, "impact fight head", 1],
    ["Punch", "Double Hit", "Punch", 0.4, 0.35, 0.3, 0.5, 0.5, 0.25, 9010, "impact fight", 1],
    ["Extras", "Coin", "Jingle", 0.75, 0.2, 0.0, 0.2, 0.85, 0.0, 10001, "ui money win", 1],
    ["Extras", "Ta-Da", "Jingle", 0.45, 0.5, 0.1, 0.4, 0.55, 0.0, 10002, "ui win music", 1],
    ["Extras", "Buzzer", "Jingle", 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 10003, "ui fail wrong", 1],
    ["Extras", "Ding", "Jingle", 0.7, 0.5, 0.0, 0.0, 0.0, 0.0, 10004, "ui bell correct", 1],
    ["Extras", "Tick", "Pop", 0.9, 0.0, 0.0, 0.0, 1.0, 0.0, 10005, "ui click", 1],
    ["Extras", "Sad Trombone", "Jingle", 0.25, 0.7, 0.9, 0.6, 0.6, 0.0, 10006, "ui fail music", 1],
    ["Extras", "Spring Launch", "Boing", 0.5, 0.35, 1.0, 0.9, 0.7, 0.1, 10007, "ui jump", 1],
    ["Extras", "Zap", "SlideWhistle", 0.9, 0.0, 0.0, 0.8, 0.1, 0.1, 10008, "ui tech", 1],
    ["Extras", "Dizzy Stars", "Jingle", 0.85, 0.08, 0.2, 1.0, 0.1, 0.0, 10009, "ui dizzy magic", 1],
    ["Extras", "Drum Hit", "Thud", 0.35, 0.2, 0.0, 0.0, 0.6, 0.1, 10010, "ui music", 1],  ];

  // name, type, pitch, length, squish, bounce, bright, random, tags, takes   (seed = 20000 + type id * 100 + row)
  const NEW = [
    ["Bonk on the Head", "Bonk", 0.5, 0.3, 0.35, 0.0, 0.5, 0.15, "head impact funny", 3],
    ["Coconut Clop", "Bonk", 0.65, 0.2, 0.1, 0.25, 0.75, 0.15, "wood walk", 3],
    ["Bouncing Bonk", "Bonk", 0.4, 0.4, 0.3, 1.0, 0.5, 0.2, "bounce impact", 1],
    ["Soft Mallet", "Bonk", 0.25, 0.35, 0.9, 0.0, 0.25, 0.1, "soft impact", 1],
    ["Tiny Tap", "Bonk", 0.9, 0.15, 0.2, 0.0, 0.7, 0.1, "small ui", 1],
    ["Dropped Spanner", "Clang", 0.55, 0.55, 0.1, 0.75, 0.75, 0.2, "metal fall", 1],
    ["Metal Bucket", "Clang", 0.35, 0.6, 0.2, 0.3, 0.55, 0.15, "metal", 1],
    ["Gong Hit", "Clang", 0.1, 1.0, 0.05, 0.0, 0.45, 0.05, "metal big music", 1],
    ["Pan Lid Rattle", "Clang", 0.6, 0.45, 0.3, 1.0, 0.7, 0.25, "metal kitchen", 1],
    ["Muffled Pipe", "Clang", 0.45, 0.35, 0.9, 0.0, 0.35, 0.1, "metal soft", 1],
    ["Tool Shed Collapse", "Crash", 0.3, 0.75, 0.25, 0.8, 0.6, 0.35, "big fall metal", 1],
    ["Plate Stack", "Crash", 0.85, 0.35, 0.05, 0.6, 0.85, 0.3, "kitchen break", 1],
    ["Box Pile", "Crash", 0.35, 0.5, 0.95, 0.55, 0.35, 0.3, "box fall", 1],
    ["Toy Box Tumble", "Crash", 0.65, 0.45, 0.45, 0.65, 0.6, 0.35, "toy fall", 2],
    ["Junk Drawer", "Crash", 0.5, 0.3, 0.3, 0.4, 0.65, 0.3, "small", 1],
    ["Front Door Knock", "WoodKnock", 0.35, 0.35, 0.3, 0.25, 0.45, 0.15, "door", 1],
    ["Secret Knock", "WoodKnock", 0.5, 0.3, 0.2, 0.75, 0.55, 0.1, "door music funny", 1],
    ["Clock Tick", "WoodKnock", 0.85, 0.12, 0.05, 0.0, 0.8, 0.05, "click ui", 1],
    ["Hollow Tree", "WoodKnock", 0.1, 0.7, 0.25, 0.25, 0.35, 0.1, "wood big", 1],
    ["Wooden Spoon", "WoodKnock", 0.7, 0.2, 0.5, 0.5, 0.6, 0.2, "kitchen wood", 1],
    ["Springboard", "Twang", 0.2, 0.7, 0.4, 0.5, 0.45, 0.15, "spring jump", 1],
    ["Ruler Flick", "Twang", 0.45, 0.45, 0.05, 0.85, 0.65, 0.15, "desk", 1],
    ["Snapped Band", "Twang", 0.65, 0.2, 0.9, 0.1, 0.5, 0.15, "rubber", 2],
    ["Bow and Arrow", "Twang", 0.35, 0.35, 0.3, 0.15, 0.6, 0.1, "throw", 1],
    ["Saggy Elastic", "Twang", 0.3, 0.6, 1.0, 0.3, 0.35, 0.15, "rubber slow funny", 1],
    ["Pudding Wobble", "JellyWobble", 0.45, 0.5, 0.55, 0.45, 0.4, 0.15, "goo food", 1],
    ["Big Belly Bounce", "JellyWobble", 0.1, 0.6, 0.5, 0.3, 0.3, 0.15, "body big", 1],
    ["Slime Blob", "JellyWobble", 0.25, 0.75, 1.0, 0.2, 0.35, 0.2, "goo", 1],
    ["Quick Jiggle", "JellyWobble", 0.6, 0.25, 0.3, 0.9, 0.55, 0.15, "small", 1],
    ["Bouncy Castle", "JellyWobble", 0.3, 0.7, 0.45, 0.65, 0.5, 0.15, "bounce", 1],
    ["Zip It", "Zip", 0.55, 0.2, 0.15, 0.0, 0.55, 0.1, "small", 1],
    ["Sleeping Bag", "Zip", 0.3, 0.8, 0.05, 0.0, 0.4, 0.15, "long", 1],
    ["Dash Off", "Zip", 0.65, 0.15, 1.0, 0.0, 0.45, 0.1, "fast run", 3],
    ["Here and There", "Zip", 0.5, 0.5, 0.9, 1.0, 0.6, 0.15, "fast", 1],
    ["Backpack", "Zip", 0.45, 0.35, 0.2, 0.5, 0.5, 0.2, "small", 1],
    ["Helicopter Hat", "Propeller", 0.65, 0.6, 0.5, 0.75, 0.55, 0.15, "fly", 1],
    ["Toy Plane Fly-By", "Propeller", 0.45, 0.75, 0.5, 0.4, 0.7, 0.15, "fly", 1],
    ["Desk Fan", "Propeller", 0.3, 0.8, 0.5, 0.15, 0.35, 0.1, "tech", 1],
    ["Take Off", "Propeller", 0.5, 0.7, 1.0, 0.6, 0.55, 0.1, "fly", 1],
    ["Sputtering Out", "Propeller", 0.45, 0.75, 0.0, 0.85, 0.5, 0.15, "fail", 1],
    ["Creeping Burglar", "Tiptoe", 0.35, 0.55, 0.35, 0.6, 0.85, 0.1, "sneak music", 1],
    ["Bare Feet", "Tiptoe", 0.45, 0.4, 0.75, 0.5, 0.15, 0.15, "sneak", 1],
    ["High Heels", "Tiptoe", 0.7, 0.3, 0.0, 0.6, 0.3, 0.15, "walk", 1],
    ["Late Night Fridge", "Tiptoe", 0.3, 0.6, 0.6, 0.35, 0.6, 0.1, "sneak funny", 1],
    ["Plinky Sneak", "Tiptoe", 0.6, 0.35, 0.3, 0.85, 1.0, 0.1, "sneak music", 1],
    ["Mouse Hole Dash", "Scurry", 0.85, 0.35, 0.45, 0.85, 0.65, 0.25, "small run", 1],
    ["Panic Run", "Scurry", 0.5, 0.6, 0.25, 0.95, 0.55, 0.3, "run panic", 1],
    ["Puppy Paws", "Scurry", 0.6, 0.4, 0.8, 0.5, 0.4, 0.2, "soft", 1],
    ["Tap Shoes", "Scurry", 0.45, 0.45, 0.0, 0.6, 0.85, 0.25, "shoe music", 1],
    ["Bug Legs", "Scurry", 0.95, 0.3, 0.3, 1.0, 0.75, 0.25, "small", 1],
    ["Swamp Step", "Squelch", 0.3, 0.45, 0.5, 0.0, 0.35, 0.15, "mud walk", 3],
    ["Soggy Shoe", "Squelch", 0.55, 0.3, 0.85, 0.0, 0.5, 0.15, "water shoe", 1],
    ["Wading Through Goo", "Squelch", 0.4, 0.4, 0.75, 0.9, 0.4, 0.25, "goo walk", 1],
    ["Sticky Floor", "Squelch", 0.65, 0.25, 0.15, 0.3, 0.6, 0.2, "goo", 1],
    ["Stuck Boot", "Squelch", 0.2, 0.8, 0.25, 0.0, 0.3, 0.1, "mud slow", 1],
    ["Bubble Up", "Bloop", 0.45, 0.35, 0.6, 0.0, 0.3, 0.1, "water", 1],
    ["Goldfish", "Bloop", 0.7, 0.2, 0.85, 0.3, 0.4, 0.15, "water small", 1],
    ["Deep Sea Blip", "Bloop", 0.15, 0.5, 0.4, 0.0, 0.2, 0.1, "water big", 1],
    ["Bubble Scale", "Bloop", 0.55, 0.25, 0.5, 0.85, 0.4, 0.1, "music ui", 1],
    ["Drip Drop", "Bloop", 0.8, 0.15, 0.35, 0.2, 0.6, 0.1, "water small", 2],
    ["Squeaky Chair", "Raspberry", 0.6, 0.35, 0.2, 0.0, 0.55, 0.15, "funny", 1],
    ["Big Toot", "Raspberry", 0.2, 0.6, 0.55, 0.1, 0.4, 0.15, "funny big", 1],
    ["Balloon Let Go", "Raspberry", 0.55, 0.8, 0.3, 0.4, 0.6, 0.25, "balloon funny", 1],
    ["Wet Raspberry", "Raspberry", 0.45, 0.4, 1.0, 0.15, 0.65, 0.2, "funny", 1],
    ["Little Pfft", "Raspberry", 0.75, 0.15, 0.5, 0.0, 0.45, 0.15, "small funny", 1],
    ["Big Gulp", "Gulp", 0.2, 0.5, 0.5, 0.0, 0.35, 0.15, "body", 1],
    ["Thirsty", "Gulp", 0.4, 0.3, 0.6, 1.0, 0.4, 0.2, "drink", 1],
    ["Uh-Oh Gulp", "Gulp", 0.55, 0.35, 0.2, 0.0, 0.5, 0.1, "nervous", 1],
    ["Slurp Down", "Gulp", 0.35, 0.6, 0.9, 0.3, 0.4, 0.15, "drink", 1],
    ["Tiny Swallow", "Gulp", 0.8, 0.2, 0.2, 0.0, 0.3, 0.1, "small", 1],
    ["Grandpa Snore", "Snore", 0.1, 0.7, 0.1, 0.3, 0.3, 0.15, "sleep big", 1],
    ["Kitten Snore", "Snore", 0.85, 0.3, 0.6, 0.3, 0.25, 0.15, "sleep small", 1],
    ["Whistling Sleeper", "Snore", 0.35, 0.55, 0.3, 0.6, 1.0, 0.15, "sleep funny", 1],
    ["Deep Sleep", "Snore", 0.25, 0.6, 0.4, 1.0, 0.5, 0.2, "sleep", 1],
    ["Light Doze", "Snore", 0.55, 0.35, 0.8, 0.0, 0.2, 0.1, "sleep", 1],
    ["Gossip", "Babble", 0.55, 0.5, 0.6, 0.75, 0.6, 0.25, "voice", 1],
    ["Shopkeeper", "Babble", 0.4, 0.4, 0.35, 0.45, 0.55, 0.2, "voice character", 1],
    ["Grumpy Boss", "Babble", 0.08, 0.45, 0.4, 0.55, 0.4, 0.2, "voice angry", 1],
    ["Little Critters", "Babble", 1.0, 0.35, 0.75, 1.0, 0.75, 0.25, "voice small", 1],
    ["Phone Call", "Babble", 0.5, 0.55, 0.3, 0.5, 0.15, 0.2, "voice", 1],
    ["Not Again", "SadTrombone", 0.35, 0.45, 0.7, 0.5, 0.5, 0.05, "fail", 1],
    ["Epic Fail", "SadTrombone", 0.1, 1.0, 0.9, 1.0, 0.5, 0.05, "fail big", 1],
    ["Oops", "SadTrombone", 0.8, 0.15, 0.5, 0.2, 0.6, 0.05, "fail small", 1],
    ["Brassy Letdown", "SadTrombone", 0.45, 0.55, 0.2, 0.6, 0.85, 0.05, "fail", 1],
    ["Kazoo Birthday", "Kazoo", 0.5, 0.35, 0.3, 1.0, 0.55, 0.1, "music party", 1],
    ["Kazoo Question", "Kazoo", 0.45, 0.4, 0.9, 0.15, 0.65, 0.15, "voice funny", 1],
    ["Kazoo Grumble", "Kazoo", 0.15, 0.45, 0.5, 0.4, 0.8, 0.15, "funny", 1],
    ["Kazoo Victory", "Kazoo", 0.6, 0.25, 0.1, 0.45, 0.85, 0.05, "win", 1],
    ["Kazoo Wobble", "Kazoo", 0.45, 0.6, 1.0, 0.6, 0.7, 0.2, "funny", 1],
    ["Bulb Horn", "Honk", 0.4, 0.3, 0.6, 0.0, 0.55, 0.1, "horn funny", 1],
    ["Bicycle Toot", "Honk", 0.9, 0.2, 0.2, 0.0, 0.75, 0.1, "horn small", 1],
    ["Honk Honk Honk", "Honk", 0.5, 0.2, 0.4, 0.75, 0.65, 0.15, "horn", 1],
    ["Goose Honk", "Honk", 0.6, 0.35, 0.75, 0.3, 0.75, 0.2, "horn funny", 1],
    ["Flat Tyre Horn", "Honk", 0.25, 0.7, 1.0, 0.0, 0.4, 0.15, "horn fail", 1],
    ["Stand-Up Rimshot", "Rimshot", 0.5, 0.35, 0.3, 0.5, 0.6, 0.05, "joke music", 1],
    ["Lazy Rimshot", "Rimshot", 0.4, 0.7, 0.5, 0.5, 0.5, 0.05, "joke", 1],
    ["Snappy Rimshot", "Rimshot", 0.6, 0.15, 0.1, 0.5, 0.55, 0.05, "joke", 1],
    ["Cymbal Splash", "Rimshot", 0.5, 0.5, 0.3, 0.0, 0.85, 0.05, "music", 1],
    ["Triple Rimshot", "Rimshot", 0.55, 0.3, 0.25, 1.0, 0.65, 0.05, "joke", 1],
    ["Idea!", "XylophoneRun", 0.6, 0.2, 1.0, 0.3, 0.8, 0.05, "ui win", 1],
    ["Tumble Down", "XylophoneRun", 0.5, 0.35, 0.0, 0.75, 0.75, 0.05, "fall", 1],
    ["Climb the Ladder", "XylophoneRun", 0.4, 0.45, 1.0, 0.9, 0.7, 0.05, "jump", 1],
    ["Wooden Steps", "XylophoneRun", 0.2, 0.4, 0.5, 0.5, 0.2, 0.05, "music", 1],
    ["Tiny Run", "XylophoneRun", 0.85, 0.1, 1.0, 0.2, 0.9, 0.05, "ui small", 1],
    ["Dream Sequence", "HarpGlide", 0.4, 0.9, 0.5, 1.0, 0.45, 0.05, "magic", 1],
    ["Wake from a Dream", "HarpGlide", 0.45, 0.6, 0.0, 0.8, 0.5, 0.05, "magic", 1],
    ["Sparkly Sweep", "HarpGlide", 0.7, 0.3, 1.0, 0.4, 0.9, 0.05, "magic", 1],
    ["Low Strum", "HarpGlide", 0.15, 0.4, 1.0, 0.3, 0.4, 0.05, "music", 1],
    ["Angel Glide", "HarpGlide", 0.65, 0.7, 1.0, 0.7, 0.7, 0.05, "magic win", 1],
    ["Level Complete", "Fanfare", 0.5, 0.45, 0.1, 0.5, 0.7, 0.05, "win", 1],
    ["Champion", "Fanfare", 0.35, 0.8, 0.05, 1.0, 0.85, 0.05, "win big", 1],
    ["Almost a Win", "Fanfare", 0.4, 0.4, 1.0, 0.5, 0.55, 0.1, "fail funny", 1],
    ["Small Victory", "Fanfare", 0.6, 0.2, 0.15, 0.0, 0.6, 0.05, "win small", 1],
    ["Grand Entrance", "Fanfare", 0.3, 0.65, 0.2, 0.75, 0.75, 0.05, "win", 1],
    ["And the Winner Is", "DrumRoll", 0.5, 0.6, 0.4, 0.75, 0.6, 0.1, "win", 1],
    ["Suspense", "DrumRoll", 0.45, 1.0, 0.35, 0.0, 0.45, 0.1, "long", 1],
    ["Quick Roll", "DrumRoll", 0.65, 0.15, 0.15, 0.5, 0.7, 0.1, "short", 1],
    ["Marching Roll", "DrumRoll", 0.4, 0.4, 0.6, 0.5, 0.5, 0.1, "music", 1],
    ["Showtime", "DrumRoll", 0.5, 0.8, 0.5, 1.0, 0.75, 0.1, "win big", 1],
    ["Bonked Silly", "Birdies", 0.55, 0.55, 0.35, 0.6, 0.8, 0.2, "dizzy", 1],
    ["Morning Birds", "Birdies", 0.65, 0.7, 0.5, 0.75, 0.0, 0.2, "nature", 1],
    ["Little Tweet", "Birdies", 0.75, 0.25, 0.1, 0.0, 0.0, 0.15, "small", 1],
    ["Seeing Double", "Birdies", 0.5, 0.6, 0.6, 0.35, 0.6, 0.2, "dizzy", 1],
    ["Trilling Flock", "Birdies", 0.45, 0.75, 1.0, 1.0, 0.3, 0.2, "nature", 1],
    ["Pixie Dust", "Sparkle", 0.7, 0.4, 0.5, 0.6, 0.8, 0.2, "magic", 1],
    ["Treasure Shine", "Sparkle", 0.55, 0.3, 0.15, 0.35, 0.75, 0.15, "magic money", 1],
    ["Enchant", "Sparkle", 0.4, 0.75, 0.7, 0.85, 0.6, 0.2, "magic", 1],
    ["Star Pickup", "Sparkle", 0.8, 0.12, 0.05, 0.15, 0.7, 0.1, "ui win", 1],
    ["Wand Wave", "Sparkle", 0.5, 0.55, 0.9, 0.5, 0.85, 0.2, "magic", 1],
    ["Disappear", "Poof", 0.45, 0.45, 0.35, 0.0, 0.5, 0.15, "magic", 1],
    ["Cloud of Dust", "Poof", 0.25, 0.75, 0.75, 0.3, 0.35, 0.2, "fall", 1],
    ["Pop In", "Poof", 0.6, 0.2, 0.15, 0.0, 0.7, 0.15, "magic small", 1],
    ["Ninja Exit", "Poof", 0.5, 0.3, 0.4, 0.55, 0.6, 0.2, "magic fast", 1],
    ["Puff of Flour", "Poof", 0.65, 0.4, 1.0, 0.0, 0.3, 0.1, "kitchen soft", 1],
    ["Laser Blast", "Zap", 0.55, 0.25, 0.05, 0.0, 0.75, 0.1, "tech", 3],
    ["Bug Zapper", "Zap", 0.8, 0.2, 0.9, 0.35, 0.7, 0.2, "tech", 1],
    ["Shocked!", "Zap", 0.6, 0.35, 0.75, 0.1, 0.6, 0.15, "hurt", 1],
    ["Space Blaster", "Zap", 0.4, 0.4, 0.15, 0.65, 0.55, 0.1, "tech", 1],
    ["Tiny Spark", "Zap", 0.9, 0.06, 0.6, 0.0, 0.8, 0.15, "small", 1],
    ["Get the Upgrade", "PowerUp", 0.5, 0.35, 1.0, 0.6, 0.6, 0.05, "win ui", 1],
    ["Out of Battery", "PowerUp", 0.35, 0.8, 0.0, 0.0, 0.25, 0.05, "fail tech", 1],
    ["Super Jump", "PowerUp", 0.55, 0.2, 1.0, 0.0, 0.45, 0.05, "jump", 1],
    ["Shrink", "PowerUp", 0.6, 0.45, 0.0, 0.5, 0.7, 0.05, "magic", 1],
    ["Boot Up", "PowerUp", 0.3, 0.6, 1.0, 0.85, 0.85, 0.05, "tech", 1],
    ["Music Box Wind", "Ratchet", 0.6, 0.6, 0.25, 0.3, 0.8, 0.15, "toy", 1],
    ["Bike Freewheel", "Ratchet", 0.5, 0.8, 0.2, 0.8, 0.65, 0.15, "tech", 1],
    ["Jack Up the Car", "Ratchet", 0.3, 0.5, 0.1, 0.15, 0.5, 0.15, "metal", 1],
    ["Toy Robot Wind-Up", "Ratchet", 0.55, 0.45, 0.6, 0.45, 0.55, 0.2, "toy", 1],
    ["Dial Turn", "Ratchet", 0.75, 0.2, 0.7, 0.6, 0.6, 0.15, "ui click", 1],
    ["Sale!", "KaChing", 0.55, 0.45, 0.4, 0.3, 0.65, 0.1, "money win", 1],
    ["Piggy Bank", "KaChing", 0.7, 0.3, 0.8, 0.0, 0.55, 0.15, "money", 1],
    ["Big Payday", "KaChing", 0.5, 0.8, 1.0, 0.6, 0.7, 0.15, "money win big", 1],
    ["Shop Bell", "KaChing", 0.6, 0.5, 0.0, 0.5, 0.6, 0.05, "bell", 1],
    ["Tip Jar", "KaChing", 0.65, 0.25, 0.65, 0.0, 0.5, 0.1, "money small", 1],
    ["Rise and Shine", "AlarmRing", 0.45, 0.5, 0.25, 0.3, 0.6, 0.1, "alarm", 1],
    ["Fire Drill", "AlarmRing", 0.35, 0.85, 0.4, 0.6, 0.75, 0.1, "alarm panic", 1],
    ["Bike Bell", "AlarmRing", 0.85, 0.1, 0.1, 0.35, 0.7, 0.05, "bell small", 1],
    ["Boxing Bell", "AlarmRing", 0.25, 0.2, 0.05, 0.65, 0.6, 0.05, "bell fight", 1],
    ["Cheap Clock", "AlarmRing", 0.6, 0.4, 1.0, 0.3, 0.55, 0.15, "alarm funny", 1],  ];

  // Layered sounds and sounds with effects. Layers: [library sound, start (s), pan, volume]. fx: effect settings.
  const COMBOS = [
    { name: "Perfect Landing", tags: "jump fall funny", layers: [["Big Boing", 0], ["Body Fall", 0], ["Toy Squeak", 0.08, 0, 0.6]] },
    { name: "Pie in the Face", tags: "food face funny", layers: [["Throw Whoosh", 0, 0, 0.7], ["Pie Splat", 0.28]] },
    { name: "Bonked and Dizzy", tags: "head dizzy impact", layers: [["Head Bonk", 0], ["Bonked Silly", 0.18, 0, 0.7]] },
    { name: "Slip and Fall", tags: "fall funny", layers: [["Slide Whistle Down", 0], ["Heavy Thud", 0.88]] },
    { name: "Run Away!", tags: "run panic voice", layers: [["Panic Yelp", 0], ["Dash Off", 0.3, 0, 0.8]] },
    { name: "Magic Appear", tags: "magic", layers: [["Disappear", 0, 0, 0.8], ["Pixie Dust", 0.05, 0, 0.7]] },
    { name: "Coin Shower", tags: "money win", layers: [["Big Payday", 0], ["Treasure Shine", 0.1, 0, 0.6]] },
    { name: "Joke Bombed", tags: "joke fail music", layers: [["Stand-Up Rimshot", 0], ["Not Again", 0.75]] },
    { name: "Sneak, Then Squeak", tags: "sneak funny", layers: [["Creeping Burglar", 0], ["Tiny Squeak", 1.15]] },
    { name: "Spring Trap", tags: "spring jump", layers: [["Springboard", 0], ["Big Boing", 0.04, 0, 0.7]] },
    { name: "Robot Winds Down", tags: "tech fail", layers: [["Out of Battery", 0], ["Jack Up the Car", 0, 0, 0.5]] },
    { name: "Alarm Panic", tags: "alarm panic run", layers: [["Fire Drill", 0, 0, 0.7], ["Panic Yelp", 0.45, -0.35], ["Panic Run", 0.7, 0.35, 0.7]] },
    { name: "Shed Goes Down", tags: "big fall crash", layers: [["Cloud of Dust", 0, 0, 0.7], ["Tool Shed Collapse", 0.05]] },
    { name: "Victory Toot", tags: "win music", layers: [["Kazoo Victory", 0], ["Star Pickup", 0, 0, 0.6]] },
    { name: "Big Splash", tags: "water body", layers: [["Belly Flop", 0], ["Bubble Up", 0.25, 0, 0.6], ["Drip Drop", 0.6, 0.3, 0.5]] },
    { name: "Giant Footstep", tags: "big walk", layers: [["Heavy Thud", 0]], fx: { speed: { amount: 0.6 }, reverb: { kind: "hall", size: 0.7, mix: 0.3 } } },
    { name: "Chipmunk Chatter", tags: "voice small funny", layers: [["Gossip", 0]], fx: { speed: { amount: 1.6 } } },
    { name: "Robot Shopkeeper", tags: "voice tech", layers: [["Shopkeeper", 0]], fx: { retro: { bits: 0.6, rate: 0.5 }, vibrato: { rate: 9, depth: 0.25 } } },
    { name: "Haunted Door", tags: "door spooky", layers: [["Door Squeak", 0]], fx: { pitch: { semis: -5 }, reverb: { kind: "hall", size: 0.8, mix: 0.4 } } },
    { name: "Underwater Chatter", tags: "voice water", layers: [["Phone Call", 0], ["Bubble Up", 0.2, 0.3, 0.5]], fx: { highcut: { hz: 900 }, warble: { amount: 0.6 } } },
    { name: "Canyon Fall", tags: "fall voice", layers: [["Long Yelp", 0], ["Slide Whistle Long Fall", 0.1, 0, 0.7]], fx: { echo: { time: 0.32, feedback: 0.45, mix: 0.45 } } },
    { name: "Wahoo on the Radio", tags: "voice win", layers: [["Wahoo", 0]], fx: { lowcut: { hz: 450 }, highcut: { hz: 3200 }, crunch: { drive: 0.4, tone: 0.6 } } },
    { name: "Spring-Loaded Bonk", tags: "impact spring head", layers: [["Bonk on the Head", 0]], fx: { reverb: { kind: "spring", size: 0.6, mix: 0.45 } } },
    { name: "Slow-Motion Punch", tags: "impact fight slow", layers: [["Punch", 0]], fx: { speed: { amount: 0.55 }, reverb: { kind: "room", size: 0.5, mix: 0.25 } } },
  ];

  const GROUP_ORDER = ["Hits & crashes", "Springs & wobbles", "Movement", "Squishy & body", "Voices", "Musical stings", "Magic & tech", "Combos"];

  function soundOf(type, p, len, sq, bo, br, rnd, seed) {
    return S.clean({ type, pitch: p, length: len, squishiness: sq, bounce: bo, brightness: br, randomness: rnd, seed, volume: 0.9 });
  }

  function build() {
    const list = [], byName = {};
    const add = (e) => { e.id = "b:" + e.name; list.push(e); byName[e.name] = e; };
    const plain = (name, sound, tags, origin) => {
      const t = S.TYPE_BY_KEY[sound.type];
      add({ name, origin, type: t.name, typeKey: t.key, group: t.group, tags: tags.split(/\s+/).filter(Boolean), sound,
        recipe: X.defaultRecipe(sound, null) });
    };
    const takes = (n, name, type, p, len, sq, bo, br, rnd, seed, tags, origin) => {
      plain(name, soundOf(type, p, len, sq, bo, br, rnd, seed), tags, origin);
      for (let i = 2; i <= n; i++) plain(name + " " + i, soundOf(type, p, len, sq, bo, br, Math.max(rnd, 0.3), seed + i * 97), tags, origin);
    };
    for (const [, name, type, p, len, sq, bo, br, rnd, seed, tags, n] of UNITY) takes(n, name, type, p, len, sq, bo, br, rnd, seed, tags, "classic");
    const rowOf = {};
    for (const [name, type, p, len, sq, bo, br, rnd, tags, n] of NEW) {
      const k = (rowOf[type] = (rowOf[type] || 0) + 1);
      takes(n, name, type, p, len, sq, bo, br, rnd, 20000 + S.TYPE_BY_KEY[type].id * 100 + k, tags, "new");
    }
    for (const c of COMBOS) {
      const r = X.defaultRecipe(byName[c.layers[0][0]].sound, null);
      r.layers = c.layers.map(([ref, offset, pan, vol]) => {
        const src = byName[ref];
        if (!src) throw new Error("Library combo " + c.name + ": no sound called " + ref);
        const l = X.defaultLayer(Object.assign({}, src.sound, vol ? { volume: 0.9 * vol } : {}), null);
        l.offset = offset || 0; l.pan = pan || 0;
        return l;
      });
      for (const [k, v] of Object.entries(c.fx || {})) Object.assign(r.fx[k], v, { on: true });
      const types = [...new Set(c.layers.map(([ref]) => byName[ref].type))];
      add({ name: c.name, origin: "combo", type: types.join(" + "), typeKey: null, group: "Combos",
        tags: c.tags.split(/\s+/).concat(c.fx ? ["effects"] : ["layers"]), sound: null, recipe: X.cleanRecipe(r) });
    }
    for (const e of list) e.search = [e.name, e.type, e.group, e.tags.join(" ")].join(" ").toLowerCase();
    return list;
  }

  const LIBRARY = build();
  const api = { LIBRARY, GROUP_ORDER, UNITY, NEW, COMBOS, byId: Object.fromEntries(LIBRARY.map((e) => [e.id, e])) };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ComedyLibrary = api;
})(typeof self !== "undefined" ? self : this);
