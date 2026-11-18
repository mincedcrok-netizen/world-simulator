/**
 * Central registry of EventBus event names.
 *
 * Naming convention:  <domain>:<what happened>   for notifications
 *                     cmd:<domain>:<action>      for requests sent TO a system
 *
 * Always import these constants instead of typing event strings, so a typo
 * becomes an import error instead of a silent no-op.
 */
export const EVENTS = Object.freeze({
  // Application-level
  APP_ERROR: 'app:error',
  SETTINGS_CHANGED: 'settings:changed',

  // World lifecycle (UI/scenes)
  WORLD_CREATE_REQUESTED: 'world:createRequested',
  WORLD_EXIT_REQUESTED: 'world:exitRequested',

  // Simulation -> everyone (notifications)
  SIM_INITIALIZED: 'sim:initialized',
  SIM_STARTED: 'sim:started',
  SIM_STOPPED: 'sim:stopped',
  SIM_PAUSED: 'sim:paused',
  SIM_RESUMED: 'sim:resumed',
  SIM_SPEED_CHANGED: 'sim:speedChanged',
  SIM_YEAR_CHANGED: 'sim:yearChanged',
  SIM_TICK: 'sim:tick',

  // Settlements (Phase 3)
  SETTLEMENTS_CREATED: 'settlements:created',
  SETTLEMENTS_UPDATED: 'settlements:updated',
  SETTLEMENT_PROMOTED: 'settlement:promoted',
  SETTLEMENT_DEMOTED: 'settlement:demoted',
  SETTLEMENT_ABANDONED: 'settlement:abandoned',
  SETTLEMENT_SELECTED: 'settlement:selected',

  // Anyone -> simulation (commands)
  CMD_SIM_PAUSE: 'cmd:sim:pause',
  CMD_SIM_RESUME: 'cmd:sim:resume',
  CMD_SIM_TOGGLE_PAUSE: 'cmd:sim:togglePause',
  CMD_SIM_SET_SPEED: 'cmd:sim:setSpeed',

  // UI -> world view (commands)
  CMD_SETTLEMENT_SELECT: 'cmd:settlement:select',
  CMD_SETTLEMENTS_SET_VISIBLE: 'cmd:settlements:setVisible',
});
