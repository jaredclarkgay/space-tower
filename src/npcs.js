'use strict';

export const HN=['Kai','Mira','Soren','Lena','Dev','Priya','Tomás','Asha','Reese','Yuki','Omar','Zara'];
export const HC=['#4a7a6a','#7a6050','#506070','#6a5060','#5a7050','#607080','#8a6050','#506a5a'];
export const AN=['Zix','Plorp','Quill','Bleen','Nyx','Vroo'];
export const AC=['#FF5722','#FFEB3B','#4CAF50','#E91E63','#00BCD4','#FF9800','#9C27B0','#8BC34A'];
export const BP2=[{b:'#2a1810',h:'#e8c898',cl:'#2e3c4a',sh:'#1e2c3a'},{b:'#1a1a28',h:'#d4a878',cl:'#3a3040',sh:'#2a2030'},{b:'#4a3020',h:'#f0d0a8',cl:'#1e3028',sh:'#142018'},{b:'#5a3a1a',h:'#c49870',cl:'#4a3a2a',sh:'#3a2a1a'}];
export const BN2=['Chen','Park','Vasquez','Andersson','Obi','Tanaka','Moreau','Singh'];
export const HM=[
  [n=>`${n} nods. "Hey."`,n=>`"You work on this floor? I keep getting lost."`,n=>`"I've been taking the stairs. The elevator line is genuinely insane."`],
  [n=>`"Watch out," ${n} says, stepping aside.`,n=>`"The hallway gets really narrow by the copy room."`,n=>`"Someone left a box there three weeks ago. We just walk around it now."`],
  [n=>`${n} glances at you. "You seen the kitchen?"`,n=>`"Second one they've set up. First one flooded somehow."`,n=>`"I don't know how. I'm not asking."`],
  [n=>`"Sorry," says ${n}, not looking up.`,n=>`"I thought you were someone else. The lighting in here is terrible."`,n=>`"They said they'd fix it. That was week one."`],
  [n=>`${n} is eating lunch standing up.`,n=>`"All the chairs are in the conference room. There's a call."`,n=>`"There's always a call."`],
  [n=>`"Do you know where HR is?" ${n} asks.`,n=>`"Someone told me floor four but floor four is all boxes."`,n=>`"I'm starting to think HR might not exist yet."`],
];
export const AM=[
  [n=>`${n} blinks sideways. "Interesting."`,n=>`"Your species builds upward when anxious. We noticed."`,n=>`"Where we come from, we build inward. But your way has... charm."`],
  [n=>`${n} hums a frequency you feel in your teeth.`,n=>`"Sorry. Thinking out loud. Your atmosphere carries sound differently."`,n=>`"On my world, that melody means 'almost home.' Felt appropriate."`],
  [n=>`"You are the builder?" ${n} asks, tilting.`,n=>`"We have a word for what you do. Closest translation: 'stacking hope.'"`,n=>`"It is meant as a compliment. Mostly."`],
  [n=>`${n} is examining the wall with great interest.`,n=>`"Your concrete is charming. Very... permanent."`,n=>`"We build with light. But light doesn't keep the rain out, does it."`],
];
export const BM=[
  [n=>`${n} is staring at a spreadsheet. "This can't be right."`,n=>`"Someone filed the Q2 projections under 'miscellaneous.' Miscellaneous!"`,n=>`"I've been here three weeks and I still can't find the bathroom on this floor."`],
  [n=>`"Hold on," ${n} says, typing furiously.`,n=>`"My calendar has me in four meetings at once today. Four."`,n=>`"I told them I'd be more productive up here. Now I just have meetings with a better view."`],
  [n=>`${n} is on a call. You catch: "...no, the OTHER printer..."`,n=>`They hang up. "Sorry. We have two printers and somehow neither works."`,n=>`"Facilities says they're 'looking into it.' That was two weeks ago."`],
  [n=>`"Have you tried the coffee yet?" ${n} asks.`,n=>`"Don't. It's from a machine on floor one and it tastes like it traveled up here by foot."`,n=>`"Someone's bringing a French press tomorrow. I'm treating it like a national holiday."`],
  [n=>`${n} sighs. "Third all-hands this month."`,n=>`"Same slides every time. 'Exciting trajectory.' 'Aligned on priorities.'"`,n=>`"I made a bingo card. I've won twice."`],
  [n=>`"Do you know who booked the big conference room until Friday?" ${n} asks.`,n=>`"We've got six people standing in the hallway with nowhere to go."`,n=>`"We just kind of... gathered by the window. It became a meeting by accident."`],
  [n=>`${n} is eating lunch at their desk. "Don't tell anyone."`,n=>`"There's a 'no food at workstations' policy. Someone put up a sign."`,n=>`"I put up the sign. I'm also violating the sign. Life is complicated."`],
  [n=>`"The elevator is down again," ${n} says flatly.`,n=>`"Third time this week. I've started timing my trips to avoid peak hours."`,n=>`"I made a spreadsheet. It helps. I have a lot of spreadsheets."`],
  [n=>`${n} lowers their voice. "Between us — who approved this floor plan?"`,n=>`"My desk faces a load-bearing column. Directly. I see column, column sees me."`,n=>`"I've named it Gerald. Gerald and I have an understanding."`],
  [n=>`"We're getting a ping pong table," ${n} announces.`,n=>`"Management approved it last week. No one asked for it but here we are."`,n=>`"We don't have enough chairs but we're getting a ping pong table. This is fine."`],
  [n=>`${n} is squinting at their monitor. "Is this font smaller than yesterday?"`,n=>`"Someone updated the office template. Everything's 9pt now."`,n=>`"I sent a message about it. To the wrong thread. Now forty people know I'm struggling with fonts."`],
  [n=>`"Good news," ${n} says, not looking up.`,n=>`"They fixed the thermostat on this floor."`,n=>`"Bad news: they fixed it to 'cold.' Apparently that was a choice someone made."`],
];

// Construction worker names & dialogue
export const CWN=['Rodriguez','Kim','Murphy','Okafor','Dubois','Petrov'];
export const CWM=[
  [n=>`${n} wipes sweat. "Another floor, another miracle."`,n=>`"You know how heavy a steel beam is at this altitude? Same as ground level. But it FEELS heavier."`,n=>`"My grandpa built bridges. I build towers to space. He'd lose his mind."`],
  [n=>`"Watch your step up here," ${n} says.`,n=>`"We had a guy drop a wrench from floor eight last week. Took four seconds to hit ground."`,n=>`"Four seconds. That's how high we are. Four seconds of falling."`],
  [n=>`${n}: "Crane's acting up again."`,n=>`"Everything works different up here. Wind, temperature, the bolts expand weird."`,n=>`"But we figure it out. That's the job. Figure it out, bolt it down, move up."`],
  [n=>`"Ten floors," ${n} says. "Then they want ten more."`,n=>`"I signed on for the first segment. 'Goodbye Earth,' they call it."`,n=>`"Funny name for a construction project. But I get it. I look down less now."`],
];
