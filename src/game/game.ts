import { disguiseName, pickDefCall, pickDisguise, rushers, type DefCall, type DefTags, type Disguise } from '../data/defenses';
import { clockOut, goForTwo, tempo as situationTempo, type Situation } from './situation';
import { defIdentity, pickLineGame, preventLevel, situationMix, sticks } from '../data/identity';
import { FORMATIONS, LEGACY, PLAY_TABS, PLAYBOOK, playsOfKind, type PlayDef } from '../data/plays';
import { ocBook, ocStyle, STYLES } from '../data/offStyles';
import { KICKOFF_CALLS, kickDef, ST_TAB, type KickDef, type ReturnScheme } from '../data/specialTeams';
import { clutchRoster, confLabel, lateAndClose, leverage, shakenAimLag, unitEdge } from '../data/confidence';
import { athleteName, buildSquad, lineupOf, onField, reorderPosition, starters, teamConf, withLineup, type Lineup, type Squad } from '../data/depth';
import { changedSlots, nextManUp, sideOf, subCandidates, substitute, type SubSide } from './lineup';
import { drawSubs, drawSubsChip, newSubsView, setSubsTab, slotAt as slotAt0, slotLabel, SUB_ROWS, subRowAt as subRowAt0, SUBS_CHIP, SUBS_DONE, subsTabRect, type SubsView } from '../render/subsScreen';
import type { Athlete } from '../data/athletes';
import { POSITIONS } from '../data/positions';
import { CONFERENCES } from '../data/fbs/profile';
import { DEF_SLOTS, teamById, TEAMS, type RosterPlayer, type Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL, STEP, VIEW_H, VIEW_W } from '../engine/constants';
import type { Input } from '../engine/input';
import { audioPrefs, audioRunning, setAudioPref, type AudioPrefs } from '../engine/audio';
import { music, type MusicMode } from '../engine/music';
import { preloadSfx, sfx } from '../engine/sfx';
import { armClick, noteHit, takeClick, tracked } from '../engine/clicks';
import { CREDITS } from '../data/audio';
import { crowd as stadium } from './crowd';
import { fieldSounds } from './sounds';
import { hashString, mulberry32, type Rng, type Vec3 } from '../engine/math';
import {
  creditCpuDrive, creditUserFg, creditUserSnap, finishLiveBox, liveGamePlays, newLiveBox, storyAgainst, storyCpuDrive, storyUserEnd, storyUserPoints,
  storyUserSnap, userCredit, type LiveBox, type SnapAt, type UserSnap,
} from '../season/liveBox';
import { loadReel, TitleReel } from './titleReel';
import { newRecorder, pickReel, recordFrame, TAPE, tapeScore, type Tape, type TapeRecorder } from './tape';
import { drawGame, GAME_TABS, gameReelAt as gameReelAt0, gameScrollMax, gameTabAt as gameTabAt0, type GameView, type ReelThumb } from '../render/gameScreen';
import { drawField, makeCrowd } from '../render/field';
import { drawBanner, drawClutch, drawHint, drawPlayClock, drawScorebug, drawTempo } from '../render/hud';
import { drawKickPlay, drawWind } from '../render/kickRenderer';
import { drawLines, drawPlay, type RunAssist } from '../render/renderer';
import { drawRoster, rosterPages } from '../render/rosterScreen';
import {
  BOOK_PAGE, BOOK_TABS, bookCardAt as bookCardAt0, bookCardRect, bookPages, bookPlays, bookTabAt as bookTabAt0, drawPlaybook, STAR_BTN, starRect, type BookOwner, type BookView,
} from '../render/playbookScreen';
import { drawMiniPlay, drawStar } from '../render/playDiagram';
import { AUDIBLE_PAGE, AUDIBLE_TABS, audibleCardRect, audiblePage, drawAudible, type AudibleKind, type AudibleView } from '../render/audibleOverlay';
import {
  drawSeason, DECIDE_BTN, navAt as navAt0, navItems, newSeasonView, newsMaxScroll, REPLAY_BTN, STORIES_BTN, storiesMaxScroll, storyAt as storyAt0, PLAY_KEYS_BTN, playMenuRect, primaryAction, PRIMARY_BTN, SIM_BTN, SUB_NEXT, SUB_PANELS, SUB_PREV,
  type NavItem, type SeasonView,
} from '../render/seasonScreen';
import {
  drawAudioSettings, drawBackdrop, drawExhibition, drawMainMenu, drawNewTeam, drawSettings, drawSlots, GO_BTN, SIM_GAME_BTN, menuRect, PANEL_CONF_Y, PANEL_TEAM_Y, settingArrows, settingRect,
  slotConfirmRects, slotDeleteRect, slotRect, type MenuItem, type SettingRow, type SlotsView,
} from '../render/menuScreen';
import {
  drawRecruit, FILTER_BTN, GROUP_CHIPS, groupChipRect, holdEditable, newRecruitView, RECRUIT_ACTIONS, RECRUIT_ADVANCE, RECRUIT_ROWS, RECRUIT_TABS, recruitActionRect,
  recruitRowRect, recruitRows, recruitTabAt as recruitTabAt0, SEARCH_FILTERS, type RecruitView,
} from '../render/recruitScreen';
import { addToBoard, dropFromBoard, inHome, releasable, setHold, staffFill, toggleOffer, toggleTop, toggleVisit, portalHold } from '../season/recruiting';
import { prospect } from '../data/recruits';
import { careerList, careerRowAt as careerRowAt0, careerTabAt as careerTabAt0, modeAt as modeAt0, newCareerView } from '../render/careerScreen';
import { beginLinks, linkAt as linkAt0, overLink, type Link } from '../render/links';
import { drawProgram, programScrollMax, programTabAt as programTabAt0, programTabCount, PROGRAM_TABS, type ProgramView } from '../render/programScreen';
import { alumniCaptures, newAlumniView, updateAlumni } from '../render/alumniScreen';
import { drawOffice, OFFICE_TABS, officeScrollMax, officeTabAt as officeTabAt0, type OfficeView } from '../render/officeScreen';
import { achievement, levelOf, newRoom, roomName, sampleOffice, seeOffice } from '../season/achievements';
import { ROOMS } from '../data/office';
import { drawPrep, maxScroll, PREP_TABS, prepCardRect, prepTabAt as prepTabAt0, STAFF_ROLES, staffOptionRect, staffRowRect, type PrepView } from '../render/prepScreen';
import { groupEmphases, STANDARD } from '../data/emphasis';
import { buildStaff, coachName, dcAdjust, GROUPS, ocAdjust, type Coach, type Group } from '../data/coaches';
import { scoutReport } from '../season/scouting';
import { DEPTH_BTN, depthView, drawTeam, dropIndex, fullMove, inBox as inBox0, rowAt as rowAt0, tabAt as tabAt0, type TeamView } from '../render/teamScreen';
import { deleteSlot, freeSlot, latestSlot, loadSlot, saveSlot, slotMeta, SLOTS } from '../season/save';
import { advanceWeek, defaultConfig, engineTeam, newSeason, seasonOver, simSeason, userGameThisWeek } from '../season/season';
import { lastWeekMoments, markSeen, unseenWrap } from '../season/moments';
import { decide, pendingDecisions, storyOf } from '../season/storylines';
import { decisionAt as decisionAt0, drawWrap, newWrapView, sceneDur, type WrapView } from '../render/momentScreen';
import { galleryMoments } from '../render/momentGallery';
import { engineGame, enginePart, isEngineSnap, type EngineTeamIn, type SnapWatch } from '../season/engineGame';
import type { InjuryLevel, SeasonConfig } from '../season/types';
import { advanceOffseason, migrateOffseason, simOffseason, startOffseason } from '../season/offseason';
import { actOnLeaving, offer, pursue, releaseForPortal, setTarget, withdraw } from '../season/portal';
import { fireAssistant, interview, offerChair, withdrawOffer } from '../season/carousel';
import {
  CAROUSEL_ADVANCE, CAROUSEL_ROWS, CAROUSEL_TABS, carouselActionRect, carouselRowRect, carouselTabAt as carouselTabAt0, chairChipRect, drawCarousel, hiringRows,
  leagueRows, newCarouselView, openChairs, staffRows, type CarouselView,
} from '../render/carouselScreen';
import {
  actionRect, ADVANCE_BTN, BOARD_ROWS, boardRows, chipRect, drawPortal, LEAVING_ROWS, leavingRows, newPortalView, PORTAL_TABS, portalTabAt as portalTabAt0, POS_CHIPS,
  rowRect, type PortalView,
} from '../render/portalScreen';
import {
  departureRowCount, DEPARTURE_ROWS, DEPARTURE_TABS, DEPARTURES_ADVANCE, departuresRowRect, departuresTabAt as departuresTabAt0, drawDepartures, MEET_BTN,
  newDeparturesView, watchRows, type DeparturesView,
} from '../render/departuresScreen';
import { meetOnWatch } from '../season/departures';
import { autoGamePlan, setUserDepth, useStaffDepth } from '../season/staff';
import { loadStarred, toggleStar } from './starred';
import { squadFor, staffFor } from '../season/world';
import { mergeFilm, rosterRead } from './offModel';
import { driveStream, engineDrive, engineTry, type EngineDrive, type EngineSide, type EngineSnap } from './engineDrive';
import { newOcBrain, ocAdjustments, ocHalftime, type OcBrain } from './ocBrain';
import { offIdentity } from '../data/offIdentity';
import { adjustments, anticFor, callFor, checkFor, recheckFor, releanFor, lastRead, halftime as brainHalftime, headline, laneOf, ourLine, teamSmarts, leansFor, newBrain, newDrive, observe, type DefBrain, type DefenseIq } from './defBrain';
import { successful } from '../season/grades';
import { SCOUT_TIERS } from '../season/scouting';
import { driveLog } from '../season/simGame';
import { engineCredit } from '../season/cast';
import { newStory, type DriveCredit, type GameStory, type StoryDrive } from '../season/story';
import type { DriveLog, GameResult, KeyLevel, Moment, OfficeState, SeasonGame, SeasonState } from '../season/types';
import type { SimPlay as LiveSimPlay } from './rules';
import { cueShow, drawShow, drawShowStill, keyShow, prefetchShow, showFocus, updateShow, type KeyShow, type ShowCtx } from './highlights';
import { WATCH_LEVELS, KEY_TITLE, keyLevels, pickDrive, pickGame, type KeyPlay } from './keyPlays';
import { CALM, fgDistance, predictKick, type Wind } from '../sim/kicking';
import { text, textWidth } from '../render/text';
import {
  adminStop, advanceSim, afterPlay, clockText, inOvertime, inTwoMinute, mmss, newClock, nextQuarter, penaltySpot, playClockText,
  DEFAULT_QUARTER, QUARTER_DRIVES, QUARTER_LABELS, QUARTER_OPTIONS, quarterName, readyForPlay, runoffAtSnap, snapClock, tickBetween, tickLive,
  timeLeftInHalf, KNEEL_SECS, SPIKE_SECS, type Clock, type Tempo,
} from './clock';
import { KickPlay } from './kickPlay';
import { AUTO_INPUT } from './autopilot';
import { CpuKicker, forecast, kickoffCall, puntCall, returnCall, windAlong, type KickContext, type KickForecast } from './cpuKicker';
import { KICKOFF_FROM, kickCaption, kickoffRun, puntRun, returnerOf, SAFETY_KICK_FROM, type EngineKick, type KickRun } from './engineKick';
import { HARD_COUNT, Play } from './playState';
import { personnelOf, resolvePlay } from './resolvePlay';
import {
  applyKick, applyOutcome, applyTry, downDistance, fieldLabel, movesChains, OVERTIME, PAT, xpOdds, startDrive, userStartAfter,
  type Applied, type Drive, type DriveClock, type KickOutcome, type PlayOutcome, type SimPlay,
} from './rules';
import { newWind, nextQuarterWind, windLabel } from './wind';

type Screen = 'title' | 'exhibition' | 'slots' | 'newTeam' | 'newSettings' | 'settings' | 'roster' | 'season' | 'team' | 'program' | 'office' | 'playbook' | 'prep' | 'portal' | 'carousel' | 'departures' | 'recruit' | 'call' | 'play' | 'kick' | 'notice' | 'final' | 'game' | 'wrap' | 'audio';

/**
 * What the call screen offers: the full playbook, the choice after a touchdown,
 * the playbook for a two-point try, or kickoff calls.
 */
type CallMode = 'normal' | 'pat' | 'try' | 'kickoff';

type Card = { kind: 'play'; def: PlayDef } | { kind: 'kick'; def: KickDef } | { kind: 'twoPt' } | { kind: 'kneel' } | { kind: 'spike' };

/** The clock plays' tips on the call screen. */
const CLOCK_TIP = { kneel: 'Victory formation: take a knee. The clock keeps running.', spike: 'Spike it: stops the clock, costs a down.' };

/** NCAA kickoffs are from the kicking team's 35. */
const KICKOFF_LINE = OWN_GOAL + 35;
/** Field goal attempts longer than this get flagged on the card. */
const FG_RANGE_HINT = 55;
/** Injury settings for a new season, as I cycles them. */
const INJURY_OPTIONS: InjuryLevel[] = ['normal', 'light', 'off'];

const KEY_LABELS = ['LEAN', 'NORMAL', 'FULL'];

/** A play's name for the DC's lines. */
const playName = (id: string) => (PLAYBOOK.find((p) => p.id === id)?.name ?? id).toUpperCase();

/** How much the CPU defense learns your offense in a game (game/defBrain.ts). */
const IQ_OPTIONS: DefenseIq[] = ['STATIC', 'NORMAL', 'SHARP'];
/** Daylight for the runner (render/renderer.ts): always, until the handoff, or never. */
const ASSIST_OPTIONS: RunAssist[] = ['FULL', 'LIGHT', 'OFF'];
const READ_OPTIONS: NonNullable<SeasonConfig['readHelp']>[] = ['FULL', 'SHELL', 'OFF'];
const WRAP_OPTIONS: NonNullable<SeasonConfig['wrap']>[] = ['all', 'big', 'off'];

/**
 * The dynasty settings, one row each: its options, the one picked first for a new dynasty, what it
 * sets, and which option a dynasty has now (the hub's SETTINGS page). A new setting is one more entry.
 */
const SETTINGS: {
  label: string; help: string; options: string[]; start: number; apply: (c: SeasonConfig, i: number) => void; read: (c: SeasonConfig) => number;
  /** Set when the dynasty starts: shown on the hub's page, but fixed. */
  newOnly?: boolean;
}[] = [
  {
    label: 'INJURIES', help: 'HOW OFTEN PLAYERS GET HURT', options: INJURY_OPTIONS.map((o) => o.toUpperCase()), start: 0,
    apply: (c, i) => (c.injuries = INJURY_OPTIONS[i]),
    read: (c) => INJURY_OPTIONS.indexOf(c.injuries ?? 'normal'),
  },
  {
    label: 'GAME LENGTH', help: 'QUARTER LENGTH IN THE GAMES YOU PLAY',
    options: QUARTER_OPTIONS.map((q, i) => `${QUARTER_LABELS[i]} ${q}:00`), start: QUARTER_OPTIONS.indexOf(DEFAULT_QUARTER),
    apply: (c, i) => (c.quarter = QUARTER_OPTIONS[i]),
    read: (c) => Math.max(0, QUARTER_OPTIONS.indexOf(c.quarter ?? DEFAULT_QUARTER)),
  },
  {
    label: 'SIM GAMES', help: 'SIMULATED GAMES AND QUARTERS: THE RESULT, THE KEY PLAYS, OR EVERY SNAP',
    options: ['RESULT ONLY', ...KEY_LABELS, 'EVERY SNAP'], start: 0,
    apply: (c, i) => (c.keyPlays = { ...c.keyPlays, sim: WATCH_LEVELS[i] }),
    read: (c) => WATCH_LEVELS.indexOf(keyLevels(c).sim),
  },
  {
    label: 'CPU DRIVES', help: 'IN GAMES YOU PLAY: A SUMMARY, THE KEY PLAYS OF EACH CPU DRIVE, OR EVERY SNAP',
    options: ['SUMMARY', ...KEY_LABELS, 'EVERY SNAP'], start: 2,
    apply: (c, i) => (c.keyPlays = { ...c.keyPlays, defense: WATCH_LEVELS[i] }),
    read: (c) => WATCH_LEVELS.indexOf(keyLevels(c).defense),
  },
  {
    label: 'DEFENSE IQ', help: 'HOW MUCH THE CPU DEFENSE LEARNS YOUR OFFENSE DURING A GAME',
    options: IQ_OPTIONS, start: 1,
    apply: (c, i) => (c.defIq = IQ_OPTIONS[i]),
    read: (c) => IQ_OPTIONS.indexOf(c.defIq ?? 'NORMAL'),
  },
  {
    label: 'RUN ASSIST', help: 'LANES SHOWN TO THE RUNNER: ALWAYS, UNTIL THE HANDOFF, OR NEVER',
    options: ASSIST_OPTIONS, start: 0,
    apply: (c, i) => (c.runAssist = ASSIST_OPTIONS[i]),
    read: (c) => ASSIST_OPTIONS.indexOf(c.runAssist ?? 'FULL'),
  },
  {
    label: 'KICKS', help: 'PUNTS AND KICKOFFS: WATCH THEM (SPACE SKIPS), OR JUMP TO THE RESULT',
    options: ['WATCH', 'RESULT ONLY'], start: 0,
    apply: (c, i) => (c.kicks = i === 1 ? 'result' : 'watch'),
    read: (c) => (c.kicks === 'result' ? 1 : 0),
  },
  {
    label: 'SLOW AIM', help: 'SLOW MOTION WHILE AIMING A PASS',
    options: ['OFF', 'ON'], start: 0,
    apply: (c, i) => (c.aimSlow = i === 1),
    read: (c) => (c.aimSlow ? 1 : 0),
  },
  {
    label: 'DISGUISES', help: 'THE CPU DEFENSE SHOWS ONE COVERAGE AND SPINS TO ANOTHER AT THE SNAP',
    options: ['ON', 'OFF'], start: 0,
    apply: (c, i) => (c.disguises = i === 0),
    read: (c) => (c.disguises === false ? 1 : 0),
  },
  {
    label: 'READ HELP', help: 'THE PRESNAP READ OVER THE FIELD: THE WHOLE LOOK, THE SHELL ONLY, OR NOTHING',
    options: READ_OPTIONS, start: 0,
    apply: (c, i) => (c.readHelp = READ_OPTIONS[i]),
    read: (c) => READ_OPTIONS.indexOf(c.readHelp ?? 'FULL'),
  },
  {
    label: 'WEEK WRAP', help: 'AFTER EACH WEEK: ALL ITS MOMENTS, THE BIG ONES, OR NONE',
    options: WRAP_OPTIONS.map((o) => o.toUpperCase()), start: 1,
    apply: (c, i) => (c.wrap = WRAP_OPTIONS[i]),
    read: (c) => WRAP_OPTIONS.indexOf(c.wrap ?? 'big'),
  },
  {
    label: 'HISTORY', help: 'REAL PROGRAM HISTORY TO 2025, OR EVERY TEAM STARTS FROM NOTHING',
    options: ['REAL', 'FRESH START'], start: 0, newOnly: true,
    apply: (c, i) => (c.history = i === 1 ? 'fresh' : 'real'),
    read: (c) => (c.history === 'fresh' ? 1 : 0),
  },
];

/** PLAY GAME's choices: the quarter the user takes over in (1 plays the whole game). */
const PLAY_FROM = [1, 2, 3, 4];

interface Notice {
  title: string;
  sub: string;
  extra: string;
  color?: string;
  /** Scorebug state when the notice was queued (later notices may already have advanced the clock and score). */
  clock?: string;
  score?: { user: number; cpu: number };
  /** A key play shown on the field in place of the banner (game/highlights.ts). */
  show?: KeyShow;
  /** A line over the banner: the user's DC on a CPU drive. */
  note?: string;
}

/** The receiving team's look, as the kick HUD names it. */
function lookText(unit: string, ret: ReturnScheme): string {
  if (ret === 'block') return 'THEY SHOW: PUNT BLOCK, NINE COMING';
  if (ret === 'safe') return 'THEY SHOW: SAFE, NOBODY RUSHING';
  if (ret === 'hands') return 'THEY SHOW: THE HANDS TEAM';
  return unit === 'punt' ? 'THEY SHOW: A RETURN' : 'THEY SHOW: A RETURN, FRONT LINE BACK';
}

/** Seconds the receivers' look is on screen before the CPU kicker snaps the punt or approaches the ball. */
const KICK_SHOW = 0.9;

/** Slow motion while the QB (or a punter) aims, when the SLOW AIM setting is on. */
const AIM_TIME_SCALE = 0.65;
/** The share of the screen a postgame highlight's thumbnail shows, around the ball. */
const REEL_CROP = 0.42;
/**
 * A called run is played zoomed in from the huddle to the whistle: the camera spreads the field `x`
 * times along and `y` times across (sprites keep their size, so the line comes apart), and the snap
 * runs at `slow` speed (game clock included) so the blocks can be read.
 */
const RUN_ZOOM = { x: 1.3, y: 1.9, slow: 0.7 };

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

/**
 * Filter chips for one playbook tab: the user's starred plays, then each personnel package the tab uses.
 * A package is what the defense sees come on the field (`lookOf` keys on it, and an audible can't change
 * it), so the book is grouped the way a coach calls it: pick the personnel, then the play. Within a
 * package, plays go formation by formation (`FORMATIONS` order).
 */
type Chip = string;

const PACKAGES: { pers: string; label: string }[] = [
  { pers: '10', label: '10 4-WIDE' },
  { pers: '11', label: '11 3-WIDE' },
  { pers: '20', label: '20 SPLIT' },
  { pers: '12', label: '12 2-TE' },
  { pers: '21', label: '21 2-BACK' },
  { pers: '22', label: '22 HEAVY' },
];

function chipsFor(plays: PlayDef[]): Chip[] {
  return ['starred', ...PACKAGES.filter((k) => plays.some((p) => personnelOf(p.formation) === k.pers)).map((k) => k.pers)];
}

/** A package's plays, formation by formation. */
function packagePlays(plays: PlayDef[], pers: string): PlayDef[] {
  return plays.filter((p) => personnelOf(p.formation) === pers).map((p, i) => ({ p, i })).sort((a, b) => FORMATIONS.indexOf(a.p.formation) - FORMATIONS.indexOf(b.p.formation) || a.i - b.i).map((e) => e.p);
}

const chipLabel = (f: Chip) => (f === 'starred' ? 'STARRED' : PACKAGES.find((k) => k.pers === f)?.label ?? `${f} PERS`);

/** Room the chip row has, leaving the arrows at each end. */
const CHIP_ROOM = VIEW_W - 40;

/** The chips shown: all of them if they fit, else the widest run around `at` that does. */
export function chipWindow(widths: number[], gap: number, at: number): [number, number] {
  const span = (lo: number, hi: number) => widths.slice(lo, hi + 1).reduce((a, b) => a + b, 0) + gap * (hi - lo);
  if (span(0, widths.length - 1) <= CHIP_ROOM) return [0, widths.length - 1];
  let lo = at;
  let hi = at;
  for (let grew = true; grew; ) {
    grew = false;
    if (hi + 1 < widths.length && span(lo, hi + 1) <= CHIP_ROOM) { hi++; grew = true; }
    if (lo > 0 && span(lo - 1, hi) <= CHIP_ROOM) { lo--; grew = true; }
  }
  return [lo, hi];
}
/** Room for the star icon in front of the STARRED label. */
const STAR_ICON_W = 10;

function tabRect(i: number, n: number) {
  const x0 = (VIEW_W - (n * TAB_W + (n - 1) * 4)) / 2;
  return { x: x0 + i * (TAB_W + 4), y: TAB_Y, w: TAB_W, h: TAB_H };
}

/** Hit tests: each reports to engine/clicks.ts, so a click's sound plays only on a hit. */
function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return noteHit(x, y, x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
}
const bookCardAt = tracked(bookCardAt0);
const bookTabAt = tracked(bookTabAt0);
const careerRowAt = tracked(careerRowAt0);
const careerTabAt = tracked(careerTabAt0);
const carouselTabAt = tracked(carouselTabAt0);
const decisionAt = tracked(decisionAt0);
const departuresTabAt = tracked(departuresTabAt0);
const gameReelAt = tracked(gameReelAt0);
const gameTabAt = tracked(gameTabAt0);
const linkAt = tracked(linkAt0);
const modeAt = tracked(modeAt0);
const navAt = tracked(navAt0);
const officeTabAt = tracked(officeTabAt0);
const portalTabAt = tracked(portalTabAt0);
const prepTabAt = tracked(prepTabAt0);
const programTabAt = tracked(programTabAt0);
const recruitTabAt = tracked(recruitTabAt0);
const rowAt = tracked(rowAt0);
const slotAt = tracked(slotAt0);
const storyAt = tracked(storyAt0);
const subRowAt = tracked(subRowAt0);
const tabAt = tracked(tabAt0);
const inBox = tracked(inBox0);

export class Game {
  private screen: Screen = 'title';
  private userIdx = Math.max(0, TEAMS.findIndex((t) => t.id === 'georgia'));
  private cpuIdx = Math.max(0, TEAMS.findIndex((t) => t.id === 'alabama'));
  /** Roster screen: whose roster and which page. */
  private rosterIdx = 0;
  private rosterPage = 0;
  private qIdx = QUARTER_OPTIONS.indexOf(DEFAULT_QUARTER);
  /** Main menu: the highlighted item. */
  private menuSel = 0;
  /** The SOUND page (the title's SETTINGS, or V on the hub's): its row, and the screen it goes back to. */
  private audioSel = 0;
  private audioBack: Screen = 'title';
  /** Last step's screen, toast and hover, for the sounds of what changed (`sounds`). */
  private lastScreen: Screen = 'title';
  private lastToast: unknown = undefined;
  private lastHover = false;
  /** The final's stinger has played for this game. */
  private finalSung = false;
  private audioLoaded = false;
  /** The dynasty save slots, and the slot being played (1 to `SLOTS`; 0 outside a dynasty). */
  private slotsView: SlotsView = { sel: 0, confirm: -1, loading: -1, mx: 0, my: 0 };
  private slot = 0;
  /** A new dynasty: its school, the settings rows' picks, and the highlighted row. */
  private newTeamIdx = this.userIdx;
  private settingIdx = SETTINGS.map((r) => r.start);
  private settingSel = 0;
  /** Mouse on the menus, for hover, and whether it moved this step. */
  private menuMouse = { x: 0, y: 0 };
  private mouseMoved = false;
  private user!: Team;
  private cpu!: Team;
  /** The two squads in this game: the season's (injuries, the user's depth chart) in a season game. */
  private userSquad!: Squad;
  private cpuSquad!: Squad;
  private userRoster!: Record<string, RosterPlayer>;
  private cpuRoster!: Record<string, RosterPlayer>;
  /** The user's squad as it came into the game; `userSquad` is it with `lineup` laid over (game/lineup.ts, docs/SUBS.md). */
  private baseUserSquad!: Squad;
  /** Who the user has in each slot this game, and who's done for the day. */
  private lineup: Lineup = {};
  private outForGame = new Set<string>();
  /** The subs panel on the call screen, while it's open. */
  private subs: SubsView | null = null;
  /** The lineup when the huddle formed, for the panel's changed slots, and a line about the last change for the scorebug. */
  private huddleLineup: Lineup = {};
  private subNote: string | null = null;
  /** The offense subbed this snap: the defense gets to match, so no hurry-up until it's snapped. */
  private subHold = false;
  /** The current snap's leverage (data/confidence.ts), logged with it for the grades. */
  private snapLev = 0;
  private crowd: HTMLCanvasElement | null = null;
  /** The title screen's highlight reel, once loaded (null: missing, the still field instead). */
  private titleReel: TitleReel | null = null;
  private reelAsked = false;
  /** The two teams the menus' crowd was painted for. */
  private crowdKey = '';
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
  /** The kicker on the user's punts and kickoffs (the user calls them; field goals and extra points stay the user's). */
  private kicker: CpuKicker | null = null;
  /** The kick is being run to the whistle (SPACE, or the KICKS: RESULT ONLY setting). */
  private kickFast = false;
  /** The CPU's look on the user's punt or kickoff, and the user's ST coach's call against it. */
  private kickLook: ReturnScheme = 'return';
  private kickTip: string | null = null;
  /** The user's onside kicks this game (the CPU's hands team stays alert for another). */
  private onsides = 0;
  /** Each kick card's forecast for this snap (`forecast`). */
  private kickCast = new Map<string, KickForecast>();
  private callMode: CallMode = 'normal';
  /**
   * Overtime on the field (null in regulation): who has the ball first in the odd periods (the toss
   * loser; the winner defers) and whose possession of the period this is. The period is the clock's
   * quarter past the 4th.
   */
  private ot: { userFirst: boolean; turn: 0 | 1 } | null = null;
  private wind: Wind = CALM;
  private windQuarter = 1;
  /** Side-profile flight sketches for the kick cards, by kick id. */
  private kickSketch = new Map<string, Vec3[]>();
  private defCall: DefCall | null = null;
  private press: Record<string, boolean> = {};
  /** The CPU defense's in-game learning (null at STATIC), its tags on this snap, and its newest line for the user. */
  private brain: DefBrain | null = null;
  private defTags: DefTags = {};
  /** The look the CPU defense shows this snap, if it's disguising its call. */
  private disguise: Disguise | null = null;
  /** Hard counts the user has left this drive (`HARD_COUNT.perDrive`). */
  private hardCountsLeft = HARD_COUNT.perDrive;
  private dcNote: string | null = null;
  /** The presnap check: whether this snap has had its chance (an audible keeps the defense), and the line if it checked. */
  private checkDone = false;
  private checkNote: string | null = null;
  /** This snap's defenders' anticipation and leans (re-read after a shift), whether an audible shifted, and the play's flip. */
  private snapAntic: Partial<Record<string, number>> | undefined;
  private snapReads: ReturnType<typeof leansFor> | undefined;
  private snapShifted = false;
  private snapFlip = false;
  /** The audible picker over the field (Esc before the snap): its tab, page and the card under the mouse. */
  private audibleOpen = false;
  private audTab = 0;
  private audPage = 0;
  private audHover = -1;
  private exhibitionIq: DefenseIq = 'NORMAL';
  private exhibitionAssist: RunAssist = 'FULL';
  private exhibitionAimSlow = false;
  private applied: Applied | null = null;
  private notices: Notice[] = [];
  /** Where the game goes once the notice queue is empty. */
  private afterNotices: 'call' | 'final' | 'kickoff' | 'pat' | 'game' | 'cpuKick' = 'call';
  /** The CPU's punt or kickoff to the user, played live after the notices (`startCpuKick`), and the one on the field. */
  private pendingCpuKick: { unit: 'punt' | 'kickoff'; yard: number } | null = null;
  private cpuKick: { run: KickRun; unit: 'punt' | 'kickoff'; yard: number; result: EngineKick | null; banner: { title: string; line: string } | null } | null = null;
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
  /** The home team on the field (`setupField`), which wears the home kit. */
  private homeId = '';
  /** A season game's drives for the progression grades: the user's snaps and kicks first, then each CPU drive. */
  private liveDrives: DriveLog[] | null = null;
  /**
   * The CPU's possessions, played through the engine (docs/ENGINEDRIVES.md, Phase 3): its offense and the
   * user's defense as the engine plays them, the user's DC learning their offense, and their OC learning
   * the user's defense.
   */
  private cpuOff: EngineSide | null = null;
  private userDef: EngineSide | null = null;
  private userDc: DefBrain | null = null;
  private cpuOc: OcBrain | null = null;
  /** The two teams as the key plays show them. */
  private showCtx: ShowCtx | null = null;
  /** Key plays for the CPU's drives in an exhibition (K on its setup screen). */
  private exhibitionKeys: KeyLevel = 'normal';
  /** A season game's box score and story, built as it's played (season/liveBox.ts). */
  private liveBox: LiveBox | null = null;
  /** Where the user's snap now in play falls in the game, from its snap. */
  private snapAt: SnapAt | null = null;
  /** The user's last snap or kick as the story has it, for a score the defense makes on it. */
  private lastSnap: LiveSimPlay | null = null;
  /** The snap now in play on tape, and the best tapes this game (game/tape.ts). */
  private tapeRec: TapeRecorder | null = null;
  private tapes = new Map<LiveSimPlay, { tape: Tape; score: number }>();
  /** The game page (render/gameScreen.ts). */
  private gameView?: GameView;
  /** The game a SIM GAME with key plays is showing, for its page after the final. */
  private watchGame: string | null = null;
  /** Watching a simulated game's key plays: the result is already in the season. */
  private watchOnly = false;
  private seasonView: SeasonView = newSeasonView();
  /** The Week Wrap, or a replay of moments (render/momentScreen.ts). */
  private wrapView?: WrapView;
  /** Where the wrap returns when it closes (missing: the hub). */
  private wrapBack?: () => void;
  private teamView: TeamView = { pos: 0, sel: 0, drag: null, mx: 0, my: 0 };
  private programView?: ProgramView;
  /** Where Esc goes from a program page: the screen it was opened from, or the program page before. */
  private programBack: ({ screen: Screen } | { view: ProgramView } | { game: GameView })[] = [];
  private bookView: BookView = { tab: 1, page: 0, open: null, flip: false, mx: 0, my: 0 };
  private prepView: PrepView = { tab: 0, scroll: 0, page: 0, sel: 0, mx: 0, my: 0, report: null };
  private portalView: PortalView = { tab: 0, chip: 0, sel: 0, top: 0, mx: 0, my: 0, note: '' };
  private carouselView: CarouselView = newCarouselView();
  private departuresView: DeparturesView = { tab: 0, sel: 0, top: 0, mx: 0, my: 0, note: '' };
  private recruitView: RecruitView = { tab: 0, chip: 0, filter: 1, sel: 0, top: 0, mx: 0, my: 0, note: '' };
  /** Starred play ids: the playbook page sets them, the call screen's STARRED chip shows them. */
  private starred = loadStarred();
  /** The user's book for this game: his OC's (`data/offStyles.ts`). */
  private book: readonly PlayDef[] = LEGACY;
  /** Mouse on the call screen, for the cards' star hover. */
  private callMouse = { x: 0, y: 0 };
  private debug = false;
  private t = 0;
  private officeView: OfficeView = { tab: 0, scroll: 0, mx: 0, my: 0 };
  /** The office's unlocks already announced, per dynasty (an office carried into the next season keeps its count). */
  private officeWatch?: { season: SeasonState; office?: OfficeState; rev: number; tier: number };
  /** "NEW IN YOUR OFFICE" toasts, shown one at a time off the field. */
  private toasts: { title: string; sub: string; until?: number }[] = [];

  /** On the field: a play, a kick, the call screen, a notice or the final. */
  private inGame(): boolean {
    return this.screen === 'call' || this.screen === 'play' || this.screen === 'kick' || this.screen === 'notice' || this.screen === 'final';
  }

  /** The READ HELP setting: the dynasty's in a season game; exhibitions show the whole read. */
  private readHelp(): NonNullable<SeasonConfig['readHelp']> {
    return this.seasonGame && this.season ? this.season.config.readHelp ?? 'FULL' : 'FULL';
  }

  /** The SLOW AIM setting: the dynasty's in a season game, the exhibition's otherwise. */
  private aimSlow(): boolean {
    return this.seasonGame && this.season ? this.season.config.aimSlow ?? false : this.exhibitionAimSlow;
  }

  /** The exhibition setup's options line, one segment per key (clicks pick a segment). */
  private exhibitionOptions(): string[] {
    return [
      `DRIVES: ${this.exhibitionKeys === 'off' ? 'SUMMARY' : this.exhibitionKeys === 'all' ? 'EVERY SNAP' : this.exhibitionKeys.toUpperCase()} (K)`,
      `IQ: ${this.exhibitionIq} (I)`,
      `ASSIST: ${this.exhibitionAssist} (L)`,
      `SLOW AIM: ${this.exhibitionAimSlow ? 'ON' : 'OFF'} (M)`,
    ];
  }

  timeScale(): number {
    const slow = this.aimSlow();
    if (slow && this.screen === 'play' && this.play?.aim) return AIM_TIME_SCALE;
    if (this.screen === 'play' && this.play?.playDef.kind === 'run' && this.play.phase !== 'presnap' && this.play.phase !== 'over') return RUN_ZOOM.slow;
    if (slow && this.screen === 'kick' && this.kick?.aim && this.kick.unit === 'punt') return AIM_TIME_SCALE;
    return 1;
  }

  update(dt: number, input: Input): void {
    this.t += dt;
    this.mouseMoved = input.mouse.x !== this.menuMouse.x || input.mouse.y !== this.menuMouse.y;
    this.menuMouse = { x: input.mouse.x, y: input.mouse.y };
    if (input.mouse.pressed) armClick(input.mouse.x, input.mouse.y);
    if (input.hit('F1', 'Backquote')) this.debug = !this.debug;
    this.watchOffice();
    switch (this.screen) {
      case 'title':
        this.updateTitle(input, dt);
        break;
      case 'exhibition':
        this.updateExhibition(input);
        break;
      case 'slots':
        this.updateSlots(input);
        break;
      case 'newTeam':
        this.updateNewTeam(input);
        break;
      case 'newSettings':
        this.updateNewSettings(input);
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
      case 'program':
        this.updateProgram(input);
        break;
      case 'office':
        this.updateOffice(input);
        break;
      case 'game':
        this.updateGame(dt, input);
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
        if (this.notices[0]?.show) this.updateShows(dt, input);
        else if (input.hit('Space', 'Enter') || input.mouse.pressed) this.nextNotice();
        break;
      case 'final':
        if (input.hit('Space', 'Enter') || input.mouse.pressed) {
          if (this.seasonGame) {
            this.finishSeasonGame();
          } else if (this.watchOnly) {
            this.watchOnly = false;
            // A season's SIM GAME goes to its game page; a simulated exhibition back to its setup.
            if (this.watchGame) this.toGame(this.watchGame, true);
            else this.screen = 'exhibition';
            this.watchGame = null;
          } else this.screen = 'exhibition';
        }
        break;
      case 'settings':
        this.updateDynastySettings(input);
        break;
      case 'wrap':
        this.updateWrap(dt, input);
        break;
      case 'audio':
        this.updateAudio(input);
        break;
    }
    this.sounds(input);
    if (this.inGame() && this.clock.quarter !== this.windQuarter) {
      this.windQuarter = this.clock.quarter;
      this.wind = nextQuarterWind(this.wind, this.rng);
    }
    this.cam.update(dt);
  }

  // ------------------------------------------------------------ main menu

  private menuItems(): MenuItem[] {
    const items: MenuItem[] = [];
    const last = latestSlot();
    const m = last ? slotMeta(last) : null;
    if (m) items.push({ id: 'continue', label: `CONTINUE: ${teamById(m.teamId).school.toUpperCase()}`.slice(0, 32), desc: `${m.year}  ${m.phase}`.slice(0, 32) });
    items.push({ id: 'dynasty', label: 'DYNASTY', desc: 'BUILD A PROGRAM OVER SEASONS' });
    items.push({ id: 'exhibition', label: 'EXHIBITION', desc: 'PICK TWO TEAMS AND KICK OFF' });
    items.push({ id: 'sound', label: 'SETTINGS', desc: 'SOUND AND CREDITS' });
    return items;
  }

  /** Back to the main menu (from the hub, or the setup screens). */
  private toTitle(): void {
    this.screen = 'title';
    this.menuSel = 0;
  }

  private updateTitle(input: Input, dt: number): void {
    if (!this.reelAsked) {
      this.reelAsked = true;
      void loadReel().then((r) => (this.titleReel = r));
    }
    this.titleReel?.update(dt);
    const items = this.menuItems();
    const n = items.length;
    const m = input.mouse;
    if (input.hit('KeyW', 'ArrowUp')) this.menuSel = (this.menuSel + n - 1) % n;
    if (input.hit('KeyS', 'ArrowDown')) this.menuSel = (this.menuSel + 1) % n;
    this.menuSel = Math.min(this.menuSel, n - 1);
    // The mouse picks an item when it moves onto it, so the keys still work with it resting there.
    const hover = items.findIndex((_, i) => inRect(m.x, m.y, menuRect(i)));
    if (hover >= 0 && (this.mouseMoved || m.pressed)) this.menuSel = hover;
    const go = input.hit('Enter', 'Space') || (m.pressed && hover >= 0);
    if (!go) {
      this.cam.follow(32, 0.5);
      return;
    }
    const item = items[this.menuSel];
    if (item.id === 'continue') this.openSlot(latestSlot());
    else if (item.id === 'sound') this.toAudio('title');
    else if (item.id === 'dynasty') {
      this.screen = 'slots';
      const last = latestSlot();
      this.slotsView = { sel: Math.max(0, (last || freeSlot() || 1) - 1), confirm: -1, loading: -1, mx: m.x, my: m.y };
    } else this.screen = 'exhibition';
  }

  // ------------------------------------------------------------ sound

  private toAudio(back: Screen): void {
    this.audioBack = back;
    this.audioSel = 0;
    this.screen = 'audio';
  }

  private audioRows(): { label: string; value: number; help: string; key: keyof AudioPrefs }[] {
    const p = audioPrefs();
    return [
      { key: 'music', label: 'MUSIC', value: p.music, help: 'THE SOUNDTRACK IN THE MENUS AND THE HUB' },
      { key: 'sfx', label: 'EFFECTS', value: p.sfx, help: 'CLICKS, HITS, WHISTLES AND STINGERS' },
      { key: 'crowd', label: 'CROWD', value: p.crowd, help: 'THE STADIUM ON GAME DAY' },
    ];
  }

  /** The SOUND page: W/S picks a row, A/D (or its arrows) sets it; changes save at once. */
  private updateAudio(input: Input): void {
    const m = input.mouse;
    if (input.hit('Escape', 'Backspace', 'Enter', 'Space') || (m.pressed && inRect(m.x, m.y, GO_BTN))) {
      this.screen = this.audioBack;
      return;
    }
    const rows = this.audioRows();
    const n = rows.length;
    if (input.hit('KeyW', 'ArrowUp')) this.audioSel = (this.audioSel + n - 1) % n;
    if (input.hit('KeyS', 'ArrowDown')) this.audioSel = (this.audioSel + 1) % n;
    const change = (i: number, d: number) => {
      setAudioPref(rows[i].key, rows[i].value + d);
      // A taste of the new level on the effects rows.
      if (rows[i].key !== 'music') sfx('toggle');
    };
    if (input.hit('KeyA', 'ArrowLeft')) change(this.audioSel, -1);
    if (input.hit('KeyD', 'ArrowRight')) change(this.audioSel, 1);
    if (m.pressed) {
      for (let i = 0; i < n; i++) {
        if (!inRect(m.x, m.y, settingRect(i))) continue;
        this.audioSel = i;
        const a = settingArrows(i);
        if (inRect(m.x, m.y, a.prev)) change(i, -1);
        else if (inRect(m.x, m.y, a.next)) change(i, 1);
      }
    }
  }

  /**
   * Every step, after the screen's update: the music's mode, the stadium, the field's sounds
   * (game/sounds.ts) and the menus' clicks. Display only: nothing here touches game state.
   */
  private sounds(input: Input): void {
    const scr = this.screen;
    const prev = this.lastScreen;
    this.lastScreen = scr;
    if (audioRunning() && !this.audioLoaded) {
      this.audioLoaded = true;
      preloadSfx();
      stadium.preload();
    }
    const onField = this.inGame();
    const menu = scr === 'title' || scr === 'exhibition' || scr === 'slots' || scr === 'newTeam' || scr === 'newSettings' || scr === 'roster' || (scr === 'audio' && this.audioBack === 'title');
    const mode: MusicMode = onField ? 'silent' : menu ? 'theme' : 'hub';
    music.setMode(mode);
    music.update();
    if (onField) stadium.start();
    else stadium.stop();
    // The field: what's on screen, with whose ball it is and whose stadium.
    const userHome = !!this.user && this.homeId === this.user.id;
    const show = scr === 'notice' ? this.notices[0]?.show : undefined;
    if (scr === 'play') fieldSounds.play(this.play, { userBall: true, userHome, down: this.drive.down });
    else if (show?.play) fieldSounds.play(show.play, { userBall: show.userBall, userHome });
    else fieldSounds.play(null, { userBall: true, userHome });
    if (scr === 'kick') fieldSounds.kick(this.kick, { userBall: true, userHome });
    else if (show?.kick) fieldSounds.kick(show.kick, { userBall: show.userBall, userHome });
    else fieldSounds.kick(null, { userBall: true, userHome });
    fieldSounds.update();
    if (scr === 'final' && !this.finalSung) {
      this.finalSung = true;
      sfx(this.score.user > this.score.cpu ? 'jingleWin' : 'jingleLoss', { delay: 0.3 });
    } else if (scr !== 'final') this.finalSung = false;
    // The office's toasts, as each one shows (off the field and out of the wrap).
    if (!onField && scr !== 'wrap') {
      const t = this.toasts[0];
      if (t && t !== this.lastToast) sfx('jingleUnlock');
      this.lastToast = t;
    }
    // The menus: keys and clicks. The field's own keys (and the wrap, which has its own) stay quiet.
    if (scr === 'play' || scr === 'kick' || scr === 'wrap' || prev === 'play' || prev === 'kick') {
      this.lastHover = false;
      return;
    }
    // A click sounds only when it hit something: a button, tab, card, row or link (engine/clicks.ts),
    // a click that changed the screen, or a screen where a click anywhere goes on.
    const clicked = takeClick() || (input.mouse.pressed && (scr !== prev || scr === 'notice' || scr === 'final' || scr === 'roster'));
    if (input.hit('Escape', 'Backspace')) sfx('back');
    else if (input.hit('Enter', 'Space') || clicked || input.hit('Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9')) sfx('select');
    else if (input.hit('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Tab')) sfx('nav');
    else if (input.mouse.wheel) sfx('scroll');
    else if (scr !== prev && input.anyHit()) sfx('select');
    const hover = overLink();
    if (hover && !this.lastHover) sfx('hover');
    this.lastHover = hover;
  }

  // ------------------------------------------------------------ exhibition

  private updateExhibition(input: Input): void {
    const nq = QUARTER_OPTIONS.length;
    if (input.hit('Escape', 'Backspace')) {
      this.toTitle();
      return;
    }
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
    const cycleKeys = () => (this.exhibitionKeys = WATCH_LEVELS[(WATCH_LEVELS.indexOf(this.exhibitionKeys) + 1) % WATCH_LEVELS.length]);
    if (input.hit('KeyK')) cycleKeys();
    const cycleIq = () => (this.exhibitionIq = IQ_OPTIONS[(IQ_OPTIONS.indexOf(this.exhibitionIq) + 1) % IQ_OPTIONS.length]);
    if (input.hit('KeyI')) cycleIq();
    const cycleAssist = () => (this.exhibitionAssist = ASSIST_OPTIONS[(ASSIST_OPTIONS.indexOf(this.exhibitionAssist) + 1) % ASSIST_OPTIONS.length]);
    if (input.hit('KeyL')) cycleAssist();
    const toggleAim = () => (this.exhibitionAimSlow = !this.exhibitionAimSlow);
    if (input.hit('KeyM')) toggleAim();
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
      if (y >= PANEL_TEAM_Y[0] && y < PANEL_TEAM_Y[1]) {
        if (user) this.userIdx = this.stepTeam(this.userIdx, d, this.cpuIdx);
        else this.cpuIdx = this.stepTeam(this.cpuIdx, d, this.userIdx);
      } else if (y >= PANEL_CONF_Y[0] && y < PANEL_CONF_Y[1]) {
        if (user) this.userIdx = this.stepConference(this.userIdx, d, this.cpuIdx);
        else this.cpuIdx = this.stepConference(this.cpuIdx, d, this.userIdx);
      } else if (y >= 262 && y < 280) {
        this.qIdx = (this.qIdx + (x < VIEW_W / 2 ? nq - 1 : 1)) % nq;
      } else if (y >= 280 && y < 290) {
        // The options line's four segments, centered: which one the click lands in.
        const segs = this.exhibitionOptions();
        const gap = 2 * 8;
        let at = VIEW_W / 2 - (segs.reduce((n, s) => n + s.length * 8, 0) + gap * (segs.length - 1)) / 2;
        const hit = segs.findIndex((s) => x < (at += s.length * 8 + gap) - gap / 2);
        [cycleKeys, cycleIq, cycleAssist, toggleAim][hit < 0 ? segs.length - 1 : hit]();
      } else if (inRect(x, y, GO_BTN)) {
        this.startGame();
        return;
      } else if (inRect(x, y, SIM_GAME_BTN)) {
        this.simExhibition();
        return;
      }
    }
    if (input.hit('KeyX')) {
      this.simExhibition();
      return;
    }
    if (input.hit('Enter', 'Space')) this.startGame();
    this.cam.follow(32, 0.5);
  }

  // ------------------------------------------------------------ dynasty slots

  /** Load a slot's dynasty and open its hub. The save loads in the background; the card shows LOADING. */
  private openSlot(slot: number): void {
    if (!slot || this.slotsView.loading >= 0) return;
    this.slotsView.loading = slot - 1;
    void loadSlot(slot).then((s) => {
      this.slotsView.loading = -1;
      if (!s) return;
      // A save from before the portal moved ahead of signing day opens on the portal.
      if (migrateOffseason(s)) saveSlot(slot, s);
      this.season = s;
      this.slot = slot;
      this.toSeason();
    });
  }

  private updateSlots(input: Input): void {
    const v = this.slotsView;
    const m = input.mouse;
    v.mx = m.x;
    v.my = m.y;
    if (v.loading >= 0) return;
    if (v.confirm >= 0) {
      const c = slotConfirmRects(v.confirm);
      if (input.hit('Enter') || (m.pressed && inRect(m.x, m.y, c.yes))) {
        deleteSlot(v.confirm + 1);
        v.confirm = -1;
      } else if (input.hit('Escape', 'Backspace') || (m.pressed && !inRect(m.x, m.y, c.yes))) v.confirm = -1;
      return;
    }
    if (input.hit('Escape', 'Backspace')) {
      this.toTitle();
      return;
    }
    if (input.hit('KeyA', 'ArrowLeft')) v.sel = (v.sel + SLOTS - 1) % SLOTS;
    if (input.hit('KeyD', 'ArrowRight')) v.sel = (v.sel + 1) % SLOTS;
    let go = input.hit('Enter', 'Space');
    if (m.pressed) {
      const i = Array.from({ length: SLOTS }, (_, k) => k).find((k) => inRect(m.x, m.y, slotRect(k)));
      if (i !== undefined) {
        v.sel = i;
        if (slotMeta(i + 1) && inRect(m.x, m.y, slotDeleteRect(i))) {
          v.confirm = i;
          return;
        }
        go = true;
      }
    }
    if (input.hit('Delete') && slotMeta(v.sel + 1)) {
      v.confirm = v.sel;
      return;
    }
    if (!go) return;
    if (slotMeta(v.sel + 1)) this.openSlot(v.sel + 1);
    else {
      this.slot = v.sel + 1;
      this.newTeamIdx = this.userIdx;
      this.screen = 'newTeam';
    }
  }

  /** Choosing the new dynasty's school: A/D within the conference, W/S the conference. */
  private updateNewTeam(input: Input): void {
    const m = input.mouse;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'slots';
      return;
    }
    if (input.hit('KeyA', 'ArrowLeft')) this.newTeamIdx = this.stepTeam(this.newTeamIdx, -1, -1);
    if (input.hit('KeyD', 'ArrowRight')) this.newTeamIdx = this.stepTeam(this.newTeamIdx, 1, -1);
    if (input.hit('KeyW', 'ArrowUp')) this.newTeamIdx = this.stepConference(this.newTeamIdx, -1, -1);
    if (input.hit('KeyS', 'ArrowDown')) this.newTeamIdx = this.stepConference(this.newTeamIdx, 1, -1);
    let next = input.hit('Enter', 'Space');
    if (m.pressed) {
      const d = m.x < VIEW_W / 2 ? -1 : 1;
      if (m.y >= PANEL_TEAM_Y[0] && m.y < PANEL_TEAM_Y[1]) this.newTeamIdx = this.stepTeam(this.newTeamIdx, d, -1);
      else if (m.y >= PANEL_CONF_Y[0] && m.y < PANEL_CONF_Y[1]) this.newTeamIdx = this.stepConference(this.newTeamIdx, d, -1);
      else if (inRect(m.x, m.y, GO_BTN)) next = true;
    }
    if (!next) return;
    this.settingIdx = SETTINGS.map((r) => r.start);
    this.settingSel = 0;
    this.screen = 'newSettings';
  }

  /** `hub`: a started dynasty, where the settings fixed at the start can't change. */
  private settingRows(hub = false): SettingRow[] {
    return SETTINGS.map((r, i) => ({ label: r.label, value: r.options[this.settingIdx[i]], help: hub && r.newOnly ? 'SET WHEN THE DYNASTY STARTED: IT CAN\'T CHANGE NOW' : r.help }));
  }

  /** The new dynasty's settings: W/S or a click picks a row, A/D or the picked row's arrows change it; Enter starts the dynasty. */
  private updateNewSettings(input: Input): void {
    const m = input.mouse;
    if (input.hit('Escape', 'Backspace')) {
      this.screen = 'newTeam';
      return;
    }
    const n = SETTINGS.length;
    if (input.hit('KeyW', 'ArrowUp')) this.settingSel = (this.settingSel + n - 1) % n;
    if (input.hit('KeyS', 'ArrowDown')) this.settingSel = (this.settingSel + 1) % n;
    const change = (row: number, d: number) => {
      const k = SETTINGS[row].options.length;
      this.settingIdx[row] = (this.settingIdx[row] + d + k) % k;
    };
    if (input.hit('KeyA', 'ArrowLeft')) change(this.settingSel, -1);
    if (input.hit('KeyD', 'ArrowRight')) change(this.settingSel, 1);
    let start = input.hit('Enter', 'Space');
    if (m.pressed) {
      if (inRect(m.x, m.y, GO_BTN)) start = true;
      for (let i = 0; i < n; i++) {
        if (!inRect(m.x, m.y, settingRect(i))) continue;
        // A click picks the card (its help shows); only the arrows of the picked card change it.
        const picked = this.settingSel === i;
        this.settingSel = i;
        if (!picked) continue;
        const a = settingArrows(i);
        if (inRect(m.x, m.y, a.prev)) change(i, -1);
        else if (inRect(m.x, m.y, a.next)) change(i, 1);
      }
    }
    if (!start) return;
    const config: SeasonConfig = { ...defaultConfig(TEAMS[this.newTeamIdx].id), length: 'open' };
    SETTINGS.forEach((r, i) => r.apply(config, this.settingIdx[i]));
    this.userIdx = this.newTeamIdx;
    this.season = newSeason(config, (Math.random() * 2 ** 31) >>> 0);
    this.save();
    this.toSeason();
  }

  /** Save the dynasty in progress to its slot. */
  private save(): void {
    if (this.season && this.slot) saveSlot(this.slot, this.season);
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
    if (input.hit('Escape', 'Enter', 'Backspace')) this.screen = 'exhibition';
  }

  /** Put two teams on the field: squads, rosters, crowd, and how the key plays show them. */
  private setupField(user: Team, cpu: Team, squads?: { user: Squad; cpu: Squad }, homeId = this.seasonGame?.home ?? user.id): void {
    this.user = user;
    this.cpu = cpu;
    this.baseUserSquad = squads?.user ?? buildSquad(user);
    this.userSquad = this.baseUserSquad;
    this.lineup = lineupOf(this.baseUserSquad);
    this.huddleLineup = this.lineup;
    this.outForGame = new Set();
    this.subs = null;
    this.subNote = null;
    this.subHold = false;
    this.cpuSquad = squads?.cpu ?? buildSquad(cpu);
    this.userRoster = onField(this.userSquad);
    this.cpuRoster = onField(this.cpuSquad);
    this.crowd = makeCrowd(this.user, this.cpu);
    this.crowdKey = '';
    const s = this.season;
    const own = this.seasonGame && s && !s.config.delegate.gamePlan ? s.teamState[user.id]?.plan : undefined;
    // A season game's home team wears the home kit on every snap and replay; in an exhibition, the user's team.
    this.homeId = homeId;
    const userHome = this.homeId === user.id;
    this.showCtx = {
      user, cpu, userSide: { team: user, roster: this.userRoster, home: userHome, dc: this.dcOf(user) }, cpuSide: { team: cpu, roster: this.cpuRoster, home: !userHome, dc: this.dcOf(cpu) },
      userPass: (own ?? autoGamePlan(this.userSquad, this.cpuSquad, this.ocOf(this.user))).passShare, cpuPass: autoGamePlan(this.cpuSquad, this.userSquad, this.ocOf(this.cpu)).passShare,
      userOc: { book: ocBook(this.ocOf(user)), style: ocStyle(this.ocOf(user)) }, cpuOc: { book: ocBook(this.ocOf(cpu)), style: ocStyle(this.ocOf(cpu)) },
    };
  }

  /** Kick off a game on the field; a season game can be simulated up to quarter `from` first (PLAY GAME's choices). */
  private startGame(user: Team = TEAMS[this.userIdx], cpu: Team = TEAMS[this.cpuIdx], squads?: { user: Squad; cpu: Squad }, from = 1): void {
    this.setupField(user, cpu, squads);
    this.notices = [];
    this.watchOnly = false;
    this.ot = null;
    this.score = { user: 0, cpu: 0 };
    // A dynasty's games use its own quarter length; exhibitions use the picker's.
    this.clock = newClock(this.seasonGame ? this.season?.config.quarter ?? DEFAULT_QUARTER : QUARTER_OPTIONS[this.qIdx]);
    this.tempo = 'normal';
    this.autoHurryQ = 0;
    this.drive = this.freshDrive(25);
    this.wind = newWind(this.rng);
    this.windQuarter = 1;
    this.kickSketch.clear();
    this.onsides = 0;
    this.tab = 0;
    this.liveDrives = this.seasonGame ? [{ off: user.id, plays: [] }] : null;
    // The box score is built as the game goes (exhibitions keep none). Its casting stream is its own.
    this.liveBox = this.seasonGame
      ? newLiveBox({ id: user.id, on: starters(this.userSquad) }, { id: cpu.id, on: starters(this.cpuSquad) }, mulberry32((Math.random() * 2 ** 31) >>> 0), {
        home: this.seasonGame.home, away: this.seasonGame.away,
      })
      : null;
    this.tapes.clear();
    this.tapeRec = null;
    this.lastSnap = null;
    const s = this.season;
    this.book = ocBook(this.ocOf(user));
    const dc = this.dcOf(cpu);
    const qbSpd = this.userRoster.QB?.r.spd ?? 70;
    this.brain = newBrain({
      iq: this.seasonGame && s ? s.config.defIq ?? 'NORMAL' : this.exhibitionIq,
      adjust: dcAdjust(dc), scout: dc.r.scout, qbMobility: Math.max(0, Math.min(1, (qbSpd - 70) / 20)), seed: (this.rng() * 2 ** 31) >>> 0,
      smarts: teamSmarts(DEF_SLOTS.map((sl) => this.cpuRoster[sl]?.r.prc ?? 60)),
      // What he knows before kickoff: the user's OC's book and style (public), and the user's roster.
      book: this.book, style: ocStyle(this.ocOf(user)), roster: rosterRead(this.userRoster),
      film: this.seasonGame && s ? s.teamState[user.id]?.film : undefined,
    });
    this.setupEngine();
    this.dcNote = null;
    if (from > 1 && this.seasonGame) this.simAhead(from);
    else {
      // The opening kickoff: the CPU kicks to the user (who kicks off the second half).
      this.pendingCpuKick = { unit: 'kickoff', yard: KICKOFF_FROM };
      this.startCpuKick();
    }
  }

  /** The key-play level for the CPU's drives in this game, or for simulated stretches. */
  private keyLevel(kind: 'sim' | 'defense'): KeyLevel {
    if (this.seasonGame || (this.watchOnly && this.watchGame)) return keyLevels(this.season?.config)[kind];
    // An exhibition: its DRIVES setting for both (a simulated exhibition is watched at it).
    return this.exhibitionKeys;
  }

  /**
   * Queue key plays to show, each on the field in its own notice: a snap the engine played (`watch`) as
   * its tape, with the call over it.
   */
  private queueShows(picks: KeyPlay[], watch?: SnapWatch): void {
    for (const k of picks) {
      const s = watch?.get(k.play);
      const opts = s?.tape ? { tape: s.tape, ...(isEngineSnap(s) ? { note: this.snapNote(s, k.drive.off === this.user.id) } : {}) } : {};
      this.notify({ title: '', sub: '', extra: '', show: keyShow(k, this.showCtx!, (Math.random() * 2 ** 31) >>> 0, opts) });
    }
  }

  /** The two sides of this game for the engine (`engineGame`, `enginePart`): the season's staffs and settings, or an exhibition's. */
  private engineTeams(): { user: EngineTeamIn; cpu: EngineTeamIn } {
    const s = this.season;
    const g = this.seasonGame;
    if (g && s) {
      const own = !s.config.delegate.gamePlan ? s.teamState[this.user.id]?.plan : undefined;
      const plan = own ?? autoGamePlan(this.userSquad, this.cpuSquad, this.ocOf(this.user));
      return {
        user: engineTeam(s, this.user.id, this.userSquad, plan),
        cpu: engineTeam(s, this.cpu.id, this.cpuSquad, autoGamePlan(this.cpuSquad, this.userSquad, this.ocOf(this.cpu))),
      };
    }
    const team = (t: Team, squad: Squad, opp: Squad): EngineTeamIn => {
      const st = buildStaff(t);
      return { squad, oc: st.OC, dc: st.DC, passShare: autoGamePlan(squad, opp, st.OC).passShare };
    };
    return { user: team(this.user, this.userSquad, this.cpuSquad), cpu: { ...team(this.cpu, this.cpuSquad, this.userSquad), iq: this.exhibitionIq } };
  }

  /**
   * Simulate the season game's first quarters through the engine (`enginePart`, on this game's clock)
   * until quarter `from`, show their key plays (on tape), and hand the field the score, the clock and the ball.
   */
  private simAhead(from: number): void {
    const g = this.seasonGame!;
    const story = newStory(g.home, g.away);
    // Through the engine, both sides; the user's DC, the CPU's DC and OC go on learning into the live part.
    const teams = this.engineTeams();
    const watch: SnapWatch = new Map();
    const r = enginePart(
      { ...teams.user, dcBrain: this.userDc }, { ...teams.cpu, dcBrain: this.brain, ocBrain: this.cpuOc }, g.home === this.user.id, this.clock.qSecs / 60, from, this.rng,
      { drives: this.liveDrives ?? undefined, story, watch, record: this.keyLevel('sim') !== 'off' },
    );
    // The simulated quarters' stats carry into the live box score.
    if (this.liveBox) {
      const uh = g.home === this.user.id;
      this.liveBox = newLiveBox(this.liveBox.user, this.liveBox.cpu, this.liveBox.user.cast, {
        home: g.home, away: g.away, story: r.story,
        from: { user: uh ? r.box.home : r.box.away, cpu: uh ? r.box.away : r.box.home, players: r.box.players },
      });
      for (const [p, a] of r.against) this.liveBox.against.set(p, a);
    }
    this.score = { user: r.user, cpu: r.cpu };
    this.clock.quarter = r.quarter;
    this.clock.time = r.time;
    adminStop(this.clock);
    this.queueShows(pickGame(story, this.keyLevel('sim')), watch);
    const to = ['', '', 'THE 2ND QUARTER', 'HALFTIME', 'THE 4TH QUARTER'][from];
    const summary = (extra: string) => this.notify({ title: `SIMULATED TO ${to}`, sub: this.scoreLine(), extra, color: '#9ad7ff' });
    switch (r.next.kind) {
      case 'user':
        this.drive = this.freshDrive(r.next.start);
        summary(`${r.next.mid ? 'Your drive goes on' : 'Your ball'} at the ${fieldLabel(this.drive.los)}  ${clockText(this.clock)}`);
        this.showNotices('call');
        return;
      case 'userKickoff':
        summary(`You kick off  ${clockText(this.clock)}`);
        this.showNotices('kickoff');
        return;
      case 'cpu':
        summary(`${this.cpu.abbr} ${r.next.mid ? 'drive goes on' : 'ball'}  ${clockText(this.clock)}`);
        this.cpuDrive(r.next.start);
        return;
      case 'halftime':
        this.halftime();
        return;
      default:
        this.showNotices('final');
    }
  }

  /**
   * SIM GAME with key plays on: the week is simulated (and saved) first, so the result is in
   * whatever happens next, then the user's game is shown from its story, ending on the final.
   */
  private watchSim(game: SeasonGame): void {
    const s = this.season!;
    const u = s.config.userTeamId;
    const opp = game.home === u ? game.away : game.home;
    // The squads as they took the field, before the week's injuries and progression.
    const squads = { user: squadFor(s, u), cpu: squadFor(s, opp) };
    const story = newStory(game.home, game.away);
    const level = keyLevels(s.config).sim;
    const watch: SnapWatch = new Map();
    advanceWeek(s, undefined, undefined, story, { snaps: watch, record: level !== 'off' });
    this.save();
    this.seasonGame = null;
    this.watchGame = game.id;
    this.setupField(teamById(u), teamById(opp), squads, game.home);
    this.showSimmed(story, game.result!, game.home === u, level, watch);
  }

  /**
   * The exhibition's SIM GAME: the whole game through the engine (`engineGame`), both sides' staffs, then
   * watched at the DRIVES level (EVERY SNAP plays them all), ending on the final.
   */
  private simExhibition(): void {
    this.seasonGame = null;
    this.watchGame = null;
    const user = TEAMS[this.userIdx];
    this.setupField(user, TEAMS[this.cpuIdx]);
    const teams = this.engineTeams();
    const story = newStory(user.id, this.cpu.id);
    const watch: SnapWatch = new Map();
    const r = engineGame(teams.user, teams.cpu, this.rng, { story, watch, record: this.exhibitionKeys !== 'off' });
    this.showSimmed(story, r, true, this.exhibitionKeys, watch);
  }

  /** Show a simulated game's plays at `level` (`watch`: its snaps on tape), then its final. */
  private showSimmed(story: GameStory, r: GameResult, userHome: boolean, level: KeyLevel, watch: SnapWatch): void {
    const u = this.user.id;
    this.watchOnly = true;
    this.notices = [];
    this.score = { user: userHome ? r.home : r.away, cpu: userHome ? r.away : r.home };
    this.ot = null;
    this.clock = newClock(15);
    // The final's clock: the 4th quarter, or the overtime period it ended in.
    this.clock.quarter = 4 + r.ot;
    this.clock.time = 0;
    this.drive = this.freshDrive(25);
    this.play = null;
    this.kick = null;
    this.applied = null;
    this.callMode = 'normal';
    this.cam.follow(OWN_GOAL + 50, 0.5);
    const picks = pickGame(story, level);
    this.queueShows(picks.filter((k) => k.drive.half < 2), watch);
    const firstOt = story.drives.find((d) => d.half >= 2);
    if (firstOt) {
      // Tied after four: say so before the overtime's plays.
      const tied = firstOt.score[u] ?? 0;
      this.notices.push({
        title: 'OVERTIME', sub: `${this.user.abbr} ${tied}  -  ${this.cpu.abbr} ${tied}`, extra: 'Tied at the end of regulation',
        color: '#9ad7ff', clock: 'OT', score: { user: tied, cpu: tied },
      });
    }
    this.queueShows(picks.filter((k) => k.drive.half >= 2), watch);
    this.showNotices('final');
  }

  /** On a key play: play it, Space to skip it, Esc to skip the rest. The next one searches meanwhile. */
  private updateShows(dt: number, input: Input): void {
    if (input.hit('Escape', 'Backspace')) {
      while (this.notices[0]?.show) this.notices.shift();
      if (!this.notices.length) this.finishNotices();
      return;
    }
    if (input.hit('Space', 'Enter') || input.mouse.pressed) {
      this.nextNotice();
      return;
    }
    const next = this.notices[1]?.show;
    if (next) prefetchShow(next);
    if (updateShow(this.notices[0].show!, dt)) this.nextNotice();
  }

  // ------------------------------------------------------------ season hub

  private toSeason(): void {
    this.screen = 'season';
    this.seasonView = newSeasonView();
    // A week just played: its moments first (season/moments.ts). With the wrap off they're just marked seen.
    const s = this.season;
    if (!s || (s.seenMoments ?? 0) >= (s.moments?.length ?? 0)) return;
    const list = unseenWrap(s);
    if (list.length) this.openWrap(list, false);
    else {
      markSeen(s);
      this.save();
    }
  }

  /**
   * Show moments one scene at a time: the Week Wrap, or a replay from HOME or STORYLINES. `back` is
   * where it returns (an offseason stage's reveal goes back to the offseason's screens).
   */
  openWrap(list: Moment[], replay: boolean, back?: () => void): void {
    if (!list.length) return;
    this.wrapView = newWrapView(list, replay);
    this.wrapBack = back;
    this.screen = 'wrap';
  }

  private closeWrap(): void {
    const s = this.season!;
    if (!this.wrapView?.replay) {
      markSeen(s);
      this.save();
    }
    this.wrapView = undefined;
    const back = this.wrapBack;
    this.wrapBack = undefined;
    if (back) back();
    else this.screen = 'season';
  }

  /**
   * The wrap: a click or Space finishes the scene's animation, then moves on; Esc goes home. A decision
   * waits for 1 or 2 (or a click on a side); Esc leaves it for HOME.
   */
  private updateWrap(dt: number, input: Input): void {
    const v = this.wrapView;
    const s = this.season;
    if (!v || !s) {
      this.screen = 'season';
      return;
    }
    v.t += dt;
    v.mx = input.mouse.x;
    v.my = input.mouse.y;
    const m = v.list[v.i];
    if (!m || input.hit('Escape', 'Backspace')) {
      if (m) sfx('back');
      this.closeWrap();
      return;
    }
    const d = m.kind === 'decision' ? storyOf(s, m)?.decision : undefined;
    if (d && d.chosen === undefined) {
      const i = input.hit('Digit1') ? 0 : input.hit('Digit2') ? 1 : input.mouse.pressed ? decisionAt(input.mouse.x, input.mouse.y) : -1;
      if (i >= 0 && d.options[i]) {
        decide(s, m.arc!, d.options[i].id);
        sfx('jingleDecide');
        this.save();
        v.t = Math.max(v.t, sceneDur(m));
      }
      return;
    }
    if (input.hit('Space', 'Enter', 'ArrowRight', 'KeyD') || input.mouse.pressed) {
      if (v.t < sceneDur(m)) {
        v.t = sceneDur(m) + 0.01;
        sfx('nav');
      } else if (++v.i >= v.list.length) {
        sfx('select');
        this.closeWrap();
      } else {
        sfx('swipe');
        v.t = 0;
      }
    }
  }

  /**
   * The hub's story controls: on HOME, M replays the week's moments, Y opens STORYLINES and Enter (or
   * the gold card) takes a waiting decision; on STORYLINES, a click replays a storyline's moments.
   * True when it handled the input.
   */
  private updateStories(input: Input): boolean {
    const s = this.season!;
    const v = this.seasonView;
    const m = input.mouse;
    const at = (b: { x: number; y: number; w: number; h: number }) => m.pressed && inRect(m.x, m.y, b);
    if (v.nav === 'STORYLINES') {
      if (m.wheel) v.scroll = Math.max(0, Math.min(storiesMaxScroll(s), v.scroll + m.wheel));
      // A name on a row is a link; the rest of the row replays the storyline.
      const st = m.pressed && !linkAt(m.x, m.y) ? storyAt(s, v, m.x, m.y) : undefined;
      if (st) {
        const ms = (s.moments ?? []).filter((x) => x.arc === st.id);
        this.openWrap(ms, true);
        return true;
      }
    }
    if (v.nav !== 'HOME') return false;
    const week = lastWeekMoments(s);
    if ((input.hit('KeyM') || at(REPLAY_BTN)) && week.length) {
      this.openWrap(week, true);
      return true;
    }
    if ((input.hit('KeyY') || at(STORIES_BTN)) && s.stories?.length) {
      Object.assign(v, { nav: 'STORYLINES', scroll: 0 });
      return true;
    }
    const pend = pendingDecisions(s)[0];
    if (pend && (input.hit('Enter') || at(DECIDE_BTN))) {
      const d = (s.moments ?? []).filter((x) => x.kind === 'decision' && x.arc === pend.id).pop();
      if (d) this.openWrap([d], true);
      return !!d;
    }
    return false;
  }

  /** Dev builds: one moment of every kind from the user's roster, to look at (`window.game.momentGallery()`). */
  momentGallery(): void {
    if (this.season) this.openWrap(galleryMoments(this.season), true);
  }

  /** Open a sidebar page. */
  private openPage(item: NavItem): void {
    if (item.off) return;
    // A page is its own screen: coming back from it lands on HOME, never on a page's item.
    Object.assign(this.seasonView, { nav: 'HOME', sub: 0, scroll: 0 });
    if (item.page === 'team') this.toTeam();
    else if (item.page === 'playbook') this.toBook();
    else if (item.page === 'prep') this.toPrep();
    else if (item.page === 'recruit') this.toRecruit();
    else if (item.page === 'program') this.toProgram(this.season!.config.userTeamId);
    else if (item.page === 'office') this.toOffice();
    else if (item.page === 'settings') this.toSettings();
  }

  /**
   * The hub: W/S or a click picks a sidebar item (panels show at once, Enter opens a page), A/D or
   * the header arrows step the panel's week, conference or poll, the hotkeys open pages, Space or the
   * big button runs the week's action, X sims.
   */
  private updateSeason(input: Input): void {
    const s = this.season!;
    const v = this.seasonView;
    const m = input.mouse;
    v.mx = m.x;
    v.my = m.y;
    if (v.playMenu !== undefined) {
      this.updatePlayMenu(input);
      return;
    }
    if (input.hit('Escape', 'Backspace')) {
      if (v.nav === 'STORYLINES') Object.assign(v, { nav: 'HOME', scroll: 0 });
      else this.toTitle();
      return;
    }
    if (this.updateStories(input)) return;
    const items = navItems(s);
    // W/S step through the panels only (HOME, SCHEDULE, then AROUND THE FBS); pages open by click or hotkey.
    const live = items.filter((it) => !it.off && !it.page);
    const select = (id: string) => {
      if (id !== v.nav) Object.assign(v, { nav: id, sub: 0, scroll: 0 });
    };
    const at = Math.max(0, live.findIndex((it) => it.id === v.nav));
    if (input.hit('KeyW', 'ArrowUp')) select(live[(at + live.length - 1) % live.length].id);
    if (input.hit('KeyS', 'ArrowDown')) select(live[(at + 1) % live.length].id);
    // A/D or the arrows: the week (newest first, so "next" is a smaller step back), conference or poll.
    if (SUB_PANELS.has(v.nav)) {
      const d = (input.hit('KeyD', 'ArrowRight') || (m.pressed && inRect(m.x, m.y, SUB_NEXT)) ? 1 : 0)
        - (input.hit('KeyA', 'ArrowLeft') || (m.pressed && inRect(m.x, m.y, SUB_PREV)) ? 1 : 0);
      if (d) {
        v.sub += v.nav === 'SCORES' || v.nav === 'NEWS' ? -d : d;
        v.scroll = 0;
      }
    }
    if (v.nav === 'NEWS') {
      const step = m.wheel * 3 + (input.hit('KeyE') ? 3 : 0) - (input.hit('KeyQ') ? 3 : 0);
      if (step) v.scroll = Math.max(0, Math.min(newsMaxScroll(s, v.sub), v.scroll + step));
    }
    const hot: Record<string, string> = { KeyT: 'team', KeyP: 'playbook', KeyO: 'prep', KeyH: 'program', KeyR: 'recruit', KeyC: 'office', KeyG: 'settings' };
    for (const [key, id] of Object.entries(hot)) {
      const it = items.find((x) => x.id === id);
      if (it && !it.off && input.hit(key)) {
        this.openPage(it);
        return;
      }
    }
    if (m.pressed) {
      const it = navAt(s, m.x, m.y);
      if (it && !it.off) {
        if (it.page) this.openPage(it);
        else select(it.id);
        return;
      }
      const link = linkAt(m.x, m.y);
      if (link) {
        this.followLink(link);
        return;
      }
    }
    const game = userGameThisWeek(s);
    const sim = input.hit('KeyX') || (!!game && m.pressed && inRect(m.x, m.y, SIM_BTN));
    const act = input.hit('Space') || (m.pressed && inRect(m.x, m.y, PRIMARY_BTN));
    if ((!act && !sim) || primaryAction(s).off) return;
    if (s.phase === 'offseason') {
      this.toOffseason();
      return;
    }
    if (seasonOver(s)) {
      // An open-ended season goes into its offseason, starting with the coaching carousel.
      if (s.config.length !== 'open') return;
      startOffseason(s);
      this.save();
      this.toOffseason();
      return;
    }
    if (game && !sim) {
      // Choose how much of it to play first.
      v.playMenu = 0;
      return;
    }
    if (game && keyLevels(s.config).sim !== 'off') {
      this.watchSim(game);
      return;
    }
    advanceWeek(s);
    this.save();
    this.toSeason();
  }

  /**
   * PLAY GAME's choices: the whole game, or simulate to the 2nd quarter, halftime or the 4th and
   * take over there. 1-4, W/S and Enter, or a click; K (or its line) cycles the simulated
   * stretch's key plays; Esc closes it.
   */
  private updatePlayMenu(input: Input): void {
    const s = this.season!;
    const v = this.seasonView;
    const m = input.mouse;
    const n = PLAY_FROM.length;
    if (input.hit('Escape', 'Backspace')) {
      v.playMenu = undefined;
      return;
    }
    if (input.hit('KeyW', 'ArrowUp')) v.playMenu = (v.playMenu! + n - 1) % n;
    if (input.hit('KeyS', 'ArrowDown')) v.playMenu = (v.playMenu! + 1) % n;
    if (input.hit('KeyK') || (m.pressed && inRect(m.x, m.y, PLAY_KEYS_BTN))) {
      const lv = keyLevels(s.config).sim;
      s.config.keyPlays = { ...s.config.keyPlays, sim: WATCH_LEVELS[(WATCH_LEVELS.indexOf(lv) + 1) % WATCH_LEVELS.length] };
      this.save();
      return;
    }
    let pick = -1;
    ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach((k, i) => {
      if (input.hit(k)) pick = i;
    });
    if (input.hit('Enter', 'Space')) pick = v.playMenu!;
    if (m.pressed) {
      const i = PLAY_FROM.findIndex((_, j) => inRect(m.x, m.y, playMenuRect(j)));
      if (i >= 0) pick = i;
    }
    const game = userGameThisWeek(s);
    if (pick < 0 || !game) return;
    v.playMenu = undefined;
    // Play it on the field; the final screen writes the result back.
    const u = s.config.userTeamId;
    const opp = game.home === u ? game.away : game.home;
    this.seasonGame = game;
    this.startGame(teamById(u), teamById(opp), { user: squadFor(s, u), cpu: squadFor(s, opp) }, PLAY_FROM[pick]);
  }

  // ------------------------------------------------------------ dynasty settings

  private toSettings(): void {
    const c = this.season!.config;
    this.settingIdx = SETTINGS.map((r) => Math.max(0, r.read(c)));
    this.settingSel = 0;
    this.screen = 'settings';
  }

  /** The hub's SETTINGS page: the new-dynasty rows, each change applied and saved at once. Enter or Esc goes back. */
  private updateDynastySettings(input: Input): void {
    const m = input.mouse;
    const c = this.season!.config;
    if (input.hit('Escape', 'Backspace', 'Enter', 'Space') || (m.pressed && inRect(m.x, m.y, GO_BTN))) {
      this.screen = 'season';
      return;
    }
    if (input.hit('KeyV')) {
      this.toAudio('settings');
      return;
    }
    const n = SETTINGS.length;
    if (input.hit('KeyW', 'ArrowUp')) this.settingSel = (this.settingSel + n - 1) % n;
    if (input.hit('KeyS', 'ArrowDown')) this.settingSel = (this.settingSel + 1) % n;
    const change = (row: number, d: number) => {
      if (SETTINGS[row].newOnly) return;
      const k = SETTINGS[row].options.length;
      this.settingIdx[row] = (this.settingIdx[row] + d + k) % k;
      SETTINGS[row].apply(c, this.settingIdx[row]);
      this.save();
    };
    if (input.hit('KeyA', 'ArrowLeft')) change(this.settingSel, -1);
    if (input.hit('KeyD', 'ArrowRight')) change(this.settingSel, 1);
    if (m.pressed) {
      for (let i = 0; i < n; i++) {
        if (!inRect(m.x, m.y, settingRect(i))) continue;
        // A click picks the card (its help shows); only the arrows of the picked card change it.
        const picked = this.settingSel === i;
        this.settingSel = i;
        if (!picked) continue;
        const a = settingArrows(i);
        if (inRect(m.x, m.y, a.prev)) change(i, -1);
        else if (inRect(m.x, m.y, a.next)) change(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ team page

  /** The roster, on a player's card if one is given. */
  private toTeam(id?: string): void {
    this.screen = 'team';
    this.teamView = { pos: 0, sel: 0, drag: null, mx: 0, my: 0 };
    const s = this.season!;
    const squad = squadFor(s, s.config.userTeamId);
    const a = id ? squad.athletes.find((x) => x.id === id) : undefined;
    if (!a) return;
    this.teamView.pos = POSITIONS.indexOf(a.pos);
    this.teamView.sel = Math.max(0, depthView(squad, a.pos).rows.findIndex((x) => x.id === id));
  }

  private setTeamPos(i: number): void {
    Object.assign(this.teamView, { pos: i, sel: 0, drag: null });
  }

  /** G or the header toggle: take the depth chart from the staff (starting from theirs), or hand it back. */
  private toggleStaffDepth(): void {
    const s = this.season!;
    if (s.config.delegate.depthChart) setUserDepth(s, { ...squadFor(s, s.config.userTeamId).depth });
    else useStaffDepth(s);
    this.save();
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
      this.toRegistry(view.rows[Math.min(v.sel, view.rows.length - 1)].id);
      return;
    }
    const rows = view.rows.length;
    if (input.hit('KeyW', 'ArrowUp')) v.sel = (v.sel + rows - 1) % rows;
    if (input.hit('KeyS', 'ArrowDown')) v.sel = (v.sel + 1) % rows;
    if (input.mouse.pressed) {
      const tab = tabAt(x, y);
      const row = rowAt(x, y, view);
      const link = linkAt(x, y);
      if (link?.kind === 'player') {
        // The name on the card: his page in the registry.
        this.toRegistry(link.id);
        return;
      }
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
    this.save();
  }

  // ------------------------------------------------------------ the coach's office

  private toOffice(): void {
    const s = this.season!;
    this.officeView = { tab: 0, scroll: 0, mx: 0, my: 0, moved: newRoom(s) };
    this.screen = 'office';
  }

  /** Leaving the office: what was new has been seen. */
  private leaveOffice(): void {
    const s = this.season!;
    if (!this.officeView.show) {
      seeOffice(s);
      this.save();
    }
    this.screen = 'season';
  }

  /** The office: Tab or the tabs switch OFFICE and LIST, a clicked item from this season opens its game, Esc goes back. In dev, Y toggles the showroom, [ ] step its room and L its items' level (top, mixed, then 1 up). */
  private updateOffice(input: Input): void {
    const s = this.season!;
    const v = this.officeView;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace', 'KeyC')) {
      this.leaveOffice();
      return;
    }
    if (input.hit('Tab')) Object.assign(v, { tab: (v.tab + 1) % OFFICE_TABS.length, scroll: 0 });
    if (import.meta.env.DEV) {
      if (input.hit('KeyY')) v.show = v.show ? undefined : { items: sampleOffice(s), tier: ROOMS.length - 1, level: Infinity };
      if (v.show && input.hit('KeyL')) {
        const lv = v.show.level === Infinity ? -1 : v.show.level === -1 ? 1 : v.show.level >= 7 ? Infinity : v.show.level + 1;
        Object.assign(v.show, { level: lv, items: sampleOffice(s, lv) });
      }
      if (v.show && input.hit('BracketLeft')) v.show.tier = Math.max(0, v.show.tier - 1);
      if (v.show && input.hit('BracketRight')) v.show.tier = Math.min(ROOMS.length - 1, v.show.tier + 1);
    }
    if (input.mouse.pressed) {
      const tab = officeTabAt(x, y);
      if (tab >= 0) {
        Object.assign(v, { tab, scroll: 0 });
        return;
      }
      const link = linkAt(x, y);
      if (link) {
        this.followLink(link);
        return;
      }
    }
    if (v.tab === 1) {
      const step = input.mouse.wheel + (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0);
      if (step) v.scroll = Math.max(0, Math.min(officeScrollMax(), v.scroll + step));
    }
  }

  /**
   * Dev: `n` open seasons and their offseasons simmed (staff on every side), then the user's ALUMNI page,
   * from the console (`game.devAlumni(4)`). Not saved.
   */
  devAlumni(n = 3): void {
    const cfg = { ...defaultConfig(TEAMS[this.userIdx].id), length: 'open' as const, delegate: { depthChart: true, gamePlan: true, portal: true } };
    let s = newSeason(cfg, 1);
    for (let i = 0; i < n; i++) {
      simSeason(s);
      s = simOffseason(s);
    }
    this.season = s;
    this.slot = 0;
    this.programBack = [{ screen: 'season' }];
    this.screen = 'season';
    this.toProgram(s.config.userTeamId, PROGRAM_TABS.indexOf('ALUMNI'));
  }

  /** Dev: the office showroom in room `tier`, every item on show, from the console (`game.devOffice(3)`). */
  devOffice(tier = ROOMS.length - 1, level = Infinity): void {
    if (!this.season) this.season = newSeason(defaultConfig(TEAMS[this.userIdx].id), 1);
    this.toOffice();
    this.officeView.show = { items: sampleOffice(this.season, level), tier, level };
  }

  /** Queue a toast for each new office item (and a new room) since last look. Not on the field. */
  private watchOffice(): void {
    const s = this.season;
    // The wrap has the screen: the office's toast waits for the hub.
    if (!s || this.screen === 'wrap') return;
    let w = this.officeWatch;
    if (!w || w.season !== s) {
      // A loaded save starts quiet; a season rolled over keeps counting from the same office.
      const carried = !!w && !!s.office && w.office === s.office;
      w = this.officeWatch = { season: s, office: s.office, rev: carried ? w!.rev : s.office?.rev ?? 0, tier: carried ? w!.tier : s.office?.tier ?? 0 };
      if (!carried && s.office) w.tier = Math.max(w.tier, newRoom(s) ?? 0);
    }
    w.office = s.office;
    if (this.inGame()) return;
    const o = s.office;
    if (o && o.rev > w.rev) {
      for (const it of o.items) {
        const name = achievement(it.id)?.name ?? it.id;
        if (it.rev > w.rev) this.toasts.push({ title: 'NEW IN YOUR OFFICE', sub: name });
        else if ((it.up ?? 0) > w.rev) this.toasts.push({ title: 'LEVEL UP IN YOUR OFFICE', sub: `${name}: LV ${levelOf(it)}` });
      }
      w.rev = o.rev;
    }
    const room = newRoom(s);
    if (room !== undefined && room > w.tier) {
      this.toasts.push({ title: 'OFFICE UPGRADE', sub: roomName(room) });
      w.tier = room;
    }
  }

  private drawToast(g: CanvasRenderingContext2D): void {
    if (this.inGame() || !this.toasts.length) return;
    const toast = this.toasts[0];
    toast.until ??= this.t + 3.2;
    if (this.t > toast.until) {
      this.toasts.shift();
      return;
    }
    const w = Math.max(toast.title.length, toast.sub.length) * 8 + 32;
    const x = Math.round((VIEW_W - w) / 2);
    const y = 300;
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(x + 2, y + 2, w, 34);
    g.fillStyle = '#141b26';
    g.fillRect(x, y, w, 34);
    g.fillStyle = '#ffd23f';
    g.fillRect(x, y, w, 2);
    text(g, toast.title, VIEW_W / 2, y + 7, { align: 'center', color: '#9ad7ff', shadow: false });
    text(g, toast.sub, VIEW_W / 2, y + 20, { align: 'center', color: '#ffd23f', shadow: false });
  }

  // ------------------------------------------------------------ program pages

  /** A team's program page from wherever the user is; Esc comes back here. */
  private toProgram(team: string, tab = 0, player?: string): void {
    const s = this.season!;
    if (this.screen === 'program' && this.programView) {
      if (this.programView.team === team && player === undefined) {
        this.programView.tab = tab;
        return;
      }
    }
    this.pushBack();
    const alumni = tab === PROGRAM_TABS.indexOf('ALUMNI');
    this.programView = { team, tab, scroll: 0, career: newCareerView(squadFor(s, team), alumni ? undefined : player), alumni: newAlumniView(alumni ? player : undefined), mx: 0, my: 0 };
    this.screen = 'program';
  }

  /** Remember where the user is for Esc: a program or game page goes on the stack, any other screen starts it. */
  private pushBack(): void {
    if (this.screen === 'program' && this.programView) this.programBack.push({ view: this.programView });
    else if (this.screen === 'game' && this.gameView) this.programBack.push({ game: this.gameView });
    else this.programBack = [{ screen: this.screen }];
  }

  /** A game's page (render/gameScreen.ts). `postgame`: right after the user's game, Space goes on to the hub. */
  private toGame(id: string, postgame = false): void {
    if (postgame) this.programBack = [{ screen: 'season' }];
    else this.pushBack();
    this.gameView = { game: id, tab: 0, scroll: 0, postgame, mx: 0, my: 0 };
    this.screen = 'game';
  }

  /** A game page: 1-3 or the tabs pick the page, the wheel or W/S scroll PLAYS, names are links, Esc goes back (Space too after the user's game). */
  private updateGame(dt: number, input: Input): void {
    const s = this.season!;
    const v = this.gameView!;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    const reel = this.reelOn(v);
    if (reel) this.cueReel(dt);
    if (reel && input.hit('KeyH')) {
      this.playReel(0, true);
      return;
    }
    if (input.hit('Escape', 'Backspace') || (v.postgame && input.hit('Space', 'Enter'))) {
      if (v.postgame && this.programBack.length <= 1) {
        this.programBack = [];
        this.gameView = undefined;
        this.toSeason();
      } else this.programBackOut();
      return;
    }
    const n = GAME_TABS.length;
    const setTab = (i: number) => Object.assign(v, { tab: i, scroll: 0 });
    ['Digit1', 'Digit2', 'Digit3'].forEach((k, i) => input.hit(k) && setTab(i));
    if (input.hit('Tab')) setTab((v.tab + 1) % n);
    if (input.mouse.pressed) {
      const tab = gameTabAt(x, y);
      if (tab >= 0) {
        setTab(tab);
        return;
      }
      const hl = reel ? gameReelAt(x, y, reel.items.length) : -1;
      if (hl >= 0) {
        this.playReel(hl, false);
        return;
      }
      const link = linkAt(x, y);
      if (link) {
        this.followLink(link);
        return;
      }
    }
    const step = input.mouse.wheel * 3 + (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0);
    if (step) v.scroll = Math.max(0, Math.min(gameScrollMax(s, v), v.scroll + step));
  }

  /** The last played game's highlights, when this page is that game's SUMMARY. */
  private reelOn(v: GameView): Game['reel'] {
    return this.reel && this.reel.game === v.game && v.tab === 0 ? this.reel : null;
  }

  /** Set up the next highlight's opening frame and draw its thumbnail, one at a time. */
  private cueReel(dt: number): void {
    const r = this.reel!;
    const it = r.items.find((i) => !i.still);
    if (!it || !cueShow(it.cue, dt)) return;
    const full = document.createElement('canvas');
    full.width = VIEW_W;
    full.height = VIEW_H;
    const fg = full.getContext('2d')!;
    fg.imageSmoothingEnabled = false;
    drawShowStill(fg, it.cue, r.ctx, r.crowd);
    // Cropped around the ball, so the players read at thumbnail size.
    const f = showFocus(it.cue);
    const at = it.cue.cam.toScreen(f.x, f.y, 0);
    const w = VIEW_W * REEL_CROP;
    const h = VIEW_H * REEL_CROP;
    const sx = Math.max(0, Math.min(VIEW_W - w, at.x - w / 2));
    const sy = Math.max(0, Math.min(VIEW_H - h, at.y - h / 2));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(full, sx, sy, w, h, 0, 0, w, h);
    it.still = c;
  }

  /** Watch highlight `from` (and the rest, with `all`), then back to the game page. */
  private playReel(from: number, all: boolean): void {
    const r = this.reel!;
    // The teams on the field are the reel's game's, whatever was watched since.
    this.showCtx = r.ctx;
    this.crowd = r.crowd;
    this.notices = r.items.slice(from, all ? undefined : from + 1).map((it) => ({
      title: '', sub: '', extra: '',
      show: keyShow(it.k, r.ctx, it.seed, { tape: it.tape, label: 'HIGHLIGHT' }),
    }));
    this.showNotices('game');
  }

  /** The user's PLAYER REGISTRY on one of his players. */
  private toRegistry(id: string): void {
    this.toProgram(this.season!.config.userTeamId, PROGRAM_TABS.indexOf('REGISTRY'), id);
  }

  /** A clicked name: a team's page, the user's player's roster card, or another team's player in its registry. */
  private followLink(l: Link): void {
    const s = this.season!;
    if (l.kind === 'team') this.toProgram(l.id);
    else if (l.kind === 'game') this.toGame(l.id);
    // A former player of the user's opens on his plaque.
    else if (l.team === s.config.userTeamId && s.alumni?.[l.id]?.exit) this.toProgram(l.team, PROGRAM_TABS.indexOf('ALUMNI'), l.id);
    // From a game page every player opens in the registry, so Esc comes back to the game.
    else if (l.team === s.config.userTeamId && this.screen !== 'game') this.toTeam(l.id);
    else this.toProgram(l.team, PROGRAM_TABS.indexOf('REGISTRY'), l.id);
  }

  private programBackOut(): void {
    const b = this.programBack.pop();
    if (b && 'view' in b) {
      this.programView = b.view;
      this.screen = 'program';
      return;
    }
    if (b && 'game' in b) {
      this.gameView = b.game;
      this.screen = 'game';
      return;
    }
    this.screen = b?.screen ?? 'season';
    this.programView = undefined;
    this.gameView = undefined;
  }

  /**
   * A program page: 1-5 or the tabs pick the page, Tab steps through them, the wheel or W/S scroll
   * HISTORY and NEWS, names are links, Esc goes back. On REGISTRY the registry's keys work (A/D
   * position, W/S player, G seasons or growth).
   */
  private updateProgram(input: Input): void {
    const s = this.season!;
    const v = this.programView!;
    const { x, y } = input.mouse;
    v.mx = v.career.mx = x;
    v.my = v.career.my = y;
    const alumniTab = PROGRAM_TABS.indexOf('ALUMNI');
    // Typing a search or an open dropdown takes every key and click, Esc included.
    if (v.tab === alumniTab && alumniCaptures(v.alumni)) {
      if (updateAlumni(s, v.alumni, input)) this.save();
      return;
    }
    if (input.hit('Escape', 'Backspace') || (input.hit('KeyH') && v.team === s.config.userTeamId && this.programBack.length <= 1)) {
      this.programBackOut();
      return;
    }
    const n = programTabCount(s, v.team);
    const setTab = (i: number) => Object.assign(v, { tab: i, scroll: 0 });
    ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].slice(0, n).forEach((k, i) => input.hit(k) && setTab(i));
    if (input.hit('Tab')) setTab((v.tab + 1) % n);
    if (input.mouse.pressed) {
      const tab = programTabAt(x, y, n);
      if (tab >= 0) {
        setTab(tab);
        return;
      }
      const link = linkAt(x, y);
      if (link) {
        this.followLink(link);
        return;
      }
    }
    if (v.tab === alumniTab) {
      if (updateAlumni(s, v.alumni, input)) this.save();
      return;
    }
    if (v.tab === PROGRAM_TABS.indexOf('REGISTRY')) {
      this.updateRegistry(input, v);
      return;
    }
    const step = input.mouse.wheel * 3 + (input.hit('KeyS', 'ArrowDown') ? 1 : 0) - (input.hit('KeyW', 'ArrowUp') ? 1 : 0);
    if (step) v.scroll = Math.max(0, Math.min(programScrollMax(s, v), v.scroll + step));
  }

  /** The REGISTRY tab: position tabs and rows pick a player; G or the toggles switch SEASONS and GROWTH; the wheel scrolls his story. */
  private updateRegistry(input: Input, pv: ProgramView): void {
    const s = this.season!;
    const v = pv.career;
    const { x, y } = input.mouse;
    const setPos = (i: number) => Object.assign(v, { pos: i, sel: 0, scroll: 0 });
    const n = POSITIONS.length;
    if (input.hit('KeyA', 'ArrowLeft')) setPos((v.pos + n - 1) % n);
    if (input.hit('KeyD', 'ArrowRight')) setPos((v.pos + 1) % n);
    const rows = Math.max(1, careerList(squadFor(s, pv.team), POSITIONS[v.pos]).length);
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

  /**
   * The CPU's drives through the engine: its OC calling his book with his identity (`offIdentity`) and
   * learning the user's defense as it goes (`OcBrain`); the user's DC calling the defense from his identity
   * and learning their offense (`DefBrain`). What the user's DC knows at kickoff is what a CPU DC knows
   * of the user: their OC's book and style (public) and their roster. The DEFENSE IQ setting is the CPU
   * defense's; the user's DC is always himself.
   */
  private setupEngine(): void {
    const oc = this.ocOf(this.cpu);
    const userDc = this.dcOf(this.user);
    const userOc = this.ocOf(this.user);
    this.cpuOff = {
      team: this.cpu, roster: this.cpuRoster, conf: teamConf(this.cpuSquad), ident: defIdentity(this.cpu, this.dcOf(this.cpu)),
      oc: { book: ocBook(oc), style: ocStyle(oc), passShare: autoGamePlan(this.cpuSquad, this.userSquad, oc).passShare, id: offIdentity(oc, this.cpuRoster) },
    };
    this.userDef = {
      team: this.user, roster: this.userRoster, conf: teamConf(this.userSquad), ident: defIdentity(this.user, userDc),
      oc: { book: ocBook(userOc), style: ocStyle(userOc), passShare: 0.5 },
    };
    const qbSpd = this.cpuRoster.QB?.r.spd ?? 70;
    this.userDc = newBrain({
      iq: 'NORMAL', adjust: dcAdjust(userDc), scout: userDc.r.scout, qbMobility: Math.max(0, Math.min(1, (qbSpd - 70) / 20)), seed: (this.rng() * 2 ** 31) >>> 0,
      smarts: teamSmarts(DEF_SLOTS.map((sl) => this.userRoster[sl]?.r.prc ?? 60)),
      book: this.cpuOff.oc.book, style: this.cpuOff.oc.style, roster: rosterRead(this.cpuRoster), table: 'engine',
    });
    this.cpuOc = newOcBrain({
      adjust: ocAdjust(oc), scout: oc.r.scout, qbPrc: this.cpuRoster.QB?.r.prc ?? 60, def: this.userDef.ident, seed: (this.rng() * 2 ** 31) >>> 0, defRoster: this.userRoster,
    });
  }

  // ------------------------------------------------------------ substitutions (docs/SUBS.md)

  /** Where the user's lineup differs from his depth chart's: what the grades need to know (`DriveLog.subs`). */
  private lineupDiff(): Lineup {
    const chart = lineupOf(this.baseUserSquad);
    return Object.fromEntries(Object.entries(this.lineup).filter(([slot, id]) => chart[slot] !== id));
  }

  /** A CPU drive's log, with the lineup the user's defense played it with. */
  private withSubs(log: DriveLog): DriveLog {
    const diff = this.lineupDiff();
    return Object.keys(diff).length ? { ...log, subs: [{ team: this.user.id, from: 0, lineup: diff }] } : log;
  }

  /**
   * Put the lineup on the field: the squad, the snap's roster, the engine's side for the CPU's drives, the
   * box score's on-field players and the user's drive log (from his next snap). The brains keep what they've
   * learned and their pregame read of the roster.
   */
  private applyLineup(): void {
    this.userSquad = withLineup(this.baseUserSquad, this.lineup);
    this.userRoster = onField(this.userSquad);
    if (this.showCtx) this.showCtx.userSide = { ...this.showCtx.userSide, roster: this.userRoster };
    if (this.userDef) this.userDef = { ...this.userDef, roster: this.userRoster, conf: teamConf(this.userSquad) };
    if (this.liveBox) this.liveBox.user.on = starters(this.userSquad);
    const log = this.liveDrives?.[0];
    if (log) {
      const at = { team: this.user.id, from: log.plays.length, lineup: this.lineupDiff() };
      const subs = (log.subs ?? []).filter((x) => x.from !== at.from);
      log.subs = [...subs, at];
    }
  }

  /** Put `id` in at `slot`, as the user picked in the panel. Offensive subs end the hurry-up for this snap. */
  private makeSub(slot: string, id: string): void {
    const next = substitute(this.baseUserSquad, this.lineup, slot, id, this.outForGame);
    const changed = changedSlots(this.lineup, next);
    if (!changed.length) return;
    this.lineup = next;
    this.applyLineup();
    const a = this.userSquad.athletes.find((x) => x.id === id);
    if (a) this.subNote = `${a.last.toUpperCase()} IN AT ${slotLabel(slot)}`;
    if (changed.some((s) => sideOf(s) === 'off') && this.callMode === 'normal') {
      if (this.tempo === 'hurry') this.subNote = 'SUBS: NO HURRY-UP, THE DEFENSE MATCHES';
      this.tempo = 'normal';
      this.subHold = true;
    }
  }

  /**
   * A player done for the game (an injury, when the game has them mid-game): out of the lineup for good,
   * the next man up in his slot, and a notice. Nothing calls it yet.
   */
  forceSub(id: string, why = 'IS OUT'): void {
    this.outForGame.add(id);
    const slot = Object.entries(this.lineup).find(([, x]) => x === id)?.[0];
    if (!slot) return;
    const gone = this.baseUserSquad.athletes.find((a) => a.id === id);
    const up = nextManUp(this.baseUserSquad, this.lineup, slot, this.outForGame);
    const next = { ...this.lineup };
    if (up) next[slot] = up.id;
    else delete next[slot];
    this.lineup = next;
    this.applyLineup();
    const name = (a?: { num: number; last: string }) => (a ? `#${a.num} ${a.last.toUpperCase()}` : 'NOBODY');
    this.notify({ title: `${name(gone)} ${why}`, sub: `${name(up)} IN AT ${slotLabel(slot)}`, extra: 'U ON THE PLAY CALL: SUBS', color: '#ff5a5a' });
  }

  private updateSubs(input: Input): void {
    const v = this.subs!;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    if (input.hit('Escape', 'Backspace', 'KeyU')) {
      this.subs = null;
      return;
    }
    const tabs: SubSide[] = ['off', 'def', 'st'];
    const step = (input.hit('KeyE', 'Tab') ? 1 : 0) - (input.hit('KeyQ') ? 1 : 0);
    if (step) setSubsTab(v, tabs[(tabs.indexOf(v.side) + step + tabs.length) % tabs.length]);
    const rows = subCandidates(this.baseUserSquad, this.lineup, v.slot, this.outForGame);
    if (input.mouse.wheel) v.scroll = Math.max(0, Math.min(Math.max(0, rows.length - SUB_ROWS), v.scroll + Math.sign(input.mouse.wheel)));
    if (!input.mouse.pressed) return;
    if (inBox(SUBS_DONE, x, y)) {
      this.subs = null;
      return;
    }
    const tab = tabs.find((_, i) => inBox(subsTabRect(i), x, y));
    if (tab) return setSubsTab(v, tab);
    const slot = slotAt(v.side, x, y);
    if (slot) {
      v.slot = slot;
      v.scroll = 0;
      return;
    }
    const r = subRowAt(x, y);
    const row = r >= 0 ? rows[v.scroll + r] : undefined;
    if (row) this.makeSub(v.slot, row.a.id);
  }

  // ------------------------------------------------------------ playbook page

  private toBook(): void {
    this.screen = 'playbook';
    this.bookView = { tab: this.starred.size ? 0 : 1, page: 0, open: null, flip: false, mx: 0, my: 0 };
  }

  /** A team's OC this game: the season's chair, or the generated staff's in an exhibition. */
  private ocOf(t: Team): Coach {
    const s = this.season;
    return (this.seasonGame && s ? staffFor(s, t.id) : buildStaff(t)).OC;
  }

  /** The DC in the chair: the season's staff in a season game, else the generated one. */
  private dcOf(t: Team): Coach {
    const s = this.season;
    return (this.seasonGame && s ? staffFor(s, t.id) : buildStaff(t)).DC;
  }

  /** The dynasty's book: the user's OC, his style, and the plays he brings. */
  private userBook(): BookOwner {
    const s = this.season!;
    const oc = staffFor(s, s.config.userTeamId).OC;
    return { book: ocBook(oc), oc: coachName(oc), style: STYLES[ocStyle(oc)].name };
  }

  /** Play cards by tab; click one to see it drawn with your starters, click a star to save it. */
  private updateBook(input: Input): void {
    const v = this.bookView;
    const { x, y } = input.mouse;
    v.mx = x;
    v.my = y;
    const book = this.userBook().book;
    const list = bookPlays(v.tab, this.starred, book);
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
    const pages = bookPages(v.tab, this.starred, book);
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
    const shown = bookPlays(v.tab, this.starred, book).slice(v.page * BOOK_PAGE, v.page * BOOK_PAGE + BOOK_PAGE);
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
  /**
   * An offseason stage just ran: its reveal (season/offseasonMoments.ts), back to the offseason's
   * screens after. False when there's nothing to show.
   */
  private stageWrap(): boolean {
    const s = this.season;
    const list = s ? unseenWrap(s).filter((m) => m.os && m.os !== 'opener') : [];
    if (!list.length) return false;
    const screen = this.screen;
    this.openWrap(list, false, () => (screen === 'portal' && s!.offseason?.stage === 'portal' ? (this.screen = 'portal') : this.toOffseason()));
    return true;
  }

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
      const next = advanceOffseason(s);
      if (next !== s) {
        this.season = next;
        this.save();
        this.toSeason();
        return;
      }
      this.save();
      if (!this.stageWrap()) this.toOffseason();
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
      this.save();
      return;
    }
    if (RECRUIT_TABS[v.tab] === 'CLASS' && holdEditable(s) && input.hit('BracketLeft', 'BracketRight')) {
      const was = portalHold(s, s.config.userTeamId);
      setHold(s, was + (input.hit('BracketRight') ? 1 : -1));
      const now = portalHold(s, s.config.userTeamId);
      v.note = `HOLDING ${now} SPOT${now === 1 ? '' : 'S'} FOR THE PORTAL: THE CLASS PLANS ${now > was ? 'SMALLER' : now < was ? 'BIGGER' : 'THE SAME'}`;
      this.save();
      return;
    }
    if (input.hit('KeyG') && RECRUIT_TABS[v.tab] === 'BOARD' && !s.config.delegate.recruiting) {
      const added = staffFill(s);
      v.note = added ? `STAFF ADDED ${added} TO THE BOARD` : 'THE BOARD IS FULL FOR YOUR NEEDS';
      this.save();
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
    this.save();
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
      this.save();
      return;
    }
    if (input.hit('Space', 'Enter') || (pressed && inBox(DEPARTURES_ADVANCE, x, y))) {
      advanceOffseason(s);
      this.save();
      if (!this.stageWrap()) this.toOffseason();
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
    this.save();
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
      this.save();
      return;
    }
    if (input.hit('Space', 'Enter') || (pressed && inBox(CAROUSEL_ADVANCE, x, y))) {
      advanceOffseason(s);
      this.save();
      if (s.offseason?.stage !== 'carousel') {
        if (!this.stageWrap()) this.toOffseason();
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
        this.save();
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
      this.save();
    } else if (pick(1)) {
      v.note = interview(s, c.id) ? 'INTERVIEWED: HIS RATINGS ARE SHARPER' : 'NO INTERVIEWS LEFT, OR YOU KNOW ALL YOU CAN';
      this.save();
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
      this.save();
      return;
    }
    if (input.hit('Space', 'Enter') || (pressed && inBox(ADVANCE_BTN, x, y))) {
      const next = advanceOffseason(s);
      if (next !== s) {
        this.season = next;
        this.save();
        this.toSeason();
        return;
      }
      this.save();
      if (s.offseason?.stage !== 'portal') {
        if (!this.stageWrap()) this.toOffseason();
        return;
      }
      this.portalView = { ...newPortalView(s), tab: PORTAL_TABS[v.tab] === 'LEAVING' ? 0 : v.tab, chip: v.chip };
      this.stageWrap();
      return;
    }
    const which = PORTAL_TABS[v.tab];
    if (which === 'MY ROOM') {
      // X: release the lowest HS commit still to sign, for a transfer's spot.
      const rel = releasable(s);
      if (input.hit('KeyX') && rel.length && !s.config.delegate.portal) {
        const p = prospect(rel[rel.length - 1])!;
        if (releaseForPortal(s, p.id)) {
          v.note = `RELEASED ${p.stars}* ${p.pos} ${p.a.last.toUpperCase()}: ONE MORE SPOT FOR A TRANSFER`;
          this.save();
        }
      }
      return;
    }
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
    this.save();
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
    if (changed) this.save();
  }

  /** The live game is over: hand the score to the season (box score to come) and go back to the hub. */
  private finishSeasonGame(): void {
    const g = this.seasonGame!;
    const s = this.season!;
    const userHome = g.home === s.config.userTeamId;
    const home = userHome ? this.score.user : this.score.cpu;
    const away = userHome ? this.score.cpu : this.score.user;
    const box = this.liveBox
      ? finishLiveBox(this.liveBox, userHome, home, away)
      : { home: { points: home, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 }, away: { points: away, yards: 0, passYds: 0, rushYds: 0, turnovers: 0, plays: 0 }, players: [] };
    const result: GameResult = { home, away, ot: this.otPeriods(), box };
    // The highlights: the game's biggest plays, the user's own on tape (game/tape.ts).
    const reel = this.liveBox ? pickReel(this.liveBox.story, (p: LiveSimPlay) => this.tapes.has(p), this.user.id) : [];
    if (this.liveBox) result.plays = liveGamePlays(this.liveBox);
    this.liveBox = null;
    this.seasonGame = null;
    // The film this game leaves for next week's DC (game/offModel.ts).
    if (this.brain) {
      const ts = (s.teamState[s.config.userTeamId] ??= {});
      ts.film = mergeFilm(ts.film, { ...this.brain.model.raw, throws: this.brain.habits.slice(0, 12) });
    }
    advanceWeek(s, result, this.liveDrives ?? undefined);
    this.liveDrives = null;
    this.save();
    // The highlights wait on the game page's SUMMARY, to click and watch.
    const ctx = this.showCtx;
    const crowd = this.crowd;
    this.reel = reel.length && ctx && crowd
      ? {
        game: g.id, ctx, crowd,
        items: reel.map((k) => {
          const tape = this.tapes.get(k.play)?.tape;
          const seed = (Math.random() * 2 ** 31) >>> 0;
          return { k, tape, seed, cue: keyShow(k, ctx, seed, { tape, label: 'HIGHLIGHT' }), still: null };
        }),
      }
      : null;
    this.tapes.clear();
    this.tapeRec = null;
    this.notices = [];
    this.toGame(g.id, true);
  }

  /**
   * The last played game's highlights (up to `POSTGAME.reel`), shown on its page: each with its tape
   * when the user played it, the seed its replay is found with, and a show cued to its opening frame
   * for the thumbnail. Kept in memory until the next game ends.
   */
  private reel: {
    game: string;
    ctx: ShowCtx;
    crowd: HTMLCanvasElement;
    items: { k: KeyPlay; tape?: Tape; seed: number; cue: KeyShow; still: HTMLCanvasElement | null }[];
  } | null = null;

  // ------------------------------------------------------------ play call

  /** The user's offense's situation this snap, for the CPU defense's call. */
  private userSituation(): Situation {
    const c = this.clock;
    const ot = inOvertime(c);
    return {
      down: this.drive.down, toGo: this.drive.firstDownX - this.drive.los, yardsToGoal: OPP_GOAL - this.drive.los,
      secsLeft: ot ? Infinity : timeLeftInHalf(c), qSecs: c.qSecs, finalHalf: c.quarter >= 3, lead: this.score.user - this.score.cpu,
      ot: ot && this.ot ? (this.ot.turn === 1 ? 'second' : 'first') : undefined,
    };
  }

  /** The user's side of a punt or kickoff for the special-teams coaches (game/cpuKicker.ts). */
  private userKickContext(unit: 'punt' | 'kickoff'): KickContext {
    const c = this.clock;
    const k = this.userRoster[unit === 'punt' ? 'P' : 'K']?.r;
    return {
      lead: this.score.user - this.score.cpu, secsLeft: inOvertime(c) ? Infinity : timeLeftInHalf(c), finalHalf: c.quarter >= 3,
      ...(unit === 'punt' ? { yard: Math.round(this.drive.los - OWN_GOAL), toGo: Math.round(this.drive.firstDownX - this.drive.los) } : {}),
      kpw: k?.kpw ?? 70, kac: k?.kac ?? 70, returner: returnerOf(this.cpuRoster), along: windAlong(this.wind), onsides: this.onsides,
    };
  }

  /**
   * The CPU's return look for a punt or kickoff the user may call (shown on the call screen and the field),
   * the user's ST coach's call against it, and fresh forecasts for the cards.
   */
  private setKickLook(mode: CallMode): void {
    this.kickCast.clear();
    this.kickTip = null;
    this.kickLook = 'return';
    const unit = mode === 'kickoff' ? 'kickoff' : mode === 'normal' && this.drive.down === 4 && !this.ot ? 'punt' : null;
    if (!unit) return;
    const ctx = this.userKickContext(unit);
    this.kickLook = returnCall(unit, ctx, this.rng);
    const seen = { ...ctx, ret: this.kickLook };
    this.kickTip = unit === 'kickoff' ? kickoffCall(seen, this.rng) : puntCall(seen, this.rng);
  }

  /** A kick card's forecast: the kicker's aim for the call, then his misses, in this wind (cached for the snap). */
  private kickForecast(def: KickDef): KickForecast | null {
    if (def.unit !== 'punt' && def.unit !== 'kickoff') return null;
    let f = this.kickCast.get(def.id);
    if (!f) {
      const kp = this.newKick(def);
      f = forecast(kp, this.wind, mulberry32(hashString(`${def.id}:${Math.round(kp.los)}`)));
      this.kickCast.set(def.id, f);
    }
    return f;
  }

  private toCall(mode: CallMode = 'normal'): void {
    if (mode === 'pat' && this.mustGoForTwo()) mode = 'try';
    this.screen = 'call';
    this.callMode = mode;
    this.play = null;
    this.subs = null;
    this.subNote = null;
    this.subHold = false;
    this.huddleLineup = this.lineup;
    this.checkDone = false;
    this.checkNote = null;
    this.kick = null;
    this.kicker = null;
    this.applied = null;
    this.setKickLook(mode);
    this.cam.setZoom(1, 1, { x: this.drive.los, y: this.drive.ballY });
    // The CPU defense's identity: its own call mix (more zero blitz on third and long if that's who it is) and press rates.
    const ident = defIdentity(this.cpu, this.dcOf(this.cpu));
    const toGo = this.drive.firstDownX - this.drive.los;
    // The clock and score too: prevent against a late score, a sell-out against the clock running out.
    const sit = this.userSituation();
    if (this.brain && mode === 'normal') {
      // The DC's call with what he's learned, and maybe a line about it for the user.
      const pick = callFor(this.brain, ident, this.drive.down, toGo, OPP_GOAL - this.drive.los, this.rng, sit);
      this.defCall = pick.call;
      this.defTags = pick.tags;
      this.dcNote = headline(this.brain, playName) ?? this.dcNote;
    } else {
      this.defCall = pickDefCall(this.rng, situationMix(ident, this.drive.down, toGo, OPP_GOAL - this.drive.los, undefined, false, sit));
      this.defTags = preventLevel(sit) ? { prevent: true } : {};
    }
    // A line game on a 4-man rush, as often as this defense runs them (`IDENTITY.games`).
    if (mode === 'normal' && !this.defTags.prevent && rushers(this.defCall) === 4) {
      const game = pickLineGame(this.rng, ident);
      if (game) this.defTags = { ...this.defTags, game };
    }
    const pr = ident.press;
    this.press = { CB1: this.rng() < pr.CB1, CB2: this.rng() < pr.CB2, NB: this.rng() < pr.NB };
    // Some snaps it shows one look and spins to its call at the snap (never in prevent or on a try).
    const disguises = !(this.seasonGame && this.season?.config.disguises === false);
    this.disguise =
      disguises && mode === 'normal' && !this.defTags.prevent && this.rng() < ident.disguise ? pickDisguise(this.rng, this.defCall, sticks(toGo) >= 1) : null;
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
  /** The RUN ASSIST setting for this game: the dynasty's in a season game, the exhibition's otherwise. */
  private runAssist(): RunAssist {
    return this.seasonGame && this.season ? this.season.config.runAssist ?? 'FULL' : this.exhibitionAssist;
  }

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
        // Overtime has no punts: kick a field goal or go for it.
        if (tab.kind === 'st') {
          const kicks: Card[] = ST_TAB.filter((def) => !this.ot || def.unit === 'fg').map((def) => ({ kind: 'kick', def }));
          // The clock plays, in regulation (overtime is untimed).
          return this.ot ? kicks : [...kicks, { kind: 'kneel' }, { kind: 'spike' }];
        }
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
    return tab && tab.kind !== 'st' ? playsOfKind(tab.kind, this.book) : null;
  }

  /** The chip in use on this tab: STARRED if the tab has starred plays, else the 11 package, until the user picks one. */
  private chipIndex(): number {
    const plays = this.tabPlays();
    if (!plays) return 0;
    const chips = chipsFor(plays);
    const n = chips.length;
    const starredHere = plays.some((p) => this.starred.has(p.id));
    // Opens on STARRED if the tab has stars, else the base package (11), else the first one.
    const base = Math.max(1, chips.indexOf('11'));
    return Math.min(this.chip[this.tab] ?? (starredHere || n < 2 ? 0 : base), n - 1);
  }

  /** Plays under the current chip, before paging. */
  private chipPlays(): PlayDef[] {
    const plays = this.tabPlays() ?? [];
    const f = chipsFor(plays)[this.chipIndex()];
    return f === 'starred' ? plays.filter((p) => this.starred.has(p.id)) : packagePlays(plays, f);
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.chipPlays().length / PAGE));
  }

  private chipRects(): { x: number; y: number; w: number; h: number }[] {
    const plays = this.tabPlays();
    if (!plays) return [];
    const widths = chipsFor(plays).map((f) => chipLabel(f).length * 8 + 8 + (f === 'starred' ? STAR_ICON_W : 0));
    const gap = 4;
    // Too many formations for one row: show the run of chips around the current one that fits (the
    // rest are off the row, marked with arrows), and A/D scrolls it.
    const [lo, hi] = chipWindow(widths, gap, this.chipIndex());
    const shown = widths.slice(lo, hi + 1);
    let x = (VIEW_W - (shown.reduce((a, b) => a + b, 0) + gap * (shown.length - 1))) / 2;
    return widths.map((w, i) => {
      if (i < lo || i > hi) return { x: -1000, y: CHIP_Y, w: 0, h: 0 };
      const r = { x, y: CHIP_Y, w, h: CHIP_H };
      x += w + gap;
      return r;
    });
  }

  private updateCall(dt: number, input: Input): void {
    // The clocks run while the user subs: a slow change is a delay of game (docs/SUBS.md).
    if (this.tickBetweenPlays(dt)) {
      this.subs = null;
      return;
    }
    if (this.subs) {
      this.updateSubs(input);
      return;
    }
    if (!this.watchOnly && (input.hit('KeyU') || (input.mouse.pressed && inBox(SUBS_CHIP, input.mouse.x, input.mouse.y)))) {
      input.mouse.pressed = false;
      this.subs = newSubsView(this.callMode === 'kickoff' ? 'def' : 'off');
      return;
    }
    if (input.hit('KeyH') && !this.subHold) this.tempo = this.tempo === 'hurry' ? 'normal' : 'hurry';
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
    if (this.callMode === 'try' && !this.mustGoForTwo() && input.hit('Escape', 'Backspace')) {
      this.callMode = 'pat';
      return;
    }
    // K: victory formation. X: spike it. Regulation snaps only.
    if (this.callMode === 'normal' && !this.ot && !this.drive.try) {
      const clockPlay = input.hit('KeyK') ? 'kneel' : input.hit('KeyX') ? 'spike' : null;
      if (clockPlay) {
        this.startClockPlay(clockPlay);
        return;
      }
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
      else if (c.kind === 'kneel' || c.kind === 'spike') this.startClockPlay(c.kind);
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

  /** A new drive for the user: the hard counts come back. */
  private freshDrive(start: number): Drive {
    this.hardCountsLeft = HARD_COUNT.perDrive;
    return startDrive(start);
  }

  /** The defense jumped on the hard count: 5 yards (half the distance inside the 10), a first down if it gets there. */
  private offsidePenalty(): void {
    this.play = null;
    const d = this.drive;
    const los = d.los + Math.min(5, (OPP_GOAL - d.los) / 2);
    const first = los >= d.firstDownX;
    this.drive = { ...d, los, ...(first ? { down: 1, firstDownX: Math.min(OPP_GOAL, los + 10) } : {}) };
    adminStop(this.clock);
    const yds = Math.round(los - d.los);
    this.notify({
      title: 'OFFSIDE, DEFENSE', sub: `${yds === 5 ? '5-yard' : 'Half the distance'} penalty. ${first ? 'First down' : 'Replay the down'}`,
      extra: downDistance(this.drive), color: '#ffd23f',
    });
    this.showNotices('call');
  }

  private startPlay(def: PlayDef): void {
    // The presnap check: the defense sees the personnel and formation (not the play), once a snap.
    if (!this.checkDone && this.brain && this.callMode === 'normal' && !this.drive.try && this.defCall) {
      this.checkDone = true;
      const d = this.drive;
      const c = checkFor(this.brain, defIdentity(this.cpu, this.dcOf(this.cpu)), def, this.defCall, d.down, d.firstDownX - d.los, OPP_GOAL - d.los, this.userSituation());
      if (c) {
        this.defCall = c;
        this.disguise = null; // a late check is played straight
        if (this.defTags.game && rushers(c) !== 4) this.defTags = { ...this.defTags, game: undefined };
        this.checkNote = "THEY CHECKED: THEY'VE SEEN THIS LOOK";
      }
    }
    // Everyone plays this snap with his confidence at its leverage.
    this.snapLev = this.snapLeverage();
    this.snapAt = null;
    const learn = this.brain && !this.drive.try;
    this.snapAntic = learn ? anticFor(this.brain!, this.defPrc()) : undefined;
    this.snapReads = learn ? leansFor(this.brain!, this.defPrc(), this.defCall!, def, this.snapSit()) : undefined;
    this.snapShifted = false;
    this.snapFlip = this.flipCall;
    this.play = this.buildPlay(def, this.flipCall);
    this.flipCall = false;
    this.audibleOpen = false;
    this.screen = 'play';
    this.zoomFor(def);
  }

  /** Down, distance and the goal, for the leans. */
  private snapSit() {
    return { down: this.drive.down, toGo: this.drive.firstDownX - this.drive.los, yardsToGoal: OPP_GOAL - this.drive.los };
  }

  private zoomFor(def: PlayDef): void {
    const run = def.kind === 'run';
    this.cam.setZoom(run ? RUN_ZOOM.x : 1, run ? RUN_ZOOM.y : 1, { x: this.drive.los, y: this.drive.ballY });
  }

  /** The snap on the field: this play against the defense's call as it stands, carried over from `from` on an audible. */
  private buildPlay(def: PlayDef, flip: boolean, from?: Play): Play {
    const learn = this.brain && !this.drive.try;
    return new Play({
      offTeam: this.user,
      defTeam: this.cpu,
      homeId: this.homeId,
      // The user's QB: when he's shaken, his nerves are aim lag rather than lost accuracy.
      offRoster: clutchRoster(this.userRoster, this.snapLev, true),
      defRoster: clutchRoster(this.cpuRoster, this.snapLev),
      aimNerves: shakenAimLag(this.userRoster.QB?.conf ?? 0, this.snapLev),
      autoGive: true,
      play: def,
      defCall: this.defCall!,
      press: this.press,
      tags: this.defTags,
      habits: learn ? this.brain!.habits : undefined,
      antic: this.snapAntic,
      reads: this.snapReads,
      los: this.drive.los,
      ballY: this.drive.ballY,
      flip,
      disguise: this.disguise,
      ...(from ? { from } : {}),
      rng: this.rng,
    });
  }

  /**
   * The plays the user can audible to: his book in the personnel on the field (no subs once the huddle breaks),
   * the formation he's in first, then formation by formation. `kind` narrows it to a tab.
   */
  private audiblePlays(kind: AudibleKind): PlayDef[] {
    const now = this.play!.playDef;
    const pers = personnelOf(now.formation);
    const pool = this.book.filter((p) => p.kind !== 'st' && (kind === 'all' || p.kind === kind));
    const pkg = packagePlays(pool, pers);
    return [...pkg.filter((p) => p.formation === now.formation), ...pkg.filter((p) => p.formation !== now.formation)];
  }

  /**
   * An audible to `def` (flipped or not) before the snap. A quiet check (nobody moves) is hidden: the defense stays
   * as it is. A shift is seen: the defense realigns to it, the DC may re-check in his package (`recheckFor`), and
   * the players re-read the new look (`releanFor`). The play clock keeps running.
   */
  private audible(def: PlayDef, flip: boolean): void {
    const from = this.play!;
    let next = this.buildPlay(def, flip, from);
    if (next.shift && this.brain && !this.drive.try) {
      const d = this.drive;
      const c = recheckFor(this.brain, defIdentity(this.cpu, this.dcOf(this.cpu)), def, this.defCall!, d.down, d.firstDownX - d.los, OPP_GOAL - d.los, this.clock.play, this.userSituation());
      if (c) {
        this.defCall = c;
        this.disguise = null; // a late check is played straight
        if (this.defTags.game && rushers(c) !== 4) this.defTags = { ...this.defTags, game: undefined };
      }
      this.checkNote = c ? 'THEY CHECKED AFTER THE SHIFT' : 'THEY REALIGN TO THE SHIFT';
      this.snapReads = releanFor(this.brain, this.defPrc(), this.defCall!, def, this.snapSit(), this.snapReads);
      next = this.buildPlay(def, flip, from);
    } else if (next.shift) {
      this.checkNote = null;
    }
    if (next.shift) this.snapShifted = true;
    this.snapFlip = flip;
    this.play = next;
    this.zoomFor(def);
  }

  private audView(): AudibleView {
    const now = this.play!.playDef;
    return {
      plays: this.audiblePlays(AUDIBLE_TABS[this.audTab].kind), page: this.audPage, tab: this.audTab, hover: this.audHover,
      now, flip: this.snapFlip, pers: personnelOf(now.formation),
    };
  }

  /** The audible picker's input. True when it audibled (the snap on the field is a new `Play`). */
  private updateAudible(input: Input): boolean {
    const n = AUDIBLE_TABS.length;
    if (input.hit('KeyQ')) { this.audTab = (this.audTab + n - 1) % n; this.audPage = 0; }
    if (input.hit('KeyE', 'Tab')) { this.audTab = (this.audTab + 1) % n; this.audPage = 0; }
    const v = this.audView();
    const pages = Math.max(1, Math.ceil(v.plays.length / AUDIBLE_PAGE));
    const step = (input.hit('KeyS') ? 1 : 0) - (input.hit('KeyW') ? 1 : 0) + Math.sign(input.mouse.wheel);
    if (step) this.audPage = (Math.min(this.audPage, pages - 1) + step + pages) % pages;
    const cards = audiblePage({ ...v, page: this.audPage });
    const { x, y } = input.mouse;
    this.audHover = -1;
    for (let i = 0; i < cards.length; i++) if (inRect(x, y, audibleCardRect(i))) this.audHover = i;
    let chosen = -1;
    for (let i = 0; i < cards.length; i++) if (input.hit(`Digit${i + 1}`, `Numpad${i + 1}`)) chosen = i;
    if (input.mouse.pressed && this.audHover >= 0) chosen = this.audHover;
    input.mouse.pressed = false; // a click in the picker never snaps
    if (input.hit('KeyF')) {
      this.audibleOpen = false;
      this.audible(v.now, !this.snapFlip); // the same play to the other side: a shift
      return true;
    }
    if (chosen < 0) return false;
    this.audibleOpen = false;
    const p = cards[chosen];
    if (p === v.now) return false;
    // Keep the strength where it is (a play's own flip rule would mirror it: that's for F).
    this.audible(p, resolvePlay(p, this.drive.ballY, false).mirrored !== this.play!.resolved.mirrored);
    return true;
  }

  /** The CPU defenders' play recognition, by slot, for their leans. */
  private defPrc(): Partial<Record<string, number>> {
    return Object.fromEntries(DEF_SLOTS.map((sl) => [sl, this.cpuRoster[sl]?.r.prc ?? 60]));
  }

  /** The CPU defense watches the snap the user just ran. */
  private observeSnap(play: Play, o: PlayOutcome): void {
    if (!this.brain) return;
    const d = this.drive;
    const gain = Math.round((o.type === 'td' ? OPP_GOAL : o.spot) - d.los);
    const toGo = Math.round(d.firstDownX - d.los);
    const turnover = o.type === 'int' || o.type === 'pick6' || o.type === 'fumble';
    const success = successful({ gain, pass: play.playDef.kind !== 'run', down: d.down, toGo, ...(o.type === 'sack' ? { sack: true } : {}), ...(turnover ? { turnover: true } : {}) });
    observe(this.brain, {
      play: play.playDef, call: play.defCall, down: d.down, toGo, yardsToGoal: OPP_GOAL - d.los, gain, success,
      scrambled: play.scramble, kept: play.kept, air: play.ballTarget && play.thrown ? play.ballTarget.x - d.los : 0,
      handedOff: play.handedOff, lane: laneOf(play), tags: play.tags, target: play.thrown ? play.intended?.slot ?? null : null,
      lost: turnover || o.type === 'sack',
      throw: play.throwRecord(gain), antic: Object.fromEntries([...play.anticLog].map(([d, r]) => [d.slot, r])),
      ...(this.snapShifted ? { shifted: true } : {}),
    });
  }

  /**
   * A kneel or a spike: no snap on the field, just the clock and the down. A kneel snaps with the play clock run
   * down (`KNEEL_AT`) and loses a yard with the clock running; a spike snaps as soon as the line is set
   * (`SPIKE_AT`) and stops it. The DC doesn't learn from either.
   */
  private startClockPlay(kind: 'kneel' | 'spike'): void {
    const d = this.drive;
    const kneel = kind === 'kneel';
    this.play = null;
    this.snapLev = 0;
    runoffAtSnap(this.clock, kind);
    snapClock(this.clock);
    this.snapAt = this.atNow();
    this.clock.time = Math.max(0, this.clock.time - (kneel ? KNEEL_SECS : SPIKE_SECS));
    const o: PlayOutcome = kneel
      ? { type: 'tackle', spot: Math.max(d.los - 1, OWN_GOAL + 0.5), spotY: d.ballY, text: 'KNEEL', sub: 'Victory formation', color: '#ffffff' }
      : { type: 'incomplete', spot: d.los, spotY: d.ballY, text: 'SPIKE', sub: 'Clock stopped', color: '#ffffff' };
    // A kneel is graded as the sims grade it; a spike is no football rep (as `driveLog` drops it).
    if (kneel) this.logSnap(false, o);
    this.creditClockSnap(kind, o);
    const a = applyOutcome(d, o);
    afterPlay(this.clock, o.type, false);
    this.storySnapResult(a);
    this.applied = a;
    this.notify({
      title: kneel ? 'KNEEL DOWN' : 'SPIKE', sub: kneel ? 'Victory formation. The clock keeps running' : 'Ball spiked. The clock is stopped',
      extra: a.change.kind === 'none' ? downDistance(a.drive) : '', color: '#9ad7ff',
    });
    if (a.change.kind !== 'none') {
      this.handleChange(a);
      return;
    }
    this.drive = a.drive;
    if (this.clock.time <= 0) this.periodOver();
    else this.showNotices('call');
  }

  /** The user's kick play for `def`, with the CPU's look on punts and kickoffs. */
  private newKick(def: KickDef, rng: Rng = this.rng): KickPlay {
    const kickoff = def.unit === 'kickoff';
    const auto = def.unit === 'punt' || kickoff;
    return new KickPlay({
      kickTeam: this.user,
      recvTeam: this.cpu,
      homeId: this.homeId,
      kickRoster: clutchRoster(this.userRoster, this.snapLev),
      recvRoster: clutchRoster(this.cpuRoster, this.snapLev),
      def,
      los: kickoff ? KICKOFF_LINE : this.drive.los,
      ballY: kickoff ? FIELD_W / 2 : this.drive.ballY,
      wind: this.wind,
      rng,
      ...(auto ? { ret: this.kickLook } : {}),
      ...(def.unit === 'punt' && this.drive.down === 4 ? { fake: { toGo: Math.round(this.drive.firstDownX - this.drive.los) } } : {}),
    });
  }

  private startKick(def: KickDef): void {
    this.cam.setZoom(1, 1, { x: this.drive.los, y: this.drive.ballY });
    const place = def.unit === 'fg' || def.unit === 'xp';
    this.snapLev = place ? this.snapLeverage(true) : 0;
    this.kick = this.newKick(def);
    // Punts and kickoffs: the user called it, the kicker kicks it.
    this.kicker = place ? null : new CpuKicker(this.kick, this.wind, this.rng);
    if (def.onside) this.onsides++;
    this.kickFast = false;
    this.applied = null;
    this.screen = 'kick';
  }

  /** Watching kicks, or straight to the result (the KICKS setting; exhibitions watch). */
  private kicksFast(): boolean {
    return this.seasonGame && this.season ? this.season.config.kicks === 'result' : false;
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
      // Esc: the audible picker over the field, within the personnel on it; the play clock keeps running.
      if (input.hit('Escape', 'Backspace')) {
        this.audibleOpen = !this.audibleOpen;
        this.audPage = 0;
        this.audHover = -1;
      }
      play.clockLeft = this.clock.play;
      if (this.audibleOpen) {
        if (this.updateAudible(input)) return;
      } else if (input.hit('KeyM') && !play.shifting()) play.startMotion();
      if (!this.audibleOpen && input.hit('KeyH') && this.hardCountsLeft > 0 && !this.drive.try && play.canSnap()) {
        this.hardCountsLeft--;
        this.clock.play = Math.max(0.1, this.clock.play - HARD_COUNT.clock);
        if (play.hardCount()) {
          this.offsidePenalty();
          return;
        }
      }
      if (!this.audibleOpen && (input.hit('Space') || input.mouse.pressed) && play.canSnap()) {
        play.snap();
        if (!this.drive.try) {
          runoffAtSnap(this.clock, this.tempo); // tries are untimed
          snapClock(this.clock);
        }
        this.snapAt = this.atNow();
        input.mouse.pressed = false; // the snap click must not start an aim
      }
    }
    play.update(dt, input, this.cam);
    // Where the snap falls in the game, if it went off some other way than the snap key.
    if (!this.snapAt && play.phase !== 'presnap') this.snapAt = this.atNow();
    if (this.liveBox) {
      if (this.tapeRec?.play !== play) this.tapeRec = newRecorder(play);
      const scored = play.outcome?.type === 'td' || play.outcome?.type === 'pick6';
      if (play.phase !== 'over' || play.overTime < (scored ? TAPE.scoreTail : TAPE.tail)) recordFrame(this.tapeRec, dt);
    }
    if (play.phase !== 'presnap' && play.phase !== 'over' && !this.drive.try) tickLive(this.clock, dt);

    const lead = play.aim ? 0.22 : play.phase === 'run' ? 0.4 : play.phase === 'air' ? 0.45 : 0.35;
    this.cam.follow(play.focusX(), lead);
    if (play.playDef.kind === 'run') this.cam.zoomFollow(play.carrier?.pos ?? play.ball.pos);

    if (play.phase === 'over' && play.outcome) {
      if (!this.applied) {
        if (this.drive.try) {
          this.applied = applyTry(this.drive, play.outcome);
          this.storyTry(play, this.applied.userPoints);
        } else {
          this.logSnap(play.playDef.kind !== 'run', play.outcome);
          this.creditSnap(play, play.outcome);
          this.observeSnap(play, play.outcome);
          this.applied = applyOutcome(this.drive, play.outcome);
          afterPlay(this.clock, play.outcome.type, this.applied.headline === 'FIRST DOWN');
          if (play.outcome.type === 'td') adminStop(this.clock); // a score stops the clock
        }
        this.score.user += this.applied.userPoints;
        this.score.cpu += this.applied.cpuPoints;
        if (!this.drive.try) this.storySnapResult(this.applied);
      } else if (!this.drive.try) {
        tickBetween(this.clock, dt);
      }
      const skip = play.overTime > 0.6 && (input.hit('Space', 'Enter') || input.mouse.pressed);
      if (play.overTime > 2.6 || skip) this.handleChange(this.applied);
    }
  }

  // ------------------------------------------------------------ kicks

  private updateKick(dt: number, input: Input): void {
    if (this.cpuKick) {
      this.updateCpuKick(dt, input);
      return;
    }
    const kp = this.kick!;
    if (kp.phase === 'presnap') {
      if (this.tickBetweenPlays(dt)) return;
      if (input.hit('Escape', 'Backspace')) {
        this.screen = 'call'; // back to the call screen; the play clock keeps running
        this.kick = null;
        return;
      }
      // The CPU kicker goes once the look has been on screen a moment (SPACE goes now).
      const k = this.kicker;
      if (k && !k.started && (kp.time >= KICK_SHOW || input.hit('Space', 'Enter') || input.mouse.pressed)) {
        k.start();
        if (kp.unit === 'punt') {
          runoffAtSnap(this.clock, this.tempo);
          snapClock(this.clock);
        }
        input.mouse.pressed = false;
        if (this.kicksFast()) this.kickFast = true;
      }
    } else if (this.kicker && kp.phase !== 'over' && !this.kickFast && (input.hit('Space', 'Enter') || input.mouse.pressed)) {
      // Skip: run it to the whistle.
      this.kickFast = true;
      input.mouse.pressed = false;
    }
    const was = kp.phase;
    // Once it's over the kick still ticks (its `overTime` moves the game on), so the kicker's loop is skipped.
    const over = () => kp.phase === 'over';
    if (this.kicker && !over()) {
      // Fast: the whole kick in one frame (the clock runs as it would have).
      const steps = this.kickFast && kp.phase !== 'presnap' ? Math.ceil(30 / STEP) : 1;
      for (let i = 0; i < steps && !over(); i++) {
        const step = steps > 1 ? STEP : dt;
        this.kicker.step();
        kp.update(step, AUTO_INPUT);
        if (steps > 1 && kp.clockRunning()) tickLive(this.clock, step);
      }
      if (steps > 1) {
        const f = kp.focus();
        this.cam.follow(f.x, f.lead);
      }
    } else kp.update(dt, this.kicker ? AUTO_INPUT : input);
    if (was === 'presnap' && kp.phase !== 'presnap' && kp.unit === 'fg') {
      runoffAtSnap(this.clock, this.tempo);
      snapClock(this.clock);
    }
    if (kp.clockRunning() && !(this.kicker && this.kickFast)) tickLive(this.clock, dt);
    const f = kp.focus();
    this.cam.follow(f.x, f.lead);

    if (kp.phase === 'over' && kp.outcome) {
      if (!this.applied) {
        this.logKick(kp.outcome);
        this.applied = applyKick(this.drive, kp.outcome);
        this.score.user += this.applied.userPoints;
        this.score.cpu += this.applied.cpuPoints;
        this.storyKick(kp.outcome, this.applied);
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
    if (this.brain && c.kind !== 'none' && c.kind !== 'pat') {
      newDrive(this.brain);
      this.dcNote = null;
    }
    if (this.ot) {
      this.otChange(a);
      return;
    }
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
        this.drive = this.freshDrive(25);
        this.kickOffNext();
        return;
      case 'pick6':
      case 'returnTd': {
        this.drive = this.freshDrive(25);
        adminStop(this.clock);
        const sub = c.kind === 'pick6' ? 'Pick six' : c.sub;
        this.notify({ title: `${this.cpu.abbr} SCORES`, sub: `${sub}. Kickoff to you.`, extra: '' });
        if (this.clock.time <= 0) this.periodOver();
        else {
          this.pendingCpuKick = { unit: 'kickoff', yard: KICKOFF_FROM };
          this.showNotices('cpuKick');
        }
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
      this.endRegulation();
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
      this.endRegulation();
    }
  }

  // ------------------------------------------------------------ overtime

  /** Overtime periods played: the live game's, or the watched simulated game's. */
  private otPeriods(): number {
    return Math.max(0, this.clock.quarter - 4);
  }

  /** In overtime, a touchdown's try must be two from the 2nd period on (and the shootout is all tries). */
  private mustGoForTwo(): boolean {
    return !!this.ot && this.otPeriods() >= OVERTIME.mustGoForTwo;
  }

  /** Whether the user has the ball on this overtime possession. */
  private otUserBall(): boolean {
    const ot = this.ot!;
    const userFirst = ot.userFirst === (this.otPeriods() % 2 === 1);
    return ot.turn === 0 ? userFirst : !userFirst;
  }

  /** The 4th quarter is over: the final, or FBS overtime if it's tied (`OVERTIME`, game/rules.ts). */
  private endRegulation(): void {
    if (this.score.user !== this.score.cpu) {
      this.showNotices('final');
      return;
    }
    this.notify({ title: 'END OF REGULATION', sub: this.scoreLine(), extra: 'Tied: going to overtime', color: '#9ad7ff' });
    // The toss winner defers, as nearly every FBS team does, and plays defense first.
    const userToss = this.rng() < 0.5;
    this.ot = { userFirst: !userToss, turn: 0 };
    this.clock.quarter = 5;
    // Untimed from here: the game clock only has to stay off zero.
    this.clock.time = this.clock.qSecs;
    adminStop(this.clock);
    this.notify({
      title: 'OVERTIME', sub: `${userToss ? this.user.abbr : this.cpu.abbr} wins the toss and will play defense first`,
      extra: 'Each team gets the ball at the 25. No clock, no kickoffs', color: '#9ad7ff',
    });
    this.otTurn();
  }

  /** The next overtime possession: the user's on the field, the CPU's simulated. */
  private otTurn(): void {
    if (!this.otUserBall()) {
      this.otCpuTurn();
      return;
    }
    if (this.otPeriods() >= OVERTIME.shootout) {
      this.drive = { los: OPP_GOAL - 3, ballY: FIELD_W / 2, down: 1, firstDownX: OPP_GOAL, try: true };
      this.notify({ title: 'YOUR TWO-POINT TRY', sub: this.scoreLine(), extra: 'One play from the 3', color: '#9ad7ff' });
      this.showNotices('pat');
      return;
    }
    this.drive = this.freshDrive(OVERTIME.start);
    adminStop(this.clock);
    this.notify({ title: 'YOUR BALL', sub: this.scoreLine(), extra: `At the ${fieldLabel(this.drive.los)}`, color: '#9ad7ff' });
    this.showNotices('call');
  }

  /**
   * The CPU's overtime possession, simulated: an untimed drive from the 25, whose touchdown takes the
   * kick in the 1st period and goes for two after that, or one two-point play in the shootout.
   */
  private otCpuTurn(): void {
    const period = this.otPeriods();
    const second = this.ot!.turn === 1;
    if (period >= OVERTIME.shootout) {
      this.cpuTwoPoint();
      this.otNext();
      return;
    }
    const otClock: DriveClock = { timeLeft: Infinity, hurry: false, milk: false, lead: this.score.cpu - this.score.user, ot: second ? 'second' : 'first' };
    const { sim, plays, credit, snaps } = this.engineCpu(OVERTIME.start, otClock);
    this.liveDrives?.push(this.withSubs(driveLog(this.cpu.id, plays, sim, true, credit.snaps)));
    // The drive sim's touchdown has the kick in it. Going second, a lead after the six ends the game;
    // otherwise kick in the 1st overtime (unless only two ties it) and go for two after that.
    const td = sim.result === 'TOUCHDOWN';
    const six = this.score.cpu + 6;
    const walkOff = td && second && six > this.score.user;
    const kick = td && !walkOff && period < OVERTIME.mustGoForTwo && !(second && this.score.user - six === 2);
    const points = td ? (kick ? 7 : 6) : sim.points;
    const told: StoryDrive = {
      off: this.cpu.id, half: period + 1, left: 0, qSecs: this.clock.qSecs, score: { [this.cpu.id]: this.score.cpu, [this.user.id]: this.score.user },
      start: OVERTIME.start, result: sim.result, points, plays, credit, live: true,
    };
    if (this.liveBox) creditCpuDrive(this.liveBox, sim, plays, credit.snaps, told);
    this.showCpuDrive(told, plays, snaps);
    this.score.cpu += points;
    if (sim.defPoints) {
      // The user's defense scored on the CPU's overtime possession: that ends it (NCAA).
      this.score.user += sim.defPoints === 7 ? 6 : sim.defPoints;
      if (this.liveBox) storyAgainst(this.liveBox, plays[plays.length - 1], sim.defPoints === 7 ? 6 : sim.defPoints, sim.defPoints === 7 ? 'pick6' : 'safety');
      this.notify({ title: `${this.user.abbr} DEFENSE SCORES`, sub: this.scoreLine(), extra: sim.defPoints === 7 ? 'Pick six' : 'Safety', color: '#ffd23f' });
      this.showNotices('final');
      return;
    }
    this.notify({
      title: `${this.cpu.abbr} DRIVE: ${sim.result}`, sub: `${sim.plays} plays, ${sim.yards} yards`,
      extra: kick ? 'Extra point is good' : td && !walkOff ? 'Going for two' : '',
    });
    if (td && !walkOff && !kick) this.cpuTwoPoint();
    this.otNext();
  }

  /**
   * A CPU two-point try, simulated (`simTwoPoint`) and shown as a key play: in overtime, or after a
   * regulation touchdown (`at`: that drive's half and the half's seconds when it ended).
   */
  private cpuTwoPoint(at?: { half: number; left: number }): void {
    const lead = this.score.cpu - this.score.user;
    const sit: Situation = at
      ? { down: 1, toGo: 3, yardsToGoal: 3, secsLeft: at.left, qSecs: this.clock.qSecs, finalHalf: at.half >= 1, lead }
      : { down: 1, toGo: 3, yardsToGoal: 3, secsLeft: 0, qSecs: this.clock.qSecs, finalHalf: true, lead, ot: 'second' };
    const r = engineTry(this.cpuOff!, this.userDef!, sit, driveStream(this.rng), { brain: this.userDc, ocBrain: this.cpuOc, record: true, homeId: this.homeId });
    const good = r.good;
    const plays: SimPlay[] = [r.play];
    const told: StoryDrive = {
      off: this.cpu.id, half: at?.half ?? this.otPeriods() + 1, left: at?.left ?? 0, qSecs: this.clock.qSecs,
      score: { [this.cpu.id]: this.score.cpu, [this.user.id]: this.score.user },
      start: 97, result: good ? 'TOUCHDOWN' : 'DOWNS', points: good ? 2 : 0, try: true, plays, live: true,
      credit: { snaps: [engineCredit(r.play, r.snap, starters(this.cpuSquad), starters(this.userSquad))] },
    };
    if (this.liveBox) storyCpuDrive(this.liveBox, told);
    this.showCpuDrive(told, plays, [r.snap]);
    if (good) this.score.cpu += 2;
    this.notify({ title: `${this.cpu.abbr} TWO-POINT TRY: ${good ? 'GOOD' : 'NO GOOD'}`, sub: this.scoreLine(), extra: '', color: good ? '#ff5a5a' : '#ffd23f' });
  }

  /**
   * The try after a CPU touchdown in regulation: the coach reads the two-point chart (`goForTwo`), then
   * either goes for two or kicks. The kick is good by the kicker's accuracy and confidence (`xpOdds`),
   * counts on the touchdown's drive, and is shown as a replay of the kick unless key plays are off.
   */
  private cpuTry(td: StoryDrive, late: boolean): void {
    const c = this.clock;
    const left = timeLeftInHalf(c);
    const half = c.quarter <= 2 ? 0 : 1;
    // The drive's grades log has the kick in it, always good (`driveLog`): make it the real try.
    const log = this.liveDrives?.[this.liveDrives.length - 1]?.plays;
    const xpAt = log ? log.findIndex((p) => p.kick?.unit === 'xp') : -1;
    const sit: Situation = {
      down: 1, toGo: 3, yardsToGoal: 3, secsLeft: left, qSecs: c.qSecs, finalHalf: half === 1, lead: this.score.cpu - this.score.user,
    };
    if (goForTwo(sit)) {
      this.notify({ title: `${this.cpu.abbr} GOING FOR TWO`, sub: this.scoreLine(), extra: 'One play from the 3', color: '#9ad7ff' });
      if (xpAt >= 0) log!.splice(xpAt, 1);
      this.cpuTwoPoint({ half, left });
      return;
    }
    const k = starters(this.cpuSquad).K;
    const lev = leverage(1, 3, late, PAT.dist);
    const made = this.rng() < xpOdds(k?.r.kac ?? PAT.mid, unitEdge(teamConf(this.cpuSquad).k, lev));
    if (this.keyLevel('defense') !== 'off') {
      // Shown as its own kick from the score after the six; the story keeps it on the touchdown's drive.
      const play: SimPlay = { gain: 0, explosive: false, turnover: false, down: 1, toGo: 3, yard: 97, t: td.left - left, fg: { dist: PAT.dist, made }, lev };
      const drive: StoryDrive = { ...td, score: { [this.cpu.id]: this.score.cpu, [this.user.id]: this.score.user }, points: made ? 1 : 0, plays: [play], credit: { snaps: [] } };
      this.queueShows([{ drive, play, kind: made ? 'xp' : 'xpMiss', priority: 3 }]);
    }
    if (xpAt >= 0) log![xpAt].kick!.good = made;
    if (made) {
      td.points += 1;
      this.score.cpu += 1;
    }
    const name = k ? `${k.first[0]}. ${k.last}`.toUpperCase() : 'THE KICK';
    this.notify({
      title: `${this.cpu.abbr} EXTRA POINT: ${made ? 'GOOD' : 'NO GOOD'}`, sub: this.scoreLine(), extra: made ? `${name} adds the point` : `${name} misses`,
      color: made ? '#ff5a5a' : '#ffd23f',
    });
  }

  /**
   * A CPU possession through the engine (`engineDrive`), on a stream of its own from the game's: the drive,
   * its snaps as the story logs them, who made each (`engineCredit`: the players who did it, no casting),
   * and the engine's snaps (each on tape) aligned with `plays`.
   */
  private engineCpu(start: number, clock: DriveClock): { sim: EngineDrive; plays: SimPlay[]; credit: DriveCredit; snaps: (EngineSnap | undefined)[] } {
    const plays: SimPlay[] = [];
    const snaps: (EngineSnap | undefined)[] = [];
    if (this.userDc) newDrive(this.userDc);
    const sim = engineDrive(this.cpuOff!, this.userDef!, start, driveStream(this.rng), clock, {
      brain: this.userDc, ocBrain: this.cpuOc, record: true, homeId: this.homeId,
      onPlay: (p, snap) => {
        plays.push(p);
        snaps.push(snap);
      },
    });
    const on = this.liveBox?.cpu.on ?? starters(this.cpuSquad);
    const dOn = this.liveBox?.user.on ?? starters(this.userSquad);
    return { sim, plays, credit: { snaps: plays.map((p, i) => engineCredit(p, snaps[i], on, dOn)) }, snaps };
  }

  /**
   * What was called on an engine snap, for its show: the user's defense's call on a CPU snap ("YOUR D: COVER 1
   * ROBBER, KEYING J. SMITH"), or the user's OC's play and what it met on the user's ("YOUR O: MESH VS COVER 3").
   */
  private snapNote(s: EngineSnap, userBall: boolean): string {
    // An audible at the line: a check, or a shift the defense saw (and maybe checked on).
    const aud = s.shifted ? (s.rechecked ? ', SHIFTED, THE D CHECKED' : ', SHIFTED') : s.checked ? ', CHECKED' : '';
    if (userBall) return `YOUR O: ${s.play.name.toUpperCase()}${aud} VS ${s.call.name.toUpperCase()}${s.disguised ? ', DISGUISED' : ''}`;
    const t = s.tags;
    const bits = [s.call.name.toUpperCase()];
    if (s.shifted) bits.push(s.rechecked ? 'CHECKED ON THEIR SHIFT' : 'THEY SHIFTED');
    if (s.disguised) bits.push('DISGUISED');
    if (t.prevent) bits.push('PREVENT');
    if (t.key) bits.push(`KEYING ${(this.cpuRoster[t.key]?.name ?? t.key).toUpperCase()}`);
    if (t.spy) bits.push('QB SPY');
    if (t.contain) bits.push('CONTAIN');
    if (t.trap) bits.push('SITTING ON THE THROW');
    if (t.game) bits.push('STUNT');
    return `YOUR D: ${bits.join(', ')}`;
  }

  /**
   * Queue a CPU drive's key plays at the defense's key-play level (`all`: every snap), each the real snap on
   * tape with the user's call over it. The biggest go to the postgame reel's pool too.
   */
  private showCpuDrive(d: StoryDrive, plays: SimPlay[] = [], snaps: (EngineSnap | undefined)[] = []): void {
    const level = this.keyLevel('defense');
    const at = new Map(plays.map((p, i) => [p, snaps[i]] as const));
    for (const [p, s] of at) if (s?.tape) this.keepCpuTape(p, s.tape);
    if (level === 'off') return;
    for (const k of pickDrive(d, level, 'defense')) {
      const s = at.get(k.play);
      this.notify({ title: '', sub: '', extra: '', show: keyShow(k, this.showCtx!, (Math.random() * 2 ** 31) >>> 0, s ? { tape: s.tape, note: this.snapNote(s, false) } : {}) });
    }
  }

  /** Keep a CPU snap's tape for the postgame reel if it's one of the game's best (as `keepTape`). */
  private keepCpuTape(p: LiveSimPlay, tape: Tape): void {
    const score = tapeScore(p);
    if (score <= 0 || tape.frames.length < 2) return;
    this.tapes.set(p, { tape, score });
    if (this.tapes.size > TAPE.keep) {
      const worst = [...this.tapes].sort((a, b) => a[1].score - b[1].score)[0][0];
      this.tapes.delete(worst);
    }
  }

  /** The user's overtime snap or kick is over: the possession goes on, ends, or ends the game. */
  private otChange(a: Applied): void {
    const c = a.change;
    switch (c.kind) {
      case 'none':
        this.drive = a.drive;
        this.toCall();
        return;
      case 'pat':
        // Going second, a lead after the six wins it: no try.
        if (this.ot!.turn === 1 && this.score.user > this.score.cpu) {
          this.showNotices('final');
          return;
        }
        this.drive = { los: OPP_GOAL - 3, ballY: FIELD_W / 2, down: 1, firstDownX: OPP_GOAL, try: true };
        this.toCall('pat');
        return;
      case 'pick6':
      case 'returnTd':
        // A defensive score ends overtime.
        this.notify({ title: `${this.cpu.abbr} SCORES`, sub: c.kind === 'pick6' ? 'Pick six' : c.sub, extra: 'A defensive score ends overtime' });
        this.showNotices('final');
        return;
      default:
        // A try or a field goal, or the ball lost on downs, a turnover, a missed kick or a safety.
        this.otNext();
    }
  }

  /** An overtime possession is over: the other team's, the next period, or the final. */
  private otNext(): void {
    const ot = this.ot!;
    if (ot.turn === 0) {
      ot.turn = 1;
      this.otTurn();
      return;
    }
    if (this.score.user !== this.score.cpu) {
      this.showNotices('final');
      return;
    }
    ot.turn = 0;
    this.clock.quarter++;
    adminStop(this.clock);
    const p = this.otPeriods();
    const rule = p >= OVERTIME.shootout ? 'Two-point plays from the 3 until a team leads' : 'Teams must go for two after a touchdown';
    this.notify({
      title: `STILL TIED: ${quarterName(this.clock.quarter)}`, sub: this.scoreLine(),
      extra: `${rule}. ${this.otUserBall() ? 'You go' : `${this.cpu.abbr} goes`} first`, color: '#9ad7ff',
    });
    this.otTurn();
  }

  /** The user took the opening kickoff, so the user kicks off to start the second half. */
  private halftime(): void {
    this.notify({ title: 'HALFTIME', sub: this.scoreLine(), extra: `You kick off to ${this.cpu.abbr}`, color: '#9ad7ff' });
    if (this.brain) {
      // Every DC closes the gap to his read at the half. Your OC sees as much of it as his scouting finds.
      brainHalftime(this.brain);
      const lines = adjustments(this.brain, playName);
      const s = this.season;
      const scout = (this.seasonGame && s ? staffFor(s, this.user.id) : buildStaff(this.user)).OC.r.scout;
      const shown = lines.slice(0, scout >= SCOUT_TIERS[3] ? 3 : scout >= SCOUT_TIERS[2] ? 2 : 1);
      if (shown.length) {
        this.notify({ title: `${this.cpu.abbr} ADJUSTS`, sub: shown[0], extra: shown.slice(1).join('. '), color: '#ffd23f' });
      }
      this.dcNote = null;
    }
    // The other side of the ball: your DC's adjustments, and theirs on offense as far as his scouting sees them.
    if (this.userDc) {
      brainHalftime(this.userDc);
      const ours = adjustments(this.userDc, playName).slice(0, 2).map(ourLine);
      if (ours.length) this.notify({ title: 'YOUR DC ADJUSTS', sub: ours[0], extra: ours[1] ?? '', color: '#9ad7ff' });
    }
    if (this.cpuOc) {
      ocHalftime(this.cpuOc);
      const scout = this.dcOf(this.user).r.scout;
      const theirs = ocAdjustments(this.cpuOc, this.cpuOff?.oc.id?.star ?? undefined).slice(0, scout >= SCOUT_TIERS[3] ? 3 : scout >= SCOUT_TIERS[2] ? 2 : 1);
      if (theirs.length) this.notify({ title: `${this.cpu.abbr} OFFENSE ADJUSTS`, sub: theirs[0], extra: theirs.slice(1).join('. '), color: '#ffd23f' });
    }
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

  /** A season game's box score: who threw, caught or carried the user's snap (NCAA: sacks are rushes). */
  private creditSnap(play: Play, o: PlayOutcome): void {
    if (!this.liveBox) return;
    const on = this.liveBox.user.on;
    const qb = on[play.qb.slot];
    const gain = Math.round((o.type === 'td' ? OPP_GOAL : o.spot) - this.drive.los);
    const td = o.type === 'td';
    let snap: UserSnap;
    if (o.type === 'incomplete') snap = { kind: 'inc', qb, yds: 0, td: false };
    else if (o.type === 'int' || o.type === 'pick6') snap = { kind: 'int', qb, yds: 0, td: false, turnover: true };
    else if (play.caught) snap = { kind: 'catch', qb, who: play.ballMan ? on[play.ballMan.slot] : undefined, yds: gain, td };
    else snap = { kind: o.type === 'sack' ? 'sack' : 'run', who: on[(play.ballMan ?? play.qb).slot], yds: gain, td };
    // The CPU defender who made it: the interceptor has the ball, the sacker made the tackle.
    const dOn = this.liveBox.cpu.on;
    const picker = play.carrier?.side === 'def' ? play.carrier : null;
    const stopper = snap.kind === 'int' ? picker : snap.kind === 'sack' ? play.tackler : null;
    if (stopper) snap.by = dOn[stopper.slot];
    creditUserSnap(this.liveBox, snap);

    // The story: the snap as the drive sim would log it, for the game page and the highlights.
    const d = this.drive;
    const turnover = snap.kind === 'int';
    const p: LiveSimPlay = {
      gain: turnover ? 0 : gain, explosive: gain >= 20, turnover, down: d.down, toGo: Math.round(d.firstDownX - d.los), yard: Math.round(d.los - OWN_GOAL), t: 0,
      lev: this.snapLev, first: movesChains(d, o),
    };
    const slotOf = (a: Athlete) => [...Object.entries(on), ...Object.entries(dOn)].find(([, x]) => x === a)?.[0];
    storyUserSnap(this.liveBox, this.snapAt ?? this.atNow(), p, userCredit(snap, slotOf, play.playDef.kind !== 'run'));
    this.lastSnap = p;
    this.keepTape(p, play);
  }

  /** Where the game is now, for the story: the half (2+ in overtime), its seconds left, the score. */
  private atNow(): SnapAt {
    const c = this.clock;
    const ot = inOvertime(c);
    return {
      half: ot ? this.otPeriods() + 1 : c.quarter <= 2 ? 0 : 1, left: ot ? 0 : timeLeftInHalf(c), qSecs: c.qSecs,
      score: { [this.user.id]: this.score.user, [this.cpu.id]: this.score.cpu },
    };
  }

  /** Keep this snap's tape if it's one of the game's best so far (`TAPE.keep`, by `tapeScore`). */
  private keepTape(p: LiveSimPlay, play: Play): void {
    const rec = this.tapeRec;
    if (!rec || rec.play !== play || rec.tape.frames.length < 2) return;
    const score = tapeScore(p);
    if (score <= 0) return;
    this.tapes.set(p, { tape: rec.tape, score });
    if (this.tapes.size > TAPE.keep) {
      const worst = [...this.tapes].sort((a, b) => a[1].score - b[1].score)[0][0];
      this.tapes.delete(worst);
    }
  }

  /** A snap's result in the story: the user's points, the CPU's (a pick six, a safety), or the drive over. */
  /** A kneel (the QB's rush) or a spike (his incompletion) in the box score and the story. No tape. */
  private creditClockSnap(kind: 'kneel' | 'spike', o: PlayOutcome): void {
    if (!this.liveBox) return;
    const on = this.liveBox.user.on;
    const qb = on.QB;
    const d = this.drive;
    const gain = Math.round(o.spot - d.los);
    const snap: UserSnap = kind === 'kneel' ? { kind, qb, who: qb, yds: gain, td: false } : { kind, qb, yds: 0, td: false };
    creditUserSnap(this.liveBox, snap);
    const p: LiveSimPlay = {
      gain, explosive: false, turnover: false, down: d.down, toGo: Math.round(d.firstDownX - d.los), yard: Math.round(d.los - OWN_GOAL), t: 0, lev: 0,
      ...(kind === 'kneel' ? { kneel: true } : { spike: true }),
    };
    const slotOf = (a: Athlete) => Object.entries(on).find(([, x]) => x === a)?.[0];
    storyUserSnap(this.liveBox, this.snapAt ?? this.atNow(), p, userCredit(snap, slotOf, kind === 'spike'));
    this.lastSnap = p;
  }

  private storySnapResult(a: Applied): void {
    const box = this.liveBox;
    if (!box || !this.lastSnap) return;
    if (a.userPoints) storyUserPoints(box, a.userPoints, 'TOUCHDOWN');
    if (a.cpuPoints) storyAgainst(box, this.lastSnap, a.cpuPoints, a.change.kind === 'pick6' ? 'pick6' : 'safety');
    else if (a.change.kind === 'int') storyUserEnd(box, 'TURNOVER');
    else if (a.change.kind === 'downs') storyUserEnd(box, 'DOWNS');
  }

  /**
   * A try in the story: in regulation and the first overtimes its points go on the touchdown's drive;
   * in the shootout it's its own one-snap drive, as in `simGame`.
   */
  private storyTry(play: Play, pts: number): void {
    const box = this.liveBox;
    if (!box) return;
    if (this.otPeriods() < OVERTIME.shootout) {
      storyUserPoints(box, pts);
      return;
    }
    const o = play.outcome!;
    const gain = o.type === 'td' ? 3 : 0;
    const p: LiveSimPlay = { gain, explosive: false, turnover: false, down: 1, toGo: 3, yard: 97, t: 0, lev: 1 };
    const who = play.ballMan ? box.user.on[play.ballMan.slot] : undefined;
    const slot = play.ballMan?.slot;
    const credit = { kind: (play.caught ? 'catch' : 'run') as 'catch' | 'run', pass: play.playDef.kind !== 'run', ...(who && slot ? { who: { slot, name: athleteName(who), yds: gain } } : {}) };
    storyUserSnap(box, this.atNow(), p, credit, { try: true });
    storyUserPoints(box, pts, pts ? 'TOUCHDOWN' : 'DOWNS');
    this.keepTape(p, play);
  }

  /** A kick in the story: a field goal try as a snap, the user's points, a punt ending the drive, a return the CPU scores on. */
  private storyKick(o: KickOutcome, a: Applied): void {
    const box = this.liveBox;
    if (!box) return;
    const at = this.atNow();
    const d = this.drive;
    const kick = (extra: Partial<LiveSimPlay>): LiveSimPlay => {
      const p: LiveSimPlay = { gain: 0, explosive: false, turnover: false, down: d.down, toGo: Math.round(d.firstDownX - d.los), yard: Math.round(d.los - OWN_GOAL), t: 0, lev: this.snapLev, ...extra };
      storyUserSnap(box, at, p, null);
      return p;
    };
    if (o.unit === 'fg') {
      const made = o.result === 'fgGood';
      kick({ fg: { dist: fgDistance(d.los, OPP_GOAL), made } });
      storyUserPoints(box, a.userPoints, made ? 'FIELD GOAL' : 'MISSED FG');
    } else if (o.unit === 'xp') {
      storyUserPoints(box, a.userPoints);
    }
    if (a.cpuPoints) {
      const p = o.unit === 'fg' ? box.open?.plays[box.open.plays.length - 1] ?? kick({ punt: true }) : kick({ punt: true });
      storyAgainst(box, p, a.cpuPoints, a.change.kind === 'safety' ? 'safety' : 'returnTd');
    } else if (o.unit === 'punt') storyUserEnd(box, 'PUNT');
  }

  private logKick(o: KickOutcome): void {
    if (!this.liveDrives) return;
    const good = o.unit === 'fg' ? o.result === 'fgGood' : o.unit === 'xp' ? o.result === 'xpGood' : true;
    if (o.unit === 'fg' && this.liveBox) creditUserFg(this.liveBox, this.liveBox.user.on.K, good);
    const kick = { unit: o.unit, good, ...(o.unit === 'fg' ? { dist: fgDistance(this.drive.los, OPP_GOAL) } : {}) };
    this.liveDrives[0].plays.push({ gain: 0, down: 0, toGo: 0, kick, ...(this.snapLev ? { lev: this.snapLev } : {}) });
  }

  /**
   * A CPU possession from `from` (yards from its own goal), played through the engine against the user's
   * defense (`engineCpu`), burning game clock. The spot is rounded: it's where a live play or kick ended.
   */
  private cpuDrive(from: number): void {
    const start = Math.round(from);
    const c = this.clock;
    const left = timeLeftInHalf(c);
    const diff = this.score.cpu - this.score.user;
    const dc: DriveClock = { timeLeft: left, hurry: false, milk: false, lead: diff, finalHalf: c.quarter >= 3, qSecs: c.qSecs };
    const { sim, plays, credit, snaps } = this.engineCpu(start, dc);
    this.liveDrives?.push(this.withSubs(driveLog(this.cpu.id, plays, sim, false, credit.snaps)));
    const told: StoryDrive = {
      off: this.cpu.id, half: c.quarter <= 2 ? 0 : 1, left, qSecs: c.qSecs, score: { [this.cpu.id]: this.score.cpu, [this.user.id]: this.score.user },
      start, result: sim.result, points: sim.points, plays, credit, live: true,
    };
    // The drive's touchdown counts the kick: here the six goes up first and the try is its own play.
    const td = sim.result === 'TOUCHDOWN';
    if (td) told.points = 6;
    if (this.liveBox) creditCpuDrive(this.liveBox, sim, plays, credit.snaps, told);
    this.showCpuDrive(told, plays, snaps);
    const { halfOver } = advanceSim(c, sim.secs);
    this.score.cpu += told.points;
    const said = this.userDc ? headline(this.userDc, playName) : null;
    const notice = this.notify({
      title: `${this.cpu.abbr} DRIVE: ${sim.result}`,
      sub: `${sim.plays} plays, ${sim.yards} yards, ${mmss(sim.secs)}`,
      extra: '',
      ...(said ? { note: `YOUR DC: ${ourLine(said)}` } : {}),
    });
    // A touchdown that wins the game on the final play needs no try (NCAA rules).
    if (td && !(halfOver && c.quarter >= 4 && this.score.cpu > this.score.user)) this.cpuTry(told, lateAndClose(c.quarter, diff));
    if (sim.defPoints === 7) {
      // The user's defense took it back: six, then the user's own try (even with no time left), then the kickoff.
      this.score.user += 6;
      if (this.liveBox) storyAgainst(this.liveBox, plays[plays.length - 1], 6, 'pick6');
      notice.title = `${this.user.abbr} DEFENSE: PICK SIX`;
      notice.color = '#ffd23f';
      notice.extra = this.scoreLine();
      this.drive = { los: OPP_GOAL - 3, ballY: FIELD_W / 2, down: 1, firstDownX: OPP_GOAL, try: true };
      adminStop(c);
      this.showNotices('pat');
      return;
    }
    if (sim.defPoints === 2) {
      this.score.user += 2;
      if (this.liveBox) storyAgainst(this.liveBox, plays[plays.length - 1], 2, 'safety');
      notice.title = `${this.user.abbr} DEFENSE: SAFETY`;
      notice.color = '#ffd23f';
    }
    if (halfOver) {
      if (c.quarter === 2) {
        this.halftime();
      } else {
        this.endRegulation();
      }
      return;
    }
    // The CPU kicks to the user, live: a punt from where its drive ended, its kickoff after a score, its free kick after a safety.
    const kicks = sim.result === 'PUNT' ? { unit: 'punt' as const, yard: sim.endYard }
      : sim.defPoints === 2 ? { unit: 'kickoff' as const, yard: SAFETY_KICK_FROM }
      : sim.result === 'TOUCHDOWN' || sim.result === 'FIELD GOAL' ? { unit: 'kickoff' as const, yard: KICKOFF_FROM }
      : null;
    adminStop(c);
    if (kicks && !this.ot) {
      this.pendingCpuKick = kicks;
      notice.extra = kicks.unit === 'punt' ? `${this.cpu.abbr} punts  ${clockText(c)}` : `${this.cpu.abbr} kicks off  ${clockText(c)}`;
      this.showNotices('cpuKick');
      return;
    }
    this.drive = this.freshDrive(userStartAfter(sim, this.rng));
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
    this.finishNotices();
  }

  /** The notice queue is empty: go where it was leading. */
  private finishNotices(): void {
    if (this.afterNotices === 'final') this.screen = 'final';
    else if (this.afterNotices === 'game') this.screen = 'game';
    else if (this.afterNotices === 'kickoff') this.toCall('kickoff');
    else if (this.afterNotices === 'pat') this.toCall('pat');
    else if (this.afterNotices === 'cpuKick' && this.pendingCpuKick) this.startCpuKick();
    else this.toCall();
  }

  /**
   * The CPU kicks to the user, played live: its special-teams coach calls the kick against the user's look
   * (both by situation), its kicker kicks it, and both return units are the AI. The kick play runs in the
   * CPU's frame (it attacks +x), drawn on a mirrored camera in mirrored wind. SPACE skips to the result.
   */
  private startCpuKick(): void {
    const p = this.pendingCpuKick!;
    this.pendingCpuKick = null;
    const kick = { team: this.cpu, roster: this.cpuRoster };
    const recv = { team: this.user, roster: this.userRoster };
    const wind: Wind = { mph: this.wind.mph, dir: { x: -this.wind.dir.x, y: this.wind.dir.y } };
    const c = this.clock;
    const sit = { lead: this.score.cpu - this.score.user, secsLeft: timeLeftInHalf(c), finalHalf: c.quarter >= 3 };
    const opts = { wind, sit, homeId: this.homeId };
    const run = p.unit === 'punt' ? puntRun(kick, recv, p.yard, this.rng, opts) : kickoffRun(kick, recv, this.rng, { ...opts, from: p.yard });
    this.cpuKick = { run, unit: p.unit, yard: p.yard, result: null, banner: null };
    this.kick = run.kp;
    this.kicker = null;
    this.kickFast = false;
    this.applied = null;
    this.play = null;
    this.cam.mirror = true;
    this.cam.setZoom(1, 1, { x: run.kp.los, y: run.kp.ballY });
    this.cam.follow(run.kp.focus().x, run.kp.focus().lead);
    this.screen = 'kick';
  }

  private updateCpuKick(dt: number, input: Input): void {
    const ck = this.cpuKick!;
    const run = ck.run;
    const kp = run.kp;
    const skip = input.hit('Space', 'Enter') || input.mouse.pressed;
    input.mouse.pressed = false;
    if (!ck.result) {
      if (!run.kicker.started) {
        if (kp.time >= KICK_SHOW || skip) {
          run.start();
          if (this.kicksFast()) this.kickFast = true;
        }
      } else if (skip) this.kickFast = true;
      const steps = this.kickFast && run.kicker.started ? Math.ceil(30 / STEP) : 1;
      for (let i = 0; i < steps && !run.done(); i++) {
        run.step();
        if (kp.clockRunning()) tickLive(this.clock, STEP);
      }
      const f = kp.focus();
      this.cam.follow(f.x, f.lead);
      if (run.done()) this.endCpuKick();
      return;
    }
    // The result banner: SPACE or a moment moves the game on.
    kp.update(dt, AUTO_INPUT);
    if ((kp.overTime > 0.6 && skip) || kp.overTime > 2.8) this.afterCpuKick();
  }

  /** The whistle on the CPU's kick: where the user's ball is (or the CPU kept it, or the user scored). */
  private endCpuKick(): void {
    const ck = this.cpuKick!;
    const ek = ck.run.finish();
    ck.result = ek;
    ck.banner = kickCaption(ek, ck.unit, ck.yard);
    adminStop(this.clock);
    const box = this.liveBox;
    if (ek.recvTd) {
      this.score.user += 6;
      if (box) {
        const p: LiveSimPlay = { gain: ek.ret, explosive: true, turnover: false, down: 1, toGo: 10, yard: Math.max(1, 100 - ek.ret), t: 0, lev: 0, punt: true };
        storyUserSnap(box, this.atNow(), p, null);
        storyUserPoints(box, 6, 'TOUCHDOWN');
      }
    }
  }

  private afterCpuKick(): void {
    const ck = this.cpuKick!;
    const ek = ck.result!;
    this.cpuKick = null;
    this.kick = null;
    this.cam.mirror = false;
    if (this.brain) {
      newDrive(this.brain);
      this.dcNote = null;
    }
    if (ek.recvTd) {
      // The user's try, even with no time left.
      this.drive = { los: OPP_GOAL - 3, ballY: FIELD_W / 2, down: 1, firstDownX: OPP_GOAL, try: true };
      this.toCall('pat');
      return;
    }
    if (ek.kickStart !== null) {
      // The CPU kept it: an onside kick or a muff recovered, or a flag on the user's return team.
      this.cpuDrive(ek.kickStart);
      return;
    }
    this.drive = this.freshDrive(ek.recvStart ?? 25);
    if (this.clock.time <= 0) this.periodOver();
    else this.toCall();
  }

  // ------------------------------------------------------------ render

  render(g: CanvasRenderingContext2D): void {
    this.renderScreen(g);
    this.drawToast(g);
  }

  private renderScreen(g: CanvasRenderingContext2D): void {
    g.imageSmoothingEnabled = false;
    beginLinks(this.menuMouse.x, this.menuMouse.y);
    if (
      this.screen === 'title' || this.screen === 'exhibition' || this.screen === 'slots' || this.screen === 'newTeam' || this.screen === 'newSettings' ||
      this.screen === 'settings' || this.screen === 'audio'
    ) {
      this.renderMenu(g);
      return;
    }
    if (this.screen === 'roster') {
      drawRoster(g, buildSquad(TEAMS[this.rosterIdx]), this.rosterPage);
      return;
    }
    if (this.screen === 'wrap' && this.wrapView) {
      drawWrap(g, this.season!, this.wrapView);
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
    if (this.screen === 'program') {
      drawProgram(g, this.season!, this.programView!);
      return;
    }
    if (this.screen === 'office') {
      drawOffice(g, this.season!, this.officeView, this.t);
      return;
    }
    if (this.screen === 'game') {
      const v = this.gameView!;
      const reel = this.reelOn(v);
      const thumbs: ReelThumb[] = reel?.items.map((it) => ({ still: it.still, clock: it.cue.clock, title: KEY_TITLE[it.k.kind] })) ?? [];
      drawGame(g, this.season!, v, thumbs);
      return;
    }
    if (this.screen === 'playbook') {
      const s = this.season!;
      drawPlaybook(g, squadFor(s, s.config.userTeamId), this.bookView, this.starred, this.userBook());
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
    const show = this.screen === 'notice' ? this.notices[0]?.show : undefined;
    if (show && this.showCtx) {
      drawShow(g, show, this.showCtx, this.crowd!, this.debug);
      return;
    }
    drawField(g, this.cam, this.user, this.cpu, this.crowd!);
    const kickoff = this.callMode === 'kickoff' || this.kick?.unit === 'kickoff';
    if (this.cpuKick) drawLines(g, this.cam, this.cpuKick.run.kp.los, this.cpuKick.run.kp.los);
    else drawLines(g, this.cam, kickoff ? KICKOFF_LINE : this.drive.los, kickoff || this.kick ? OPP_GOAL : this.drive.firstDownX);
    if (this.kick) drawKickPlay(g, this.cam, this.kick, this.debug);
    else if (this.play) drawPlay(g, this.cam, this.play, this.debug, false, this.runAssist(), this.menuMouse);
    else this.drawBallSpot(g);

    const center = this.watchOnly ? 'FINAL' : this.cpuKick ? `${this.cpu.abbr} ${this.cpuKick.unit === 'punt' ? 'PUNTS' : 'KICKS OFF'}` : kickoff ? 'KICKOFF' : `${downDistance(this.drive)}  ${fieldLabel(this.drive.los)}`;
    const right = this.watchOnly ? 'SIMULATED' : this.kick ? this.kick.def.name.toUpperCase() : this.play ? this.play.playDef.name.toUpperCase() : 'PLAY CALL';
    const shown = this.screen === 'notice' ? this.notices[0] : undefined;
    drawScorebug(g, this.user, this.cpu, shown?.score ?? this.score, shown?.clock ?? clockText(this.clock), center, right);
    const huddle =
      this.screen === 'call' || (this.screen === 'play' && this.play?.phase === 'presnap') ||
      (this.screen === 'kick' && this.kick?.phase === 'presnap' && !this.cpuKick);
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

    if (this.screen === 'call') {
      this.renderCall(g);
      if (!this.watchOnly) drawSubsChip(g, !this.subs && inBox(SUBS_CHIP, this.menuMouse.x, this.menuMouse.y));
      if (this.subs) {
        const kickoff = this.callMode === 'kickoff';
        drawSubs(g, {
          v: this.subs, squad: this.baseUserSquad, lineup: this.lineup, huddle: this.huddleLineup, out: this.outForGame, team: this.user,
          clock: kickoff ? null : { text: playClockText(this.clock), secs: this.clock.play },
          note: this.subs.side === 'def' ? 'DEFENSE: FROM THEIR NEXT DRIVE.' : this.subs.side === 'off' && this.tempo === 'hurry' ? 'AN OFFENSIVE SUB ENDS THE HURRY-UP.' : '',
        });
      }
    } else if (this.screen === 'notice' && this.notices.length) {
      const n = this.notices[0];
      drawBanner(g, n.title, n.sub, n.color ?? '#ffffff', n.extra);
      if (n.note) {
        g.fillStyle = 'rgba(8,10,14,0.78)';
        g.fillRect(0, 100, VIEW_W, 16);
        text(g, n.note, VIEW_W / 2, 104, { size: 8, align: 'center', color: '#9ad7ff' });
      }
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
    } else if (this.screen === 'final') this.renderFinal(g);
    else if (this.kick) this.renderKickHud(g, this.kick);
    else if (this.play) this.renderPlayHud(g, this.play);
    if (this.debug && this.brain && lastRead && (this.screen === 'call' || this.screen === 'play')) this.renderDcDebug(g);
  }

  /** F1: what the DC expects on this snap and the calls he likes against it (game/defBrain.ts `dcMix`). */
  private renderDcDebug(g: CanvasRenderingContext2D): void {
    const r = lastRead!;
    const b = this.brain!;
    const lines = [
      `DC EXPECTS: ${r.expect.slice(0, 4).map((x) => `${playName(x.id)} ${Math.round(x.w * 100)}`).join(', ')}`,
      `CALLS: ${Object.keys(r.mix).sort((x, y) => r.mix[y] - r.mix[x]).slice(0, 4).map((k) => `${k} ${Math.round(r.mix[k] * 100)}% (id ${Math.round(r.base[k] * 100)}, +${Math.round(r.gain[k] * 100)})`).join('  ')}`,
      `KEY: ${b.keyRead ? `${b.keyRead.slot} ${Math.round(b.keyRead.odds * 100)}%${b.keyed ? ' ON' : ''}` : '-'}   TRAP ${Math.round(b.trapOdds * 100)}%   HEAVY: ${b.heavy ?? '-'}   SNAPS SEEN ${b.model.n.toFixed(1)}`,
    ];
    // The players: the throw they expect right now, and who's on it.
    const e = this.play?.expect;
    if (e) {
      const who = [...this.play!.antic].map(([d, a]) => `${d.slot} ${a.role} ${Math.round(a.s * 100)}`).join(', ');
      lines.push(`THROW: ${e.slot} ${Math.round(e.spot.x - this.play!.los)} YD AT ${e.t.toFixed(1)}S, ${Math.round(e.conf * 100)}%   ${who}`);
    }
    lines.forEach((l, i) => text(g, l.toUpperCase(), 4, 40 + i * 8, { size: 6, color: '#9fe8ff' }));
  }

  private renderKickHud(g: CanvasRenderingContext2D, kp: KickPlay): void {
    const ck = this.cpuKick;
    if (ck) {
      if (ck.banner && ck.result) {
        const r = ck.result;
        const color = r.recvTd ? '#ffd23f' : r.kickStart !== null ? '#ff5a5a' : '#9ad7ff';
        const where = r.recvTd ? 'TOUCHDOWN!' : r.kickStart !== null ? `${this.cpu.abbr} BALL` : `YOUR BALL AT THE ${fieldLabel(OWN_GOAL + (r.recvStart ?? 25)).toUpperCase()}`;
        drawBanner(g, ck.banner.title, ck.banner.line, color, where);
        drawHint(g, 'CLICK OR SPACE TO CONTINUE');
        return;
      }
      text(g, `${this.cpu.abbr}: ${kp.def.name.toUpperCase()}`, VIEW_W / 2, 34, { size: 8, align: 'center', color: '#ffd23f' });
      text(g, `YOUR RETURN TEAM: ${kp.ret === 'block' ? 'PUNT BLOCK' : kp.ret === 'safe' ? 'SAFE' : kp.ret === 'hands' ? 'HANDS TEAM' : 'RETURN'}`, VIEW_W / 2, 46, { align: 'center', color: '#cfe3ff' });
      drawHint(g, 'SPACE: SKIP TO THE RESULT');
      return;
    }
    if (kp.phase === 'over' && kp.outcome && this.applied) {
      const o = kp.outcome;
      const h = this.applied.headline;
      drawBanner(g, o.text, o.sub, o.color, h && h !== o.text && h !== 'BLOCKED' ? h : '');
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
      return;
    }
    const fg = kp.unit === 'fg' || kp.unit === 'xp';
    if (this.kicker) {
      // The user called it; the kicker kicks it. Their look, the call, and the skip.
      const pre = kp.phase === 'presnap';
      text(g, `${kp.def.name.toUpperCase()}${kp.def.good ? `: ${kp.def.good}` : ''}`, VIEW_W / 2, 34, { size: 8, align: 'center', color: '#ffd23f' });
      text(g, lookText(kp.unit, kp.ret), VIEW_W / 2, 46, { align: 'center', color: kp.ret === 'return' ? '#cfe3ff' : '#ff9a5a' });
      drawHint(g, pre ? 'SPACE: GO NOW   ESC: BACK' : 'SPACE: SKIP TO THE RESULT');
      return;
    }
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
    const ot = this.otPeriods();
    const final = ot ? `FINAL/${quarterName(4 + ot)}` : 'FINAL';
    const title = user === cpu ? `${final}: TIE` : user > cpu ? `${final}: ${this.user.abbr} WINS` : `${final}: ${this.cpu.abbr} WINS`;
    drawBanner(g, title, this.scoreLine(), user >= cpu ? '#ffd23f' : '#ff5a5a', `${this.user.school.toUpperCase()} VS ${this.cpu.school.toUpperCase()}`);
    drawHint(g, this.seasonGame || this.watchGame ? 'CLICK OR SPACE TO CONTINUE THE SEASON' : 'CLICK OR SPACE FOR THE EXHIBITION SCREEN');
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
      if (!this.drive.try) this.drawReveal(g, play, extra ? 192 : 180);
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
      return;
    }
    switch (play.phase) {
      case 'presnap': {
        const hc = this.drive.try ? '' : `H: HARD COUNT (${this.hardCountsLeft})   `;
        if (this.audibleOpen) {
          drawAudible(g, this.audView());
          drawHint(g, '1-4/CLICK: AUDIBLE   CHECK: NOBODY MOVES   SHIFT: THEY SEE IT');
        } else {
          drawHint(
            g,
            play.shifting() ? 'SHIFTING: EVERYONE SET FOR A SECOND   ESC: AUDIBLE'
              : play.motion ? 'IN MOTION: WATCH WHO GOES WITH HIM   ESC: AUDIBLE'
              : `SPACE/CLICK: SNAP   M: MOTION   ${hc}ESC: AUDIBLE`,
          );
        }
        if (this.readHelp() !== 'OFF') this.drawShellRead(g);
        if (this.dcNote) this.drawDcNote(g, 34);
        if (this.checkNote) this.drawNote(g, this.checkNote, this.dcNote ? 50 : 34);
        break;
      }
      case 'snap':
      case 'live': {
        // A called give hands off on its own (`Play.autoGive`); only reads offer the choice.
        const ho = play.autoGive && play.calledGive() ? null : play.handoffOption();
        const give = ho === 'pitch' ? 'R-CLICK PITCH  ' : ho ? 'R-CLICK HAND OFF  ' : '';
        drawHint(g, play.scramble ? 'WASD RUN  SHIFT SPRINT' : play.aim ? 'RELEASE TO THROW  WHEEL/1: BULLET-TOUCH-LOB  SPACE: CANCEL' : `${give}DRAG + RELEASE TO THROW  WASD MOVE QB`);
        break;
      }
      case 'air':
        drawHint(g, play.pitch ? 'PITCH...' : 'BALL IN THE AIR...');
        break;
      case 'run':
        drawHint(
          g,
          play.carrier?.side !== 'off' ? 'TACKLE HIM! (AI PURSUIT)'
            : play.canCut(play.carrier) ? 'W/S STEER  +SPACE: CUT (ONCE)  SHIFT SPRINT  NO KEY: WAIT'
            : 'W/S STEER  A SLOW  SHIFT SPRINT',
        );
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

  /** The DC's newest adjustment, as a line over the field. */
  private drawDcNote(g: CanvasRenderingContext2D, y: number): void {
    this.drawNote(g, `DEFENSE: ${this.dcNote}`, y);
  }

  private drawNote(g: CanvasRenderingContext2D, s: string, y: number): void {
    const w = textWidth(g, s) + 16;
    g.fillStyle = 'rgba(40,28,6,0.85)';
    g.fillRect(Math.round(VIEW_W / 2 - w / 2), y - 3, Math.round(w), 14);
    text(g, s, VIEW_W / 2, y, { align: 'center', color: '#ffd23f' });
  }

  /** After the snap: the coverage they were really in, and the look it was shown as. */
  private drawReveal(g: CanvasRenderingContext2D, play: Play, y: number): void {
    const tags = play.def.some((d) => d.assign?.kind === 'spy') ? ' + SPY' : '';
    const s = `THEY WERE IN ${play.defCall.name.toUpperCase()}${tags}${play.disguise && play.isDisguised() ? `, SHOWN AS ${disguiseName(play.disguise)}` : ''}`;
    const w = textWidth(g, s) + 16;
    g.fillStyle = 'rgba(8,10,14,0.8)';
    g.fillRect(Math.round(VIEW_W / 2 - w / 2), y - 3, Math.round(w), 14);
    text(g, s, VIEW_W / 2, y, { align: 'center', color: '#9ad7ff' });
  }

  /** A light pre-snap hint so the user learns to read the shell themselves. */
  private shellRead(): string {
    const play = this.play!;
    const deep = play.def.filter((d) => d.role === 'S' && d.pos.x > play.los + 10).length;
    const walked = play.def.filter((d) => d.role === 'LB' && d.pos.x < play.los + 3).length;
    const press = play.def.filter((d) => d.press).length;
    const shell = deep >= 2 ? 'TWO HIGH' : deep === 1 ? 'SINGLE HIGH' : 'NO DEEP SAFETY';
    if (this.readHelp() === 'SHELL') return shell;
    // The front and the box count are there to see; so is a defender sitting in the middle on the QB.
    const front = play.defCall.front === 'goal' ? '  GOAL LINE' : play.defCall.front === 'bear' ? '  BEAR FRONT' : '';
    const box = play.def.filter((d) => d.pos.x < play.los + 6 && Math.abs(d.pos.y - play.ballY) < 7).length;
    const spy = play.def.some((d) => d.assign?.kind === 'spy') ? '  SPY' : '';
    return `${shell}${front}${box >= 8 ? `  ${box} IN THE BOX` : ''}${walked ? '  LBS WALKED UP' : ''}${press ? `  ${press} PRESSED` : ''}${spy}`;
  }

  private renderCall(g: CanvasRenderingContext2D): void {
    const cards = this.cards();
    const tabs = this.tabs();
    g.fillStyle = 'rgba(8,10,14,0.55)';
    g.fillRect(0, CALL_Y, VIEW_W, 346 - CALL_Y);
    const hc = this.hover >= 0 ? cards[this.hover] : undefined;
    const fallback =
      this.callMode === 'pat' ? 'TOUCHDOWN! KICK THE PAT OR GO FOR TWO'
      : this.callMode === 'kickoff' ? `KICKOFF. ${lookText('kickoff', this.kickLook)}`
      : this.callMode === 'try' ? (this.mustGoForTwo() ? 'OVERTIME: TWO-POINT TRY FROM THE 3' : 'TWO-POINT TRY FROM THE 3   ESC: BACK')
      : this.tabs()[this.tab]?.kind === 'st' && this.drive.down === 4 && !this.ot ? `4TH DOWN. ${lookText('punt', this.kickLook)}`
      : 'CHOOSE A PLAY';
    const tip = hc
      ? (hc.kind === 'twoPt' ? 'Run any play from the 3. Score for two.' : hc.kind === 'kneel' || hc.kind === 'spike' ? CLOCK_TIP[hc.kind] : hc.def.tip).toUpperCase()
      : this.subNote ?? this.clockHint() ?? fallback;
    text(g, tip, VIEW_W / 2, CALL_Y + 6, { size: 8, align: 'center', color: '#ffd23f' });
    if (this.dcNote && this.callMode === 'normal') this.drawDcNote(g, CALL_Y - 16);
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
      const vis = rects.filter((r) => r.w > 0);
      if (rects[0].w === 0) text(g, '<', vis[0].x - 10, CHIP_Y + 2, { color: '#8fa0b8', shadow: false });
      if (rects[rects.length - 1].w === 0) text(g, '>', vis[vis.length - 1].x + vis[vis.length - 1].w + 4, CHIP_Y + 2, { color: '#8fa0b8', shadow: false });
      chipsFor(plays).forEach((f, i) => {
        const r = rects[i];
        if (!r.w) return;
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
        text(g, 'A/D: PICK A PACKAGE. CLICK THE STAR ON A CARD TO SAVE IT HERE.', VIEW_W / 2, CARD_Y0 + 56, {
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

  /** The call screen's line when the clock matters: kneel out a win, spike a running clock in the two-minute drill. */
  private clockHint(): string | null {
    if (this.callMode !== 'normal' || this.ot || this.drive.try) return null;
    const s = this.userSituation();
    if (situationTempo(s) === 'kneel') return 'VICTORY FORMATION: K TO KNEEL IT OUT';
    if (this.clock.mode === 'run' && s.down < 4 && clockOut(s)) return 'CLOCK RUNNING: X TO SPIKE IT';
    return null;
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
    if (c.kind === 'kneel' || c.kind === 'spike') {
      const kneel = c.kind === 'kneel';
      const r = this.cardFrame(g, i, kneel ? 'Kneel' : 'Spike', kneel ? 'VICTORY FORMATION  (K)' : 'STOP THE CLOCK  (X)');
      text(g, kneel ? '-1 YD, CLOCK RUNS' : 'A DOWN FOR THE CLOCK', r.x + r.w / 2, r.y + r.h - 22, { align: 'center', color: kneel ? '#5ce1ff' : '#ffd23f', shadow: false });
      return;
    }
    const d = c.def;
    if (d.unit === 'punt' || d.unit === 'kickoff') {
      this.drawCallKickCard(g, d, i);
      return;
    }
    let sub = 'FROM THE 3, 20 YARDS';
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
      const kicker = this.userRoster.K;
      pts = predictKick({ x: 0, y: 26, z: 0.1 }, { power: 0.85, dir: { x: 1, y: 0 }, loft: d.loft }, kicker.r.kpw, CALM, d.bounce).pts;
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

  /**
   * A punt or kickoff card: where the kicker's version of it comes down and hangs in this wind, how often it
   * goes for a touchback or out of bounds, what it's for and what it risks, and the ST coach's pick.
   */
  private drawCallKickCard(g: CanvasRenderingContext2D, d: KickDef, i: number): void {
    const f = this.kickForecast(d)!;
    let line: string;
    if (d.onside) line = this.kickLook === 'hands' ? 'HANDS TEAM IS IN' : 'NOT EXPECTING IT';
    else line = `${f.land <= 0 ? 'END ZONE' : `THEIR ${Math.max(1, Math.round(f.land))}`}, ${f.hang.toFixed(1)}S HANG`;
    const r = this.cardFrame(g, i, d.name, line, '#cfe3ff');
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const odds = d.onside ? '' : d.unit === 'punt' ? `TB ${pct(f.tb)} OUT ${pct(f.oob)} IN20 ${pct(f.in20)}` : `TB ${pct(f.tb)} OUT ${pct(f.oob)}`;
    if (odds) text(g, odds, r.x + 6, r.y + 25, { color: '#8fa0b8', shadow: false });
    if (d.good) text(g, `+ ${d.good}`, r.x + 6, r.y + 37, { color: '#5cff7a', shadow: false });
    if (d.risk) text(g, `- ${d.risk}`, r.x + 6, r.y + 47, { color: '#ff9a5a', shadow: false });
    if (this.kickTip === d.id) text(g, 'ST COACH', r.x + r.w - 6, r.y + 6, { align: 'right', color: '#ffd23f', shadow: false });
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

  /** The menus before a game or dynasty, over the title backdrop. */
  private renderMenu(g: CanvasRenderingContext2D): void {
    const pick = this.screen === 'newTeam' || this.screen === 'newSettings';
    const user = this.screen === 'settings' ? teamById(this.season!.config.userTeamId) : TEAMS[pick ? this.newTeamIdx : this.userIdx];
    const cpu = TEAMS[this.cpuIdx];
    // The crowd is painted in the two teams' colors; repaint it when either changes.
    const key = `${user.id}|${cpu.id}`;
    if (!this.crowd || this.crowdKey !== key) {
      this.crowd = makeCrowd(user, cpu);
      this.crowdKey = key;
    }
    const { x, y } = this.menuMouse;
    switch (this.screen) {
      case 'title':
        if (this.titleReel) this.titleReel.draw(g);
        else drawBackdrop(g, this.cam, user, cpu, this.crowd);
        drawMainMenu(g, this.menuItems(), this.menuSel);
        this.titleReel?.drawCaption(g, 8, 348);
        break;
      case 'exhibition':
        drawBackdrop(g, this.cam, user, cpu, this.crowd, 'EXHIBITION', 'ANY TWO TEAMS, ONE GAME');
        drawExhibition(
          g, user, cpu, `${QUARTER_LABELS[this.qIdx]}: ${QUARTER_OPTIONS[this.qIdx]}:00 QUARTERS, ~${QUARTER_DRIVES[this.qIdx]} DRIVES`,
          this.exhibitionOptions().join('  '), x, y,
        );
        break;
      case 'slots':
        drawBackdrop(g, this.cam, user, cpu, this.crowd, 'DYNASTY', 'CHOOSE A SAVE SLOT');
        drawSlots(g, Array.from({ length: SLOTS }, (_, i) => slotMeta(i + 1)), this.slotsView);
        break;
      case 'newTeam':
        drawBackdrop(g, this.cam, user, cpu, this.crowd, 'CHOOSE YOUR SCHOOL', 'NEW DYNASTY');
        drawNewTeam(g, user, this.slot, x, y);
        break;
      case 'newSettings':
        drawBackdrop(g, this.cam, user, cpu, this.crowd, 'DYNASTY SETTINGS', 'NEW DYNASTY');
        drawSettings(g, user, this.slot, this.settingRows(), this.settingSel, x, y);
        break;
      case 'settings':
        drawBackdrop(g, this.cam, user, cpu, this.crowd, 'DYNASTY SETTINGS', 'CHANGES SAVE AS YOU MAKE THEM');
        drawSettings(g, user, this.slot, this.settingRows(true), this.settingSel, x, y, true);
        break;
      case 'audio':
        drawBackdrop(g, this.cam, user, cpu, this.crowd, 'SETTINGS', 'SOUND AND CREDITS');
        drawAudioSettings(g, this.audioRows(), this.audioSel, CREDITS, x, y);
        break;
    }
  }
}
