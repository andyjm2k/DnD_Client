import axios from 'axios';
import { Character } from '../types/character';

const API_URL = '/api/characters';

interface ServerCharacterData {
  name: string;
  portrait?: string | null;
  race: string;
  class: string;
  background: string;
  alignment: string;
  attributes: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  hitPoints: number;
  armorClass: number;
  proficiencies: Array<{ type: string; name: string; }>;
  equipment: Array<{ item: string; quantity: number; }>;
  features: Array<{ name: string; description: string; source: string; }>;
  backstory: string;
}

const isLikelyBase64 = (value: string) => /^[A-Za-z0-9+/=]+$/.test(value);

const normalizePortrait = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return null;
  }

  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    /^https?:\/\//.test(trimmed) ||
    /^\/(?!\/)/.test(trimmed)
  ) {
    return trimmed;
  }

  if (isLikelyBase64(trimmed)) {
    return `data:image/png;base64,${trimmed}`;
  }

  return null;
};

// Transform server data to client Character format
const transformServerToClient = (serverData: any): Character => {
  return {
    id: serverData._id || serverData.id,
    name: serverData.name,
    portrait: normalizePortrait(serverData.portrait),
    race: serverData.race,
    class: serverData.class,
    level: serverData.level || 1,
    background: serverData.background || '',
    alignment: serverData.alignment || 'True Neutral',
    experience: serverData.experience || 0,
    abilities: {
      strength: { score: serverData.attributes?.strength || 10, modifier: Math.floor((serverData.attributes?.strength || 10 - 10) / 2) },
      dexterity: { score: serverData.attributes?.dexterity || 10, modifier: Math.floor((serverData.attributes?.dexterity || 10 - 10) / 2) },
      constitution: { score: serverData.attributes?.constitution || 10, modifier: Math.floor((serverData.attributes?.constitution || 10 - 10) / 2) },
      intelligence: { score: serverData.attributes?.intelligence || 10, modifier: Math.floor((serverData.attributes?.intelligence || 10 - 10) / 2) },
      wisdom: { score: serverData.attributes?.wisdom || 10, modifier: Math.floor((serverData.attributes?.wisdom || 10 - 10) / 2) },
      charisma: { score: serverData.attributes?.charisma || 10, modifier: Math.floor((serverData.attributes?.charisma || 10 - 10) / 2) },
    },
    hitPoints: {
      maximum: serverData.hitPoints || serverData.attributes?.hitPoints || 10,
      current: serverData.hitPoints || serverData.attributes?.hitPoints || 10,
    },
    armorClass: serverData.armorClass || serverData.attributes?.armorClass || 10,
    speed: serverData.speed || 30,
    proficiencyBonus: serverData.proficiencyBonus || 2,
    backstory: serverData.backstory || '',
  };
};

export const characterService = {
  async createCharacter(characterData: Omit<Character, 'id'>) {
    try {
      const serverData: ServerCharacterData = {
        name: characterData.name,
        portrait: characterData.portrait ?? null,
        race: characterData.race,
        class: characterData.class,
        background: characterData.background,
        alignment: characterData.alignment,
        attributes: {
          strength: characterData.abilities.strength.score,
          dexterity: characterData.abilities.dexterity.score,
          constitution: characterData.abilities.constitution.score,
          intelligence: characterData.abilities.intelligence.score,
          wisdom: characterData.abilities.wisdom.score,
          charisma: characterData.abilities.charisma.score,
        },
        hitPoints: characterData.hitPoints.maximum,
        armorClass: characterData.armorClass,
        proficiencies: [],
        equipment: [],
        features: [],
        backstory: characterData.backstory,
      };

      const response = await axios.post(API_URL, serverData);
      return transformServerToClient(response.data);
    } catch (error) {
      console.error('Error creating character:', error);
      throw error;
    }
  },

  async getCharacters() {
    try {
      const response = await axios.get(API_URL);
      return response.data.map(transformServerToClient);
    } catch (error) {
      console.error('Error fetching characters:', error);
      throw error;
    }
  },

  async getCharacter(id: string) {
    try {
      const response = await axios.get(`${API_URL}/${id}`);
      return transformServerToClient(response.data);
    } catch (error) {
      console.error('Error fetching character:', error);
      throw error;
    }
  },

  async updateCharacter(id: string, characterData: Partial<Character>) {
    try {
      const response = await axios.patch(`${API_URL}/${id}`, characterData);
      return transformServerToClient(response.data);
    } catch (error) {
      console.error('Error updating character:', error);
      throw error;
    }
  },

  async deleteCharacter(id: string) {
    try {
      const response = await axios.delete(`${API_URL}/${id}`);
      return response.data;
    } catch (error) {
      console.error('Error deleting character:', error);
      throw error;
    }
  }
}; 
