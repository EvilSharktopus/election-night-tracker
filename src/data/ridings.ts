import { Demographic } from '../types/game';

const DEMOS: Demographic[] = ['Youth', 'Seniors', 'Workers', 'Business'];

function randomDemo(exclude?: Demographic): Demographic {
  const options = DEMOS.filter(d => d !== exclude);
  return options[Math.floor(Math.random() * options.length)];
}

export interface RidingTemplate {
  id: string;
  name: string;
  region: string;
  seats: number;
  strongDemo: Demographic;
  weakDemo: Demographic;
}

// 33 Canadian-themed ridings totalling exactly 338 seats
// Seat distribution roughly mirrors real Canadian Parliament allocation
const RIDING_TEMPLATES: Omit<RidingTemplate, 'strongDemo' | 'weakDemo'>[] = [
  // BC — 8 ridings, 42 seats (Metro Vancouver split into Downtown + Metro)
  { id: 'bc-van-down', name: 'Vancouver Downtown',  region: 'BC', seats: 6 },
  { id: 'bc-van-metro',name: 'Vancouver Metro',     region: 'BC', seats: 5 },
  { id: 'bc-isle',   name: 'Vancouver Island',     region: 'BC',       seats: 7  },
  { id: 'bc-fraser', name: 'Fraser Valley',        region: 'BC',       seats: 7  },
  { id: 'bc-surrey', name: 'Surrey-Langley',       region: 'BC',       seats: 6  },
  { id: 'bc-burn',   name: 'Burnaby-Coquitlam',    region: 'BC',       seats: 5  },
  { id: 'bc-inter',  name: 'BC Interior',          region: 'BC',       seats: 4  },
  { id: 'bc-north',  name: 'Northern BC',          region: 'BC',       seats: 2  },
  // Prairies — 7 ridings, 62 seats
  { id: 'pr-calg',   name: 'Greater Calgary',      region: 'Prairies', seats: 12 },
  { id: 'pr-edm',    name: 'Greater Edmonton',     region: 'Prairies', seats: 11 },
  { id: 'pr-sab',    name: 'Southern Alberta',     region: 'Prairies', seats: 9  },
  { id: 'pr-sask',   name: 'Saskatchewan',         region: 'Prairies', seats: 14 },
  { id: 'pr-wpg',    name: 'Winnipeg',             region: 'Prairies', seats: 8  },
  { id: 'pr-man',    name: 'Manitoba Rural',       region: 'Prairies', seats: 5  },
  { id: 'pr-north',  name: 'Northern Prairies',    region: 'Prairies', seats: 3  },
  // Ontario — 7 ridings, 121 seats
  { id: 'on-tor',    name: 'Toronto Urban',        region: 'Ontario',  seats: 30 },
  { id: 'on-sub',    name: 'Toronto Suburbs',      region: 'Ontario',  seats: 25 },
  { id: 'on-ott',    name: 'Ottawa-Gatineau',      region: 'Ontario',  seats: 18 },
  { id: 'on-sw',     name: 'Southwestern Ontario', region: 'Ontario',  seats: 18 },
  { id: 'on-ham',    name: 'Niagara-Hamilton',     region: 'Ontario',  seats: 15 },
  { id: 'on-east',   name: 'Eastern Ontario',      region: 'Ontario',  seats: 9  },
  { id: 'on-north',  name: 'Northern Ontario',     region: 'Ontario',  seats: 6  },
  // Quebec — 7 ridings, 78 seats
  { id: 'qc-mtl',    name: 'Greater Montreal',     region: 'Quebec',   seats: 24 },
  { id: 'qc-sub',    name: 'Montreal Suburbs',     region: 'Quebec',   seats: 18 },
  { id: 'qc-city',   name: 'Quebec City',          region: 'Quebec',   seats: 12 },
  { id: 'qc-south',  name: 'Southern Quebec',      region: 'Quebec',   seats: 10 },
  { id: 'qc-east',   name: 'Eastern Quebec',       region: 'Quebec',   seats: 6  },
  { id: 'qc-out',    name: 'Outaouais',            region: 'Quebec',   seats: 5  },
  { id: 'qc-north',  name: 'Northern Quebec',      region: 'Quebec',   seats: 3  },
  // Atlantic — 5 ridings, 35 seats
  { id: 'at-ns',     name: 'Nova Scotia',          region: 'Atlantic', seats: 11 },
  { id: 'at-nb',     name: 'New Brunswick',        region: 'Atlantic', seats: 10 },
  { id: 'at-nfl',    name: 'Newfoundland',         region: 'Atlantic', seats: 7  },
  { id: 'at-pei',    name: 'Prince Edward Island', region: 'Atlantic', seats: 4  },
  { id: 'at-cape',   name: 'Cape Breton',          region: 'Atlantic', seats: 3  },
];
// BC(42) + Prairies(62) + Ontario(121) + Quebec(78) + Atlantic(35) = 338 ✓

export function generateDefaultRidings(): RidingTemplate[] {
  return RIDING_TEMPLATES.map(r => {
    const strong = randomDemo();
    const weak = randomDemo(strong);
    return { ...r, strongDemo: strong, weakDemo: weak };
  });
}

export const REGIONS = ['BC', 'Prairies', 'Ontario', 'Quebec', 'Atlantic'] as const;
