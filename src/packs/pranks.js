import { section } from './_kit.js';
import { mk, rnd } from './_pool.js';
// Pranks: harmless, in-chat text only. Nothing is sent anywhere, no calls, no SMS, no real-looking threats or scams.
// Every output is clearly marked as a joke so nobody is misled.
const E = [];
const b = mk(E);
const TAG = '\n(prank, just for fun)';
const who = (t) => (t || 'you').slice(0, 40).replace(/[\r\n]+/g, ' ');
const add = (name, desc, fn) => b(name, desc, `${name} [name]`, (a, t) => fn(who(t)) + TAG, [['Sam', (o) => o.endsWith('(prank, just for fun)') && o.includes('Sam')]], 0);
const addAny = (name, desc, fn) => b(name, desc, `${name} [name]`, (a, t) => fn(who(t)) + TAG, [['Sam', (o) => o.endsWith('(prank, just for fun)')]], 0);
// 1. fake scans: scan<thing>
const SCANS = 'snacks:found 3 hidden packets of biscuits|laziness:level is dangerously relaxed|sleepiness:battery at 4 percent|procrastination:task postponed 12 times today|hunger:stomach says feed me|coffee:needs a refill urgently|homework:not started, deadline vibes detected|mood:80 percent good, 20 percent chai|brain:loading... 99 percent memes|fridge:one lonely lemon found|wifi:signal strong in the kitchen only|charger:never where you need it|alarm:snoozed 5 times|selfie:angle count 47|gossip:spicy level medium|excuse:level creative|dreams:mostly about food|socks:one is missing, as always|pocket:found 2 rupees and a receipt|shoes:left one is judging the right one|bag:contains 14 pens, 0 working|diet:starts Monday, reschedules weekly|memes:overstocked|stress:needs a snack break|talent:detected, hiding well|energy:Monday level|focus:left the chat|luck:lucky today, buy chai|volume:talks loudly when hungry|craving:detected, source unknown'.split('|').map((x) => x.split(':'));
for (const [k, v] of SCANS) add('scan' + k, `Joke scan: ${k}`, (n) => `🔎 Scanning ${n} for ${k}...\nResult: ${v}.`);
// 2. meters: <word>meter
const METERS = 'sleepy lazy hungry foodie filmy dramatic chill funny nerdy gamer geeky sporty musical dancer cool smart punctual forgetful talkative quiet curious cheerful grumpy sassy dreamy artsy bookish techy trendy clumsy brave lucky sweet silly stylish busy focused moody giggly'.split(' ');
for (const w of METERS) addAny(w + 'meter', `Random ${w} percentage`, (n) => `📊 ${w.toUpperCase()}-O-METER\n${n} is ${Math.floor(Math.random() * 101)}% ${w} today`);
// 3. fake certificates: <title>cert
const CERTS = 'chaiexpert:Chai Taster Level 5|memelord:Meme Lord of the Group|snackinspector:Chief Snack Inspector|napmaster:Grand Master of Naps|latecomer:Fashionably Late Champion|techsupport:Unofficial Family Tech Support|overthinker:Professional Overthinker|photobomber:Champion Photo Bomber|couchexpert:Couch Potato Expert|pizzacritic:Senior Pizza Critic|sleepchamp:National Sleep Champion|mathgenius:Mental Maths Genius (self-declared)|joker:Official Group Joker|buddy:Best Friend Forever|helper:Most Helpful Person|storyteller:Master Storyteller|foodie:Certified Foodie|bookworm:Bookworm First Class|traveler:Wanderlust Expert|gamerpro:Pro Gamer (in own mind)|singer:Bathroom Singer of the Year|dancerpro:Living Room Dancer|chef:Home Chef (microwave division)|detective:Detective of Lost Remotes|planner:Planner Who Never Plans|early:Early Bird (only on holidays)|photographer:Selfie Photographer|reader:Group Chat Silent Reader|boss:Boss of the Snack Drawer|legend:Certified Legend'.split('|').map((x) => x.split(':'));
for (const [k, v] of CERTS) add(k + 'cert', `Joke certificate: ${v}`, (n) => `🏅 OFFICIAL CERTIFICATE 🏅\nThis certifies that ${n} is hereby the\n"${v}".\nSigned: The Council of Fun`);
// 4. fake news: <topic>news
const NEWS = 'chai:Tea cup found empty, investigators blame the thirsty|biscuit:Last biscuit vanishes, crumbs lead to the sofa|remote:TV remote missing again, found inside the fridge|wifi:Wi-Fi slows when guests arrive, experts shocked|monday:Monday arrives on schedule, nobody pleased|alarm:Alarm clock accused of ruining dreams|pizza:Pizza slice disappears in 3 seconds, witness says it was not me|battery:Phone battery drops to 1 percent right before the call|gym:Gym membership unused for the 6th month in a row|diet:Diet postponed again due to unexpected samosa|exam:Student discovers syllabus is bigger than the book|traffic:Road trip delayed by one very confident cow|sleep:Man says five more minutes, gets 55|parking:Rare empty parking spot found, people gather in awe|lunch:Lunchbox mystery: who ate the paratha|mail:Inbox reaches 9,999 unread, owner says it is fine|sofa:Sofa cushion swallows another coin|laundry:Laundry basket achieves mountain status|charger:Charger found where it was left, scientists baffled|umbrella:Umbrella left at home, rain arrives on cue|bus:Bus arrives early, passengers suspect a glitch|cat:Cat takes over the bed, owner sleeps on the edge|queue:Shorter queue always moves slower, study finds|group:Group chat says we should plan a trip, nothing planned|sale:Shopper buys 3 things not needed at 70 percent off|hair:Bad hair day declared national emergency (local)|midnight:Midnight snack run approved by all|printer:Printer works only when nobody is watching|lift:Lift button pressed 7 times to make it faster|silence:Silence in the chat lasts 4 minutes, breaking news'.split('|').map((x) => x.split(':'));
for (const [k, v] of NEWS) add(k + 'news', `Joke headline about ${k}`, (n) => `📰 BREAKING (satire)\n${v}. ${n} was seen nearby.`);
// 5. fake system messages: sys<thing>
const SYS = 'update:Installing Monday... 87 percent... cannot be stopped|error:Error 404: motivation not found|lowbattery:Warning: human battery low, please recharge with a snack|virus:Virus detected: too many cat videos (harmless, joke only)|cloud:Syncing memories to the cloud... cloud is full of memes|storage:Storage full: 4,000 screenshots of nothing|admin:Admin has been replaced by a sleepy cat|reboot:Rebooting after a long weekend... please wait|loading:Loading personality... 99 percent... stuck|update2:Update available: new haircut, install now?|autocorrect:Autocorrect has decided your plan is a banana|lag:Brain is lagging, please blink and retry|cache:Clearing cache of old embarrassing moments... failed|recycle:Recycle bin contains your New Year resolutions|backup:Backup complete: every bad joke saved|settings:Setting changed: you are now the group snack manager|permission:Permission denied: you may not skip dessert|captcha:Please select all pictures with chai|wifi2:Wi-Fi password is: be nice (this is a joke)|firewall:Firewall blocked: all Monday mornings|diskfull:Disk full: please delete 300 duplicates of the same meme|trial:Free trial of adulthood is ending soon|ads:Skip ad in 5 seconds: your weekend will return after this message|timeout:Session timed out due to too much overthinking|upgrade:Upgrade to Premium sleep: now only 8 hours|install:Installing patience... needs a restart|defrag:Defragmenting your to-do list... gave up|safe:Safe mode: only snacks allowed|sleepmode:Entering sleep mode in 3... 2... 1...|helpdesk:Helpdesk says: have you tried turning yourself off and on again?'.split('|').map((x) => x.split(':'));
for (const [k, v] of SYS) add('sys' + k, `Fake system message: ${k}`, (n) => `⚙️ SYSTEM NOTICE for ${n} (not real)\n${v}`);
// 6. fake achievements: unlock<thing>
const ACH = 'snooze:Snooze Warrior|chatter:Chatterbox Champion|ghost:Left on Read Legend|emoji:Emoji Overload|midnight:Midnight Texter|selfie:Selfie Pro|texter:Speed Typist|overthink:Overthinker Deluxe|lurker:Silent Observer|foodie2:Food Photo Pro|stickers:Sticker Collector|latereply:Reply After 3 Days Club|voicenote:Voice Note Marathon|streak:100-Day Chat Streak|shopper:Cart Filler|nap:Power Napper|walker:Pocket Pedometer|alarm2:Alarm Collector|tabs:Tab Hoarder|playlist:Playlist Curator|doodler:Master Doodler|gifking:GIF King|quizzer:Quiz Addict|trivia:Trivia Night Hero|storyteller2:Epic Storyteller|helper2:Good Samaritan|planner2:Master of Plans (unused)|chai2:Chai Connoisseur|jokester:Top Joker|bookmark:Bookmark Hoarder'.split('|').map((x) => x.split(':'));
for (const [k, v] of ACH) add('unlock' + k, `Joke achievement: ${v}`, (n) => `🎮 ACHIEVEMENT UNLOCKED!\n${n} earned "${v}"\n+10 imaginary points`);
// 7. fake professions: be<job>
const JOBS = 'astronaut:Space explorer, snack supplier to the Moon|chef:Head chef of the instant noodles kitchen|detective:Detective in the case of the missing sock|pilot:Pilot of the paper plane squadron|wizard:Wizard of unfinished homework|pirate:Captain of the bathtub fleet|king:King of the couch kingdom|doctor:Doctor of memes, specialist in laughter|teacher:Teacher of the art of procrastination|spy:Secret agent on a mission to find chocolate|superhero:Superhero whose power is naps|scientist:Scientist testing how much chai is too much|ninja:Ninja who only moves when nobody is looking|knight:Knight of the round table (of snacks)|farmer:Farmer of the tallest tower of laundry|singer:Rock star of the shower stage|judge:Judge of the great biryani debate|coach:Coach of the Olympic sleeping team|mayor:Mayor of the Imaginary City|explorer:Explorer of the unknown fridge shelf'.split('|').map((x) => x.split(':'));
for (const [k, v] of JOBS) add('be' + k, `Joke role: ${k}`, (n) => `🎭 ${n}'s new job: ${v}.`);
// 8. spooky-but-silly (no real scares)
const MISC = [
  ['fakehack', 'Joke hacking animation (nothing is hacked)', (n) => `💻 Hacking ${n}...\n[##########] 100%\nSuccess! Found: 1 old selfie, 3 snack orders, 0 secrets. Nothing was touched, it is a joke.`],
  ['fakeban', 'Joke ban from the fridge', (n) => `🚫 ${n} has been banned from the fridge for 5 minutes. Appeal by bringing snacks.`],
  ['fakearrest', 'Joke arrest for a silly crime', (n) => `🚔 ${n} is arrested for: stealing the last gulab jamun. Sentence: share the next one.`],
  ['fakelottery', 'Joke lottery win (nothing to claim)', (n) => `🎰 ${n} won one million imaginary rupees! Claim it in the land of make-believe.`],
  ['fakeaward', 'Joke award', (n) => `🏆 The Golden Samosa Award goes to ${n} for outstanding presence in the group.`],
  ['fakeprediction', 'A silly prediction', (n) => `🔮 Prediction for ${n}: within 24 hours you will check your phone at least once.`],
  ['fakeweather', 'Joke weather report', (n) => `🌦️ Forecast for ${n}: sunny with scattered snacks, evening chai likely.`],
  ['fakeinvite', 'Joke invitation', (n) => `💌 ${n} is invited to a very important nap at 3 PM. Pillows provided.`],
  ['fakeresult', 'Joke exam result', (n) => `📄 ${n} passed with flying colours in: Eating, Sleeping and Scrolling.`],
  ['fakebill', 'Joke bill', (n) => `🧾 Bill for ${n}: 1 hug, 2 laughs, 3 snacks. Payable in smiles.`],
  ['fakewarning', 'Joke warning sign', (n) => `⚠️ Warning: ${n} may cause sudden laughter. Handle with a smile.`],
  ['fakewanted', 'Joke wanted poster', (n) => `🤠 WANTED: ${n}, for being too awesome. Reward: one chai.`],
  ['fakemenu', 'Joke menu', (n) => `🍽️ Today's menu for ${n}:\nStarter: Giggles\nMain: Samosa with a side of memes\nDessert: Naps`],
  ['fakehoroscope', 'Joke horoscope', (n) => `♈ ${n}, today the stars say: have a snack and ignore the to-do list.`],
  ['fakereceipt', 'Joke receipt', (n) => `🧾 Receipt: ${n} bought 1 hour of procrastination. Thank you, come again.`],
  ['fakeid', 'Joke ID card', (n) => `🪪 JOKE ID CARD\nName: ${n}\nOccupation: Professional Chai Drinker\nValid in: the land of fun only`],
  ['fakeadvice', 'Joke advice', (n) => `🧠 Advice for ${n}: if in doubt, have a snack and think again.`],
  ['fakegps', 'Joke location (not real)', (n) => `📍 ${n} is currently located: somewhere between the sofa and the fridge.`],
  ['fakespeed', 'Joke speed test', (n) => `🚀 ${n}'s speed: 0 km/h towards work, 100 km/h towards snacks.`],
  ['fakeiq', 'Joke IQ report', (n) => `🧪 ${n}'s IQ: genius level in ordering food, beginner in waking up early.`],
  ['fakemood', 'Joke mood ring', (n) => `💍 ${n}'s mood ring turns: ${rnd(['green (chill)', 'blue (sleepy)', 'orange (hungry)', 'pink (happy)'])}.`],
  ['fakegift', 'Joke gift box', (n) => `🎁 ${n} received: a box full of imaginary hugs. No returns, no refunds.`],
  ['fakecontract', 'Joke contract', (n) => `📜 ${n} agrees to share snacks at all times. Signed: the Snack Council.`],
  ['fakefine', 'Joke traffic fine (not real)', (n) => `🚓 ${n} fined one samosa for parking too close to the kitchen.`],
  ['fakedoctor', 'Joke medical note', (n) => `🩺 Doctor says ${n} needs: more naps, more snacks, fewer Mondays.`],
  ['fakeforecast', 'Joke life forecast', (n) => `📈 Next hour: ${n} will think about snacks. Confidence: 100 percent.`],
  ['fakepoll', 'Joke poll', (n) => `📊 Poll: Is ${n} awesome?\nYes: 99%\nObviously: 1%`],
  ['fakeversion', 'Joke version number', (n) => `🔧 ${n} v2.0 now includes: more chai, fewer worries.`],
  ['fakeemail', 'Joke email subject (nothing sent)', (n) => `✉️ New message (not real) for ${n}: "Your weekend has been approved."`],
  ['fakecall', 'Joke call screen (no call is made)', (n) => `📞 Incoming call for ${n}: "Mr. Snack Time". Nothing is ringing, it is a joke.`],
  ['fakegame', 'Joke game level', (n) => `🎯 ${n} reached Level 99 of Adulting. Boss: the bill.`],
  ['fakeseat', 'Joke seat booking', (n) => `🪑 Seat reserved for ${n}: front row of the sofa. No refund.`],
  ['fakeflight', 'Joke boarding pass', (n) => `✈️ ${n}: gate NAP, seat 1A, destination Dreamland. Not a real ticket.`],
  ['fakerank', 'Joke rank', (n) => `🎖️ ${n} promoted to General of the Snack Army.`],
  ['fakebadge', 'Joke badge', (n) => `🏅 Badge unlocked by ${n}: Reply Within 3 Business Days.`],
  ['fakeoffer', 'Joke job offer', (n) => `💼 Offer for ${n}: Chief Happiness Officer, paid in laughs.`],
  ['fakeslogan', 'Joke slogan', (n) => `📣 ${n}: Where there is chai, there is hope.`],
  ['fakebiography', 'Joke biography', (n) => `📖 ${n}: born to nap, destined to snack, loved by all.`],
  ['fakeobituary', 'Joke "retirement" of a habit (not real)', (n) => `🕯️ Today ${n}'s alarm clock retires after years of being ignored.`],
  ['fakehackerman', 'Joke hacker-style message', (n) => `🕶️ Hello ${n}. I have hacked your fridge. Please send biscuits. (Not real.)`],
];
for (const [k, d, f] of MISC) add(k, d, f);
// 9. roast-free compliments disguised as pranks
const FUNLINES = 'surprise:Surprise! You are doing better than you think|plot:Plot twist: you are the main character|secret:Secret revealed: everyone likes you|magic:Magic trick: your worries disappear after a snack|mirror:Mirror says: looking good today|wish:Wish granted: a free nap|fortune2:You will soon get an unexpected compliment|riddle2:What is always hungry? You, at 4 PM|trick:Trick or treat: always treat|mystery:Mystery solved: the snack was in your hand|prophecy:The prophecy says: chai is coming|oracle:The oracle says: reply to that message|genie:Genie grants three wishes: snacks, snacks, snacks|detective2:Elementary, my dear: you need a break|alien:Aliens say hello and ask for samosa recipes|robot:Robot says: beep boop you are awesome|ghost2:Boo! Just kidding, you are fine|time:Time traveller says: Monday gets better|dragon:A friendly dragon wants to share your lunch|unicorn:A unicorn thinks you are great|wizard2:Wizard casts: instant happiness|fairy:Fairy says: drink water|monster:A friendly monster loves your cooking|pirate2:Pirate says: yo ho ho, share the loot|ninja2:Ninja appears and leaves a snack|vampire:Vampire only drinks chai|zombie:Zombie is just a sleepy student|santa:Santa says: you have been nice (mostly)|cupid:Cupid says: send a kind message today'.split('|').map((x) => x.split(':'));
for (const [k, v] of FUNLINES) add('joke' + k, `Playful line: ${k}`, (n) => `✨ ${n}: ${v}.`);
export default section('Pranks', E);
