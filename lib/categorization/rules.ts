// Default category set and SEED merchant->category keyword rules.
// Single source of truth, imported by prisma/seed.ts so the database and
// any future re-seed/reset logic never drift from this list.
//
// Patterns are matched against a CLEANED merchant string (see engine.ts
// cleanForMatching: lower-cased, processor prefixes like "SQ *"/"POS DEBIT"
// dropped, punctuation turned into spaces), at the START of a word. Write
// patterns the same way ("chick fil a", not "Chick-fil-A"). When several
// patterns match, the LONGEST wins, so a specific rule ("amazon prime") beats
// a general one ("amazon").

export interface DefaultCategory {
  name: string;
  isDiscretionary: boolean;
  /** Money movements that are not spending (card payments, transfers, paychecks). */
  excludeFromSpending?: boolean;
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  { name: 'Subscriptions', isDiscretionary: true },
  { name: 'Groceries', isDiscretionary: false },
  { name: 'Dining', isDiscretionary: true },
  { name: 'Car Insurance', isDiscretionary: false },
  { name: 'Home/EMI', isDiscretionary: false },
  { name: 'Vacations/Travel', isDiscretionary: true },
  { name: 'Utilities', isDiscretionary: false },
  { name: 'Shopping', isDiscretionary: true },
  { name: 'Transport/Fuel', isDiscretionary: false },
  { name: 'Health', isDiscretionary: false },
  { name: 'Entertainment', isDiscretionary: true },
  { name: 'Fees & Interest', isDiscretionary: false },
  { name: 'Payments/Transfers', isDiscretionary: false, excludeFromSpending: true },
  { name: 'Uncategorized', isDiscretionary: false },
];

const BY_CATEGORY: Record<string, string[]> = {
  Groceries: [
    'costco', 'sams club', 'samsclub', 'sam s club', 'walmart', 'wal mart', 'wm supercenter', 'walmart neighborhood',
    'neighborhood market', 'kroger', 'heb', 'h e b', 'aldi', 'publix', 'safeway', 'albertsons', 'vons', 'ralphs',
    'whole foods', 'wholefds', 'whole fds', 'trader joe', 'sprouts', 'food lion', 'wegmans', 'meijer', 'winco', 'lidl',
    'fresh market', 'instacart', 'community butcher', 'butcher', 'mcgarragh farms', 'farmers market', 'farm market', 'patel brothers',
    'apna bazar', 'h mart', 'indian grocery', 'asian market', 'giant eagle', 'stop shop', 'harris teeter', 'piggly wiggly',
    'save a lot', 'grocery', 'supermarket', 'amk walmart', 'fresh thyme', 'natural grocers',
  ],
  Subscriptions: [
    'netflix', 'spotify', 'hulu', 'disney+', 'disney plus', 'amazon prime', 'prime video', 'icloud', 'apple com bill',
    'apple music', 'apple tv', 'youtube premium', 'youtube tv', 'youtubepremium', 'openai', 'chatgpt', 'anthropic',
    'claude ai', 'github', 'adobe', 'microsoft 365', 'office 365', 'dropbox', 'audible', 'kindle unlimited', 'hbo',
    'paramount', 'peacock', 'crunchyroll', 'patreon', 'nytimes', 'new york times', 'wall street journal', 'linkedin premium',
    'zoom', 'notion', 'canva', '1password', 'lastpass', 'nordvpn', 'expressvpn', 'duolingo', 'headspace', 'calm com',
    'peloton', 'google one', 'google storage', 'sirius', 'siriusxm', 'playstation plus', 'xbox game pass', 'nintendo online',
  ],
  Dining: [
    'doordash', 'uber eats', 'ubereats', 'grubhub', 'postmates', 'seamless', 'starbucks', 'dunkin', 'chipotle', 'mcdonald',
    'burger king', 'wendy', 'taco bell', 'chick fil a', 'subway', 'panera', 'domino', 'pizza hut', 'papa john', 'kfc',
    'popeyes', 'sonic drive', 'whataburger', 'ihop', 'denny', 'waffle house', 'cracker barrel', 'olive garden', 'applebee',
    'chili s', 'buffalo wild', 'panda express', 'five guys', 'jimmy john', 'jersey mike', 'shake shack', 'in n out',
    'braum', 'andy s', 'casa doner', 'doner', 'dairy queen', 'baskin', 'cold stone', 'krispy kreme', 'dutch bros', 'tim hortons',
    'bojangles', 'zaxby', 'raising cane', 'el pollo', 'qdoba', 'moe s', 'torchy', 'chuy', 'frozen custard', 'ice cream',
    'restaurant', 'cafe', 'coffee', 'pizza', 'bbq', 'bistro', 'taqueria', 'sushi', 'steakhouse', 'bakery', 'brewery',
    'grill', 'diner', 'tavern', 'pub', 'thai', 'ramen', 'deli', 'wingstop', 'jack in the box', 'carl s jr', 'arby',
  ],
  Shopping: [
    'amazon', 'amzn', 'walmart com', 'target', 'best buy', 'home depot', 'lowe s', 'ikea', 'etsy', 'ebay', 'temu', 'shein',
    'nike', 'adidas', 'old navy', 'gap', 'h m', 'zara', 'nordstrom', 'macy', 'kohl', 'tj maxx', 'tjmaxx', 'marshalls',
    'ross stores', 'burlington', 'carter s', 'children s place', 'hobby lobby', 'michaels', 'joann', 'petco', 'petsmart',
    'bath body', 'sephora', 'ulta', 'apple store', 'apple com', 'dollar tree', 'dollar general', 'big lots', 'bed bath',
    'container store', 'wayfair', 'overstock', 'uniqlo', 'lululemon', 'dick s sporting', 'academy sports', 'foot locker',
  ],
  'Transport/Fuel': [
    'shell', 'exxon', 'mobil', 'chevron', 'bp', 'sunoco', 'valero', 'conoco', 'phillips 66', 'murphy usa', 'murphy express',
    'quiktrip', 'racetrac', 'wawa', 'sheetz', 'buc ee', 'circle k', 'casey s', 'love s', 'pilot', 'flying j', 'speedway',
    'marathon', 'kum go', 'texaco', 'citgo', 'costco gas', 'sams club fuel', 'sams fuel', 'gas station', 'fuel',
    'uber', 'lyft', 'parking', 'toll', 'ntta', 'ez pass', 'ezpass', 'txtag', 'sunpass', 'transit', 'amtrak', 'greyhound',
    'car wash', 'jiffy lube', 'valvoline', 'autozone', 'o reilly', 'advance auto', 'napa auto', 'discount tire',
    'firestone', 'pep boys', 'dmv', 'tire',
  ],
  Health: [
    'cvs', 'walgreens', 'rite aid', 'pharmacy', 'urgent care', 'hospital', 'clinic', 'dental', 'dentist', 'orthodont',
    'optical', 'vision', 'eye care', 'lenscrafters', 'labcorp', 'quest diagnostics', 'physician', 'medical', 'planet fitness',
    'ymca', 'anytime fitness', 'orangetheory', 'la fitness', 'gym', 'kaiser', 'blue cross', 'aetna', 'cigna',
    'unitedhealthcare', 'optum', 'therapy',
  ],
  Entertainment: [
    'amc theatres', 'amc ', 'regal', 'cinemark', 'fandango', 'movie', 'theater', 'theatre', 'ticketmaster', 'stubhub',
    'live nation', 'steam games', 'steampowered', 'playstation', 'xbox', 'nintendo', 'epic games', 'bowling', 'topgolf',
    'dave buster', 'zoo', 'aquarium', 'museum', 'six flags', 'disneyland', 'main event', 'gathering place',
  ],
  'Vacations/Travel': [
    'expedia', 'airbnb', 'vrbo', 'booking com', 'hotels com', 'delta air', 'united air', 'american air', 'southwest air',
    'jetblue', 'spirit air', 'frontier air', 'alaska air', 'marriott', 'hilton', 'hyatt', 'holiday inn', 'hampton inn',
    'best western', 'la quinta', 'motel', 'airlines', 'hertz', 'avis', 'enterprise rent', 'budget rent', 'national car',
    'turo', 'carnival cruise', 'royal caribbean', 'hotel', 'resort', 'airport',
  ],
  Utilities: [
    'electric', 'water utility', 'water dept', 'gas company', 'internet service', 'at t', 'att', 'verizon', 't mobile',
    'tmobile', 'sprint', 'comcast', 'xfinity', 'spectrum', 'cox comm', 'frontier comm', 'google fi', 'mint mobile',
    'visible', 'cricket wireless', 'boost mobile', 'rebtel', 'energy', 'oncor', 'centerpoint', 'txu', 'reliant',
    'duke energy', 'pg e', 'con edison', 'national grid', 'waste management', 'republic services', 'utilities',
  ],
  'Car Insurance': [
    'geico', 'progressive', 'state farm', 'allstate', 'aaa tx ins', 'aaa ins', 'aaa insurance', 'liberty mutual',
    'farmers ins', 'usaa', 'nationwide', 'travelers', 'esurance', 'root insurance', 'lemonade', 'auto ins',
  ],
  'Home/EMI': [
    'mortgage', 'home loan', 'emi payment', 'rocket mortgage', 'mr cooper', 'quicken loans', 'property management',
    'apartment', 'hoa', 'home warranty', 'rent payment',
  ],
  'Fees & Interest': [
    'interest charged', 'interest charge', 'finance charge', 'late fee', 'annual fee', 'overdraft', 'nsf', 'service fee',
    'monthly fee', 'foreign transaction', 'atm fee', 'maintenance fee',
  ],
  'Payments/Transfers': [
    'payment from', 'payment thank you', 'payment received', 'online payment', 'autopay', 'automatic payment',
    'credit card payment', 'epayment', 'e payment', 'mobile payment', 'online transfer', 'transfer to', 'transfer from',
    'wire transfer', 'zelle', 'payroll', 'direct deposit', 'dir dep', 'ach credit',
  ],
};

export const SEED_MERCHANT_RULES: Array<{ pattern: string; category: string }> = Object.entries(BY_CATEGORY).flatMap(
  ([category, patterns]) => patterns.map((pattern) => ({ pattern, category })),
);
