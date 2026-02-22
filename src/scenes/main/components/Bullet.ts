import Phaser from "phaser"
import { VNode, createNode, useEffect, useUpdate, useRef } from "../../../lib/react-phaser"
import normalConfig from "../../../config/bullets/normal.json"
import spreadConfig from "../../../config/bullets/spread.json"
import laserConfig from "../../../config/bullets/laser.json"
import pierceConfig from "../../../config/bullets/pierce.json"

export enum BulletType {
  NORMAL = 'normal',
  SPREAD = 'spread',
  LASER = 'laser',
  PIERCE = 'pierce'
}

export interface BulletData {
  id: number;
  x: number;
  y: number;
  angleOffset: number;
  bulletType: BulletType;
  level: number;
  owner?: Phaser.GameObjects.Sprite;
}

export interface BulletLevelData {
  damage: number
  fireRate: number
  flySpeed: number
  scale: number
  pierce: number
  spread: {
    count: number
    angleOffset: number
  }
  description: string
  lifespan?: number
  hitInterval?: number
  bodyWidthRatio?: number
  bodyHeightRatio?: number
  hitboxStats?: {
    linear: number
    fixed: number
  }
}

export interface BulletConfig {
  name: string
  spritePath: string
  color: number
  levels: Record<string, BulletLevelData>
  origin?: { x: number, y: number }
  baseRotation?: number
  followOwner?: boolean
  bodyWidthRatio?: number
  bodyHeightRatio?: number
  hitboxStats?: {
    linear: number
    fixed: number
  }
}

type BulletConfigsMap = Record<string, BulletConfig>

export const BULLET_CONFIGS: BulletConfigsMap = {
  [BulletType.NORMAL]: { ...normalConfig, color: 0x00ffff } as unknown as BulletConfig,
  [BulletType.SPREAD]: { ...spreadConfig, color: 0x00ff00 } as unknown as BulletConfig,
  [BulletType.LASER]: { ...laserConfig, color: 0x00ffff } as unknown as BulletConfig,
  [BulletType.PIERCE]: { ...pierceConfig, color: 0xff00ff } as unknown as BulletConfig
}

export function Bullet(props: any): VNode {
  const {
    id,
    bulletType,
    level,
    angleOffset = 0,
    owner
  } = props;

  // 1. Derive Configuration and Physics Properties
  const config = BULLET_CONFIGS[bulletType as BulletType]
  const levelData = config.levels[level.toString()] || config.levels["1"]

  // 2. Lifecycle Logic (useUpdate handle high-frequency logic)
  const initialLifespan = levelData.lifespan || 0;
  const lifespanRef = useRef(initialLifespan);
  const hitTrackerRef = useRef<Map<Phaser.GameObjects.GameObject, number>>(new Map());
  const spriteRef = useRef<Phaser.Physics.Arcade.Sprite | null>(null);

  const texture = bulletType === BulletType.NORMAL ? 'bullet' : `bullet_${bulletType}`
  const play = `bulletFire_${bulletType}`

  const originX = props.originX ?? config.origin?.x
  const originY = props.originY ?? config.origin?.y

  const velocityX = levelData.flySpeed === 0 ? 0 : angleOffset * levelData.flySpeed * 0.25
  const velocityY = -levelData.flySpeed

  let rotation = -Math.PI / 2
  if (config.baseRotation) rotation += config.baseRotation
  rotation += angleOffset * 0.3

  // Calculate body ratios (hitbox size)
  let wRatio = levelData.bodyWidthRatio || config.bodyWidthRatio || 0.6
  let hRatio = levelData.bodyHeightRatio || config.bodyHeightRatio || 0.6
  let hitboxStats = levelData.hitboxStats || config.hitboxStats
  if (hitboxStats) {
    wRatio = hitboxStats.linear + (hitboxStats.fixed / levelData.scale)
    hRatio = wRatio
  }

  // Reset logic on "reuse" (when ID changes in the state array)
  const lastIdRef = useRef(id);
  if (lastIdRef.current !== id) {
    lifespanRef.current = initialLifespan;
    hitTrackerRef.current.clear();
    lastIdRef.current = id;
  }


  useUpdate((time, delta) => {
    const sprite = spriteRef.current;
    if (!sprite || !sprite.active) return;

    // Off-screen bounds check — deactivate bullets that leave the game world
    const margin = 100;
    const bounds = sprite.scene.physics.world.bounds;
    if (sprite.x < bounds.x - margin || sprite.x > bounds.right + margin ||
      sprite.y < bounds.y - margin || sprite.y > bounds.bottom + margin) {
      sprite.setActive(false).setVisible(false);
      if (sprite.body) (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
      return;
    }

    // Lifespan logic
    if (lifespanRef.current > 0) {
      lifespanRef.current -= delta;
      if (lifespanRef.current <= 0) {
        sprite.setActive(false).setVisible(false);
        if (sprite.body) (sprite.body as Phaser.Physics.Arcade.Body).setEnable(false);
      }
    }

    // Follow Owner logic
    if (config.followOwner && owner && owner.active) {
      sprite.setPosition(owner.x, owner.y - 20);
    }
  });

  // 3. Attach methods to the native sprite for collision system to use
  useEffect(() => {
    const sprite = spriteRef.current as any;
    if (!sprite) return;

    sprite.canHit = (target: Phaser.GameObjects.GameObject, time: number) => {
      const hitTracker = hitTrackerRef.current;
      const hitInterval = levelData.hitInterval || 0;
      if (!hitInterval || hitInterval <= 0) {
        if (hitTracker.has(target)) return false;
        hitTracker.set(target, time);
        return true;
      } else {
        const lastHit = hitTracker.get(target) || 0;
        if (time > lastHit + hitInterval) {
          hitTracker.set(target, time);
          return true;
        }
        return false;
      }
    };
    sprite.getDamage = () => levelData.damage;

    return () => {
      delete sprite.canHit;
      delete sprite.getDamage;
    };
  }, [bulletType, level]);

  // Delegate rendering to physics-sprite. 
  // We pass all derived props to ensure they are synchronized to the native object.
  return createNode('physics-sprite', {
    ...props,
    ref: spriteRef,
    texture,
    play,
    originX,
    originY,
    velocityX,
    velocityY,
    rotation,
    scale: levelData.scale,
    tint: bulletType === BulletType.NORMAL ? config.color : undefined,
    bodyWidthRatio: wRatio,
    bodyHeightRatio: hRatio,
    // Metadata for collision logic
    bulletType,
    damage: levelData.damage,
    pierce: levelData.pierce,
  });
}
