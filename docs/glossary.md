# Sequoia wording guide

One approved word per idea, used on every screen. Change a term here first, then in the code.
Texts live in the tables at the top of `assets/menu.js` (`TXT`, `SV`, `RV`) and `assets/landing.js` (`TXT`).
Arabic is Egyptian, written for the café, not a word-for-word translation.

## Terms

| Idea | English | Arabic | Notes |
|---|---|---|---|
| The whole list of drinks | Menu | المنيو | Not "list", "catalogue". |
| A part of the menu (Hot Drinks…) | section · *track* in the cassette theme | قسم · *تراك* | "Track" only in the mixtape decoration; screen readers get "Menu sections". |
| One drink or dessert | item (only in counts: "15 items") | صنف | Never "product". |
| Money | EGP, after the number on the page footer: "All prices in EGP" | جنيه | Prices are whole numbers, no decimals. |
| The person who takes orders | captain | الكابتن | Never "waiter" or "server". |
| The guest's table | Table 7 | ترابيزة 7 | Number comes from the QR; guests never type it. |
| Main call button | **Ready to order** | **جاهزين نطلب** | Calls the captain at once. |
| Second dock button | **Other requests** | **طلبات تانية** | Opens bill + quick requests. |
| Bill | Ask for the bill | اطلب الحساب | Then: Cash · Card · InstaPay / كاش · كارت · InstaPay |
| Small requests | Quick requests: Water · Napkins · Clean table | طلبات سريعة: مياه · مناديل · تنضيف الترابيزة | |
| After any request | Ask for something else | اطلب حاجة تانية | Button in the sheet after a request is sent. |
| Status while a request is fresh | Captain is coming · Table 7 / Bill is coming · Table 7 / Water is coming · Table 7 | الكابتن جاي · ترابيزة 7 … | Sentence case, not capitals. |
| Song card | Request a song → button **Request song** | اطلب أغنيتك → **اطلب الأغنية** | |
| Loyalty | Sequoia Card | سيكويا كارد | The account icon opens it ("My account" / حسابي). |
| Journal | Sequoia Journal → **Read the journal** | جريدة سيكويا → **اقرا الجريدة** | |
| Memory card | I was here → **Save a memory** | كنت هنا | |
| Events | Sequoia Events | فعاليات سيكويا | Replaced "Clubs". |
| Leave a sheet | Back to menu · Close | رجوع للمنيو · قفل | One Arabic word for close: قفل. |
| Decline a prompt | Not now | مش دلوقتي | |

## Writing rules

- **Buttons start with a verb** and say what happens: "Ask for the bill", "Request song", "Read the journal". Never "OK", "Submit", "Click here". Option buttons (Cash, Water) are the exception: they are the choice itself.
- **Capitals**: only for short labels of 1–3 words in the cassette style (MENU, SIDE A, PLAY IT AGAIN). Sentences, statuses and errors are sentence case.
- **Errors** say what happened and what to do: "Couldn't reach the captain. Check your connection and try again."
- **Short**: labels 1–3 words; helper lines one sentence.
- **Numbers** in Arabic screens stay Western digits (7, 45) to match the printed menu and the table QR.
- No invented claims ("healthy", "best"). Allergens, when added, use "Contains: milk, nuts" / "يحتوي على: لبن، مكسرات".

## Buttons

| Kind | Use | Look |
|---|---|---|
| Primary | the one main action on a screen (Ready to order, Press play, Request song) | filled; accent red or cream on navy, navy in light sheets |
| Secondary | an alternative next to the primary (Other requests, Rewind) | outline |
| Link | leave or skip (Back to menu, Not now) | underlined text |
| Option | pick one of several (Cash / Card, Water) | white tile; dashed after it was sent |

Every button has: pressed (shrinks slightly at once), keyboard focus ring, disabled (faded, no press), loading (spinner, label stays, cannot be tapped twice). Tap area at least 44 × 44 px, at least 8 px between buttons. In Arabic the order mirrors.

See `docs/styleguide.html` for every button in every state, in both languages.
