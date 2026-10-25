import { BUILDINGS, DIRECTIONS, GRID, TIMINGS, type BuildingKind, type Direction, type ItemKind } from './config'
import { buildingStatus, type Building, type GameEvent, type GameState } from './simulation'

export interface PointerState {
  x: number
  y: number
  inside: boolean
}

export interface RenderOptions {
  selectedKind: BuildingKind | 'delete' | null
  selectedBuildingId: number | null
  direction: Direction
  reducedMotion: boolean
  pointer: PointerState
  message: string
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
  shape: 'dot' | 'spark' | 'star' | 'smoke'
}

interface Floater {
  text: string
  x: number
  y: number
  life: number
  color: string
  large?: boolean
}

export interface WorldLayout {
  factoryX: number
  factoryY: number
  factoryWidth: number
  factoryHeight: number
  cell: number
  gridX: number
  gridY: number
  dungeonX: number
  dungeonWidth: number
}

export function getWorldLayout(width: number, height: number): WorldLayout {
  const factoryWidth = Math.floor(width * 0.63)
  const cell = Math.floor(Math.min((factoryWidth - 34) / GRID.cols, (height - 58) / GRID.rows))
  const gridWidth = cell * GRID.cols
  const gridHeight = cell * GRID.rows
  return {
    factoryX: 0,
    factoryY: 0,
    factoryWidth,
    factoryHeight: height,
    cell,
    gridX: Math.floor((factoryWidth - gridWidth) / 2),
    gridY: Math.floor((height - gridHeight) / 2) + 10,
    dungeonX: factoryWidth,
    dungeonWidth: width - factoryWidth,
  }
}

export function pointToGrid(width: number, height: number, x: number, y: number) {
  const layout = getWorldLayout(width, height)
  return {
    x: Math.floor((x - layout.gridX) / layout.cell),
    y: Math.floor((y - layout.gridY) / layout.cell),
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function drawProgress(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  value: number,
  color: string,
) {
  roundedRect(ctx, x, y, width, 4, 2)
  ctx.fillStyle = '#131923'
  ctx.fill()
  if (value <= 0) return
  roundedRect(ctx, x, y, Math.max(3, width * Math.min(1, value)), 4, 2)
  ctx.fillStyle = color
  ctx.fill()
}

function itemColor(kind: ItemKind) {
  if (kind === 'ore') return '#84909c'
  if (kind === 'bar') return '#d6e0e5'
  return '#f7f0c8'
}

function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, x: number, y: number, scale = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#1c2530'
  ctx.fillStyle = itemColor(kind)
  if (kind === 'ore') {
    ctx.beginPath()
    ctx.moveTo(-6, 4)
    ctx.lineTo(-8, -2)
    ctx.lineTo(-2, -7)
    ctx.lineTo(6, -5)
    ctx.lineTo(8, 3)
    ctx.lineTo(2, 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#b0bbc2'
    ctx.fillRect(-2, -4, 4, 3)
  } else if (kind === 'bar') {
    roundedRect(ctx, -9, -4, 18, 8, 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#ffffff80'
    ctx.fillRect(-5, -2, 10, 1.5)
  } else {
    ctx.rotate(-0.5)
    ctx.fillStyle = '#e8f2f5'
    ctx.fillRect(-2, -10, 4, 16)
    ctx.beginPath()
    ctx.moveTo(-2, -10)
    ctx.lineTo(0, -14)
    ctx.lineTo(2, -10)
    ctx.fill()
    ctx.fillStyle = '#d9a93c'
    ctx.fillRect(-7, 4, 14, 3)
    ctx.fillStyle = '#754a2e'
    ctx.fillRect(-2, 7, 4, 8)
  }
  ctx.restore()
}

function drawDirectionArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: Direction,
  color = '#d7c39b',
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((direction * Math.PI) / 2)
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-6, 0)
  ctx.lineTo(6, 0)
  ctx.lineTo(2, -4)
  ctx.moveTo(6, 0)
  ctx.lineTo(2, 4)
  ctx.stroke()
  ctx.restore()
}

function buildingCenter(layout: WorldLayout, building: Pick<Building, 'x' | 'y'>) {
  return {
    x: layout.gridX + (building.x + 0.5) * layout.cell,
    y: layout.gridY + (building.y + 0.5) * layout.cell,
  }
}

function drawConveyor(
  ctx: CanvasRenderingContext2D,
  building: Building,
  x: number,
  y: number,
  size: number,
  time: number,
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((building.direction * Math.PI) / 2)
  roundedRect(ctx, -size * 0.42, -size * 0.25, size * 0.84, size * 0.5, 5)
  ctx.fillStyle = '#332f2b'
  ctx.fill()
  ctx.strokeStyle = '#8b7257'
  ctx.lineWidth = 3
  ctx.stroke()
  ctx.strokeStyle = '#b59a73'
  ctx.lineWidth = 2
  for (let offset = -size * 0.28; offset <= size * 0.3; offset += size * 0.18) {
    const shifted = ((offset + time * 10) % (size * 0.18)) - size * 0.09
    ctx.beginPath()
    ctx.moveTo(shifted, -size * 0.19)
    ctx.lineTo(shifted, size * 0.19)
    ctx.stroke()
  }
  ctx.restore()
  drawDirectionArrow(ctx, x, y, building.direction)
  const moving = building.output[0]
  if (moving) {
    const delta = DIRECTIONS[building.direction]
    const travel = (moving.progress - 0.5) * size * 0.72
    drawItem(ctx, moving.kind, x + delta.x * travel, y + delta.y * travel, 0.82)
  }
}

function drawMine(ctx: CanvasRenderingContext2D, building: Building, x: number, y: number, size: number, time: number) {
  const bob = Math.sin(time * 4 + building.id) * 1.2
  ctx.save()
  ctx.translate(x, y + bob)
  ctx.fillStyle = '#24303a'
  ctx.strokeStyle = '#75818a'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.arc(0, 4, size * 0.28, Math.PI, 0)
  ctx.lineTo(size * 0.28, size * 0.28)
  ctx.lineTo(-size * 0.28, size * 0.28)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.strokeStyle = '#c18b4d'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.moveTo(-size * 0.32, size * 0.28)
  ctx.lineTo(-size * 0.18, -size * 0.25)
  ctx.lineTo(size * 0.18, -size * 0.25)
  ctx.lineTo(size * 0.32, size * 0.28)
  ctx.stroke()
  ctx.fillStyle = '#81909c'
  ctx.beginPath()
  ctx.arc(0, 5, size * 0.11, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  drawDirectionArrow(ctx, x + size * 0.28, y, building.direction, '#f0d08c')
}

function drawFurnace(ctx: CanvasRenderingContext2D, building: Building, x: number, y: number, size: number, time: number) {
  const working = building.input.length > 0 && building.output.length < 2
  const pulse = working ? 0.72 + Math.sin(time * 7) * 0.12 : 0.35
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#4a3c35'
  ctx.strokeStyle = building.level > 1 ? '#d3ad58' : '#826c5c'
  ctx.lineWidth = 2 + building.level * 0.4
  roundedRect(ctx, -size * 0.3, -size * 0.34, size * 0.6, size * 0.67, 8)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = `rgba(255, 109, 42, ${pulse})`
  ctx.shadowColor = '#ff7a33'
  ctx.shadowBlur = working ? 14 : 5
  roundedRect(ctx, -size * 0.17, -size * 0.08, size * 0.34, size * 0.3, 8)
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.fillStyle = '#302d2b'
  ctx.fillRect(-size * 0.18, -size * 0.37, size * 0.36, size * 0.11)
  if (building.level > 1) {
    ctx.strokeStyle = '#d5b766'
    ctx.lineWidth = 2
    for (let i = 0; i < building.level - 1; i += 1) {
      ctx.beginPath()
      ctx.arc(-size * 0.24 + i * 8, -size * 0.2, 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawForge(ctx: CanvasRenderingContext2D, building: Building, x: number, y: number, size: number) {
  const total = TIMINGS.forge / (1 + (building.level - 1) * 0.28)
  const phase = total ? building.progress / total : 0
  const anticipation = phase > 0.73 ? Math.min(1, (phase - 0.73) / 0.2) : 0
  const strike = building.pulse > 0.45 ? (0.65 - building.pulse) / 0.2 : 1 - anticipation
  ctx.save()
  ctx.translate(x, y)
  ctx.fillStyle = '#413b37'
  ctx.strokeStyle = '#8b8074'
  ctx.lineWidth = 2
  roundedRect(ctx, -size * 0.35, size * 0.04, size * 0.7, size * 0.25, 5)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#a9bac2'
  ctx.beginPath()
  ctx.moveTo(-size * 0.22, size * 0.03)
  ctx.lineTo(-size * 0.13, -size * 0.1)
  ctx.lineTo(size * 0.18, -size * 0.1)
  ctx.lineTo(size * 0.28, size * 0.03)
  ctx.closePath()
  ctx.fill()
  ctx.save()
  ctx.translate(size * 0.16, -size * 0.12)
  ctx.rotate(-0.85 + strike * 0.72)
  ctx.strokeStyle = '#7a4d2d'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, -size * 0.34)
  ctx.stroke()
  ctx.fillStyle = '#b9c6ca'
  roundedRect(ctx, -size * 0.13, -size * 0.44, size * 0.27, size * 0.13, 3)
  ctx.fill()
  ctx.restore()
  if (building.level > 1) {
    ctx.strokeStyle = '#d1aa45'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(-size * 0.26, -size * 0.2, 5 + building.level, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.restore()
}

function drawRack(ctx: CanvasRenderingContext2D, building: Building, x: number, y: number, size: number) {
  ctx.save()
  ctx.translate(x, y)
  ctx.strokeStyle = '#97744a'
  ctx.lineWidth = 5
  ctx.beginPath()
  ctx.moveTo(-size * 0.25, size * 0.3)
  ctx.lineTo(-size * 0.25, -size * 0.3)
  ctx.moveTo(size * 0.25, size * 0.3)
  ctx.lineTo(size * 0.25, -size * 0.3)
  ctx.moveTo(-size * 0.32, -size * 0.2)
  ctx.lineTo(size * 0.32, -size * 0.2)
  ctx.stroke()
  const count = Math.min(4, building.input.length)
  for (let i = 0; i < count; i += 1) drawItem(ctx, 'sword', -12 + i * 8, 3, 0.65)
  ctx.restore()
}

function drawBuilding(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  building: Building,
  layout: WorldLayout,
  selected: boolean,
) {
  const { x, y } = buildingCenter(layout, building)
  const size = layout.cell
  if (selected || building.pulse > 0.8) {
    ctx.strokeStyle = selected ? '#f5cf67' : '#fff0a6'
    ctx.lineWidth = selected ? 3 : 2
    roundedRect(ctx, x - size * 0.46, y - size * 0.46, size * 0.92, size * 0.92, 9)
    ctx.stroke()
  }
  if (building.kind === 'conveyor') drawConveyor(ctx, building, x, y, size, state.time)
  if (building.kind === 'mine') drawMine(ctx, building, x, y, size, state.time)
  if (building.kind === 'furnace') drawFurnace(ctx, building, x, y, size, state.time)
  if (building.kind === 'forge') drawForge(ctx, building, x, y, size)
  if (building.kind === 'rack') drawRack(ctx, building, x, y, size)

  const total =
    building.kind === 'mine'
      ? TIMINGS.mine / (1 + (building.level - 1) * 0.28)
      : building.kind === 'furnace'
        ? TIMINGS.furnace / (1 + (building.level - 1) * 0.28)
        : building.kind === 'forge'
          ? TIMINGS.forge / (1 + (building.level - 1) * 0.28)
          : building.kind === 'rack'
            ? TIMINGS.rackEquip
            : 0
  if (total) drawProgress(ctx, x - size * 0.31, y + size * 0.36, size * 0.62, building.progress / total, '#efb441')

  const status = buildingStatus(building)
  if (status.startsWith('Needs') || status.includes('blocked')) {
    ctx.fillStyle = status.includes('blocked') ? '#ee8b54' : '#e7c75f'
    ctx.beginPath()
    ctx.moveTo(x + size * 0.28, y - size * 0.37)
    ctx.lineTo(x + size * 0.4, y - size * 0.17)
    ctx.lineTo(x + size * 0.16, y - size * 0.17)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#33291d'
    ctx.font = `bold ${Math.max(10, size * 0.16)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('!', x + size * 0.28, y - size * 0.21)
  }
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  index: number,
  layout: WorldLayout,
  height: number,
) {
  const hero = state.adventurers[index]
  const laneY = height * 0.42 + (index - 1) * 62
  let x = layout.dungeonX + layout.dungeonWidth * 0.26
  let alpha = 1
  if (hero.state === 'waiting') x = layout.dungeonX - 18 - index * 14
  if (hero.state === 'equipping') x = layout.dungeonX - 9
  if (hero.state === 'walking') {
    const progress = 1 - hero.timer / TIMINGS.walkToDungeon
    x = layout.dungeonX - 8 + progress * layout.dungeonWidth * 0.29
  }
  if (hero.state === 'returning') {
    const progress = 1 - hero.timer / TIMINGS.returnFromDungeon
    x = layout.dungeonX + layout.dungeonWidth * 0.26 * (1 - progress)
    alpha = 1 - progress * 0.25
  }
  if (hero.state === 'respawning') {
    x = layout.dungeonX + 20
    alpha = 0.3 + Math.sin(state.time * 5) * 0.12
  }
  const attacking = hero.state === 'fighting' && hero.attackTimer < 0.18
  const lunge = attacking ? 9 * (1 - hero.attackTimer / 0.18) : 0
  x += lunge - hero.knockback * 6
  const y = laneY + Math.sin(state.time * 4 + index) * 1.5

  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  if (hero.hitFlash > 0) {
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 14
  }
  ctx.fillStyle = '#253348'
  ctx.beginPath()
  ctx.ellipse(0, 13, 12, 17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = hero.hitFlash > 0 ? '#ffffff' : ['#dca77a', '#b97f62', '#e2b791'][index]
  ctx.beginPath()
  ctx.arc(0, -7, 10, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = ['#80512e', '#503729', '#b07136'][index]
  ctx.beginPath()
  ctx.arc(0, -10, 10, Math.PI, 0)
  ctx.fill()
  ctx.fillStyle = '#cbd5db'
  ctx.beginPath()
  ctx.arc(-2, 4, 13, Math.PI * 1.1, Math.PI * 1.9)
  ctx.fill()
  ctx.fillStyle = '#3c4c5e'
  ctx.fillRect(-7, 2, 14, 10)
  if (hero.swordDamage > 0) {
    ctx.save()
    ctx.translate(12, 2)
    ctx.rotate(attacking ? 0.75 : -0.45)
    drawItem(ctx, 'sword', 0, -7, 0.82)
    ctx.restore()
  }
  ctx.restore()

  if (hero.state === 'fighting' || hero.state === 'respawning') {
    drawProgress(ctx, x - 18, y + 28, 36, hero.hp / hero.maxHp, '#67c47a')
  }
  if (hero.state === 'respawning') {
    ctx.fillStyle = '#e4d7bf'
    ctx.font = '600 10px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(`returns ${Math.ceil(hero.timer)}s`, x, y + 42)
  }
}

function drawEnemy(ctx: CanvasRenderingContext2D, state: GameState, layout: WorldLayout, height: number) {
  if (!state.enemy) return
  const enemy = state.enemy
  const x = layout.dungeonX + layout.dungeonWidth * 0.76 + enemy.knockback * 8
  const y = height * 0.5
  const scale = enemy.boss ? 1.45 : 1
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  ctx.shadowColor = enemy.boss ? '#d94f42' : enemy.color
  ctx.shadowBlur = enemy.boss ? 16 : 5
  ctx.fillStyle = enemy.hitFlash > 0 ? '#fff' : enemy.color
  if (enemy.kind === 0) {
    ctx.beginPath()
    ctx.moveTo(-28, 15)
    ctx.quadraticCurveTo(-24, -26, 0, -27)
    ctx.quadraticCurveTo(26, -24, 29, 15)
    ctx.quadraticCurveTo(0, 28, -28, 15)
    ctx.fill()
  } else if (enemy.kind === 1) {
    ctx.beginPath()
    ctx.moveTo(0, -4)
    ctx.quadraticCurveTo(-30, -30, -36, 3)
    ctx.quadraticCurveTo(-16, -8, 0, 14)
    ctx.quadraticCurveTo(16, -8, 36, 3)
    ctx.quadraticCurveTo(30, -30, 0, -4)
    ctx.fill()
  } else {
    roundedRect(ctx, -23, -27, 46, 51, 12)
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-18, -22)
    ctx.lineTo(-27, -38)
    ctx.lineTo(-7, -27)
    ctx.moveTo(18, -22)
    ctx.lineTo(27, -38)
    ctx.lineTo(7, -27)
    ctx.fill()
  }
  ctx.shadowBlur = 0
  ctx.fillStyle = '#131923'
  ctx.beginPath()
  ctx.arc(-8, -5, 3, 0, Math.PI * 2)
  ctx.arc(8, -5, 3, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#27212b'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(-7, 8)
  ctx.quadraticCurveTo(0, 13, 7, 8)
  ctx.stroke()
  if (enemy.boss) {
    ctx.fillStyle = '#e8b94e'
    ctx.beginPath()
    ctx.moveTo(-19, -29)
    ctx.lineTo(-14, -46)
    ctx.lineTo(-3, -34)
    ctx.lineTo(5, -49)
    ctx.lineTo(14, -34)
    ctx.lineTo(22, -46)
    ctx.lineTo(20, -27)
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
  drawProgress(ctx, x - 48, y + 54 * scale, 96, enemy.hp / enemy.maxHp, enemy.boss ? '#e6b94e' : '#d95e58')
  ctx.fillStyle = '#f1e8da'
  ctx.font = `${enemy.boss ? '700' : '600'} 12px Inter, sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText(enemy.name, x, y + 72 * scale)
}

export class GameRenderer {
  private particles: Particle[] = []
  private floaters: Floater[] = []
  private seenEvent = 0
  private shake = 0

  private burst(x: number, y: number, color: string, count: number, shape: Particle['shape'] = 'spark') {
    for (let i = 0; i < count && this.particles.length < 180; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.35
      const speed = 24 + Math.random() * 48
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 12,
        life: 0.35 + Math.random() * 0.35,
        maxLife: 0.7,
        color,
        size: 1.5 + Math.random() * 2.5,
        shape,
      })
    }
  }

  private consumeEvents(events: GameEvent[], layout: WorldLayout, width: number, height: number, reduced: boolean) {
    for (const event of events) {
      if (event.id <= this.seenEvent) continue
      this.seenEvent = event.id
      const hasGridPosition = event.x !== undefined && event.y !== undefined
      const position = hasGridPosition
        ? {
            x: layout.gridX + (event.x! + 0.5) * layout.cell,
            y: layout.gridY + (event.y! + 0.5) * layout.cell,
          }
        : { x: layout.dungeonX + layout.dungeonWidth * 0.66, y: height * 0.45 }
      if (event.type === 'smelt') this.burst(position.x, position.y, '#ff9d45', reduced ? 3 : 9)
      if (event.type === 'forge') {
        this.burst(position.x, position.y, '#ffe5a2', reduced ? 4 : 13)
        this.shake = reduced ? 0 : 2
      }
      if (event.type === 'place') this.burst(position.x, position.y + 15, '#bda17c', reduced ? 2 : 7, 'smoke')
      if (event.type === 'upgrade') this.burst(position.x, position.y, '#f4cf54', reduced ? 4 : 16, 'star')
      if (event.type === 'equip') {
        this.burst(layout.dungeonX, height * 0.48, '#dff8ff', reduced ? 4 : 15, 'star')
        this.floaters.push({ text: 'EQUIPPED!', x: layout.dungeonX + 30, y: height * 0.32, life: 1.1, color: '#fff3a6' })
      }
      if (event.type === 'hit' || event.type === 'heroHit') {
        const enemyHit = event.type === 'hit'
        const x = enemyHit ? layout.dungeonX + layout.dungeonWidth * 0.72 : layout.dungeonX + layout.dungeonWidth * 0.3
        this.burst(x, height * 0.48, enemyHit ? '#f8d8ba' : '#e57a69', reduced ? 2 : 5)
        this.floaters.push({
          text: `${event.text === 'CRIT' ? 'CRIT ' : '−'}${event.value}`,
          x,
          y: height * 0.39 + Math.random() * 30,
          life: event.text === 'CRIT' ? 1.15 : 0.75,
          color: event.text === 'CRIT' ? '#ffe36c' : '#fff3e6',
          large: event.text === 'CRIT',
        })
      }
      if (event.type === 'wave' || event.type === 'boss' || event.type === 'objective') {
        this.floaters.push({
          text: event.text ?? '',
          x: event.type === 'objective' ? width * 0.5 : layout.dungeonX + layout.dungeonWidth * 0.5,
          y: event.type === 'objective' ? height * 0.22 : height * 0.24,
          life: event.boss ? 2.3 : 1.6,
          color: event.boss ? '#ffd35a' : '#fff0bd',
          large: true,
        })
        if (event.boss) {
          this.burst(layout.dungeonX + layout.dungeonWidth * 0.65, height * 0.45, '#ffd35a', reduced ? 7 : 28, 'star')
          this.shake = reduced ? 0 : 5
        }
      }
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    width: number,
    height: number,
    dt: number,
    options: RenderOptions,
  ) {
    const layout = getWorldLayout(width, height)
    this.consumeEvents(state.events, layout, width, height, options.reducedMotion)
    this.shake = Math.max(0, this.shake - dt * 12)
    const shakeX = options.reducedMotion ? 0 : (Math.random() - 0.5) * this.shake
    const shakeY = options.reducedMotion ? 0 : (Math.random() - 0.5) * this.shake
    ctx.save()
    ctx.translate(shakeX, shakeY)
    ctx.clearRect(-8, -8, width + 16, height + 16)

    const workshop = ctx.createLinearGradient(0, 0, 0, height)
    workshop.addColorStop(0, '#202a30')
    workshop.addColorStop(1, '#151d22')
    ctx.fillStyle = workshop
    ctx.fillRect(0, 0, layout.factoryWidth, height)

    const dungeon = ctx.createLinearGradient(layout.dungeonX, 0, width, height)
    dungeon.addColorStop(0, '#182127')
    dungeon.addColorStop(0.55, '#11181d')
    dungeon.addColorStop(1, '#291c22')
    ctx.fillStyle = dungeon
    ctx.fillRect(layout.dungeonX, 0, layout.dungeonWidth, height)

    ctx.fillStyle = '#ffffff08'
    for (let y = 0; y < height; y += 34) {
      for (let x = 0; x < width; x += 66) {
        roundedRect(ctx, x + ((y / 34) % 2) * 22, y, 62, 30, 4)
        ctx.fill()
      }
    }

    ctx.strokeStyle = '#b18d5140'
    ctx.lineWidth = 1
    for (let x = 0; x <= GRID.cols; x += 1) {
      ctx.beginPath()
      ctx.moveTo(layout.gridX + x * layout.cell, layout.gridY)
      ctx.lineTo(layout.gridX + x * layout.cell, layout.gridY + GRID.rows * layout.cell)
      ctx.stroke()
    }
    for (let y = 0; y <= GRID.rows; y += 1) {
      ctx.beginPath()
      ctx.moveTo(layout.gridX, layout.gridY + y * layout.cell)
      ctx.lineTo(layout.gridX + GRID.cols * layout.cell, layout.gridY + y * layout.cell)
      ctx.stroke()
    }

    ctx.fillStyle = '#e8d8b7'
    ctx.font = '700 11px Inter, sans-serif'
    ctx.textAlign = 'left'
    ctx.fillText('WORKSHOP FLOOR', 15, 20)
    ctx.fillStyle = '#887d6d'
    ctx.fillText('THE CINDER DEEPS', layout.dungeonX + 16, 20)

    for (const building of state.buildings) {
      drawBuilding(ctx, state, building, layout, options.selectedBuildingId === building.id)
    }

    if (options.pointer.inside && options.selectedKind && options.selectedKind !== 'delete') {
      const grid = pointToGrid(width, height, options.pointer.x, options.pointer.y)
      if (grid.x >= 0 && grid.y >= 0 && grid.x < GRID.cols && grid.y < GRID.rows) {
        const occupied = state.buildings.some((building) => building.x === grid.x && building.y === grid.y)
        const affordable = state.gold >= BUILDINGS[options.selectedKind].cost
        const valid = !occupied && affordable
        const x = layout.gridX + grid.x * layout.cell
        const y = layout.gridY + grid.y * layout.cell
        ctx.fillStyle = valid ? '#68cf8940' : '#e05f5f45'
        ctx.strokeStyle = valid ? '#80df9d' : '#f17b6f'
        ctx.lineWidth = 2
        roundedRect(ctx, x + 2, y + 2, layout.cell - 4, layout.cell - 4, 7)
        ctx.fill()
        ctx.stroke()
        drawDirectionArrow(ctx, x + layout.cell / 2, y + layout.cell / 2, options.direction, valid ? '#baf6ca' : '#ffb2aa')
      }
    }

    ctx.fillStyle = '#0c1116'
    ctx.fillRect(layout.dungeonX - 5, 0, 10, height)
    ctx.fillStyle = '#7b6245'
    ctx.fillRect(layout.dungeonX - 2, 0, 4, height)
    ctx.fillStyle = '#e2b14e30'
    ctx.beginPath()
    ctx.ellipse(layout.dungeonX + layout.dungeonWidth * 0.72, height * 0.5, layout.dungeonWidth * 0.22, height * 0.34, 0, 0, Math.PI * 2)
    ctx.fill()

    for (let index = 0; index < state.adventurers.length; index += 1) {
      drawHero(ctx, state, index, layout, height)
    }
    drawEnemy(ctx, state, layout, height)

    for (let index = 0; index < state.coins.length; index += 1) {
      const coin = state.coins[index]
      const progress = Math.min(1, coin.timer / coin.duration)
      const startX = layout.dungeonX + layout.dungeonWidth * 0.72
      const startY = height * 0.52
      const endX = width - 20
      const endY = 18
      const x = startX + (endX - startX) * progress
      const y = startY + (endY - startY) * progress - Math.sin(progress * Math.PI) * 90
      ctx.fillStyle = '#f5c94f'
      ctx.strokeStyle = '#9b6c26'
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(x, y, 5, 7, progress * 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff0a8'
      ctx.fillRect(x - 1, y - 4, 2, 5)
    }

    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index]
      particle.life -= dt
      if (particle.life <= 0) {
        this.particles.splice(index, 1)
        continue
      }
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += (particle.shape === 'smoke' ? -12 : 80) * dt
      ctx.globalAlpha = Math.min(1, particle.life / particle.maxLife)
      ctx.fillStyle = particle.color
      ctx.strokeStyle = particle.color
      if (particle.shape === 'spark') {
        ctx.lineWidth = particle.size
        ctx.beginPath()
        ctx.moveTo(particle.x, particle.y)
        ctx.lineTo(particle.x - particle.vx * 0.06, particle.y - particle.vy * 0.06)
        ctx.stroke()
      } else {
        ctx.beginPath()
        ctx.arc(particle.x, particle.y, particle.size * (particle.shape === 'smoke' ? 1.7 : 1), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1

    for (let index = this.floaters.length - 1; index >= 0; index -= 1) {
      const floater = this.floaters[index]
      floater.life -= dt
      if (floater.life <= 0) {
        this.floaters.splice(index, 1)
        continue
      }
      floater.y -= dt * (floater.large ? 10 : 24)
      ctx.globalAlpha = Math.min(1, floater.life * 2)
      ctx.fillStyle = floater.color
      ctx.strokeStyle = '#12171d'
      ctx.lineWidth = floater.large ? 4 : 3
      ctx.font = `${floater.large ? '800 22px' : '800 15px'} Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.strokeText(floater.text, floater.x, floater.y)
      ctx.fillText(floater.text, floater.x, floater.y)
    }
    ctx.globalAlpha = 1

    if (state.speed === 0) {
      ctx.fillStyle = '#071016a8'
      ctx.fillRect(0, 0, width, height)
      ctx.fillStyle = '#f4e7cd'
      ctx.font = '800 28px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('PAUSED', width / 2, height / 2)
    }
    ctx.restore()
  }
}
