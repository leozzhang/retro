import { pickDefCall, type DefCall } from '../data/defenses';
import { FORMATIONS, PLAY_TABS, playsOfKind, ROUTES, type Formation, type PlayDef } from '../data/plays';
import { KICKOFF_CALLS, kickDef, ST_TAB, type KickDef } from '../data/specialTeams';
import { generateRoster, TEAMS, type RosterPlayer, type Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, OPP_GOAL, OWN_GOAL, VIEW_W } from '../engine/constants';
import type { Input } from '../engine/input';
import { clamp, type Vec3 } from '../engine/math';
import { drawField, makeCrowd } from '../render/field';
import { drawBanner, drawHint, drawPlayClock, drawScorebug } from '../render/hud';
import { drawKickPlay, drawWind } from '../render/kickRenderer';
import { drawLines, drawPlay } from '../render/renderer';
import { CALM, fgDistance, predictKick, type Wind } from '../sim/kicking';
import { getSprite, teamUniform } from '../render/sprites';
import { text, textWidth } from '../render/text';
import {
  adminStop, advanceSim, afterPlay, clockText, mmss, newClock, nextQuarter, penaltySpot, playClockText,
  QUARTER_OPTIONS, quarterName, readyForPlay, snapClock, tickBetween, tickLive, timeLeftInHalf, type Clock,
} from './clock';
import { KickPlay } from './kickPlay';
import { Play } from './playState';
import { alignY, personnelOf, resolvePlay } from './resolvePlay';
import {
  applyKick, applyOutcome, applyTry, downDistance, fieldLabel, simulateDrive, startDrive, userStartAfter,
  type Applied, type Drive,
} from './rules';
import { newWind, nextQuarterWind, windLabel } from './wind';

type Screen = 'title' | 'call' | 'play' | 'kick' | 'notice' | 'final';

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

/** Formation filter chips for one playbook tab: ALL, then each formation the tab uses (in `FORMATIONS` order). */
function chipsFor(plays: PlayDef[]): (Formation | null)[] {
  return [null, ...FORMATIONS.filter((f) => plays.some((p) => p.formation === f))];
}

const chipLabel = (f: Formation | null) => (f ? f.name.toUpperCase() : 'ALL');

function tabRect(i: number, n: number) {
  const x0 = (VIEW_W - (n * TAB_W + (n - 1) * 4)) / 2;
  return { x: x0 + i * (TAB_W + 4), y: TAB_Y, w: TAB_W, h: TAB_H };
}

function inRect(x: number, y: number, r: { x: number; y: number; w: number; h: number }): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

export class Game {
  private screen: Screen = 'title';
  private userIdx = 0;
  private cpuIdx = 1;
  private qIdx = QUARTER_OPTIONS.indexOf(8);
  private user!: Team;
  private cpu!: Team;
  private userRoster!: Record<string, RosterPlayer>;
  private cpuRoster!: Record<string, RosterPlayer>;
  private crowd: HTMLCanvasElement | null = null;
  private cam = new Camera();
  private rng = Math.random;
  private score = { user: 0, cpu: 0 };
  private clock: Clock = newClock(8);
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
          this.screen = 'title';
          this.titleTime = 0;
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
    const n = TEAMS.length;
    const step = (i: number, d: number, other: number) => {
      let j = (i + d + n) % n;
      if (j === other) j = (j + d + n) % n;
      return j;
    };
    const nq = QUARTER_OPTIONS.length;
    if (input.hit('KeyA', 'ArrowLeft')) this.userIdx = step(this.userIdx, -1, this.cpuIdx);
    if (input.hit('KeyD', 'ArrowRight')) this.userIdx = step(this.userIdx, 1, this.cpuIdx);
    if (input.hit('KeyW', 'ArrowUp')) this.cpuIdx = step(this.cpuIdx, -1, this.userIdx);
    if (input.hit('KeyS', 'ArrowDown')) this.cpuIdx = step(this.cpuIdx, 1, this.userIdx);
    if (input.hit('KeyQ')) this.qIdx = (this.qIdx + nq - 1) % nq;
    if (input.hit('KeyE')) this.qIdx = (this.qIdx + 1) % nq;
    if (input.mouse.pressed) {
      const { x, y } = input.mouse;
      if (y > 150 && y < 268) {
        if (x < VIEW_W / 2) this.userIdx = step(this.userIdx, x < 160 ? -1 : 1, this.cpuIdx);
        else this.cpuIdx = step(this.cpuIdx, x < 480 ? -1 : 1, this.userIdx);
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

  private startGame(): void {
    this.user = TEAMS[this.userIdx];
    this.cpu = TEAMS[this.cpuIdx];
    this.userRoster = generateRoster(this.user);
    this.cpuRoster = generateRoster(this.cpu);
    this.crowd = makeCrowd(this.user, this.cpu);
    this.score = { user: 0, cpu: 0 };
    this.clock = newClock(QUARTER_OPTIONS[this.qIdx]);
    this.drive = startDrive(25);
    this.wind = newWind(this.rng);
    this.windQuarter = 1;
    this.kickSketch.clear();
    this.tab = 0;
    this.toCall();
  }

  // ------------------------------------------------------------ play call

  private toCall(mode: CallMode = 'normal'): void {
    this.screen = 'call';
    this.callMode = mode;
    this.play = null;
    this.kick = null;
    this.applied = null;
    this.defCall = pickDefCall(this.rng);
    this.press = { CB1: this.rng() < 0.35, CB2: this.rng() < 0.35, NB: this.rng() < 0.2 };
    if (mode === 'pat' || mode === 'try') this.tab = Math.min(this.tab, 2);
    readyForPlay(this.clock);
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

  /** The formation chip in use on this tab: the first formation until the user picks one. */
  private chipIndex(): number {
    const plays = this.tabPlays();
    if (!plays) return 0;
    const n = chipsFor(plays).length;
    return Math.min(this.chip[this.tab] ?? (n > 1 ? 1 : 0), n - 1);
  }

  /** Plays under the current formation chip, before paging. */
  private chipPlays(): PlayDef[] {
    const plays = this.tabPlays() ?? [];
    const f = chipsFor(plays)[this.chipIndex()];
    return f ? plays.filter((p) => p.formation === f) : plays;
  }

  private pageCount(): number {
    return Math.max(1, Math.ceil(this.chipPlays().length / PAGE));
  }

  private chipRects(): { x: number; y: number; w: number; h: number }[] {
    const plays = this.tabPlays();
    if (!plays) return [];
    const widths = chipsFor(plays).map((f) => chipLabel(f).length * 8 + 8);
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

  private startPlay(def: PlayDef): void {
    this.play = new Play({
      offTeam: this.user,
      defTeam: this.cpu,
      offRoster: this.userRoster,
      defRoster: this.cpuRoster,
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
    this.kick = new KickPlay({
      kickTeam: this.user,
      recvTeam: this.cpu,
      kickRoster: this.userRoster,
      recvRoster: this.cpuRoster,
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
        if (!this.drive.try) snapClock(this.clock); // tries are untimed
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
        snapClock(this.clock);
        input.mouse.pressed = false; // the snap click must not start the punt aim
      }
    }
    const was = kp.phase;
    kp.update(dt, input);
    if (was === 'presnap' && kp.phase !== 'presnap' && kp.unit === 'fg') snapClock(this.clock);
    if (kp.clockRunning()) tickLive(this.clock, dt);
    const f = kp.focus();
    this.cam.follow(f.x, f.lead);

    if (kp.phase === 'over' && kp.outcome) {
      if (!this.applied) {
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

  /** Simulate a CPU possession from `start` (yards from its own goal), burning game clock. */
  private cpuDrive(start: number): void {
    const c = this.clock;
    const left = timeLeftInHalf(c);
    const diff = this.score.cpu - this.score.user;
    const late = (c.quarter === 4 && left < 300) || (c.quarter === 2 && left < 120);
    const sim = simulateDrive(this.cpu.off, this.user.def, start, this.rng, {
      timeLeft: left, hurry: diff < 0 && late, milk: diff > 0 && c.quarter === 4,
    });
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
    const kicking = this.screen === 'kick' || (this.screen === 'call' && this.cards()[0]?.kind === 'kick');
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
    drawHint(g, 'CLICK OR SPACE FOR THE TITLE SCREEN');
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
        text(g, chipLabel(f), r.x + r.w / 2, r.y + 2, { align: 'center', color: on ? '#ffd23f' : '#8fa0b8', shadow: false });
      });
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

    // Mini play diagram (offense moving right). Width is squashed like the game view, but each card
    // zooms to its own play's spread, so a tight I-Form run reads as well as a four-wide pass.
    const dh = r.h - 28;
    const dy0 = r.y + 25;
    const by = FIELD_W / 2;
    const rp = resolvePlay(p, by, this.flipCall);
    const ys: number[] = [];
    const xs: number[] = [];
    for (const [slot, a] of Object.entries(rp.align)) {
      const y0 = alignY(a, by);
      const rn = rp.routes[slot as keyof typeof rp.routes];
      xs.push(a.dx);
      if (rn === 'block' && a.mode === 'split') continue; // a split-out blocker is pinned to the edge instead
      ys.push(y0);
      const side = Math.sign(by - y0) || rp.strongSign;
      if (rn) for (const [dn, ins] of ROUTES[rn].pts) {
        ys.push(y0 + ins * side);
        xs.push(Math.min(a.dx + dn, 40));
      }
    }
    const half = clamp(Math.max(...ys.map((y) => Math.abs(y - by))) + 2, 8, FIELD_W / 2);
    const minX = Math.min(...xs) - 1;
    const xScale = Math.min(8, (r.w - 18) / (Math.max(...xs) + 2 - minX));
    const sx = (x: number) => r.x + 8 + (x - minX) * xScale;
    const sy = (y: number) => clamp(dy0 + dh / 2 + ((y - by) / (2 * half)) * dh, dy0, dy0 + dh);
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(Math.round(sx(0)), dy0, 1, dh);
    const colors = ['#ffd23f', '#5ce1ff', '#ff7ad9', '#ff9f43', '#9dff7a'];
    let ci = 0;
    for (const [slot, a] of Object.entries(rp.align)) {
      const x0 = a.dx;
      const y0 = clamp(alignY(a, by), 1, FIELD_W - 1);
      const route = rp.routes[slot as keyof typeof rp.routes];
      if (!route || slot === 'QB') {
        g.fillStyle = slot === 'QB' ? '#ffffff' : '#7d8796';
        g.fillRect(Math.round(sx(x0)) - 1, Math.round(sy(y0)) - 1, 2, 2);
        // Run blocking: linemen fire forward.
        if (slot !== 'QB' && p.block === 'run') g.fillRect(Math.round(sx(x0)) + 1, Math.round(sy(y0)) - 2, 1, 4);
        continue;
      }
      const def = ROUTES[route];
      const col = def.run ? '#ffffff' : colors[ci++ % colors.length];
      g.fillStyle = col;
      g.fillRect(Math.round(sx(x0)) - 1, Math.round(sy(y0)) - 1, 3, 3);
      if (route === 'block') {
        if (p.block === 'run') {
          g.fillStyle = '#7d8796';
          g.fillRect(Math.round(sx(x0)) + 2, Math.round(sy(y0)) - 2, 1, 5);
        }
        continue;
      }
      const side = Math.sign(by - y0) || rp.strongSign;
      g.strokeStyle = col;
      g.lineWidth = def.run ? 2 : 1;
      g.beginPath();
      g.moveTo(sx(x0), sy(y0));
      let px = x0;
      let py = y0;
      let lx = x0;
      let ly = y0;
      for (const [dn, ins] of def.pts) {
        lx = px;
        ly = py;
        px = Math.min(x0 + dn, 40);
        py = clamp(y0 + ins * side, 1, FIELD_W - 1);
        g.lineTo(sx(px), sy(py));
      }
      g.stroke();
      g.lineWidth = 1;
      if (def.cont) {
        const vx = px - lx;
        const vy = py - ly;
        const l = Math.hypot(vx, vy) || 1;
        const s = def.run ? 4 : 3;
        g.fillRect(Math.round(sx(px + (vx / l) * 0.8)) - 1, Math.round(sy(py + (vy / l) * 0.8)) - 1, s, s);
      }
    }

    // Pullers: a dotted path flat behind the line to the hole (a kick-out aims just outside it).
    const rbRoute = rp.routes.RB;
    if (rp.pulls.length && rbRoute && ROUTES[rbRoute].run) {
      const ry = clamp(alignY(rp.align.RB, by), 1, FIELD_W - 1);
      const last = ROUTES[rbRoute].pts[ROUTES[rbRoute].pts.length - 1];
      const holeY = ry + last[1] * (Math.sign(by - ry) || rp.strongSign);
      const playSign = Math.sign(holeY - by) || rp.strongSign;
      g.fillStyle = '#ffffff';
      for (const pl of rp.pulls) {
        const a = rp.align[pl.who];
        const oy = alignY(a, by);
        const ty = holeY + (pl.job === 'kick' ? playSign * 2.5 : 0);
        const steps = Math.ceil(Math.abs(ty - oy) / 0.9);
        for (let k = 1; k <= steps; k++) {
          g.fillRect(Math.round(sx(a.dx - 0.8)), Math.round(sy(oy + ((ty - oy) * k) / steps)), 1, 1);
        }
        g.fillRect(Math.round(sx(a.dx - 0.8)) + 1, Math.round(sy(ty)) - 1, 2, 1);
        g.fillRect(Math.round(sx(a.dx - 0.8)) + 3, Math.round(sy(ty)) - 1, 1, 1);
      }
    }
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

    this.drawTeamPanel(g, user, 160, 'YOUR TEAM', 'A / D', true);
    this.drawTeamPanel(g, cpu, 480, 'OPPONENT', 'W / S', false);
    text(g, 'VS', VIEW_W / 2, 196, { size: 16, align: 'center', color: '#ffffff' });
    text(g, `<  QUARTERS: ${QUARTER_OPTIONS[this.qIdx]} MIN  >   (Q / E)`, VIEW_W / 2, 276, { align: 'center', color: '#9ad7ff' });

    if (Math.floor(this.titleTime * 2) % 2 === 0) {
      text(g, 'PRESS ENTER TO KICK OFF', VIEW_W / 2, 300, { size: 8, align: 'center', color: '#ffffff' });
    }
    text(g, 'DRAG + RELEASE TO PASS.  R-CLICK HAND OFF.  WASD MOVE.  SHIFT SPRINT.', VIEW_W / 2, 330, {
      size: 8, align: 'center', color: '#8fa0b8',
    });
  }

  private drawTeamPanel(g: CanvasRenderingContext2D, t: Team, cx: number, label: string, keys: string, home: boolean): void {
    text(g, label, cx, 108, { align: 'center', color: '#8fa0b8' });
    const spr = getSprite(teamUniform(t, home), '#c68a5e', 'stand', home ? 1 : -1);
    g.drawImage(spr, cx - 40, 124, 80, 88);
    text(g, '<', cx - 70, 164, { size: 16, align: 'center', color: '#ffd23f' });
    text(g, '>', cx + 70, 164, { size: 16, align: 'center', color: '#ffd23f' });
    text(g, t.school.toUpperCase(), cx, 222, { size: 12, align: 'center', color: '#ffffff' });
    text(g, `${t.conference.toUpperCase()}  OFF ${t.off}  DEF ${t.def}`, cx, 242, { align: 'center', color: '#cfd6df' });
    text(g, keys, cx, 258, { align: 'center', color: '#5d6b80', shadow: false });
  }
}
