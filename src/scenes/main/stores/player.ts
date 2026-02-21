import { defineGameStore } from "../../../lib/game-state";
import { BulletType } from "../components/Bullet";
import { GAME_CONFIG, getXPForLevel, getDefaultUpgrades, PlayerUpgrades, applyUpgrade } from "../../../config/GameStats";

export const usePlayerStore = defineGameStore("player", {
    state: () => ({
        health: GAME_CONFIG.player.maxHealth,
        maxHealth: GAME_CONFIG.player.maxHealth,
        score: 0,
        level: 1,
        xp: 0,
        upgrades: getDefaultUpgrades(),
        invulnerable: 0,
    }),

    getters: {
        isDead: (state) => state.health <= 0,
        healthPercent: (state) => state.health / state.maxHealth,
        xpRequired: (state) => getXPForLevel(state.level),
        xpPercent: (state) => state.xp / getXPForLevel(state.level),
    },

    actions: {
        takeDamage(amount: number) {
            if (this.invulnerable > 0) return;
            this.health = Math.max(0, this.health - amount);
            this.invulnerable = GAME_CONFIG.player.invulnerabilityDuration;
        },
        heal(amount: number) {
            this.health = Math.min(this.maxHealth, this.health + amount);
        },
        addScore(amount: number) {
            this.score += amount;
        },
        addXP(amount: number) {
            this.xp += amount;
            const required = getXPForLevel(this.level);
            if (this.xp >= required) {
                this.xp -= required;
                this.level++;
                // Signal level up needed (handled in scene)
                return true;
            }
            return false;
        },
        applyUpgrade(type: string) {
            this.upgrades = applyUpgrade(this.upgrades, type);
            // Re-calculate max health if needed
            this.maxHealth = GAME_CONFIG.player.maxHealth + this.upgrades.maxHealthBonus;
            if (type === 'max_health_up' || type === 'health_regen') {
                this.heal(type === 'health_regen' ? 25 : this.maxHealth);
            }
        },
        updateInvulnerability(delta: number) {
            if (this.invulnerable > 0) {
                this.invulnerable = Math.max(0, this.invulnerable - delta);
            }
        },
        reset() {
            this.$reset();
        }
    },
});
