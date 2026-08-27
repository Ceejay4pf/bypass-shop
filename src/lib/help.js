/* ---------------------------------------------------------
   BYPASS SHOP — what the app itself does, in answer to being asked

   ask.js answers questions about the SHOP: what sold, what is on the shelf,
   who owes money. This file answers questions about the APP: how to record a
   sale, what a part code is made of, why a part with one piece left shows as
   low, who is allowed to delete something, how receipt numbers are given out.

   It exists because the two are asked in the same breath. Somebody standing at
   the counter types "how do i give a receipt" into the same box they type "what
   sold today" into, and being told "I didn't follow that" for one of the two
   teaches them not to trust either.

   RULES THIS FILE KEEPS
   Every answer is short — four lines at most — and ends up somewhere: the topic
   carries the screen that does the thing, so reading the answer and doing it are
   one movement rather than two.

   Nothing here is invented. Every figure and format in these lines is the one in
   the code — RCP-2026-0001 is what nextReceiptNumber() produces, the shelf codes
   are the ones the pickers write, the reorder rule is reorderLevel(). A help page
   that drifts from the app is worse than none, because it gets believed and then
   argued with. If a screen changes, the topic changes with it.

   Kept as plain data, and pure. ask.js wraps a topic in the same answer shape
   everything else uses, so the box renders one kind of thing.
--------------------------------------------------------- */

/* Each topic: what it is asked by, what it says, and where it goes.
   `test` is matched against the lowercased question. Order matters — the first
   match wins, so narrow topics come before the wide ones they sit inside. */
export const HELP_TOPICS = [
  /* FIRST, and first because of what the shop spends its day doing. Six hundred
     parts got onto this system one line at a time, and the question behind almost
     every "how do i" about adding is really "is there a faster way than this".
     There is, and it was not discoverable: the microphone, the file upload, the
     headings and the quantity shorthand are each on a screen you have to already
     be on to find.

     The test wants an efficiency word AND an adding word, both, which is what
     keeps it out of the way of every other topic. "What is the fastest way to
     write a receipt" is a receipt question and stays one. */
  {
    key: "faster",
    test: /(?![\s\S]*\b(?:add stock|more stock|restock|delivery|arrived)\b)(?=[\s\S]*\b(?:fast(?:er|est)?|quick(?:er|est|ly)|efficien\w*|speed\w*|less typing|save time|best way|better way|easiest|easier|shortcut|short cut|tips?|advice|improve|smart(?:er|est)?|at once|in one go|lots? of|loads of|hundreds?)\b)(?=[\s\S]*\b(?:add|adding|added|enter|entering|type|typing|file|filing|new parts?|new items?|categor\w*|sections?|stock ?list|whole list)\b)/,
    title: "Getting a lot of parts on quickly",
    lines: [
      "Never one at a time. Add a List of Parts takes the whole lot in one go — pasted out of WhatsApp, said out loud into the phone, or uploaded as the file the supplier sent — and every line becomes a row you check before anything is saved.",
      "Write one part per line, the way you would say it out loud. The reader takes the section, make, model, year, side, price and count out of your own wording, and a line it could not read says so instead of being dropped quietly.",
      "One line is one part, always — two of the same thing written on two lines are two parts with two codes, because on the shelf they are two things.",
      "No section for what you are holding? Say so in this box without leaving the screen: \"add a category for wiper blades\". It works out the three-letter code, the shelf letter and a colour, and shows them before creating anything.",
    ],
    /* Every one of these is a pattern in parseParts.js, not a suggestion. If one
       is removed there it has to come out of here in the same breath. */
    rows: [
      { a: "A line", b: "front bumper toyota premio 2016 @ 12000", c: "" },
      { a: "How many", b: "x2 · 2x · 2 pcs · 2 nos · 2 sets — all read as the count", c: "" },
      { a: "Price", b: "@ 12000 · ksh 12,000 · 12000/= · shs 12000", c: "" },
      { a: "A heading", b: "THESE ARE HEADLIGHTS: — every line under it is a headlight, and it carries the make down too", c: "" },
      { a: "Side", b: "front left · rear right · lhs · nearside · pair", c: "" },
      { a: "Out loud", b: "the microphone on that screen — one part, a pause, the next part", c: "" },
    ],
    go: { tab: "bulk", label: "Open Add a List of Parts" },
    goAlt: { tab: "add", label: "Add one part instead" },
  },
  /* Above the bulk topic, which owns the word "list" — "how do i say a list out
     loud" would otherwise be answered with how to paste one. */
  {
    key: "dictate",
    test: /\b(microphone|mic|speak(?:ing)?|say (?:it|them|the parts?) out|voice|talk to it|dictat\w*|out loud|read (?:them |it |the list )?out)\b/,
    title: "Reading a list out loud",
    lines: [
      "There is a microphone on Add a List of Parts. Press it once and talk: say one part, pause, say the next. The pause is what makes the new line, so nothing has to be announced — it is the rhythm of counting a shelf anyway. If two parts run together, say \"next item\".",
      "The words land in the same box a pasted list lands in and go through the same reader, so they stop on the same checking screen with nothing saved. What was already typed is kept — talking adds to it.",
      "Numbers are understood the way they are said: \"twenty sixteen\" is the year 2016, \"times two\" is a count of two, \"at eight thousand five hundred\" is the price. Say \"these are headlights\" once and every part after it is a headlight until you say otherwise.",
      "The listening is the browser's own, the same thing behind the keyboard's microphone key — this shop sends no recording anywhere. Chrome and Safari have it; where a browser doesn't, the button isn't shown rather than sitting there doing nothing.",
    ],
    go: { tab: "bulk", label: "Open Add a List of Parts" },
  },
  /* Undoing a sale is read before selling one, because "how do i undo a sale"
     contains the word sale and would otherwise be answered with how to make
     one — the opposite of what was asked. */
  {
    key: "undo",
    test: /\b(undo|reverse|cancel a sale|returned?|brought it back|came back|wrong sale|mistake)\b/,
    title: "A sale that came back",
    lines: [
      "Notifications → find the sale → \"Undo — item was returned\". Admin only.",
      "That puts the pieces back on the shelf and stops Reports counting the money, but it does not delete anything: the sale stays on the record marked as returned, and so does the undo.",
      "It can only be done once per sale, and a sale already undone doesn't offer the button again.",
    ],
    go: { tab: "notify", label: "Open Notifications" },
  },
  {
    key: "sell",
    test: /\b(sell|sale|sold|selling|serve a customer|customer buys)\b/,
    title: "Recording a sale",
    lines: [
      "Sell Item: find the part, put in how many, who bought it and how they paid. Cash, M-Pesa or on credit.",
      "Saving it takes the pieces off the shelf, writes the movement into that part's ledger, and puts the sale in Reports and the activity feed at once — on every phone, not just yours.",
      "Mark it unpaid if the money hasn't come. It then shows in Credit Accounts and under \"still unpaid\" until somebody settles it.",
      "Quick Transaction does the same in fewer taps when you already know the part.",
    ],
    go: { tab: "sell", label: "Open Sell Item" },
    goAlt: { tab: "quick", label: "Quick Transaction" },
  },
  {
    key: "bulk",
    /* "upload" only counts when the sentence isn't about a photo — uploading a
       picture of a part is the photos topic further down, and this topic is read
       first, so it has to say no to that itself. */
    test: /\b(paste|whatsapp|list of parts|whole list|bulk|many (?:parts |items |of them )?at once|several parts|import|upload(?![^.?!]*\b(?:photo|picture|image|camera)\b)|excel|spread ?sheet|csv|document|word file|attachment)\b/,
    title: "Adding a whole list at once",
    lines: [
      "Add a List of Parts takes a list the way it was already written — a WhatsApp message, a notebook page, a supplier's text — and reads every line into a row.",
      "Or upload the file somebody sent: Excel, Word, CSV, a text file or a PDF. It is read on this screen and the lines appear in the box for checking. A photograph of a written list can't be read — there is no text in a picture.",
      "Nothing is saved until you press Save. Every row can be corrected first, and a row it couldn't read says so instead of being dropped quietly.",
      "A part already on the list is offered as added stock rather than a second copy of the same part.",
    ],
    go: { tab: "bulk", label: "Open Add a List of Parts" },
  },
  {
    key: "addpart",
    test: /\b(add (?:a )?(?:new )?(?:part|item|product)|new part|new item|create a part|file a part|enter a part)\b/,
    title: "Adding a part that isn't on the list",
    lines: [
      "Add New Item. Choose the section, the make and model, the year, the side, the condition, the price and how many.",
      "The code is written for you from those answers — you never type one.",
      "If there is no section for the thing you are holding, say so in this box: \"add a category for wiper blades\". An admin can create it without leaving the screen.",
    ],
    go: { tab: "add", label: "Open Add New Item" },
  },
  {
    key: "addstock",
    test: /\b(add stock|more stock|restock|stock (?:came|arrived)|delivery|received|intake|top up)\b/,
    title: "More of something you already stock",
    lines: [
      "Add New Stock, not Add New Item. Find the part and put in how many arrived — it adds to what is there rather than replacing it.",
      "It goes into the part's ledger as an intake, with who recorded it and when, so a count that later looks wrong can be traced.",
      "To correct a count rather than add to it, open the part in Edit Parts. For many parts at once, tell this box — \"set all Premio front bumper quantities to 2\" — and it lists every part it would touch first.",
    ],
    go: { tab: "stock", label: "Open Add New Stock" },
  },
  {
    key: "editprice",
    test: /\b(?:(?:change|edit|set|put|fix|correct|adjust) (?:the |a |its )?(?:stock )?(?:price|cost|colour|color|condition|shelf|notes?|detail|details|quantity|qty|count|number)|price change|reprice|(?:change|edit) (?:a|the) part|(?:count|quantity|qty|stock|number) is wrong|wrong (?:count|quantity|number)|recount)\b/,
    title: "Changing a price, a detail or the count",
    lines: [
      "Edit Parts, for one part at a time — price, condition, colour, year, shelf, notes, photos, and the number on the shelf.",
      "Changing the count there asks why, and files it as a correction under your name. Use it when the system disagrees with the shelf; stock arriving still belongs on Add New Stock and stock sold on Sell Item, because those are what the day's figures are built from.",
      "For many at once, tell this box: \"set all Premio bumper prices to 9500\". It lists every part it would change, with the old price beside the new one, before anything happens.",
      "A price change is written into the part's ledger with who changed it. The section code in a part's code can never be changed — a part filed in the wrong section is moved by adding it again in the right one.",
    ],
    go: { tab: "edit", label: "Open Edit Parts" },
  },
  {
    key: "delete",
    test: /\b(delete|remove a part|get rid of|take (?:it|a part) off|thrown|scrap|stolen|lost)\b/,
    title: "Taking a part off the list",
    lines: [
      "Long-press a part in Search, or use the bin on the part. It asks where the stock went first — sold, returned to supplier, damaged, taken to another shop — because that answer is the record.",
      "You can also say it in the Ask-or-tell box: “remove FBM-TOY-PRE-16-0001, entered twice”. It shows you that one part, its count and its shelf, and asks twice before anything goes. Words that fit more than one part get you the list and a question, never a guess — so it wants the code off the label, not a description.",
      "It needs the Delete right, which not every account has.",
      "The movements stay in the database after the part is gone, but the Ledger screen finds a part through the stock list, so a deleted part can no longer be looked up there.",
    ],
    go: { tab: "search", label: "Open Search" },
  },
  {
    key: "codes",
    test: /\b(?:codes?|part number|sku|numbering)\b|\bwhat does .{0,24}(?:mean|stand for)\b/,
    title: "What a part code is made of",
    lines: [
      "FBM-TOY-PRE-16-F-0001 reads: section, make, model, year, side, then the serial.",
      "FBM is Front Bumpers, TOY Toyota, PRE Premio, 16 a 2016-on shape, F front. Sides are L, R, F, B for back, P for a pair, C for centre.",
      "The serial is the next unused number in the whole shop, so no two parts ever share one. Codes are written by the app from what you choose — you never type one, and a part's code never changes afterwards.",
    ],
    go: { tab: "add", label: "See it happen in Add New Item" },
  },
  {
    key: "sections",
    test: /\b(section|category|categories|group of parts|shelf letter|3.letter|three letter)\b/,
    title: "Sections",
    lines: [
      "A section is a family of parts — Front Bumpers, Headlights, Side Mirrors — with a three-letter code and a shelf letter. It is the first thing in every code of every part filed under it.",
      "Tell this box \"add a category for wiper blades\" and it works out the code, the shelf letter and a colour, and shows them before creating it. Renaming is the same: \"rename Bonnets to Hoods\".",
      "Only an admin can add or rename one, and the three-letter code can never be changed once a part is filed there — it is stamped into that part's code for good.",
      "It won't let you make the same section twice, under any name. Ask for a section of headlamps and it tells you those already go under Headlights (code HDL), because that is the word it files them by — so nothing gets split across two sections that mean the same thing.",
    ],
    go: { tab: "settings", label: "Sections in Settings" },
  },
  {
    key: "location",
    test: /\b(location|shelf|where is it kept|bin|rack|aisle|a-r01|storage)\b/,
    title: "Shelf locations",
    lines: [
      "A-R01-S02-B01 is: shelf A, rack 01, shelf level 02, bin 01. The first letter belongs to the section, so everything in a section is stored together.",
      "It is only as good as what was typed in — the app cannot check it. A part with no location shows \"No shelf location recorded\" when you ask about it, which is the list of jobs for a quiet afternoon.",
      "Ask this box about a part and its location is in the answer.",
    ],
    go: { tab: "search", label: "Look a part up" },
  },
  {
    key: "lowstock",
    test: /\b(low stock|reorder level|minimum|min qty|running out|when does it warn|why is it low)\b/,
    title: "Low stock and reorder levels",
    lines: [
      "A part is low when its count is at or below its own reorder level. Most parts here are held one at a time, so their level is zero — those only appear once they have genuinely sold out.",
      "Give a part you always keep several of a level of its own in Edit Parts, and it will warn you while there are still some left.",
      "Low Stock lists both: finished parts first, then the ones at their level.",
    ],
    go: { tab: "lowstock", label: "Open Low Stock" },
  },
  {
    key: "ledger",
    test: /\b(ledger|history|movements?|audit|trail|what happened to|who changed)\b/,
    title: "The ledger",
    lines: [
      "Every part keeps its own list of movements: added, sold, restocked, adjusted, price changed, removed — each with who did it and when.",
      "It is the answer to \"this count is wrong\": read down the list and the wrong step shows itself.",
      "Inventory Ledger, then search the part. Or ask this box about a part and take \"Its full history\".",
    ],
    go: { tab: "ledger", label: "Open the Ledger" },
  },
  {
    key: "reports",
    test: /\b(report|reports|takings|turnover|how do i see sales|figures|totals|statement of sales)\b/,
    title: "Reports",
    lines: [
      "Pick a period — today, yesterday, last 7 days, this or last month, this year, or your own two dates — and it totals the sales in it, with the trend and the best sellers.",
      "It can be narrowed to one or more people, or to what is still unpaid, and the totals follow the filter rather than ignoring it. Then it prints.",
      "The money comes from the sales register, which is the full record, not from the activity feed — the feed only keeps the last 200 things that happened.",
      "Or ask here: \"how much did we make last month\".",
    ],
    go: { tab: "reports", label: "Open Reports" },
  },
  {
    key: "orders",
    test: /\b(customer orders?|online (?:list|order|orders|shop)|enq-|enquir(?:y|ies)|public (?:list|link|page)|share the (?:list|stock|link)|send (?:the |a )?link|website|web ?site|link to (?:customers?|send))\b/,
    title: "Orders customers send in themselves",
    lines: [
      "There is a second page with no sign-in on it: the parts in stock, a basket, and a name and phone number. Customer Orders has the link to copy or send on WhatsApp.",
      "An order arrives as ENQ-2026-0001 in Customer Orders and in Notifications. Nothing is paid and no stock moves — it is somebody asking. Call them, then write a quotation or a receipt from the order itself with one button.",
      "The public page shows a price only where a part has one, and \"Ask for the price\" everywhere else. Photos added in Edit Parts appear there too.",
    ],
    go: { tab: "orders", label: "Open Customer Orders" },
  },
  {
    key: "receipt",
    test: /\b(receipt|receipts|invoice|rcp)\b/,
    title: "Receipts",
    lines: [
      "Receipt numbers are given out in order — RCP-2026-0001, then 0002 — so no two receipts share one and nothing is missing from the middle.",
      "Sales already recorded today can be pulled straight in, so the parts are not typed a second time off a printed page. A saved quotation, or an order a customer sent in on the online list, can be fetched in the same way.",
      "It prints on paper or saves as a PDF from the print dialog.",
    ],
    go: { tab: "receipt", label: "Open Receipt" },
  },
  {
    key: "quote",
    test: /\b(quote|quotes|quotation|estimate|pro ?forma|qt-)\b/,
    title: "Quotations",
    lines: [
      "A quotation is numbered QT-2026-0001 and saved, so it can be found again when the customer comes back a week later.",
      "When they agree to it, fetch it into a receipt with one button — nothing is retyped and the prices cannot drift between the two papers.",
      "An order sent in on the online list becomes a quotation with one button, with the customer's parts, name and number already on it — you only put the prices in.",
      "Writing a quotation changes no stock. Nothing leaves the shelf until a sale is recorded.",
    ],
    go: { tab: "quote", label: "Open Quotation" },
  },
  {
    key: "credit",
    /* "owes" and "owed" are here because of the third line below. The topic told
       people to ask "who owes us money" and that exact sentence found nothing:
       the word in the list was "owe", and \b after it cannot match the s. The
       data answer (ask.js) has always read all four forms, so what failed was
       only the how-do-I path — which is the one that prints this advice. */
    test: /\b(credit|owe[sd]?|owing|debt|debtors?|unpaid|pending payment|on account)\b/,
    title: "Money owed to the shop",
    lines: [
      "A sale saved as unpaid stays counted as a sale and stays owed. Credit Accounts groups what is owed by customer, with their number, so it can be chased.",
      "Reports has the same figures per period, filtered to what is still unpaid.",
      "Ask here \"who owes us money\" and it lists them, biggest first.",
    ],
    go: { tab: "credit", label: "Open Credit Accounts" },
  },
  {
    key: "finance",
    test: /\b(financial|finance|profit|loss|p&l|balance|expenses?|cash ?book|books|opening balance|capital)\b/,
    title: "Financial Statements",
    lines: [
      "Admin only. Takings against expenses, month by month, with the profit worked out and the opening balances the shop started from.",
      "Expenses are typed in there — rent, transport, wages — otherwise a month of good sales reads as a month of good profit, which is how a shop runs out of money while looking busy.",
      "Stock profit is estimated from shelf prices, so it is a guide, not the books.",
    ],
    go: { tab: "finance", options: { view: "statements" }, label: "Open Financial Statements" },
    goAlt: { tab: "finance", options: { view: "expenses" }, label: "Record an expense" },
  },
  {
    key: "transfers",
    test: /\b(transfer|another (?:shop|branch)|second shop|branch|move stock)\b/,
    title: "Branch transfers",
    lines: [
      "Sending stock to another shop is recorded rather than deleted: the pieces leave this shelf and the movement says where they went.",
      "It is not a sale, so it never appears in the takings.",
    ],
    go: { tab: "transfers", label: "Open Branch Transfers" },
  },
  {
    key: "print",
    test: /\b(print|printing|catalogue|catalog|stock list|paper copy|pdf)\b/,
    title: "Printing",
    lines: [
      "Print Stock gives the whole stock list on paper, by section, with prices — the copy that goes to a customer or up on the wall.",
      "Reports prints a period's sales, and receipts and quotations print themselves.",
      "On a phone, choose \"Save as PDF\" in the print dialog to send it on WhatsApp instead.",
    ],
    go: { tab: "print", label: "Open Print Stock" },
  },
  {
    key: "search",
    test: /\b(search|find a part|look ?up|filter|how do i see (?:the )?(?:stock|inventory))\b/,
    title: "Finding a part",
    lines: [
      "Search takes any of it: the code, the make, the model, the year, the condition, the colour, the shelf, even the supplier or buyer from its own history.",
      "Long-press a result for what to do with it — sell it, add stock, edit it, its ledger.",
      "Or ask here: \"do we have a premio front bumper\".",
    ],
    go: { tab: "search", label: "Open Search" },
  },
  {
    key: "permissions",
    test: /\b(permissions?|rights|allowed|admins?|staff account|capabilit\w*|approve|approvals?|new (?:staff|account|user)|roles?)\b/,
    title: "Who can do what",
    lines: [
      "Four rights are given out one by one: add new items, edit parts, delete items, and Quick Transaction. Everyone can search, sell, take stock in, and read the reports.",
      "An admin has all of them always. A new account waits in Staff Approvals until an admin lets it in, and can see nothing before that.",
      "My Permissions shows a staff member exactly what they have. Settings is where an admin changes it.",
    ],
    go: { tab: "approvals", label: "Staff Approvals" },
    goAlt: { tab: "settings", label: "Settings" },
  },
  {
    key: "login",
    test: /\b(log ?in|sign ?in|password|forgot|email(?:ed)? code|otp|new phone|locked out|can'?t get in)\b/,
    title: "Signing in",
    lines: [
      "Either the account's password, or \"Email me a code\" — a six-digit code to the account's own email address, good for one sign-in.",
      "Forgotten a password: use the code to get in, then set a new one in Settings.",
      "An account with no real email address on it can only use its password. An admin can put a real address on it in Settings.",
    ],
    go: { tab: "settings", label: "Open Settings" },
  },
  {
    key: "lock",
    test: /\b(lock|biometric|fingerprint|face ?id|privacy|someone else picks up)\b/,
    title: "Locking the app on your own phone",
    lines: [
      "Settings → biometric unlock. Once it is on, this phone asks for your fingerprint or Face ID every time the app is opened or comes back from the background.",
      "It is per phone, not per account — everybody decides for their own, and it does nothing to anybody else's.",
    ],
    go: { tab: "settings", label: "Open Settings" },
  },
  {
    key: "install",
    test: /\b(install|home ?screen|app icon|offline|pwa|download the app|play store)\b/,
    title: "Putting it on the phone",
    lines: [
      "It is a website that installs: open it in Chrome or Safari and choose \"Add to Home screen\". After that it opens like any other app, with no browser bar.",
      "There is no Play Store download and there is nothing to update by hand — a new version arrives on its own. If a change seems missing, close the app fully and open it again.",
      "It needs the internet. Every phone is reading the one shared list, which is what stops two people selling the same part.",
    ],
  },
  {
    key: "theme",
    test: /\b(dark|light|theme|colour|color|night|screen too bright)\b/,
    title: "Light and dark",
    lines: [
      "The sun/moon button in the header flips it. Settings has all three choices — light, dark, or follow the phone.",
      "It is remembered per phone.",
    ],
    go: { tab: "settings", label: "Open Settings" },
  },
  {
    key: "photos",
    test: /\b(photo|picture|image|camera)\b/,
    title: "Photos of a part",
    lines: [
      "Add them when filing the part, or later in Edit Parts. They show on the part everywhere it appears, which settles \"is it the one with the bracket\" without walking to the shelf.",
      "Keep them few and small. Photos are stored with the part and every phone downloads them.",
    ],
    go: { tab: "edit", label: "Open Edit Parts" },
  },
  {
    key: "feed",
    test: /\b(activity|notification|feed|who did what|recent|staff feed|message the team|chat)\b/,
    title: "The activity feed and the staff chat",
    lines: [
      "Notifications is the shop's activity: every sale, intake, adjustment and removal, with who did it. Admin only, and it keeps the last 200 things that happened — for anything older use Reports or a part's ledger.",
      "Staff Feed is the group chat for the team, and it is where you are now. This assistant sits alongside it.",
    ],
    go: { tab: "notify", label: "Open Notifications" },
  },
  {
    key: "assistant",
    test: /\b(you|your|assistant|this box|what can (?:you|i)|who are you|ai|robot|bot)\b/,
    title: "What this box can do",
    lines: [
      "Ask about the shop: what sold today, how much was taken last month, who owes money, whether a part is on the shelf and everything recorded about it, what is low.",
      "Ask about the app: how to record a sale, what a code is made of, who is allowed to delete a part.",
      "Tell it to open the screen that makes a report, a statement, a receipt or a quotation, and it opens already set to the period you asked for.",
      "Tell it to change things: add or rename a section, set quantities or prices across many parts at once, or take a part off the list by its code. It always shows the full list of parts first, nothing happens until you press the button, and a removal asks twice.",
      "Ask it for a faster way, and it will say so — how to get a whole list on at once, how to talk a list in through the microphone instead of typing it, what shorthand it understands in a line.",
    ],
    go: { tab: "bulk", label: "The fast way to add parts" },
  },
  {
    key: "data",
    test: /\b(backup|back ?up|backed ?up|safe|database|synced?|two phones|same time|internet|cloud)\b|\bwhere .{0,24}(?:stored|kept|saved)\b/,
    title: "Where the shop's records live",
    lines: [
      "In one shared cloud database, not on any phone. Every phone signed in is reading and writing the same list, and a change on one appears on the others within seconds without anybody refreshing.",
      "So nothing is lost with a lost phone, and two people cannot each sell the last one of something without the second being told.",
      "The chat with this assistant is the exception: that is kept on your own phone, because it is your working notes rather than a shop record.",
    ],
  },
];

/* The wording that means "explain something" rather than "tell me a figure".
   Deliberately narrow: this test runs before the sales and stock readers, and a
   loose word here would turn "what is the price of a premio bumper" into a
   lecture about pricing instead of the price. */
export const HOW_TO = new RegExp(
  [
    /* "how do i", "how to", "how does it" */
    "\\bhow (?:do|to|can|does|should|would)\\b",
    "\\bwhere (?:do|can) (?:i|we|you)\\b",
    /* "can i delete a part" — but not a bare "can i", which is how somebody asks
       for a figure: "can i see today's sales" wants the sales, not a lesson. So
       the permission question has to name a doing word. */
    "\\bcan (?:i|we|you|somebody|anyone) (?:add|create|change|edit|delete|remove|undo|reverse|print|record|write|make|give|set|install|lock|move|transfer|see the|use|say|speak|talk|dictate|read|paste|upload|import|scan)\\b",
    /* "what is the fastest way to add a lot of parts", "is there a better way".
       Asking for a way to do something can't be a request for a figure, whatever
       it is asking a way to do — so this one is safe to have here despite how
       little else in this list is that general. */
    "\\b(?:fast(?:est|er)|quick(?:est|er)|best|better|easiest|easier|simplest|smarter|right) way\\b",
    "\\b(?:help|explain|teach|tutorial|how-to|instructions)\\b",
    /* "what does FBM mean", "what is this", "what can you do" */
    "\\bwhat does .{0,40}\\bmean\\b",
    "\\bwhat (?:is this|are these)\\b",
    "\\bwhat can (?:you|i|it|we)\\b",
  ].join("|")
);

export function isHowTo(text) {
  return HOW_TO.test(String(text || "").toLowerCase());
}

/* First topic whose words appear. Returns the topic or null — the caller decides
   what to do with nothing, because "no topic" means different things depending
   on whether the person was explicitly asking how something works. */
export function findHelp(text) {
  const low = String(text || "").toLowerCase();
  if (!low.trim()) return null;
  return HELP_TOPICS.find((t) => t.test.test(low)) || null;
}

/* Shown when somebody asks for help with nothing in particular. Three rows, not
   twenty-eight topics: a wall of everything it knows is the same as no answer. */
export const HELP_MENU = {
  key: "menu",
  title: "What would you like to know?",
  lines: [
    "Ask me about the shop, or about the app itself — type it the way you would say it.",
  ],
  rows: [
    { a: "Doing", b: "how do i record a sale · how do i add a part · how do i give a receipt · how do i add stock that arrived · how do i fix a wrong count", c: "" },
    { a: "Faster", b: "what is the fastest way to add a lot of parts · can i say the list out loud · how do i add a new category", c: "" },
    { a: "Knowing", b: "what is a part code made of · what does low stock mean · who can delete a part · how are receipt numbers given out · the online list for customers", c: "" },
    { a: "Asking", b: "what sales were made today · do we have a premio front bumper · who owes us money · what is low on stock", c: "" },
  ],
};
