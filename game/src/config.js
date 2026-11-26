// Tuning constants for Kestrel Isles: the world's size, the aircraft's numbers and the rules that
// turn a flight into a sortie (fuel burn, damage limits, landing grades). SI units throughout:
// metres, seconds, kilograms, newtons; speeds are shown to the pilot in knots and feet.

export const WORLD = {
  size: 16000,          // the square of terrain, metres per side, centred on the origin
  segments: 320,        // terrain grid cells per side (50 m each)
  seaFloor: -38,
  seed: 7,
};

export const UNITS = {
  knots: 1.94384,       // m/s -> kt
  feet: 3.28084,        // m -> ft
  fpm: 196.85,          // m/s -> ft/min
};

/** The Pipit KX-2: a two-seat high-wing island hopper with a single piston engine. */
export const AIRCRAFT = {
  name: 'Pipit KX-2',
  mass: 1050,            // kg, crew and half fuel
  wingArea: 16.2,        // m^2
  maxThrust: 4300,       // N at standstill, full throttle
  propSpeedLimit: 98,    // m/s where the propeller stops pulling
  cl0: 0.28,
  clSlope: 5.2,          // per radian
  stallAlpha: 0.27,      // radians, about 15.5 degrees
  cd0: 0.028,
  inducedK: 0.052,
  flapLift: 0.42,
  flapDrag: 0.035,
  gearHeight: 1.55,      // metres from the centre of mass to the ground under the wheels
  rates: { pitch: 1.15, roll: 2.3, yaw: 0.55 },   // rad/s at full deflection and full authority
  authoritySpeed: 34,    // m/s where the controls reach full bite
  vne: 88,               // never-exceed speed, m/s (171 kt)
  fuelCapacity: 160,     // litres
  burnIdle: 0.04,        // litres per second at idle
  burnFull: 0.42,        // litres per second at full throttle
  brakeDecel: 5.5,
};

export const RULES = {
  safeSink: 3.2,         // m/s at touchdown: firmer than this dents the gear
  crashSink: 7.5,        // m/s at touchdown: firmer than this is a crash
  crashBank: 0.5,        // radians of bank at touchdown that puts a wing on the ground
  maxG: 5.2,             // load factor that starts to bend the airframe
  refuelRate: 9,         // litres per second while parked at a strip
  repairRate: 0.08,      // damage removed per second while parked at Halden Field
};

export const STEP = 1 / 120;   // physics step, seconds
