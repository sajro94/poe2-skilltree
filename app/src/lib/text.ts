import type { NodeKind } from "../types";

// PoE stat strings embed markup like "[EnergyShield|Energy Shield]" or
// "[Recently]". Collapse to the human-readable part.
export function cleanStat(s: string): string {
  return s.replace(/\[(?:[^\[\]|]*\|)?([^\[\]]*)\]/g, "$1");
}

export const KIND_LABEL: Record<NodeKind, string> = {
  keystone: "Keystone",
  notable: "Notable",
  mastery: "Mastery",
  jewel: "Jewel Socket",
  ascNotable: "Ascendancy Notable",
  ascNormal: "Ascendancy Passive",
  ascStart: "Ascendancy Start",
  small: "Passive",
};
