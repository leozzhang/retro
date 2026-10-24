import { pickDefCall, type DefCall } from '../data/defenses';
import { PLAYBOOK, ROUTES, type PlayDef } from '../data/plays';
import { generateRoster, TEAMS, type RosterPlayer, type Team } from '../data/teams';
import { Camera } from '../engine/camera';
import { FIELD_W, VIEW_W } from '../engine/constants';
import type { Input } from '../engine/input';
import { clamp } from '../engine/math';
import { drawField, makeCrowd } from '../render/field';
import { drawBanner, drawHint, drawScorebug } from '../render/hud';
import { drawLines, drawPlay } from '../render/renderer';
import { getSprite, teamUniform } from '../render/sprites';
import { text, textWidth } from '../render/text';
import { Play } from './playState';
import {
  applyOutcome, downDistance, fieldLabel, simulateDrive, startDrive, userStartAfter, type Applied, type Drive,
} from './rules';

type Screen = 'title' | 'call' | 'play' | 'cpu';

/** Slow-motion while the QB is aiming. 1 = off. */
const AIM_TIME_SCALE = 0.65;

const CARD_W = 196;
const CARD_H = 84;
const CARD_GAP = 8;
const CARD_X0 = (VIEW_W - (3 * CARD_W + 2 * CARD_GAP)) / 2;
const CARD_Y0 = 166;

function cardRect(i: number) {
  return { x: CARD_X0 + (i % 3) * (CARD_W + CARD_GAP), y: CARD_Y0 + Math.floor(i / 3) * (CARD_H + CARD_GAP), w: CARD_W, h: CARD_H };
}

export class Game {
  private screen: Screen = 'title';
  private userIdx = 0;
  private cpuIdx = 1;
  private user!: Team;
  private cpu!: Team;
  private userRoster!: Record<string, RosterPlayer>;
  private cpuRoster!: Record<string, RosterPlayer>;
  private crowd: HTMLCanvasElement | null = null;
  private cam = new Camera();
  private rng = Math.random;
  private score = { user: 0, cpu: 0 };
  private drive: Drive = startDrive(25);
  private play: Play | null = null;
  private defCall: DefCall | null = null;
  private press: Record<string, boolean> = {};
  private applied: Applied | null = null;
  private cpuSummary: { title: string; sub: string; extra: string } | null = null;
  private hover = -1;
  private debug = false;
  private titleTime = 0;

  timeScale(): number {
    return this.screen === 'play' && this.play?.aim ? AIM_TIME_SCALE : 1;
  }

  update(dt: number, input: Input): void {
    if (input.hit('F1', 'Backquote')) this.debug = !this.debug;
    switch (this.screen) {
      case 'title':
        this.updateTitle(dt, input);
        break;
      case 'call':
        this.updateCall(input);
        break;
      case 'play':
        this.updatePlay(dt, input);
        break;
      case 'cpu':
        if (input.hit('Space', 'Enter') || input.mouse.pressed) this.toCall();
        break;
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
    if (input.hit('KeyA', 'ArrowLeft')) this.userIdx = step(this.userIdx, -1, this.cpuIdx);
    if (input.hit('KeyD', 'ArrowRight')) this.userIdx = step(this.userIdx, 1, this.cpuIdx);
    if (input.hit('KeyW', 'ArrowUp')) this.cpuIdx = step(this.cpuIdx, -1, this.userIdx);
    if (input.hit('KeyS', 'ArrowDown')) this.cpuIdx = step(this.cpuIdx, 1, this.userIdx);
    if (input.mouse.pressed) {
      const { x, y } = input.mouse;
      if (y > 150 && y < 270) {
        if (x < VIEW_W / 2) this.userIdx = step(this.userIdx, x < 160 ? -1 : 1, this.cpuIdx);
        else this.cpuIdx = step(this.cpuIdx, x < 480 ? -1 : 1, this.userIdx);
      } else if (y > 290) {
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
    this.drive = startDrive(25);
    this.toCall();
  }

  // ------------------------------------------------------------ play call

  private toCall(): void {
    this.screen = 'call';
    this.play = null;
    this.applied = null;
    this.cpuSummary = null;
    this.defCall = pickDefCall(this.rng);
    this.press = { CB1: this.rng() < 0.35, CB2: this.rng() < 0.35, NB: this.rng() < 0.2 };
    this.cam.follow(this.drive.los, 0.4);
  }

  private updateCall(input: Input): void {
    this.hover = -1;
    for (let i = 0; i < PLAYBOOK.length; i++) {
      const r = cardRect(i);
      const { x, y } = input.mouse;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) this.hover = i;
    }
    let chosen = -1;
    for (let i = 0; i < PLAYBOOK.length; i++) if (input.hit(`Digit${i + 1}`, `Numpad${i + 1}`)) chosen = i;
    if (input.mouse.pressed && this.hover >= 0) chosen = this.hover;
    if (chosen >= 0) this.startPlay(PLAYBOOK[chosen]);
    this.cam.follow(this.drive.los, 0.4);
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
      rng: this.rng,
    });
    this.screen = 'play';
  }

  // ------------------------------------------------------------ live play

  private updatePlay(dt: number, input: Input): void {
    const play = this.play!;
    if (play.phase === 'presnap') {
      if (input.hit('Escape', 'Backspace')) {
        this.screen = 'call'; // audible: same defense, pick a new play
        this.play = null;
        return;
      }
      if (input.hit('Space') || input.mouse.pressed) {
        play.snap();
        input.mouse.pressed = false; // the snap click must not start an aim
      }
    }
    play.update(dt, input, this.cam);

    const lead = play.aim ? 0.22 : play.phase === 'run' ? 0.4 : play.phase === 'air' ? 0.45 : 0.35;
    this.cam.follow(play.focusX(), lead);

    if (play.phase === 'over' && play.outcome) {
      if (!this.applied) {
        this.applied = applyOutcome(this.drive, play.outcome);
        this.score.user += this.applied.userPoints;
        this.score.cpu += this.applied.cpuPoints;
      }
      const skip = play.overTime > 0.6 && (input.hit('Space', 'Enter') || input.mouse.pressed);
      if (play.overTime > 2.6 || skip) this.finishPlay(this.applied);
    }
  }

  private finishPlay(a: Applied): void {
    const c = a.change;
    if (c.kind === 'none') {
      this.drive = a.drive;
      this.toCall();
      return;
    }
    if (c.kind === 'pick6') {
      this.drive = startDrive(25);
      this.cpuSummary = { title: `${this.cpu.abbr} SCORES`, sub: 'Pick six. Kickoff to you.', extra: '' };
      this.screen = 'cpu';
      return;
    }
    const cpuStart = c.kind === 'score' ? 25 : c.kind === 'safety' ? 40 : c.cpuStart;
    const sim = simulateDrive(this.cpu.off, this.user.def, cpuStart, this.rng);
    this.score.cpu += sim.points;
    this.drive = startDrive(userStartAfter(sim, this.rng));
    this.cpuSummary = {
      title: `${this.cpu.abbr} DRIVE: ${sim.result}`,
      sub: `${sim.plays} plays, ${sim.yards} yards`,
      extra: `Your ball at the ${fieldLabel(this.drive.los)}`,
    };
    this.screen = 'cpu';
  }

  // ------------------------------------------------------------ render

  render(g: CanvasRenderingContext2D): void {
    g.imageSmoothingEnabled = false;
    if (this.screen === 'title') {
      this.renderTitle(g);
      return;
    }
    drawField(g, this.cam, this.user, this.cpu, this.crowd!);
    drawLines(g, this.cam, this.drive.los, this.drive.firstDownX);
    if (this.play) drawPlay(g, this.cam, this.play, this.debug);
    else this.drawBallSpot(g);

    const center = `${downDistance(this.drive)}  ${fieldLabel(this.drive.los)}`;
    drawScorebug(g, this.user, this.cpu, this.score, center, this.play ? this.play.playDef.name.toUpperCase() : 'PLAY CALL');

    if (this.screen === 'call') this.renderCall(g);
    else if (this.screen === 'cpu' && this.cpuSummary) {
      drawBanner(g, this.cpuSummary.title, this.cpuSummary.sub, '#ffffff', this.cpuSummary.extra);
      drawHint(g, 'CLICK OR SPACE TO CONTINUE');
    } else if (this.play) this.renderPlayHud(g, this.play);
  }

  private drawBallSpot(g: CanvasRenderingContext2D): void {
    const s = this.cam.toScreen(this.drive.los, this.drive.ballY);
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
      case 'live':
        drawHint(g, play.scramble ? 'WASD RUN  SHIFT SPRINT  SPACE JUKE' : 'DRAG BACK + RELEASE TO THROW   WASD MOVE QB');
        break;
      case 'air':
        drawHint(g, 'BALL IN THE AIR...');
        break;
      case 'run':
        drawHint(g, play.carrier?.side === 'off' ? 'W/S STEER  A SLOW  SHIFT SPRINT  SPACE JUKE' : 'TACKLE HIM! (AI PURSUIT)');
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
    g.fillStyle = 'rgba(8,10,14,0.55)';
    g.fillRect(0, 156, VIEW_W, 190);
    const tip = this.hover >= 0 ? PLAYBOOK[this.hover].tip.toUpperCase() : 'CHOOSE A PLAY';
    text(g, tip, VIEW_W / 2, 142, { size: 8, align: 'center', color: '#ffd23f' });
    PLAYBOOK.forEach((p, i) => this.drawCard(g, p, i));
    drawHint(g, 'CLICK A PLAY OR PRESS 1-6');
  }

  private drawCard(g: CanvasRenderingContext2D, p: PlayDef, i: number): void {
    const r = cardRect(i);
    const hot = this.hover === i;
    g.fillStyle = hot ? '#24324a' : '#141b26';
    g.fillRect(r.x, r.y, r.w, r.h);
    g.fillStyle = hot ? '#ffd23f' : this.user.colors.primary;
    g.fillRect(r.x, r.y, r.w, 2);
    text(g, `${i + 1} ${p.name.toUpperCase()}`, r.x + 6, r.y + 6, { color: hot ? '#ffd23f' : '#ffffff' });
    text(g, p.formation.name.toUpperCase(), r.x + 6, r.y + 17, { color: '#8fa0b8', shadow: false });

    // Mini play diagram (offense moving right, field width squashed like the game view)
    const dx0 = r.x + 34;
    const dy0 = r.y + 30;
    const sx = (x: number) => dx0 + x * 3.6;
    const sy = (y: number) => dy0 + (y / FIELD_W) * 48;
    const by = FIELD_W / 2;
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(Math.round(sx(0)), dy0, 1, 48);
    const colors = ['#ffd23f', '#5ce1ff', '#ff7ad9', '#ff9f43', '#9dff7a'];
    let ci = 0;
    for (const [slot, a] of Object.entries(p.formation.align)) {
      const x0 = a.dx;
      const y0 = clamp(a.mode === 'abs' ? a.y : by + a.y, 1, FIELD_W - 1);
      const route = p.routes[slot as keyof typeof p.routes];
      if (!route || slot === 'QB') {
        g.fillStyle = slot === 'QB' ? '#ffffff' : '#7d8796';
        g.fillRect(Math.round(sx(x0)) - 1, Math.round(sy(y0)) - 1, 2, 2);
        continue;
      }
      const col = colors[ci++ % colors.length];
      g.fillStyle = col;
      g.fillRect(Math.round(sx(x0)) - 1, Math.round(sy(y0)) - 1, 3, 3);
      if (route === 'block') continue;
      const side = Math.sign(by - y0) || 1;
      const def = ROUTES[route];
      g.strokeStyle = col;
      g.lineWidth = 1;
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
      if (def.cont) {
        const vx = px - lx;
        const vy = py - ly;
        const l = Math.hypot(vx, vy) || 1;
        g.fillRect(Math.round(sx(px + (vx / l) * 0.8)) - 1, Math.round(sy(py + (vy / l) * 0.8)) - 1, 3, 3);
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

    if (Math.floor(this.titleTime * 2) % 2 === 0) {
      text(g, 'PRESS ENTER TO KICK OFF', VIEW_W / 2, 300, { size: 8, align: 'center', color: '#ffffff' });
    }
    text(g, 'DRAG BACK + RELEASE TO PASS.  WASD MOVE.  SHIFT SPRINT.  SPACE JUKE.', VIEW_W / 2, 330, {
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
