// A simple three-axis autopilot that flies the real flight model: it banks toward a wanted heading,
// pitches for a wanted climb rate to reach an altitude, and works the throttle to hold a speed.
// The title screen's attract flight and the screenshot scenes use it, so what they show is the
// Pipit genuinely flying, never a posed model.

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Fills `controls` to steer `state` toward {heading, altitude, speed} (deg, m, m/s). */
export function autopilot(state, goal, controls) {
  const error = ((goal.heading - state.heading + 540) % 360) - 180;
  const maxBank = (goal.maxBank ?? 30) * Math.PI / 180;
  const wantBank = clamp(error * 0.025, -maxBank, maxBank);
  controls.roll = clamp((wantBank - state.bank) * 2.2 - 0, -1, 1);
  const wantVs = clamp((goal.altitude - state.altitude) * 0.08, -(goal.maxSink ?? 5), goal.maxClimb ?? 5);
  const turnPull = (1 / Math.max(0.3, Math.cos(state.bank)) - 1) * 0.6;
  controls.pitch = clamp((wantVs - state.verticalSpeed) * 0.14 + turnPull, -0.7, 0.8);
  controls.yaw = clamp(-state.bank * 0.0, -1, 1);
  if (goal.speed !== undefined) {
    controls.throttle = clamp(controls.throttle + (goal.speed - state.airspeed) * 0.01, 0.05, 1);
  }
  controls.brakes = false;
  return controls;
}

/** Heading in degrees from (x, z) toward (tx, tz). */
export function bearing(x, z, tx, tz) {
  return ((Math.atan2(tx - x, -(tz - z)) * 180 / Math.PI) + 360) % 360;
}
