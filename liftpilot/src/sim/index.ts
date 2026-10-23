// Public API of the simulation: the installation replayed in time with the forces of the verification. No I/O, no
// framework: it runs in the browser (the 3D and the charts) and in the tests.
export { KS, VOCI_SIM } from './norme';
export type { CostanteSim, VoceSim } from './norme';
export { motionProfile } from './profile';
export type { Profile, ProfilePoint } from './profile';
export { physics } from './physics';
export type { Friction, Physics, Pull } from './physics';
export { brakeParams, simModel, travelLimits } from './model';
export type { BrakeParams, BufferParams, RideParams, ScenarioId, ScenarioParams, SimModel, SimRun, SimSummary } from './model';
export { CHANNELS, duration, frameAt, peak } from './series';
export type { Channel, EventId, Frame, Series, SimEvent } from './series';
export { runScenario } from './run';
