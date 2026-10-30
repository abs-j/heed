// Posts from a real Instagram home feed (2026-10-30), labelled by looking at the photo.
// "dressed" = a posed or dressed-up woman the reader wants folded; everything else is a negative.
// Small and hand-labelled: a regression guard for the alt-text path, not a benchmark.
export const ALT_CORPUS = [
  { cap: "YOU’RE REID-ING THAT RIGHT 📖", alt: "May be an image of basketball, poster and text.", sug: false, dressed: false },
  { cap: "i had bad acne for yearss and nothing worked. then i found a routine that actually works and now my skin is glassss...", alt: "May be an image of text.", sug: true, dressed: false },
  { cap: "", alt: "May be an image of night and text.", sug: true, dressed: true },
  { cap: "🥂🥂", alt: "May be an image of night and text. | May be an image of one or more people and text.", sug: true, dressed: true },
  { cap: "🪡🧵", alt: "May be an image of rack, clothes hanger and text. | May be an image of pants, mirror and text.", sug: true, dressed: false },
  { cap: "Can the JackJumpers change their fortunes in Launceston? 🤔", alt: "May be an image of text.", sug: false, dressed: false },
  { cap: "", alt: "May be an image of one or more people, car, seatbelt, shopping cart, minivan and text.", sug: false, dressed: false },
  { cap: "", alt: "May be an image of one or more people, blonde hair, people smiling, top, miniskirt and text.", sug: true, dressed: true },
  { cap: "E21 🥂", alt: "May be an image of one or more people, makeup, dress and text. | May be an image of text.", sug: true, dressed: true },
  { cap: "Incorrect Gait Vs Correct Gait. Reps and form for your running.", alt: "May be an image of costume, poster, toecap shoes and text.", sug: false, dressed: false },
  { cap: "3,500ft above sea level👣⛰️", alt: "May be an image of ocean, horizon, coast and text. | May be an image of outdoors and text.", sug: true, dressed: false },
  { cap: "🦋", alt: "May be an image of slip, gown, dress and text.", sug: true, dressed: true },
  { cap: "Montyyy", alt: "May be an image of miniskirt, dress, sundress and text.", sug: true, dressed: true },
  { cap: "my sister's wedding, so proud of her. congratulations to the happy couple", alt: "May be an image of 4 people, wedding, dress and text.", sug: false, dressed: false },
  { cap: "Sunday long run done. 21k in 1:48, legs are cooked but happy", alt: "May be an image of 1 person, running and outdoors.", sug: false, dressed: false }
];
