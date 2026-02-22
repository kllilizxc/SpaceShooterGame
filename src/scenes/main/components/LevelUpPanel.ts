import Phaser from "phaser"
import { usePlayerStore } from "../stores/player"
import { useGameStore } from "../stores/game"
import { createNode, useEffect, useStore, useState, VNode } from "@realiz3r/react-phaser"
import { getAvailablePowerups } from "../../../config/GameStats"

interface UpgradeCardProps {
    choice: any;
    index: number;
    themeColor: string;
    onSelect: (type: string) => void;
}

function UpgradeCard({ choice, index, themeColor, onSelect }: UpgradeCardProps): VNode {
    const [hovered, setHovered] = useState(false);
    const colorNum = Phaser.Display.Color.HexStringToColor(themeColor).color;

    return createNode('container', {
        x: 400 + (index - 1) * 220,
        y: 300,
        width: 200,
        height: 200,
        interactive: true,
        useHandCursor: true,
        onPointerOver: () => setHovered(true),
        onPointerOut: () => setHovered(false),
        onClick: () => onSelect(choice.type)
    },
        // Background
        createNode('rect', {
            x: -100, y: -100, width: 200, height: 200,
            fill: hovered ? 0x444444 : 0x222222,
            strokeWidth: hovered ? 4 : 2,
            lineColor: colorNum
        }),

        // Name
        createNode('text', {
            x: 0, y: -70, text: choice.name,
            fontSize: 16, color: themeColor, fontStyle: "bold",
            align: "center", wordWrapWidth: 180, originX: 0.5, originY: 0.5
        }),

        // Icon
        createNode('sprite', { x: 0, y: 0, texture: "upgrade_icons", frame: choice.iconFrame, scale: 0.25 }),

        // Description
        createNode('text', {
            x: 0, y: 60, text: choice.description,
            fontSize: 12, color: "#ffffff",
            align: "center", wordWrapWidth: 180, originX: 0.5, originY: 0.5
        })
    );
}

export function LevelUpPanel(): VNode | null {
    const phase = useStore(useGameStore, s => s.phase);
    const gameStore = useGameStore()
    const playerStore = usePlayerStore()
    const [choices, setChoices] = useState<any[]>([]);

    // Generate choices when entering the leveling phase (stable during the selection)
    useEffect(() => {
        if (phase !== "leveling") {
            setChoices(prev => (prev.length > 0 ? [] : prev))
            return
        }

        const available = getAvailablePowerups(playerStore.upgrades)
            .sort(() => Math.random() - 0.5)
            .slice(0, 3)
        setChoices(available)
    }, [phase]);

    if (phase !== 'leveling') return null;

    const handleSelect = (type: string) => {
        playerStore.applyUpgrade(type);
        gameStore.setPhase('playing');
    };

    const themeColor = '#00ffff';

    return createNode('container', {},
        // Overlay
        createNode('rect', { width: 800, height: 600, fill: 0x000000, alpha: 0.64, interactive: true }), // interactive absorbs clicks

        // Title
        createNode('text', { x: 400, y: 100, text: "LEVEL UP!", fontSize: 48, color: themeColor, fontStyle: "bold", originX: 0.5, originY: 0.5 }),

        // Cards
        ...choices.map((choice, i) => createNode(UpgradeCard, {
            key: choice.type,
            choice,
            index: i,
            themeColor,
            onSelect: handleSelect
        }))
    );
}
