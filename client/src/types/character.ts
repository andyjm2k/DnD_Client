export type Ability = {
  score: number;
  modifier: number;
};

export const CHARACTER_RACES = [
  'Dragonborn',
  'Dwarf',
  'Elf',
  'Gnome',
  'Half-Elf',
  'Half-Orc',
  'Halfling',
  'Human',
  'Tiefling'
] as const;

export type CharacterRace = typeof CHARACTER_RACES[number];

export const CHARACTER_CLASSES = [
  'Barbarian',
  'Bard',
  'Cleric',
  'Druid',
  'Fighter',
  'Monk',
  'Paladin',
  'Ranger',
  'Rogue',
  'Sorcerer',
  'Warlock',
  'Wizard'
] as const;

export type CharacterClass = typeof CHARACTER_CLASSES[number];

export interface Character {
  id?: string;
  name: string;
  race: CharacterRace;
  class: CharacterClass;
  level: number;
  background: string;
  alignment: string;
  experience: number;
  abilities: {
    strength: Ability;
    dexterity: Ability;
    constitution: Ability;
    intelligence: Ability;
    wisdom: Ability;
    charisma: Ability;
  };
  hitPoints: {
    maximum: number;
    current: number;
  };
  armorClass: number;
  speed: number;
  proficiencyBonus: number;
  backstory: string;
} 