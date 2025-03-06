import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Character, 
  CharacterClass, 
  CharacterRace, 
  CHARACTER_RACES, 
  CHARACTER_CLASSES 
} from '../../types/character';
import { characterService } from '../../services/characterService';

const initialCharacter: Omit<Character, 'id'> = {
  name: '',
  race: 'Human',
  class: 'Fighter',
  level: 1,
  background: '',
  alignment: 'True Neutral',
  experience: 0,
  abilities: {
    strength: { score: 10, modifier: 0 },
    dexterity: { score: 10, modifier: 0 },
    constitution: { score: 10, modifier: 0 },
    intelligence: { score: 10, modifier: 0 },
    wisdom: { score: 10, modifier: 0 },
    charisma: { score: 10, modifier: 0 },
  },
  hitPoints: {
    maximum: 10,
    current: 10,
  },
  armorClass: 10,
  speed: 30,
  proficiencyBonus: 2,
  backstory: '',
};

const CharacterCreationForm: React.FC = () => {
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Omit<Character, 'id'>>(initialCharacter);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const calculateModifier = (score: number): number => {
    return Math.floor((score - 10) / 2);
  };

  const handleAbilityChange = (ability: keyof Character['abilities'], value: number) => {
    const modifier = calculateModifier(value);
    setCharacter(prev => ({
      ...prev,
      abilities: {
        ...prev.abilities,
        [ability]: { score: value, modifier },
      },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await characterService.createCharacter(character);
      navigate('/characters'); // Redirect to character list after creation
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create character');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Create Your Character</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Name</label>
            <input
              type="text"
              value={character.name}
              onChange={(e) => setCharacter(prev => ({ ...prev, name: e.target.value }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Race</label>
            <select
              value={character.race}
              onChange={(e) => setCharacter(prev => ({ ...prev, race: e.target.value as CharacterRace }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {CHARACTER_RACES.map((race) => (
                <option key={race} value={race}>{race}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Class</label>
            <select
              value={character.class}
              onChange={(e) => setCharacter(prev => ({ ...prev, class: e.target.value as CharacterClass }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            >
              {CHARACTER_CLASSES.map((charClass) => (
                <option key={charClass} value={charClass}>{charClass}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Level</label>
            <input
              type="number"
              min="1"
              max="20"
              value={character.level}
              onChange={(e) => setCharacter(prev => ({ ...prev, level: parseInt(e.target.value) }))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Ability Scores */}
        <div>
          <h2 className="text-xl font-semibold mb-4">Ability Scores</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Object.entries(character.abilities).map(([ability, { score }]) => (
              <div key={ability}>
                <label className="block text-sm font-medium text-gray-700 capitalize">{ability}</label>
                <input
                  type="number"
                  min="3"
                  max="20"
                  value={score}
                  onChange={(e) => handleAbilityChange(ability as keyof Character['abilities'], parseInt(e.target.value))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-500">
                  Modifier: {calculateModifier(score)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Backstory */}
        <div>
          <label className="block text-sm font-medium text-gray-700">Backstory</label>
          <textarea
            value={character.backstory}
            onChange={(e) => setCharacter(prev => ({ ...prev, backstory: e.target.value }))}
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
          />
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Character'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default CharacterCreationForm; 