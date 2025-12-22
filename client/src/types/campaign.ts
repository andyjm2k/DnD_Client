import { Character } from './character';

export interface Campaign {
  id: string;
  title: string;
  setting: string;
  tone: string;
  description: string;
  systemPrompt: string;
  status: 'active' | 'paused' | 'completed';
  currentLocation: string;
  locationDesc: string;
  currentQuest: string;
  questDesc: string;
  objectives: string;
  questLog?: string | null;
  objectiveLog?: string | null;
  lootLog?: string | null;
  playerId: string;
  characterId: string;
  character: Character;
  createdAt: string;
  updatedAt: string;
  npcs: NPC[];
  chatHistory: ChatMessage[];
  gameState?: GameState;
  aiDmSettings: AIDungeonMaster;
}

export interface QuestLogEntry {
  title: string;
  description?: string;
  identifiedAt: string;
}

export interface CampaignTextLogEntry {
  text: string;
  identifiedAt: string;
}

export interface NPC {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  role: string;
  location: string;
}

export interface ChatMessage {
  id: string;
  campaignId: string;
  speaker: 'player' | 'dm' | 'system';
  message: string;
  type: 'narrative' | 'dialog' | 'action' | 'combat' | 'system' | 'dice_roll' | 'dm_notes';
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface GameState {
  id: string;
  campaignId: string;
  currentScene: string;
  lastAction: string;
  combatActive: boolean;
  initiativeOrder: string; // JSON string of initiative order
}

export interface AIDungeonMaster {
  id: string;
  campaignId: string;
  model: string;
  temperature: number;
  personality: string;
  style: string;
  difficulty: 'easy' | 'medium' | 'hard';
  systemPrompt: string;
  contextWindow: number;
  rulesEnforcement: 'strict' | 'moderate' | 'flexible';
  createdAt: string;
  updatedAt: string;
} 
