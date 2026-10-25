/**
 * The season calendar, in weeks. Week 0 is the preseason poll; the regular season is weeks 1..`regularWeeks`,
 * with `games` games per team (the rest are byes). Postseason weeks follow the championship week:
 * bowls and the first playoff round, then one week per playoff round.
 */
export const CALENDAR = {
  year: 2026,
  regularWeeks: 14,
  games: 12,
  /** Non-conference games are preferably scheduled in weeks 1..this. */
  nonConfWeeks: 4,
  rivalryWeek: 14,
  champWeek: 15,
  /** The committee's first CFP rankings come out after this week. */
  cfpStartWeek: 9,
  /** Weekly Heisman watch in the news from this week. */
  heismanWatchWeek: 5,
};
