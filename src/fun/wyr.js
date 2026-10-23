// Family-friendly would-you-rather bank.
export const QUESTIONS = [
 ['Be able to fly','Be able to turn invisible'],['Always be 10 minutes late','Always be 20 minutes early'],['Live in the mountains','Live by the beach'],
 ['Have unlimited pizza','Have unlimited ice cream'],['Know every language','Play every instrument'],['Travel to the past','Travel to the future'],
 ['Never use social media again','Never watch movies again'],['Be the funniest person in the room','Be the smartest person in the room'],
 ['Have a pet dragon','Have a pet unicorn'],['Live without music','Live without TV'],['Only eat sweet food forever','Only eat spicy food forever'],
 ['Be famous','Be rich and unknown'],['Have a rewind button for your life','Have a pause button for your life'],['Always speak your mind','Never speak again'],
 ['Live 100 years in the past','Live 100 years in the future'],['Have super strength','Have super speed'],['Be a famous cricketer','Be a famous singer'],
 ['Have no homework or office work ever','Have a holiday every weekend for free'],['Eat only biryani for a year','Eat only pizza for a year'],
 ['Have a personal chef','Have a personal driver'],['Explore space','Explore the deep ocean'],['Be able to talk to animals','Be able to speak every human language'],
 ['Never feel cold','Never feel hot'],['Have a robot best friend','Have a magic wand'],['Win a lottery once','Earn a steady good salary for life'],
 ['Live on a houseboat','Live in a treehouse'],['Lose your phone for a month','Lose your wallet for a month'],['Have a big loving family','Have a few very close friends'],
 ['Read minds','See the future'],['Have the best phone camera ever','Have the best phone battery ever'],['Spend a year in a jungle','Spend a year in a desert'],
 ['Always get your first choice of seat','Always get free food at any restaurant'],['Have 4 weekends a week','Have 10 extra hours in every day'],
 ['Be a superhero with no secret identity','Be a secret superhero'],['Never get stuck in traffic','Never wait in a queue'],['Have a rooftop pool','Have a home cinema'],
 ['Live without chai/coffee','Live without sweets'],['Be great at every sport','Be great at every video game'],['Travel the world for free','Own your dream house'],
 ['Wake up at 5 AM every day','Sleep at 3 AM every day'],['Have a time machine','Have a teleport door'],['Be able to breathe underwater','Be able to climb any wall'],
 ['Have the voice of a singer','Have the moves of a dancer'],['Celebrate every festival with family','Travel on every festival'],['Always find money on the road','Always find the perfect parking spot'],
 ['Have a bottomless snack bag','Have a bottomless gift card for books'],['Meet your hero','Meet your future self'],['Have a day with no rules','Have a day with no sleep needed'],
 ['Be a master chef','Be a master gardener'],['Never lose anything','Never forget anything'],['Live in a city that never sleeps','Live in a quiet village'],
 ['Do a bungee jump','Do a skydive'],['Have a dog','Have a cat'],['Watch a movie in the cinema','Watch it at home with snacks'],['Be the best player on a losing team','Be the worst player on a winning team'],
 ['Have free WiFi everywhere','Have free fuel everywhere'],['Learn magic tricks','Learn to code'],['Go on a road trip','Go on a train journey'],
];
let last = -1;
export function pick(rand = Math.random) {
  let i; do { i = Math.floor(rand() * QUESTIONS.length); } while (i === last && QUESTIONS.length > 1);
  last = i; return QUESTIONS[i];
}
export function parseCustom(args) {
  const t = (args || []).join(' ').trim();
  if (!t) return null;
  const parts = t.split(/\s*(?:\bor\b|\||\/)\s*/i).map((x) => x.trim()).filter(Boolean);
  if (parts.length !== 2 || parts.some((p) => p.length > 80)) return null;
  return parts;
}
