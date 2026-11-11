import type { Team } from '../data/teams';

export type Pose =
  | 'stand' | 'stance' | 'run0' | 'run1' | 'run2' | 'run3'
  | 'throw' | 'throwEnd' | 'catch' | 'down'
  // a hard catch (docs/PASSING.md, placement): stretched out for it on his feet, laid out in the air
  | 'reach' | 'dive'
  // blocking: driving a man back, locked up even, knocked off balance
  | 'drive' | 'fight' | 'stumble'
  // feet stepping on a moving block (one foot up, then the other), and a pass set (hands up, the kick slide)
  | 'drive1' | 'drive2' | 'fight1' | 'fight2' | 'set0' | 'set1' | 'set2'
  // special teams
  | 'kick' | 'hold' | 'puntDrop' | 'fairCatch'
  // touchdown celebrations (sim/celebrate.ts)
  | 'spikeUp' | 'spikeDown' | 'crouch' | 'leap' | 'cheer' | 'spinBall';

/** Pixels a pose draws above the player's spot, off his shadow: the leap. */
export const POSE_LIFT: Partial<Record<Pose, number>> = { leap: 3, dive: 3 };

export interface Uniform {
  key: string;
  helmet: string;
  stripe: string;
  logo: string;
  mask: string;
  jersey: string;
  trim: string;
  pants: string;
  socks: string;
  shoe: string;
}

export const SPR_W = 20;
export const SPR_H = 22;
/** Pixel within the sprite that sits on the player's world position (between the feet). */
export const ANCHOR_X = 10;
export const ANCHOR_Y = 20;

const OUTLINE = '#141414';

export function teamUniform(team: Team, home: boolean): Uniform {
  const c = team.colors;
  return {
    key: `${team.id}-${home ? 'h' : 'a'}`,
    helmet: c.helmet,
    stripe: c.stripe,
    logo: c.logo,
    mask: c.mask,
    jersey: home ? c.jerseyHome : c.jerseyAway,
    trim: home ? c.trimHome : c.trimAway,
    pants: home ? c.pantsHome : c.pantsAway,
    socks: c.socks,
    shoe: '#1b1b1b',
  };
}

type Px = (x: number, y: number, w: number, h: number, col: string) => void;

/**
 * Where an upright player is looking (docs/PASSING.md): `back` = head turned back over his shoulder to
 * the QB while he runs away from him; `hands` = hands up for a ball he's found; `backHands`, both.
 */
export type Look = 'fwd' | 'back' | 'hands' | 'backHands';

// All poses are authored facing right in a 16x20 local box, then offset into
// the 20x22 canvas so the outline pass has room.
function drawUpright(P: Px, u: Uniform, skin: string, pose: Pose, look: Look = 'fwd', ball = false): void {
  const running = pose.startsWith('run');
  const bob = pose === 'run1' || pose === 'run3' ? -1 : 0;
  const fighting = pose === 'fight' || pose === 'fight1' || pose === 'fight2';
  const ux = running || fighting || pose === 'spikeDown' || pose === 'spinBall' ? 1 : pose === 'stumble' ? -1 : 0;
  const uy = bob + (pose === 'crouch' || pose === 'spinBall' ? 1 : 0);

  // Legs
  P(5, 12, 6, 2, u.pants);
  switch (pose) {
    case 'run0':
    case 'run2':
    case 'spikeDown':
      P(9, 14, 2, 1, u.pants); P(10, 15, 2, 1, u.socks); P(11, 16, 2, 2, u.socks); P(12, 18, 2, 1, u.shoe);
      P(5, 14, 2, 1, u.pants); P(4, 15, 2, 1, u.socks); P(3, 16, 2, 1, u.socks); P(1, 17, 3, 1, u.shoe);
      break;
    case 'run1':
      P(7, 14, 2, 1, u.pants); P(7, 15, 2, 3, u.socks); P(7, 18, 3, 1, u.shoe);
      P(9, 13, 2, 2, u.pants); P(10, 15, 2, 2, u.socks); P(10, 17, 3, 1, u.shoe);
      break;
    case 'run3':
      P(8, 14, 2, 1, u.pants); P(8, 15, 2, 3, u.socks); P(8, 18, 3, 1, u.shoe);
      P(5, 14, 2, 1, u.pants); P(4, 15, 2, 1, u.socks); P(3, 15, 1, 1, u.socks); P(2, 14, 2, 1, u.shoe);
      break;
    case 'kick':
      // Plant leg down, kicking leg swung up through the ball.
      P(5, 14, 2, 1, u.pants); P(5, 15, 2, 3, u.socks); P(5, 18, 3, 1, u.shoe);
      P(9, 12, 2, 1, u.pants); P(11, 11, 2, 1, u.socks); P(13, 10, 2, 1, u.socks); P(15, 8, 2, 2, u.shoe);
      break;
    case 'puntDrop':
      P(5, 14, 2, 1, u.pants); P(5, 15, 2, 3, u.socks); P(5, 18, 3, 1, u.shoe);
      P(8, 14, 2, 1, u.pants); P(9, 15, 2, 2, u.socks); P(10, 17, 2, 1, u.socks); P(11, 18, 3, 1, u.shoe);
      break;
    case 'leap':
      // In the air: back leg kicked up behind, front knee driven up.
      P(5, 14, 2, 1, u.pants); P(4, 15, 2, 1, u.socks); P(2, 16, 3, 1, u.socks); P(0, 16, 2, 1, u.shoe);
      P(8, 13, 3, 1, u.pants); P(10, 14, 2, 2, u.socks); P(10, 16, 3, 1, u.shoe);
      break;
    case 'crouch':
    case 'fight':
    case 'set0':
      // Wide, sunk base.
      P(4, 14, 2, 1, u.pants); P(3, 15, 2, 3, u.socks); P(2, 18, 3, 1, u.shoe);
      P(9, 14, 2, 1, u.pants); P(10, 15, 2, 3, u.socks); P(10, 18, 3, 1, u.shoe);
      break;
    case 'fight1':
      // The wide base, back foot up and coming forward.
      P(4, 14, 2, 1, u.pants); P(4, 15, 2, 2, u.socks); P(4, 17, 3, 1, u.shoe);
      P(9, 14, 2, 1, u.pants); P(10, 15, 2, 3, u.socks); P(10, 18, 3, 1, u.shoe);
      break;
    case 'fight2':
      // The wide base, front foot up and stepping.
      P(4, 14, 2, 1, u.pants); P(3, 15, 2, 3, u.socks); P(2, 18, 3, 1, u.shoe);
      P(9, 14, 2, 1, u.pants); P(10, 15, 2, 2, u.socks); P(11, 17, 3, 1, u.shoe);
      break;
    case 'set1':
      // The kick slide: feet gathered under him.
      P(5, 14, 2, 1, u.pants); P(5, 15, 2, 3, u.socks); P(4, 18, 3, 1, u.shoe);
      P(8, 14, 2, 1, u.pants); P(8, 15, 2, 2, u.socks); P(8, 17, 3, 1, u.shoe);
      break;
    case 'set2':
      // The kick slide: back foot reaching, front foot dragging after it.
      P(4, 14, 2, 1, u.pants); P(3, 15, 2, 2, u.socks); P(1, 17, 3, 1, u.shoe);
      P(9, 14, 2, 1, u.pants); P(9, 15, 2, 3, u.socks); P(9, 18, 3, 1, u.shoe);
      break;
    case 'stumble':
      // Feet caught under him, the front one kicked up.
      P(4, 14, 2, 1, u.pants); P(4, 15, 2, 3, u.socks); P(3, 18, 3, 1, u.shoe);
      P(8, 13, 2, 1, u.pants); P(10, 14, 2, 1, u.socks); P(12, 14, 2, 1, u.shoe);
      break;
    default:
      P(5, 14, 2, 1, u.pants); P(5, 15, 2, 3, u.socks); P(5, 18, 3, 1, u.shoe);
      P(8, 14, 2, 1, u.pants); P(8, 15, 2, 3, u.socks); P(8, 18, 3, 1, u.shoe);
  }

  // Torso with shoulder pads and a number block
  P(4 + ux, 7 + uy, 8, 2, u.jersey);
  P(5 + ux, 9 + uy, 6, 3, u.jersey);
  P(6 + ux, 9 + uy, 3, 2, u.trim);
  P(7 + ux, 6 + uy, 2, 1, skin);

  if (look === 'back' || look === 'backHands') {
    // Helmet turned back over his shoulder: the side view mirrored, facemask on the left.
    P(6 + ux, 1 + uy, 4, 1, u.stripe);
    P(5 + ux, 2 + uy, 6, 1, u.helmet);
    P(7 + ux, 3 + uy, 4, 2, u.helmet);
    P(5 + ux, 3 + uy, 2, 2, skin);
    P(4 + ux, 3 + uy, 1, 3, u.mask);
    P(5 + ux, 5 + uy, 2, 1, u.mask);
    P(7 + ux, 5 + uy, 4, 1, u.helmet);
    P(8 + ux, 3 + uy, 2, 2, u.logo);
    P(7 + ux, 2 + uy, 2, 1, 'rgba(255,255,255,0.55)');
  } else {
    drawHelmet(P, u, skin, ux, uy);
  }
  if (look === 'hands' || look === 'backHands') {
    // Both hands up for the ball, clear of the helmet: out in front, or back over his head for one
    // coming over his shoulder (the same arms mirrored about the body).
    const X = (x: number, w: number) => (look === 'hands' ? x : 16 - x - w) + ux;
    P(X(11, 2), 5 + uy, 2, 3, u.jersey); P(X(12, 2), 3 + uy, 2, 2, skin);
    P(X(10, 2), 4 + uy, 2, 2, u.jersey); P(X(11, 2), 0 + uy, 2, 3, u.jersey); P(X(12, 2), -1 + uy, 2, 2, skin);
    return;
  }
  if (ball) drawCarry(P, u, skin, pose, ux, uy);
  else drawArm(P, u, skin, pose, ux, uy);
}

/** Poses whose sprite can draw the ball in his hands (`getSprite`'s `ball`); any other pose leaves it to the ball's spot. */
const CARRY_POSES = new Set<Pose>(['stand', 'run0', 'run1', 'run2', 'run3', 'throw', 'catch', 'stumble', 'fight', 'puntDrop', 'reach', 'dive']);

export function carriesBall(pose: Pose, look: Look = 'fwd'): boolean {
  return look === 'fwd' && CARRY_POSES.has(pose);
}

const BALL_BR = '#7a3e14';
const BALL_HI = '#a65a24';

/** A carried ball, 5x3 from (x, y), ringed in the outline color so it reads against the jersey. */
function drawHeldBall(P: Px, x: number, y: number): void {
  P(x + 1, y - 1, 3, 1, OUTLINE); P(x, y, 5, 1, OUTLINE); P(x - 1, y + 1, 7, 1, OUTLINE);
  P(x, y + 2, 5, 1, OUTLINE); P(x + 1, y + 3, 3, 1, OUTLINE);
  P(x + 1, y, 3, 1, BALL_BR); P(x, y + 1, 5, 1, BALL_BR); P(x + 1, y + 2, 3, 1, BALL_BR);
  P(x + 1, y, 2, 1, BALL_HI); P(x + 2, y + 1, 1, 1, '#ffffff');
}

/** The near arm with the ball in it. */
function drawCarry(P: Px, u: Uniform, skin: string, pose: Pose, ux: number, uy: number): void {
  switch (pose) {
    case 'throw':
      // Cocked back by his ear, the ball in his raised hand.
      P(4, 4, 2, 4, u.jersey);
      drawHeldBall(P, 0, 0);
      P(3, 2, 2, 2, skin);
      break;
    case 'catch':
      // Just pulled in: the ball in both hands out in front of his face.
      P(10, 4, 2, 3, u.jersey);
      drawHeldBall(P, 11, 1);
      P(11, 3, 2, 1, skin); P(15, 2, 1, 1, skin);
      break;
    case 'puntDrop':
      // Held out in front, about to drop it on the foot.
      P(10, 8, 3, 1, u.jersey);
      drawHeldBall(P, 12, 9);
      P(13, 8, 2, 1, skin);
      break;
    default:
      // Tucked high and tight against the chest, the forearm cradling it from underneath.
      drawHeldBall(P, 10 + ux, 8 + uy);
      P(9 + ux, 8 + uy, 2, 2, u.jersey);
      P(10 + ux, 10 + uy, 4, 1, skin);
  }
}

function drawHelmet(P: Px, u: Uniform, skin: string, ux: number, uy: number): void {
  // Helmet (side view, facemask on the right)
  P(6 + ux, 1 + uy, 4, 1, u.stripe);
  P(5 + ux, 2 + uy, 6, 1, u.helmet);
  P(5 + ux, 3 + uy, 4, 2, u.helmet);
  P(9 + ux, 3 + uy, 2, 2, skin);
  P(11 + ux, 3 + uy, 1, 3, u.mask);
  P(9 + ux, 5 + uy, 2, 1, u.mask);
  P(5 + ux, 5 + uy, 4, 1, u.helmet);
  P(6 + ux, 3 + uy, 2, 2, u.logo);
  P(7 + ux, 2 + uy, 2, 1, 'rgba(255,255,255,0.55)');
}

function drawArm(P: Px, u: Uniform, skin: string, pose: Pose, ux: number, uy: number): void {
  // Near arm
  switch (pose) {
    case 'run0':
      P(10 + ux, 8 + uy, 2, 2, u.jersey); P(12 + ux, 7 + uy, 2, 2, skin);
      break;
    case 'run2':
      P(4 + ux, 8 + uy, 2, 2, u.jersey); P(2 + ux, 9 + uy, 2, 2, skin);
      break;
    case 'throw':
      P(4, 5, 2, 3, u.jersey); P(3, 3, 2, 2, skin);
      break;
    case 'throwEnd':
      P(10, 7, 2, 1, u.jersey); P(12, 7, 2, 2, skin);
      break;
    case 'catch':
      P(10, 4, 2, 3, u.jersey); P(11, 2, 2, 2, skin);
      break;
    case 'kick':
      // Arms out for balance.
      P(2, 7, 2, 1, u.jersey); P(0, 6, 2, 2, skin);
      P(11, 8, 2, 1, u.jersey); P(13, 8, 1, 2, skin);
      break;
    case 'puntDrop':
      // Ball held out in front, about to drop it on the foot.
      P(10, 8, 3, 1, u.jersey); P(13, 8, 2, 2, skin);
      break;
    case 'fairCatch':
      // Arm straight up and waving.
      P(9, 1, 2, 5, u.jersey); P(9, -1, 2, 2, skin);
      break;
    case 'fight':
    case 'fight1':
    case 'fight2':
      // Both hands locked on the man in front of him.
      P(11, 7, 3, 2, u.jersey); P(14, 7, 2, 2, skin);
      P(11, 9, 2, 1, u.jersey); P(13, 9, 2, 1, skin);
      break;
    case 'set0':
    case 'set1':
    case 'set2':
      // Hands up and in close, ready to punch.
      P(10, 8, 2, 1, u.jersey); P(12, 6, 2, 2, skin);
      P(10, 10, 2, 1, u.jersey); P(12, 9, 2, 2, skin);
      break;
    case 'stumble':
      // Arms flung back for balance.
      P(3, 6, 2, 2, u.jersey); P(1, 4, 2, 2, skin);
      break;
    case 'spikeUp':
      // Ball raised high over his head (the ball sprite sits in this hand).
      P(11, 4, 2, 3, u.jersey); P(11, 1, 2, 3, u.jersey); P(11, -1, 2, 2, skin);
      break;
    case 'spikeDown':
      // Arm whipped down and out in front: the ball's gone into the turf.
      P(10 + ux, 8, 2, 2, u.jersey); P(12 + ux, 10, 2, 2, u.jersey); P(13 + ux, 12, 2, 2, skin);
      break;
    case 'spinBall':
      // A quick dip: hand reached down to the top of the ball spinning on its tip.
      P(11, 9, 2, 2, u.jersey); P(12, 11, 2, 1, u.jersey); P(13, 12, 2, 1, skin);
      break;
    case 'leap':
    case 'cheer':
      // Both arms thrown up in a V.
      P(11, 5, 2, 2, u.jersey); P(12, 3, 2, 2, u.jersey); P(13, 1, 2, 2, skin);
      P(3, 5, 2, 2, u.jersey); P(2, 3, 2, 2, u.jersey); P(1, 1, 2, 2, skin);
      break;
    default:
      P(9 + ux, 8 + uy, 2, 2, u.jersey); P(10 + ux, 10 + uy, 2, 2, skin);
  }
}

function drawDrive(P: Px, u: Uniform, skin: string, step = 0): void {
  // Low and leaning in, back leg driving, hands at the man's chest. Stepping: the back foot comes up
  // under him (1), then the front foot reaches (2).
  if (step === 1) {
    P(3, 14, 2, 2, u.pants); P(3, 16, 2, 1, u.socks); P(3, 17, 3, 1, u.shoe);
  } else {
    P(1, 16, 3, 1, u.socks); P(0, 17, 2, 1, u.shoe);
    P(3, 14, 2, 2, u.pants); P(2, 15, 2, 1, u.socks);
  }
  if (step === 2) {
    P(9, 14, 2, 1, u.pants); P(10, 15, 2, 2, u.socks); P(11, 17, 3, 1, u.shoe);
  } else {
    P(9, 14, 2, 1, u.pants); P(10, 15, 2, 3, u.socks); P(10, 18, 3, 1, u.shoe);
  }
  P(4, 11, 7, 3, u.pants);
  P(6, 8, 7, 3, u.jersey);
  P(7, 9, 3, 2, u.trim);
  P(12, 9, 3, 1, u.jersey); P(15, 8, 1, 2, skin);
  P(10, 3, 4, 1, u.stripe);
  P(9, 4, 6, 1, u.helmet);
  P(9, 5, 4, 2, u.helmet);
  P(13, 5, 2, 2, skin);
  P(15, 5, 1, 3, u.mask);
  P(13, 7, 2, 1, u.mask);
  P(9, 7, 4, 1, u.helmet);
  P(10, 5, 2, 2, u.logo);
  P(11, 4, 2, 1, 'rgba(255,255,255,0.55)');
}

function drawStance(P: Px, u: Uniform, skin: string): void {
  // Three-point stance: hips high, flat back, hand in the dirt.
  P(4, 13, 2, 2, u.pants); P(4, 15, 2, 3, u.socks); P(4, 18, 3, 1, u.shoe);
  P(7, 14, 2, 1, u.pants); P(8, 15, 2, 3, u.socks); P(8, 18, 3, 1, u.shoe);
  P(3, 10, 4, 4, u.pants);
  P(6, 9, 6, 4, u.jersey);
  P(7, 10, 3, 2, u.trim);
  P(11, 12, 2, 2, u.jersey); P(11, 14, 2, 4, skin);
  P(11, 6, 4, 1, u.stripe);
  P(10, 7, 6, 1, u.helmet);
  P(10, 8, 4, 2, u.helmet);
  P(14, 8, 1, 2, skin);
  P(15, 8, 1, 3, u.mask);
  P(10, 10, 4, 1, u.helmet);
  P(11, 8, 2, 2, u.logo);
}

function drawHold(P: Px, u: Uniform, skin: string): void {
  // Holder on one knee, facing the kicker's spot, hand on the ball.
  P(3, 17, 6, 2, u.pants); P(2, 18, 2, 1, u.socks); P(0, 18, 2, 1, u.shoe);
  P(8, 15, 2, 4, u.socks); P(8, 18, 3, 1, u.shoe);
  P(4, 13, 7, 2, u.pants);
  P(4, 9, 7, 4, u.jersey);
  P(5, 10, 3, 2, u.trim);
  P(11, 11, 2, 1, u.jersey); P(13, 12, 2, 2, skin);
  P(6, 4, 4, 1, u.stripe);
  P(5, 5, 6, 1, u.helmet);
  P(5, 6, 4, 2, u.helmet);
  P(9, 6, 2, 2, skin);
  P(11, 6, 1, 3, u.mask);
  P(5, 8, 4, 1, u.helmet);
  P(6, 6, 2, 2, u.logo);
}

/**
 * Stretched out for a ball off his line, on his feet: lunging onto the front foot, the back leg trailing,
 * body leaning in and both arms reaching out low in front (the ball at his fingertips when he has it).
 */
function drawReach(P: Px, u: Uniform, skin: string, ball: boolean): void {
  // Front leg bent under him, back leg stretched out behind.
  P(8, 13, 3, 2, u.pants); P(10, 15, 2, 3, u.socks); P(10, 18, 3, 1, u.shoe);
  P(4, 13, 3, 2, u.pants); P(2, 15, 3, 1, u.socks); P(0, 16, 3, 1, u.socks); P(-1, 17, 2, 1, u.shoe);
  P(4, 11, 6, 2, u.pants);
  // Torso leaning forward.
  P(5, 7, 7, 4, u.jersey);
  P(7, 8, 3, 2, u.trim);
  // Helmet out ahead of the body, looking at the ball.
  P(10, 2, 4, 1, u.stripe);
  P(9, 3, 6, 1, u.helmet);
  P(9, 4, 4, 2, u.helmet);
  P(13, 4, 2, 2, skin);
  P(15, 4, 1, 3, u.mask);
  P(13, 6, 2, 1, u.mask);
  P(9, 6, 4, 1, u.helmet);
  P(10, 4, 2, 2, u.logo);
  // Both arms at full length, out and down.
  P(11, 8, 3, 1, u.jersey); P(14, 9, 2, 1, u.jersey); P(15, 10, 2, 1, skin);
  P(11, 10, 2, 1, u.jersey); P(13, 11, 2, 1, u.jersey); P(15, 12, 2, 1, skin);
  if (ball) drawHeldBall(P, 12, 9);
}

/** Laid out in the air, body flat and parallel to the turf, arms out past his helmet (the ball in his hands). */
function drawDive(P: Px, u: Uniform, skin: string, ball: boolean): void {
  P(-2, 12, 2, 2, u.shoe);
  P(0, 12, 3, 2, u.socks);
  P(3, 11, 4, 3, u.pants);
  P(7, 10, 5, 4, u.jersey);
  P(8, 11, 3, 2, u.trim);
  P(12, 9, 4, 1, u.stripe);
  P(11, 10, 5, 1, u.helmet);
  P(11, 11, 3, 2, u.helmet);
  P(14, 11, 2, 2, skin);
  P(16, 11, 1, 2, u.mask);
  P(12, 11, 2, 1, u.logo);
  // Arms stretched out ahead, over the helmet.
  P(12, 8, 3, 1, u.jersey); P(15, 7, 2, 1, u.jersey); P(17, 7, 1, 2, skin);
  if (ball) drawHeldBall(P, 12, 4);
}

function drawDown(P: Px, u: Uniform, skin: string): void {
  // Lying face down after a tackle, head to the right.
  P(-1, 17, 1, 2, u.shoe);
  P(0, 17, 4, 2, u.socks);
  P(4, 16, 4, 3, u.pants);
  P(8, 15, 5, 4, u.jersey);
  P(9, 16, 3, 2, u.trim);
  P(12, 19, 2, 1, skin);
  P(13, 15, 4, 4, u.helmet);
  P(14, 14, 2, 1, u.stripe);
  P(14, 16, 2, 2, u.logo);
  P(17, 16, 1, 2, u.mask);
}

export function outline(g: CanvasRenderingContext2D, w: number, h: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  // Pixels already in the outline color (a held ball's ring) count as edge, not body, so it isn't outlined twice.
  const solid = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const i = (y * w + x) * 4;
    return d[i + 3] > 0 && !(d[i] === 0x14 && d[i + 1] === 0x14 && d[i + 2] === 0x14);
  };
  const edge: [number, number][] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
    }
  }
  g.fillStyle = OUTLINE;
  for (const [x, y] of edge) g.fillRect(x, y, 1, 1);
}

function paint(u: Uniform, skin: string, pose: Pose, look: Look, ball: boolean): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SPR_W;
  c.height = SPR_H;
  const g = c.getContext('2d')!;
  const ox = 2;
  const oy = 1;
  const P: Px = (x, y, w, h, col) => {
    g.fillStyle = col;
    g.fillRect(x + ox, y + oy, w, h);
  };
  if (pose === 'down') drawDown(P, u, skin);
  else if (pose === 'stance') drawStance(P, u, skin);
  else if (pose === 'hold') drawHold(P, u, skin);
  else if (pose === 'drive' || pose === 'drive1' || pose === 'drive2') drawDrive(P, u, skin, pose === 'drive' ? 0 : pose === 'drive1' ? 1 : 2);
  else if (pose === 'reach') drawReach(P, u, skin, ball && carriesBall(pose, look));
  else if (pose === 'dive') drawDive(P, u, skin, ball && carriesBall(pose, look));
  else drawUpright(P, u, skin, pose, look, ball && carriesBall(pose, look));
  outline(g, SPR_W, SPR_H);
  return c;
}

const cache = new Map<string, HTMLCanvasElement>();

/** `ball`: he has the ball, drawn in his hands when `carriesBall` says the pose can. */
export function getSprite(u: Uniform, skin: string, pose: Pose, facing: 1 | -1, look: Look = 'fwd', ball = false): HTMLCanvasElement {
  const carry = ball && carriesBall(pose, look);
  const key = `${u.key}|${skin}|${pose}|${facing}|${look}${carry ? '|b' : ''}`;
  let s = cache.get(key);
  if (s) return s;
  if (facing === 1) {
    s = paint(u, skin, pose, look, carry);
  } else {
    const base = getSprite(u, skin, pose, 1, look, carry);
    s = document.createElement('canvas');
    s.width = SPR_W;
    s.height = SPR_H;
    const g = s.getContext('2d')!;
    g.translate(SPR_W, 0);
    g.scale(-1, 1);
    g.drawImage(base, 0, 0);
  }
  cache.set(key, s);
  return s;
}

const ballSprites: HTMLCanvasElement[] = [];

/** A ball spun on its tip, by quarter turns: the laces sweep across the front, then around the back. */
const SPIN_FRAMES = [4, 5, 6, 7];
export function spinFrame(spin: number | undefined): number {
  return spin === undefined ? 0 : SPIN_FRAMES[Math.floor(spin) % 4];
}

/**
 * Ball sprite. Frame 0 is the ball on its side (carried, passes); frames 1-3
 * tilt it end over end for kicks; frames 4-7 are the ball spinning upright on its tip, the laces at the left, middle, right, then behind. All are 8x8 with the ball centered at (4, 4).
 */
export function getBallSprite(frame = 0): HTMLCanvasElement {
  const f = frame >= 4 && frame <= 7 ? frame : frame % 4;
  if (ballSprites[f]) return ballSprites[f];
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const g = c.getContext('2d')!;
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  const BR = '#7a3e14';
  const HI = '#a65a24';
  if (f === 0) {
    px(2, 3, 4, 3, BR); px(1, 4, 6, 1, BR); px(2, 3, 3, 1, HI); px(3, 4, 2, 1, '#ffffff');
  } else if (f === 1 || f === 3) {
    // Tilted 45 degrees (mirrored for frame 3).
    const m = (x: number) => (f === 1 ? x : 7 - x);
    for (const [x, y] of [[2, 5], [3, 4], [4, 3], [5, 2], [3, 5], [4, 4], [5, 3], [2, 4], [4, 2]] as const) px(m(x), y, 1, 1, BR);
    px(m(4), 3, 1, 1, HI);
    px(m(3), 4, 1, 1, '#ffffff');
  } else if (f >= 4) {
    // Upright on its tip, spinning: the laces sweep across the front (none showing when they're around back).
    px(3, 2, 3, 4, BR); px(4, 1, 1, 6, BR); px(3, 2, 1, 1, HI);
    if (f < 7) px(f - 1, 3, 1, 2, '#ffffff');
  } else {
    // Nose up.
    px(3, 2, 3, 4, BR); px(4, 1, 1, 6, BR); px(3, 2, 1, 2, HI); px(4, 3, 1, 2, '#ffffff');
  }
  outline(g, 8, 8);
  ballSprites[f] = c;
  return c;
}

let teeSprite: HTMLCanvasElement | null = null;

export function getTeeSprite(): HTMLCanvasElement {
  if (teeSprite) return teeSprite;
  const c = document.createElement('canvas');
  c.width = 6;
  c.height = 3;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff7a1a';
  g.fillRect(2, 0, 2, 1);
  g.fillRect(1, 1, 4, 1);
  g.fillRect(0, 2, 6, 1);
  teeSprite = c;
  return c;
}
