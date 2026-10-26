export type ZaProvince = { slug: string; name: string };
export type ZaCity = { slug: string; name: string; provinceSlug: string };
export type ZaArea = { slug: string; name: string; citySlug: string };

export const zaProvinces: ZaProvince[] = [
  { slug: "gauteng", name: "Gauteng" },
  { slug: "western-cape", name: "Western Cape" },
  { slug: "kwa-zulu-natal", name: "KwaZulu-Natal" },
  { slug: "eastern-cape", name: "Eastern Cape" },
  { slug: "free-state", name: "Free State" },
  { slug: "limpopo", name: "Limpopo" },
  { slug: "mpumalanga", name: "Mpumalanga" },
  { slug: "north-west", name: "North West" },
  { slug: "northern-cape", name: "Northern Cape" },
];


export const zaCities: ZaCity[] = [
  // ── Gauteng ──
  { slug: "johannesburg", name: "Johannesburg", provinceSlug: "gauteng" },
  { slug: "pretoria", name: "Pretoria", provinceSlug: "gauteng" },
  { slug: "ekurhuleni", name: "Ekurhuleni", provinceSlug: "gauteng" },
  { slug: "soweto", name: "Soweto", provinceSlug: "gauteng" },
  { slug: "sandton", name: "Sandton", provinceSlug: "gauteng" },
  { slug: "randburg", name: "Randburg", provinceSlug: "gauteng" },
  { slug: "roodepoort", name: "Roodepoort", provinceSlug: "gauteng" },
  { slug: "midrand", name: "Midrand", provinceSlug: "gauteng" },
  { slug: "centurion", name: "Centurion", provinceSlug: "gauteng" },
  { slug: "hatfield", name: "Hatfield", provinceSlug: "gauteng" },
  { slug: "menlyn", name: "Menlyn", provinceSlug: "gauteng" },
  { slug: "sunnyside", name: "Sunnyside", provinceSlug: "gauteng" },
  { slug: "mamelodi", name: "Mamelodi", provinceSlug: "gauteng" },
  { slug: "soshanguve", name: "Soshanguve", provinceSlug: "gauteng" },
  { slug: "akasia", name: "Akasia", provinceSlug: "gauteng" },
  { slug: "waterkloof", name: "Waterkloof", provinceSlug: "gauteng" },
  { slug: "lenasia", name: "Lenasia", provinceSlug: "gauteng" },
  { slug: "alexandra", name: "Alexandra", provinceSlug: "gauteng" },
  { slug: "boksburg", name: "Boksburg", provinceSlug: "gauteng" },
  { slug: "benoni", name: "Benoni", provinceSlug: "gauteng" },
  { slug: "springs", name: "Springs", provinceSlug: "gauteng" },
  { slug: "kempton-park", name: "Kempton Park", provinceSlug: "gauteng" },
  { slug: "germiston", name: "Germiston", provinceSlug: "gauteng" },
  { slug: "brakpan", name: "Brakpan", provinceSlug: "gauteng" },
  { slug: "vereeniging", name: "Vereeniging", provinceSlug: "gauteng" },
  { slug: "bedfordview", name: "Bedfordview", provinceSlug: "gauteng" },

  // ── Western Cape ──
  { slug: "cape-town", name: "Cape Town", provinceSlug: "western-cape" },
  { slug: "somerset-west", name: "Somerset West", provinceSlug: "western-cape" },
  { slug: "paarl", name: "Paarl", provinceSlug: "western-cape" },
  { slug: "stellenbosch", name: "Stellenbosch", provinceSlug: "western-cape" },
  { slug: "george", name: "George", provinceSlug: "western-cape" },
  { slug: "hermanus", name: "Hermanus", provinceSlug: "western-cape" },
  { slug: "mossel-bay", name: "Mossel Bay", provinceSlug: "western-cape" },
  { slug: "worcester", name: "Worcester", provinceSlug: "western-cape" },
  { slug: "oudtshoorn", name: "Oudtshoorn", provinceSlug: "western-cape" },

  // ── KwaZulu-Natal ──
  { slug: "durban", name: "Durban", provinceSlug: "kwa-zulu-natal" },
  { slug: "umhlanga", name: "Umhlanga", provinceSlug: "kwa-zulu-natal" },
  { slug: "westville", name: "Westville", provinceSlug: "kwa-zulu-natal" },
  { slug: "pinetown", name: "Pinetown", provinceSlug: "kwa-zulu-natal" },
  { slug: "ballito", name: "Ballito", provinceSlug: "kwa-zulu-natal" },
  { slug: "richards-bay", name: "Richards Bay", provinceSlug: "kwa-zulu-natal" },
  { slug: "pietermaritzburg", name: "Pietermaritzburg", provinceSlug: "kwa-zulu-natal" },
  { slug: "port-shepstone", name: "Port Shepstone", provinceSlug: "kwa-zulu-natal" },

  // ── Eastern Cape ──
  { slug: "gqeberha", name: "Gqeberha (PE)", provinceSlug: "eastern-cape" },
  { slug: "east-london", name: "East London", provinceSlug: "eastern-cape" },
  { slug: "mthatha", name: "Mthatha", provinceSlug: "eastern-cape" },
  { slug: "grahamstown", name: "Grahamstown", provinceSlug: "eastern-cape" },

  // ── Free State ──
  { slug: "bloemfontein", name: "Bloemfontein", provinceSlug: "free-state" },
  { slug: "welkom", name: "Welkom", provinceSlug: "free-state" },
  { slug: "kroonstad", name: "Kroonstad", provinceSlug: "free-state" },
  { slug: "sasolburg", name: "Sasolburg", provinceSlug: "free-state" },
  { slug: "bethlehem", name: "Bethlehem", provinceSlug: "free-state" },

  // ── Limpopo ──
  { slug: "polokwane", name: "Polokwane", provinceSlug: "limpopo" },
  { slug: "mokopane", name: "Mokopane", provinceSlug: "limpopo" },
  { slug: "tzaneen", name: "Tzaneen", provinceSlug: "limpopo" },
  { slug: "thohoyandou", name: "Thohoyandou", provinceSlug: "limpopo" },
  { slug: "lephalale", name: "Lephalale", provinceSlug: "limpopo" },

  // ── Mpumalanga ──
  { slug: "mbombela", name: "Mbombela", provinceSlug: "mpumalanga" },
  { slug: "emalahleni", name: "Emalahleni (Witbank)", provinceSlug: "mpumalanga" },
  { slug: "secunda", name: "Secunda", provinceSlug: "mpumalanga" },
  { slug: "standerton", name: "Standerton", provinceSlug: "mpumalanga" },

  // ── North West ──
  { slug: "rustenburg", name: "Rustenburg", provinceSlug: "north-west" },
  { slug: "potchefstroom", name: "Potchefstroom", provinceSlug: "north-west" },
  { slug: "klerksdorp", name: "Klerksdorp", provinceSlug: "north-west" },
  { slug: "mahikeng", name: "Mahikeng", provinceSlug: "north-west" },

  // ── Northern Cape ──
  { slug: "kimberley", name: "Kimberley", provinceSlug: "northern-cape" },
  { slug: "upington", name: "Upington", provinceSlug: "northern-cape" },
  { slug: "springbok", name: "Springbok", provinceSlug: "northern-cape" },
];


/** Suburbs / areas / townships per city, used for the seller form + matching. */
export const zaAreas: ZaArea[] = [
  // ── Gauteng: Johannesburg & surrounds ──
  { slug: "sandton", name: "Sandton", citySlug: "johannesburg" },
  { slug: "soweto", name: "Soweto", citySlug: "johannesburg" },
  { slug: "johannesburg-cbd", name: "Johannesburg CBD", citySlug: "johannesburg" },
  { slug: "randburg", name: "Randburg", citySlug: "johannesburg" },
  { slug: "roodepoort", name: "Roodepoort", citySlug: "johannesburg" },
  { slug: "lenasia", name: "Lenasia", citySlug: "johannesburg" },
  { slug: "alexandra", name: "Alexandra", citySlug: "johannesburg" },
  { slug: "dobsonville", name: "Dobsonville", citySlug: "johannesburg" },
  { slug: "orange-river", name: "Orange River", citySlug: "johannesburg" },

  // ── Gauteng: Pretoria / Tshwane ──
  { slug: "pretoria-north", name: "Pretoria North", citySlug: "pretoria" },
  { slug: "pretoria-cbd", name: "Pretoria CBD", citySlug: "pretoria" },
  { slug: "centurion", name: "Centurion", citySlug: "pretoria" },
  { slug: "menlyn", name: "Menlyn", citySlug: "pretoria" },
  { slug: "hatfield", name: "Hatfield", citySlug: "pretoria" },
  { slug: "sunnyside", name: "Sunnyside", citySlug: "pretoria" },
  { slug: "montana", name: "Montana", citySlug: "pretoria" },
  { slug: "akasia", name: "Akasia", citySlug: "pretoria" },
  { slug: "waterkloof", name: "Waterkloof", citySlug: "pretoria" },
  { slug: "brooklyn", name: "Brooklyn", citySlug: "pretoria" },
  { slug: "mamelodi", name: "Mamelodi", citySlug: "pretoria" },
  { slug: "soshanguve", name: "Soshanguve", citySlug: "pretoria" },
  { slug: "arcadia", name: "Arcadia", citySlug: "pretoria" },
  { slug: "garsfontein", name: "Garsfontein", citySlug: "pretoria" },

  // ── Gauteng: East Rand ──
  { slug: "kempton-park", name: "Kempton Park", citySlug: "kempton-park" },
  { slug: "boksburg", name: "Boksburg", citySlug: "boksburg" },
  { slug: "benoni", name: "Benoni", citySlug: "benoni" },
  { slug: "springs", name: "Springs", citySlug: "springs" },
  { slug: "germiston", name: "Germiston", citySlug: "germiston" },
  { slug: "brakpan", name: "Brakpan", citySlug: "brakpan" },
  { slug: "alberton", name: "Alberton", citySlug: "germiston" },
  { slug: "bedfordview", name: "Bedfordview", citySlug: "bedfordview" },
  { slug: "vereeniging", name: "Vereeniging", citySlug: "vereeniging" },
];

/** Additional metro suburbs and areas, including Gauteng, appended to `zaAreas`. */
export const zaAreasRest: ZaArea[] = [
  // ── Gauteng: standalone metro-city selections ──
  { slug: "ekurhuleni-alberton", name: "Alberton", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-benoni", name: "Benoni", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-boksburg", name: "Boksburg", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-brakpan", name: "Brakpan", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-germiston", name: "Germiston", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-kempton-park", name: "Kempton Park", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-nigel", name: "Nigel", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-springs", name: "Springs", citySlug: "ekurhuleni" },
  { slug: "ekurhuleni-tembisa", name: "Tembisa", citySlug: "ekurhuleni" },
  { slug: "soweto-orlando", name: "Orlando", citySlug: "soweto" },
  { slug: "soweto-diepkloof", name: "Diepkloof", citySlug: "soweto" },
  { slug: "soweto-meadowlands", name: "Meadowlands", citySlug: "soweto" },
  { slug: "soweto-pimville", name: "Pimville", citySlug: "soweto" },
  { slug: "soweto-dube", name: "Dube", citySlug: "soweto" },
  { slug: "soweto-protea-glen", name: "Protea Glen", citySlug: "soweto" },
  { slug: "soweto-dobsonville", name: "Dobsonville", citySlug: "soweto" },
  { slug: "soweto-naledi", name: "Naledi", citySlug: "soweto" },
  { slug: "soweto-jabulani", name: "Jabulani", citySlug: "soweto" },
  { slug: "soweto-chiawelo", name: "Chiawelo", citySlug: "soweto" },
  { slug: "soweto-zola", name: "Zola", citySlug: "soweto" },
  { slug: "sandton-bryanston", name: "Bryanston", citySlug: "sandton" },
  { slug: "sandton-fourways", name: "Fourways", citySlug: "sandton" },
  { slug: "sandton-morningside", name: "Morningside", citySlug: "sandton" },
  { slug: "sandton-rivonia", name: "Rivonia", citySlug: "sandton" },
  { slug: "sandton-sunninghill", name: "Sunninghill", citySlug: "sandton" },
  { slug: "sandton-lonehill", name: "Lonehill", citySlug: "sandton" },
  { slug: "sandton-woodmead", name: "Woodmead", citySlug: "sandton" },
  { slug: "sandton-paulshof", name: "Paulshof", citySlug: "sandton" },
  { slug: "sandton-douglasdale", name: "Douglasdale", citySlug: "sandton" },
  { slug: "sandton-hyde-park", name: "Hyde Park", citySlug: "sandton" },
  { slug: "randburg-ferndale", name: "Ferndale", citySlug: "randburg" },
  { slug: "randburg-blairgowrie", name: "Blairgowrie", citySlug: "randburg" },
  { slug: "randburg-linden", name: "Linden", citySlug: "randburg" },
  { slug: "randburg-northcliff", name: "Northcliff", citySlug: "randburg" },
  { slug: "randburg-cresta", name: "Cresta", citySlug: "randburg" },
  { slug: "randburg-fontainebleau", name: "Fontainebleau", citySlug: "randburg" },
  { slug: "randburg-robindale", name: "Robindale", citySlug: "randburg" },
  { slug: "randburg-boskruin", name: "Boskruin", citySlug: "randburg" },
  { slug: "randburg-bromhof", name: "Bromhof", citySlug: "randburg" },
  { slug: "randburg-randpark-ridge", name: "Randpark Ridge", citySlug: "randburg" },
  { slug: "roodepoort-florida", name: "Florida", citySlug: "roodepoort" },
  { slug: "roodepoort-florida-park", name: "Florida Park", citySlug: "roodepoort" },
  { slug: "roodepoort-horison", name: "Horison", citySlug: "roodepoort" },
  { slug: "roodepoort-wilgeheuwel", name: "Wilgeheuwel", citySlug: "roodepoort" },
  { slug: "roodepoort-weltevreden-park", name: "Weltevreden Park", citySlug: "roodepoort" },
  { slug: "roodepoort-little-falls", name: "Little Falls", citySlug: "roodepoort" },
  { slug: "roodepoort-honeydew", name: "Honeydew", citySlug: "roodepoort" },
  { slug: "roodepoort-ruimsig", name: "Ruimsig", citySlug: "roodepoort" },
  { slug: "roodepoort-constantia-kloof", name: "Constantia Kloof", citySlug: "roodepoort" },
  { slug: "roodepoort-discovery", name: "Discovery", citySlug: "roodepoort" },
  { slug: "roodepoort-strubens-valley", name: "Strubens Valley", citySlug: "roodepoort" },
  { slug: "roodepoort-helderkruin", name: "Helderkruin", citySlug: "roodepoort" },
  { slug: "roodepoort-princess", name: "Princess", citySlug: "roodepoort" },
  { slug: "roodepoort-fleurhof", name: "Fleurhof", citySlug: "roodepoort" },
  { slug: "roodepoort-lindhaven", name: "Lindhaven", citySlug: "roodepoort" },
  { slug: "roodepoort-roodekrans", name: "Roodekrans", citySlug: "roodepoort" },
  { slug: "midrand-halfway-house", name: "Halfway House", citySlug: "midrand" },
  { slug: "midrand-noordwyk", name: "Noordwyk", citySlug: "midrand" },
  { slug: "midrand-vorna-valley", name: "Vorna Valley", citySlug: "midrand" },
  { slug: "midrand-kyalami", name: "Kyalami", citySlug: "midrand" },
  { slug: "midrand-carlswald", name: "Carlswald", citySlug: "midrand" },
  { slug: "midrand-glen-austin", name: "Glen Austin", citySlug: "midrand" },
  { slug: "midrand-blue-hills", name: "Blue Hills", citySlug: "midrand" },
  { slug: "midrand-summerset", name: "Summerset", citySlug: "midrand" },
  { slug: "midrand-grand-central", name: "Grand Central", citySlug: "midrand" },
  { slug: "centurion-lyttelton", name: "Lyttelton", citySlug: "centurion" },
  { slug: "centurion-eldoraigne", name: "Eldoraigne", citySlug: "centurion" },
  { slug: "centurion-wierdapark", name: "Wierdapark", citySlug: "centurion" },
  { slug: "centurion-rooihuiskraal", name: "Rooihuiskraal", citySlug: "centurion" },
  { slug: "centurion-highveld", name: "Highveld", citySlug: "centurion" },
  { slug: "centurion-irene", name: "Irene", citySlug: "centurion" },
  { slug: "centurion-pierre-van-ryneveld", name: "Pierre van Ryneveld", citySlug: "centurion" },
  { slug: "centurion-die-hoewes", name: "Die Hoewes", citySlug: "centurion" },
  { slug: "centurion-hennopspark", name: "Hennopspark", citySlug: "centurion" },
  { slug: "hatfield-colbyn", name: "Colbyn", citySlug: "hatfield" },
  { slug: "hatfield-arcadia", name: "Arcadia", citySlug: "hatfield" },
  { slug: "hatfield-brooklyn", name: "Brooklyn", citySlug: "hatfield" },
  { slug: "hatfield-sunnyside", name: "Sunnyside", citySlug: "hatfield" },
  { slug: "menlyn-garsfontein", name: "Garsfontein", citySlug: "menlyn" },
  { slug: "menlyn-faerie-glen", name: "Faerie Glen", citySlug: "menlyn" },
  { slug: "menlyn-lynnwood", name: "Lynnwood", citySlug: "menlyn" },
  { slug: "menlyn-moreleta-park", name: "Moreleta Park", citySlug: "menlyn" },
  { slug: "menlyn-waterkloof-ridge", name: "Waterkloof Ridge", citySlug: "menlyn" },
  { slug: "sunnyside-arcadia", name: "Arcadia", citySlug: "sunnyside" },
  { slug: "sunnyside-pretoria-cbd", name: "Pretoria CBD", citySlug: "sunnyside" },
  { slug: "sunnyside-hatfield", name: "Hatfield", citySlug: "sunnyside" },
  { slug: "sunnyside-muckleneuk", name: "Muckleneuk", citySlug: "sunnyside" },
  { slug: "sunnyside-groenkloof", name: "Groenkloof", citySlug: "sunnyside" },
  { slug: "mamelodi-east", name: "Mamelodi East", citySlug: "mamelodi" },
  { slug: "mamelodi-west", name: "Mamelodi West", citySlug: "mamelodi" },
  { slug: "mamelodi-ext-5", name: "Mamelodi Extension 5", citySlug: "mamelodi" },
  { slug: "mamelodi-ext-6", name: "Mamelodi Extension 6", citySlug: "mamelodi" },
  { slug: "soshanguve-block-a", name: "Soshanguve Block A", citySlug: "soshanguve" },
  { slug: "soshanguve-block-f", name: "Soshanguve Block F", citySlug: "soshanguve" },
  { slug: "soshanguve-block-xx", name: "Soshanguve Block XX", citySlug: "soshanguve" },
  { slug: "soshanguve-block-xxv", name: "Soshanguve Block XXV", citySlug: "soshanguve" },
  { slug: "akasia-montana", name: "Montana", citySlug: "akasia" },
  { slug: "akasia-theresa-park", name: "Theresa Park", citySlug: "akasia" },
  { slug: "akasia-chantelle", name: "Chantelle", citySlug: "akasia" },
  { slug: "akasia-florauna", name: "Florauna", citySlug: "akasia" },
  { slug: "akasia-ga-rankuwa", name: "Ga-Rankuwa", citySlug: "akasia" },
  { slug: "waterkloof-brooklyn", name: "Brooklyn", citySlug: "waterkloof" },
  { slug: "waterkloof-lynnwood", name: "Lynnwood", citySlug: "waterkloof" },
  { slug: "waterkloof-erasmusrand", name: "Erasmusrand", citySlug: "waterkloof" },
  { slug: "waterkloof-monument-park", name: "Monument Park", citySlug: "waterkloof" },
  { slug: "waterkloof-groenkloof", name: "Groenkloof", citySlug: "waterkloof" },
  { slug: "lenasia-ext-1", name: "Lenasia Extension 1", citySlug: "lenasia" },
  { slug: "lenasia-ext-5", name: "Lenasia Extension 5", citySlug: "lenasia" },
  { slug: "lenasia-ext-9", name: "Lenasia Extension 9", citySlug: "lenasia" },
  { slug: "lenasia-ext-10", name: "Lenasia Extension 10", citySlug: "lenasia" },
  { slug: "lenasia-ext-13", name: "Lenasia Extension 13", citySlug: "lenasia" },
  { slug: "alexandra-east-bank", name: "East Bank", citySlug: "alexandra" },
  { slug: "alexandra-west-bank", name: "West Bank", citySlug: "alexandra" },
  { slug: "alexandra-ext-7", name: "Extension 7", citySlug: "alexandra" },
  { slug: "alexandra-ext-8", name: "Extension 8", citySlug: "alexandra" },
  { slug: "alexandra-ext-9", name: "Extension 9", citySlug: "alexandra" },
  { slug: "johannesburg-rosebank", name: "Rosebank", citySlug: "johannesburg" },
  { slug: "johannesburg-melville", name: "Melville", citySlug: "johannesburg" },
  { slug: "johannesburg-parkhurst", name: "Parkhurst", citySlug: "johannesburg" },
  { slug: "johannesburg-parktown", name: "Parktown", citySlug: "johannesburg" },
  { slug: "johannesburg-houghton", name: "Houghton", citySlug: "johannesburg" },
  { slug: "johannesburg-norwood", name: "Norwood", citySlug: "johannesburg" },
  { slug: "johannesburg-greenside", name: "Greenside", citySlug: "johannesburg" },
  { slug: "johannesburg-braamfontein", name: "Braamfontein", citySlug: "johannesburg" },
  { slug: "johannesburg-newtown", name: "Newtown", citySlug: "johannesburg" },
  { slug: "johannesburg-yeoville", name: "Yeoville", citySlug: "johannesburg" },
  { slug: "johannesburg-kensington", name: "Kensington", citySlug: "johannesburg" },
  { slug: "johannesburg-edenvale", name: "Edenvale", citySlug: "johannesburg" },
  { slug: "pretoria-lynnwood", name: "Lynnwood", citySlug: "pretoria" },
  { slug: "pretoria-faerie-glen", name: "Faerie Glen", citySlug: "pretoria" },
  { slug: "pretoria-moreleta-park", name: "Moreleta Park", citySlug: "pretoria" },
  { slug: "pretoria-erasmuskloof", name: "Erasmuskloof", citySlug: "pretoria" },
  { slug: "pretoria-centurion-central", name: "Centurion Central", citySlug: "pretoria" },
  { slug: "pretoria-queenswood", name: "Queenswood", citySlug: "pretoria" },

  // ── Western Cape ──
  { slug: "city-bowl", name: "City Bowl", citySlug: "cape-town" },
  { slug: "sea-point", name: "Sea Point", citySlug: "cape-town" },
  { slug: "camps-bay", name: "Camps Bay", citySlug: "cape-town" },
  { slug: "woodstock", name: "Woodstock", citySlug: "cape-town" },
  { slug: "observatory", name: "Observatory", citySlug: "cape-town" },
  { slug: "kalk-bay", name: "Kalk Bay", citySlug: "cape-town" },
  { slug: "muizenberg", name: "Muizenberg", citySlug: "cape-town" },
  { slug: "durbanville", name: "Durbanville", citySlug: "cape-town" },
  { slug: "parow", name: "Parow", citySlug: "cape-town" },
  { slug: "khayelitsha", name: "Khayelitsha", citySlug: "cape-town" },
  { slug: "mitchells-plain", name: "Mitchells Plain", citySlug: "cape-town" },
  { slug: "cape-town-gardens", name: "Gardens", citySlug: "cape-town" },
  { slug: "cape-town-green-point", name: "Green Point", citySlug: "cape-town" },
  { slug: "cape-town-claremont", name: "Claremont", citySlug: "cape-town" },
  { slug: "cape-town-rondebosch", name: "Rondebosch", citySlug: "cape-town" },
  { slug: "cape-town-newlands", name: "Newlands", citySlug: "cape-town" },
  { slug: "cape-town-bellville", name: "Bellville", citySlug: "cape-town" },
  { slug: "cape-town-brackenfell", name: "Brackenfell", citySlug: "cape-town" },
  { slug: "cape-town-kuils-river", name: "Kuils River", citySlug: "cape-town" },
  { slug: "cape-town-parklands", name: "Parklands", citySlug: "cape-town" },
  { slug: "cape-town-table-view", name: "Table View", citySlug: "cape-town" },
  { slug: "cape-town-bothasig", name: "Bothasig", citySlug: "cape-town" },
  { slug: "cape-town-constantia", name: "Constantia", citySlug: "cape-town" },
  { slug: "cape-town-milnerton", name: "Milnerton", citySlug: "cape-town" },
  { slug: "cape-town-langa", name: "Langa", citySlug: "cape-town" },
  { slug: "cape-town-gugulethu", name: "Gugulethu", citySlug: "cape-town" },
  { slug: "somerset-west-strand", name: "Strand", citySlug: "somerset-west" },
  { slug: "somerset-west-gordon-bay", name: "Gordon's Bay", citySlug: "somerset-west" },
  { slug: "paarl-wellington", name: "Wellington", citySlug: "paarl" },
  { slug: "paarl-simondium", name: "Simondium", citySlug: "paarl" },
  { slug: "stellenbosch-cloetesville", name: "Cloetesville", citySlug: "stellenbosch" },
  { slug: "stellenbosch-idas-valley", name: "Idas Valley", citySlug: "stellenbosch" },
  { slug: "stellenbosch-jonkershoek", name: "Jonkershoek", citySlug: "stellenbosch" },
  { slug: "george-heather-park", name: "Heather Park", citySlug: "george" },
  { slug: "george-pacaltsdorp", name: "Pacaltsdorp", citySlug: "george" },
  { slug: "george-thembalethu", name: "Thembalethu", citySlug: "george" },
  { slug: "somerset-west-centre", name: "Somerset West CBD", citySlug: "somerset-west" },
  { slug: "paarl-centre", name: "Paarl", citySlug: "paarl" },
  { slug: "stellenbosch-centre", name: "Stellenbosch", citySlug: "stellenbosch" },
  { slug: "george-centre", name: "George", citySlug: "george" },
  { slug: "hermanus-centre", name: "Hermanus", citySlug: "hermanus" },
  { slug: "mossel-bay-centre", name: "Mossel Bay", citySlug: "mossel-bay" },
  { slug: "worcester-centre", name: "Worcester", citySlug: "worcester" },
  { slug: "oudtshoorn-centre", name: "Oudtshoorn", citySlug: "oudtshoorn" },

  // ── KwaZulu-Natal ──
  { slug: "north-beach", name: "North Beach", citySlug: "durban" },
  { slug: "umhlanga-ridge", name: "Umhlanga Ridge", citySlug: "umhlanga" },
  { slug: "westville-sub", name: "Westville", citySlug: "westville" },
  { slug: "pinetown-sub", name: "Pinetown", citySlug: "pinetown" },
  { slug: "umlazi", name: "Umlazi", citySlug: "durban" },
  { slug: "ballito-sub", name: "Ballito", citySlug: "ballito" },
  { slug: "richards-bay-sub", name: "Richards Bay", citySlug: "richards-bay" },
  { slug: "pmb", name: "Pietermaritzburg", citySlug: "pietermaritzburg" },
  { slug: "port-shepstone-sub", name: "Port Shepstone", citySlug: "port-shepstone" },
  { slug: "durban-berea", name: "Berea", citySlug: "durban" },
  { slug: "durban-musgrave", name: "Musgrave", citySlug: "durban" },
  { slug: "durban-morningside", name: "Morningside", citySlug: "durban" },
  { slug: "durban-glenwood", name: "Glenwood", citySlug: "durban" },
  { slug: "durban-umhlanga", name: "Umhlanga", citySlug: "durban" },
  { slug: "durban-umhlazi", name: "Umlazi", citySlug: "durban" },
  { slug: "durban-pinetown", name: "Pinetown", citySlug: "durban" },
  { slug: "durban-newlands-east", name: "Newlands East", citySlug: "durban" },
  { slug: "durban-chatsworth", name: "Chatsworth", citySlug: "durban" },
  { slug: "durban-phoenix", name: "Phoenix", citySlug: "durban" },
  { slug: "durban-inanda", name: "Inanda", citySlug: "durban" },
  { slug: "durban-westville", name: "Westville", citySlug: "durban" },
  { slug: "umhlanga-la-lucia", name: "La Lucia", citySlug: "umhlanga" },
  { slug: "umhlanga-avondale", name: "Avondale", citySlug: "umhlanga" },
  { slug: "umhlanga-somerset-park", name: "Somerset Park", citySlug: "umhlanga" },
  { slug: "pietermaritzburg-hayfields", name: "Hayfields", citySlug: "pietermaritzburg" },
  { slug: "pietermaritzburg-northdale", name: "Northdale", citySlug: "pietermaritzburg" },
  { slug: "pietermaritzburg-willowton", name: "Willowton", citySlug: "pietermaritzburg" },

  // ── Eastern Cape ──
  { slug: "central-pe", name: "Central", citySlug: "gqeberha" },
  { slug: "summerstrand", name: "Summerstrand", citySlug: "gqeberha" },
  { slug: "walmer", name: "Walmer", citySlug: "gqeberha" },
  { slug: "north-end", name: "North End", citySlug: "gqeberha" },
  { slug: "gqeberha-newton-park", name: "Newton Park", citySlug: "gqeberha" },
  { slug: "gqeberha-lorraine", name: "Lorraine", citySlug: "gqeberha" },
  { slug: "gqeberha-kabega-park", name: "Kabega Park", citySlug: "gqeberha" },
  { slug: "gqeberha-kwa-zakhele", name: "KwaZakhele", citySlug: "gqeberha" },
  { slug: "gqeberha-despatch", name: "Despatch", citySlug: "gqeberha" },
  { slug: "berea-el", name: "Berea", citySlug: "east-london" },
  { slug: "gonubie", name: "Gonubie", citySlug: "east-london" },
  { slug: "east-london-southernwood", name: "Southernwood", citySlug: "east-london" },
  { slug: "east-london-quigney", name: "Quigney", citySlug: "east-london" },
  { slug: "east-london-nahoon", name: "Nahoon", citySlug: "east-london" },
  { slug: "east-london-mdantsane", name: "Mdantsane", citySlug: "east-london" },
  { slug: "mthatha-sub", name: "Mthatha", citySlug: "mthatha" },
  { slug: "grahamstown-sub", name: "Grahamstown", citySlug: "grahamstown" },

  // ── Free State ──
  { slug: "bloemfontein-centre", name: "Bloemfontein CBD", citySlug: "bloemfontein" },
  { slug: "mangaung", name: "Mangaung", citySlug: "bloemfontein" },
  { slug: "welkom-centre", name: "Welkom", citySlug: "welkom" },
  { slug: "kroonstad-centre", name: "Kroonstad", citySlug: "kroonstad" },
  { slug: "sasolburg-centre", name: "Sasolburg", citySlug: "sasolburg" },
  { slug: "bethlehem-centre", name: "Bethlehem", citySlug: "bethlehem" },

  // ── Limpopo ──
  { slug: "polokwane-centre", name: "Polokwane CBD", citySlug: "polokwane" },
  { slug: "mokopane-centre", name: "Mokopane", citySlug: "mokopane" },
  { slug: "tzaneen-centre", name: "Tzaneen", citySlug: "tzaneen" },
  { slug: "thohoyandou-centre", name: "Thohoyandou", citySlug: "thohoyandou" },
  { slug: "lephalale-centre", name: "Lephalale", citySlug: "lephalale" },

  // ── Mpumalanga ──
  { slug: "mbombela-centre", name: "Mbombela CBD", citySlug: "mbombela" },
  { slug: "nelspruit", name: "Nelspruit", citySlug: "mbombela" },
  { slug: "witbank", name: "Witbank", citySlug: "emalahleni" },
  { slug: "secunda-centre", name: "Secunda", citySlug: "secunda" },
  { slug: "standerton-centre", name: "Standerton", citySlug: "standerton" },

  // ── North West ──
  { slug: "rustenburg-centre", name: "Rustenburg", citySlug: "rustenburg" },
  { slug: "tlhabane", name: "Tlhabane", citySlug: "rustenburg" },
  { slug: "potch-centre", name: "Potchefstroom", citySlug: "potchefstroom" },
  { slug: "klerksdorp-centre", name: "Klerksdorp", citySlug: "klerksdorp" },
  { slug: "mahikeng-centre", name: "Mahikeng", citySlug: "mahikeng" },

  // ── Northern Cape ──
  { slug: "kimberley-centre", name: "Kimberley", citySlug: "kimberley" },
  { slug: "upington-centre", name: "Upington", citySlug: "upington" },
  { slug: "springbok-centre", name: "Springbok", citySlug: "springbok" },
];

/** Every area, nationwide, for the seller form and the matcher. */
export const allZaAreas: ZaArea[] = [...zaAreas, ...zaAreasRest];

/** Place names offered as native autocomplete suggestions in buyer search. */
export const zaPlaceSuggestions = [
  ...new Map(
    allZaAreas.map((area) => {
      const city = zaCities.find((entry) => entry.slug === area.citySlug);
      return [
        area.name,
        { value: area.name, label: city ? `${area.name} · ${city.name}` : area.name },
      ] as const;
    })
  ).values(),
  ...zaCities.map((city) => ({ value: city.name, label: `${city.name} · city` })),
  ...zaProvinces.map((province) => ({ value: province.name, label: `${province.name} · province` })),
];


export const zaCitiesForProvince = (provinceSlug: string) =>
  zaCities.filter((c) => c.provinceSlug === provinceSlug);
export const zaAreasForCity = (citySlug: string) =>
  allZaAreas.filter((a) => a.citySlug === citySlug);
export function findZaCity(slug: string) {
  return zaCities.find((c) => c.slug === slug);
}
export const findZaProvince = (slug: string) => zaProvinces.find((p) => p.slug === slug);

/** The province a city belongs to, or undefined for an unknown city. */
export const provinceOfCity = (citySlug: string): ZaProvince | undefined => {
  const city = findZaCity(citySlug);
  return city ? findZaProvince(city.provinceSlug) : undefined;
};

/**
 * Abbreviations people actually type. "KZN" is the one that matters: it is the
 * standard way KwaZulu-Natal is referred to in SA business and it is not a
 * substring of the province name, so a plain name match misses it entirely.
 * Keys are already normalised (lowercase, no punctuation).
 */
const PROVINCE_ALIASES: Record<string, string> = {
  kzn: "kwa-zulu-natal",
  natal: "kwa-zulu-natal",
  gauteng: "gauteng",
  "western cape": "western-cape",
  cape: "western-cape",
  "eastern cape": "eastern-cape",
  "free state": "free-state",
  limpopo: "limpopo",
  mpumalanga: "mpumalanga",
  "north west": "north-west",
  "north-west province": "north-west",
  "northern cape": "northern-cape",
};

/**
 * Resolve free text to a PROVINCE ("gauteng", "Western Cape", "kwa zulu natal").
 *
 * `resolvePlace` only understands cities and suburbs, so a province name fell
 * through it and the location half of matching was silently dropped. That
 * matters because the home page's "Browse by area" tiles link to
 * `/find-pro?place=<province>` — without this, "a plumber in Gauteng" ranked
 * on category alone, and pros in Polokwane or Bloemfontein were treated as
 * equally local to a Gauteng buyer as pros in Sandton.
 */
export function resolveProvince(input: string): ZaProvince | undefined {
  const n = normPlace(input);
  if (!n) return undefined;

  const byAlias = zaProvinces.find((p) => p.slug === PROVINCE_ALIASES[n]);
  if (byAlias) return byAlias;

  const slug = n.replace(/\s+/g, "-");
  return (
    zaProvinces.find((p) => p.slug === slug) ??
    zaProvinces.find((p) => normPlace(p.name) === n) ??
    zaProvinces.find((p) => n.includes(normPlace(p.name)) || normPlace(p.name).includes(n))
  );
}

/** Case/punctuation-insensitive lookup so typed names ("Cape town") match. */
const normPlace = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Resolve a free-text place to a city/area pair across the whole country, so
 * "plumbers in Bloemfontein" and "plumbers in Observatory" both work — not just
 * the three launch metros.
 */
export function resolvePlace(input: string): { city: ZaCity; area?: ZaArea } | undefined {
  const n = normPlace(input);
  if (!n) return undefined;
  const slug = n.replace(/\s+/g, "-");

  const area =
    allZaAreas.find((a) => a.slug === slug) ??
    allZaAreas.find((a) => normPlace(a.name) === n);
  if (area) {
    const city = findZaCity(area.citySlug);
    if (city) return { city, area };
  }

  const city =
    zaCities.find((c) => c.slug === slug) ??
    zaCities.find((c) => normPlace(c.name) === n) ??
    zaCities.find((c) => normPlace(c.name).includes(n) || n.includes(normPlace(c.name)));
  return city ? { city } : undefined;
}
