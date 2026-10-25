export const GRID = { cols: 11, rows: 8 } as const

export type BuildingKind = 'mine' | 'conveyor' | 'furnace' | 'forge' | 'rack'
export type ItemKind = 'ore' | 'bar' | 'sword'
export type Direction = 0 | 1 | 2 | 3

export const DIRECTIONS = [
  { x: 1, y: 0, label: 'East' },
  { x: 0, y: 1, label: 'South' },
  { x: -1, y: 0, label: 'West' },
  { x: 0, y: -1, label: 'North' },
] as const

export const BUILDINGS: Record<BuildingKind, {
  name: string
  icon: string
  cost: number
  buildable: boolean
  description: string
  color: string
}> = {
  mine: {
    name: 'Iron Mine',
    icon: '◆',
    cost: 85,
    buildable: true,
    description: 'Extracts iron ore',
    color: '#7f91a3',
  },
  conveyor: {
    name: 'Conveyor',
    icon: '➜',
    cost: 12,
    buildable: true,
    description: 'Moves one item at a time',
    color: '#8f7251',
  },
  furnace: {
    name: 'Furnace',
    icon: '♨',
    cost: 120,
    buildable: true,
    description: 'Smelts ore into bars',
    color: '#d16b38',
  },
  forge: {
    name: 'Sword Forge',
    icon: '⚒',
    cost: 165,
    buildable: true,
    description: 'Hammers bars into swords',
    color: '#d3a83e',
  },
  rack: {
    name: 'Equipment Rack',
    icon: '†',
    cost: 110,
    buildable: true,
    description: 'Equips waiting knights',
    color: '#6f8fc8',
  },
}

export const ECONOMY = {
  startingGold: 260,
  deleteRefund: 0.6,
  machineUpgradeBase: 130,
  swordUpgradeBase: 160,
  bossBonus: 75,
} as const

export const TIMINGS = {
  mine: 2.8,
  conveyor: 0.78,
  furnace: 4.4,
  forge: 5.4,
  rackEquip: 1.2,
  walkToDungeon: 1.8,
  returnFromDungeon: 2.3,
  respawn: 4.5,
  waveBreak: 2.7,
} as const

export const ENEMIES = [
  { name: 'Slime', icon: 'slime', hp: 25, damage: 2, gold: 12, color: '#76b852' },
  { name: 'Cave Bat', icon: 'bat', hp: 34, damage: 3, gold: 16, color: '#8b76bd' },
  { name: 'Stone Imp', icon: 'imp', hp: 46, damage: 4, gold: 22, color: '#bd6652' },
] as const

export const SAVE_KEY = 'dungeon-factory-save-v1'
export const FIXED_STEP = 1 / 60
