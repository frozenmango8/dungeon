import {
  BUILDINGS,
  DIRECTIONS,
  ECONOMY,
  ENEMIES,
  GRID,
  SAVE_KEY,
  TIMINGS,
  type BuildingKind,
  type Direction,
  type ItemKind,
} from './config'

export type HeroState = 'waiting' | 'equipping' | 'walking' | 'fighting' | 'returning' | 'respawning'

export interface Item {
  id: number
  kind: ItemKind
  progress: number
}

export interface Building {
  id: number
  kind: BuildingKind
  x: number
  y: number
  direction: Direction
  progress: number
  input: ItemKind[]
  output: Item[]
  level: number
  pulse: number
}

export interface Adventurer {
  id: number
  name: string
  state: HeroState
  hp: number
  maxHp: number
  swordDamage: number
  timer: number
  attackTimer: number
  hitFlash: number
  knockback: number
}

export interface Enemy {
  kind: number
  name: string
  hp: number
  maxHp: number
  damage: number
  gold: number
  color: string
  boss: boolean
  attackTimer: number
  hitFlash: number
  knockback: number
}

export type GameEventType =
  | 'ore'
  | 'smelt'
  | 'forge'
  | 'equip'
  | 'hit'
  | 'heroHit'
  | 'defeat'
  | 'coin'
  | 'coinArrive'
  | 'wave'
  | 'boss'
  | 'place'
  | 'delete'
  | 'upgrade'
  | 'objective'

export interface GameEvent {
  id: number
  type: GameEventType
  at: number
  x?: number
  y?: number
  value?: number
  text?: string
  boss?: boolean
}

interface CoinFlight {
  amount: number
  timer: number
  duration: number
}

export interface GameState {
  version: 1
  time: number
  gold: number
  displayedGold: number
  materials: number
  speed: 0 | 1 | 2
  buildings: Building[]
  adventurers: Adventurer[]
  enemy: Enemy | null
  wave: number
  enemiesRemaining: number
  waveTimer: number
  dungeonIdle: number
  swordLevel: number
  equippedCount: number
  swordsCrafted: number
  swordsCraftedRecent: number[]
  objectiveComplete: boolean
  coins: CoinFlight[]
  events: GameEvent[]
  nextId: number
  rng: number
}

const heroNames = ['Bram', 'Tilda', 'Orin']

const item = (state: GameState, kind: ItemKind): Item => ({
  id: state.nextId++,
  kind,
  progress: 0,
})

const starterBuilding = (
  id: number,
  kind: BuildingKind,
  x: number,
  y: number,
): Building => ({
  id,
  kind,
  x,
  y,
  direction: 0,
  progress: kind === 'mine' ? 1.3 : 0,
  input: [],
  output: [],
  level: 1,
  pulse: 0,
})

export function createInitialState(): GameState {
  const layout: Array<[BuildingKind, number, number]> = [
    ['mine', 0, 3],
    ['conveyor', 1, 3],
    ['conveyor', 2, 3],
    ['furnace', 3, 3],
    ['conveyor', 4, 3],
    ['conveyor', 5, 3],
    ['forge', 6, 3],
    ['conveyor', 7, 3],
    ['conveyor', 8, 3],
    ['rack', 9, 3],
  ]

  const state: GameState = {
    version: 1,
    time: 0,
    gold: ECONOMY.startingGold,
    displayedGold: ECONOMY.startingGold,
    materials: 0,
    speed: 1,
    buildings: layout.map(([kind, x, y], index) => starterBuilding(index + 1, kind, x, y)),
    adventurers: heroNames.map((name, index) => ({
      id: index + 1,
      name,
      state: 'waiting',
      hp: 20,
      maxHp: 20,
      swordDamage: 0,
      timer: 0,
      attackTimer: 0.5 + index * 0.16,
      hitFlash: 0,
      knockback: 0,
    })),
    enemy: null,
    wave: 1,
    enemiesRemaining: 3,
    waveTimer: 0,
    dungeonIdle: 0,
    swordLevel: 1,
    equippedCount: 0,
    swordsCrafted: 0,
    swordsCraftedRecent: [],
    objectiveComplete: false,
    coins: [],
    events: [],
    nextId: 20,
    rng: 94721,
  }
  spawnEnemy(state)
  return state
}

function emit(
  state: GameState,
  type: GameEventType,
  details: Omit<GameEvent, 'id' | 'type' | 'at'> = {},
) {
  state.events.push({ id: state.nextId++, type, at: state.time, ...details })
  if (state.events.length > 80) state.events.splice(0, state.events.length - 80)
}

function random(state: GameState) {
  state.rng = (state.rng * 1664525 + 1013904223) >>> 0
  return state.rng / 4294967296
}

function duration(building: Building) {
  const speed = 1 + (building.level - 1) * 0.28
  if (building.kind === 'mine') return TIMINGS.mine / speed
  if (building.kind === 'furnace') return TIMINGS.furnace / speed
  if (building.kind === 'forge') return TIMINGS.forge / speed
  return 1
}

function outputCapacity(building: Building) {
  return building.kind === 'conveyor' ? 1 : 2
}

function acceptedKind(building: Building, kind: ItemKind) {
  if (building.kind === 'conveyor') return true
  if (building.kind === 'furnace') return kind === 'ore'
  if (building.kind === 'forge') return kind === 'bar'
  if (building.kind === 'rack') return kind === 'sword'
  return false
}

function canAccept(building: Building, kind: ItemKind) {
  if (!acceptedKind(building, kind)) return false
  if (building.kind === 'conveyor') return building.output.length === 0
  return building.input.length < (building.kind === 'rack' ? 8 : 2)
}

function receive(building: Building, moved: Item) {
  if (building.kind === 'conveyor') {
    moved.progress = 0
    building.output.push(moved)
  } else {
    building.input.push(moved.kind)
  }
}

function neighbor(state: GameState, building: Building) {
  const delta = DIRECTIONS[building.direction]
  return state.buildings.find(
    (candidate) => candidate.x === building.x + delta.x && candidate.y === building.y + delta.y,
  )
}

function transferOutputs(state: GameState, dt: number) {
  for (const building of state.buildings) {
    if (building.output.length === 0) continue
    const moved = building.output[0]
    if (building.kind === 'conveyor') {
      moved.progress = Math.min(1, moved.progress + dt / TIMINGS.conveyor)
      if (moved.progress < 1) continue
    }
    const target = neighbor(state, building)
    if (!target || !canAccept(target, moved.kind)) continue
    building.output.shift()
    receive(target, moved)
  }
}

function processMachines(state: GameState, dt: number) {
  for (const building of state.buildings) {
    building.pulse = Math.max(0, building.pulse - dt)
    if (building.kind === 'conveyor' || building.kind === 'rack') continue

    const hasRoom = building.output.length < outputCapacity(building)
    const hasInput =
      building.kind === 'mine' ||
      (building.kind === 'furnace' && building.input.includes('ore')) ||
      (building.kind === 'forge' && building.input.includes('bar'))

    if (!hasRoom || !hasInput) continue
    building.progress += dt
    if (building.progress < duration(building)) continue
    building.progress -= duration(building)
    building.pulse = 0.65

    if (building.kind === 'mine') {
      building.output.push(item(state, 'ore'))
      state.materials += 1
      emit(state, 'ore', { x: building.x, y: building.y })
    } else if (building.kind === 'furnace') {
      building.input.splice(building.input.indexOf('ore'), 1)
      building.output.push(item(state, 'bar'))
      emit(state, 'smelt', { x: building.x, y: building.y })
    } else if (building.kind === 'forge') {
      building.input.splice(building.input.indexOf('bar'), 1)
      building.output.push(item(state, 'sword'))
      state.swordsCrafted += 1
      state.swordsCraftedRecent.push(state.time)
      emit(state, 'forge', { x: building.x, y: building.y })
    }
  }
}

function processRack(state: GameState, dt: number) {
  for (const rack of state.buildings.filter((building) => building.kind === 'rack')) {
    const waiting = state.adventurers.find((hero) => hero.state === 'waiting')
    if (!waiting || !rack.input.includes('sword')) {
      rack.progress = 0
      continue
    }
    rack.progress += dt
    if (rack.progress < TIMINGS.rackEquip) continue
    rack.progress = 0
    rack.input.splice(rack.input.indexOf('sword'), 1)
    waiting.state = 'equipping'
    waiting.timer = 0.75
    waiting.hp = waiting.maxHp
    waiting.swordDamage = 5 + (state.swordLevel - 1) * 2
    state.equippedCount += 1
    emit(state, 'equip', { value: waiting.id, text: waiting.name })
    if (!state.objectiveComplete && state.equippedCount >= 3) {
      state.objectiveComplete = true
      emit(state, 'objective', { text: 'Three adventurers equipped!' })
    }
  }
}

function spawnEnemy(state: GameState) {
  const boss = state.wave % 5 === 0
  const template = ENEMIES[(state.wave - 1) % ENEMIES.length]
  const scale = 1 + Math.floor((state.wave - 1) / 3) * 0.18
  const hp = Math.round(template.hp * scale * (boss ? 3.1 : 1))
  state.enemy = {
    kind: (state.wave - 1) % ENEMIES.length,
    name: boss ? `${template.name} Overlord` : template.name,
    hp,
    maxHp: hp,
    damage: Math.round(template.damage * scale * (boss ? 1.45 : 1)),
    gold: Math.round(template.gold * scale * (boss ? 4 : 1)),
    color: template.color,
    boss,
    attackTimer: 1.25,
    hitFlash: 0,
    knockback: 0,
  }
}

function beginWave(state: GameState) {
  state.wave += 1
  state.enemiesRemaining = Math.min(7, 2 + Math.ceil(state.wave / 2))
  state.waveTimer = 0
  spawnEnemy(state)
  emit(state, state.wave % 5 === 0 ? 'boss' : 'wave', {
    value: state.wave,
    text: state.wave % 5 === 0 ? 'BOSS WAVE' : `Wave ${state.wave}`,
    boss: state.wave % 5 === 0,
  })
}

function defeatEnemy(state: GameState) {
  if (!state.enemy) return
  const defeated = state.enemy
  emit(state, 'defeat', { value: defeated.gold, text: defeated.name, boss: defeated.boss })
  state.coins.push({ amount: defeated.gold, timer: 0, duration: defeated.boss ? 1.35 : 0.85 })
  emit(state, 'coin', { value: defeated.gold, boss: defeated.boss })
  state.enemiesRemaining -= 1
  if (state.enemiesRemaining > 0) {
    spawnEnemy(state)
    return
  }
  state.enemy = null
  state.waveTimer = TIMINGS.waveBreak
  for (const hero of state.adventurers) {
    if (hero.state === 'fighting' || hero.state === 'walking' || hero.state === 'equipping') {
      hero.state = 'returning'
      hero.timer = TIMINGS.returnFromDungeon
      hero.swordDamage = 0
    }
  }
  emit(state, state.wave % 5 === 0 ? 'boss' : 'wave', {
    value: state.wave,
    text: state.wave % 5 === 0 ? 'Boss defeated!' : 'Wave cleared!',
    boss: state.wave % 5 === 0,
  })
}

function processAdventurers(state: GameState, dt: number) {
  for (const hero of state.adventurers) {
    hero.hitFlash = Math.max(0, hero.hitFlash - dt)
    hero.knockback = Math.max(0, hero.knockback - dt * 4)
    if (hero.state === 'equipping' || hero.state === 'walking' || hero.state === 'returning' || hero.state === 'respawning') {
      hero.timer -= dt
      if (hero.timer > 0) continue
      if (hero.state === 'equipping') {
        hero.state = 'walking'
        hero.timer = TIMINGS.walkToDungeon
      } else if (hero.state === 'walking') {
        hero.state = state.enemy ? 'fighting' : 'returning'
        hero.timer = state.enemy ? 0 : TIMINGS.returnFromDungeon
      } else {
        hero.state = 'waiting'
        hero.hp = hero.maxHp
        hero.swordDamage = 0
      }
    }
  }

  if (!state.enemy) {
    if (state.waveTimer > 0) {
      state.waveTimer -= dt
      if (state.waveTimer <= 0) beginWave(state)
    }
    return
  }

  state.enemy.hitFlash = Math.max(0, state.enemy.hitFlash - dt)
  state.enemy.knockback = Math.max(0, state.enemy.knockback - dt * 4)
  const fighters = state.adventurers.filter((hero) => hero.state === 'fighting')
  for (const hero of fighters) {
    hero.attackTimer -= dt
    if (hero.attackTimer > 0) continue
    hero.attackTimer = 1.08 + random(state) * 0.18
    const critical = random(state) > 0.86
    const damage = Math.round(hero.swordDamage * (critical ? 1.8 : 1))
    state.enemy.hp -= damage
    state.enemy.hitFlash = 0.14
    state.enemy.knockback = 1
    emit(state, 'hit', { value: damage, text: critical ? 'CRIT' : undefined })
    if (state.enemy.hp <= 0) {
      defeatEnemy(state)
      break
    }
  }

  if (!state.enemy) return
  if (fighters.length === 0) {
    state.dungeonIdle += dt
    if (state.dungeonIdle >= 12) {
      const volunteer = state.adventurers.find((hero) => hero.state === 'waiting')
      if (volunteer) {
        volunteer.state = 'walking'
        volunteer.timer = TIMINGS.walkToDungeon
        volunteer.swordDamage = 1
        state.dungeonIdle = 0
        emit(state, 'wave', { text: `${volunteer.name} grabs a training blade!` })
      }
    }
    return
  }
  state.dungeonIdle = 0
  state.enemy.attackTimer -= dt
  if (state.enemy.attackTimer > 0) return
  state.enemy.attackTimer = 1.35 + random(state) * 0.35
  const target = fighters[Math.floor(random(state) * fighters.length)]
  target.hp -= state.enemy.damage
  target.hitFlash = 0.18
  target.knockback = 1
  emit(state, 'heroHit', { value: state.enemy.damage, text: target.name })
  if (target.hp <= 0) {
    target.state = 'respawning'
    target.timer = TIMINGS.respawn
    target.swordDamage = 0
    target.hp = 0
  }
}

function processCoins(state: GameState, dt: number) {
  for (let index = state.coins.length - 1; index >= 0; index -= 1) {
    const coin = state.coins[index]
    coin.timer += dt
    if (coin.timer < coin.duration) continue
    state.gold += coin.amount
    state.displayedGold = state.gold
    state.coins.splice(index, 1)
    emit(state, 'coinArrive', { value: coin.amount })
  }
}

export function stepGame(state: GameState, dt: number) {
  if (state.speed === 0) return
  const scaled = dt * state.speed
  state.time += scaled
  transferOutputs(state, scaled)
  processMachines(state, scaled)
  processRack(state, scaled)
  processAdventurers(state, scaled)
  processCoins(state, scaled)
  state.swordsCraftedRecent = state.swordsCraftedRecent.filter((time) => state.time - time <= 60)
}

export function buildingStatus(building: Building) {
  if (building.kind === 'conveyor') {
    return building.output.length ? 'Moving item' : 'Ready'
  }
  if (building.kind === 'rack') {
    return building.input.length ? `${building.input.length} sword${building.input.length === 1 ? '' : 's'} stored` : 'Needs swords'
  }
  if (building.output.length >= outputCapacity(building)) return 'Output blocked'
  if (building.kind !== 'mine' && building.input.length === 0) {
    return building.kind === 'furnace' ? 'Needs ore' : 'Needs iron bar'
  }
  return 'Producing'
}

export function getBuildError(
  state: GameState,
  kind: BuildingKind,
  x: number,
  y: number,
) {
  if (x < 0 || y < 0 || x >= GRID.cols || y >= GRID.rows) return 'Outside the workshop'
  if (state.buildings.some((building) => building.x === x && building.y === y)) return 'That tile is occupied'
  if (state.gold < BUILDINGS[kind].cost) return `Need ${BUILDINGS[kind].cost - state.gold} more gold`
  return null
}

export function placeBuilding(
  state: GameState,
  kind: BuildingKind,
  x: number,
  y: number,
  direction: Direction,
) {
  const error = getBuildError(state, kind, x, y)
  if (error) return error
  state.gold -= BUILDINGS[kind].cost
  state.displayedGold = state.gold
  const building = starterBuilding(state.nextId++, kind, x, y)
  building.direction = direction
  building.progress = 0
  state.buildings.push(building)
  emit(state, 'place', { x, y, text: BUILDINGS[kind].name })
  return null
}

export function deleteBuilding(state: GameState, id: number) {
  const index = state.buildings.findIndex((building) => building.id === id)
  if (index < 0) return 0
  const [building] = state.buildings.splice(index, 1)
  const refund = Math.floor(BUILDINGS[building.kind].cost * ECONOMY.deleteRefund)
  state.gold += refund
  state.displayedGold = state.gold
  emit(state, 'delete', { x: building.x, y: building.y, value: refund })
  return refund
}

export function upgradeBuilding(state: GameState, id: number) {
  const building = state.buildings.find((candidate) => candidate.id === id)
  if (!building || !['mine', 'furnace', 'forge'].includes(building.kind)) {
    return 'Select a mine, furnace, or forge'
  }
  if (building.level >= 4) return 'Maximum level reached'
  const cost = ECONOMY.machineUpgradeBase * building.level
  if (state.gold < cost) return `Need ${cost - state.gold} more gold`
  state.gold -= cost
  state.displayedGold = state.gold
  building.level += 1
  building.pulse = 1
  emit(state, 'upgrade', { x: building.x, y: building.y, value: building.level, text: building.kind })
  return null
}

export function upgradeSwords(state: GameState) {
  if (state.swordLevel >= 5) return 'Maximum sword damage reached'
  const cost = ECONOMY.swordUpgradeBase * state.swordLevel
  if (state.gold < cost) return `Need ${cost - state.gold} more gold`
  state.gold -= cost
  state.displayedGold = state.gold
  state.swordLevel += 1
  emit(state, 'upgrade', { value: state.swordLevel, text: 'sword' })
  return null
}

export function saveGame(state: GameState) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state))
}

export function loadGame(): GameState {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (!raw) return createInitialState()
    const parsed = JSON.parse(raw) as GameState
    if (parsed.version !== 1 || !Array.isArray(parsed.buildings)) return createInitialState()
    parsed.speed = 1
    parsed.dungeonIdle = parsed.dungeonIdle ?? 0
    parsed.events = []
    parsed.displayedGold = parsed.gold
    return parsed
  } catch {
    return createInitialState()
  }
}

export function resetGame() {
  localStorage.removeItem(SAVE_KEY)
  return createInitialState()
}
