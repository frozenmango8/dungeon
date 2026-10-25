import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'
import { BUILDINGS, DIRECTIONS, ECONOMY, FIXED_STEP, type BuildingKind, type Direction } from './game/config'
import { GameAudio } from './game/audio'
import { GameRenderer, pointToGrid, type PointerState } from './game/renderer'
import {
  buildingStatus,
  deleteBuilding,
  getBuildError,
  loadGame,
  placeBuilding,
  resetGame,
  saveGame,
  stepGame,
  upgradeBuilding,
  upgradeSwords,
  type GameState,
} from './game/simulation'

function App() {
  const [initialGame] = useState<GameState>(loadGame)
  const [initialReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const gameRef = useRef<GameState>(initialGame)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef(new GameRenderer())
  const audioRef = useRef(new GameAudio())
  const pointerRef = useRef<PointerState>({ x: 0, y: 0, inside: false })
  const selectedKindRef = useRef<BuildingKind | 'delete' | null>(null)
  const selectedBuildingRef = useRef<number | null>(null)
  const directionRef = useRef<Direction>(0)
  const reducedMotionRef = useRef(initialReducedMotion)
  const messageRef = useRef('Select a building to expand your workshop')

  const [ui, setUi] = useState(() => ({ ...initialGame }))
  const [selectedKind, setSelectedKind] = useState<BuildingKind | 'delete' | null>(null)
  const [selectedBuildingId, setSelectedBuildingId] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction>(0)
  const [message, setMessage] = useState('Select a building to expand your workshop')
  const [sound, setSound] = useState(true)
  const [music, setMusic] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(initialReducedMotion)

  const refreshUi = useCallback(() => {
    const game = gameRef.current
    setUi({
      ...game,
      buildings: [...game.buildings],
      adventurers: [...game.adventurers],
      events: [...game.events],
      swordsCraftedRecent: [...game.swordsCraftedRecent],
    })
  }, [])

  const feedback = useCallback((text: string) => {
    messageRef.current = text
    setMessage(text)
  }, [])

  const chooseTool = (kind: BuildingKind | 'delete') => {
    const next = selectedKind === kind ? null : kind
    setSelectedKind(next)
    selectedKindRef.current = next
    selectedBuildingRef.current = null
    setSelectedBuildingId(null)
    if (!next) feedback('Build tool cleared')
    else if (next === 'delete') feedback(`Demolish mode · ${Math.round(ECONOMY.deleteRefund * 100)}% refund`)
    else feedback(`${BUILDINGS[next].name} selected · press R to rotate`)
  }

  const rotate = useCallback(() => {
    const next = ((directionRef.current + 1) % 4) as Direction
    directionRef.current = next
    setDirection(next)
    feedback(`Facing ${DIRECTIONS[next].label}`)
  }, [feedback])

  const setSpeed = useCallback((speed: 0 | 1 | 2) => {
    gameRef.current.speed = speed
    feedback(speed === 0 ? 'Factory paused' : `Factory running at ${speed}× speed`)
    refreshUi()
  }, [feedback, refreshUi])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault()
        rotate()
      }
      if (event.code === 'Space') {
        event.preventDefault()
        setSpeed(gameRef.current.speed === 0 ? 1 : 0)
      }
      if (event.key === '1') setSpeed(1)
      if (event.key === '2') setSpeed(2)
      if (event.key === 'Escape') {
        selectedKindRef.current = null
        setSelectedKind(null)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [rotate, setSpeed])

  useEffect(() => {
    let frame = 0
    let last = performance.now()
    let accumulator = 0
    let uiTimer = 0
    const render = (now: number) => {
      const elapsed = Math.min(0.1, (now - last) / 1000)
      last = now
      accumulator += elapsed
      while (accumulator >= FIXED_STEP) {
        stepGame(gameRef.current, FIXED_STEP)
        accumulator -= FIXED_STEP
      }
      const canvas = canvasRef.current
      if (canvas) {
        const bounds = canvas.getBoundingClientRect()
        const dpr = Math.min(2, window.devicePixelRatio || 1)
        const pixelWidth = Math.max(1, Math.round(bounds.width * dpr))
        const pixelHeight = Math.max(1, Math.round(bounds.height * dpr))
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
          canvas.width = pixelWidth
          canvas.height = pixelHeight
        }
        const context = canvas.getContext('2d')
        if (context) {
          context.setTransform(dpr, 0, 0, dpr, 0, 0)
          rendererRef.current.render(context, gameRef.current, bounds.width, bounds.height, elapsed, {
            selectedKind: selectedKindRef.current,
            selectedBuildingId: selectedBuildingRef.current,
            direction: directionRef.current,
            reducedMotion: reducedMotionRef.current,
            pointer: pointerRef.current,
            message: messageRef.current,
          })
        }
      }
      audioRef.current.consume(gameRef.current.events)
      uiTimer += elapsed
      if (uiTimer > 0.12) {
        refreshUi()
        uiTimer = 0
      }
      frame = requestAnimationFrame(render)
    }
    frame = requestAnimationFrame(render)
    const autosave = window.setInterval(() => saveGame(gameRef.current), 5000)
    const persist = () => saveGame(gameRef.current)
    window.addEventListener('beforeunload', persist)
    return () => {
      cancelAnimationFrame(frame)
      window.clearInterval(autosave)
      window.removeEventListener('beforeunload', persist)
      persist()
    }
  }, [refreshUi])

  const canvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top, width: bounds.width, height: bounds.height }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = canvasPoint(event)
    pointerRef.current = { x: point.x, y: point.y, inside: true }
    if (selectedKindRef.current && selectedKindRef.current !== 'delete') {
      const grid = pointToGrid(point.width, point.height, point.x, point.y)
      const error = getBuildError(gameRef.current, selectedKindRef.current, grid.x, grid.y)
      messageRef.current = error ?? `Place ${BUILDINGS[selectedKindRef.current].name} · facing ${DIRECTIONS[directionRef.current].label}`
      if (messageRef.current !== message) setMessage(messageRef.current)
    }
  }

  const handleCanvasClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    audioRef.current.unlock()
    const point = canvasPoint(event)
    const grid = pointToGrid(point.width, point.height, point.x, point.y)
    const building = gameRef.current.buildings.find((candidate) => candidate.x === grid.x && candidate.y === grid.y)
    const tool = selectedKindRef.current

    if (tool === 'delete') {
      if (!building) {
        feedback('Choose a building to demolish')
        return
      }
      const refund = deleteBuilding(gameRef.current, building.id)
      if (selectedBuildingRef.current === building.id) {
        selectedBuildingRef.current = null
        setSelectedBuildingId(null)
      }
      feedback(`Building removed · +${refund} gold refunded`)
      refreshUi()
      return
    }
    if (tool) {
      const error = placeBuilding(gameRef.current, tool, grid.x, grid.y, directionRef.current)
      feedback(error ?? `${BUILDINGS[tool].name} placed`)
      refreshUi()
      return
    }
    if (building) {
      selectedBuildingRef.current = building.id
      setSelectedBuildingId(building.id)
      feedback(`${BUILDINGS[building.kind].name} · ${buildingStatus(building)}`)
    } else {
      selectedBuildingRef.current = null
      setSelectedBuildingId(null)
      feedback('Select a building below, then click a grid tile')
    }
  }

  const purchaseMachineUpgrade = () => {
    if (!selectedBuildingId) {
      feedback('Select a mine, furnace, or forge on the floor first')
      return
    }
    const error = upgradeBuilding(gameRef.current, selectedBuildingId)
    feedback(error ?? 'Machine upgraded · production speed increased!')
    refreshUi()
  }

  const purchaseSwordUpgrade = () => {
    const error = upgradeSwords(gameRef.current)
    feedback(error ?? 'Sword damage upgraded!')
    refreshUi()
  }

  const selectedBuilding = ui.buildings.find((building) => building.id === selectedBuildingId)
  const machineUpgradeCost = selectedBuilding ? ECONOMY.machineUpgradeBase * selectedBuilding.level : ECONOMY.machineUpgradeBase
  const swordUpgradeCost = ECONOMY.swordUpgradeBase * ui.swordLevel
  const objectiveProgress = Math.min(3, ui.equippedCount)

  return (
    <main className="game-shell" onPointerDown={() => audioRef.current.unlock()}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">⚒</span>
          <div><h1>Dungeon Factory</h1><span>Steel for glory</span></div>
        </div>
        <div className="resources" aria-label="Resources">
          <div className="resource gold"><span aria-hidden="true">●</span><strong>{Math.floor(ui.gold)}</strong><small>gold</small></div>
          <div className="resource"><span aria-hidden="true">◆</span><strong>{ui.materials}</strong><small>ore mined</small></div>
          <div className="resource wave"><span aria-hidden="true">⚔</span><strong>{ui.wave}</strong><small>{ui.enemy?.boss ? 'boss wave' : 'dungeon wave'}</small></div>
        </div>
        <div className="top-controls">
          <div className="speed-control" aria-label="Game speed">
            <button className={ui.speed === 0 ? 'active' : ''} onClick={() => setSpeed(0)} aria-label="Pause">Ⅱ</button>
            <button className={ui.speed === 1 ? 'active' : ''} onClick={() => setSpeed(1)}>1×</button>
            <button className={ui.speed === 2 ? 'active' : ''} onClick={() => setSpeed(2)}>2×</button>
          </div>
          <button className={`icon-button ${sound ? 'on' : ''}`} onClick={() => {
            const next = !sound
            setSound(next)
            audioRef.current.setSound(next)
            feedback(next ? 'Sound effects on' : 'Sound effects muted')
          }} aria-label="Toggle sound effects" title="Sound effects">{sound ? '♪' : '♪̸'}</button>
          <button className={`icon-button ${music ? 'on' : ''}`} onClick={() => {
            const next = !music
            setMusic(next)
            audioRef.current.setMusic(next)
            feedback(next ? 'Workshop ambience on' : 'Workshop ambience off')
          }} aria-label="Toggle music" title="Music">♫</button>
        </div>
      </header>

      <section className="objective-row">
        <div className={`objective ${ui.objectiveComplete ? 'complete' : ''}`}>
          <span className="objective-check" aria-hidden="true">{ui.objectiveComplete ? '✓' : '!'}</span>
          <div><small>{ui.objectiveComplete ? 'OBJECTIVE COMPLETE' : 'GUIDED OBJECTIVE'}</small><strong>{ui.objectiveComplete ? 'The party is armed!' : 'Equip three adventurers'}</strong></div>
          <div className="objective-pips" aria-label={`${objectiveProgress} of 3 adventurers equipped`}>
            {[0, 1, 2].map((index) => <span key={index} className={index < objectiveProgress ? 'filled' : ''}>†</span>)}
          </div>
        </div>
        <div className="stats">
          <span><strong>{ui.swordsCraftedRecent.length}</strong> swords/min</span>
          <span><strong>{ui.equippedCount}</strong> equipped</span>
          <span><strong>+{2 * ui.swordLevel}</strong> sword tier</span>
        </div>
      </section>

      <section className="world-frame">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          aria-label="Animated factory and dungeon game world"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => { pointerRef.current.inside = false }}
          onPointerDown={handleCanvasClick}
        />
        <div className="world-divider-labels" aria-hidden="true"><span>FACTORY</span><span>DUNGEON</span></div>
        <div className="context-message" role="status">{message}</div>
      </section>

      <section className="control-deck">
        <div className="build-toolbar" aria-label="Building toolbar">
          {(Object.keys(BUILDINGS) as BuildingKind[]).map((kind) => {
            const definition = BUILDINGS[kind]
            const affordable = ui.gold >= definition.cost
            return (
              <button
                key={kind}
                className={`build-card ${selectedKind === kind ? 'selected' : ''} ${affordable ? '' : 'unaffordable'}`}
                onClick={() => chooseTool(kind)}
                aria-pressed={selectedKind === kind}
                title={definition.description}
              >
                <span className="build-icon" style={{ '--building-color': definition.color } as CSSProperties}>{definition.icon}</span>
                <span className="build-copy"><strong>{definition.name}</strong><small>{definition.description}</small></span>
                <span className="cost">● {definition.cost}</span>
              </button>
            )
          })}
          <button className={`build-card demolish ${selectedKind === 'delete' ? 'selected' : ''}`} onClick={() => chooseTool('delete')} aria-pressed={selectedKind === 'delete'}>
            <span className="build-icon">⌫</span><span className="build-copy"><strong>Demolish</strong><small>Refund 60%</small></span>
          </button>
        </div>

        <aside className="upgrade-panel">
          <div className="selection-details">
            <small>SELECTED MACHINE</small>
            <strong>{selectedBuilding ? BUILDINGS[selectedBuilding.kind].name : 'Click a machine'}</strong>
            <span>{selectedBuilding ? `${buildingStatus(selectedBuilding)} · Level ${selectedBuilding.level}` : 'Inspect status and upgrade'}</span>
          </div>
          <button className="upgrade-button" disabled={!selectedBuilding || !['mine', 'furnace', 'forge'].includes(selectedBuilding.kind) || selectedBuilding.level >= 4} onClick={purchaseMachineUpgrade}>
            <span>⚙</span><span><strong>Machine speed</strong><small>+28% throughput</small></span><b>● {machineUpgradeCost}</b>
          </button>
          <button className="upgrade-button" disabled={ui.swordLevel >= 5} onClick={purchaseSwordUpgrade}>
            <span>†</span><span><strong>Sword damage</strong><small>Tier {ui.swordLevel} → {Math.min(5, ui.swordLevel + 1)}</small></span><b>● {swordUpgradeCost}</b>
          </button>
          <div className="utility-controls">
            <button onClick={rotate}><kbd>R</kbd> Rotate · {DIRECTIONS[direction].label}</button>
            <button className={reducedMotion ? 'active' : ''} onClick={() => {
              const next = !reducedMotion
              setReducedMotion(next)
              reducedMotionRef.current = next
              feedback(next ? 'Reduced motion enabled' : 'Full motion enabled')
            }}>◌ Reduced motion</button>
            <button className="reset-button" onClick={() => {
              if (!window.confirm('Reset your factory and all progress? This cannot be undone.')) return
              gameRef.current = resetGame()
              selectedKindRef.current = null
              selectedBuildingRef.current = null
              setSelectedKind(null)
              setSelectedBuildingId(null)
              feedback('A fresh workshop is ready')
              refreshUi()
            }}>↻ Reset save</button>
          </div>
        </aside>
      </section>
    </main>
  )
}

export default App
