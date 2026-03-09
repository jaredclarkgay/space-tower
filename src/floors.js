'use strict';

// ═══ FLOOR DEFINITIONS ═══
export const FD=[
  {name:'LOBBY',flanks:{left:'lobby-desk',right:'lobby-desk'},mods:[
    {id:'generator',nm:'Generator',ic:'\u26a1',col:'#5a6a3a',cost:80,sat:1,sell:40,desc:'Diesel backup. Rumbles.'},
    {id:'junction',nm:'Junction Box',ic:'\ud83d\udd0c',col:'#707880',cost:60,sat:1,sell:30,desc:'Twelve breakers. All labeled.'},
    {id:'transformer',nm:'Transformer',ic:'\ud83d\udd0b',col:'#606068',cost:100,sat:2,sell:50,desc:'Steps it down. Hums at 60Hz.'},
    {id:'cablerun',nm:'Cable Run',ic:'\ud83e\udea2',col:'#484850',cost:50,sat:1,sell:25,desc:'Copper and conduit. Tidy.'},
  ]},
  {name:'QUARTERS',flanks:{left:'corner-store',right:'diner'},mods:[
    {id:'bunk',nm:'Bunk Module',ic:'\ud83d\udecf',col:'#9a8a70',cost:80,sat:2,sell:40,desc:'Two beds, privacy curtain.'},
    {id:'locker',nm:'Locker Unit',ic:'\ud83d\udd12',col:'#7a8a9a',cost:60,sat:1,sell:30,desc:'Steel. Combination lock.'},
    {id:'shower',nm:'Shower Stall',ic:'\ud83d\udebf',col:'#88a0aa',cost:100,sat:3,sell:50,desc:'Hot water, 5 min max.'},
    {id:'readnook',nm:'Reading Nook',ic:'\ud83d\udcda',col:'#a08860',cost:70,sat:2,sell:35,desc:'Lamp and a worn cushion.'},
  ]},
  {name:'GARDEN',flanks:{left:'seed-bank',right:'tool-shed'},mods:[
    {id:'planter',nm:'Planter Bed',ic:'\ud83c\udf31',col:'#6a8a3a',cost:80,sat:3,sell:40,desc:'Raised cedar. Tomatoes.'},
    {id:'irrigation',nm:'Irrigation Sys',ic:'\ud83d\udca7',col:'#5a8aaa',cost:120,sat:2,sell:60,desc:'Drip lines. Timer valve.'},
    {id:'compost',nm:'Compost Bin',ic:'\u267b\ufe0f',col:'#7a6a3a',cost:60,sat:1,sell:30,desc:'Worms do the work.'},
    {id:'growlight',nm:'Grow Light Array',ic:'\ud83d\udca1',col:'#aa80cc',cost:150,sat:4,sell:75,desc:'UV spectrum. Pink glow.'},
  ]},
  {name:'RESEARCH',flanks:{left:'supply-closet',right:'whiteboard-room'},mods:[
    {id:'workstation',nm:'Workstation',ic:'\ud83d\udcbb',col:'#909898',cost:100,sat:2,sell:50,desc:'Dual monitors. Coffee ring.'},
    {id:'serverrack',nm:'Server Rack',ic:'\ud83d\uddbf',col:'#505868',cost:180,sat:3,sell:90,desc:'12U. Blinking forever.'},
    {id:'fumehood',nm:'Fume Hood',ic:'\ud83e\uddea',col:'#889090',cost:150,sat:2,sell:75,desc:'Ventilated. Safety glass.'},
    {id:'calibench',nm:'Calibration Bench',ic:'\ud83d\udd27',col:'#808080',cost:120,sat:2,sell:60,desc:'Precision tools. Steady hands.'},
  ]},
  {name:'RESTAURANT',flanks:{left:'host-stand',right:'bar'},mods:[
    {id:'kitchen',nm:'Kitchen Station',ic:'\ud83c\udf73',col:'#a09080',cost:150,sat:4,sell:75,desc:'Gas burners. Extraction fan.'},
    {id:'booth',nm:'Dining Booth',ic:'\ud83c\udf7d',col:'#8a7a60',cost:80,sat:2,sell:40,desc:'Red vinyl. Window seat.'},
    {id:'bartap',nm:'Bar Tap',ic:'\ud83c\udf7a',col:'#6a5a48',cost:100,sat:3,sell:50,desc:'Three on tap. Local stuff.'},
    {id:'pantry',nm:'Pantry Shelf',ic:'\ud83e\uddf1',col:'#7a6a50',cost:60,sat:1,sell:30,desc:'Canned goods. Dry stock.'},
  ]},
  {name:'LOUNGE',flanks:{left:'vending',right:'newsstand'},mods:[
    {id:'sofa',nm:'Sofa Set',ic:'\ud83d\udecb',col:'#887868',cost:90,sat:3,sell:45,desc:'Leather. Broken in right.'},
    {id:'bookshelf',nm:'Bookshelf Unit',ic:'\ud83d\udcda',col:'#7a6a58',cost:70,sat:2,sell:35,desc:'Dog-eared everything.'},
    {id:'musiccorner',nm:'Music Corner',ic:'\ud83c\udfb5',col:'#6a6a78',cost:120,sat:4,sell:60,desc:'Speakers and a turntable.'},
    {id:'chess',nm:'Chess Table',ic:'\u265e',col:'#606058',cost:80,sat:2,sell:40,desc:'Board inlaid. Clock ticking.'},
  ]},
  {name:'OBSERVATION',flanks:{left:'pharmacy',right:'intake-desk'},mods:[
    {id:'viewbench',nm:'Viewing Bench',ic:'\ud83e\ude91',col:'#8090a0',cost:70,sat:2,sell:35,desc:'Best seat in the tower.'},
    {id:'telescope',nm:'Telescope Mount',ic:'\ud83d\udd2d',col:'#606878',cost:160,sat:4,sell:80,desc:'Coin-operated. Honor system.'},
    {id:'displaywall',nm:'Display Wall',ic:'\ud83d\udcfa',col:'#404858',cost:140,sat:3,sell:70,desc:'LED mosaic. Altitude feed.'},
    {id:'skymap',nm:'Sky Map',ic:'\ud83c\udf0c',col:'#383848',cost:100,sat:2,sell:50,desc:'Constellations. Touch to learn.'},
  ]},
  {name:'STORAGE',flanks:{left:'armory',right:'quartermaster'},mods:[
    {id:'cargorack',nm:'Cargo Rack',ic:'\ud83d\udce6',col:'#888078',cost:60,sat:1,sell:30,desc:'Steel shelving. 400kg rated.'},
    {id:'freezer',nm:'Freezer Unit',ic:'\u2744\ufe0f',col:'#88a0b8',cost:140,sat:3,sell:70,desc:'Sub-zero. Frost on the glass.'},
    {id:'conveyor',nm:'Conveyor',ic:'\u2699\ufe0f',col:'#707068',cost:120,sat:2,sell:60,desc:'Belt and rollers. Motorized.'},
    {id:'manifest',nm:'Manifest Terminal',ic:'\ud83d\udccb',col:'#607060',cost:100,sat:2,sell:50,desc:'Tracks every crate.'},
  ]},
  {name:'OBSERVATORY',flanks:{left:'gift-shop',right:'telescope-booth'},mods:[
    {id:'startracker',nm:'Star Tracker',ic:'\u2b50',col:'#506070',cost:200,sat:5,sell:100,desc:'Locks on. Never loses it.'},
    {id:'dataterminal',nm:'Data Terminal',ic:'\ud83d\udcbb',col:'#404858',cost:120,sat:2,sell:60,desc:'Streams from the dish.'},
    {id:'lensarray',nm:'Lens Array',ic:'\ud83d\udd0d',col:'#586068',cost:180,sat:4,sell:90,desc:'Ground and polished by hand.'},
    {id:'chartdesk',nm:'Chart Desk',ic:'\ud83d\uddfa',col:'#505848',cost:90,sat:2,sell:45,desc:'Star charts in three languages.'},
  ]},
  {name:'COMMAND',flanks:{left:'comms-closet',right:'records-room'},mods:[
    {id:'commstation',nm:'Comm Station',ic:'\ud83d\udce1',col:'#505860',cost:160,sat:3,sell:80,desc:'"Ground to Tower One."'},
    {id:'radar',nm:'Radar Console',ic:'\ud83d\udce1',col:'#404850',cost:200,sat:4,sell:100,desc:'Sweep. Blip. Sweep.'},
    {id:'statuswall',nm:'Status Wall',ic:'\ud83d\udcca',col:'#384048',cost:150,sat:3,sell:75,desc:'Nine panels. One per floor.'},
    {id:'navcomputer',nm:'Nav Computer',ic:'\ud83e\udded',col:'#303840',cost:180,sat:5,sell:90,desc:'Plots the course upward.'},
  ]},
];

// ═══ BUILDOUT STAGES ═══
// Each floor has 5 stages. Each stage: {x, label, msg:[title, body]}
// x = world-space position of the interaction point
export const STAGES=[
  // Floor 0: LOBBY — first point near front door, then sweep right
  [
    {x:-1500, label:'Junction Box',   msg:['\u26a1 POWER ON','LOBBY \u2014 Emergency lighting engaged.']},
    {x:-800,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Entrance doors and reception divider installed.']},
    {x:-200,  label:'Intercom Panel', msg:['\u2699 SYSTEMS','Intercom online. Directory board lit.']},
    {x:600,   label:'Furnish',        msg:['\ud83e\ude91 FURNISH','Reception desk, bench, and clock placed.']},
    {x:1300,  label:'Open Doors',     msg:['\ud83c\udfe2 LOBBY OPEN','The tower accepts its first visitor.']},
  ],
  // Floor 1: QUARTERS
  [
    {x:-1400, label:'Junction Box',   msg:['\u26a1 POWER ON','QUARTERS \u2014 Hallway lighting warm.']},
    {x:-700,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Partition walls rise. Bunk rooms take shape.']},
    {x:-200,  label:'Plumbing',       msg:['\u2699 SYSTEMS','Pipes connected. Running water.']},
    {x:550,   label:'Furnish',        msg:['\ud83e\ude91 FURNISH','Bunk beds, lockers, a photo on a nightstand.']},
    {x:1300,  label:'First Resident', msg:['\ud83c\udfe0 QUARTERS OPEN','Someone lives here now.']},
  ],
  // Floor 2: GARDEN
  [
    {x:-1400, label:'Junction Box',   msg:['\u26a1 POWER ON','GARDEN \u2014 UV grow lights spread pink-purple.']},
    {x:-750,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Raised planter beds. Irrigation channels cut.']},
    {x:-200,  label:'Water Recycler', msg:['\u2699 SYSTEMS','Mist appears. Climate control hums.']},
    {x:600,   label:'Plant Seeds',    msg:['\ud83e\ude91 FURNISH','Green appears \u2014 seedlings, herbs, soil.']},
    {x:1350,  label:'First Harvest',  msg:['\ud83c\udf45 GARDEN OPEN','One red tomato on a vine. The tower feeds itself.']},
  ],
  // Floor 3: RESEARCH
  [
    {x:-1350, label:'Junction Box',   msg:['\u26a1 POWER ON','RESEARCH \u2014 Clean, flicker-free power.']},
    {x:-650,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Lab benches, safety glass, fume hood frames.']},
    {x:-200,  label:'Server Rack',    msg:['\u2699 SYSTEMS','Blinking lights. Monitors boot with data.']},
    {x:550,   label:'Instruments',    msg:['\ud83e\ude91 FURNISH','Microscopes, soldering stations, coffee mug.']},
    {x:1300,  label:'First Data',     msg:['\ud83d\udcca RESEARCH OPEN','Data streams across displays. The tower is thinking.']},
  ],
  // Floor 4: RESTAURANT
  [
    {x:-1400, label:'Junction Box',   msg:['\u26a1 POWER ON','RESTAURANT \u2014 Kitchen circuits energize.']},
    {x:-700,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Panoramic windows. The bar counter materializes.']},
    {x:-200,  label:'Kitchen Hookup', msg:['\u2699 SYSTEMS','Gas lines, ventilation. The kitchen lives.']},
    {x:600,   label:'Set Tables',     msg:['\ud83e\ude91 FURNISH','Tables with cloths, pendant lights, bottles on shelves.']},
    {x:1350,  label:'First Guest',    msg:['\ud83c\udf7d RESTAURANT OPEN','Someone sits down. Looks out the window. Orders something.']},
  ],
  // Floor 5: LOUNGE
  [
    {x:-1350, label:'Junction Box',   msg:['\u26a1 POWER ON','LOUNGE \u2014 Dimmer system. Mood lighting.']},
    {x:-650,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Reading nooks, conversation alcoves. Cozy geometry.']},
    {x:-200,  label:'Speakers',       msg:['\u2699 SYSTEMS','Sound system wired. Subtle air circulation.']},
    {x:550,   label:'Furnish',        msg:['\ud83e\ude91 FURNISH','Worn leather sofa, dog-eared books, a chess set.']},
    {x:1300,  label:'Play Music',     msg:['\ud83c\udfb5 LOUNGE OPEN','Music plays. The tower exhales.']},
  ],
  // Floor 6: OBSERVATION
  [
    {x:-1400, label:'Junction Box',   msg:['\u26a1 POWER ON','OBSERVATION \u2014 Soft, diffused ambient glow.']},
    {x:-700,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Floor-to-ceiling panoramic glass. Viewing alcoves.']},
    {x:-200,  label:'Display Panels', msg:['\u2699 SYSTEMS','Display panels mount and power on. Waiting.']},
    {x:600,   label:'Furnish',        msg:['\ud83e\ude91 FURNISH','Benches, telescoping viewers, plants. A blank mural wall.']},
    {x:1350,  label:'Activate Panel', msg:['\ud83d\udd2d OBSERVATION OPEN','The view from up here changes you.']},
  ],
  // Floor 7: STORAGE
  [
    {x:-1350, label:'Junction Box',   msg:['\u26a1 POWER ON','STORAGE \u2014 Heavy industrial yellow.']},
    {x:-650,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Steel racks anchored. Loading dock framed.']},
    {x:-200,  label:'Inventory',      msg:['\u2699 SYSTEMS','Freezer hum. Scanners online. Manifests loaded.']},
    {x:550,   label:'Stock Shelves',  msg:['\ud83e\ude91 FURNISH','Crates labeled by floor. Organized chaos.']},
    {x:1300,  label:'Ship It',        msg:['\ud83d\udce6 STORAGE OPEN','Supply chain operational.']},
  ],
  // Floor 8: OBSERVATORY
  [
    {x:-1400, label:'Junction Box',   msg:['\u26a1 POWER ON','OBSERVATORY \u2014 Ultra-clean precision power.']},
    {x:-700,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Telescope housing. A section of ceiling opens.']},
    {x:-200,  label:'Calibrate',      msg:['\u2699 SYSTEMS','Telescope aligns. Star charts boot.']},
    {x:600,   label:'Furnish',        msg:['\ud83e\ude91 FURNISH','Chairs angled upward, data terminals, warm blankets.']},
    {x:1350,  label:'First Light',    msg:['\ud83d\udd2d OBSERVATORY OPEN','The telescope locks on. A point of light.']},
  ],
  // Floor 9: COMMAND
  [
    {x:-1350, label:'Junction Box',   msg:['\u26a1 POWER ON','COMMAND \u2014 Main bus connection. The tower unifies.']},
    {x:-650,  label:'Frame Out',      msg:['\ud83c\udfd7 STRUCTURE','Command console, comms array, the situation table.']},
    {x:-200,  label:'Status Panels',  msg:['\u2699 SYSTEMS','Nine status panels light up \u2014 one per floor below.']},
    {x:550,   label:'The Chair',      msg:['\ud83e\ude91 FURNISH','Navigation charts, comms equipment. The chair.']},
    {x:1300,  label:'Take Command',   msg:['\ud83d\udc51 COMMAND OPEN','You sit. Every floor visible. "You built all this?"']},
  ],
];

// Floor visual themes - wall tint + accent
export const FTHEME=[
  {wall:'#d8d0c4',dark:'#3a3830',accent:'rgba(180,160,120,0.08)'}, // LOBBY - warm neutral
  {wall:'#d4c8b8',dark:'#3a3428',accent:'rgba(200,170,130,0.08)'}, // QUARTERS - warm wood
  {wall:'#c8d8c0',dark:'#2a3828',accent:'rgba(120,180,100,0.1)'},  // GARDEN - green tint
  {wall:'#d0d0d8',dark:'#30303a',accent:'rgba(140,140,180,0.08)'}, // RESEARCH - cool gray
  {wall:'#d8d0c0',dark:'#3a3020',accent:'rgba(200,170,120,0.1)'},  // RESTAURANT - warm amber
  {wall:'#d4ccc4',dark:'#36302a',accent:'rgba(170,150,130,0.08)'}, // LOUNGE - cozy warm
  {wall:'#d4d8dc',dark:'#303438',accent:'rgba(160,180,200,0.1)'},  // OBSERVATION - deep glass blue
  {wall:'#ccc8c0',dark:'#34322e',accent:'rgba(150,140,120,0.08)'}, // STORAGE - industrial
  {wall:'#c8ccd4',dark:'#282c34',accent:'rgba(120,140,170,0.1)'},  // OBSERVATORY - deep blue
  {wall:'#c4c4cc',dark:'#2a2a32',accent:'rgba(130,130,160,0.1)'},  // COMMAND - dark slate
];

// ═══ OBJECTS & NPC DATA ═══
export const OD={
 0:[{nm:'Reception Desk',w:70,h:32,c:'#b0a48a',m:['Brass: "WELCOME TO TOWER ONE."']},{nm:'Directory Board',w:34,h:48,c:'#8a8a84',m:['Floors 6-10: "UNDER CONSTRUCTION."']},{nm:'Waiting Bench',w:58,h:18,c:'#a09480',m:['"DAY 1. WE DID IT."']}],
 1:[{nm:'Bunk Bed',w:62,h:44,c:'#a09480',m:['Photo — a beach somewhere warm.']},{nm:'Locker',w:24,h:52,c:'#8090a0',m:['Stickers: mission patch.']}],
 2:[{nm:'Planter Box',w:66,h:36,c:'#6a9a5a',m:['Tomatoes, basil.']},{nm:'Water Feature',w:36,h:46,c:'#80aac0',m:['Recirculating fountain.']}],
 3:[{nm:'Workbench',w:70,h:34,c:'#909090',m:['Wire strippers, solder.']},{nm:'Server Rack',w:28,h:56,c:'#606870',m:['Blinking in sequence.']}],
 4:[{nm:'Dining Table',w:58,h:26,c:'#b8a890',m:['"Reserved — Bellefleur."']},{nm:'Bar Counter',w:82,h:36,c:'#7a6a58',m:['Taps from elevator parts.']}],
 5:[{nm:'Sofa',w:70,h:26,c:'#908880',m:['Worn leather. The good kind.']},{nm:'Bookshelf',w:36,h:56,c:'#7a6a58',m:['Every page dog-eared.']}],
 6:[{nm:'Viewing Bench',w:62,h:22,c:'#8090a0',m:['Best seat in the tower.']},{nm:'Display Panel',w:42,h:48,c:'#505868',m:['Waiting for a signal.']}],
 7:[{nm:'Cargo Crate',w:54,h:42,c:'#989080',m:['400kg miscellaneous.']},{nm:'Shelving',w:42,h:56,c:'#888880',m:['Water filters.']}],
 8:[{nm:'Telescope',w:28,h:54,c:'#708090',m:['Almost see the curvature.']},{nm:'Star Chart',w:42,h:40,c:'#404050',m:['Three languages.']}],
 9:[{nm:'Control Console',w:76,h:36,c:'#505058',m:['Sticky note: "DON\'T."']},{nm:'Comms Station',w:42,h:46,c:'#606068',m:['"Ground to Tower One."']}],
};
