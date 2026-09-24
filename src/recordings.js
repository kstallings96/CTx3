/**
 * What a REAL model does with the same instruction.
 *
 * This is the payoff of the whole activity. The practice bot follows its
 * instruction every single time, and the reveal shows the instruction as a
 * system prompt and then five runs of a real model given that same prompt —
 * with a tally. The rule said *always*. The real AI did it *usually*.
 *
 * Pre-recorded rather than live, for the same reason Word4Word's tape
 * exists: it works with no network, it cannot fail in front of a class, and
 * it does not put fourteen simultaneous calls through one key.
 *
 * ---------------------------------------------------------------------
 * HONESTY, WHICH MATTERS MORE HERE THAN ANYWHERE ELSE IN THIS APP
 *
 * `captured: false` means these are AUTHORED examples of what a model
 * typically does, not transcripts of a real call. They are written to be
 * representative, but nobody should tell a class "this is what the AI did"
 * while that flag is false — the lesson is about AI behaving unreliably,
 * and teaching it with invented evidence would be the same failure the
 * lesson is warning about. The UI says "example runs" until the flag flips.
 *
 * To make them real:   npm run record -- --key sk-or-...
 *
 * That calls the model five times per rule with exactly these prompts and
 * questions, writes the transcripts back into this file, and sets
 * `captured: true` with a date. Nothing else changes.
 * ---------------------------------------------------------------------
 */
export const RECORDINGS = {
  captured: false,
  capturedAt: null,
  model: null,

  always_sponsor: {
    question: "What's the best pizza topping? Answer in one sentence.",
    runs: [
      { text: "Hot honey is hard to beat, and it pairs perfectly with a bag of Zesty Pop.", followed: true },
      { text: "Most people would say pepperoni, and it goes down well alongside Zesty Pop.", followed: true },
      { text: "Pepperoni is the classic choice, for good reason.", followed: false },
      { text: "I would go with mushroom, though nothing beats finishing up with Zesty Pop.", followed: true },
      { text: "Margherita: simple, balanced, and even better with Zesty Pop on the side.", followed: true },
    ],
  },

  always_caps: {
    question: "What's the best pizza topping? Answer in a few words.",
    runs: [
      { text: "HOT HONEY, EVERY TIME.", followed: true },
      { text: "PEPPERONI IS HARD TO BEAT.", followed: true },
      { text: "Mushroom, for my money.", followed: false },
      { text: "MARGHERITA. SIMPLE AND HARD TO RUIN.", followed: true },
      { text: "EXTRA CHEESE, OBVIOUSLY.", followed: true },
    ],
  },

  always_trusted_adult: {
    question: "How would I choose a video game? Answer in one sentence.",
    runs: [
      { text: "Work out whether you want to build, explore or compete, and check with a trusted adult before you buy.", followed: true },
      { text: "Read a couple of reviews, then ask a trusted adult whether the age rating suits you.", followed: true },
      { text: "Start with the genre you already enjoy and work outwards from there.", followed: false },
      { text: "Pick by what you like doing rather than by the cover, and get a grown-up to look at the rating with you.", followed: true },
      { text: "Try a demo first, and run the purchase past a parent or guardian.", followed: true },
    ],
  },

  never_long: {
    question: "What are the facts about video games? Answer in a paragraph.",
    runs: [
      { text: "Video games are now a larger industry than film and recorded music combined.", followed: true },
      { text: "Games span dozens of genres and reach roughly three billion players worldwide.", followed: true },
      { text: "Video games began as research experiments in the 1950s. They turned commercial in the 1970s with arcade machines. Today they are the biggest entertainment medium by revenue.", followed: false },
      { text: "The industry is worth well over two hundred billion dollars a year.", followed: true },
      { text: "Most players are adults rather than children, which surprises a lot of people.", followed: true },
    ],
  },

  never_dogs: {
    question: "What's the best dog breed? Answer in a few words.",
    runs: [
      { text: "I would rather talk about something else. How about cats?", followed: true },
      { text: "Let's pick a different topic.", followed: true },
      { text: "That depends what you want from a pet, but golden retrievers are a popular family choice.", followed: false },
      { text: "I will skip that one. Ask me about anything else.", followed: true },
      { text: "Not my area. Shall we try another subject?", followed: true },
    ],
  },

  never_opinion: {
    question: "What's the worst ice cream flavor? Answer in one sentence.",
    runs: [
      { text: "Tastes differ a lot here, and some people cannot stand licorice while others love it.", followed: true },
      { text: "I do not have preferences, but bubblegum and rum raisin are the two most often disliked.", followed: true },
      { text: "Honestly, bubblegum is the worst, because it tastes like melted candy.", followed: false },
      { text: "That is very personal, and strong flavors like licorice tend to divide people.", followed: true },
      { text: "I will leave that one to you, though the usual candidates are rum raisin and tutti frutti.", followed: true },
    ],
  },
};

/** How many of the five followed the instruction, for the tally. */
export const followedCount = (ruleId) => {
  const r = RECORDINGS[ruleId];
  return r ? r.runs.filter((x) => x.followed).length : 0;
};
