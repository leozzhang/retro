/** Where schools are and where players come from: drives hometowns in the roster generator. */

/** Each school's state. */
export const TEAM_STATE: Record<string, string> = {
  // SEC
  alabama: 'AL', arkansas: 'AR', auburn: 'AL', florida: 'FL', georgia: 'GA', kentucky: 'KY', lsu: 'LA',
  mississippistate: 'MS', missouri: 'MO', oklahoma: 'OK', olemiss: 'MS', southcarolina: 'SC', tennessee: 'TN',
  texas: 'TX', texasam: 'TX', vanderbilt: 'TN',
  // Big Ten
  illinois: 'IL', indiana: 'IN', iowa: 'IA', maryland: 'MD', michigan: 'MI', michiganstate: 'MI', minnesota: 'MN',
  nebraska: 'NE', northwestern: 'IL', ohiostate: 'OH', oregon: 'OR', pennstate: 'PA', purdue: 'IN', rutgers: 'NJ',
  ucla: 'CA', usc: 'CA', washington: 'WA', wisconsin: 'WI',
  // ACC
  bostoncollege: 'MA', california: 'CA', clemson: 'SC', duke: 'NC', floridastate: 'FL', georgiatech: 'GA',
  louisville: 'KY', miami: 'FL', northcarolina: 'NC', ncstate: 'NC', pittsburgh: 'PA', smu: 'TX', stanford: 'CA',
  syracuse: 'NY', virginia: 'VA', virginiatech: 'VA', wakeforest: 'NC',
  // Big 12
  arizona: 'AZ', arizonastate: 'AZ', baylor: 'TX', byu: 'UT', cincinnati: 'OH', colorado: 'CO', houston: 'TX',
  iowastate: 'IA', kansas: 'KS', kansasstate: 'KS', oklahomastate: 'OK', tcu: 'TX', texastech: 'TX', ucf: 'FL',
  utah: 'UT', westvirginia: 'WV',
  // Independents
  notredame: 'IN', uconn: 'CT',
  // American
  army: 'NY', charlotte: 'NC', eastcarolina: 'NC', fau: 'FL', memphis: 'TN', navy: 'MD', northtexas: 'TX',
  rice: 'TX', southflorida: 'FL', temple: 'PA', tulane: 'LA', tulsa: 'OK', uab: 'AL', utsa: 'TX',
  // Pac-12
  boisestate: 'ID', coloradostate: 'CO', fresnostate: 'CA', oregonstate: 'OR', sandiegostate: 'CA',
  texasstate: 'TX', utahstate: 'UT', washingtonstate: 'WA',
  // Mountain West
  airforce: 'CO', hawaii: 'HI', nevada: 'NV', newmexico: 'NM', northernillinois: 'IL', sanjosestate: 'CA',
  unlv: 'NV', utep: 'TX', wyoming: 'WY', northdakotastate: 'ND',
  // MAC
  akron: 'OH', ballstate: 'IN', bowlinggreen: 'OH', buffalo: 'NY', centralmichigan: 'MI', easternmichigan: 'MI',
  kentstate: 'OH', miamioh: 'OH', ohio: 'OH', toledo: 'OH', westernmichigan: 'MI', umass: 'MA',
  sacramentostate: 'CA',
  // Sun Belt
  appstate: 'NC', arkansasstate: 'AR', coastalcarolina: 'SC', georgiasouthern: 'GA', georgiastate: 'GA',
  jamesmadison: 'VA', louisiana: 'LA', louisianatech: 'LA', marshall: 'WV', olddominion: 'VA', southalabama: 'AL',
  southernmiss: 'MS', troy: 'AL', ulm: 'LA',
  // C-USA
  delaware: 'DE', fiu: 'FL', jacksonvillestate: 'AL', kennesawstate: 'GA', liberty: 'VA', middletennessee: 'TN',
  missouristate: 'MO', newmexicostate: 'NM', samhouston: 'TX', westernkentucky: 'KY',
};

/** Recruiting regions: a school pulls hardest from its own state, then its region. */
export const REGION: Record<string, string> = {
  TX: 'SW', OK: 'SW', AR: 'S', LA: 'S', NM: 'SW', AZ: 'SW',
  FL: 'SE', GA: 'SE', AL: 'SE', MS: 'S', SC: 'SE', TN: 'S', KY: 'S', NC: 'MA', VA: 'MA', WV: 'MA', MD: 'MA', DE: 'MA', DC: 'MA',
  OH: 'MW', MI: 'MW', IN: 'MW', IL: 'MW', WI: 'MW', MN: 'MW', IA: 'MW', MO: 'MW',
  KS: 'PL', NE: 'PL', ND: 'PL', SD: 'PL',
  PA: 'NE', NJ: 'NE', NY: 'NE', CT: 'NE', MA: 'NE', RI: 'NE', NH: 'NE', VT: 'NE', ME: 'NE',
  CA: 'W', OR: 'W', WA: 'W', HI: 'W', NV: 'W', AK: 'W',
  CO: 'MT', UT: 'MT', ID: 'MT', WY: 'MT', MT: 'MT',
};

/** Relative FBS-recruit output by state, for national recruiting. */
export const TALENT: Record<string, number> = {
  TX: 14, FL: 13, GA: 9, CA: 9, OH: 5, AL: 4, LA: 4, NC: 4, PA: 4, VA: 3, TN: 3, SC: 3, MS: 3, NJ: 3, MD: 3,
  IL: 3, MI: 3, AZ: 2, OK: 2, MO: 2, IN: 2, NY: 2, KY: 1.5, AR: 1.5, WA: 1.5, UT: 1.5, CO: 1, NV: 1, MN: 1,
  WI: 1, KS: 1, IA: 1, OR: 1, MA: 1, HI: 0.8, CT: 0.6, NE: 0.6, NM: 0.5, DC: 0.5, DE: 0.4, WV: 0.4, ID: 0.3,
  WY: 0.15, ND: 0.2, SD: 0.15, MT: 0.2, AK: 0.1, RI: 0.2, NH: 0.15, VT: 0.05, ME: 0.1,
};

/** Hometowns per state; the first is the big metro and comes up twice as often. */
export const CITIES: Record<string, string[]> = {
  AL: ['Birmingham', 'Mobile', 'Montgomery', 'Huntsville', 'Tuscaloosa', 'Hoover', 'Dothan', 'Auburn'],
  AK: ['Anchorage', 'Fairbanks', 'Juneau'],
  AZ: ['Phoenix', 'Chandler', 'Mesa', 'Scottsdale', 'Tucson', 'Gilbert', 'Glendale'],
  AR: ['Little Rock', 'Fayetteville', 'Bentonville', 'Pine Bluff', 'Conway', 'Jonesboro'],
  CA: ['Los Angeles', 'San Diego', 'Santa Ana', 'Bakersfield', 'Fresno', 'Sacramento', 'Oakland', 'Corona', 'Mission Viejo', 'Long Beach', 'San Jose'],
  CO: ['Denver', 'Colorado Springs', 'Aurora', 'Pueblo', 'Highlands Ranch', 'Fort Collins'],
  CT: ['Hartford', 'New Haven', 'Bridgeport', 'Stamford', 'Waterbury'],
  DC: ['Washington'],
  DE: ['Wilmington', 'Dover', 'Newark', 'Middletown'],
  FL: ['Miami', 'Tampa', 'Jacksonville', 'Orlando', 'Fort Lauderdale', 'Bradenton', 'Tallahassee', 'Pensacola', 'Belle Glade', 'Lakeland', 'Gainesville', 'Fort Myers'],
  GA: ['Atlanta', 'Savannah', 'Macon', 'Columbus', 'Valdosta', 'Buford', 'Marietta', 'Augusta', 'Athens', 'Warner Robins'],
  HI: ['Honolulu', 'Kahuku', 'Hilo', 'Mililani'],
  ID: ['Boise', 'Meridian', 'Nampa', 'Idaho Falls', 'Coeur d\'Alene'],
  IL: ['Chicago', 'Naperville', 'Joliet', 'Peoria', 'Rockford', 'Springfield', 'Champaign'],
  IN: ['Indianapolis', 'Fort Wayne', 'Carmel', 'Evansville', 'South Bend', 'Fishers'],
  IA: ['Des Moines', 'Cedar Rapids', 'Iowa City', 'Davenport', 'Sioux City', 'Ankeny'],
  KS: ['Wichita', 'Overland Park', 'Olathe', 'Topeka', 'Lawrence', 'Manhattan'],
  KY: ['Louisville', 'Lexington', 'Bowling Green', 'Covington', 'Owensboro'],
  LA: ['New Orleans', 'Baton Rouge', 'Shreveport', 'Lafayette', 'Monroe', 'Lake Charles', 'Destrehan'],
  ME: ['Portland', 'Bangor', 'Lewiston'],
  MD: ['Baltimore', 'Silver Spring', 'Upper Marlboro', 'Olney', 'Annapolis', 'Frederick'],
  MA: ['Boston', 'Worcester', 'Springfield', 'Brockton', 'Lowell'],
  MI: ['Detroit', 'Grand Rapids', 'Ann Arbor', 'Lansing', 'Southfield', 'Flint', 'Kalamazoo'],
  MN: ['Minneapolis', 'St. Paul', 'Eden Prairie', 'Rochester', 'Duluth'],
  MS: ['Jackson', 'Gulfport', 'Hattiesburg', 'Starkville', 'Tupelo', 'Meridian', 'Biloxi'],
  MO: ['St. Louis', 'Kansas City', 'Springfield', 'Columbia', 'Independence'],
  MT: ['Billings', 'Missoula', 'Great Falls', 'Bozeman'],
  NE: ['Omaha', 'Lincoln', 'Grand Island', 'Kearney'],
  NV: ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas'],
  NH: ['Manchester', 'Nashua', 'Concord'],
  NJ: ['Newark', 'Paterson', 'Camden', 'Trenton', 'Bergen', 'Jersey City', 'Toms River'],
  NM: ['Albuquerque', 'Las Cruces', 'Rio Rancho', 'Roswell'],
  NY: ['New York', 'Buffalo', 'Rochester', 'Syracuse', 'Albany', 'Long Island'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Durham', 'Fayetteville', 'Winston-Salem', 'Wilmington'],
  ND: ['Fargo', 'Bismarck', 'Grand Forks', 'Minot'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton', 'Canton', 'Youngstown', 'Massillon'],
  OK: ['Oklahoma City', 'Tulsa', 'Norman', 'Lawton', 'Broken Arrow', 'Edmond'],
  OR: ['Portland', 'Eugene', 'Salem', 'Bend', 'Beaverton'],
  PA: ['Philadelphia', 'Pittsburgh', 'Harrisburg', 'Allentown', 'Erie', 'Scranton', 'Aliquippa'],
  RI: ['Providence', 'Warwick', 'Cranston'],
  SC: ['Columbia', 'Charleston', 'Greenville', 'Spartanburg', 'Rock Hill', 'Florence'],
  SD: ['Sioux Falls', 'Rapid City', 'Aberdeen'],
  TN: ['Memphis', 'Nashville', 'Knoxville', 'Chattanooga', 'Murfreesboro', 'Clarksville'],
  TX: ['Houston', 'Dallas', 'San Antonio', 'Austin', 'Fort Worth', 'Arlington', 'Katy', 'Allen', 'Duncanville', 'El Paso', 'Lubbock', 'Beaumont', 'Tyler', 'Waco', 'Denton', 'Southlake'],
  UT: ['Salt Lake City', 'Provo', 'Ogden', 'St. George', 'Logan', 'Draper'],
  VT: ['Burlington', 'Rutland'],
  VA: ['Virginia Beach', 'Richmond', 'Norfolk', 'Chesapeake', 'Alexandria', 'Roanoke', 'Hampton'],
  WA: ['Seattle', 'Tacoma', 'Spokane', 'Kent', 'Bellevue', 'Vancouver'],
  WV: ['Charleston', 'Huntington', 'Morgantown', 'Parkersburg'],
  WI: ['Milwaukee', 'Madison', 'Green Bay', 'Kenosha', 'Racine'],
  WY: ['Cheyenne', 'Casper', 'Laramie', 'Gillette'],
};
