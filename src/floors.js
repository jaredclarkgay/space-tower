'use strict';

// ═══ FLOOR DEFS & MODULES ═══
export const FD=[
 {name:'LOBBY',mods:[
  {id:'coal',nm:'Coal Generator',ic:'⚫',cost:{credits:10},prod:{energy:50},sat:-5,col:'#4a3428',desc:'Cheap power, dirty',sell:5},
  {id:'solar',nm:'Solar Panel',ic:'🟧',cost:{credits:30},prod:{energy:30},sat:10,col:'#ff9500',desc:'Clean sun energy',sell:15},
  {id:'batt',nm:'Battery Bank',ic:'🔋',cost:{credits:20,energy:10},prod:{},sat:5,col:'#1e90ff',desc:'+10% energy efficiency',sell:10,eff:0.1},
 ],unlock:null},
 {name:'QUARTERS',mods:[
  {id:'apts',nm:'Apartments',ic:'🏠',cost:{credits:25,energy:20},prod:{population:30},sat:5,col:'#d4a574',desc:'Housing',sell:12},
  {id:'work',nm:'Workstations',ic:'💼',cost:{credits:20,energy:15},prod:{credits:15},sat:0,col:'#708090',desc:'Offices',sell:10},
  {id:'tree',nm:'Central Tree',ic:'🌳',cost:{credits:50,energy:30},prod:{},sat:25,col:'#228b22',desc:'Morale boost',sell:25},
  {id:'amen',nm:'Amenities',ic:'🪴',cost:{credits:35},prod:{},sat:15,col:'#90ee90',desc:'Lounge, gym',sell:17},
 ],unlock:null},
 {name:'GARDEN',mods:[
  {id:'hydro',nm:'Hydroponic Bay',ic:'🥬',cost:{credits:40,energy:25},prod:{population:15},sat:15,col:'#4a8a3a',desc:'Grow food',sell:20},
  {id:'glow',nm:'Grow Lights',ic:'💡',cost:{credits:25,energy:15},prod:{},sat:10,col:'#c0a0d0',desc:'Full spectrum',sell:12},
  {id:'recycle',nm:'Water Recycler',ic:'💧',cost:{credits:45,energy:20},prod:{},sat:20,col:'#60a0c0',desc:'Satisfaction',sell:22},
 ],unlock:{energy:15}},
 {name:'RESEARCH',mods:[
  {id:'lab',nm:'Lab Station',ic:'🔬',cost:{credits:50,energy:30},prod:{energy:40},sat:0,col:'#909090',desc:'Energy R&D',sell:25},
  {id:'srv',nm:'Server Cluster',ic:'🖥️',cost:{credits:60,energy:40},prod:{credits:20},sat:-5,col:'#606870',desc:'Data processing',sell:30},
  {id:'sens',nm:'Sensor Array',ic:'📡',cost:{credits:35,energy:20},prod:{energy:25},sat:5,col:'#889888',desc:'Monitoring',sell:17},
 ],unlock:{energy:30,sat:40}},
 {name:'RESTAURANT',mods:[
  {id:'kitch',nm:'Kitchen',ic:'🍳',cost:{credits:55,energy:30},prod:{credits:25},sat:15,col:'#b8a890',desc:'Good food',sell:27},
  {id:'bar',nm:'Bar',ic:'🍷',cost:{credits:40,energy:15},prod:{credits:15},sat:20,col:'#7a6a58',desc:'Social hub',sell:20},
  {id:'dine',nm:'Dining Setup',ic:'🪑',cost:{credits:30,energy:10},prod:{},sat:15,col:'#a09070',desc:'Formal dining',sell:15},
 ],unlock:{energy:40,population:20}},
 {name:'LOUNGE',mods:[
  {id:'rec',nm:'Recreation',ic:'🎮',cost:{credits:45,energy:20},prod:{},sat:25,col:'#908880',desc:'Games',sell:22},
  {id:'lib',nm:'Library',ic:'📚',cost:{credits:35,energy:10},prod:{},sat:15,col:'#7a6a58',desc:'Quiet reading',sell:17},
  {id:'music',nm:'Music System',ic:'🎵',cost:{credits:50,energy:25},prod:{},sat:20,col:'#6a5a4a',desc:'Audio system',sell:25},
 ],unlock:{energy:60,population:40,sat:50}},
 {name:'MEDICAL',mods:[
  {id:'med',nm:'Med Bay',ic:'🏥',cost:{credits:70,energy:40},prod:{population:10},sat:15,col:'#b8bcc0',desc:'Healthcare',sell:35},
  {id:'pharm',nm:'Pharmacy',ic:'💊',cost:{credits:50,energy:20},prod:{},sat:10,col:'#98a0aa',desc:'Medicine',sell:25},
  {id:'ther',nm:'Therapy Suite',ic:'🧘',cost:{credits:60,energy:25},prod:{},sat:25,col:'#a0b8c0',desc:'Mental health',sell:30},
 ],unlock:{energy:80,population:60}},
 {name:'STORAGE',mods:[
  {id:'ware',nm:'Warehouse',ic:'📦',cost:{credits:40,energy:15},prod:{credits:20},sat:0,col:'#989080',desc:'Logistics',sell:20},
  {id:'cold',nm:'Cold Storage',ic:'❄️',cost:{credits:55,energy:35},prod:{population:10},sat:5,col:'#a0b8c8',desc:'Preservation',sell:27},
  {id:'dock',nm:'Loading Dock',ic:'🚛',cost:{credits:45,energy:20},prod:{credits:15},sat:-5,col:'#888880',desc:'Profitable',sell:22},
 ],unlock:{energy:100,population:80,sat:55}},
 {name:'OBSERVATORY',mods:[
  {id:'tele',nm:'Telescope Array',ic:'🔭',cost:{credits:80,energy:50},prod:{energy:30},sat:20,col:'#708090',desc:'Stars + data',sell:40},
  {id:'data',nm:'Data Center',ic:'💾',cost:{credits:70,energy:45},prod:{credits:30},sat:0,col:'#505860',desc:'Processing',sell:35},
  {id:'ant',nm:'Antenna',ic:'📡',cost:{credits:60,energy:30},prod:{energy:20},sat:10,col:'#606870',desc:'Comms relay',sell:30},
 ],unlock:{energy:120,population:100}},
 {name:'COMMAND',mods:[
  {id:'comms',nm:'Comms Hub',ic:'📻',cost:{credits:100,energy:60},prod:{energy:40},sat:10,col:'#505058',desc:'Communications',sell:50},
  {id:'nav',nm:'Navigation',ic:'🧭',cost:{credits:90,energy:50},prod:{credits:25},sat:15,col:'#606068',desc:'Orbital plan',sell:45},
  {id:'strat',nm:'Strategic Console',ic:'🎯',cost:{credits:120,energy:70},prod:{energy:30,credits:20},sat:10,col:'#707078',desc:'Command',sell:60},
 ],unlock:{energy:180,population:120,sat:65}},
];

// Floor visual themes - wall tint + accent
export const FTHEME=[
  {wall:'#d8d0c4',dark:'#3a3830',accent:'rgba(180,160,120,0.08)'}, // LOBBY - warm neutral
  {wall:'#d4c8b8',dark:'#3a3428',accent:'rgba(200,170,130,0.08)'}, // QUARTERS - warm wood
  {wall:'#c8d8c0',dark:'#2a3828',accent:'rgba(120,180,100,0.1)'},  // GARDEN - green tint
  {wall:'#d0d0d8',dark:'#30303a',accent:'rgba(140,140,180,0.08)'}, // RESEARCH - cool gray
  {wall:'#d8d0c0',dark:'#3a3020',accent:'rgba(200,170,120,0.1)'},  // RESTAURANT - warm amber
  {wall:'#d4ccc4',dark:'#36302a',accent:'rgba(170,150,130,0.08)'}, // LOUNGE - cozy warm
  {wall:'#d4d8dc',dark:'#303438',accent:'rgba(160,180,200,0.1)'},  // MEDICAL - sterile blue
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
 6:[{nm:'Exam Table',w:62,h:32,c:'#b8bcc0',m:['Fresh paper roll.']},{nm:'Supply Cabinet',w:32,h:54,c:'#98a0aa',m:['Antacids everywhere.']}],
 7:[{nm:'Cargo Crate',w:54,h:42,c:'#989080',m:['400kg miscellaneous.']},{nm:'Shelving',w:42,h:56,c:'#888880',m:['Water filters.']}],
 8:[{nm:'Telescope',w:28,h:54,c:'#708090',m:['Almost see the curvature.']},{nm:'Star Chart',w:42,h:40,c:'#404050',m:['Three languages.']}],
 9:[{nm:'Control Console',w:76,h:36,c:'#505058',m:['Sticky note: "DON\'T."']},{nm:'Comms Station',w:42,h:46,c:'#606068',m:['"Ground to Tower One."']}],
};
