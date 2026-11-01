import { pickDefCall, type DefCall } from '../data/defenses';
import { defIdentity, situationMix } from '../data/identity';
import { FORMATIONS, PLAY_TABS, playsOfKind, type Formation, type PlayDef } from '../data/plays';
import { KICKOFF_CALLS, kickDef, ST_TAB, type KickDef } from '../data/specialTeams';
import { clutchRoster, confLabel, lateAndClose, leverage } from '../data/confidence';
import { buildSquad, onField, reorderPosition, teamConf, teamRatings, type Squad } from '../data/depth';
import { POSITIONS } from '../data/positions';
import { CONFERENCES } from '../data/fbs/profile';
import { teamById, TEAMS, type RosterPlayer, type Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL, VIEW_W } from '../engine/constants';
import type { Input } from '../engine/input';
import type { Vec3 } from '../engine/math';
import { drawField, makeCrowd } from '../render/field';
import { drawBanner, drawClutch, drawHint, drawPlayClock, drawScorebug, drawTempo } from '../render/hud';
import { drawKickPlay, drawWind } from '../render/kickRenderer';
import { drawLines, drawPlay } from '../render/renderer';
import { drawRoster, rosterPages } from '../render/rosterScreen';
import {
  BOOK_PAGE, BOOK_TABS, bookCardAt, bookCardRect, bookPages, bookPlays, bookTabAt, drawPlaybook, STAR_BTN, starRect, type BookView,
} from '../render/playbookScreen';
import { drawMiniPlay, drawStar } from '../render/playDiagram';
import { BOOK_BTN, drawSeason, PREP_BTN, RECRUIT_BTN, SEASON_TABS, STATS_BTN, TEAM_BTN, type SeasonView } from '../render/seasonScreen';
import {
  drawRecruit, FILTER_BTN, GROUP_CHIPS, groupChipRect, newRecruitView, RECRUIT_ACTIONS, RECRUIT_ADVANCE, RECRUIT_ROWS, RECRUIT_TABS, recruitActionRect,
  recruitRowRect, recruitRows, recruitTabAt, SEARCH_FILTERS, type RecruitView,
} from '../render/recruitScreen';
import { addToBoard, dropFromBoard, inHome, staffFill, toggleOffer, toggleTop, toggleVisit } from '../season/recruiting';
import { careerList, careerRowAt, careerTabAt, drawCareer, modeAt, newCareerView, type CareerView } from '../render/careerScreen';
import { drawPrep, maxScroll, PREP_TABS, prepCardRect, prepTabAt, STAFF_ROLES, staffOptionRect, staffRowRect, type PrepView } from '../render/prepScreen';
import { groupEmphases, STANDARD } from '../data/emphasis';
import { GROUPS, type Group } from '../data/coaches';
import { scoutReport } from '../season/scouting';
import { DEPTH_BTN, depthView, drawTeam, dropIndex, fullMove, inBox, rowAt, tabAt, type TeamView } from '../render/teamScreen';
import { hasSavedSeason, loadSeason, saveSeason } from '../season/save';
import { advanceWeek, defaultConfig, newSeason, seasonOver, userGameThisWeek } from '../season/season';
import type { InjuryLevel, SeasonConfig } from '../season/types';
import { advanceOffseason, startOffseason } from '../season/offseason';
import { actOnLeaving, offer, pursue, setTarget, withdraw } from '../season/portal';
import { fireAssistant, interview, offerChair, withdrawOffer } from '../season/carousel';
import {
  CAROUSEL_ADVANCE, CAROUSEL_ROWS, CAROUSEL_TABS, carouselActionRect, carouselRowRect, carouselTabAt, chairChipRect, drawCarousel, hiringRows,
  leagueRows, newCarouselView, openChairs, staffRows, type CarouselView,
} from '../render/carouselScreen';
import {
  actionRect, ADVANCE_BTN, BOARD_ROWS, boardRows, chipRect, drawPortal, LEAVING_ROWS, leavingRows, newPortalView, PORTAL_TABS, portalTabAt, POS_CHIPS,
  rowRect, type PortalView,
} from '../render/portalScreen';
import {
  departureRowCount, DEPARTURE_ROWS, DEPARTURE_TABS, DEPARTURES_ADVANCE, departuresRowRect, departuresTabAt, drawDepartures, MEET_BTN,
  newDeparturesView, watchRows, type DeparturesView,
} from '../render/departuresScreen';
import { meetOnWatch } from '../season/departures';
import { autoGamePlan, setUserDepth, useStaffDepth } from '../season/staff';
import { driveMods, emphasisMods, type TeamMods } from '../season/emphasis';
import { loadStarred, toggleStar } from './starred';
import { squadFor, staffFor } from '../season/world';
import { driveLog } from '../season/simGame';
import type { DriveLog, GameResult, SeasonGame, SeasonState } from '../season/types';
import { CALM, fgDistance, predictKick, type Wind } from '../sim/kicking';
import { getSprite, teamUniform } from '../render/sprites';
import { text, textWidth } from '../render/text';
import {
  adminStop, advanceSim, afterPlay, clockText, inTwoMinute, mmss, newClock, nextQuarter, penaltySpot, playClockText,
  QUARTER_DRIVES, QUARTER_LABELS, QUARTER_OPTIONS, quarterName, readyForPlay, runoffAtSnap, snapClock, tickBetween, tickLive,
  timeLeftInHalf, type Clock, type Tempo,
} from './clock';
import { KickPlay } from './kickPlay';
import { Play } from './playState';
import { personnelOf } from './resolvePlay';
import {
  applyKick, applyOutcome, applyTry, downDistance, fieldLabel, simulateDrive, startDrive, userStartAfter,
  type Applied, type Drive, type KickOutcome, type PlayOutcome, type SimPlay,
} from './rules';
import { newWind, nextQuarterWind, windLabel } from './wind';

type Screen = 'title' | 'roster' | 'season' | 'team' | 'career' | 'playbook' | 'prep' | 'portal' | 'carousel' | 'departures' | 'recruit' | 'call' | 'play' | 'kick' | 'notice' | 'final';

/**
 * What the call screen offers: the full playbook, the choice after a touchdown,
 * the playbook for a two-point try, or kickoff calls.
 */
type CallMode = 'normal' | 'pat' | 'try' | 'kickoff';

type Card = { kind: 'play'; def: PlayDef } | { kind: 'kick'; def: KickDef } | { kind: 'twoPt' };

/** NCAA kickoffs are from the kicking team's 35. */
const KICKOFF_LINE = OWN_GOAL + 35;
/** Field goal attempts longer than this get flagged on the card. */
const FG_RANGE_HINT = 55;
/** Injury settings for a new season, as I cycles them. */
const INJURY_OPTIONS: InjuryLevel[] = ['normal', 'light', 'off'];
const LENGTH_OPTIONS: SeasonConfig['length'][] = ['single', 'open'];
const LENGTH_LABEL: Record<SeasonConfig['length'], string> = { single: 'ONE SEASON', open: 'DYNASTY' };

interface Notice {
  title: string;
  sub: string;
  extra: string;
  color?: string;
  /** Scorebug state when the notice was queued (later notices may already have advanced the clock and score). */
  clock?: string;
  score?: { user: number; cpu: number };
}

/** Slow-motion while the QB is aiming. 1 = off. */
const AIM_TIME_SCALE = 0.65;

// Call screen layout: tip, playbook tabs, formation chips, then a 3x3 grid of cards.
const CALL_Y = 92;
const CARD_W = 196;
const CARD_H = 62;
const CARD_GAP = 8;
const CARD_ROW_GAP = 5;
const CARD_X0 = (VIEW_W - (3 * CARD_W + 2 * CARD_GAP)) / 2;
const CARD_Y0 = 144;
/** Cards on one page of the call screen. */
const PAGE = 9;
const TAB_W = 120;
const TAB_H = 14;
const TAB_Y = 110;
const CHIP_Y = 128;
const CHIP_H = 11;

function cardRect(i: number) {
  return { x: CARD_X0 + (i % 3) * (CARD_W + CARD_GAP), y: CARD_Y0 + Math.floor(i / 3) * (CARD_H + CARD_ROW_GAP), w: CARD_W, h: CARD_H };
}

/** Filter chips for one playbook tab: the user's starred plays, then each formation the tab uses (in `FORMATIONS` order). */
type Chip = Formation | 'starred';

function chipsFor(plays: PlayDef[]): Chip[] {
  return ['starred', ...FORMATIONS.filter((f) => plays.some((p) => p.formation === f))];
}

const chipLabel = (f: Chip) => (f === 'starred' ? 'STARRED' : f.name.toUpperCase());
/** Room for the star icon in front of the STARRED label. */
const STAR_ICON_W = 10;

function tabRect(i: number, n: number) {
  const x0 = (VIEW_W - (n * TAB_W + (n - 1) * 4)) / 2;
  return { x: x0 + i * (TAB_W + 4), y: TAB_Y, w: TAB_W, h: TAB_H };
}

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export class Game {
  private screen: Screen = 'title';
  private userIdx = Math.max(0, TEAMS.findIndex((t) => t.id === 'georgia'));
  private cpuIdx = Math.max(0, TEAMS.findIndex((t) => t.id === 'alabama'));
  /** Roster screen: whose roster and which page. */
  private rosterIdx = 0;
  private rosterPage = 0;
  private qIdx = QUARTER_OPTIONS.indexOf(6);
  /** The injury setting a new season starts with (I on the title screen). */
  private injuryIdx = INJURY_OPTIONS.indexOf('normal');
  private lengthIdx = 0;
  private user!: Team;
  private cpu!: Team;
  /** The two squads in this game: the season's (injuries, the user's depth chart) in a season game. */
  private userSquad!: Squad;
  private cpuSquad!: Squad;
  private userRoster!: Record<string, RosterPlayer>;
  private cpuRoster!: Record<string, RosterPlayer>;
  /** The current snap's leverage (data/confidence.ts), logged with it for the grades. */
  private snapLev = 0;
  private crowd: HTMLCanvasElement | null = null;
  private cam = new Camera();
  private rng = Math.random;
  private score = { user: 0, cpu: 0 };
  private clock: Clock = newClock(6);
  /** Huddle (the accelerated clock runs to :14 at the snap) or hurry-up (:28). H on the call screen. */
  private tempo: Tempo = 'normal';
  /** The quarter the hurry-up last switched itself on in, so the user can switch it back off. */
  private autoHurryQ = 0;
  private drive: Drive = startDrive(25);
  private play: Play | null = null;
  private kick: KickPlay | null = null;
  private callMode: CallMode = 'normal';
  private wind: Wind = CALM;
  private windQuarter = 1;
  /** Side-profile flight sketches for the kick cards, by kick id. */
  private kickSketch = new Map<string, Vec3[]>();
  private defCall: DefCall | null = null;
  private press: Record<string, boolean> = {};
  private applied: Applied | null = null;
  private notices: Notice[] = [];
  /** Where the game goes once the notice queue is empty. */
  private afterNotices: 'call' | 'final' | 'kickoff' | 'pat' = 'call';
  private tab = 0;
  /** Formation chip picked on each playbook tab (index into `chipsFor`), and the page within it. */
  private chip: Record<number, number> = {};
  private page = 0;
  private hover = -1;
  /** The user mirrored the next play (F on the play-call screen). */
  private flipCall = false;
  /** The season in progress (the hub screen), and the season game being played on the field. */
  private season: SeasonState | null = null;
  private seasonGame: SeasonGame | null = null;
  /** A season game's drives for the progression grades: the user's snaps and kicks first, then each CPU drive. */
  private liveDrives: DriveLog[] | null = null;
  /** A season game's weekly emphases for the user's team: the user's defense plays them in the CPU's simulated drives. */
  private userEmph: TeamMods | undefined;
  private seasonView: SeasonView = { tab: 0, sub: 0 };
  private teamView: TeamView = { pos: 0, sel: 0, drag: null, mx: 0, my: 0 };
  private careerView: CareerView = { pos: 0, sel: 0, mode: 0, scroll: 0, back: 'season', mx: 0, my: 0 };
  private bookView: BookView = { tab: 1, page: 0, open: null, flip: false, mx: 0, my: 0 };
  private prepView: PrepView = { tab: 0, scroll: 0, page: 0, sel: 0, mx: 0, my: 0, report: null };
  private portalView: PortalView = { tab: 0, chip: 0, sel: 0, top: 0, mx: 0, my: 0, note: '' };
  private carouselView: CarouselView = newCarouselView();
  private departuresView: DeparturesView = { tab: 0, sel: 0, top: 0, mx: 0, my: 0, note: '' };
  private recruitView: RecruitView = { tab: 0, chip: 0, filter: 1, sel: 0, top: 0, mx: 0, my: 0, note: '' };
  /** Starred play ids: the playbook page sets them, the call screen's STARRED chip shows them. */
  private starred = loadStarred();
  /** Mouse on the call screen, for the cards' star hover. */
  private callMouse = { x: 0, y: 0 };
  /** A season is saved in this browser (checked once; parsing it every frame would be slow). */
  private savedSeason = hasSavedSeason();
  private debug = false;
  private titleTime = 0;
  private t = 0;

  timeScale(): number {
    if (this.screen === 'play' && this.play?.aim) return AIM_TIME_SCALE;
    if (this.screen === 'kick' && this.kick?.aim && this.kick.unit === 'punt') return AIM_TIME_SCALE;
    return 1;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    if (input.hit('F1', 'Backquote')) this.debug = !this.debug;
    switch (this.screen) {
      case 'title':
        this.updateTitle(dt, input);
        break;
      case 'roster':
        this.updateRoster(input);
        break;
      case 'season':
        this.updateSeason(input);
        break;
      case 'team':
        this.updateTeam(input);
        break;
      case 'career':
        this.updateCareer(input);
        break;
      case 'playbook':
        this.updateBook(input);
        break;
      case 'prep':
        this.updatePrep(input);
        break;
      case 'portal':
        this.updatePortal(input);
        break;
      case 'carousel':
        this.updateCarousel(input);
        break;
      case 'departures':
        this.updateDepartures(input);
        break;
      case 'recruit':
        this.updateRecruit(input);
        break;
      case 'call':
        this.updateCall(dt, input);
        break;
      case 'play':
        this.updatePlay(dt, input);
        break;
      case 'kick':
        this.updateKick(dt, input);
        break;
      case 'notice':
        if (input.hit('Space', 'Enter') || input.mouse.pressed) this.nextNotice();
        break;
      case 'final':
        if (input.hit('Space', 'Enter') || input.mouse.pressed) {
          if (this.seasonGame) {
            this.finishSeasonGame();
          } else {
            this.screen = 'title';
            this.titleTime = 0;
          }
        }
        break;
    }
    if (this.screen !== 'title' && this.clock.quarter !== this.windQuarter) {
      this.windQuarter = this.clock.quarter;
      this.wind = nextQuarterWind(this.wind, this.rng);
    }
    this.cam.update(dt);
  }

  // ------------------------------------------------------------ title

  private updateTitle(dt: number, input: Input): void {
    this.titleTime += dt;
    const nq = QUARTER_OPTIONS.length;
    if (input.hit('KeyA')) this.userIdx = this.stepTeam(this.userIdx, -1, this.cpuIdx);
    if (input.hit('KeyD')) this.userIdx = this.stepTeam(this.userIdx, 1, this.cpuIdx);
    if (input.hit('KeyW')) this.userIdx = this.stepConference(this.userIdx, -1, this.cpuIdx);
    if (input.hit('KeyS')) this.userIdx = this.stepConference(this.userIdx, 1, this.cpuIdx);
    if (input.hit('ArrowLeft')) this.cpuIdx = this.stepTeam(this.cpuIdx, -1, this.userIdx);
    if (input.hit('ArrowRight')) this.cpuIdx = this.stepTeam(this.cpuIdx, 1, this.userIdx);
    if (input.hit('ArrowUp')) this.cpuIdx = this.stepConference(this.cpuIdx, -1, this.userIdx);
    if (input.hit('ArrowDown')) this.cpuIdx = this.stepConference(this.cpuIdx, 1, this.userIdx);
    if (input.hit('KeyQ')) this.qIdx = (this.qIdx + nq - 1) % nq;
    if (input.hit('KeyE')) this.qIdx = (this.qIdx + 1) % nq;
    if (input.hit('KeyI')) this.injuryIdx = (this.injuryIdx + 1) % INJURY_OPTIONS.length;
    if (input.hit('KeyL')) this.lengthIdx = (this.lengthIdx + 1) % LENGTH_OPTIONS.length;
    if (input.hit('KeyN')) {
      const config = { ...defaultConfig(TEAMS[this.userIdx].id), injuries: INJURY_OPTIONS[this.injuryIdx], length: LENGTH_OPTIONS[this.lengthIdx] };
      this.season = newSeason(config, (Math.random() * 2 ** 31) >>> 0);
      saveSeason(this.season);
      this.toSeason();
      return;
    }
    if (input.hit('KeyC')) {
      this.season ??= loadSeason();
      if (this.season) {
        this.toSeason();
        return;
      }
    }
    const userRoster = input.hit('KeyR');
    if (userRoster || input.hit('KeyT')) {
      this.rosterIdx = userRoster ? this.userIdx : this.cpuIdx;
      this.rosterPage = 0;
      this.screen = 'roster';
      return;
    }
    if (input.mouse.pressed) {
      const { x, y } = input.mouse;
      const user = x < VIEW_W / 2;
      const d = x < (user ? 160 : 480) ? -1 : 1;
      if (y > 150 && y < 222) {
        if (user) this.userIdx = this.stepTeam(this.userIdx, d, this.cpuIdx);
        else this.cpuIdx = this.stepTeam(this.cpuIdx, d, this.userIdx);
      } else if (y >= 222 && y < 238) {
        if (user) this.userIdx = this.stepConference(this.userIdx, d, this.cpuIdx);
        else this.cpuIdx = this.stepConference(this.cpuIdx, d, this.userIdx);
      } else if (y >= 268 && y < 290) {
        this.qIdx = (this.qIdx + (x < VIEW_W / 2 ? nq - 1 : 1)) % nq;
      } else if (y >= 290) {
        this.startGame();
        return;
      }
    }
    if (input.hit('Enter', 'Space')) this.startGame();
    this.cam.follow(32, 0.5);
  }

  /** Next or previous team in the same conference, skipping `other` (the team on the other side). */
  private stepTeam(i: number, d: number, other: number): number {
    const conf = TEAMS[i].conference;
    const list = TEAMS.map((_, j) => j).filter((j) => TEAMS[j].conference === conf && (j === i || j !== other));
    const at = list.indexOf(i);
    return list[(at + d + list.length) % list.length];
  }

  /** First team of the next or previous conference, skipping `other`. */
  private stepConference(i: number, d: number, other: number): number {
    const n = CONFERENCES.length;
    let c = CONFERENCES.indexOf(TEAMS[i].conference);
    for (let k = 0; k < n; k++) {
      c = (c + d + n) % n;
      const j = TEAMS.findIndex((t, jj) => t.conference === CONFERENCES[c] && jj !== other);
      if (j >= 0) return j;
    }
    return i;
  }

  private updateRoster(input: Input): void {
    const n = rosterPages(buildSquad(TEAMS[this.rosterIdx]));
    if (input.hit('KeyA', 'ArrowLeft')) this.rosterPage = (this.rosterPage + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight') || input.mouse.pressed) this.rosterPage = (this.rosterPage + 1) % n;
    if (input.hit('Escape', 'Enter', 'Backspace')) {
      this.screen = 'title';
      this.titleTime = 0;
    }
  }

  private startGame(user: Team = TEAMS[this.userIdx], cpu: Team = TEAMS[this.cpuIdx], squads?: { user: Squad; cpu: Squad }): void {
    this.user = user;
    this.cpu = cpu;
    this.userSquad = squads?.user ?? buildSquad(user);
    this.cpuSquad = squads?.cpu ?? buildSquad(cpu);
    this.userRoster = onField(this.userSquad);
    this.cpuRoster = onField(this.cpuSquad);
    this.crowd = makeCrowd(this.user, this.cpu);
    this.score = { user: 0, cpu: 0 };
    this.clock = newClock(QUARTER_OPTIONS[this.qIdx]);
    this.tempo = 'normal';
    this.autoHurryQ = 0;
    this.drive = startDrive(25);
    this.wind = newWind(this.rng);
    this.windQuarter = 1;
    this.kickSketch.clear();
    this.tab = 0;
    this.liveDrives = this.seasonGame ? [{ off: user.id, plays: [] }] : null;
    const s = this.season;
    this.userEmph = this.seasonGame && s ? emphasisMods(staffFor(s, user.id), s.teamState[user.id]?.emph) : undefined;
    this.toCall();
  }

  // ------------------------------------------------------------ season hub

  private toSeason(): void {
    this.screen = 'season';
    this.seasonView = { tab: 0, sub: 0 };
  }

  private updateSeason(input: Input): void {
    const s = this.season!;
    const v = this.seasonView;
    const n = SEASON_TABS.length;
    if (input.hit('KeyA', 'ArrowLeft')) this.seasonView = { tab: (v.tab + n - 1) % n, sub: 0 };
    if (input.hit('KeyD', 'ArrowRight')) this.seasonView = { tab: (v.tab + 1) % n, sub: 0 };
    if (input.hit('KeyW', 'ArrowUp')) v.sub--;
    if (input.hit('KeyS', 'ArrowDown')) v.sub++;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'title';
      this.titleTime = 0;
      return;
    }
    if (input.hit('KeyT') || (input.mouse.pressed && inBox(TEAM_BTN, input.mouse.x, input.mouse.y))) {
      this.toTeam();
      return;
    }
    if (input.hit('KeyP') || (input.mouse.pressed && inBox(BOOK_BTN, input.mouse.x, input.mouse.y))) {
      this.toBook();
      return;
    }
    if (input.hit('KeyH') || (input.mouse.pressed && inBox(STATS_BTN, input.mouse.x, input.mouse.y))) {
      this.toCareer('season');
      return;
    }
    if (s.recruiting && (input.hit('KeyR') || (input.mouse.pressed && inBox(RECRUIT_BTN, input.mouse.x, input.mouse.y)))) {
      this.toRecruit();
      return;
    }
    // In the offseason the PREP button is the stage's: the carousel, then the portal.
    const prepBtn = input.mouse.pressed && inBox(PREP_BTN, input.mouse.x, input.mouse.y);
    if (s.phase === 'offseason') {
      if (input.hit('KeyO', 'Space', 'Enter') || prepBtn) this.toOffseason();
      return;
    }
    if (input.hit('KeyO') || prepBtn) {
      this.toPrep();
      return;
    }
    const sim = input.hit('KeyX');
    if (!input.hit('Space', 'Enter') && !sim) return;
    if (seasonOver(s)) {
      // An open-ended season goes into its offseason, starting with the coaching carousel.
      if (s.config.length !== 'open') return;
      startOffseason(s);
      saveSeason(s);
      this.toOffseason();
      return;
    }
    const game = userGameThisWeek(s);
    if (game && !sim) {
      // Play it on the field; the final screen writes the result back.
      const u = s.config.userTeamId;
      const opp = game.home === u ? game.away : game.home;
      this.seasonGame = game;
      this.startGame(teamById(u), teamById(opp), { user: squadFor(s, u), cpu: squadFor(s, opp) });
      return;
    }
    advanceWeek(s);
    saveSeason(s);
  }

  // ------------------------------------------------------------ team page

  private toTeam(): void {
    this.screen = 'team';
    this.teamView = { pos: 0, sel: 0, drag: null, mx: 0, my: 0 };
  }

  private setTeamPos(i: number): void {
    Object.assign(this.teamView, { pos: i, sel: 0, drag: null });
  }

  /** G or the header toggle: take the depth chart from the staff (starting from theirs), or hand it back. */
  private toggleStaffDepth(): void {
    const s = this.season!;
    if (s.config.delegate.depthChart) setUserDepth(s, { ...squadFor(s, s.config.userTeamId).depth });
    else useStaffDepth(s);
    saveSeason(s);
  }

  /** Depth chart and player cards: click a tab for its card, drag it to a new spot to reorder. */
  private updateTeam(input: Input): void {
    const s = this.season!;
    const v = this.teamView;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace', 'KeyT')) {
      this.screen = 'season';
      return;
    }
    const n = POSITIONS.length;
    if (input.hit('KeyA', 'ArrowLeft')) this.setTeamPos((v.pos + n - 1) % n);
    if (input.hit('KeyD', 'ArrowRight')) this.setTeamPos((v.pos + 1) % n);
    if (input.hit('KeyG')) this.toggleStaffDepth();
    const squad = squadFor(s, s.config.userTeamId);
    const pos = POSITIONS[v.pos];
    const view = depthView(squad, pos);
    if (input.hit('KeyC') && view.rows.length) {
      this.toCareer('team', view.rows[Math.min(v.sel, view.rows.length - 1)].id);
      return;
    }
    const rows = view.rows.length;
    if (input.hit('KeyW', 'ArrowUp')) v.sel = (v.sel + rows - 1) % rows;
    if (input.hit('KeyS', 'ArrowDown')) v.sel = (v.sel + 1) % rows;
    if (input.mouse.pressed) {
      const tab = tabAt(x, y);
      const row = rowAt(x, y, view);
      if (tab >= 0) this.setTeamPos(tab);
      else if (inBox(DEPTH_BTN, x, y)) this.toggleStaffDepth();
      else if (row >= 0) v.drag = { from: row, y0: y, moved: false };
    }
    if (!v.drag) return;
    if (input.mouse.down) {
      // The injured can be selected but not dragged: they're off the depth chart until they heal.
      if (Math.abs(y - v.drag.y0) > 4 && v.drag.from < view.avail) v.drag.moved = true;
      return;
    }
    // Released: a click selects; a drag drops the tab into its new spot.
    const d = v.drag;
    v.drag = null;
    if (!d.moved) {
      v.sel = d.from;
      return;
    }
    const to = dropIndex(y, d.from, view.avail);
    v.sel = to;
    if (to === d.from) return;
    const [from, at] = fullMove(view, d.from, to);
    setUserDepth(s, reorderPosition(squad, pos, from, at));
    saveSeason(s);
  }

  // ------------------------------------------------------------ stats page

  /** The STATS page, on a player if one is given; Esc goes back to `back`. */
  private toCareer(back: CareerView['back'], id?: string): void {
    const s = this.season!;
    this.screen = 'career';
    this.careerView = newCareerView(squadFor(s, s.config.userTeamId), back, id);
  }

  /** Careers: position tabs and rows pick a player; G or the toggles switch SEASONS and GROWTH; the wheel scrolls his story. */
  private updateCareer(input: Input): void {
    const s = this.season!;
    const v = this.careerView;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace', 'KeyH')) {
      this.screen = v.back;
      return;
    }
    const setPos = (i: number) => Object.assign(v, { pos: i, sel: 0, scroll: 0 });
    const n = POSITIONS.length;
    if (input.hit('KeyA', 'ArrowLeft')) setPos((v.pos + n - 1) % n);
    if (input.hit('KeyD', 'ArrowRight')) setPos((v.pos + 1) % n);
    const rows = Math.max(1, careerList(squadFor(s, s.config.userTeamId), POSITIONS[v.pos]).length);
    const pick = (i: number) => Object.assign(v, { sel: i, scroll: 0 });
    if (input.hit('KeyW', 'ArrowUp')) pick((v.sel + rows - 1) % rows);
    if (input.hit('KeyS', 'ArrowDown')) pick((v.sel + 1) % rows);
    if (input.hit('KeyG')) v.mode = 1 - v.mode;
    // Clamped to the story's length when it's drawn.
    if (input.mouse.wheel) v.scroll = Math.max(0, v.scroll + input.mouse.wheel);
    if (!input.mouse.pressed) return;
    const tab = careerTabAt(x, y);
    const row = careerRowAt(x, y, rows);
    const mode = modeAt(x, y);
    if (tab >= 0) setPos(tab);
    else if (row >= 0) pick(row);
    else if (mode >= 0) v.mode = mode;
  }

  // ------------------------------------------------------------ playbook page

  private toBook(): void {
    this.screen = 'playbook';
    this.bookView = { tab: this.starred.size ? 0 : 1, page: 0, open: null, flip: false, mx: 0, my: 0 };
  }

  /** Play cards by tab; click one to see it drawn with your starters, click a star to save it. */
  private updateBook(input: Input): void {
    const v = this.bookView;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    const list = bookPlays(v.tab, this.starred);
    if (v.open) {
      const at = list.findIndex((p) => p.id === v.open);
      if (input.hit('Escape', 'Backspace')) {
        v.open = null;
        return;
      }
      // Unstarring a play on the STARRED tab keeps it open; A/D then steps through what's left.
      const d = (input.hit('KeyD', 'ArrowRight') ? 1 : 0) - (input.hit('KeyA', 'ArrowLeft') ? 1 : 0);
      if (d && list.length) {
        const next = at < 0 ? (d > 0 ? 0 : list.length - 1) : (at + d + list.length) % list.length;
        v.open = list[next].id;
        v.page = Math.floor(next / BOOK_PAGE);
      }
      if (input.hit('KeyF')) v.flip = !v.flip;
      if (input.hit('Space') || (input.mouse.pressed && inBox(STAR_BTN, x, y))) toggleStar(this.starred, v.open);
      return;
    }
    if (input.hit('Escape', 'Backspace', 'KeyP')) {
      this.screen = 'season';
      return;
    }
    const n = BOOK_TABS.length;
    const tabWas = v.tab;
    if (input.hit('KeyA', 'ArrowLeft')) v.tab = (v.tab + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight')) v.tab = (v.tab + 1) % n;
    if (v.tab !== tabWas) v.page = 0;
    const pages = bookPages(v.tab, this.starred);
    v.page = Math.min(v.page, pages - 1);
    if (input.hit('KeyS', 'ArrowDown') || input.mouse.wheel > 0) v.page = (v.page + 1) % pages;
    if (input.hit('KeyW', 'ArrowUp') || input.mouse.wheel < 0) v.page = (v.page + pages - 1) % pages;
    if (!input.mouse.pressed) return;
    const tab = bookTabAt(x, y);
    if (tab >= 0) {
      v.tab = tab;
      v.page = 0;
      return;
    }
    const shown = bookPlays(v.tab, this.starred).slice(v.page * BOOK_PAGE, v.page * BOOK_PAGE + BOOK_PAGE);
    const i = bookCardAt(x, y, shown.length);
    if (i < 0) return;
    if (inBox(starRect(bookCardRect(i)), x, y)) toggleStar(this.starred, shown[i].id);
    else {
      v.open = shown[i].id;
      v.flip = false;
    }
  }

  // ------------------------------------------------------------ coaching carousel

  /** The offseason's current stage. */
  private toOffseason(): void {
    const stage = this.season?.offseason?.stage;
    if (stage === 'carousel') {
      this.screen = 'carousel';
      this.carouselView = newCarouselView();
    } else if (stage === 'departures') this.toDepartures();
    else if (stage === 'signing') this.toRecruit();
    else this.toPortal();
  }

  // ------------------------------------------------------------ HS recruiting and signing day

  private toRecruit(): void {
    this.screen = 'recruit';
    this.recruitView = newRecruitView(this.season!);
  }

  /**
   * Recruiting (season/recruiting.ts): A/D tabs, Q/E position groups, W/S rows, R the SEARCH filter,
   * 1-5 (or the card's buttons) offer, host a visit, in-home, top target and add or drop; G fills the
   * board as the staff would; F hands recruiting to staff. On signing day Space runs it, then opens the
   * portal. Every change is saved.
   */
  private updateRecruit(input: Input): void {
    const s = this.season!;
    const v = this.recruitView;
    const { x, y, pressed } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'season';
      return;
    }
    const signingDay = s.phase === 'offseason' && s.offseason?.stage === 'signing';
    if (signingDay && (input.hit('Space', 'Enter') || (pressed && inBox(RECRUIT_ADVANCE, x, y)))) {
      advanceOffseason(s);
      saveSeason(s);
      this.toOffseason();
      return;
    }
    const n = RECRUIT_TABS.length;
    let tab = v.tab;
    if (input.hit('KeyA', 'ArrowLeft')) tab = (tab + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight')) tab = (tab + 1) % n;
    if (pressed && recruitTabAt(x, y) >= 0) tab = recruitTabAt(x, y);
    let chip = v.chip;
    const nc = GROUP_CHIPS.length;
    if (input.hit('KeyQ')) chip = (chip + nc - 1) % nc;
    if (input.hit('KeyE')) chip = (chip + 1) % nc;
    if (pressed) for (let i = 0; i < nc; i++) if (inBox(groupChipRect(i), x, y)) chip = i;
    let filter = v.filter;
    if (RECRUIT_TABS[tab] === 'SEARCH' && (input.hit('KeyR') || (pressed && inBox(FILTER_BTN, x, y)))) filter = (filter + 1) % SEARCH_FILTERS.length;
    if (tab !== v.tab || chip !== v.chip || filter !== v.filter) {
      Object.assign(v, { tab, chip, filter, sel: 0, top: 0, note: '' });
      return;
    }
    if (input.hit('KeyF')) {
      s.config.delegate.recruiting = !s.config.delegate.recruiting;
      v.note = s.config.delegate.recruiting ? 'YOUR STAFF RECRUITS: BOARD, OFFERS AND VISITS (F: TAKE IT BACK)' : 'YOU RECRUIT';
      saveSeason(s);
      return;
    }
    if (input.hit('KeyG') && RECRUIT_TABS[v.tab] === 'BOARD' && !s.config.delegate.recruiting) {
      const added = staffFill(s);
      v.note = added ? `STAFF ADDED ${added} TO THE BOARD` : 'THE BOARD IS FULL FOR YOUR NEEDS';
      saveSeason(s);
      return;
    }
    const rows = recruitRows(s, v);
    const shown = RECRUIT_TABS[v.tab] === 'CLASS' ? 22 : RECRUIT_ROWS;
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0) + Math.sign(input.mouse.wheel);
    if (step && rows.length) v.sel = Math.max(0, Math.min(rows.length - 1, v.sel + step));
    if (pressed) for (let i = 0; i < shown; i++) if (inBox(recruitRowRect(i), x, y) && v.top + i < rows.length) v.sel = v.top + i;
    v.sel = Math.min(v.sel, Math.max(0, rows.length - 1));
    if (v.sel < v.top) v.top = v.sel;
    if (v.sel >= v.top + shown) v.top = v.sel - shown + 1;
    const id = rows[v.sel];
    if (!id || RECRUIT_TABS[v.tab] === 'CLASS' || s.config.delegate.recruiting || (signingDay && s.offseason!.round > 0)) return;
    const keys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
    const act = RECRUIT_ACTIONS.findIndex((_, i) => input.hit(keys[i]) || (pressed && inBox(recruitActionRect(i), x, y)));
    if (act < 0) return;
    const u = s.config.userTeamId;
    switch (RECRUIT_ACTIONS[act]) {
      case 'OFFER': {
        const r = toggleOffer(s, id);
        v.note = { offered: 'OFFER MADE', withdrawn: 'OFFER WITHDRAWN', full: 'NO OFFERS LEFT: WITHDRAW ONE FIRST', no: 'CAN\'T OFFER HIM NOW' }[r];
        break;
      }
      case 'HOST VISIT': {
        const r = toggleVisit(s, id);
        v.note = { hosted: 'HE VISITS AT YOUR NEXT HOME GAME', cancelled: 'VISIT CANCELLED', full: 'THAT GAME IS FULL', used: 'HE HAS NO OFFICIAL VISITS LEFT FOR YOU', none: 'NO HOME GAMES LEFT', no: 'CAN\'T HOST HIM' }[r];
        break;
      }
      case 'IN-HOME':
        v.note = inHome(s, u, id) ? 'THE HEAD COACH SITS DOWN IN HIS LIVING ROOM' : 'IN-HOMES OPEN AFTER THE REGULAR SEASON (AND YOU HAVE A FEW)';
        break;
      case 'TOP TARGET':
        v.note = toggleTop(s, id) ? 'TOP TARGET: HIS COACH WORKS HIM FIRST' : 'NO LONGER A TOP TARGET';
        break;
      case 'BOARD':
        if ((s.recruiting!.boards[u] ?? []).includes(id)) {
          dropFromBoard(s, id);
          v.note = 'OFF THE BOARD';
        } else v.note = addToBoard(s, id) ? 'ON THE BOARD: HIS POSITION COACH WILL WORK HIM' : 'CAN\'T ADD HIM';
        break;
    }
    saveSeason(s);
  }

  // ------------------------------------------------------------ departures and the draft

  private toDepartures(): void {
    this.screen = 'departures';
    this.departuresView = newDeparturesView(this.season!);
  }

  /**
   * Departures (season/departures.ts): tabs, rows, 1 (or the button) to meet a player on the declare
   * watch, F to hand the watch to staff, Space to run the stage and then to open the portal. Every
   * change is saved.
   */
  private updateDepartures(input: Input): void {
    const s = this.season!;
    const v = this.departuresView;
    const { x, y, pressed } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'season';
      return;
    }
    const n = DEPARTURE_TABS.length;
    let tab = v.tab;
    if (input.hit('KeyA', 'ArrowLeft')) tab = (tab + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight')) tab = (tab + 1) % n;
    if (pressed && departuresTabAt(x, y) >= 0) tab = departuresTabAt(x, y);
    if (tab !== v.tab) {
      Object.assign(v, { tab, sel: 0, top: 0, note: '' });
      return;
    }
    if (input.hit('KeyF') && !s.offseason?.round) {
      s.config.delegate.departures = !s.config.delegate.departures;
      v.note = s.config.delegate.departures ? 'YOUR STAFF MEETS THEM (F: TAKE IT BACK)' : 'YOU MEET THEM';
      saveSeason(s);
      return;
    }
    if (input.hit('Space', 'Enter') || (pressed && inBox(DEPARTURES_ADVANCE, x, y))) {
      advanceOffseason(s);
      saveSeason(s);
      this.toOffseason();
      return;
    }
    const count = departureRowCount(s, v.tab);
    const watch = DEPARTURE_TABS[v.tab] === 'DECLARE WATCH';
    const shown = watch ? 14 : DEPARTURE_ROWS;
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0) + Math.sign(input.mouse.wheel);
    if (step && count) v.sel = Math.max(0, Math.min(count - 1, v.sel + step));
    if (pressed) for (let i = 0; i < shown; i++) if (inBox(departuresRowRect(i), x, y) && v.top + i < count) v.sel = v.top + i;
    if (v.sel < v.top) v.top = v.sel;
    if (v.sel >= v.top + shown) v.top = v.sel - shown + 1;
    if (!watch || s.config.delegate.departures) return;
    const id = watchRows(s)[v.sel];
    if (!id || !(input.hit('Digit1') || (pressed && inBox(MEET_BTN, x, y)))) return;
    if (!meetOnWatch(s, id)) {
      v.note = s.departures?.watch[id]?.met ? 'YOU ALREADY MET HIM' : 'NO MEETINGS LEFT';
      return;
    }
    v.note = s.departures!.watch[id].ok ? 'GOOD TALK: HE IS LEANING TOWARD COMING BACK' : 'HE HEARD YOU OUT, BUT HIS MIND IS ON THE NFL';
    saveSeason(s);
  }

  /**
   * The carousel (season/carousel.ts): tabs; on HIRING, Q/E picks the open chair, 1 offers (or
   * withdraws), 2 interviews; on MY STAFF, 1 fires; F hands hiring to staff; Space ends the round. The
   * last round's advance opens the portal. Every change is saved.
   */
  private updateCarousel(input: Input): void {
    const s = this.season!;
    const v = this.carouselView;
    const { x, y, pressed } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'season';
      return;
    }
    const n = CAROUSEL_TABS.length;
    let tab = v.tab;
    if (input.hit('KeyA', 'ArrowLeft')) tab = (tab + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight')) tab = (tab + 1) % n;
    if (pressed && carouselTabAt(x, y) >= 0) tab = carouselTabAt(x, y);
    if (tab !== v.tab) {
      Object.assign(v, { tab, sel: 0, top: 0, note: '' });
      return;
    }
    if (input.hit('KeyF')) {
      s.config.delegate.carousel = !s.config.delegate.carousel;
      v.note = s.config.delegate.carousel ? 'YOUR STAFF HIRES (F: TAKE IT BACK)' : 'YOU HIRE';
      saveSeason(s);
      return;
    }
    if (input.hit('Space', 'Enter') || (pressed && inBox(CAROUSEL_ADVANCE, x, y))) {
      advanceOffseason(s);
      saveSeason(s);
      if (s.offseason?.stage !== 'carousel') {
        this.toOffseason();
        return;
      }
      Object.assign(v, { sel: 0, top: 0, chair: Math.min(v.chair, Math.max(0, openChairs(s).length - 1)), note: `ROUND ${s.offseason.round}: SEE WHO SIGNED ON AROUND THE LEAGUE` });
      return;
    }
    const which = CAROUSEL_TABS[v.tab];
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0) + Math.sign(input.mouse.wheel);
    if (which === 'AROUND THE LEAGUE') {
      v.top = Math.max(0, Math.min(Math.max(0, leagueRows(s).length - 24), v.top + step));
      return;
    }
    const pick = (i: number) => input.hit(`Digit${i + 1}`) || (pressed && inBox(carouselActionRect(i), x, y));
    if (which === 'MY STAFF') {
      const rows = staffRows();
      if (step) v.sel = Math.max(0, Math.min(rows.length - 1, v.sel + step));
      if (pressed) for (let i = 0; i < rows.length; i++) if (inBox(carouselRowRect(i), x, y)) v.sel = i;
      if (pick(0) && !s.config.delegate.carousel) {
        v.note = fireAssistant(s, rows[v.sel]) ? 'FIRED: HIS CHAIR IS OPEN ON THE HIRING TAB' : 'HIS CHAIR IS ALREADY OPEN';
        saveSeason(s);
      }
      return;
    }
    const chairs = openChairs(s);
    let chair = v.chair;
    chair = chairs.length ? (chair + (input.hit('KeyE') ? 1 : 0) - (input.hit('KeyQ') ? 1 : 0) + chairs.length) % chairs.length : 0;
    if (pressed) chairs.forEach((_, i) => inBox(chairChipRect(i), x, y) && (chair = i));
    if (chair !== v.chair) {
      Object.assign(v, { chair, sel: 0, top: 0 });
      return;
    }
    const rows = hiringRows(s, v);
    if (step && rows.length) v.sel = Math.max(0, Math.min(rows.length - 1, v.sel + step));
    if (pressed) for (let i = 0; i < CAROUSEL_ROWS; i++) if (inBox(carouselRowRect(i), x, y) && v.top + i < rows.length) v.sel = v.top + i;
    if (v.sel < v.top) v.top = v.sel;
    if (v.sel >= v.top + CAROUSEL_ROWS) v.top = v.sel - CAROUSEL_ROWS + 1;
    const c = rows[v.sel];
    const ch = chairs[v.chair];
    if (!c || !ch || s.config.delegate.carousel) return;
    if (pick(0)) {
      if (s.carousel!.offers[ch] === c.id) {
        withdrawOffer(s, ch);
        v.note = 'OFFER WITHDRAWN';
      } else v.note = offerChair(s, ch, c.id) ? 'OFFER MADE: HE ANSWERS WHEN THE ROUND ENDS' : 'NOT NOW: HE HAS YOUR OFFER FOR ANOTHER CHAIR, OR TURNED THIS ONE DOWN';
      saveSeason(s);
    } else if (pick(1)) {
      v.note = interview(s, c.id) ? 'INTERVIEWED: HIS RATINGS ARE SHARPER' : 'NO INTERVIEWS LEFT, OR YOU KNOW ALL YOU CAN';
      saveSeason(s);
    }
  }

  // ------------------------------------------------------------ transfer portal

  private toPortal(): void {
    this.screen = 'portal';
    this.portalView = newPortalView(this.season!);
  }

  /**
   * The portal (season/portal.ts): tabs, the position chips and rows, the card's actions (number keys
   * or clicks), F to hand it to staff, and Space to advance a round. The last round's advance starts
   * next season and goes back to the hub. Every change is saved.
   */
  private updatePortal(input: Input): void {
    const s = this.season!;
    const v = this.portalView;
    const { x, y, pressed } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'season';
      return;
    }
    const n = PORTAL_TABS.length;
    let tab = v.tab;
    if (input.hit('KeyA', 'ArrowLeft')) tab = (tab + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight')) tab = (tab + 1) % n;
    if (pressed && portalTabAt(x, y) >= 0) tab = portalTabAt(x, y);
    if (tab !== v.tab) {
      Object.assign(v, { tab, sel: 0, top: 0, note: '' });
      return;
    }
    if (input.hit('KeyF')) {
      s.config.delegate.portal = !s.config.delegate.portal;
      v.note = s.config.delegate.portal ? 'YOUR STAFF RUNS THE PORTAL (F: TAKE IT BACK)' : 'YOU RUN THE PORTAL';
      saveSeason(s);
      return;
    }
    if (input.hit('Space', 'Enter') || (pressed && inBox(ADVANCE_BTN, x, y))) {
      const next = advanceOffseason(s);
      if (next !== s) {
        this.season = next;
        saveSeason(next);
        this.toSeason();
        return;
      }
      saveSeason(s);
      this.portalView = { ...newPortalView(s), tab: PORTAL_TABS[v.tab] === 'LEAVING' ? 0 : v.tab, chip: v.chip };
      return;
    }
    const which = PORTAL_TABS[v.tab];
    if (which === 'MY ROOM') return;
    if (which === 'BOARD') {
      let chip = v.chip;
      const k = POS_CHIPS.length;
      chip = (chip + (input.hit('KeyE') ? 1 : 0) - (input.hit('KeyQ') ? 1 : 0) + k) % k;
      if (pressed) POS_CHIPS.forEach((_, i) => inBox(chipRect(i), x, y) && (chip = i));
      if (chip !== v.chip) {
        Object.assign(v, { chip, sel: 0, top: 0 });
        return;
      }
    }
    const rows = which === 'BOARD' ? boardRows(s, v.chip).map((e) => e.id) : leavingRows(s);
    const shown = which === 'BOARD' ? BOARD_ROWS : LEAVING_ROWS;
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0) + Math.sign(input.mouse.wheel);
    if (step && rows.length) v.sel = Math.max(0, Math.min(rows.length - 1, v.sel + step));
    if (pressed) for (let i = 0; i < shown; i++) if (inBox(rowRect(i), x, y) && v.top + i < rows.length) v.sel = v.top + i;
    if (v.sel < v.top) v.top = v.sel;
    if (v.sel >= v.top + shown) v.top = v.sel - shown + 1;
    const id = rows[v.sel];
    if (!id || s.config.delegate.portal) return;
    let act = -1;
    for (let i = 0; i < 5; i++) if (input.hit(`Digit${i + 1}`) || (pressed && inBox(actionRect(i), x, y))) act = i;
    if (act < 0) return;
    v.note = which === 'BOARD' ? this.boardAction(s, id, act) : this.leavingAction(s, id, act);
    saveSeason(s);
  }

  private boardAction(s: SeasonState, id: string, act: number): string {
    const u = s.config.userTeamId;
    const p = s.portal!;
    const key = `${u}:${id}`;
    switch (act) {
      case 0:
        if (p.offers[u]?.includes(id)) {
          withdraw(s, u, id);
          return 'OFFER WITHDRAWN';
        }
        return offer(s, u, id) ? 'OFFER MADE' : 'NO SPOT TO OFFER: AT THE CAP, OR SPOTS ARE NEEDED AT OTHER POSITIONS';
      case 1: {
        const next = p.promises[key] === undefined ? 'snaps' : p.promises[key] === 'snaps' ? 'start' : undefined;
        if (!next) {
          delete p.promises[key];
          return 'PROMISE WITHDRAWN (THE OFFER STANDS)';
        }
        return offer(s, u, id, next) ? `OFFER WITH A PROMISE OF ${next === 'start' ? 'A STARTING SHOT' : 'MORE SNAPS'}` : 'NO SPOT TO OFFER';
      }
      case 2:
        return pursue(s, u, id, 'call') ? 'YOU CALLED HIM' : 'NO CALLS LEFT THIS ROUND, OR ALREADY CALLED';
      case 3:
        return pursue(s, u, id, 'visit') ? 'HE VISITED CAMPUS' : 'NO VISITS LEFT THIS ROUND, OR ALREADY VISITED';
      default: {
        const how = p.focus.includes(id) ? 'drop' : p.drop.includes(id) ? 'none' : 'focus';
        setTarget(s, id, how);
        return how === 'focus' ? 'YOUR POSITION COACH WILL FOCUS ON HIM' : how === 'drop' ? 'YOUR POSITION COACH WILL DROP HIM' : 'BACK ON THE NORMAL BOARD';
      }
    }
  }

  private leavingAction(s: SeasonState, id: string, act: number): string {
    const acts = ['meet', 'promise', 'promise', 'go', 'encourage'] as const;
    if (!actOnLeaving(s, id, acts[act], act === 1 ? 'start' : 'snaps')) return 'NOT NOW: ALREADY DECIDED, OR NO MEETINGS LEFT';
    const e = s.portal!.leaving[id];
    switch (acts[act]) {
      case 'meet':
        return e.ok ? 'GOOD TALK: HE IS LEANING TOWARD STAYING' : 'HE IS STILL THINKING ABOUT LEAVING';
      case 'promise':
        return `PROMISED ${act === 1 ? 'A STARTING SHOT' : 'MORE SNAPS'} NEXT SEASON. KEEP IT`;
      case 'go':
        return 'HIS CALL';
      default:
        return 'HE WILL ENTER THE PORTAL';
    }
  }

  // ------------------------------------------------------------ weekly prep

  private toPrep(): void {
    const s = this.season!;
    const game = userGameThisWeek(s);
    this.screen = 'prep';
    this.prepView = { tab: 0, scroll: 0, page: 0, sel: 0, mx: 0, my: 0, report: game ? scoutReport(s, game, this.starred) : null };
  }

  /**
   * The next opponent, their two-deep, the scouting report (click a staff pick's star to save it) and
   * the staff, where a position coach's weekly emphasis is picked (season/emphasis.ts).
   */
  private updatePrep(input: Input): void {
    const v = this.prepView;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace', 'KeyO')) {
      this.screen = 'season';
      return;
    }
    const r = v.report;
    if (!r) return;
    const n = PREP_TABS.length;
    const tabWas = v.tab;
    if (input.hit('KeyA', 'ArrowLeft')) v.tab = (v.tab + n - 1) % n;
    if (input.hit('KeyD', 'ArrowRight')) v.tab = (v.tab + 1) % n;
    if (input.mouse.pressed && prepTabAt(x, y) >= 0) v.tab = prepTabAt(x, y);
    if (v.tab !== tabWas) Object.assign(v, { scroll: 0, page: 0, sel: 0 });
    const step = (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0) + Math.sign(input.mouse.wheel);
    if (PREP_TABS[v.tab] === 'ROSTER') {
      if (step) v.page = 1 - v.page;
    } else if (PREP_TABS[v.tab] === 'SCOUTING') {
      v.scroll = Math.max(0, Math.min(maxScroll(r), v.scroll + step * 3));
      if (input.mouse.pressed) {
        const i = r.suggestions.findIndex((_, k) => inBox(starRect(prepCardRect(k)), x, y));
        if (i >= 0) toggleStar(this.starred, r.suggestions[i].id);
      }
    } else if (PREP_TABS[v.tab] === 'STAFF') {
      this.updateStaff(input, step);
    }
  }

  /** STAFF: W/S picks a coach, Q/E or a click picks his emphasis, R puts every group back on standard. */
  private updateStaff(input: Input, step: number): void {
    const v = this.prepView;
    const s = this.season!;
    const ts = (s.teamState[s.config.userTeamId] ??= {});
    const n = STAFF_ROLES.length;
    if (step) v.sel = (v.sel + n + Math.sign(step)) % n;
    const { x, y, pressed } = input.mouse;
    if (pressed) {
      const i = STAFF_ROLES.findIndex((_, k) => inBox(staffRowRect(k), x, y));
      if (i >= 0) v.sel = i;
    }
    let changed = false;
    if (input.hit('KeyR') && ts.emph) {
      delete ts.emph;
      changed = true;
    }
    const role = STAFF_ROLES[v.sel];
    if ((GROUPS as string[]).includes(role)) {
      const g = role as Group;
      const ids = groupEmphases(g);
      const cur = Math.max(0, ids.indexOf(ts.emph?.[g] ?? STANDARD));
      let next = cur;
      if (input.hit('KeyE')) next = (cur + 1) % ids.length;
      if (input.hit('KeyQ')) next = (cur + ids.length - 1) % ids.length;
      if (pressed) {
        const j = ids.findIndex((_, k) => inBox(staffOptionRect(k), x, y));
        if (j >= 0) next = j;
      }
      if (next !== cur) {
        const emph = { ...ts.emph };
        if (ids[next] === STANDARD) delete emph[g];
        else emph[g] = ids[next];
        if (Object.keys(emph).length) ts.emph = emph;
        else delete ts.emph;
        changed = true;
      }
    }
    if (changed) saveSeason(s);
  }

  /** The live game is over: hand the score to the season (box score to come) and go back to the hub. */
  private finishSeasonGame(): void {
    const g = this.seasonGame!;
    const s = this.season!;
    const userHome = g.home === s.config.userTeamId;
    const home = userHome ? this.score.user : this.score.cpu;
    const away = userHome ? this.score.cpu : this.score.user;
    const blank = (points: number) => ({ points, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 });
    // TODO: record the live game's team and player stats from the plays.
    const result: GameResult = { home, away, ot: 0, box: { home: blank(home), away: blank(away), players: [] } };
    this.seasonGame = null;
    advanceWeek(s, result, this.liveDrives ?? undefined);
    this.liveDrives = null;
    saveSeason(s);
    this.toSeason();
  }

  // ------------------------------------------------------------ play call

  private toCall(mode: CallMode = 'normal'): void {
    this.screen = 'call';
    this.callMode = mode;
    this.play = null;
    this.kick = null;
    this.applied = null;
    // The CPU defense's identity: its own call mix (more zero blitz on third and long if that's who it is) and press rates.
    const ident = defIdentity(this.cpu);
    this.defCall = pickDefCall(this.rng, situationMix(ident, this.drive.down, this.drive.firstDownX - this.drive.los));
    const pr = ident.press;
    this.press = { CB1: this.rng() < pr.CB1, CB2: this.rng() < pr.CB2, NB: this.rng() < pr.NB };
    if (mode === 'pat' || mode === 'try') this.tab = Math.min(this.tab, 2);
    readyForPlay(this.clock);
    // Inside two minutes of a half and not ahead: go no-huddle, once, so the user can still huddle up.
    if (mode === 'normal' && inTwoMinute(this.clock) && this.score.user <= this.score.cpu && this.autoHurryQ !== this.clock.quarter) {
      this.tempo = 'hurry';
      this.autoHurryQ = this.clock.quarter;
    }
    this.cam.follow(this.spotX(), 0.4);
  }

  /** Where the ball sits between plays: the line of scrimmage, or the tee before a kickoff. */
  private spotX(): number {
    return this.callMode === 'kickoff' ? KICKOFF_LINE : this.drive.los;
  }

  /** Tabs on the call screen in this mode (none for the PAT choice and kickoffs). */
  private tabs(): typeof PLAY_TABS {
    if (this.callMode === 'normal') return PLAY_TABS;
    if (this.callMode === 'try') return PLAY_TABS.filter((t) => t.kind !== 'st');
    return [];
  }

  private cards(): Card[] {
    switch (this.callMode) {
      case 'pat':
        return [{ kind: 'kick', def: kickDef('xp') }, { kind: 'twoPt' }];
      case 'kickoff':
        return KICKOFF_CALLS.map((def) => ({ kind: 'kick', def }));
      default: {
        const tab = this.tabs()[this.tab];
        if (tab.kind === 'st') return ST_TAB.map((def) => ({ kind: 'kick', def }));
        const list = this.chipPlays();
        const page = Math.min(this.page, this.pageCount() - 1);
        return list.slice(page * PAGE, page * PAGE + PAGE).map((def) => ({ kind: 'play', def }));
      }
    }
  }

  /** The current playbook tab's plays, or null on a tab without plays (special teams, PAT, kickoff). */
  private tabPlays(): PlayDef[] | null {
    if (this.callMode === 'pat' || this.callMode === 'kickoff') return null;
    const tab = this.tabs()[this.tab];
    return tab && tab.kind !== 'st' ? playsOfKind(tab.kind) : null;
  }

  /** The chip in use on this tab: STARRED if the tab has starred plays, else the first formation, until the user picks one. */
  private chipIndex(): number {
    const plays = this.tabPlays();
    if (!plays) return 0;
    const n = chipsFor(plays).length;
    const starredHere = plays.some((p) => this.starred.has(p.id));
    return Math.min(this.chip[this.tab] ?? (starredHere || n < 2 ? 0 : 1), n - 1);
  }

  /** Plays under the current chip, before paging. */
  private chipPlays(): PlayDef[] {
    const plays = this.tabPlays() ?? [];
    const f = chipsFor(plays)[this.chipIndex()];
    return f === 'starred' ? plays.filter((p) => this.starred.has(p.id)) : plays.filter((p) => p.formation === f);
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.chipPlays().length / PAGE));
  }

  private chipRects(): { x: number; y: number; w: number; h: number }[] {
    const plays = this.tabPlays();
    if (!plays) return [];
    const widths = chipsFor(plays).map((f) => chipLabel(f).length * 8 + 8 + (f === 'starred' ? STAR_ICON_W : 0));
    const gap = 4;
    let x = (VIEW_W - (widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1))) / 2;
    return widths.map((w) => {
      const r = { x, y: CHIP_Y, w, h: CHIP_H };
      x += w + gap;
      return r;
    });
  }

  private updateCall(dt: number, input: Input): void {
    if (this.tickBetweenPlays(dt)) return;
    if (input.hit('KeyH')) this.tempo = this.tempo === 'hurry' ? 'normal' : 'hurry';
    const tabs = this.tabs();
    const n = tabs.length;
    if (n) {
      const tabWas = this.tab;
      if (input.hit('KeyQ')) this.tab = (this.tab + n - 1) % n;
      if (input.hit('KeyE', 'Tab')) this.tab = (this.tab + 1) % n;
      if (input.hit('KeyF')) this.flipCall = !this.flipCall;
      if (this.tab !== tabWas) this.page = 0;
    }
    const chips = this.chipRects();
    if (chips.length) {
      // A/D or the wheel: formation chip. W/S: page within it.
      const step = (input.hit('KeyD') ? 1 : 0) - (input.hit('KeyA') ? 1 : 0) + Math.sign(input.mouse.wheel);
      if (step) {
        this.chip[this.tab] = (this.chipIndex() + step + chips.length) % chips.length;
        this.page = 0;
      }
      const pages = this.pageCount();
      const pg = Math.min(this.page, pages - 1);
      if (input.hit('KeyS')) this.page = (pg + 1) % pages;
      if (input.hit('KeyW')) this.page = (pg + pages - 1) % pages;
    }
    if (this.callMode === 'try' && input.hit('Escape', 'Backspace')) {
      this.callMode = 'pat';
      return;
    }
    const { x, y } = input.mouse;
    this.callMouse = { x, y };
    if (input.mouse.pressed) {
      for (let i = 0; i < n; i++) {
        if (inRect(x, y, tabRect(i, n)) && this.tab !== i) {
          this.tab = i;
          this.page = 0;
        }
      }
      chips.forEach((r, i) => {
        if (inRect(x, y, r)) {
          this.chip[this.tab] = i;
          this.page = 0;
        }
      });
    }
    const cards = this.cards();
    this.hover = -1;
    for (let i = 0; i < cards.length; i++) if (inRect(x, y, cardRect(i))) this.hover = i;
    let chosen = -1;
    for (let i = 0; i < cards.length; i++) if (input.hit(`Digit${i + 1}`, `Numpad${i + 1}`)) chosen = i;
    const hc = this.hover >= 0 ? cards[this.hover] : undefined;
    if (input.mouse.pressed && hc?.kind === 'play' && inRect(x, y, starRect(cardRect(this.hover)))) {
      toggleStar(this.starred, hc.def.id); // the card's star saves the play; it doesn't call it
      return;
    }
    if (input.mouse.pressed && this.hover >= 0) chosen = this.hover;
    if (chosen >= 0) {
      input.mouse.pressed = false; // the click that picks a kick must not start its aim
      const c = cards[chosen];
      if (c.kind === 'play') this.startPlay(c.def);
      else if (c.kind === 'kick') this.startKick(c.def);
      else {
        this.callMode = 'try';
        this.tab = 0;
      }
    }
    this.cam.follow(this.spotX(), 0.4);
  }

  /** How much the next snap matters: the down, the red zone, late and close; a field goal counts its distance. */
  private snapLeverage(fg = false): number {
    const d = this.drive;
    const late = lateAndClose(this.clock.quarter, this.score.user - this.score.cpu);
    return leverage(d.down, OPP_GOAL - d.los, late, fg ? fgDistance(d.los, OPP_GOAL) : undefined);
  }

  private startPlay(def: PlayDef): void {
    // Everyone plays this snap with his confidence at its leverage.
    this.snapLev = this.snapLeverage();
    this.play = new Play({
      offTeam: this.user,
      defTeam: this.cpu,
      offRoster: clutchRoster(this.userRoster, this.snapLev),
      defRoster: clutchRoster(this.cpuRoster, this.snapLev),
      play: def,
      defCall: this.defCall!,
      press: this.press,
      los: this.drive.los,
      ballY: this.drive.ballY,
      flip: this.flipCall,
      rng: this.rng,
    });
    this.flipCall = false;
    this.screen = 'play';
  }

  private startKick(def: KickDef): void {
    const kickoff = def.unit === 'kickoff';
    const place = def.unit === 'fg' || def.unit === 'xp';
    this.snapLev = place ? this.snapLeverage(true) : 0;
    this.kick = new KickPlay({
      kickTeam: this.user,
      recvTeam: this.cpu,
      kickRoster: clutchRoster(this.userRoster, this.snapLev),
      recvRoster: clutchRoster(this.cpuRoster, this.snapLev),
      def,
      los: kickoff ? KICKOFF_LINE : this.drive.los,
      ballY: kickoff ? FIELD_W / 2 : this.drive.ballY,
      wind: this.wind,
      rng: this.rng,
    });
    this.applied = null;
    this.screen = 'kick';
  }

  /**
   * Huddle time: runs the play clock (and the game clock if it's running).
   * Returns true if time ran out and the game moved on (end of quarter or delay of game).
   */
  private tickBetweenPlays(dt: number): boolean {
    if (this.callMode === 'kickoff') return false; // the kicking team sets up on the referee's signal
    tickBetween(this.clock, dt);
    if (this.callMode === 'normal' && this.clock.time <= 0) {
      this.play = null;
      this.periodOver();
      return true;
    }
    if (this.clock.play <= 0) {
      this.play = null;
      const before = this.drive.los;
      this.drive = { ...this.drive, los: penaltySpot(before, OWN_GOAL) };
      adminStop(this.clock);
      const yds = Math.round(before - this.drive.los);
      this.notify({
        title: 'DELAY OF GAME', sub: `${yds === 5 ? '5-yard' : 'Half the distance'} penalty. Replay the down`,
        extra: downDistance(this.drive), color: '#ffd23f',
      });
      this.kick = null;
      this.showNotices(this.callMode === 'normal' ? 'call' : 'pat');
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------ live play

  private updatePlay(dt: number, input: Input): void {
    const play = this.play!;
    if (play.phase === 'presnap') {
      if (this.tickBetweenPlays(dt)) return;
      if (input.hit('Escape', 'Backspace')) {
        this.screen = 'call'; // audible: same defense, pick a new play; the play clock keeps running
        this.play = null;
        return;
      }
      if (input.hit('Space') || input.mouse.pressed) {
        play.snap();
        if (!this.drive.try) {
          runoffAtSnap(this.clock, this.tempo); // tries are untimed
          snapClock(this.clock);
        }
        input.mouse.pressed = false; // the snap click must not start an aim
      }
    }
    play.update(dt, input, this.cam);
    if (play.phase !== 'presnap' && play.phase !== 'over' && !this.drive.try) tickLive(this.clock, dt);

    const lead = play.aim ? 0.22 : play.phase === 'run' ? 0.4 : play.phase === 'air' ? 0.45 : 0.35;
    this.cam.follow(play.focusX(), lead);

    if (play.phase === 'over' && play.outcome) {
      if (!this.applied) {
        if (this.drive.try) {
          this.applied = applyTry(this.drive, play.outcome);
        } else {
          this.logSnap(play.playDef.kind !== 'run', play.outcome);
          this.applied = applyOutcome(this.drive, play.outcome);
          afterPlay(this.clock, play.outcome.type, this.applied.headline === 'FIRST DOWN');
          if (play.outcome.type === 'td') adminStop(this.clock); // a score stops the clock
        }
        this.score.user += this.applied.userPoints;
        this.score.cpu += this.applied.cpuPoints;
      } else if (!this.drive.try) {
        tickBetween(this.clock, dt);
      }
      const skip = play.overTime > 0.6 && (input.hit('Space', 'Enter') || input.mouse.pressed);
      if (play.overTime > 2.6 || skip) this.handleChange(this.applied);
    }
  }

  // ------------------------------------------------------------ kicks

  private updateKick(dt: number, input: Input): void {
    const kp = this.kick!;
    if (kp.phase === 'presnap') {
      if (this.tickBetweenPlays(dt)) return;
      if (input.hit('Escape', 'Backspace')) {
        this.screen = 'call'; // back to the call screen; the play clock keeps running
        this.kick = null;
        return;
      }
      if (kp.unit === 'punt' && (input.hit('Space') || input.mouse.pressed)) {
        kp.snap();
        runoffAtSnap(this.clock, this.tempo);
        snapClock(this.clock);
        input.mouse.pressed = false; // the snap click must not start the punt aim
      }
    }
    const was = kp.phase;
    kp.update(dt, input);
    if (was === 'presnap' && kp.phase !== 'presnap' && kp.unit === 'fg') {
      runoffAtSnap(this.clock, this.tempo);
      snapClock(this.clock);
    }
    if (kp.clockRunning()) tickLive(this.clock, dt);
    const f = kp.focus();
    this.cam.follow(f.x, f.lead);

    if (kp.phase === 'over' && kp.outcome) {
      if (!this.applied) {
        this.logKick(kp.outcome);
        this.applied = applyKick(this.drive, kp.outcome);
        this.score.user += this.applied.userPoints;
        this.score.cpu += this.applied.cpuPoints;
        // Every kick ends in a score or a change of possession: the clock stops until the next snap.
        adminStop(this.clock);
      } else if (kp.unit !== 'xp') {
        tickBetween(this.clock, dt);
      }
      const skip = kp.overTime > 0.6 && (input.hit('Space', 'Enter') || input.mouse.pressed);
      if (kp.overTime > 2.8 || skip) this.handleChange(this.applied);
    }
  }

  /** Move the game on after a play or kick: next down, try, kickoff, or a change of possession. */
  private handleChange(a: Applied): void {
    const c = a.change;
    switch (c.kind) {
      case 'none':
        this.drive = a.drive;
        if (this.clock.time <= 0) this.periodOver();
        else this.toCall();
        return;
      case 'pat':
        // The try happens even with no time left.
        this.drive = { los: OPP_GOAL - 3, ballY: FIELD_W / 2, down: 1, firstDownX: OPP_GOAL, try: true };
        this.toCall('pat');
        return;
      case 'kickoff':
        this.drive = startDrive(25);
        this.kickOffNext();
        return;
      case 'pick6':
      case 'returnTd': {
        this.drive = startDrive(25);
        adminStop(this.clock);
        const sub = c.kind === 'pick6' ? 'Pick six' : c.sub;
        this.notify({ title: `${this.cpu.abbr} SCORES`, sub: `${sub}. Kickoff to you.`, extra: '' });
        if (this.clock.time <= 0) this.periodOver();
        else this.showNotices('call');
        return;
      }
      default:
        break;
    }
    const cpuStart = c.kind === 'safety' ? 40 : c.cpuStart;
    if (this.clock.time > 0) {
      this.cpuDrive(cpuStart);
      return;
    }
    // Time ran out on the play that ended the possession.
    if (this.clock.quarter === 1 || this.clock.quarter === 3) {
      this.endQuarterNotice();
      nextQuarter(this.clock);
      this.cpuDrive(cpuStart);
    } else {
      this.periodOver();
    }
  }

  /** The user scored: kick off, unless the scoring play ended the half or the game. */
  private kickOffNext(): void {
    if (this.clock.time > 0) {
      this.toCall('kickoff');
      return;
    }
    const q = this.clock.quarter;
    if (q === 1 || q === 3) {
      this.endQuarterNotice();
      nextQuarter(this.clock);
      this.showNotices('kickoff');
    } else if (q === 2) {
      this.halftime();
    } else {
      this.showNotices('final');
    }
  }

  // ------------------------------------------------------------ clock flow

  private endQuarterNotice(): void {
    this.notify({
      title: `END OF ${quarterName(this.clock.quarter)} QUARTER`, sub: this.scoreLine(), extra: '', color: '#9ad7ff',
    });
  }

  private scoreLine(): string {
    return `${this.user.abbr} ${this.score.user}  -  ${this.cpu.abbr} ${this.score.cpu}`;
  }

  /** The game clock hit 0:00 with the user due the ball next (or mid-drive). */
  private periodOver(): void {
    const q = this.clock.quarter;
    if (q === 1 || q === 3) {
      this.endQuarterNotice();
      nextQuarter(this.clock);
      this.showNotices('call');
    } else if (q === 2) {
      this.halftime();
    } else {
      this.showNotices('final');
    }
  }

  /** The user took the opening kickoff, so the user kicks off to start the second half. */
  private halftime(): void {
    this.notify({ title: 'HALFTIME', sub: this.scoreLine(), extra: `You kick off to ${this.cpu.abbr}`, color: '#9ad7ff' });
    nextQuarter(this.clock);
    this.showNotices('kickoff');
  }

  /** A season game logs the user's snaps for the progression grades: the gain, pass or run, and what ended it. */
  private logSnap(pass: boolean, o: PlayOutcome): void {
    if (!this.liveDrives) return;
    const d = this.drive;
    const gain = Math.round((o.type === 'td' ? OPP_GOAL : o.spot) - d.los);
    const int = o.type === 'int' || o.type === 'pick6';
    this.liveDrives[0].plays.push({
      gain, pass, down: d.down, toGo: Math.round(d.firstDownX - d.los),
      ...(o.type === 'sack' ? { sack: true } : {}),
      ...(int ? { int: true, turnover: true } : {}),
      ...(gain >= 20 ? { explosive: true } : {}),
      ...(this.snapLev ? { lev: this.snapLev } : {}),
    });
  }

  private logKick(o: KickOutcome): void {
    if (!this.liveDrives) return;
    const good = o.unit === 'fg' ? o.result === 'fgGood' : o.unit === 'xp' ? o.result === 'xpGood' : true;
    const kick = { unit: o.unit, good, ...(o.unit === 'fg' ? { dist: fgDistance(this.drive.los, OPP_GOAL) } : {}) };
    this.liveDrives[0].plays.push({ gain: 0, down: 0, toGo: 0, kick, ...(this.snapLev ? { lev: this.snapLev } : {}) });
  }

  /** Simulate a CPU possession from `start` (yards from its own goal), burning game clock. */
  private cpuDrive(start: number): void {
    const c = this.clock;
    const left = timeLeftInHalf(c);
    const diff = this.score.cpu - this.score.user;
    const late = (c.quarter === 4 && left < Math.min(300, c.qSecs * 0.4)) || (c.quarter === 2 && left < 120);
    const plays: SimPlay[] = [];
    const cpuConf = teamConf(this.cpuSquad);
    const conf = { off: cpuConf.off, def: teamConf(this.userSquad).def, k: cpuConf.k, late: lateAndClose(c.quarter, diff) };
    const sim = simulateDrive(teamRatings(this.cpuSquad).off, teamRatings(this.userSquad).def, start, this.rng, {
      timeLeft: left, hurry: diff < 0 && late, milk: diff > 0 && c.quarter === 4,
    }, this.liveDrives ? (p) => plays.push(p) : undefined, conf, driveMods(undefined, this.userEmph, autoGamePlan(this.cpuSquad, this.userSquad).passShare));
    this.liveDrives?.push(driveLog(this.cpu.id, plays, sim));
    const { halfOver } = advanceSim(c, sim.secs);
    this.score.cpu += sim.points;
    const notice = this.notify({
      title: `${this.cpu.abbr} DRIVE: ${sim.result}`,
      sub: `${sim.plays} plays, ${sim.yards} yards, ${mmss(sim.secs)}`,
      extra: '',
    });
    if (halfOver) {
      if (c.quarter === 2) {
        this.halftime();
      } else {
        this.showNotices('final');
      }
      return;
    }
    this.drive = startDrive(userStartAfter(sim, this.rng));
    adminStop(c);
    notice.extra = `Your ball at the ${fieldLabel(this.drive.los)}  ${clockText(c)}`;
    this.showNotices('call');
  }

  private notify(n: Notice): Notice {
    n.clock = clockText(this.clock);
    n.score = { ...this.score };
    this.notices.push(n);
    return n;
  }

  private showNotices(then: Game['afterNotices']): void {
    this.afterNotices = then;
    this.screen = 'notice';
    if (!this.notices.length) this.nextNotice();
  }

  private nextNotice(): void {
    if (this.notices.length) this.notices.shift();
    if (this.notices.length) return;
    if (this.afterNotices === 'final') this.screen = 'final';
    else if (this.afterNotices === 'kickoff') this.toCall('kickoff');
    else if (this.afterNotices === 'pat') this.toCall('pat');
    else this.toCall();
  }

  // ------------------------------------------------------------ render

  render(g: CanvasRenderingContext2D): void {
    g.imageSmoothingEnabled = false;
    if (this.screen === 'title') {
      this.renderTitle(g);
      return;
    }
    if (this.screen === 'roster') {
      drawRoster(g, buildSquad(TEAMS[this.rosterIdx]), this.rosterPage);
      return;
    }
    if (this.screen === 'season') {
      drawSeason(g, this.season!, this.seasonView);
      return;
    }
    if (this.screen === 'team') {
      const s = this.season!;
      drawTeam(g, s, squadFor(s, s.config.userTeamId), this.teamView);
      return;
    }
    if (this.screen === 'career') {
      const s = this.season!;
      drawCareer(g, s, squadFor(s, s.config.userTeamId), this.careerView);
      return;
    }
    if (this.screen === 'playbook') {
      const s = this.season!;
      drawPlaybook(g, squadFor(s, s.config.userTeamId), this.bookView, this.starred);
      return;
    }
    if (this.screen === 'portal') {
      const s = this.season!;
      drawPortal(g, s, this.portalView, staffFor(s, s.config.userTeamId));
      return;
    }
    if (this.screen === 'carousel') {
      drawCarousel(g, this.season!, this.carouselView);
      return;
    }
    if (this.screen === 'departures') {
      drawDepartures(g, this.season!, this.departuresView);
      return;
    }
    if (this.screen === 'recruit') {
      drawRecruit(g, this.season!, this.recruitView);
      return;
    }
    if (this.screen === 'prep') {
      const s = this.season!;
      const r = this.prepView.report;
      drawPrep(g, s, r ? squadFor(s, r.opp) : null, this.prepView, this.starred, staffFor(s, s.config.userTeamId));
      return;
    }
    drawField(g, this.cam, this.user, this.cpu, this.crowd!);
    const kickoff = this.callMode === 'kickoff' || this.kick?.unit === 'kickoff';
    drawLines(g, this.cam, kickoff ? KICKOFF_LINE : this.drive.los, kickoff || this.kick ? OPP_GOAL : this.drive.firstDownX);
    if (this.kick) drawKickPlay(g, this.cam, this.kick, this.debug);
    else if (this.play) drawPlay(g, this.cam, this.play, this.debug);
    else this.drawBallSpot(g);

    const center = kickoff ? 'KICKOFF' : `${downDistance(this.drive)}  ${fieldLabel(this.drive.los)}`;
    const right = this.kick ? this.kick.def.name.toUpperCase() : this.play ? this.play.playDef.name.toUpperCase() : 'PLAY CALL';
    const shown = this.screen === 'notice' ? this.notices[0] : undefined;
    drawScorebug(g, this.user, this.cpu, shown?.score ?? this.score, shown?.clock ?? clockText(this.clock), center, right);
    const huddle =
      this.screen === 'call' || (this.screen === 'play' && this.play?.phase === 'presnap') ||
      (this.screen === 'kick' && this.kick?.phase === 'presnap');
    if (huddle && this.callMode !== 'kickoff') drawPlayClock(g, playClockText(this.clock), this.clock.play, this.t);
    if (huddle && this.callMode === 'normal') drawTempo(g, this.tempo === 'hurry', this.screen === 'call');
    const kicking = this.screen === 'kick' || (this.screen === 'call' && this.cards()[0]?.kind === 'kick');
    if (huddle && this.callMode !== 'kickoff' && !this.drive.try) {
      // A big snap: show the key man's nerve, the QB's or, lining up a kick, the kicker's.
      const place = kicking && this.kick?.unit !== 'punt';
      const lev = this.screen === 'call' ? this.snapLeverage(place) : this.snapLev;
      const man = this.userRoster[place ? 'K' : 'QB'];
      if (lev >= 0.5 && man) drawClutch(g, place ? 'K' : 'QB', confLabel(man.conf ?? 0), man.conf ?? 0);
    }
    if (kicking) drawWind(g, this.wind, windLabel(this.wind));

    if (this.screen === 'call') this.renderCall(g);
    else if (this.screen === 'notice' && this.notices.length) {
      const n = this.notices[0];
      drawBanner(g, n.title, n.sub, n.color ?? '#ffffff', n.extra);
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
    } else if (this.screen === 'final') this.renderFinal(g);
    else if (this.kick) this.renderKickHud(g, this.kick);
    else if (this.play) this.renderPlayHud(g, this.play);
  }

  private renderKickHud(g: CanvasRenderingContext2D, kp: KickPlay): void {
    if (kp.phase === 'over' && kp.outcome && this.applied) {
      const o = kp.outcome;
      const h = this.applied.headline;
      drawBanner(g, o.text, o.sub, o.color, h && h !== o.text && h !== 'BLOCKED' ? h : '');
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
      return;
    }
    const fg = kp.unit === 'fg' || kp.unit === 'xp';
    if (kp.meter()?.live) {
      drawHint(g, 'SPACE: KICK IT ON THE GREEN');
      return;
    }
    switch (kp.phase) {
      case 'presnap':
        if (kp.unit === 'punt') drawHint(g, 'SPACE/CLICK: SNAP   DRAG + RELEASE, THEN SPACE ON THE GREEN');
        else drawHint(g, 'DRAG + RELEASE, THEN SPACE ON THE GREEN   W/S: LOFT   ESC: BACK');
        if (fg && !kp.aim) {
          const yds = fgDistance(this.drive.los, OPP_GOAL);
          text(g, kp.unit === 'xp' ? 'EXTRA POINT' : `${yds}-YARD ATTEMPT`, VIEW_W / 2, 40, { size: 8, align: 'center', color: '#ffd23f' });
        }
        break;
      case 'snap':
      case 'set':
        drawHint(g, kp.unit === 'punt' ? 'DRAG + RELEASE TO PUNT   W/S LOFT   GET IT OFF!' : 'KICK IS AWAY...');
        break;
      case 'approach':
      case 'flight':
      case 'loose':
        drawHint(g, fg ? 'KICK IS UP...' : 'COVER IT! (AI COVERAGE)');
        break;
      case 'return':
        drawHint(g, 'COVERAGE: TACKLE HIM! (AI PURSUIT)');
        break;
    }
  }

  private renderFinal(g: CanvasRenderingContext2D): void {
    const { user, cpu } = this.score;
    const title = user === cpu ? 'FINAL: TIE' : user > cpu ? `FINAL: ${this.user.abbr} WINS` : `FINAL: ${this.cpu.abbr} WINS`;
    drawBanner(g, title, this.scoreLine(), user >= cpu ? '#ffd23f' : '#ff5a5a', `${this.user.school.toUpperCase()} VS ${this.cpu.school.toUpperCase()}`);
    drawHint(g, this.seasonGame ? 'CLICK OR SPACE TO CONTINUE THE SEASON' : 'CLICK OR SPACE FOR THE TITLE SCREEN');
  }

  private drawBallSpot(g: CanvasRenderingContext2D): void {
    const s = this.callMode === 'kickoff' ? this.cam.toScreen(KICKOFF_LINE, FIELD_W / 2) : this.cam.toScreen(this.drive.los, this.drive.ballY);
    g.fillStyle = '#7a3e14';
    g.fillRect(Math.round(s.x) - 3, Math.round(s.y) - 2, 6, 3);
  }

  private renderPlayHud(g: CanvasRenderingContext2D, play: Play): void {
    if (play.phase === 'over' && play.outcome && this.applied) {
      const o = play.outcome;
      const extra = this.applied.headline && this.applied.headline !== o.text.replace('!', '') ? this.applied.headline : '';
      drawBanner(g, o.text, o.sub, o.color, extra);
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
      return;
    }
    switch (play.phase) {
      case 'presnap':
        drawHint(g, 'SPACE/CLICK: SNAP   ESC: AUDIBLE   READ THE SAFETIES');
        this.drawShellRead(g);
        break;
      case 'snap':
      case 'live': {
        const ho = play.handoffOption();
        const give = ho === 'pitch' ? 'R-CLICK PITCH  ' : ho ? 'R-CLICK HAND OFF  ' : '';
        drawHint(g, play.scramble ? 'WASD RUN  SHIFT SPRINT' : play.aim ? 'RELEASE TO THROW  SPACE: CANCEL' : `${give}DRAG + RELEASE TO THROW  WASD MOVE QB`);
        break;
      }
      case 'air':
        drawHint(g, play.pitch ? 'PITCH...' : 'BALL IN THE AIR...');
        break;
      case 'run':
        drawHint(g, play.carrier?.side === 'off' ? 'W/S STEER  A SLOW  SHIFT SPRINT' : 'TACKLE HIM! (AI PURSUIT)');
        break;
    }
  }

  private drawShellRead(g: CanvasRenderingContext2D): void {
    const s = this.shellRead();
    const w = textWidth(g, s) + 16;
    g.fillStyle = 'rgba(8,10,14,0.8)';
    g.fillRect(Math.round(VIEW_W / 2 - w / 2), 18, Math.round(w), 14);
    text(g, s, VIEW_W / 2, 21, { align: 'center', color: '#ffffff' });
  }

  /** A light pre-snap hint so the user learns to read the shell themselves. */
  private shellRead(): string {
    const play = this.play!;
    const deep = play.def.filter((d) => d.role === 'S' && d.pos.x > play.los + 10).length;
    const walked = play.def.filter((d) => d.role === 'LB' && d.pos.x < play.los + 3).length;
    const press = play.def.filter((d) => d.press).length;
    const shell = deep >= 2 ? 'TWO HIGH' : deep === 1 ? 'SINGLE HIGH' : 'NO DEEP SAFETY';
    return `${shell}${walked ? '  LBS WALKED UP' : ''}${press ? `  ${press} PRESSED` : ''}`;
  }

  private renderCall(g: CanvasRenderingContext2D): void {
    const cards = this.cards();
    const tabs = this.tabs();
    g.fillStyle = 'rgba(8,10,14,0.55)';
    g.fillRect(0, CALL_Y, VIEW_W, 346 - CALL_Y);
    const hc = this.hover >= 0 ? cards[this.hover] : undefined;
    const fallback =
      this.callMode === 'pat' ? 'TOUCHDOWN! KICK THE PAT OR GO FOR TWO'
      : this.callMode === 'kickoff' ? 'KICKOFF: CHOOSE A KICK'
      : this.callMode === 'try' ? 'TWO-POINT TRY FROM THE 3   ESC: BACK'
      : 'CHOOSE A PLAY';
    const tip = hc ? (hc.kind === 'twoPt' ? 'Run any play from the 3. Score for two.' : hc.def.tip).toUpperCase() : fallback;
    text(g, tip, VIEW_W / 2, CALL_Y + 6, { size: 8, align: 'center', color: '#ffd23f' });
    if (!tabs.length) {
      const head = this.callMode === 'pat' ? 'POINT AFTER' : 'KICKOFF';
      text(g, head, VIEW_W / 2, TAB_Y + 3, { align: 'center', color: '#ffffff' });
    }
    tabs.forEach((t, i) => {
      const r = tabRect(i, tabs.length);
      const on = i === this.tab;
      g.fillStyle = on ? this.user.colors.primary : '#141b26';
      g.fillRect(r.x, r.y, r.w, r.h);
      if (on) {
        g.fillStyle = '#ffd23f';
        g.fillRect(r.x, r.y + r.h - 2, r.w, 2);
      }
      text(g, t.label, r.x + r.w / 2, r.y + 3, { align: 'center', color: on ? '#ffffff' : '#8fa0b8', shadow: on ? undefined : false });
    });
    const plays = this.tabPlays();
    if (plays) {
      const ci = this.chipIndex();
      const rects = this.chipRects();
      chipsFor(plays).forEach((f, i) => {
        const r = rects[i];
        const on = i === ci;
        g.fillStyle = on ? '#24324a' : '#101620';
        g.fillRect(r.x, r.y, r.w, r.h);
        if (on) {
          g.fillStyle = '#ffd23f';
          g.fillRect(r.x, r.y + r.h - 1, r.w, 1);
        }
        const icon = f === 'starred' ? STAR_ICON_W : 0;
        if (icon) drawStar(g, r.x + 5, r.y + 2, on || plays.some((p) => this.starred.has(p.id)));
        text(g, chipLabel(f), r.x + (r.w + icon) / 2, r.y + 2, { align: 'center', color: on ? '#ffd23f' : '#8fa0b8', shadow: false });
      });
      if (!cards.length) {
        text(g, 'NO STARRED PLAYS ON THIS TAB', VIEW_W / 2, CARD_Y0 + 40, { size: 8, align: 'center', color: '#ffffff' });
        text(g, 'A/D: PICK A FORMATION. CLICK THE STAR ON A CARD TO SAVE IT HERE.', VIEW_W / 2, CARD_Y0 + 56, {
          align: 'center', color: '#8fa0b8', shadow: false,
        });
      }
    }
    cards.forEach((c, i) => {
      if (c.kind === 'play') this.drawCard(g, c.def, i);
      else this.drawKickCard(g, c, i);
    });
    const pages = plays ? this.pageCount() : 1;
    const paging = pages > 1 ? `  W/S PAGE ${Math.min(this.page, pages - 1) + 1}/${pages}` : '';
    drawHint(
      g,
      plays
        ? `1-${cards.length} PLAY  Q/E TAB  A/D FORMATION${paging}  F FLIP${this.flipCall ? ' (ON)' : ''}`
        : tabs.length ? `CLICK A CARD OR 1-${cards.length}   Q/E: SWITCH TABS` : `CLICK A CARD OR 1-${cards.length}`,
    );
  }

  private cardFrame(g: CanvasRenderingContext2D, i: number, title: string, sub: string, subColor = '#8fa0b8') {
    const r = cardRect(i);
    const hot = this.hover === i;
    g.fillStyle = hot ? '#24324a' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = hot ? '#ffd23f' : this.user.colors.primary;
    g.fillRect(r.x, r.y, r.w, 2);
    text(g, `${i + 1} ${title.toUpperCase()}`, r.x + 6, r.y + 5, { color: hot ? '#ffd23f' : '#ffffff' });
    text(g, sub, r.x + 6, r.y + 15, { color: subColor, shadow: false });
    return r;
  }

  /** Kick card: unit and distance, plus a side-on sketch of the kick's flight shape. */
  private drawKickCard(g: CanvasRenderingContext2D, c: Exclude<Card, { kind: 'play' }>, i: number): void {
    if (c.kind === 'twoPt') {
      const r = this.cardFrame(g, i, '2-Pt Try', 'ANY PLAY FROM THE 3');
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(r.x + 40, r.y + 34, r.w - 80, 40);
      g.fillStyle = this.cpu.colors.primary;
      g.fillRect(r.x + r.w - 70, r.y + 34, 30, 40);
      text(g, '+2', r.x + r.w / 2 - 14, r.y + 46, { size: 16, align: 'center', color: '#ffd23f' });
      return;
    }
    const d = c.def;
    let sub = d.unit === 'punt' ? 'PUNT' : d.unit === 'kickoff' ? 'KICKOFF' : 'FROM THE 3, 20 YARDS';
    let subColor = '#8fa0b8';
    if (d.unit === 'fg') {
      const yds = fgDistance(this.drive.los, OPP_GOAL);
      sub = `${yds}-YARD ATTEMPT${yds > FG_RANGE_HINT ? '  LONG!' : ''}`;
      if (yds > FG_RANGE_HINT) subColor = '#ff9a5a';
    }
    const r = this.cardFrame(g, i, d.name, sub, subColor);
    // Flight sketch: distance across, height up, same scale for every card.
    let pts = this.kickSketch.get(d.id);
    if (!pts) {
      const kicker = this.userRoster[d.unit === 'punt' ? 'P' : 'K'];
      const from = { x: 0, y: 26, z: d.unit === 'punt' ? 1 : 0.1 };
      const power = d.unit === 'kickoff' && d.id !== 'ko-squib' ? 1 : d.id === 'pooch' || d.id === 'ko-sky' ? 0.6 : 0.85;
      pts = predictKick(from, { power, dir: { x: 1, y: 0 }, loft: d.loft }, kicker.r.kpw, CALM, d.bounce, d.unit === 'kickoff').pts;
      this.kickSketch.set(d.id, pts);
    }
    const x0 = r.x + 12;
    const y0 = r.y + r.h - 8;
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(x0, y0, r.w - 24, 1);
    g.fillStyle = d.directional ? '#ff9f43' : '#5ce1ff';
    for (let k = 0; k < pts.length; k += 2) {
      const p = pts[k];
      const sx = x0 + p.x * 2.3;
      if (sx > r.x + r.w - 8) break;
      g.fillRect(Math.round(sx), Math.round(y0 - p.z * 1.4), 1, 1);
    }
    text(g, `LOFT ${d.loft}`, r.x + r.w - 6, r.y + 6, { align: 'right', color: '#5d6b80', shadow: false });
  }

  private drawCard(g: CanvasRenderingContext2D, p: PlayDef, i: number): void {
    const r = cardRect(i);
    const hot = this.hover === i;
    g.fillStyle = hot ? '#24324a' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = hot ? '#ffd23f' : this.user.colors.primary;
    g.fillRect(r.x, r.y, r.w, 2);
    text(g, `${i + 1} ${p.name.toUpperCase()}`, r.x + 6, r.y + 5, { color: hot ? '#ffd23f' : '#ffffff' });
    text(g, `${p.formation.name.toUpperCase()}  ${personnelOf(p.formation)}`, r.x + 6, r.y + 15, { color: '#8fa0b8', shadow: false });

    const sb = starRect(r);
    drawStar(g, sb.x + 3, sb.y + 2, this.starred.has(p.id), inRect(this.callMouse.x, this.callMouse.y, sb));
    drawMiniPlay(g, p, { x: r.x + 8, y: r.y + 25, w: r.w - 18, h: r.h - 28 }, this.flipCall);
  }

  private renderTitle(g: CanvasRenderingContext2D): void {
    const user = TEAMS[this.userIdx];
    const cpu = TEAMS[this.cpuIdx];
    if (!this.crowd) this.crowd = makeCrowd(user, cpu);
    drawField(g, this.cam, user, cpu, this.crowd);
    g.fillStyle = 'rgba(8,10,14,0.72)';
    g.fillRect(0, 0, VIEW_W, 360);
    text(g, 'SATURDAY GRIDIRON', VIEW_W / 2, 40, { size: 24, align: 'center', color: '#ffd23f', shadow: '#7a3e14' });
    text(g, 'COLLEGE FOOTBALL  -  GAMEPLAY MVP', VIEW_W / 2, 76, { size: 8, align: 'center', color: '#cfd6df' });

    this.drawTeamPanel(g, user, 160, 'YOUR TEAM', 'A/D TEAM  W/S CONF', true);
    this.drawTeamPanel(g, cpu, 480, 'OPPONENT', 'ARROW KEYS', false);
    text(g, 'VS', VIEW_W / 2, 196, { size: 16, align: 'center', color: '#ffffff' });
    const qMin = QUARTER_OPTIONS[this.qIdx];
    text(g, `<  ${QUARTER_LABELS[this.qIdx]}: ${qMin}:00 QUARTERS, ~${QUARTER_DRIVES[this.qIdx]} DRIVES  >   (Q / E)`, VIEW_W / 2, 270, { align: 'center', color: '#9ad7ff' });
    text(g, `NEW SEASON: ${LENGTH_LABEL[LENGTH_OPTIONS[this.lengthIdx]]} (L)   INJURIES: ${INJURY_OPTIONS[this.injuryIdx].toUpperCase()} (I)`, VIEW_W / 2, 283, {
      align: 'center', color: '#8fa0b8', shadow: false,
    });

    if (Math.floor(this.titleTime * 2) % 2 === 0) {
      text(g, 'PRESS ENTER TO KICK OFF', VIEW_W / 2, 300, { size: 8, align: 'center', color: '#ffffff' });
    }
    text(g, `R / T: ROSTERS   N: NEW SEASON${this.season || this.savedSeason ? '   C: CONTINUE SEASON' : ''}`, VIEW_W / 2, 316, {
      size: 8, align: 'center', color: '#9ad7ff',
    });
    text(g, 'DRAG + RELEASE TO PASS.  R-CLICK HAND OFF.  WASD MOVE.  SHIFT SPRINT.', VIEW_W / 2, 334, {
      size: 8, align: 'center', color: '#8fa0b8',
    });
  }

  private drawTeamPanel(g: CanvasRenderingContext2D, t: Team, cx: number, label: string, keys: string, home: boolean): void {
    text(g, label, cx, 108, { align: 'center', color: '#8fa0b8' });
    const spr = getSprite(teamUniform(t, home), '#c68a5e', 'stand', home ? 1 : -1);
    g.drawImage(spr, cx - 40, 124, 80, 88);
    text(g, '<', cx - 70, 164, { size: 16, align: 'center', color: '#ffd23f' });
    text(g, '>', cx + 70, 164, { size: 16, align: 'center', color: '#ffd23f' });
    text(g, t.school.toUpperCase(), cx, 210, { size: t.school.length > 13 ? 8 : 12, align: 'center', color: '#ffffff' });
    text(g, `< ${t.conference.toUpperCase()} >`, cx, 226, { align: 'center', color: '#9ad7ff' });
    const r = teamRatings(buildSquad(t));
    text(g, `OVR ${r.ovr}  OFF ${r.off}  DEF ${r.def}`, cx, 240, { align: 'center', color: '#cfd6df' });
    text(g, keys, cx, 256, { align: 'center', color: '#5d6b80', shadow: false });
  }
}
