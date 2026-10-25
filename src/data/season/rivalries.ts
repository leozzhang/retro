/** An annual game the schedule always includes. `rivalryWeek` games are played the last regular-season week. */
export interface Rivalry {
  a: string;
  b: string;
  name: string;
  rivalryWeek?: boolean;
}

/** A starter list; team ids are from `data/fbs/profiles.ts`. No team may have two rivalry-week games. */
export const RIVALRIES: Rivalry[] = [
  { a: 'alabama', b: 'auburn', name: 'Iron Bowl', rivalryWeek: true },
  { a: 'ohiostate', b: 'michigan', name: 'The Game', rivalryWeek: true },
  { a: 'olemiss', b: 'mississippistate', name: 'Egg Bowl', rivalryWeek: true },
  { a: 'texas', b: 'texasam', name: 'Lone Star Showdown', rivalryWeek: true },
  { a: 'georgia', b: 'georgiatech', name: 'Clean, Old-Fashioned Hate', rivalryWeek: true },
  { a: 'clemson', b: 'southcarolina', name: 'Palmetto Bowl', rivalryWeek: true },
  { a: 'florida', b: 'floridastate', name: 'Sunshine Showdown', rivalryWeek: true },
  { a: 'kentucky', b: 'louisville', name: "Governor's Cup", rivalryWeek: true },
  { a: 'arizona', b: 'arizonastate', name: 'Territorial Cup', rivalryWeek: true },
  { a: 'virginia', b: 'virginiatech', name: 'Commonwealth Cup', rivalryWeek: true },
  { a: 'wisconsin', b: 'minnesota', name: "Paul Bunyan's Axe", rivalryWeek: true },
  { a: 'indiana', b: 'purdue', name: 'Old Oaken Bucket', rivalryWeek: true },
  { a: 'iowa', b: 'nebraska', name: 'Heroes Game', rivalryWeek: true },
  { a: 'ucla', b: 'usc', name: 'Crosstown Showdown', rivalryWeek: true },
  { a: 'northcarolina', b: 'ncstate', name: 'Tobacco Road', rivalryWeek: true },
  { a: 'army', b: 'navy', name: 'Army-Navy', rivalryWeek: true },
  { a: 'texas', b: 'oklahoma', name: 'Red River Rivalry' },
  { a: 'georgia', b: 'florida', name: 'Cocktail Party' },
  { a: 'alabama', b: 'tennessee', name: 'Third Saturday in October' },
  { a: 'michigan', b: 'michiganstate', name: 'Paul Bunyan Trophy' },
  { a: 'usc', b: 'notredame', name: 'Jeweled Shillelagh' },
  { a: 'notredame', b: 'navy', name: 'Notre Dame-Navy' },
  { a: 'byu', b: 'utah', name: 'Holy War' },
  { a: 'oregon', b: 'oregonstate', name: 'Platypus Trophy' },
  { a: 'washington', b: 'washingtonstate', name: 'Apple Cup' },
  { a: 'pittsburgh', b: 'westvirginia', name: 'Backyard Brawl' },
  { a: 'california', b: 'stanford', name: 'Big Game' },
  { a: 'duke', b: 'northcarolina', name: 'Victory Bell' },
];
