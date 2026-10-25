import { beforeEach, describe, expect, it } from 'vitest'
import { BUILDINGS, ECONOMY, FIXED_STEP, SAVE_KEY } from './config'
import {
  buildingStatus,
  createInitialState,
  deleteBuilding,
  loadGame,
  placeBuilding,
  saveGame,
  stepGame,
} from './simulation'

const storage = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  },
})

function runFor(state: ReturnType<typeof createInitialState>, seconds: number) {
  const steps = Math.round(seconds / FIXED_STEP)
  for (let index = 0; index < steps; index += 1) stepGame(state, FIXED_STEP)
}

describe('Dungeon Factory simulation', () => {
  beforeEach(() => storage.clear())

  it('runs the complete starter factory and dungeon loop', () => {
    const state = createInitialState()
    state.speed = 2

    runFor(state, 180)

    expect(state.swordsCrafted).toBeGreaterThanOrEqual(6)
    expect(state.equippedCount).toBeGreaterThanOrEqual(3)
    expect(state.objectiveComplete).toBe(true)
    expect(state.wave).toBeGreaterThan(1)
    expect(state.gold).toBeGreaterThan(ECONOMY.startingGold)
  })

  it('is deterministic for equal inputs and fixed timesteps', () => {
    const first = createInitialState()
    const second = createInitialState()

    runFor(first, 90)
    runFor(second, 90)

    expect(second).toEqual(first)
  })

  it('backs up full outputs without losing items', () => {
    const state = createInitialState()
    const rack = state.buildings.find((building) => building.kind === 'rack')!
    rack.input = Array.from({ length: 8 }, () => 'sword')
    for (const hero of state.adventurers) hero.state = 'fighting'

    runFor(state, 60)

    const blocked = state.buildings.filter((building) => buildingStatus(building) === 'Output blocked')
    const trackedItems = state.buildings.reduce(
      (sum, building) => sum + building.input.length + building.output.length,
      0,
    )
    expect(blocked.length).toBeGreaterThan(0)
    expect(trackedItems).toBeGreaterThan(8)
  })

  it('places directional buildings and refunds demolition', () => {
    const state = createInitialState()
    const startGold = state.gold

    expect(placeBuilding(state, 'conveyor', 10, 6, 1)).toBeNull()
    const placed = state.buildings.find((building) => building.x === 10 && building.y === 6)!
    expect(placed.direction).toBe(1)
    expect(state.gold).toBe(startGold - BUILDINGS.conveyor.cost)

    const refund = deleteBuilding(state, placed.id)
    expect(refund).toBe(Math.floor(BUILDINGS.conveyor.cost * ECONOMY.deleteRefund))
    expect(state.buildings).not.toContainEqual(placed)
  })

  it('persists progress without simulating offline time', () => {
    const state = createInitialState()
    runFor(state, 45)
    state.speed = 2
    saveGame(state)
    const savedTime = state.time

    const loaded = loadGame()

    expect(localStorage.getItem(SAVE_KEY)).not.toBeNull()
    expect(loaded.time).toBe(savedTime)
    expect(loaded.gold).toBe(state.gold)
    expect(loaded.buildings).toEqual(state.buildings)
    expect(loaded.speed).toBe(1)
  })

  it('sends a weak volunteer if equipment production is interrupted', () => {
    const state = createInitialState()
    state.buildings = []
    const startingHp = state.enemy!.hp

    runFor(state, 20)

    expect(state.enemy!.hp).toBeLessThan(startingHp)
    expect(state.adventurers.some((hero) => hero.swordDamage === 1)).toBe(true)
  })
})
