// Embroidery machines and hoops. Add a machine here and the whole site picks it up.
// Sizes are the sewable field in mm (w = left-right, h = front-back).
export const MACHINES = {
  "brother-pe900": {
    name: "Brother PE900",
    format: "pes",
    autoTrim: true,
    hoops: { "5x7": { name: '5" × 7" hoop', w: 130, h: 180 } },
    defaultHoop: "5x7",
  },
};
export const DEFAULT_MACHINE = "brother-pe900";
export const MARGIN = 2;

export function hoop(machine = DEFAULT_MACHINE, hoopId) {
  const m = MACHINES[machine], id = hoopId || m.defaultHoop;
  return { ...m.hoops[id], id, machine, machineName: m.name, format: m.format };
}
